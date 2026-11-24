import type {
  CarouselCard,
  CommentReplySetting,
  DMButton,
  DMContent,
  DMMessage,
  Extras,
} from "./types";

export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${rand}` : rand;
}

export function emptyButton(title = "", url = ""): DMButton {
  return { id: uid("btn"), title, url };
}

export function emptyCard(): CarouselCard {
  return { id: uid("card"), imageUrl: "", title: "", subtitle: "", buttons: [] };
}

export function textMessage(text: string, buttons: DMButton[] = []): DMMessage {
  return { format: "text", text, buttons, cards: [] };
}

export function defaultReplySetting(): CommentReplySetting {
  return { enabled: false, count: 10, tone: "friendly", custom: [] };
}

export function defaultExtras(): Extras {
  return { commentReply: defaultReplySetting(), shareReply: false, codeReply: false };
}

export function defaultDM(): DMContent {
  return {
    main: textMessage("안녕하세요! 댓글 남겨 주셔서 감사해요 🙌\n아래 버튼을 눌러 확인해 주세요.", [
      emptyButton("링크 열기"),
    ]),
    followGate: {
      enabled: false,
      gateText:
        "댓글 남겨 주셔서 감사해요! 😊\n팔로워분들께만 보내 드리는 DM이에요. 팔로우 후 아래 버튼을 눌러 주세요.",
      gateButtonTitle: "팔로우했어요",
      nonFollower: textMessage(
        "아직 팔로우가 확인되지 않았어요 🥲\n팔로우하신 뒤 아래 버튼을 한 번 더 눌러 주세요!",
      ),
    },
  };
}

export function cloneDeep<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 버튼/카드 id를 새로 발급한 복사본 */
export function reissueIds(dm: DMContent): DMContent {
  const c = cloneDeep(dm);
  const fix = (m: DMMessage) => {
    m.buttons = m.buttons.map((b) => ({ ...b, id: uid("btn") }));
    m.cards = m.cards.map((card) => ({
      ...card,
      id: uid("card"),
      buttons: card.buttons.map((b) => ({ ...b, id: uid("btn") })),
    }));
  };
  fix(c.main);
  fix(c.followGate.nonFollower);
  return c;
}
