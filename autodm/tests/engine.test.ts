import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { DEMO_PROFILE, seedDemo } from "../server/instagram/demo";
import { Store } from "../server/store";
import { defaultDM, defaultExtras, emptyButton, textMessage } from "../shared/factory";
import { DAY, HOUR, MINUTE } from "../shared/limits";
import type { AutomationInput } from "../server/services";

let clock = new Date("2026-11-23T10:00:00+09:00").getTime();
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

let n = 0;
const comment = (postId: string, fanId: string, text: string, at = clock) => ({
  id: `t_${++n}`,
  postId,
  userId: fanId,
  username: fanId,
  text,
  createdAt: at,
});

describe("자동 DM 엔진", () => {
  beforeEach(() => {
    clock = new Date("2026-11-23T10:00:00+09:00").getTime();
  });

  it("키워드가 문장 안에 있어도 DM을 보내고 버튼 링크는 클릭 추적 링크로 바뀐다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(input());
    await engine.handleComment(comment("post_1", "fan_2", "저도 링크 주세요!!"));
    await engine.tick();
    const inbox = store.db.demo.inbox.filter((m) => m.fanId === "fan_2");
    expect(inbox).toHaveLength(1);
    expect(inbox[0].text).toBe("링크 보내드려요");
    expect(inbox[0].buttons?.[0].url).toMatch(/^\/r\/dl_/);
    // 클릭
    const url = engine.recordClick(inbox[0].deliveryId!, store.db.automations[0].dm.main.buttons[0].id);
    expect(url).toBe("https://example.com/p");
    expect(store.db.clicks).toHaveLength(1);
  });

  it("키워드가 없는 댓글과 본인 댓글에는 보내지 않는다", async () => {
    const { store, services, engine } = setup();
    services.createAutomation(input());
    expect((await engine.handleComment(comment("post_1", "fan_2", "예뻐요"))).skipped).toBe("no-match");
    const own = { ...comment("post_1", DEMO_PROFILE.igUserId, "링크"), username: DEMO_PROFILE.username };
    expect((await engine.handleComment(own)).skipped).toBe("own-comment");
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(0);
  });

  it("같은 게시물에 키워드 자동화와 모든 댓글 자동화가 있으면 키워드가 우선", async () => {
    const { services, engine } = setup();
    const kw = services.createAutomation(input());
    const all = services.createAutomation(input({ trigger: { type: "all", keywords: [] } }));
    expect((await engine.handleComment(comment("post_1", "fan_2", "링크요"))).automationId).toBe(kw.id);
    expect((await engine.handleComment(comment("post_1", "fan_3", "안녕하세요"))).automationId).toBe(all.id);
  });

  it("게시물 규칙: 모든 댓글은 하나, 키워드 중복 불가, 발송 방식은 하나", () => {
    const { services } = setup();
    services.createAutomation(input({ trigger: { type: "all", keywords: [] } }));
    expect(() => services.createAutomation(input({ trigger: { type: "all", keywords: [] } }))).toThrow(/하나만/);
    services.createAutomation(input({ trigger: { type: "keyword", keywords: ["링크"] } }));
    expect(() => services.createAutomation(input({ trigger: { type: "keyword", keywords: ["가격", " 링크 "] } }))).toThrow(
      /이미 이 게시물에 걸린 키워드/,
    );
    const at = clock + 2 * HOUR;
    expect(() =>
      services.createAutomation(
        input({ trigger: { type: "keyword", keywords: ["공구"] }, sendMode: "scheduled", schedule: { at, continueAfter: true } }),
      ),
    ).toThrow(/발송 방식은 게시물마다 하나/);
  });

  it("링크 없는 버튼, 640자 초과, 버튼 4개는 등록할 수 없다", () => {
    const { services } = setup();
    const dm = defaultDM();
    dm.main = textMessage("a", [emptyButton("빈 버튼", "")]);
    expect(() => services.createAutomation(input({ dm }))).toThrow(/버튼 링크를 설정해 주세요/);
    dm.main = textMessage("가".repeat(641));
    expect(() => services.createAutomation(input({ dm }))).toThrow(/640자/);
    dm.main = textMessage("ok", [1, 2, 3, 4].map((i) => emptyButton(`b${i}`, "https://a.com")));
    expect(() => services.createAutomation(input({ dm }))).toThrow(/3개까지/);
  });

  it("팔로우 확인: 확인 DM → 버튼 → 팔로워는 본 DM, 비팔로워는 다시 확인 버튼이 붙은 DM", async () => {
    const { store, services, engine } = setup();
    const dm = defaultDM();
    dm.followGate.enabled = true;
    dm.main = textMessage("자료 여기 있어요", [emptyButton("자료 받기", "https://example.com/file")]);
    services.createAutomation(input({ dm }));
    // fan_1: 비팔로워 (seed 규칙: 3명 중 1명), fan_2: 팔로워
    await engine.handleComment(comment("post_1", "fan_1", "링크"));
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    const gate = store.db.demo.inbox.find((m) => m.fanId === "fan_2")!;
    expect(gate.buttons?.[0].type).toBe("postback");
    const payload = gate.buttons![0].payload!;

    expect((await engine.handlePostback("fan_2", "fan_2", payload)).follower).toBe(true);
    expect((await engine.handlePostback("fan_1", "fan_1", payload)).follower).toBe(false);
    const f2 = store.db.demo.inbox.filter((m) => m.fanId === "fan_2");
    expect(f2.at(-1)?.text).toBe("자료 여기 있어요");
    const f1 = store.db.demo.inbox.filter((m) => m.fanId === "fan_1");
    expect(f1.at(-1)?.buttons?.at(-1)?.type).toBe("postback");
    // 팔로우 확인 버튼은 클릭 수에 들어가지 않아요
    expect(store.db.clicks).toHaveLength(0);
    // 전송 수 = 확인 DM 2 + 본 DM 1 + 비팔로워 DM 1
    expect(store.db.deliveries.filter((d) => d.status === "sent")).toHaveLength(4);
  });

  it("예약 발송: 예약 시각까지 모았다가 보내고, '보낸 뒤 새 댓글'이 꺼져 있으면 이후 댓글은 보내지 않는다", async () => {
    const { store, services, engine } = setup();
    const at = new Date("2026-11-23T12:00:00+09:00").getTime();
    services.createAutomation(input({ sendMode: "scheduled", schedule: { at, continueAfter: false } }));
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(0);
    clock = at + MINUTE;
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(1);
    expect((await engine.handleComment(comment("post_1", "fan_3", "링크"))).skipped).toBe("no-match");
  });

  it("예약 시각은 30분 단위, 7일 이내", () => {
    const { services } = setup();
    expect(() =>
      services.createAutomation(input({ sendMode: "scheduled", schedule: { at: clock + HOUR + 10 * MINUTE, continueAfter: true } })),
    ).toThrow(/30분 단위/);
    expect(() =>
      services.createAutomation(input({ sendMode: "scheduled", schedule: { at: clock + 8 * DAY, continueAfter: true } })),
    ).toThrow(/7일/);
  });

  it("예약·일괄 발송은 댓글 답글을 켤 수 없다", () => {
    const { services } = setup();
    const extras = defaultExtras();
    extras.commentReply.enabled = true;
    expect(() => services.createAutomation(input({ extras, sendMode: "batch" }))).toThrow(/댓글 답글/);
  });

  it("일괄 발송: 최근 7일 댓글 중 DM을 받지 않은 댓글에만 보내고, 끝나면 즉시 발송으로 바뀐다", async () => {
    const { store, services, engine } = setup();
    store.db.comments = [
      comment("post_2", "fan_2", "공구 언제요", clock - 2 * DAY),
      comment("post_2", "fan_3", "공구 알림!", clock - 8 * DAY), // 7일 지남
      comment("post_2", "fan_4", "예뻐요", clock - HOUR), // 키워드 없음
      comment("post_2", "fan_5", "공구 참여", clock - HOUR),
      comment("post_2", "fan_5", "공구 또 참여", clock - 30 * MINUTE), // 같은 사람은 한 번만
    ];
    const a = services.createAutomation(
      input({ postId: "post_2", trigger: { type: "keyword", keywords: ["공구"] }, sendMode: "batch" }),
    );
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(a.batch?.total).toBe(2);
    expect(() => services.deleteAutomation(a.id)).toThrow(/보내는 동안/);
    await engine.tick();
    await engine.tick();
    expect(store.db.demo.inbox.map((m) => m.fanId).sort()).toEqual(["fan_2", "fan_5"]);
    expect(a.sendMode).toBe("immediate");
    expect(a.origin).toBe("batch");
  });

  it("시간당 한도를 넘으면 순차 발송 대기열에 남는다", async () => {
    const { store, services, engine } = setup();
    store.db.settings.rateLimitPerHour = 3;
    services.createAutomation(input({ trigger: { type: "all", keywords: [] } }));
    for (let i = 2; i <= 6; i++) await engine.handleComment(comment("post_1", `fan_${i}`, "hi"));
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(3);
    expect(engine.queuedCount()).toBe(2);
    clock += HOUR + MINUTE;
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(5);
  });

  it("DM 코드와 게시물 공유에도 같은 DM을 보낸다", async () => {
    const { store, services, engine } = setup();
    const extras = defaultExtras();
    extras.codeReply = true;
    extras.shareReply = true;
    const a = services.createAutomation(input({ extras }));
    expect(a.code).toMatch(/^[A-Z0-9]{4}$/);
    await engine.handleMessage("fan_2", "fan_2", { text: ` ${a.code.toLowerCase()} ` });
    await engine.handleMessage("fan_3", "fan_3", { sharedPostId: "post_1" });
    await engine.handleMessage("fan_4", "fan_4", { text: "ZZZZ" });
    await engine.tick();
    expect(store.db.demo.inbox.map((m) => m.fanId).sort()).toEqual(["fan_2", "fan_3"]);
    // 코드를 끄면 그 코드는 다시 못 쓰고, 다시 켜면 새 코드
    const old = a.code;
    services.updateAutomation(a.id, { extras: { ...a.extras, codeReply: false } });
    services.updateAutomation(a.id, { extras: { ...a.extras, codeReply: true } });
    expect(a.code).not.toBe(old);
  });

  it("다음 게시물 자동화는 만든 뒤 올라온 게시물에 첫 댓글이 달리면 연결된다", async () => {
    const { store, services, engine } = setup();
    const a = services.createAutomation(input({ postId: null, nextPost: true }));
    expect(a.postId).toBeNull();
    // 예전 게시물 댓글로는 연결되지 않아요
    await engine.handleComment(comment("post_3", "fan_2", "링크"));
    expect(a.postId).toBeNull();
    clock += MINUTE * 5;
    store.db.posts.unshift({ id: "post_new", caption: "새 글", mediaType: "REELS", timestamp: clock, commentsCount: 0 });
    clock += MINUTE;
    await engine.handleComment(comment("post_new", "fan_2", "링크 주세요"));
    expect(a.postId).toBe("post_new");
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(1);
  });

  it("설정에서 일시 중지하면 보내지 않고, 스위치도 바꿀 수 없다", async () => {
    const { store, services, engine } = setup();
    const a = services.createAutomation(input());
    store.db.settings.dmPaused = true;
    expect((await engine.handleComment(comment("post_1", "fan_2", "링크"))).skipped).toBe("paused");
    expect(() => services.updateAutomation(a.id, { enabled: false })).toThrow(/일시 중지/);
  });

  it("같은 사람에게는 한 번만 보내고, 읽음은 사람 기준, 답글은 프리셋에서 단다", async () => {
    const { store, services, engine } = setup();
    const extras = defaultExtras();
    extras.commentReply.enabled = true;
    services.createAutomation(input({ extras }));
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    expect((await engine.handleComment(comment("post_1", "fan_2", "링크 하나 더"))).skipped).toBe("already-sent");
    await engine.handleComment(comment("post_1", "fan_3", "링크!"));
    await engine.tick(); // DM 2건
    await engine.tick(); // 답글은 DM이 나간 뒤, 간격을 두고 하나씩
    expect(store.db.demo.replies).toHaveLength(1);
    // 기본 간격은 20~60초 사이 무작위
    clock += 60_000;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(2);
    engine.handleRead("fan_2");
    const { automationStats } = await import("../server/views");
    const s = automationStats(store, store.db.automations[0].id);
    expect(s.sent).toBe(2);
    expect(s.read).toBe(1);
  });

  it("DM 코드는 다시 보내도 받을 수 있다 (댓글 DM을 못 받은 팬 안내용)", async () => {
    const { store, services, engine } = setup();
    const extras = defaultExtras();
    extras.codeReply = true;
    const a = services.createAutomation(input({ extras, code: "ab7k" }));
    expect(a.code).toBe("AB7K");
    await engine.handleMessage("fan_2", "fan_2", { text: "AB7K" });
    await engine.handleMessage("fan_2", "fan_2", { text: "ab7k" });
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2")).toHaveLength(2);
    // 이미 쓰는 코드는 새로 발급
    const b = services.createAutomation(input({ postId: "post_2", extras, code: "AB7K" }));
    expect(b.code).not.toBe("AB7K");
  });

  it("다음 게시물 자동화는 한 번에 하나만", () => {
    const { services } = setup();
    services.createAutomation(input({ postId: null, nextPost: true }));
    expect(() => services.createAutomation(input({ postId: null, nextPost: true, trigger: { type: "keyword", keywords: ["다른"] } }))).toThrow(
      /이미 다음에 올릴 게시물 자동화가 있어요/,
    );
  });

  it("꺼 둔 자동화의 대기 발송은 다시 켤 때까지 보내지 않는다", async () => {
    const { store, services, engine } = setup();
    store.db.settings.rateLimitPerHour = 1;
    const a = services.createAutomation(input({ trigger: { type: "all", keywords: [] } }));
    await engine.handleComment(comment("post_1", "fan_2", "hi"));
    await engine.handleComment(comment("post_1", "fan_3", "hi"));
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(1);
    services.updateAutomation(a.id, { enabled: false });
    clock += HOUR + MINUTE;
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(1);
    services.updateAutomation(a.id, { enabled: true });
    await engine.tick();
    expect(store.db.demo.inbox).toHaveLength(2);
  });

  it("자동화를 지워도 이미 보낸 DM의 버튼 링크는 동작한다", async () => {
    const { store, services, engine } = setup();
    const a = services.createAutomation(input());
    await engine.handleComment(comment("post_1", "fan_2", "링크"));
    await engine.tick();
    const msg = store.db.demo.inbox[0];
    const [, dId, bId] = msg.buttons![0].url!.split("/").filter(Boolean);
    services.deleteAutomation(a.id);
    expect(engine.recordClick(dId, bId)).toBe("https://example.com/p");
  });

  it("답글 모음: 3개 이상, 이름 필수", () => {
    const { services } = setup();
    expect(() => services.upsertReplySet({ name: "", replies: ["a", "b", "c"] })).toThrow(/이름/);
    expect(() => services.upsertReplySet({ name: "기본", replies: ["a", "b"] })).toThrow(/3개 이상/);
    const r = services.upsertReplySet({ name: "기본", replies: ["a", " b ", "c", ""] });
    expect(r.replies).toEqual(["a", "b", "c"]);
  });

  it("수정: 발송 방식·팔로우 확인 여부는 바꿀 수 없고 예약은 키워드를 바꿀 수 없다", () => {
    const { services } = setup();
    const a = services.createAutomation(input());
    const dm = structuredClone(a.dm);
    dm.followGate.enabled = true;
    expect(() => services.updateAutomation(a.id, { dm })).toThrow(/팔로우 확인 여부/);
    expect(() => services.updateAutomation(a.id, { sendMode: "scheduled" })).toThrow(/발송 방식/);
    const s = services.createAutomation(
      input({ postId: "post_4", sendMode: "scheduled", schedule: { at: clock + 2 * HOUR, continueAfter: true } }),
    );
    expect(() => services.updateAutomation(s.id, { trigger: { type: "keyword", keywords: ["다른"] } })).toThrow(/키워드 조건/);
    services.updateAutomation(s.id, { schedule: { at: clock + 3 * HOUR, continueAfter: false } });
    expect(s.schedule?.at).toBe(clock + 3 * HOUR);
  });

  it("댓글 추첨: 조건에 맞는 사람 중에서 중복 없이 뽑는다", async () => {
    const { store, services } = setup();
    store.db.comments = [
      comment("post_5", "fan_2", "응모합니다"),
      comment("post_5", "fan_2", "응모 또 해요"),
      comment("post_5", "fan_3", "응모!"),
      comment("post_5", "fan_4", "구경만"),
    ];
    const d = await services.draw({ postId: "post_5", trigger: { type: "keyword", keywords: ["응모"] }, winnerCount: 5 });
    expect(d.candidateCount).toBe(2);
    expect(d.winners).toHaveLength(2);
    expect(new Set(d.winners.map((w) => w.userId)).size).toBe(2);
  });
});
