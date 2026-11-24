import { LIMITS, MAX_VARIANTS } from "./limits";
import type { Automation, DMContent, DMMessage, Extras, SendMode, Trigger } from "./types";

/* ───────────── 키워드 ───────────── */

export function normalizeKeyword(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** 글자 수 (이모지·결합 문자도 화면에 보이는 한 글자로) — 화면 카운터와 같은 기준 */
const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;
export function glen(s: string): number {
  if (!segmenter) return [...s].length;
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

/** 공백을 무시한 비교 키 — 매칭·중복·충돌 검사가 모두 같은 기준을 써요 ("링크 주세요" = "링크주세요") */
export function keywordKey(s: string): string {
  return normalizeKeyword(s).replace(/\s/g, "");
}

/** 쉼표·줄바꿈으로 여러 개를 한 번에 입력 */
export function splitKeywordInput(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function keywordsTotalChars(list: string[]): number {
  return list.reduce((sum, k) => sum + glen(k), 0);
}

const squash = keywordKey;

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
  const v = url.trim();
  if (!v || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // 실제 주소처럼 점이 있는 도메인이어야 해요 ("구매링크", "스토어" 같은 단어는 링크가 아니에요)
    const host = u.hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    const parts = host.split(".");
    if (parts.length < 2 || parts.some((x) => !x)) return false;
    return /^([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(parts[parts.length - 1]);
  } catch {
    return false;
  }
}

/** 공개 주소(터널 주소): https:// 로 시작하고 경로 없는 실제 도메인 */
export function isPublicHttpsUrl(url: string): boolean {
  const v = url.trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(v) || !isValidUrl(v)) return false;
  try {
    const u = new URL(v);
    return (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/** 버튼 링크 문제를 알기 쉽게 (비었는지, 주소 모양이 아닌지) */
function buttonUrlError(url: string, p: string): string | null {
  if (!url.trim()) return `${p}버튼 링크를 설정해 주세요`;
  if (!isValidUrl(normalizeUrl(url))) return `${p}버튼 링크가 올바른 주소가 아니에요 (예: https://smartstore.naver.com/...)`;
  return null;
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
      if (glen(c.title) > LIMITS.cardTitle) errs.push(`${p}${i + 1}번 카드 제목은 ${LIMITS.cardTitle}자까지예요`);
      if (glen(c.subtitle) > LIMITS.cardSubtitle) errs.push(`${p}${i + 1}번 카드 설명은 ${LIMITS.cardSubtitle}자까지예요`);
      if (c.imageUrl && !isValidImageUrl(c.imageUrl)) errs.push(`${p}${i + 1}번 카드 이미지 주소가 올바르지 않아요`);
      if (c.buttons.length > LIMITS.buttonsPerMessage) errs.push(`${p}${i + 1}번 카드 버튼은 ${LIMITS.buttonsPerMessage}개까지예요`);
      c.buttons.forEach((b) => {
        if (!b.title.trim()) errs.push(`${p}${i + 1}번 카드에 이름 없는 버튼이 있어요`);
        if (glen(b.title) > LIMITS.buttonTitle) errs.push(`${p}버튼 이름은 ${LIMITS.buttonTitle}자까지예요`);
        const ue = buttonUrlError(b.url, p);
        if (ue) errs.push(ue);
      });
    });
    return dedupe(errs);
  }
  if (!m.text.trim()) errs.push(`${p}DM 문구를 넣어 주세요`);
  if (glen(m.text) > LIMITS.dmText) errs.push(`${p}DM 문구는 ${LIMITS.dmText}자까지 쓸 수 있어요`);
  const variants = (m.variants ?? []).filter((v) => v.trim());
  if (variants.length > MAX_VARIANTS) errs.push(`${p}다른 문구는 ${MAX_VARIANTS}개까지 넣을 수 있어요`);
  if (variants.some((v) => glen(v) > LIMITS.dmText)) errs.push(`${p}다른 문구도 ${LIMITS.dmText}자까지 쓸 수 있어요`);
  if (m.buttons.length > rules.maxButtons) errs.push(`${p}버튼은 ${rules.maxButtons}개까지 넣을 수 있어요`);
  m.buttons.forEach((b) => {
    if (!b.title.trim()) errs.push(`${p}버튼 이름을 넣어 주세요`);
    if (glen(b.title) > LIMITS.buttonTitle) errs.push(`${p}버튼 이름은 ${LIMITS.buttonTitle}자까지예요`);
    const ue = buttonUrlError(b.url, p);
    if (ue) errs.push(ue);
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
    if (glen(gate.gateText) > LIMITS.dmText) errs.push(`팔로우 확인 DM은 ${LIMITS.dmText}자까지예요`);
    if (!gate.gateButtonTitle.trim()) errs.push("팔로우 확인 버튼 이름을 넣어 주세요");
    if (glen(gate.gateButtonTitle) > LIMITS.buttonTitle) errs.push(`버튼 이름은 ${LIMITS.buttonTitle}자까지예요`);
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
    if (r.tone === "custom") errs.push(...validateReplyList(r.custom, "내 답글"));
  }
  return errs;
}

/** 답글 비교용 (앞뒤·연속 공백 무시) */
export const replyKey = (s: string) => s.trim().replace(/\s+/g, " ");

/** 내 답글·답글 모음: 서로 다른 답글 3~30개, 각 300자 이내 */
export function validateReplyList(replies: string[], label = "답글"): string[] {
  const errs: string[] = [];
  const list = replies.map(replyKey).filter(Boolean);
  if (new Set(list).size !== list.length) errs.push("같은 답글이 두 번 들어 있어요. 서로 다른 답글로 넣어 주세요");
  if (list.length < LIMITS.customRepliesMin) errs.push(`${label}은 서로 다른 답글로 ${LIMITS.customRepliesMin}개 이상 넣어 주세요`);
  if (list.length > LIMITS.customRepliesMax) errs.push(`${label}은 ${LIMITS.customRepliesMax}개까지 넣을 수 있어요`);
  if (list.some((t) => glen(t) > LIMITS.replyText)) errs.push(`답글은 하나에 ${LIMITS.replyText}자까지예요`);
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
    const n = keywordKey(k);
    if (!n) {
      errs.push("빈 키워드는 넣을 수 없어요");
      continue;
    }
    if (seen.has(n)) errs.push(`이미 넣은 키워드예요: ${k}`);
    seen.add(n);
  }
  return [...new Set(errs)];
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
/**
 * 게시물마다 하나로 맞춰야 하는 발송 방식.
 * 이미 보낸 예약 발송은 '보낸 뒤 새 댓글에도'를 켰으면 즉시 발송처럼, 껐으면 더 이상 제약이 없어요.
 */
export function effectiveMode(o: AutomationLike): SendMode | null {
  if (o.sendMode === "scheduled" && o.schedule?.firedAt) return o.schedule.continueAfter ? "immediate" : null;
  return o.sendMode;
}

export function findConflicts(candidate: AutomationLike, others: AutomationLike[]): string[] {
  const errs: string[] = [];
  const samePost = others.filter((o) => {
    if (o.id === candidate.id) return false;
    if (candidate.postId) return o.postId === candidate.postId;
    // 아직 연결되지 않은 다음 게시물 자동화끼리
    return candidate.nextPost && o.nextPost && !o.postId;
  });
  const candidateMode = effectiveMode(candidate);
  for (const o of samePost) {
    const mode = effectiveMode(o);
    if (mode && candidateMode && mode !== candidateMode) {
      errs.push(`이 게시물에는 이미 ${MODE_LABEL[mode]} 자동화가 있어요. 발송 방식은 게시물마다 하나만 걸 수 있어요`);
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
      for (const k of o.trigger.keywords) used.set(keywordKey(k), k);
    }
    for (const k of candidate.trigger.keywords) {
      if (used.has(keywordKey(k))) errs.push(`이미 이 게시물에 걸린 키워드예요: ${k}`);
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
  const n = keywordKey(keyword);
  if (!n) return null;
  if (current.some((k) => keywordKey(k) === n)) return "이미 넣은 키워드예요";
  if (usedOnPost.some((k) => keywordKey(k) === n)) return "이미 이 게시물에 걸린 키워드예요";
  if (keywordsTotalChars([...current, keyword]) > LIMITS.keywordsTotalChars)
    return `키워드는 모두 합쳐 ${LIMITS.keywordsTotalChars}자까지 넣을 수 있어요`;
  return null;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
