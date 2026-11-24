import type { Automation, DMButton, DMMessage } from "../../shared/types";
import type { OutgoingButton, OutgoingMessage } from "../instagram/gateway";

export const FOLLOW_CHECK_PREFIX = "FC|";

export interface LinkBuilder {
  /** 버튼 링크 → 클릭 추적 링크 */
  (deliveryId: string, button: DMButton): string;
  /** 올린 이미지(/uploads/..) → 바깥에서 볼 수 있는 주소 */
  asset: (url: string) => string;
}

export function makeLinkBuilder(baseUrl: string, track: boolean, assetBase = baseUrl): LinkBuilder {
  const fn = ((deliveryId: string, button: DMButton) => {
    if (!track) return button.url;
    return `${baseUrl}/r/${encodeURIComponent(deliveryId)}/${encodeURIComponent(button.id)}`;
  }) as LinkBuilder;
  fn.asset = (url: string) => (url.startsWith("/") ? `${assetBase}${url}` : url);
  return fn;
}

/** 받는 팬에 맞춘 문구: 변형 문구 중 하나 고르기 + {이름} 자리에 팬 아이디 넣기 */
export interface Personalize {
  username: string;
  /** 같은 팬은 늘 같은 문구를 받도록 고르는 기준 */
  seed: string;
}

/** {이름}·{username}·[username] → 팬 아이디 */
export function fillName(text: string, username: string): string {
  const name = username.replace(/^@/, "");
  return text
    .replace(/\{이름\}|\{username\}|\[username\]/gi, name)
    .replace(/[ \t]{2,}/g, " ");
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 원래 문구 + 변형 문구 중 하나 (팬마다 고르게 나뉘어요) */
export function pickText(m: Pick<DMMessage, "text" | "variants">, seed: string): string {
  const pool = [m.text, ...(m.variants ?? [])].filter((t) => t.trim());
  if (pool.length <= 1) return m.text;
  return pool[hash(seed) % pool.length];
}

function textFor(m: DMMessage, p?: Personalize): string {
  if (!p) return m.text;
  return fillName(pickText(m, p.seed), p.username);
}

function urlButtons(buttons: DMButton[], deliveryId: string, link: LinkBuilder): OutgoingButton[] {
  return buttons
    .filter((b) => b.title.trim() && b.url.trim())
    .map((b) => ({ type: "web_url" as const, title: b.title.trim(), url: link(deliveryId, b) }));
}

export function buildMessage(
  m: DMMessage,
  deliveryId: string,
  link: LinkBuilder,
  extraButtons: OutgoingButton[] = [],
  p?: Personalize,
): OutgoingMessage {
  if (m.format === "carousel" && m.cards.length) {
    return {
      kind: "carousel",
      cards: m.cards.map((c) => ({
        title: c.title,
        subtitle: c.subtitle,
        imageUrl: c.imageUrl ? link.asset(c.imageUrl) : "",
        buttons: urlButtons(c.buttons, deliveryId, link),
      })),
    };
  }
  const text = textFor(m, p);
  const buttons = [...urlButtons(m.buttons, deliveryId, link), ...extraButtons];
  if (buttons.length === 0) return { kind: "text", text };
  return { kind: "buttons", text, buttons };
}

export function followCheckButton(a: Automation): OutgoingButton {
  return {
    type: "postback",
    title: a.dm.followGate.gateButtonTitle.trim() || "팔로우했어요",
    payload: `${FOLLOW_CHECK_PREFIX}${a.id}`,
  };
}

/** 댓글·공유·코드에 반응해 가장 먼저 보내는 DM */
export function buildFirstMessage(a: Automation, deliveryId: string, link: LinkBuilder, p?: Personalize): OutgoingMessage {
  if (a.dm.followGate.enabled) {
    const text = p ? fillName(a.dm.followGate.gateText, p.username) : a.dm.followGate.gateText;
    return { kind: "buttons", text, buttons: [followCheckButton(a)] };
  }
  return buildMessage(a.dm.main, deliveryId, link, [], p);
}

export function buildFollowerMessage(a: Automation, deliveryId: string, link: LinkBuilder, p?: Personalize): OutgoingMessage {
  return buildMessage(a.dm.main, deliveryId, link, [], p);
}

export function buildNonFollowerMessage(a: Automation, deliveryId: string, link: LinkBuilder, p?: Personalize): OutgoingMessage {
  return buildMessage(a.dm.followGate.nonFollower, deliveryId, link, [followCheckButton(a)], p);
}

/** 메시지 안 버튼 id → 원래 링크 */
export function findButton(a: Automation, buttonId: string): DMButton | undefined {
  const all = [
    ...a.dm.main.buttons,
    ...a.dm.main.cards.flatMap((c) => c.buttons),
    ...a.dm.followGate.nonFollower.buttons,
  ];
  return all.find((b) => b.id === buttonId);
}
