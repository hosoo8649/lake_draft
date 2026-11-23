import type { Automation, DMButton, DMMessage } from "../../shared/types";
import type { OutgoingButton, OutgoingMessage } from "../instagram/gateway";

export const FOLLOW_CHECK_PREFIX = "FC|";

export interface LinkBuilder {
  /** 버튼 링크 → 클릭 추적 링크 */
  (deliveryId: string, button: DMButton): string;
}

export function makeLinkBuilder(baseUrl: string, track: boolean): LinkBuilder {
  return (deliveryId, button) => {
    if (!track) return button.url;
    return `${baseUrl}/r/${encodeURIComponent(deliveryId)}/${encodeURIComponent(button.id)}`;
  };
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
): OutgoingMessage {
  if (m.format === "carousel" && m.cards.length) {
    return {
      kind: "carousel",
      cards: m.cards.map((c) => ({
        title: c.title,
        subtitle: c.subtitle,
        imageUrl: c.imageUrl,
        buttons: urlButtons(c.buttons, deliveryId, link),
      })),
    };
  }
  const buttons = [...urlButtons(m.buttons, deliveryId, link), ...extraButtons];
  if (buttons.length === 0) return { kind: "text", text: m.text };
  return { kind: "buttons", text: m.text, buttons };
}

export function followCheckButton(a: Automation): OutgoingButton {
  return {
    type: "postback",
    title: a.dm.followGate.gateButtonTitle.trim() || "팔로우 했어요",
    payload: `${FOLLOW_CHECK_PREFIX}${a.id}`,
  };
}

/** 댓글·공유·코드에 반응해 가장 먼저 보내는 DM */
export function buildFirstMessage(a: Automation, deliveryId: string, link: LinkBuilder): OutgoingMessage {
  if (a.dm.followGate.enabled) {
    return { kind: "buttons", text: a.dm.followGate.gateText, buttons: [followCheckButton(a)] };
  }
  return buildMessage(a.dm.main, deliveryId, link);
}

export function buildFollowerMessage(a: Automation, deliveryId: string, link: LinkBuilder): OutgoingMessage {
  return buildMessage(a.dm.main, deliveryId, link);
}

export function buildNonFollowerMessage(a: Automation, deliveryId: string, link: LinkBuilder): OutgoingMessage {
  return buildMessage(a.dm.followGate.nonFollower, deliveryId, link, [followCheckButton(a)]);
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
