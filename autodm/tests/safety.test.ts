import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterVariants } from "../server/ai";
import { createApp } from "../server/app";
import { fillName, pickText } from "../server/engine/messages";
import { DEMO_PROFILE, DemoGateway, seedDemo } from "../server/instagram/demo";
import { Store } from "../server/store";
import { defaultDM, defaultExtras, emptyButton, textMessage } from "../shared/factory";
import { HOUR, MINUTE } from "../shared/limits";
import type { AutomationInput } from "../server/services";
import { validateMessage } from "../shared/validation";

/* 인플루언서용 안전 기능: 문구 변형·{이름}, 발송 속도, 제한 신호, 24시간 단체 DM */

let clock = new Date("2026-11-24T10:00:00+09:00").getTime();
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
  dm.main = textMessage("{이름}님 링크 보내드려요", [emptyButton("보러 가기", "https://example.com/p")]);
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
const comment = (fanId: string, text = "링크 주세요") => ({
  id: `s_${++n}`,
  postId: "post_1",
  userId: fanId,
  username: fanId,
  text,
  createdAt: clock,
});

async function serve(store: Store, app: ReturnType<typeof createApp>["app"]) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "X-AutoDM": "1", "content-type": "application/json" },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { server, call, store };
}

beforeEach(() => {
  clock = new Date("2026-11-24T10:00:00+09:00").getTime();
});
afterEach(() => vi.restoreAllMocks());

describe("문구 변형 · {이름}", () => {
  it("{이름}·[username]은 팬 아이디로 바뀌고, 같은 팬은 늘 같은 문구를 받는다", () => {
    expect(fillName("{이름}님 안녕하세요 [username]", "@fan.minji")).toBe("fan.minji님 안녕하세요 fan.minji");
    const m = { text: "A", variants: ["B", "C"] };
    expect(pickText(m, "auto:fan_1")).toBe(pickText(m, "auto:fan_1"));
    const used = new Set(Array.from({ length: 40 }, (_, i) => pickText(m, `auto:fan_${i}`)));
    expect(used.size).toBe(3);
  });

  it("DM을 보낼 때 팬마다 문구를 나눠 쓰고 {이름}을 채운다", async () => {
    const { store, services, engine } = setup();
    const inp = input();
    inp.dm.main.variants = ["{이름}님 여기 있어요!", "  ", "{이름}님 여기 있어요!"];
    const a = services.createAutomation(inp);
    // 빈 칸·중복은 저장할 때 빠져요
    expect(a.dm.main.variants).toEqual(["{이름}님 여기 있어요!"]);
    const fans = store.db.demo.fans.slice(0, 8);
    for (const f of fans) await engine.handleComment({ ...comment(f.id), username: f.username });
    await engine.tick();
    const texts = store.db.demo.inbox.filter((m) => m.from === "business").map((m) => m.text ?? "");
    expect(texts).toHaveLength(fans.length);
    expect(texts.every((t) => !t.includes("{이름}"))).toBe(true);
    for (const f of fans) {
      const t = store.db.demo.inbox.find((m) => m.fanId === f.id)!.text;
      expect([`${f.username}님 링크 보내드려요`, `${f.username}님 여기 있어요!`]).toContain(t);
    }
    expect(new Set(texts.map((t) => t.split("님")[1])).size).toBe(2);
  });

  it("다른 문구도 글자 수와 개수 제한을 검사한다", () => {
    const m = textMessage("안녕", []);
    m.variants = ["가".repeat(641)];
    expect(validateMessage(m, { allowCarousel: false, maxButtons: 3, label: "" }).join()).toContain("다른 문구도");
    m.variants = ["a", "b", "c", "d", "e", "f"];
    expect(validateMessage(m, { allowCarousel: false, maxButtons: 3, label: "" }).join()).toContain("5개까지");
  });

  it("AI 문구는 링크·{이름}이 빠졌거나 원문과 같으면 버린다", () => {
    const text = "{이름}님 자료는 https://ex.com/a 에 있어요";
    const out = filterVariants(
      text,
      [text, "{이름}님 자료 여기요 https://ex.com/a", "자료 여기요 https://ex.com/a", "{이름}님 자료 여기요", "{이름}님 https://ex.com/a 확인해 주세요", "{이름}님 자료 여기요 https://ex.com/a"],
      3,
    );
    expect(out).toEqual(["{이름}님 자료 여기요 https://ex.com/a", "{이름}님 https://ex.com/a 확인해 주세요"]);
  });

  it("AI 키가 없으면 문구 변형 요청을 안내와 함께 거절한다", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    const token = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    const { store, app } = setup();
    const { server, call } = await serve(store, app);
    try {
      expect((await call("/state")).json.aiAvailable).toBe(false);
      const r = await call("/ai/variants", { body: { text: "안녕하세요" } });
      expect(r.status).toBe(503);
      expect(r.json.error).toContain("ANTHROPIC_API_KEY");
    } finally {
      server.close();
      if (key) process.env.ANTHROPIC_API_KEY = key;
      if (token) process.env.ANTHROPIC_AUTH_TOKEN = token;
    }
  });
});

describe("발송 속도 설정", () => {
  it("답글 간격·시간당 답글 수를 검사해서 저장한다", async () => {
    const { store, app } = setup();
    const { server, call } = await serve(store, app);
    try {
      expect((await call("/settings", { method: "PATCH", body: { replyDelayMinSec: 90, replyDelayMaxSec: 30 } })).status).toBe(400);
      expect((await call("/settings", { method: "PATCH", body: { replyPerHour: 0 } })).status).toBe(400);
      expect((await call("/settings", { method: "PATCH", body: { replyDelayMinSec: 1.5 } })).status).toBe(400);
      const ok = await call("/settings", { method: "PATCH", body: { replyDelayMinSec: 30, replyDelayMaxSec: 90, replyPerHour: 40, dmSpread: true } });
      expect(ok.status).toBe(200);
      expect(store.db.settings).toMatchObject({ replyDelayMinSec: 30, replyDelayMaxSec: 90, replyPerHour: 40, dmSpread: true });
    } finally {
      server.close();
    }
  });

  it("DM 고르게 나눠 보내기: 시간당 한도에 맞춰 간격을 두고 보낸다", async () => {
    const { store, services, engine } = setup();
    store.db.settings.rateLimitPerHour = 60; // 1분에 1건
    store.db.settings.dmSpread = true;
    services.createAutomation(input());
    const fans = store.db.demo.fans.slice(0, 3);
    for (const f of fans) await engine.handleComment(comment(f.id));
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.from === "business")).toHaveLength(1);
    clock += 30_000;
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.from === "business")).toHaveLength(1);
    clock += 31_000;
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.from === "business")).toHaveLength(2);
  });

  it("시간당 답글 수를 넘으면 다음 시간까지 기다린다", async () => {
    const { store, services, engine } = setup();
    store.db.settings.replyPerHour = 1;
    store.db.settings.replyDelayMinSec = 0;
    store.db.settings.replyDelayMaxSec = 0;
    const inp = input();
    inp.extras.commentReply.enabled = true;
    services.createAutomation(inp);
    for (const f of store.db.demo.fans.slice(0, 2)) await engine.handleComment(comment(f.id));
    await engine.tick();
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(1);
    clock += 30 * MINUTE;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(1);
    clock += 31 * MINUTE;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(2);
  });
});

describe("제한 신호 사전 경고", () => {
  it("인스타그램 제한 응답을 받으면 신호로 세고, 10분 안의 같은 신호는 하나로 센다", async () => {
    const { store, services, engine } = setup();
    vi.spyOn(DemoGateway.prototype, "sendPrivateReply").mockResolvedValue({
      ok: false,
      error: "인스타그램 발송 한도에 걸렸어요",
      retryable: true,
      risk: true,
    });
    services.createAutomation(input());
    for (const f of store.db.demo.fans.slice(0, 3)) await engine.handleComment(comment(f.id));
    await engine.tick();
    expect(engine.riskLevel()).toBe(1);
    expect(store.db.settings.risk.signals[0].reason).toContain("한도");
  });

  it("신호를 받으면 답글을 10분에 하나씩, 3번째 신호에는 답글만 멈추고 DM은 계속 보낸다", async () => {
    const { store, services, engine } = setup();
    store.db.settings.replyDelayMinSec = 0;
    store.db.settings.replyDelayMaxSec = 0;
    const inp = input();
    inp.extras.commentReply.enabled = true;
    services.createAutomation(inp);
    engine.registerRisk("제한 1");
    const fans = store.db.demo.fans.slice(0, 2);
    for (const f of fans) await engine.handleComment(comment(f.id));
    await engine.tick();
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(1);
    clock += 5 * MINUTE;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(1);
    clock += 6 * MINUTE;
    await engine.tick();
    expect(store.db.demo.replies).toHaveLength(2);

    clock += 11 * MINUTE;
    engine.registerRisk("제한 2");
    clock += 11 * MINUTE;
    engine.registerRisk("제한 3");
    expect(engine.riskLevel()).toBe(3);
    expect(store.db.settings.replyPaused).toBe(true);
    expect(store.db.settings.risk.autoPausedReplies).toBe(true);
    expect(store.db.settings.dmPaused).toBe(false);

    const before = store.db.demo.inbox.length;
    await engine.handleComment(comment(store.db.demo.fans[3].id));
    await engine.tick();
    clock += HOUR;
    await engine.tick();
    expect(store.db.demo.inbox.length).toBe(before + 1);
    expect(store.db.demo.replies).toHaveLength(2);
  });

  it("기록을 지우면 원래 속도로 돌아가고 자동으로 멈춘 답글도 다시 켜진다", async () => {
    const { store, app, engine } = setup();
    for (let i = 0; i < 3; i++) engine.registerRisk(`제한 ${i}`, { dedupe: false });
    expect(store.db.settings.replyPaused).toBe(true);
    const { server, call } = await serve(store, app);
    try {
      expect((await call("/state")).json.riskLevel).toBe(3);
      await call("/risk/reset", { body: {} });
      expect(store.db.settings.replyPaused).toBe(false);
      expect(engine.riskLevel()).toBe(0);
    } finally {
      server.close();
    }
  });

  it("직접 멈춘 답글은 자동 멈춤으로 표시하지 않는다 (기록을 지워도 다시 켜지지 않음)", () => {
    const { store, engine } = setup();
    store.db.settings.replyPaused = true;
    for (let i = 0; i < 3; i++) engine.registerRisk(`제한 ${i}`, { dedupe: false });
    expect(store.db.settings.risk.autoPausedReplies).toBeFalsy();
  });
});

describe("단체 DM (24시간 안에 반응한 팬에게만)", () => {
  it("댓글만 단 팬에게는 보낼 수 없고, DM을 보내거나 버튼을 누른 팬에게만 보낸다", async () => {
    const { store, services, engine, app } = setup();
    services.createAutomation(input());
    const [a, b, c] = store.db.demo.fans;
    await engine.handleComment(comment(a.id)); // 댓글만
    await engine.tick();
    const { server, call } = await serve(store, app);
    try {
      expect((await call("/broadcasts/audience")).json.count).toBe(0);
      expect((await call("/broadcasts", { body: { text: "공지예요" } })).status).toBe(400);

      await engine.handleMessage(b.id, b.username, { text: "안녕하세요" });
      await engine.handlePostback(c.id, c.username, "FC|whatever");
      const aud = (await call("/broadcasts/audience")).json;
      expect(aud.count).toBe(2);
      expect(aud.contacts.map((x: { userId: string }) => x.userId).sort()).toEqual([b.id, c.id].sort());

      // 버튼 링크 검사
      expect((await call("/broadcasts", { body: { text: "공지", buttons: [{ title: "보기", url: "not a url" }] } })).status).toBe(400);

      const r = await call("/broadcasts", { body: { text: "{이름}님, 오늘 라이브 8시예요", buttons: [{ title: "알림 받기", url: "example.com/live" }] } });
      expect(r.status).toBe(201);
      await engine.tick();
      const got = store.db.demo.inbox.filter((m) => m.from === "business" && m.text?.includes("라이브"));
      expect(got.map((m) => m.fanId).sort()).toEqual([b.id, c.id].sort());
      expect(got.find((m) => m.fanId === b.id)!.text).toBe(`${b.username}님, 오늘 라이브 8시예요`);
      expect(got[0].buttons?.[0].title).toBe("알림 받기");
      expect(store.db.demo.inbox.some((m) => m.fanId === a.id && m.text?.includes("라이브"))).toBe(false);

      const list = (await call("/broadcasts")).json;
      expect(list[0]).toMatchObject({ total: 2, sent: 2, pending: 0 });
    } finally {
      server.close();
    }
  });

  it("24시간이 지난 팬은 대상에서 빠지고, 기다리는 사이 지나면 보내지 않는다", async () => {
    const { store, engine, app } = setup();
    const [a, b] = store.db.demo.fans;
    await engine.handleMessage(a.id, a.username, { text: "안녕" });
    clock += 20 * HOUR;
    await engine.handleMessage(b.id, b.username, { text: "안녕" });
    const { server, call } = await serve(store, app);
    try {
      store.db.settings.dmPaused = true;
      expect((await call("/broadcasts", { body: { text: "공지예요" } })).status).toBe(201);
      clock += 5 * HOUR; // a는 25시간, b는 5시간
      expect((await call("/broadcasts/audience")).json.count).toBe(1);
      store.db.settings.dmPaused = false;
      await engine.tick();
      const sentTo = store.db.demo.inbox.filter((m) => m.from === "business" && m.text === "공지예요").map((m) => m.fanId);
      expect(sentTo).toEqual([b.id]);
      const skipped = store.db.deliveries.find((d) => d.kind === "broadcast" && d.userId === a.id)!;
      expect(skipped.status).toBe("skipped");
      expect(skipped.error).toContain("24시간");
    } finally {
      server.close();
    }
  });
});
