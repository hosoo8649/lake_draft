import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { uid } from "../shared/factory";
import { DAY, HOUR, LIMITS } from "../shared/limits";
import type { Post, Settings } from "../shared/types";
import { isPublicHttpsUrl } from "../shared/validation";
import { IG_SCOPES, config, liveConfigured } from "./config";
import { Engine } from "./engine/engine";
import { DEMO_PROFILE, DemoGateway, randomSampleComment, seedDemo } from "./instagram/demo";
import type { Gateway } from "./instagram/gateway";
import { LiveGateway, authorizeUrl, exchangeCode, refreshToken, subscribeWebhooks } from "./instagram/live";
import { dispatchWebhook, verifySignature, type WebhookPayload } from "./instagram/webhook";
import { createAuth } from "./auth";
import { fetchPublic } from "./safeFetch";
import { HttpError, Services } from "./services";
import { emptyDB, type Store } from "./store";
import { homeSummary, publicAccount, toView } from "./views";

export function createApp(store: Store, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  const db = () => store.db;

  const demoGw = new DemoGateway(store);
  const liveGw = new LiveGateway(
    () => db().account?.accessToken,
    () => db().account?.igUserId,
  );
  const gateway = (): Gateway => (db().account?.mode === "live" ? liveGw : demoGw);
  const publicBase = () => (db().settings.publicBaseUrl || config.publicBaseUrl).replace(/\/$/, "");

  /** 계정을 바꾸거나 해지해도 남기는 것: 템플릿·내 링크·답글 모음·설정 */
  const keepLibrary = () => ({
    templates: db().templates,
    links: db().links,
    replySets: db().replySets,
    settings: db().settings,
  });

  const engine = new Engine(store, gateway, {
    now,
    trackingBase: () => {
      if (db().account?.mode !== "live") return { base: "", track: true };
      const base = publicBase();
      return { base, track: !!base };
    },
    assetBase: () => (db().account?.mode === "live" ? publicBase() : ""),
  });
  const services = new Services(store, engine, gateway, now);

  const app = express();
  app.disable("x-powered-by");
  const auth = createAuth(store);

  /* ───────────── 웹훅 (원본 바디로 서명 확인) ───────────── */

  app.get("/webhooks/instagram", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token && token === config.webhookVerifyToken) {
      res.status(200).send(String(challenge ?? ""));
      return;
    }
    res.sendStatus(403);
  });

  app.post("/webhooks/instagram", express.raw({ type: "*/*", limit: "2mb" }), async (req, res) => {
    const raw = req.body as Buffer;
    if (!verifySignature(raw, req.header("x-hub-signature-256"), config.igAppSecret)) {
      res.sendStatus(401);
      return;
    }
    res.sendStatus(200); // 인스타그램에는 바로 응답하고 처리는 이어서
    try {
      const payload = JSON.parse(raw.toString("utf8")) as WebhookPayload;
      await dispatchWebhook(payload, engine, async (id) => {
        const known = db().comments.find((c) => c.userId === id)?.username;
        return known ?? "";
      });
      void engine.tick();
    } catch (e) {
      console.error("[webhook]", e);
    }
  });

  /* ───────────── 클릭 추적 리다이렉트 ───────────── */

  app.get("/r/:deliveryId/:buttonId", (req, res) => {
    const url = engine.recordClick(req.params.deliveryId, req.params.buttonId);
    if (!url) {
      res.status(404).send("링크를 찾을 수 없어요");
      return;
    }
    res.redirect(302, url);
  });

  /* ───────────── 올린 이미지 ───────────── */

  const uploadDir = path.join(path.dirname(config.dataFile), "uploads");
  app.use("/uploads", express.static(uploadDir, { maxAge: "7d", fallthrough: false }));

  /* ───────────── Instagram 로그인 (OAuth) ───────────── */

  const redirectUri = () => `${publicBase()}/auth/instagram/callback`;
  /** Instagram 로그인을 시작한 화면 주소로 돌아가요 (localhost에서 시작했다면 localhost로) */
  const webUrl = (path: string) => `${config.webBaseUrl || db().oauthReturn || ""}${path}`;
  const startOrigin = (req: Request): string => {
    const ref = typeof req.headers.referer === "string" ? req.headers.referer : "";
    try {
      const u = new URL(ref);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (local || (publicBase() && u.origin === new URL(publicBase()).origin)) return u.origin;
    } catch {
      /* 주소를 알 수 없으면 상대 경로로 */
    }
    return "";
  };

  app.get("/auth/instagram/start", auth.guardPage, (req, res) => {
    if (!liveConfigured()) {
      res.redirect(webUrl("/connect?error=not_configured"));
      return;
    }
    if (!publicBase()) {
      res.redirect(webUrl("/connect?error=no_public_url"));
      return;
    }
    const state = crypto.randomBytes(16).toString("hex");
    db().oauthState = state;
    db().oauthReturn = startOrigin(req);
    store.changed();
    res.redirect(authorizeUrl(redirectUri(), state, IG_SCOPES, req.query.force === "1"));
  });

  app.get("/auth/instagram/callback", async (req, res) => {
    const { code, state, error_reason } = req.query as Record<string, string | undefined>;
    if (error_reason || !code) {
      res.redirect(webUrl(`/connect?error=${encodeURIComponent(error_reason ?? "denied")}`));
      return;
    }
    if (!state || state !== db().oauthState) {
      res.redirect(webUrl("/connect?error=state"));
      return;
    }
    try {
      const { token, expiresIn } = await exchangeCode(code.replace(/#_$/, ""), redirectUri());
      const prev = db().account;
      const tmpGw = new LiveGateway(() => token, () => undefined);
      const profile = await tmpGw.fetchProfile();
      // 데모에서 넘어오거나 다른 계정으로 연동하면 이전 자동화·기록은 비워요 (같은 계정 재연동은 유지)
      if (!prev || prev.mode !== "live" || prev.igUserId !== profile.igUserId) {
        store.reset({ ...emptyDB(), ...keepLibrary() });
      }
      db().account = {
        connected: true,
        mode: "live",
        accessToken: token,
        tokenExpiresAt: now() + expiresIn * 1000,
        ...profile,
        connectedAt: now(),
        needsReauth: false,
      };
      await subscribeWebhooks(token, profile.igUserId).catch((e) => console.warn("[webhook subscribe]", e));
      db().posts = await liveGw.fetchPosts().catch(() => [] as Post[]);
      db().oauthState = undefined;
      store.changed();
      res.redirect(webUrl("/connect/confirm"));
    } catch (e) {
      console.error("[oauth]", e);
      res.redirect(webUrl(`/connect?error=${encodeURIComponent((e as Error).message)}`));
    }
  });

  /* ───────────── REST API ───────────── */

  const api = express.Router();
  api.use(auth.guardApi);
  api.use(express.json({ limit: "1mb" }));

  /* 로그인 (바깥에서 접속할 때) */
  api.get("/session", auth.session);
  api.post("/login", auth.login);
  api.get("/admin-password", (_req, res) => res.json(auth.passwordInfo()));
  api.post("/admin-password/rotate", (_req, res) => res.json(auth.rotate()));

  api.get("/state", (_req, res) => {
    res.json({
      account: publicAccount(db().account),
      settings: db().settings,
      liveAvailable: liveConfigured(),
      publicBaseUrl: publicBase(),
      webhookUrl: publicBase() ? `${publicBase()}/webhooks/instagram` : "",
      redirectUri: publicBase() ? redirectUri() : "",
    });
  });

  // 실시간 갱신 (Server-Sent Events)
  api.get("/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 2000\n\n");
    let t: NodeJS.Timeout | null = null;
    const off = store.subscribe(() => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        res.write(`data: ${now()}\n\n`);
      }, 200);
    });
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      off();
      clearInterval(ping);
      if (t) clearTimeout(t);
    });
  });

  /* 계정 */
  api.post("/account/demo", (_req, res) => {
    store.reset({ ...emptyDB(), ...keepLibrary() });
    db().account = { connected: true, mode: "demo", ...DEMO_PROFILE, connectedAt: now() };
    seedDemo(store);
    res.json(publicAccount(db().account));
  });

  /** 연동 해지 — 자동화와 기록이 모두 삭제돼요 */
  api.delete("/account", (_req, res) => {
    store.reset({ ...emptyDB(), ...keepLibrary() });
    res.json({ ok: true });
  });

  /* 게시물 */
  api.get("/posts", async (req, res) => {
    if (req.query.refresh === "1" && db().account?.mode === "live") {
      const fresh = await liveGw.fetchPosts();
      const restricted = new Set(db().posts.filter((p) => p.restricted).map((p) => p.id));
      db().posts = fresh.map((p) => ({ ...p, restricted: restricted.has(p.id) || undefined }));
      store.changed();
    }
    const counts = new Map<string, number>();
    for (const a of db().automations) if (a.postId) counts.set(a.postId, (counts.get(a.postId) ?? 0) + 1);
    res.json(
      [...db().posts]
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((p) => ({ ...p, automationCount: counts.get(p.id) ?? 0, usedKeywords: services.keywordsOnPost(p.id) })),
    );
  });

  api.get("/posts/:id/comments", (req, res) => {
    res.json(
      db()
        .comments.filter((c) => c.postId === req.params.id)
        .sort((a, b) => b.createdAt - a.createdAt),
    );
  });

  /* 홈 */
  api.get("/home", (_req, res) => {
    res.json({
      summary: homeSummary(store, now()),
      automations: db().automations.map((a) => toView(store, a)),
      templateCount: db().templates.length,
    });
  });

  /* 자동화 */
  api.get("/automations/:id", (req, res) => {
    const a = services.getAutomation(req.params.id);
    const recent = db()
      .deliveries.filter((d) => d.automationId === a.id)
      .sort((x, y) => y.createdAt - x.createdAt)
      .slice(0, 50);
    res.json({ automation: toView(store, a), recent });
  });

  api.post("/automations", (req, res) => {
    const a = services.createAutomation(req.body);
    void engine.tick();
    res.status(201).json(toView(store, a));
  });

  api.patch("/automations/:id", (req, res) => {
    res.json(toView(store, services.updateAutomation(req.params.id, req.body)));
  });

  api.post("/automations/:id/stop-batch", (req, res) => {
    services.stopBatch(String(req.params.id));
    res.json(toView(store, services.getAutomation(String(req.params.id))));
  });

  api.delete("/automations/:id", (req, res) => {
    services.deleteAutomation(req.params.id);
    res.json({ ok: true });
  });

  api.get("/keywords-on-post", (req, res) => {
    const postId = typeof req.query.postId === "string" && req.query.postId ? req.query.postId : null;
    res.json(services.keywordsOnPost(postId, typeof req.query.exclude === "string" ? req.query.exclude : undefined));
  });

  /* 템플릿 */
  api.get("/templates", (_req, res) => res.json(services.listTemplates()));
  api.get("/templates/suggestion", (_req, res) => res.json(services.templateSuggestion()));
  api.post("/templates", (req, res) => res.status(201).json(services.createTemplate(req.body)));
  api.put("/templates/:id", (req, res) => res.json(services.updateTemplate(req.params.id, req.body)));
  api.delete("/templates/:id", (req, res) => {
    services.deleteTemplate(req.params.id);
    res.json({ ok: true });
  });

  /* DM 코드 미리 받기 (등록 전에 팬 안내 문구에 보여 줘요) */
  api.get("/codes/new", (_req, res) => res.json({ code: services.newCode() }));

  /* 답글 모음 */
  api.get("/reply-sets", (_req, res) => res.json(db().replySets));
  api.post("/reply-sets", (req, res) => res.status(201).json(services.upsertReplySet(req.body)));
  api.put("/reply-sets/:id", (req, res) => res.json(services.upsertReplySet({ ...req.body, id: req.params.id })));
  api.delete("/reply-sets/:id", (req, res) => {
    services.deleteReplySet(req.params.id);
    res.json({ ok: true });
  });

  /* 캐러셀 이미지 올리기 */
  const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  api.post("/uploads", express.raw({ type: Object.keys(EXT), limit: LIMITS.uploadBytes }), (req, res) => {
    const ext = EXT[String(req.headers["content-type"] ?? "").split(";")[0]];
    const body = req.body as Buffer;
    if (!ext || !Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "JPG·PNG·WEBP·GIF 이미지만 올릴 수 있어요");
    fs.mkdirSync(uploadDir, { recursive: true });
    const name = `${uid("img")}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, name), body);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  /* 내 링크 */
  api.get("/links", (_req, res) => res.json(db().links));
  api.post("/links", (req, res) => res.status(201).json(services.upsertLink(req.body)));
  api.put("/links/:id", (req, res) => res.json(services.upsertLink({ ...req.body, id: req.params.id })));
  api.delete("/links/:id", (req, res) => {
    services.deleteLink(req.params.id);
    res.json({ ok: true });
  });

  /* 링크 → 제목 미리 채우기 (캐러셀 "링크로 카드 채우기") */
  api.get("/link-preview", async (req, res) => {
    const url = String(req.query.url ?? "");
    try {
      const html = await fetchPublic(url);
      const meta = (p: string) =>
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, "i"))?.[1];
      res.json({
        title: meta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "",
        description: meta("og:description") ?? meta("description") ?? "",
        image: meta("og:image") ?? "",
      });
    } catch {
      res.json({ title: "", description: "", image: "" });
    }
  });

  /* 추첨 */
  api.get("/draws", (_req, res) => res.json(db().draws));
  /** 추첨 전에 조건에 맞는 참여자 수 (뽑을 인원 상한) */
  api.get("/draws/candidates", async (req, res) => {
    const postId = String(req.query.postId ?? "");
    const keywords = String(req.query.keywords ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const trigger = keywords.length ? { type: "keyword" as const, keywords } : { type: "all" as const, keywords: [] };
    res.json({ count: postId ? (await services.drawCandidates(postId, trigger)).length : 0 });
  });

  api.post("/draws", async (req, res) => res.status(201).json(await services.draw(req.body)));
  api.post("/draws/:id/redraw", async (req, res) => {
    const d = db().draws.find((x) => x.id === req.params.id);
    if (!d) throw new HttpError(404, "추첨 기록을 찾을 수 없어요");
    res.json(await services.draw({ postId: d.postId, trigger: req.body.trigger ?? d.trigger, winnerCount: req.body.winnerCount ?? d.winnerCount, redrawId: d.id }));
  });

  /* 설정 */
  api.patch("/settings", (req, res) => {
    const s = db().settings;
    const body = req.body as Partial<Settings>;
    if (typeof body.dmPaused === "boolean") s.dmPaused = body.dmPaused;
    if (typeof body.replyPaused === "boolean") s.replyPaused = body.replyPaused;
    if (body.rateLimitPerHour !== undefined) {
      const n = Number(body.rateLimitPerHour);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new HttpError(400, "시간당 최대 DM 수는 1부터 1000 사이의 정수로 넣어 주세요");
      s.rateLimitPerHour = n;
    }
    if (typeof body.publicBaseUrl === "string") {
      const v = body.publicBaseUrl.trim().replace(/\/$/, "");
      if (v && !isPublicHttpsUrl(v)) throw new HttpError(400, "공개 주소는 https:// 로 시작하는 주소로 넣어 주세요 (예: https://xxxx.trycloudflare.com)");
      s.publicBaseUrl = v;
    }
    store.changed();
    res.json(s);
  });

  /* ───────────── 데모 시뮬레이터 ───────────── */

  const demoOnly = (_req: Request, _res: Response, next: NextFunction) => {
    if (db().account?.mode !== "demo") throw new HttpError(400, "데모 모드에서만 쓸 수 있어요");
    next();
  };
  const fanOf = (id: string) => {
    const f = db().demo.fans.find((x) => x.id === id);
    if (!f) throw new HttpError(404, "팬을 찾을 수 없어요");
    return f;
  };

  api.get("/demo", demoOnly, (_req, res) => {
    res.json({ ...db().demo, inbox: db().demo.inbox.slice(-300), replies: db().demo.replies.slice(-100) });
  });

  /** 시뮬레이터: 댓글 하나가 실제로 어떻게 됐는지 (보냄·실패·예약 대기·한도 대기) */
  const commentOutcome = (commentId: string) => {
    const d = db()
      .deliveries.filter((x) => x.commentId === commentId && x.kind !== "reply")
      .at(-1);
    if (!d) return {};
    const q = db().queue.find((x) => x.deliveryId === d.id);
    if (d.status === "sent") return { outcome: "sent" as const, kind: d.kind };
    if (d.status === "failed") return { outcome: "failed" as const, error: d.error };
    if (q && q.notBefore > now()) return { outcome: d.status === "retrying" ? ("retrying" as const) : ("held" as const), at: q.notBefore, error: d.error };
    return { outcome: "queued" as const };
  };

  api.post("/demo/comment", demoOnly, async (req, res) => {
    const fan = fanOf(req.body.fanId);
    const commentId = uid("c");
    const r = await engine.handleComment({
      id: commentId,
      postId: req.body.postId,
      userId: req.body.asOwner ? db().account!.igUserId! : fan.id,
      username: req.body.asOwner ? db().account!.username! : fan.username,
      text: String(req.body.text ?? ""),
      createdAt: now(),
    });
    await engine.tick();
    res.json({ ...r, ...(r.automationId && !r.skipped ? commentOutcome(commentId) : {}) });
  });

  api.post("/demo/comments/bulk", demoOnly, async (req, res) => {
    const count = Math.max(1, Math.min(200, Number(req.body.count ?? 20)));
    const fans = db().demo.fans;
    for (let i = 0; i < count; i++) {
      const fan = fans[Math.floor(Math.random() * fans.length)];
      await engine.handleComment({
        id: uid("c"),
        postId: req.body.postId,
        userId: fan.id,
        username: fan.username,
        text: req.body.text || randomSampleComment(),
        createdAt: now(),
      });
    }
    await engine.tick();
    res.json({ ok: true });
  });

  api.post("/demo/postback", demoOnly, async (req, res) => {
    const fan = fanOf(req.body.fanId);
    // 인스타그램처럼 팬이 누른 버튼 이름이 팬의 메시지로 보여요
    db().demo.inbox.push({ id: uid("dm"), fanId: fan.id, from: "fan", createdAt: now(), text: String(req.body.title ?? "") });
    res.json(await engine.handlePostback(fan.id, fan.username, String(req.body.payload ?? "")));
  });

  api.post("/demo/message", demoOnly, async (req, res) => {
    const fan = fanOf(req.body.fanId);
    db().demo.inbox.push({
      id: uid("dm"),
      fanId: fan.id,
      from: "fan",
      createdAt: now(),
      text: req.body.text,
      sharedPostId: req.body.sharedPostId,
    });
    store.changed();
    const r = await engine.handleMessage(fan.id, fan.username, { text: req.body.text, sharedPostId: req.body.sharedPostId });
    await engine.tick();
    res.json(r);
  });

  api.post("/demo/read", demoOnly, (req, res) => {
    const fan = fanOf(req.body.fanId);
    for (const m of db().demo.inbox) if (m.fanId === fan.id && m.from === "business" && !m.readAt) m.readAt = now();
    engine.handleRead(fan.id, now());
    store.changed();
    res.json({ ok: true });
  });

  api.post("/demo/click", demoOnly, (req, res) => {
    const m = String(req.body.url ?? "").match(/\/r\/([^/]+)\/([^/?#]+)/);
    const url = m ? engine.recordClick(decodeURIComponent(m[1]), decodeURIComponent(m[2])) : null;
    res.json({ url });
  });

  api.patch("/demo/fans/:id", demoOnly, (req, res) => {
    const fan = fanOf(String(req.params.id));
    if (typeof req.body.following === "boolean") fan.following = req.body.following;
    if (typeof req.body.restricted === "boolean") fan.restricted = req.body.restricted;
    store.changed();
    res.json(fan);
  });

  /** 새 게시물 올리기 (다음 게시물 자동화 체험) */
  api.post("/demo/posts", demoOnly, (req, res) => {
    const emojis = ["🌿", "🍰", "📸", "🎧", "👟", "🕯️", "🍋"];
    const p: Post = {
      id: uid("post"),
      caption: String(req.body.caption || "새 게시물이에요 ✨"),
      mediaType: "REELS",
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      permalink: `https://instagram.com/p/${uid()}`,
      timestamp: now(),
      commentsCount: 0,
      restricted: !!req.body.restricted,
    };
    db().posts.unshift(p);
    store.changed();
    res.status(201).json(p);
  });

  api.patch("/demo/posts/:id", demoOnly, (req, res) => {
    const p = db().posts.find((x) => x.id === String(req.params.id));
    if (!p) throw new HttpError(404, "게시물을 찾을 수 없어요");
    if (typeof req.body.restricted === "boolean") p.restricted = req.body.restricted;
    store.changed();
    res.json(p);
  });

  /** 시간 여행: 예약 발송을 바로 확인하고 싶을 때 */
  api.post("/demo/fire-schedules", demoOnly, async (_req, res) => {
    for (const a of db().automations) {
      if (a.sendMode === "scheduled" && a.schedule && !a.schedule.firedAt) {
        a.schedule.at = now();
        engine.reschedule(a);
      }
    }
    await engine.tick();
    res.json({ ok: true });
  });

  app.use("/api", api);

  // 오류 응답
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if ((err as { type?: string })?.type === "entity.too.large") {
      res.status(413).json({ error: "파일이 너무 커요 (최대 8MB)", details: ["파일이 너무 커요 (최대 8MB)"] });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details ?? [err.message] });
      return;
    }
    const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const msg = status === 404 ? "찾을 수 없어요" : "잘못된 요청이에요";
      res.status(status).json({ error: msg, details: [msg] });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "서버 오류가 발생했어요", details: [String((err as Error)?.message ?? err)] });
  });

  /* ───────────── 주기 작업 ───────────── */

  async function refreshTokenIfNeeded() {
    const acc = db().account;
    if (acc?.mode !== "live" || !acc.accessToken || !acc.tokenExpiresAt) return;
    if (acc.tokenExpiresAt - now() > 7 * DAY) return;
    const r = await refreshToken(acc.accessToken).catch(() => null);
    if (r) {
      acc.accessToken = r.token;
      acc.tokenExpiresAt = now() + r.expiresIn * 1000;
    } else if (acc.tokenExpiresAt < now()) {
      acc.needsReauth = true;
    }
    store.changed();
  }

  function start() {
    void engine.resumeBatches().catch((e) => console.error("[batch resume]", e));
    const t1 = setInterval(() => void engine.tick().catch((e) => console.error("[tick]", e)), 1000);
    const t2 = setInterval(() => void refreshTokenIfNeeded(), 6 * HOUR);
    void refreshTokenIfNeeded();
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }

  return { app, engine, services, start, auth };
}
