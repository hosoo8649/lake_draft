import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { DEMO_PROFILE, DemoGateway, seedDemo } from "../server/instagram/demo";
import { Store } from "../server/store";
import { defaultDM, defaultExtras, emptyButton, textMessage } from "../shared/factory";
import { DAY, HOUR, MINUTE } from "../shared/limits";
import type { AutomationInput } from "../server/services";

/* 2차 검수에서 찾은 문제들의 회귀 테스트 */

let clock = 0;
const now = () => clock;

function setup() {
  const store = new Store(null);
  const ctx = createApp(store, { now });
  store.db.account = { connected: true, mode: "demo", ...DEMO_PROFILE, connectedAt: clock };
  seedDemo(store);
  return { store, ...ctx };
}

function input(over: Partial<AutomationInput> = {}): AutomationInput {
  const dm = defaultDM();
  dm.main = textMessage("링크 보내드려요", [emptyButton("보러 가기", "https://example.com/p")]);
  return {
    postId: "post_1",
    nextPost: false,
    trigger: { type: "keyword", keywords: ["링크"] },
    dm,
    extras: defaultExtras(),
    sendMode: "immediate",
    ...over,
  };
}

function gated(): AutomationInput {
  const dm = defaultDM();
  dm.followGate.enabled = true;
  dm.main = textMessage("자료 여기 있어요", [emptyButton("자료 받기", "https://example.com/file")]);
  return input({ dm });
}

let n = 0;
const comment = (postId: string, fanId: string, text: string, at = clock) => ({
  id: `r_${++n}`,
  postId,
  userId: fanId,
  username: fanId,
  text,
  createdAt: at,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("검수 회귀 테스트", () => {
  beforeEach(() => {
    clock = new Date("2026-11-23T10:00:00+09:00").getTime();
  });
  afterEach(() => vi.restoreAllMocks());

  it("팔로우 확인 버튼을 여러 번 눌러도 본 DM은 한 번만, 같은 이벤트는 한 번만 처리", async () => {
    const { store, services, engine } = setup();
    const a = services.createAutomation(gated());
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    const payload = store.db.demo.inbox.find((m) => m.fanId === "fan_2")!.buttons![0].payload!;
    expect((await engine.handlePostback("fan_2", "fan_2", payload, "mid_1")).follower).toBe(true);
    expect((await engine.handlePostback("fan_2", "fan_2", payload, "mid_1")).skipped).toBe("duplicate");
    expect((await engine.handlePostback("fan_2", "fan_2", payload, "mid_2")).skipped).toBe("already-sent");
    const mains = store.db.deliveries.filter((d) => d.automationId === a.id && d.userId === "fan_2" && d.kind === "main");
    expect(mains).toHaveLength(1);
  });

  it("비팔로워가 버튼을 연달아 누르면 잠깐은 다시 보내지 않는다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(gated());
    await engine.handleComment(comment("post_1", "fan_1", "링크")); // fan_1: 비팔로워
    await engine.tick();
    const payload = store.db.demo.inbox.find((m) => m.fanId === "fan_1")!.buttons![0].payload!;
    expect((await engine.handlePostback("fan_1", "fan_1", payload)).follower).toBe(false);
    expect((await engine.handlePostback("fan_1", "fan_1", payload)).skipped).toBe("cooldown");
    clock += MINUTE;
    expect((await engine.handlePostback("fan_1", "fan_1", payload)).follower).toBe(false);
  });

  it("팔로우 여부를 확인하지 못하면 비팔로워로 넘겨짚지 않고 잠시 뒤 다시 확인한다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(gated());
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    const payload = store.db.demo.inbox.find((m) => m.fanId === "fan_2")!.buttons![0].payload!;
    const spy = vi.spyOn(DemoGateway.prototype, "isFollower").mockResolvedValue(null);
    expect((await engine.handlePostback("fan_2", "fan_2", payload)).skipped).toBe("checking");
    expect((await engine.handlePostback("fan_2", "fan_2", payload)).skipped).toBe("checking");
    expect(store.db.pendingChecks).toHaveLength(1);
    // 인스타그램이 다시 응답하면 본 DM을 보내요
    spy.mockResolvedValue(true);
    clock += 2 * MINUTE;
    await engine.tick();
    await engine.tick();
    expect(store.db.pendingChecks).toHaveLength(0);
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2").at(-1)?.text).toBe("자료 여기 있어요");
  });

  it("팔로우 확인이 계속 실패하면 실패 기록을 남기고 그만 확인한다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(gated());
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    const payload = store.db.demo.inbox.find((m) => m.fanId === "fan_2")!.buttons![0].payload!;
    vi.spyOn(DemoGateway.prototype, "isFollower").mockResolvedValue(null);
    await engine.handlePostback("fan_2", "fan_2", payload);
    for (let i = 0; i < 6; i++) {
      clock += 10 * MINUTE;
      await engine.tick();
    }
    expect(store.db.pendingChecks).toHaveLength(0);
    const failed = store.db.deliveries.filter((d) => d.userId === "fan_2" && d.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/팔로우 여부를 확인하지 못했어요/);
  });

  it("띄어쓰기만 다른 키워드는 같은 키워드로 본다", async () => {
    const { services, engine } = setup();
    services.createAutomation(input({ trigger: { type: "keyword", keywords: ["링크 주세요"] } }));
    expect((await engine.handleComment(comment("post_1", "fan_2", "링크주세요!"))).automationId).toBeTruthy();
    expect(() =>
      services.createAutomation(input({ trigger: { type: "keyword", keywords: ["링크주세요"] }, sendMode: "immediate" })),
    ).toThrow(/이미 이 게시물에 걸린 키워드/);
    expect(() => services.createAutomation(input({ postId: "post_2", trigger: { type: "keyword", keywords: ["   "] } }))).toThrow(
      /빈 키워드/,
    );
  });

  it("다음 게시물 자동화는 새 게시물에 키워드가 겹치는 자동화가 있으면 연결하지 않는다", async () => {
    const { store, services, engine } = setup();
    const next = services.createAutomation(input({ postId: null, nextPost: true }));
    clock += MINUTE;
    store.db.posts.unshift({ id: "post_new", caption: "새 글", mediaType: "REELS", timestamp: clock, commentsCount: 0 });
    services.createAutomation(input({ postId: "post_new" }));
    await engine.handleComment(comment("post_new", "fan_2", "링크"));
    expect(next.postId).toBeNull();
  });

  it("일괄 발송: 이미 DM을 받은 사람은 건너뛰고 대상 수에 넣지 않는다", async () => {
    const { store, services, engine } = setup();
    store.db.comments = [];
    // fan_2는 이미 즉시 발송으로 받았어요
    const first = services.createAutomation(input({ postId: "post_2", trigger: { type: "keyword", keywords: ["공구"] } }));
    expect((await engine.handleComment(comment("post_2", "fan_2", "공구요"))).automationId).toBe(first.id);
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2")).toHaveLength(1);
    services.deleteAutomation(first.id);
    store.db.comments.push(comment("post_2", "fan_4", "공구 참여", clock - HOUR));
    const a = services.createAutomation(
      input({ postId: "post_2", trigger: { type: "keyword", keywords: ["공구"] }, sendMode: "batch" }),
    );
    await flush();
    expect(a.batch?.total).toBe(1);
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2")).toHaveLength(1);
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_4")).toHaveLength(1);
  });

  it("서버가 일괄 발송 도중 꺼졌다 켜지면 이어서 보낸다", async () => {
    const { store, services, engine } = setup();
    store.db.comments = [comment("post_2", "fan_4", "공구 참여", clock - HOUR)];
    const hang = vi.spyOn(DemoGateway.prototype, "fetchComments").mockReturnValue(new Promise(() => {}));
    const a = services.createAutomation(
      input({ postId: "post_2", trigger: { type: "keyword", keywords: ["공구"] }, sendMode: "batch" }),
    );
    // 댓글을 다 가져오기 전에 꺼진 상황 (가져오기가 끝나지 않음)
    await flush();
    expect(a.batch?.fetching).toBe(true);
    expect(store.db.queue).toHaveLength(0);
    hang.mockRestore();
    await engine.resumeBatches();
    expect(a.batch?.fetching).toBeFalsy();
    expect(a.batch?.total).toBe(1);
    await engine.tick();
    expect(store.db.demo.inbox.map((m) => m.fanId)).toEqual(["fan_4"]);
  });

  it("DM 보내기를 멈춘 동안에는 일괄 발송을 만들 수 없다", () => {
    const { store, services } = setup();
    store.db.settings.dmPaused = true;
    expect(() => services.createAutomation(input({ postId: "post_2", sendMode: "batch" }))).toThrow(/멈춘|일시 중지/);
  });

  it("모아 둔 댓글이 있으면 예약 시각은 가장 이른 댓글 + 7일 안", async () => {
    const { services, engine } = setup();
    const at = new Date("2026-11-24T10:00:00+09:00").getTime();
    const s = services.createAutomation(input({ sendMode: "scheduled", schedule: { at, continueAfter: true } }));
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    clock += 2 * DAY; // 이틀 뒤 예약을 미루려고 하면
    const tooLate = new Date("2026-11-30T12:00:00+09:00").getTime(); // 첫 댓글 + 7일 넘음
    expect(() => services.updateAutomation(s.id, { schedule: { at: tooLate, continueAfter: true } })).toThrow(/7일이 지나면/);
    const ok = new Date("2026-11-29T10:00:00+09:00").getTime();
    services.updateAutomation(s.id, { schedule: { at: ok, continueAfter: true } });
    expect(s.schedule?.at).toBe(ok);
  });

  it("DM 코드는 영문·숫자 4자리이고 소문자·공백으로 보내도 받는다", async () => {
    const { store, services, engine } = setup();
    const extras = defaultExtras();
    extras.codeReply = true;
    const a = services.createAutomation(input({ extras }));
    expect(a.code).toMatch(/^[A-Z0-9]{4}$/);
    await engine.handleMessage("fan_5", "fan_5", { text: ` ${a.code.toLowerCase()} ` });
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_5")).toHaveLength(1);
  });
});

describe("관리 화면 보호", () => {
  async function serve() {
    const store = new Store(null);
    const { app, auth } = createApp(store);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { store, server, base, password: auth.ensureSecrets().password };
  }

  it("이 PC에서는 그대로, 바깥(터널)에서는 로그인해야 쓸 수 있다", async () => {
    const { server, base, password } = await serve();
    try {
      expect((await fetch(`${base}/api/state`)).status).toBe(200);
      const remote = { "x-forwarded-for": "203.0.113.9", "x-forwarded-proto": "https" };
      expect((await fetch(`${base}/api/state`, { headers: remote })).status).toBe(401);
      expect((await fetch(`${base}/api/state`, { headers: { origin: "https://evil.example" } })).status).toBe(401);
      // 상태를 바꾸는 요청은 전용 헤더가 있어야 해요 (다른 사이트가 몰래 보내는 요청 차단)
      const noHeader = await fetch(`${base}/api/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rateLimitPerHour: 10 }),
      });
      expect(noHeader.status).toBe(403);
      // 로그인
      const login = (pw: string) =>
        fetch(`${base}/api/login`, {
          method: "POST",
          headers: { ...remote, "content-type": "application/json", "x-autodm": "1" },
          body: JSON.stringify({ password: pw }),
        });
      expect((await login("wrong")).status).toBe(401);
      const ok = await login(password);
      expect(ok.status).toBe(200);
      const cookie = ok.headers.get("set-cookie")!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Secure/);
      const session = cookie.split(";")[0];
      expect((await fetch(`${base}/api/state`, { headers: { ...remote, cookie: session } })).status).toBe(200);
      // 비밀번호는 로그인한 사람만 볼 수 있어요
      expect((await fetch(`${base}/api/admin-password`, { headers: remote })).status).toBe(401);
      // 비밀번호를 새로 만들면 기존 로그인은 풀려요
      const rotated = await fetch(`${base}/api/admin-password/rotate`, {
        method: "POST",
        headers: { ...remote, cookie: session, "content-type": "application/json", "x-autodm": "1" },
        body: "{}",
      });
      expect(rotated.status).toBe(200);
      expect((await fetch(`${base}/api/state`, { headers: { ...remote, cookie: session } })).status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("비밀번호를 계속 틀리면 잠시 막는다", async () => {
    const { server, base } = await serve();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await fetch(`${base}/api/login`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-autodm": "1", "x-forwarded-for": "198.51.100.7" },
          body: JSON.stringify({ password: `x${i}` }),
        });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    } finally {
      server.close();
    }
  });
});

describe("댓글 답글 (4차 검수)", () => {
  beforeEach(() => {
    clock = new Date("2026-11-23T10:00:00+09:00").getTime();
  });
  afterEach(() => vi.restoreAllMocks());

  function withReply(over: Partial<AutomationInput["extras"]["commentReply"]> = {}, base = input()) {
    const extras = defaultExtras();
    extras.commentReply = { ...extras.commentReply, enabled: true, ...over };
    return { ...base, extras };
  }
  it("DM이 실패하면 'DM 보냈어요' 답글을 달지 않는다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(withReply());
    vi.spyOn(DemoGateway.prototype, "sendPrivateReply").mockResolvedValue({ ok: false, error: "수신자가 메시지를 받을 수 없는 상태예요", retryable: false });
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    for (let i = 0; i < 3; i++) {
      clock += 30_000;
      await engine.tick();
    }
    expect(store.db.demo.replies).toHaveLength(0);
    expect(store.db.deliveries.filter((d) => d.kind === "reply")).toHaveLength(0);
  });

  it("DM이 재시도 중이면 답글도 기다렸다가, DM이 나간 뒤에 단다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(withReply());
    const spy = vi.spyOn(DemoGateway.prototype, "sendPrivateReply").mockResolvedValue({ ok: false, error: "일시 오류", retryable: true });
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(0);
    spy.mockRestore();
    clock += 5 * MINUTE;
    await engine.tick(); // DM 재시도 성공
    await engine.tick(); // 그다음 답글
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2")).toHaveLength(1);
    expect(store.db.demo.replies).toHaveLength(1);
  });

  it("DM이 발송 한도로 밀려 있으면 답글도 먼저 달지 않는다", async () => {
    const { store, services, engine } = setup();
    store.db.settings.rateLimitPerHour = 1;
    services.createAutomation(withReply({}, input({ trigger: { type: "all", keywords: [] } })));
    for (const f of ["fan_2", "fan_3", "fan_4"]) await engine.handleComment(comment("post_1", f, "hi"));
    for (let i = 0; i < 5; i++) {
      clock += 30_000;
      await engine.tick();
    }
    expect(store.db.demo.inbox).toHaveLength(1);
    expect(store.db.demo.replies).toHaveLength(1);
  });

  it("답글을 끄거나 설정에서 멈추면 밀려 있던 답글도 달지 않는다 (다시 켜도 옛 답글은 안 달림)", async () => {
    const { store, services, engine } = setup();
    const a = services.createAutomation(withReply());
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.handleComment(comment("post_1", "fan_3", "링크"));
    await engine.tick(); // DM 2건, 답글 2건 대기
    services.updateAutomation(a.id, { extras: { ...a.extras, commentReply: { ...a.extras.commentReply, enabled: false } } });
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(0);
    expect(store.db.queue.filter((q) => q.kind === "reply")).toHaveLength(0);

    // 설정에서 멈춤 → 다시 켜도 그동안 밀린 답글은 달지 않아요
    services.updateAutomation(a.id, { extras: { ...a.extras, commentReply: { ...a.extras.commentReply, enabled: true } } });
    await engine.handleComment(comment("post_1", "fan_4", "링크"));
    await engine.tick();
    store.db.settings.replyPaused = true;
    await engine.tick();
    store.db.settings.replyPaused = false;
    clock += 3 * DAY;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(0);
  });

  it("답글은 간격을 두고 하나씩 단다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(withReply({}, input({ trigger: { type: "all", keywords: [] } })));
    for (const f of ["fan_2", "fan_3", "fan_4", "fan_5"]) await engine.handleComment(comment("post_1", f, "hi"));
    await engine.tick();
    await engine.tick();
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(4);
    expect(store.db.demo.replies).toHaveLength(1);
    clock += 20_000;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(2);
  });

  it("팔로우 확인 자동화는 확인 DM이 나간 뒤 답글을 단다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(withReply({}, gated()));
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    await engine.tick();
    expect(store.db.demo.inbox[0].buttons?.[0].type).toBe("postback");
    expect(store.db.demo.replies).toHaveLength(1);
  });

  it("같은 게시물의 다른 자동화와도 같은 답글이 연달아 달리지 않는다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(withReply({ tone: "friendly" }));
    services.createAutomation(withReply({ tone: "friendly" }, input({ trigger: { type: "keyword", keywords: ["가격"] } })));
    vi.spyOn(Math, "random").mockReturnValue(0); // 늘 첫 번째 답글을 고르려 해도
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.handleComment(comment("post_1", "fan_3", "가격"));
    for (let i = 0; i < 4; i++) {
      clock += 20_000;
      await engine.tick();
    }
    const texts = store.db.demo.replies.map((r) => r.text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).not.toBe(texts[1]);
  });

  it("내 답글에 같은 문구를 여러 번 넣을 수 없다 (답글 모음도)", () => {
    const { services } = setup();
    expect(() => services.createAutomation(withReply({ tone: "custom", custom: ["DM 보냈어요", "DM 보냈어요", " DM  보냈어요 "] }))).toThrow(
      /같은 답글이 두 번/,
    );
    expect(() => services.upsertReplySet({ name: "a", replies: ["x", "x", "y"] })).toThrow(/같은 답글이 두 번/);
    expect(() => services.createAutomation(withReply({ tone: "custom", custom: ["a", "b", "가".repeat(301)] }))).toThrow(/300자/);
  });

  it("추가 기능 값이 빠지거나 이상해도 서버가 500 없이 정리한다", () => {
    const { services } = setup();
    const a = services.createAutomation({ ...input(), extras: undefined as never });
    expect(a.extras.commentReply.enabled).toBe(false);
    const b = services.createAutomation({
      ...input({ postId: "post_2" }),
      extras: { commentReply: { enabled: true, tone: "weird", count: 0 } } as never,
    });
    expect(b.extras.commentReply.tone).toBe(defaultExtras().commentReply.tone);
    expect(b.extras.commentReply.count).toBe(defaultExtras().commentReply.count);
  });

  it("팔로우 확인 버튼을 동시에 두 번 눌러도 본 DM은 한 번만", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(gated());
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    const payload = store.db.demo.inbox.find((m) => m.fanId === "fan_2")!.buttons![0].payload!;
    vi.spyOn(DemoGateway.prototype, "isFollower").mockImplementation(() => new Promise((r) => setTimeout(() => r(true), 20)));
    await Promise.all([
      engine.handlePostback("fan_2", "fan_2", payload, "m1"),
      engine.handlePostback("fan_2", "fan_2", payload, "m2"),
    ]);
    await engine.tick();
    expect(store.db.deliveries.filter((d) => d.kind === "main" && d.userId === "fan_2" && d.status === "sent")).toHaveLength(1);
  });

  it("상태는 DM 기준: 답글만 실패하면 '정상'으로 두고 답글 실패는 따로 알려 준다", async () => {
    const { store, services, engine } = setup();
    const a = services.createAutomation(withReply());
    vi.spyOn(DemoGateway.prototype, "replyToComment").mockResolvedValue({ ok: false, error: "댓글이 삭제됐거나 찾을 수 없어요", retryable: false });
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    await engine.tick();
    const { automationHealth } = await import("../server/views");
    const h = automationHealth(store, a, clock);
    expect(h.state).toBe("ok");
    expect(h.reasons[0]).toMatch(/댓글 답글 1건을 달지 못했어요/);
  });
});
