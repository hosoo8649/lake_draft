import { LIMITS } from "./limits";
import type { Automation, DMContent, DMMessage, Extras, SendMode, Trigger } from "./types";

/* ───────────── 키워드 ───────────── */

export function normalizeKeyword(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** 쉼표·줄바꿈으로 여러 개를 한 번에 입력 */
export function splitKeywordInput(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function keywordsTotalChars(list: string[]): number {
  return list.reduce((sum, k) => sum + [...k].length, 0);
}

const squash = (s: string) => normalizeKeyword(s).replace(/\s/g, "");

/** 키워드가 문장 안에 있어도 일치 ("링크 주세요" ⊃ "링크") */
export function keywordHit(trigger: Trigger, text: string): string | null {
  if (trigger.type === "all") return "*";
  const t = squash(text);
  if (!t) return null;
  for (const k of trigger.keywords) {
    const kk = squash(k);
    if (kk && t.includes(kk)) return k;
  }
  return null;
}

/* ───────────── URL ───────────── */

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** 카드 이미지는 올린 파일(/uploads/...)도 쓸 수 있어요 */
export function isValidImageUrl(url: string): boolean {
  return /^\/uploads\/[\w.-]+$/.test(url.trim()) || isValidUrl(url);
}

export function normalizeUrl(url: string): string {
  const v = url.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

/* ───────────── DM 검증 ───────────── */

export interface MessageRules {
  allowCarousel: boolean;
  maxButtons: number;
  label: string;
}

export function validateMessage(m: DMMessage, rules: MessageRules): string[] {
  const errs: string[] = [];
  const p = rules.label ? `${rules.label}: ` : "";
  if (m.format === "carousel") {
    if (!rules.allowCarousel) errs.push(`${p}이미지 캐러셀은 팔로우 확인을 켰을 때 팔로워 DM에서만 쓸 수 있어요`);
    if (m.cards.length === 0) errs.push(`${p}카드를 1장 이상 넣어 주세요`);
    if (m.cards.length > LIMITS.cards) errs.push(`${p}카드는 ${LIMITS.cards}장까지 만들 수 있어요`);
    m.cards.forEach((c, i) => {
      if (!c.title.trim()) errs.push(`${p}${i + 1}번 카드 제목을 넣어 주세요`);
      if ([...c.title].length > LIMITS.cardTitle) errs.push(`${p}${i + 1}번 카드 제목은 ${LIMITS.cardTitle}자까지예요`);
      if ([...c.subtitle].length > LIMITS.cardSubtitle) errs.push(`${p}${i + 1}번 카드 설명은 ${LIMITS.cardSubtitle}자까지예요`);
      if (c.imageUrl && !isValidImageUrl(c.imageUrl)) errs.push(`${p}${i + 1}번 카드 이미지 주소가 올바르지 않아요`);
      if (c.buttons.length > LIMITS.buttonsPerMessage) errs.push(`${p}${i + 1}번 카드 버튼은 ${LIMITS.buttonsPerMessage}개까지예요`);
      c.buttons.forEach((b) => {
        if (!b.title.trim()) errs.push(`${p}${i + 1}번 카드에 이름 없는 버튼이 있어요`);
        if (!isValidUrl(b.url)) errs.push(`${p}버튼 링크를 설정해 주세요`);
      });
    });
    return dedupe(errs);
  }
  if (!m.text.trim()) errs.push(`${p}DM 문구를 넣어 주세요`);
  if ([...m.text].length > LIMITS.dmText) errs.push(`${p}DM 문구는 ${LIMITS.dmText}자까지 쓸 수 있어요`);
  if (m.buttons.length > rules.maxButtons) errs.push(`${p}버튼은 ${rules.maxButtons}개까지 넣을 수 있어요`);
  m.buttons.forEach((b) => {
    if (!b.title.trim()) errs.push(`${p}버튼 이름을 넣어 주세요`);
    if ([...b.title].length > LIMITS.buttonTitle) errs.push(`${p}버튼 이름은 ${LIMITS.buttonTitle}자까지예요`);
    if (!isValidUrl(b.url)) errs.push(`${p}버튼 링크를 설정해 주세요`);
  });
  return dedupe(errs);
}

export function validateDM(dm: DMContent): string[] {
  const gate = dm.followGate;
  const errs: string[] = [];
  errs.push(
    ...validateMessage(dm.main, {
      allowCarousel: gate.enabled,
      maxButtons: LIMITS.buttonsPerMessage,
      label: gate.enabled ? "팔로워 DM" : "",
    }),
  );
  if (gate.enabled) {
    if (!gate.gateText.trim()) errs.push("팔로우 확인 DM 문구를 넣어 주세요");
    if ([...gate.gateText].length > LIMITS.dmText) errs.push(`팔로우 확인 DM은 ${LIMITS.dmText}자까지예요`);
    if (!gate.gateButtonTitle.trim()) errs.push("팔로우 확인 버튼 이름을 넣어 주세요");
    if ([...gate.gateButtonTitle].length > LIMITS.buttonTitle) errs.push(`버튼 이름은 ${LIMITS.buttonTitle}자까지예요`);
    errs.push(
      ...validateMessage(gate.nonFollower, {
        allowCarousel: false,
        // 다시 확인 버튼이 1개 자동으로 붙어요
        maxButtons: LIMITS.buttonsPerMessage - 1,
        label: "비팔로워 DM",
      }),
    );
  }
  return dedupe(errs);
}

export function validateExtras(extras: Extras, sendMode: SendMode): string[] {
  const errs: string[] = [];
  const r = extras.commentReply;
  if (r.enabled) {
    if (sendMode !== "immediate") errs.push("예약·일괄 발송에서는 댓글 답글을 쓸 수 없어요");
    if (r.tone === "custom") {
      const list = r.custom.map((s) => s.trim()).filter(Boolean);
      if (list.length < LIMITS.customRepliesMin) errs.push(`내 답글은 ${LIMITS.customRepliesMin}개 이상 넣어 주세요`);
      if (list.length > LIMITS.customRepliesMax) errs.push(`내 답글은 ${LIMITS.customRepliesMax}개까지 넣을 수 있어요`);
    }
  }
  return errs;
}

export function validateTrigger(trigger: Trigger): string[] {
  if (trigger.type === "all") return [];
  const errs: string[] = [];
  if (trigger.keywords.length === 0) errs.push("키워드를 넣어 주세요");
  if (keywordsTotalChars(trigger.keywords) > LIMITS.keywordsTotalChars)
    errs.push(`키워드는 모두 합쳐 ${LIMITS.keywordsTotalChars}자까지 넣을 수 있어요`);
  const seen = new Set<string>();
  for (const k of trigger.keywords) {
    const n = normalizeKeyword(k);
    if (seen.has(n)) errs.push(`이미 넣은 키워드예요: ${k}`);
    seen.add(n);
  }
  return errs;
}

/* ───────────── 같은 게시물 충돌 규칙 ───────────── */

export type AutomationLike = Pick<Automation, "id" | "postId" | "nextPost" | "trigger" | "sendMode"> &
  Partial<Pick<Automation, "schedule">>;

const MODE_LABEL: Record<SendMode, string> = {
  immediate: "즉시 발송",
  scheduled: "예약 발송",
  batch: "일괄 발송",
};

/**
 * - 같은 게시물에는 발송 방식을 하나만 (즉시+즉시, 예약+예약은 가능)
 * - 모든 댓글 자동화는 게시물마다 하나
 * - 같은 키워드를 두 자동화에 쓸 수 없음
 */
export function findConflicts(candidate: AutomationLike, others: AutomationLike[]): string[] {
  const errs: string[] = [];
  const samePost = others.filter((o) => {
    if (o.id === candidate.id) return false;
    if (candidate.postId) return o.postId === candidate.postId;
    // 아직 연결되지 않은 다음 게시물 자동화끼리
    return candidate.nextPost && o.nextPost && !o.postId;
  });
  for (const o of samePost) {
    if (o.sendMode !== candidate.sendMode) {
      errs.push(
        `이 게시물에는 이미 ${MODE_LABEL[o.sendMode]} 자동화가 있어요. 발송 방식은 게시물마다 하나만 걸 수 있어요`,
      );
      break;
    }
  }
  if (candidate.trigger.type === "all" && samePost.some((o) => o.trigger.type === "all")) {
    errs.push("모든 댓글 자동화는 게시물마다 하나만 만들 수 있어요");
  }
  if (candidate.trigger.type === "keyword") {
    const used = new Map<string, string>();
    for (const o of samePost) {
      if (o.trigger.type !== "keyword") continue;
      for (const k of o.trigger.keywords) used.set(normalizeKeyword(k), k);
    }
    for (const k of candidate.trigger.keywords) {
      if (used.has(normalizeKeyword(k))) errs.push(`이미 이 게시물에 걸린 키워드예요: ${k}`);
    }
  }
  return dedupe(errs);
}

/** 키워드 하나를 넣을 수 있는지 (입력 칩 단계에서 바로 안내) */
export function keywordAddError(
  keyword: string,
  current: string[],
  usedOnPost: string[],
): string | null {
  const n = normalizeKeyword(keyword);
  if (!n) return null;
  if (current.some((k) => normalizeKeyword(k) === n)) return "이미 넣은 키워드예요";
  if (usedOnPost.some((k) => normalizeKeyword(k) === n)) return "이미 이 게시물에 걸린 키워드예요";
  if (keywordsTotalChars([...current, keyword]) > LIMITS.keywordsTotalChars)
    return `키워드는 모두 합쳐 ${LIMITS.keywordsTotalChars}자까지 넣을 수 있어요`;
  return null;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
