import { defaultExtras, emptyButton, textMessage } from "./factory";
import type { DMContent, Extras, Template } from "./types";

/* ───────────── 댓글 답글 프리셋 (정중하게 / 친근하게) ───────────── */

export const POLITE_REPLIES: string[] = [
  "DM으로 안내드렸습니다. 확인 부탁드립니다.",
  "요청하신 내용 DM으로 보내드렸어요. 확인해 주세요.",
  "관심 가져 주셔서 감사합니다. DM 확인 부탁드립니다.",
  "DM 발송해 드렸습니다. 메시지함을 확인해 주세요.",
  "소중한 댓글 감사합니다. DM으로 자세히 안내드렸어요.",
  "보내 드린 DM 확인 부탁드립니다. 감사합니다.",
  "DM으로 링크 전달드렸습니다. 좋은 하루 보내세요.",
  "댓글 감사드립니다. 안내 메시지를 DM으로 보내드렸어요.",
  "DM으로 정보 보내드렸습니다. 확인해 주시면 감사하겠습니다.",
  "메시지함에 안내 드렸습니다. 혹시 안 보이시면 요청함도 확인해 주세요.",
  "DM 전달 완료했습니다. 관심 가져 주셔서 감사합니다.",
  "자세한 내용은 DM으로 안내드렸습니다.",
  "확인 후 DM 드렸습니다. 감사합니다.",
  "댓글 남겨 주셔서 감사합니다. DM을 확인해 주세요.",
  "DM으로 답변드렸습니다. 편하게 확인해 주세요.",
  "요청 주신 정보를 DM으로 보내드렸습니다.",
  "감사합니다. DM으로 링크 확인 부탁드립니다.",
  "DM 보내드렸어요. 확인 부탁드리겠습니다.",
  "안내 메시지를 발송해 드렸습니다. 메시지함을 확인해 주세요.",
  "따뜻한 관심 감사합니다. DM으로 안내드렸어요.",
  "DM으로 자료 보내드렸습니다. 유용하게 쓰시길 바랍니다.",
  "확인 감사합니다. 자세한 내용은 DM을 참고해 주세요.",
  "DM으로 전달드렸습니다. 문의는 언제든 편하게 주세요.",
  "메시지 보내드렸습니다. 확인 부탁드립니다.",
  "댓글 확인했습니다. DM으로 안내드릴게요.",
  "DM 확인 부탁드립니다. 늘 감사합니다.",
  "보내 드린 링크로 확인 가능하십니다. DM 확인 부탁드려요.",
  "DM으로 상세 안내드렸습니다. 감사합니다.",
  "요청하신 링크 DM으로 전달 완료했습니다.",
  "관심 주셔서 감사합니다. DM함을 확인해 주세요.",
];

export const FRIENDLY_REPLIES: string[] = [
  "DM 보냈어요! 확인해 주세요 💌",
  "방금 DM 쏙 보내드렸어요 😊",
  "DM 확인해 보세요~ ✨",
  "댓글 고마워요! DM 보냈어요 🙌",
  "DM으로 링크 보내드렸어요 💛",
  "DM함 열어 보세요! 🎁",
  "보내드렸어요~ DM 확인 부탁해요 😆",
  "DM 슝~ 보냈어요 🚀",
  "고마워요! DM 체크해 주세요 💬",
  "DM 도착했을 거예요 📩",
  "링크 DM으로 쏙! 확인해 주세요 🔗",
  "DM 보냈어요, 안 보이면 요청함도 봐 주세요 👀",
  "와 반가워요! DM 확인해 주세요 🥰",
  "DM으로 살짝 보내드렸어요 🤫",
  "댓글 감사해요~ DM 갔어요 💕",
  "DM 확인 고고! 😎",
  "바로 DM 보냈어요 ⚡",
  "DM함에 선물 있어요 🎀",
  "보냈어요! 즐겁게 봐 주세요 😊",
  "DM 확인해 주시면 돼요 🙆",
  "링크 보내드렸어요~ 👍",
  "DM 쏙! 감사해요 🌷",
  "댓글 고마워요, DM 확인해 줘요 🫶",
  "DM 보냈어요, 좋은 하루 보내요 ☀️",
  "확인했어요! DM 보내드렸어요 ✅",
  "DM으로 알려드렸어요 💡",
  "DM 확인 부탁해요~ 🍀",
  "보냈어요 보냈어요! 📨",
  "DM 도착! 확인해 보세요 🎉",
  "늘 고마워요! DM 체크~ 💖",
];

export function replyPool(tone: "polite" | "friendly" | "custom", count: number, custom: string[]): string[] {
  if (tone === "custom") return custom.map((s) => s.trim()).filter(Boolean);
  const base = tone === "polite" ? POLITE_REPLIES : FRIENDLY_REPLIES;
  return base.slice(0, count);
}

/* ───────────── 기본 템플릿 ───────────── */

interface BuiltinSpec {
  id: string;
  name: string;
  emoji: string;
  description: string;
  recommended?: boolean;
  keywordIdeas: string[];
  text: string;
  buttons: string[];
  followGate?: boolean;
  gateText?: string;
  extras?: Partial<Extras>;
}

const SPECS: BuiltinSpec[] = [
  {
    id: "builtin_product",
    name: "제품 링크",
    emoji: "🛍️",
    description: "소개한 제품의 구매 링크를 보낼 때",
    recommended: true,
    keywordIdeas: ["링크", "구매", "정보", "제품", "어디서"],
    text: "영상 속 제품 정보 보내드려요! 🛍️\n아래 버튼에서 바로 확인하실 수 있어요.",
    buttons: ["제품 보러 가기"],
  },
  {
    id: "builtin_partners",
    name: "제휴 링크 (파트너스)",
    emoji: "🔗",
    description: "제휴 링크와 함께 수수료 고지 문구가 필요할 때",
    recommended: true,
    keywordIdeas: ["링크", "구매링크", "정보"],
    text:
      "요청하신 링크 보내드려요 🔗\n\n이 링크는 제휴 마케팅 활동의 일환으로, 구매 시 일정액의 수수료를 제공받을 수 있어요.",
    buttons: ["링크 열기"],
  },
  {
    id: "builtin_groupbuy",
    name: "공동구매",
    emoji: "🛒",
    description: "공구 오픈 링크와 일정을 안내할 때",
    keywordIdeas: ["공구", "구매", "링크", "오픈"],
    text: "공동구매 안내드려요 🛒\n\n📅 기간: 00월 00일 ~ 00월 00일\n🎁 공구 특가 + 사은품\n\n아래 버튼에서 바로 주문하실 수 있어요!",
    buttons: ["공구 바로가기", "상세 정보"],
  },
  {
    id: "builtin_resource",
    name: "자료 배포",
    emoji: "📚",
    description: "팔로워에게만 자료를 보낼 때 (팔로우 확인이 켜져 있어요)",
    recommended: true,
    keywordIdeas: ["자료", "다운로드", "받기", "공유"],
    text: "팔로우 확인됐어요! 약속한 자료 보내드려요 📚\n유용하게 써 주세요.",
    buttons: ["자료 받기"],
    followGate: true,
  },
  {
    id: "builtin_event",
    name: "이벤트 응모",
    emoji: "🎉",
    description: "응모 방법이나 응모 링크를 보낼 때",
    keywordIdeas: ["응모", "참여", "이벤트"],
    text: "이벤트 참여 고마워요 🎉\n아래 버튼으로 응모를 마무리해 주세요. 당첨자는 게시물로 발표할게요!",
    buttons: ["응모하기"],
  },
  {
    id: "builtin_class",
    name: "클래스·상담 신청",
    emoji: "🧑‍🏫",
    description: "신청서 링크를 팔로워에게 보낼 때 (팔로우 확인이 켜져 있어요)",
    keywordIdeas: ["신청", "상담", "강의", "클래스"],
    text: "신청 안내 보내드려요 🧑‍🏫\n아래 신청서를 작성해 주시면 순서대로 연락드릴게요.",
    buttons: ["신청서 작성"],
    followGate: true,
  },
  {
    id: "builtin_review",
    name: "구매 후기",
    emoji: "📝",
    description: "후기 링크나 리뷰 이벤트를 안내할 때",
    keywordIdeas: ["구매완료", "후기", "리뷰"],
    text: "구매해 주셔서 감사해요 💛\n후기를 남겨 주시면 추첨을 통해 선물을 드려요!",
    buttons: ["후기 남기기"],
  },
  {
    id: "builtin_restock",
    name: "재입고 알림",
    emoji: "🔔",
    description: "재입고 소식을 받을 링크를 보낼 때",
    keywordIdeas: ["재입고", "알림", "품절"],
    text: "찾으시는 상품 재입고되면 바로 알려 드릴게요 🔔\n아래에서 알림을 신청해 주세요.",
    buttons: ["재입고 알림 신청"],
  },
  {
    id: "builtin_live",
    name: "라이브 예고",
    emoji: "📺",
    description: "라이브 알림 신청 링크를 보낼 때",
    keywordIdeas: ["라이브", "알림", "방송"],
    text: "라이브에서 만나요 📺\n알림 신청해 두시면 시작할 때 바로 알려 드려요!",
    buttons: ["알림 신청하기"],
  },
];

function specToDM(s: BuiltinSpec): DMContent {
  return {
    main: textMessage(
      s.text,
      s.buttons.map((t) => emptyButton(t, "")),
    ),
    followGate: {
      enabled: !!s.followGate,
      gateText:
        s.gateText ??
        "댓글 고마워요! 😊 이 DM은 팔로워분들께만 보내 드려요.\n팔로우하신 뒤 아래 버튼을 눌러 주세요.",
      gateButtonTitle: "팔로우 했어요",
      nonFollower: textMessage("아직 팔로우가 확인되지 않았어요 🥲\n팔로우하신 뒤 아래 버튼을 한 번 더 눌러 주세요!"),
    },
  };
}

export const BUILTIN_TEMPLATES: Template[] = SPECS.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  builtin: true,
  recommended: s.recommended,
  emoji: s.emoji,
  keywordIdeas: s.keywordIdeas,
  dm: specToDM(s),
  extras: { ...defaultExtras(), ...s.extras },
  createdAt: 0,
  updatedAt: 0,
  usedCount: 0,
}));

export const GENERIC_KEYWORD_IDEAS = ["링크", "구매", "정보", "가격", "신청", "자료"];
