import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { DEMO_PROFILE, DemoGateway, seedDemo } from "../server/instagram/demo";
import { composeAlert, mailError, type MailCreds, type MailMessage } from "../server/notify";
import { Store } from "../server/store";
import { defaultDM, defaultExtras, emptyButton, textMessage } from "../shared/factory";
import { HOUR, MINUTE } from "../shared/limits";

/* 메일 알림 (Gmail) — 실제로 보내지 않고 보낸 내용만 모아요 */

let clock = new Date("2026-11-24T10:00:00+09:00").getTime();
const now = () => clock;
const PASS = "abcdefghijklmnop";

function setup(opts: { fail?: Error & { code?: string } } = {}) {
  const sent: { creds: MailCreds; msg: MailMessage }[] = [];
  const store = new Store(null);
  const ctx = createApp(store, {
    now,
    sendMail: async (creds, msg) => {
      if (opts.fail) throw opts.fail;
      sent.push({ creds, msg });
    },
  });
  store.db.account = { connected: true, mode: "live", ...DEMO_PROFILE, connectedAt: clock };
  seedDemo(store);
  return { store, sent, ...ctx };
}

async function serve(app: ReturnType<typeof createApp>["app"]) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "X-AutoDM": "1", "content-type": "application/json" },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) as any };
  };
  return { server, call };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const ENV = ["GMAIL_USER", "GMAIL_APP_PASSWORD", "ALERT_EMAIL_TO"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  clock = new Date("2026-11-24T10:00:00+09:00").getTime();
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ENV) if (saved[k] === undefined) delete process.env[k];
  else process.env[k] = saved[k];
});

describe("메일 알림 설정", () => {
  it("앱 비밀번호는 저장만 하고 어떤 응답에도 내보내지 않는다", async () => {
    const { store, app } = setup();
    const { server, call } = await serve(app);
    try {
      // 계정 없이 켜기는 안 돼요
      expect((await call("/settings", { method: "PATCH", body: { alerts: { email: true } } })).status).toBe(400);
      expect((await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "me@gmail.com", gmailAppPassword: "short" } } })).status).toBe(400);
      expect((await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "not-an-email", gmailAppPassword: PASS } } })).status).toBe(400);

      const r = await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "Me@Gmail.com", gmailAppPassword: "abcd efgh ijkl mnop", email: true } } });
      expect(r.status).toBe(200);
      expect(store.db.settings.alerts).toMatchObject({ gmailUser: "me@gmail.com", gmailAppPassword: PASS, email: true });
      expect(r.text).not.toContain(PASS);
      expect(r.json.alerts).toMatchObject({ hasPassword: true, gmailUser: "me@gmail.com" });

      const st = await call("/state");
      expect(st.text).not.toContain(PASS);
      expect(st.json.settings.alerts.hasPassword).toBe(true);
      for (const p of ["/risk/reset"]) expect((await call(p, { body: {} })).text).not.toContain(PASS);
    } finally {
      server.close();
    }
  });

  it("다른 Gmail로 바꾸면 예전 앱 비밀번호는 버리고, 주소를 지우면 알림도 꺼진다", async () => {
    const { store, app } = setup();
    const { server, call } = await serve(app);
    try {
      await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "a@gmail.com", gmailAppPassword: PASS, email: true } } });
      await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "b@gmail.com" } } });
      expect(store.db.settings.alerts.gmailAppPassword).toBeUndefined();
      expect(store.db.settings.alerts.email).toBe(false);
      await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "b@gmail.com", gmailAppPassword: PASS, email: true } } });
      await call("/settings", { method: "PATCH", body: { alerts: { gmailUser: "" } } });
      expect(store.db.settings.alerts).toMatchObject({ gmailUser: "", email: false });
      expect(store.db.settings.alerts.gmailAppPassword).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("테스트 메일을 받는 주소로 보내고, 실패하면 이유를 알려 준다", async () => {
    const ok = setup();
    ok.store.db.settings.alerts = { email: true, gmailUser: "me@gmail.com", gmailAppPassword: PASS, to: "manager@example.com" };
    const a = await serve(ok.app);
    try {
      const r = await a.call("/alerts/test", { body: {} });
      expect(r.status).toBe(200);
      expect(r.json.to).toBe("manager@example.com");
      expect(ok.sent).toHaveLength(1);
      expect(ok.sent[0].creds).toMatchObject({ user: "me@gmail.com", pass: PASS, to: "manager@example.com" });
      expect(ok.sent[0].msg.subject).toContain("테스트");
      expect(ok.store.db.settings.alerts.lastSentAt).toBe(clock);
    } finally {
      a.server.close();
    }

    const bad = setup({ fail: Object.assign(new Error("Invalid login"), { code: "EAUTH" }) });
    bad.store.db.settings.alerts = { email: true, gmailUser: "me@gmail.com", gmailAppPassword: PASS, to: "" };
    const b = await serve(bad.app);
    try {
      const r = await b.call("/alerts/test", { body: {} });
      expect(r.status).toBe(502);
      expect(r.json.error).toContain("앱 비밀번호");
      expect(bad.store.db.settings.alerts.lastError).toContain("앱 비밀번호");
    } finally {
      b.server.close();
    }
  });

  it(".env의 Gmail 설정이 화면 설정보다 우선이고, 화면에는 비밀번호 없이 보인다", async () => {
    process.env.GMAIL_USER = "env@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "zzzz yyyy xxxx wwww";
    const { store, app, sent } = setup();
    store.db.settings.alerts.email = true;
    const { server, call } = await serve(app);
    try {
      const st = await call("/state");
      expect(st.json.settings.alerts).toMatchObject({ fromEnv: true, hasPassword: true, gmailUser: "env@gmail.com" });
      expect(st.text).not.toContain("zzzzyyyyxxxxwwww");
      await call("/alerts/test", { body: {} });
      expect(sent[0].creds).toMatchObject({ user: "env@gmail.com", pass: "zzzzyyyyxxxxwwww", to: "env@gmail.com" });
    } finally {
      server.close();
    }
  });
});

describe("알림 메일 보내는 때", () => {
  function on(s: ReturnType<typeof setup>) {
    s.store.db.settings.alerts = { email: true, gmailUser: "me@gmail.com", gmailAppPassword: PASS, to: "" };
  }

  it("제한 신호 1·2번째와 3번째(답글 자동 멈춤)에 메일을 보낸다", async () => {
    const s = setup();
    on(s);
    s.engine.registerRisk("인스타그램 발송 한도에 걸렸어요");
    await flush();
    clock += 11 * MINUTE;
    s.engine.registerRisk("인스타그램 발송 한도에 걸렸어요");
    await flush();
    clock += 11 * MINUTE;
    s.engine.registerRisk("인스타그램 발송 한도에 걸렸어요");
    await flush();
    expect(s.sent.map((x) => x.msg.subject)).toEqual([
      "[캐롤DM] 인스타그램 제한 신호 1번 · 답글을 천천히 달고 있어요",
      "[캐롤DM] 인스타그램 제한 신호 2번 · 답글을 천천히 달고 있어요",
      "[캐롤DM] 제한 신호 3번 · 댓글 답글을 자동으로 멈췄어요",
    ]);
    const last = s.sent[2].msg;
    expect(last.text).toContain(`@${DEMO_PROFILE.username}`);
    expect(last.text).toContain("DM은 계속 보내고 있어요");
    expect(last.html).toContain("기록 지우기");
  });

  it("10분 안에 겹친 신호는 메일도 한 번, 3번째 뒤로는 3시간에 한 번만 보낸다", async () => {
    const s = setup();
    on(s);
    s.engine.registerRisk("a");
    s.engine.registerRisk("a");
    await flush();
    expect(s.sent).toHaveLength(1);
    for (let i = 0; i < 2; i++) {
      clock += 11 * MINUTE;
      s.engine.registerRisk("b");
    }
    await flush();
    expect(s.sent).toHaveLength(3);
    clock += 11 * MINUTE;
    s.engine.registerRisk("c"); // 4번째 → 계속돼요 메일
    clock += 11 * MINUTE;
    s.engine.registerRisk("c"); // 5번째 → 3시간 안이라 생략
    await flush();
    expect(s.sent).toHaveLength(4);
    expect(s.sent[3].msg.subject).toContain("계속되고 있어요");
    clock += 3 * HOUR;
    s.engine.registerRisk("d");
    await flush();
    expect(s.sent).toHaveLength(5);
  });

  it("인스타그램 연결이 끊기면 한 번만 알린다", async () => {
    const s = setup();
    on(s);
    vi.spyOn(DemoGateway.prototype, "sendPrivateReply").mockResolvedValue({
      ok: false,
      error: "인스타그램 연결이 만료됐어요",
      retryable: false,
      authError: true,
    });
    const dm = defaultDM();
    dm.main = textMessage("링크예요", [emptyButton("보기", "https://example.com")]);
    s.services.createAutomation({ postId: "post_1", nextPost: false, trigger: { type: "all", keywords: [] }, dm, extras: defaultExtras(), sendMode: "immediate" });
    for (const f of s.store.db.demo.fans.slice(0, 3))
      await s.engine.handleComment({ id: `c_${f.id}`, postId: "post_1", userId: f.id, username: f.username, text: "hi", createdAt: clock });
    await s.engine.tick();
    await flush();
    expect(s.store.db.account?.needsReauth).toBe(true);
    expect(s.sent.map((x) => x.msg.subject)).toEqual(["[캐롤DM] 인스타그램 연결이 끊겼어요 · DM이 나가지 않아요"]);
  });

  it("메일 알림을 꺼 두면 보내지 않고, 보내다 실패해도 발송은 멈추지 않는다", async () => {
    const off = setup();
    off.store.db.settings.alerts = { email: false, gmailUser: "me@gmail.com", gmailAppPassword: PASS, to: "" };
    off.engine.registerRisk("x");
    await flush();
    expect(off.sent).toHaveLength(0);

    const failing = setup({ fail: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) });
    on(failing);
    failing.engine.registerRisk("x");
    await flush();
    expect(failing.engine.riskLevel()).toBe(1);
    expect(failing.store.db.settings.alerts.lastError).toContain("연결하지 못했어요");
  });

  it("데모 계정이면 제목에 [캐롤DM 체험]을 붙이고, 공개 주소가 있으면 설정 링크를 넣는다", () => {
    const m = composeAlert(
      { type: "risk", level: 1, reason: "체험", autoPaused: false },
      { username: "my_studio", demo: true, at: clock, settingsUrl: "https://x.trycloudflare.com/settings#safety" },
    );
    expect(m.subject.startsWith("[캐롤DM 체험]")).toBe(true);
    expect(m.text).toContain("https://x.trycloudflare.com/settings#safety");
    const r = composeAlert({ type: "reauth" }, { username: "my_studio", demo: false, at: clock, settingsUrl: "https://x.trycloudflare.com/settings#safety" });
    expect(r.text).toContain("https://x.trycloudflare.com/connect");
    // 받는 사람이 보낸 내용은 HTML로 해석되지 않아요
    const x = composeAlert({ type: "risk", level: 1, reason: "<script>alert(1)</script>", autoPaused: false }, { username: "a", demo: false, at: clock, settingsUrl: "" });
    expect(x.html).not.toContain("<script>");
    expect(mailError({ code: "EAUTH" })).toContain("앱 비밀번호");
  });
});
