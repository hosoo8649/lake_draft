import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config";
import type { Store } from "./store";

/*
 * 관리 화면·API 보호
 * - 이 PC의 브라우저(localhost)에서 열면 그대로 쓸 수 있어요.
 * - 터널·다른 기기처럼 바깥에서 들어오면 관리자 비밀번호로 로그인해야 해요.
 * - 상태를 바꾸는 요청은 X-AutoDM 헤더가 있어야 해요 (다른 웹사이트가 몰래 보내는 요청 차단).
 */

const COOKIE = "autodm_session";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const FORWARD_HEADERS = ["x-forwarded-for", "x-forwarded-host", "forwarded", "cf-connecting-ip", "x-real-ip", "true-client-ip"];

function hostnameOf(v: string | undefined): string | null {
  if (!v) return null;
  try {
    return new URL(v.includes("://") ? v : `http://${v}`).hostname;
  } catch {
    return null;
  }
}

/** 이 PC에서 직접 연 요청인지 */
export function isLocalRequest(req: Request): boolean {
  const ra = req.socket.remoteAddress ?? "";
  const loopback = ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
  if (!loopback) return false;
  if (FORWARD_HEADERS.some((h) => req.headers[h])) return false;
  const host = hostnameOf(req.headers.host);
  if (!host || !LOCAL_HOSTS.has(host)) return false;
  // 브라우저가 보낸 출처가 바깥 주소면 터널을 거친 요청이에요
  for (const h of [req.headers.origin, req.headers.referer]) {
    const o = hostnameOf(typeof h === "string" ? h : undefined);
    if (o && !LOCAL_HOSTS.has(o)) return false;
  }
  return true;
}

function ensureSecrets(store: Store): { password: string; secret: string; fromEnv: boolean } {
  const db = store.db;
  if (!db.auth) {
    db.auth = {
      password: crypto.randomBytes(9).toString("base64url"),
      secret: crypto.randomBytes(32).toString("hex"),
    };
    store.changed();
  }
  return { password: config.adminPassword || db.auth.password, secret: db.auth.secret, fromEnv: !!config.adminPassword };
}

function sessionValue(secret: string): string {
  return crypto.createHmac("sha256", secret).update("autodm-admin-v1").digest("hex");
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function createAuth(store: Store) {
  const attempts = new Map<string, { n: number; until: number }>();

  const isAuthed = (req: Request): boolean => {
    if (isLocalRequest(req)) return true;
    const { secret } = ensureSecrets(store);
    const c = readCookie(req, COOKIE);
    return !!c && safeEqual(c, sessionValue(secret));
  };

  /** /api 보호: 로그인 확인 + 상태를 바꾸는 요청은 전용 헤더 필요 */
  const guardApi = (req: Request, res: Response, next: NextFunction) => {
    const open = req.path === "/login" || req.path === "/session";
    if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-autodm"] !== "1") {
      res.status(403).json({ error: "허용되지 않은 요청이에요", details: ["허용되지 않은 요청이에요"] });
      return;
    }
    if (open || isAuthed(req)) return next();
    res.status(401).json({ error: "로그인이 필요해요", details: ["로그인이 필요해요"] });
  };

  const guardPage = (req: Request, res: Response, next: NextFunction) => {
    if (isAuthed(req)) return next();
    res.status(401).send("로그인이 필요해요. 오토DM 화면에서 관리자 비밀번호로 로그인한 뒤 다시 시도해 주세요.");
  };

  const login = (req: Request, res: Response) => {
    const ip = String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "");
    const now = Date.now();
    const a = attempts.get(ip);
    if (a && a.until > now && a.n >= 5) {
      res.status(429).json({ error: "잠시 뒤 다시 시도해 주세요", details: ["비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 시도해 주세요"] });
      return;
    }
    const { password, secret } = ensureSecrets(store);
    const given = String((req.body as { password?: string })?.password ?? "");
    if (!safeEqual(given, password)) {
      attempts.set(ip, { n: (a && a.until > now ? a.n : 0) + 1, until: now + 60_000 });
      res.status(401).json({ error: "비밀번호가 맞지 않아요", details: ["비밀번호가 맞지 않아요"] });
      return;
    }
    attempts.delete(ip);
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${sessionValue(secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${secure ? "; Secure" : ""}`,
    );
    res.json({ ok: true });
  };

  const session = (req: Request, res: Response) => {
    res.json({ authenticated: isAuthed(req), local: isLocalRequest(req) });
  };

  /** 비밀번호 보기·바꾸기 (로그인한 사람만) */
  const passwordInfo = () => {
    const { password, fromEnv } = ensureSecrets(store);
    return { password: fromEnv ? null : password, fromEnv };
  };
  const rotate = () => {
    // 비밀번호와 로그인 세션을 모두 새로 만들어요
    store.db.auth = { password: crypto.randomBytes(9).toString("base64url"), secret: crypto.randomBytes(32).toString("hex") };
    store.changed();
    return passwordInfo();
  };

  return { guardApi, guardPage, login, session, passwordInfo, rotate, ensureSecrets: () => ensureSecrets(store) };
}
