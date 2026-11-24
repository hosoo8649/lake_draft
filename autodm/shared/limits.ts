// 인스타그램 메시지 제약과 앱 규칙에서 나온 한도

export const LIMITS = {
  dmText: 640,
  buttonTitle: 20,
  buttonsPerMessage: 3,
  cards: 10,
  cardTitle: 60,
  cardSubtitle: 60,
  keywordsTotalChars: 200,
  templateName: 20,
  templates: 50,
  customRepliesMin: 3,
  customRepliesMax: 30,
  replyText: 300,
  scheduleMaxDays: 7,
  scheduleStepMinutes: 30,
  batchLookbackDays: 7,
  codeLength: 4,
  replySetName: 20,
  uploadBytes: 8 * 1024 * 1024,
  linkTitle: 40,
} as const;

export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;

export const DEFAULT_RATE_LIMIT_PER_HOUR = 180;

/** 안전 장치 기본값 (KittyChat 등과 비슷한 보수적인 값) */
export const SAFETY_DEFAULTS = {
  replyDelayMinSec: 20,
  replyDelayMaxSec: 60,
  replyPerHour: 60,
  dmSpread: false,
  /** 제한 신호를 받으면 답글 간격 (초) */
  riskReplyDelaySec: 600,
  /** 이 시간 안의 신호만 셉니다 */
  riskWindowMs: 24 * 60 * 60 * 1000,
} as const;

/** DM 문구 변형은 최대 몇 개까지 */
export const MAX_VARIANTS = 5;

/** 인스타그램 메시지 규칙: 팬이 마지막으로 반응한 뒤 24시간 안에만 보낼 수 있어요 */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

/** DM 코드에 쓰는 글자 (헷갈리는 0·O·1·I 제외) */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeCode(text: string): string {
  return text.trim().toUpperCase();
}

export function isCodeFormat(text: string): boolean {
  return /^[A-Z0-9]{4}$/.test(normalizeCode(text));
}
