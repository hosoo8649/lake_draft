import type { AutomationStatus, Post, SendMode, Trigger } from "@shared/types";

export const SEND_MODE_LABEL: Record<SendMode, string> = {
  immediate: "즉시 발송",
  scheduled: "예약 발송",
  batch: "일괄 발송",
};

export const SEND_MODE_DESC: Record<SendMode, string> = {
  immediate: "지금부터 댓글이 달릴 때마다 바로 DM을 보내요",
  scheduled: "정한 시각에 그때까지 모인 댓글에 한 번에 보내요",
  batch: "이미 달린 지난 댓글(최근 7일)에 지금 한 번에 보내요",
};

export const STATUS_LABEL: Record<AutomationStatus, string> = {
  running: "운영 중",
  off: "꺼짐",
  paused: "일시 중지",
  scheduled: "예약됨",
  sending: "보내는 중",
  sent: "보냈어요",
  waiting: "게시물 대기",
};

export const STATUS_TONE: Record<AutomationStatus, "positive" | "neutral" | "warning" | "informative" | "brand"> = {
  running: "positive",
  off: "neutral",
  paused: "warning",
  scheduled: "informative",
  sending: "brand",
  sent: "neutral",
  waiting: "informative",
};

export function triggerSummary(t: Trigger): string {
  if (t.type === "all") return "모든 댓글";
  if (t.keywords.length <= 3) return t.keywords.map((k) => `'${k}'`).join(", ");
  return `${t.keywords.slice(0, 3).map((k) => `'${k}'`).join(", ")} 외 ${t.keywords.length - 3}개`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) ${fmtTime(ts)}`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hh}:${pad(d.getMinutes())}`;
}

export function fmtRelative(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}일 전`;
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function postTitle(p?: Pick<Post, "caption"> | null): string {
  if (!p) return "다음에 올릴 게시물";
  const first = p.caption.split("\n")[0].trim();
  if (!first) return "(캡션 없음)";
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}

export const MEDIA_LABEL: Record<Post["mediaType"], string> = {
  IMAGE: "사진",
  VIDEO: "동영상",
  CAROUSEL_ALBUM: "여러 장",
  REELS: "릴스",
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
