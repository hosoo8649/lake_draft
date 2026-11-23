import { DAY } from "../shared/limits";
import type {
  AccountPublic,
  Automation,
  AutomationHealth,
  AutomationStatus,
  AutomationView,
  DailyPoint,
  HomeSummary,
} from "../shared/types";
import type { AccountPrivate, Store } from "./store";

export function publicAccount(acc: AccountPrivate | null): AccountPublic {
  if (!acc) return { connected: false, mode: "demo" };
  const { accessToken: _t, ...rest } = acc;
  return rest;
}

export function automationStatus(store: Store, a: Automation): AutomationStatus {
  const s = store.db.settings;
  if (a.nextPost && !a.postId) return a.enabled ? "waiting" : "off";
  if (a.sendMode === "batch" && a.batch && !a.batch.finishedAt) return "sending";
  if (s.dmPaused) return "paused";
  if (a.sendMode === "scheduled" && a.schedule) {
    if (!a.schedule.firedAt) return a.enabled ? "scheduled" : "off";
    if (!a.schedule.continueAfter) return "sent";
  }
  return a.enabled ? "running" : "off";
}

export function automationHealth(store: Store, a: Automation, now = Date.now()): AutomationHealth {
  const acc = store.db.account;
  if (!acc?.connected || acc.needsReauth)
    return { state: "blocked", failedCount: 0, reasons: ["인스타그램 연결이 끊겼어요. 다시 연동해 주세요"] };
  const all = store.db.deliveries.filter((d) => d.automationId === a.id && d.createdAt >= now - DAY);
  // 상태는 DM 기준 — 댓글 답글이 실패해도 DM이 잘 나가면 "정상"이고, 답글 문제는 따로 알려 줘요
  const recent = all.filter((d) => d.kind !== "reply");
  const replyFailed = all.filter((d) => d.kind === "reply" && d.status === "failed");
  const replyNote = replyFailed.length
    ? [`댓글 답글 ${replyFailed.length}건을 달지 못했어요${replyFailed.at(-1)?.error ? ` (${replyFailed.at(-1)!.error})` : ""}`]
    : [];
  const failed = recent.filter((d) => d.status === "failed");
  const retrying = recent.filter((d) => d.status === "retrying");
  const reasons = [...new Set([...failed, ...retrying].map((d) => d.error).filter(Boolean) as string[])].slice(0, 3);
  if (retrying.length) return { state: "retrying", failedCount: failed.length, reasons: [...reasons, ...replyNote] };
  if (failed.length) return { state: "failed", failedCount: failed.length, reasons: [...reasons, ...replyNote] };
  return { state: "ok", failedCount: 0, reasons: replyNote };
}

export function automationStats(store: Store, id: string, now = Date.now()) {
  const ds = store.db.deliveries.filter((d) => d.automationId === id && d.kind !== "reply");
  const sent = ds.filter((d) => d.status === "sent");
  // 읽음은 사람 기준 (한 사람이 여러 번 열어도 1)
  const readers = new Set(sent.filter((d) => d.readAt).map((d) => d.userId));
  const clicks = store.db.clicks.filter((c) => c.automationId === id).length;
  const mine = store.db.queue.filter((q) => q.automationId === id && q.kind !== "reply");
  const queued = mine.filter((q) => q.notBefore <= now).length;
  return { sent: sent.length, read: readers.size, clicks, queued, held: mine.length - queued };
}

export function toView(store: Store, a: Automation): AutomationView {
  return {
    ...a,
    status: automationStatus(store, a),
    stats: automationStats(store, a.id),
    health: automationHealth(store, a),
    post: a.postId ? store.db.posts.find((p) => p.id === a.postId) : undefined,
  };
}

function ymd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function homeSummary(store: Store, now = Date.now()): HomeSummary {
  const db = store.db;
  const dms = db.deliveries.filter((d) => d.kind !== "reply" && d.status === "sent");
  const readers = new Set(dms.filter((d) => d.readAt).map((d) => `${d.automationId}:${d.userId}`));
  const clicks = db.clicks.length;
  const last7: DailyPoint[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const dayStart = start.getTime() - i * DAY;
    const dayEnd = dayStart + DAY;
    last7.push({
      date: ymd(dayStart),
      sent: dms.filter((d) => (d.sentAt ?? 0) >= dayStart && (d.sentAt ?? 0) < dayEnd).length,
      clicks: db.clicks.filter((c) => c.createdAt >= dayStart && c.createdAt < dayEnd).length,
    });
  }
  const views = db.automations.map((a) => automationStatus(store, a));
  return {
    totals: {
      sent: dms.length,
      read: readers.size,
      clicks,
      ctr: dms.length ? Math.round((clicks / dms.length) * 1000) / 10 : 0,
      automations: db.automations.length,
      running: views.filter((s) => s === "running" || s === "scheduled" || s === "sending" || s === "waiting").length,
    },
    last7,
    queued: db.queue.filter((q) => q.kind !== "reply" && q.notBefore <= now).length,
  };
}
