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

/** DM 코드에 쓰는 글자 (헷갈리는 0·O·1·I 제외) */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeCode(text: string): string {
  return text.trim().toUpperCase();
}

export function isCodeFormat(text: string): boolean {
  return /^[A-Z0-9]{4}$/.test(normalizeCode(text));
}
