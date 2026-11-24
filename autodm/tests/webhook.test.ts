import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { DEMO_PROFILE, seedDemo } from "../server/instagram/demo";
import { toGraphMessage } from "../server/instagram/live";
import { dispatchWebhook, verifySignature } from "../server/instagram/webhook";
import { Store } from "../server/store";
import { defaultDM, defaultExtras, emptyButton, textMessage } from "../shared/factory";

function setup() {
  const store = new Store(null);
  const ctx = createApp(store);
  store.db.account = { connected: true, mode: "demo", ...DEMO_PROFILE };
  seedDemo(store);
  return { store, ...ctx };
}

describe("인스타그램 웹훅", () => {
  it("X-Hub-Signature-256 서명을 확인한다", () => {
    const body = Buffer.from(JSON.stringify({ object: "instagram" }));
    const sig = "sha256=" + crypto.createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifySignature(body, sig, "secret")).toBe(true);
    expect(verifySignature(body, sig, "other")).toBe(false);
    expect(verifySignature(body, undefined, "secret")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "secret")).toBe(false);
  });

  it("댓글·버튼·공유·읽음 이벤트를 엔진으로 전달한다", async () => {
    const { store, services, engine } = setup();
    const dm = defaultDM();
    dm.followGate.enabled = true;
    dm.main = textMessage("본 DM", [emptyButton("열기", "https://example.com")]);
    const extras = defaultExtras();
    extras.shareReply = true;
    const a = services.createAutomation({
      postId: "post_1",
      nextPost: false,
      trigger: { type: "keyword", keywords: ["링크"] },
      dm,
      extras,
      sendMode: "immediate",
    });

    const n = await dispatchWebhook(
      {
        object: "instagram",
        entry: [
          {
            id: DEMO_PROFILE.igUserId,
            time: Math.floor(Date.now() / 1000),
            changes: [
              { field: "comments", value: { id: "wc1", text: "링크요", from: { id: "fan_2", username: "jun.hobby" }, media: { id: "post_1" } } },
              // 내 계정이 단 답글은 무시
              { field: "comments", value: { id: "wc2", text: "링크", from: { id: DEMO_PROFILE.igUserId, username: DEMO_PROFILE.username }, media: { id: "post_1" } } },
            ],
          },
        ],
      },
      engine,
      async () => "",
    );
    expect(n).toBe(2);
    await engine.tick();
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2")).toHaveLength(1);

    await dispatchWebhook(
      {
        object: "instagram",
        entry: [
          {
            messaging: [
              { sender: { id: "fan_2" }, postback: { payload: `FC|${a.id}`, title: "팔로우 했어요" } },
              { sender: { id: "fan_3" }, message: { mid: "m1", attachments: [{ type: "ig_post", payload: { ig_post_media_id: "post_1" } }] } },
              { sender: { id: DEMO_PROFILE.igUserId }, message: { mid: "m2", is_echo: true, text: "echo" } },
            ],
          },
        ],
      },
      engine,
      async (id) => id,
    );
    await engine.tick();
    // fan_2는 팔로워 → 본 DM, fan_3은 공유 → 팔로우 확인 DM
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_2").at(-1)?.text).toBe("본 DM");
    expect(store.db.demo.inbox.filter((m) => m.fanId === "fan_3")).toHaveLength(1);

    await dispatchWebhook({ entry: [{ messaging: [{ sender: { id: "fan_2" }, read: { mid: "x" }, timestamp: Date.now() + 1000 }] }] }, engine, async () => "");
    expect(store.db.deliveries.filter((d) => d.userId === "fan_2" && d.readAt).length).toBeGreaterThan(0);
  });

  it("Graph API 메시지 형식으로 바꾼다", () => {
    expect(toGraphMessage({ kind: "text", text: "hi" })).toEqual({ text: "hi" });
    const btn = toGraphMessage({
      kind: "buttons",
      text: "t",
      buttons: [
        { type: "web_url", title: "열기", url: "https://a.com" },
        { type: "postback", title: "확인", payload: "FC|x" },
      ],
    }) as { attachment: { payload: { template_type: string; buttons: unknown[] } } };
    expect(btn.attachment.payload.template_type).toBe("button");
    expect(btn.attachment.payload.buttons).toHaveLength(2);
    const car = toGraphMessage({ kind: "carousel", cards: [{ title: "a", subtitle: "", imageUrl: "", buttons: [] }] }) as {
      attachment: { payload: { template_type: string } };
    };
    expect(car.attachment.payload.template_type).toBe("generic");
  });
});

describe("링크 미리보기 보호", () => {
  it("사설·로컬 주소는 막는다", async () => {
    const { isPrivateAddress, fetchPublic } = await import("../server/safeFetch");
    for (const ip of [
      "127.0.0.1", "10.1.2.3", "192.168.0.1", "172.20.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1",
      "::ffff:127.0.0.1", "::ffff:7f00:1", "::7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "fe80::1", "[::1]",
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
    await expect(fetchPublic("http://[::ffff:7f00:1]:8787/")).rejects.toThrow();
    await expect(fetchPublic("http://localhost:8787/api/state")).rejects.toThrow();
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    await expect(fetchPublic("http://127.0.0.1:8787/api/state")).rejects.toThrow();
    await expect(fetchPublic("file:///etc/passwd")).rejects.toThrow();
  });
});
