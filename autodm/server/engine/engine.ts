import { uid } from "../../shared/factory";
import { DAY, HOUR, LIMITS, isCodeFormat, normalizeCode } from "../../shared/limits";
import { replyPool } from "../../shared/presets";
import type { Automation, Comment, DeliveryKind, DeliveryLog, DeliveryOrigin } from "../../shared/types";
import { findConflicts, keywordHit } from "../../shared/validation";
import type { Gateway, OutgoingMessage } from "../instagram/gateway";
import type { QueueItem, Store } from "../store";
import {
  FOLLOW_CHECK_PREFIX,
  buildFirstMessage,
  buildFollowerMessage,
  buildNonFollowerMessage,
  findButton,
  makeLinkBuilder,
} from "./messages";

const MAX_ATTEMPTS = 5;
/** 댓글 답글: 시간당 최대 개수, 답글 사이 최소 간격 (한꺼번에 몰리면 인스타그램이 제한할 수 있어요) */
const REPLY_LIMIT_PER_HOUR = 60;
const REPLY_MIN_GAP = 20_000;
/** 이보다 오래 밀린 답글은 달지 않아요 (며칠 지난 댓글에 갑자기 답글이 달리지 않도록) */
const REPLY_MAX_AGE = 6 * HOUR;
/** 비팔로워가 확인 버튼을 연달아 눌러도 이 간격 안에는 한 번만 답해요 */
const RECHECK_COOLDOWN = 30_000;
/** 팔로우 여부를 확인하지 못했을 때 다시 시도하는 횟수·간격 */
const FOLLOW_CHECK_RETRIES = 5;
const FOLLOW_CHECK_DELAY = 60_000;

export interface EngineOptions {
  now?: () => number;
  /** 클릭 추적 링크 기본 주소 (데모는 빈 문자열 = 상대 경로) */
  trackingBase: () => { base: string; track: boolean };
  /** 올린 이미지(/uploads/...)를 바깥에서 볼 수 있는 주소로 바꿀 때 쓰는 기본 주소 */
  assetBase?: () => string;
}

/** 보낸 메시지의 버튼 id → 링크 */
function collectLinks(a: Automation, kind: DeliveryKind): Record<string, string> {
  const m = kind === "nonFollower" ? a.dm.followGate.nonFollower : a.dm.main;
  if (kind === "gate" || kind === "reply") return {};
  const out: Record<string, string> = {};
  for (const b of [...m.buttons, ...m.cards.flatMap((c) => c.buttons)]) if (b.url) out[b.id] = b.url;
  return out;
}

/**
 * 자동 DM 엔진
 * - 댓글/공유/코드/버튼(postback)/읽음 이벤트를 받아 발송 대기열에 넣고
 * - 시간당 한도에 맞춰 순차적으로 보내요
 */
export class Engine {
  private ticking = false;
  private now: () => number;

  constructor(
    private store: Store,
    private gateway: () => Gateway,
    private opts: EngineOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  private get db() {
    return this.store.db;
  }

  /* ───────────── 조회 도우미 ───────────── */

  private isOwn(userId: string, username: string): boolean {
    const acc = this.db.account;
    if (!acc) return false;
    return (!!acc.igUserId && userId === acc.igUserId) || (!!acc.username && username === acc.username);
  }

  /** 지금 새 댓글에 반응하는 자동화인지 */
  private acceptsNewComments(a: Automation): boolean {
    if (!a.enabled) return false;
    if (a.sendMode === "immediate") return true;
    if (a.sendMode === "scheduled") {
      if (!a.schedule) return false;
      if (!a.schedule.firedAt) return true; // 예약 시각까지 모아 둬요
      return a.schedule.continueAfter;
    }
    return false; // 일괄 발송 중에는 새 댓글을 받지 않고, 끝나면 즉시 발송으로 바뀌어요
  }

  /** 공유·코드에 반응할 수 있는지 (예약은 발송 이후에만) */
  private acceptsDirectTriggers(a: Automation): boolean {
    if (!a.enabled) return false;
    if (a.sendMode === "scheduled") return !!a.schedule?.firedAt && a.schedule.continueAfter;
    if (a.sendMode === "batch") return false;
    return true;
  }

  /** 한 댓글에는 자동화 하나만: 키워드 자동화 우선, 없으면 모든 댓글 자동화 */
  pickAutomation(postId: string, text: string): Automation | null {
    const candidates = this.db.automations.filter((a) => a.postId === postId && this.acceptsNewComments(a));
    const keyword = candidates.find((a) => a.trigger.type === "keyword" && keywordHit(a.trigger, text));
    if (keyword) return keyword;
    return candidates.find((a) => a.trigger.type === "all") ?? null;
  }

  /** 이 자동화로 이미 DM을 받았거나 받을 예정인 사람인지 */
  alreadyReached(automationId: string, userId: string): boolean {
    return this.db.deliveries.some(
      (d) =>
        d.automationId === automationId &&
        d.userId === userId &&
        d.kind !== "reply" &&
        (d.status === "sent" || d.status === "queued" || d.status === "retrying"),
    );
  }

  /* ───────────── 다음 게시물 자동화 연결 ───────────── */

  private async bindNextPost(postId: string): Promise<void> {
    const pending = this.db.automations.filter((a) => a.nextPost && !a.postId);
    if (!pending.length) return;
    let post = this.db.posts.find((p) => p.id === postId);
    if (!post) {
      post = (await this.gateway().fetchPost(postId)) ?? undefined;
      if (post) this.db.posts.unshift(post);
    }
    if (!post) return;
    for (const a of pending) {
      // 자동화를 만든 뒤에 올라온 게시물에 첫 댓글이 달리면 연결
      if (post.timestamp < a.createdAt - 60_000) continue;
      // 그 게시물에 이미 자동화가 있으면 게시물 규칙(모든 댓글 1개·키워드 중복·발송 방식 1개)을 지켜야 연결해요
      const conflicts = findConflicts({ ...a, postId, nextPost: false }, this.db.automations);
      if (conflicts.length) continue;
      a.postId = postId;
      a.boundAt = this.now();
      a.updatedAt = this.now();
    }
  }

  /* ───────────── 이벤트 처리 ───────────── */

  /** 새 댓글 (웹훅 또는 시뮬레이터) */
  async handleComment(c: Comment): Promise<{ automationId?: string; skipped?: string }> {
    if (this.db.comments.some((x) => x.id === c.id)) return { skipped: "duplicate" };
    this.db.comments.push(c);
    const post = this.db.posts.find((p) => p.id === c.postId);
    if (post) post.commentsCount += 1;
    this.store.changed();

    if (c.parentId) return { skipped: "reply-comment" };
    if (this.isOwn(c.userId, c.username)) return { skipped: "own-comment" };
    if (post?.restricted) return { skipped: "restricted-post" };

    await this.bindNextPost(c.postId);
    const a = this.pickAutomation(c.postId, c.text);
    if (!a) {
      // 조건은 맞는데 꺼 둔 자동화만 있으면 "꺼져 있어요"라고 알려 줘요
      const off = this.db.automations.find(
        (x) => x.postId === c.postId && !x.enabled && (x.trigger.type === "all" || keywordHit(x.trigger, c.text)),
      );
      return off ? { automationId: off.id, skipped: "off" } : { skipped: "no-match" };
    }
    if (this.db.settings.dmPaused) return { automationId: a.id, skipped: "paused" };
    // 같은 사람에게는 한 번만 (이미 DM을 받았거나 보낼 예정이면 건너뛰어요)
    if (this.alreadyReached(a.id, c.userId)) return { automationId: a.id, skipped: "already-sent" };

    const scheduledHold = a.sendMode === "scheduled" && a.schedule && !a.schedule.firedAt;
    const notBefore = scheduledHold ? a.schedule!.at : this.now();
    this.enqueue(a, {
      kind: a.dm.followGate.enabled ? "gate" : "main",
      origin: scheduledHold ? "scheduled" : "comment",
      commentId: c.id,
      userId: c.userId,
      username: c.username,
      notBefore,
    });
    // 댓글 답글은 DM이 실제로 나간 뒤에 달아요 (sendItem → queueReply)
    this.store.changed();
    return { automationId: a.id };
  }

  /** 팔로우 확인 버튼 (postback) */
  /** 웹훅이 같은 이벤트를 다시 보내도 한 번만 처리해요 (메시지 id 기준) */
  private seenEvents = new Map<string, number>();
  private firstTime(eventId?: string): boolean {
    if (!eventId) return true;
    const now = this.now();
    if (this.seenEvents.has(eventId)) return false;
    this.seenEvents.set(eventId, now);
    if (this.seenEvents.size > 5000) {
      for (const [k, t] of this.seenEvents) if (now - t > DAY) this.seenEvents.delete(k);
    }
    return true;
  }

  private hasDelivery(automationId: string, userId: string, kind: DeliveryKind, statuses: DeliveryLog["status"][], since = 0) {
    return this.db.deliveries.some(
      (d) => d.automationId === automationId && d.userId === userId && d.kind === kind && statuses.includes(d.status) && d.createdAt >= since,
    );
  }

  /** 지금 팔로우 여부를 확인하고 있는 (자동화|사람) */
  private checking = new Set<string>();

  /** 팔로우 확인 버튼 (postback) */
  async handlePostback(
    userId: string,
    username: string,
    payload: string,
    eventId?: string,
  ): Promise<{ follower?: boolean; skipped?: string }> {
    if (!payload.startsWith(FOLLOW_CHECK_PREFIX)) return { skipped: "unknown-payload" };
    if (!this.firstTime(eventId)) return { skipped: "duplicate" };
    const a = this.db.automations.find((x) => x.id === payload.slice(FOLLOW_CHECK_PREFIX.length));
    if (!a) return { skipped: "automation-deleted" };
    if (this.db.settings.dmPaused) return { skipped: "paused" };
    // 이미 본 DM을 받았거나 보낼 예정이면 다시 보내지 않아요
    if (this.hasDelivery(a.id, userId, "main", ["sent", "queued", "retrying"])) return { follower: true, skipped: "already-sent" };
    if (this.db.pendingChecks.some((p) => p.automationId === a.id && p.userId === userId)) return { skipped: "checking" };
    // 버튼을 빠르게 두 번 눌러도 확인은 한 번만 (확인하는 동안 들어온 요청은 건너뛰어요)
    const key = `${a.id}|${userId}`;
    if (this.checking.has(key)) return { skipped: "checking" };
    this.checking.add(key);
    let follower: boolean | null;
    try {
      follower = await this.gateway().isFollower(userId);
    } finally {
      this.checking.delete(key);
    }
    if (this.hasDelivery(a.id, userId, "main", ["sent", "queued", "retrying"])) return { follower: true, skipped: "already-sent" };
    if (follower === null) {
      // 인스타그램 오류로 확인하지 못했어요 → 잠시 뒤 다시 확인 (비팔로워로 넘겨짚지 않아요)
      this.db.pendingChecks.push({ automationId: a.id, userId, username, attempts: 1, notBefore: this.now() + FOLLOW_CHECK_DELAY });
      this.store.changed();
      return { skipped: "checking" };
    }
    if (!follower && this.hasDelivery(a.id, userId, "nonFollower", ["sent", "queued", "retrying"], this.now() - RECHECK_COOLDOWN))
      return { follower: false, skipped: "cooldown" };
    this.enqueueFollowResult(a, userId, username, follower);
    await this.tick();
    return { follower };
  }

  private enqueueFollowResult(a: Automation, userId: string, username: string, follower: boolean): void {
    this.enqueue(a, {
      kind: follower ? "main" : "nonFollower",
      origin: "postback",
      userId,
      username,
      notBefore: this.now(),
      priority: true,
    });
    this.store.changed();
  }

  /** 팔로우 여부를 다시 확인 (tick마다) */
  private async retryFollowChecks(): Promise<void> {
    const due = this.db.pendingChecks.filter((p) => p.notBefore <= this.now());
    for (const p of due) {
      const a = this.db.automations.find((x) => x.id === p.automationId);
      const key = `${p.automationId}|${p.userId}`;
      if (a && this.checking.has(key)) continue;
      this.db.pendingChecks = this.db.pendingChecks.filter((x) => x !== p);
      if (!a) continue;
      this.checking.add(key);
      let follower: boolean | null;
      try {
        follower = await this.gateway().isFollower(p.userId);
      } finally {
        this.checking.delete(key);
      }
      if (this.hasDelivery(a.id, p.userId, "main", ["sent", "queued", "retrying"])) continue;
      if (follower !== null) {
        this.enqueueFollowResult(a, p.userId, p.username, follower);
        continue;
      }
      if (p.attempts + 1 >= FOLLOW_CHECK_RETRIES) {
        this.db.deliveries.push({
          id: uid("dl"),
          automationId: a.id,
          postId: a.postId,
          userId: p.userId,
          username: p.username,
          kind: "main",
          origin: "postback",
          status: "failed",
          error: "팔로우 여부를 확인하지 못했어요 (인스타그램 오류). 팬이 버튼을 다시 누르면 다시 확인해요",
          createdAt: this.now(),
        });
      } else {
        this.db.pendingChecks.push({ ...p, attempts: p.attempts + 1, notBefore: this.now() + FOLLOW_CHECK_DELAY * (p.attempts + 1) });
      }
      this.store.changed();
    }
  }

  /** 팬이 보낸 DM — 게시물 공유 또는 4자리 코드 */
  async handleMessage(
    userId: string,
    username: string,
    msg: { text?: string; sharedPostId?: string; sharedUrl?: string },
    eventId?: string,
  ): Promise<{ automationId?: string; skipped?: string }> {
    if (this.isOwn(userId, username)) return { skipped: "own" };
    if (!this.firstTime(eventId)) return { skipped: "duplicate" };
    let a: Automation | undefined;
    let origin: DeliveryOrigin = "code";
    if (msg.sharedPostId || msg.sharedUrl) {
      const norm = (u: string) => u.split(/[?#]/)[0].replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
      const postId =
        msg.sharedPostId ?? this.db.posts.find((p) => p.permalink && msg.sharedUrl && norm(msg.sharedUrl) === norm(p.permalink))?.id;
      if (postId) {
        a = this.db.automations.find(
          (x) => x.postId === postId && x.extras.shareReply && this.acceptsDirectTriggers(x),
        );
        origin = "share";
      }
    }
    const text = msg.text?.trim() ?? "";
    if (!a && isCodeFormat(text)) {
      const code = normalizeCode(text);
      a = this.db.automations.find(
        (x) => x.extras.codeReply && !x.codeRetired && normalizeCode(x.code) === code && this.acceptsDirectTriggers(x),
      );
      origin = "code";
    }
    if (!a) return { skipped: "no-match" };
    if (this.db.settings.dmPaused) return { automationId: a.id, skipped: "paused" };
    this.enqueue(a, {
      kind: a.dm.followGate.enabled ? "gate" : "main",
      origin,
      userId,
      username,
      notBefore: this.now(),
      priority: true,
    });
    this.store.changed();
    return { automationId: a.id };
  }

  /** 읽음 처리 (messaging_seen) — 그 사용자에게 보낸 DM을 읽음으로 */
  handleRead(userId: string, at = this.now()): void {
    let n = 0;
    for (const d of this.db.deliveries) {
      if (d.userId === userId && d.kind !== "reply" && d.status === "sent" && !d.readAt && (d.sentAt ?? 0) <= at) {
        d.readAt = at;
        n++;
      }
    }
    if (n) this.store.changed();
  }

  /** 버튼 클릭 기록 후 원래 링크 반환 */
  recordClick(deliveryId: string, buttonId: string): string | null {
    const d = this.db.deliveries.find((x) => x.id === deliveryId);
    if (!d) return null;
    // 보낼 때 기록해 둔 링크가 우선 (자동화를 지우거나 고쳐도 동작)
    const a = this.db.automations.find((x) => x.id === d.automationId);
    const url = d.links?.[buttonId] ?? (a ? findButton(a, buttonId)?.url : undefined);
    if (!url) return null;
    this.db.clicks.push({
      id: uid("clk"),
      automationId: d.automationId,
      deliveryId,
      buttonId,
      url,
      userId: d.userId,
      createdAt: this.now(),
    });
    if (!d.readAt) d.readAt = this.now();
    this.store.changed();
    return url;
  }

  /* ───────────── 일괄 발송 ───────────── */

  /** 최근 7일 댓글 중 아직 DM을 받지 않은 댓글에 한 번에 보내요 */
  async startBatch(a: Automation): Promise<number> {
    if (!a.postId) return 0;
    const since = this.now() - LIMITS.batchLookbackDays * DAY;
    let comments: Comment[];
    try {
      comments = await this.gateway().fetchComments(a.postId, since);
    } catch {
      comments = this.db.comments.filter((c) => c.postId === a.postId && c.createdAt >= since);
    }
    // 댓글을 불러오는 동안 멈췄으면 보내지 않아요
    if (a.batch?.stopped) return 0;
    // 웹훅으로 이미 받은 댓글과 합쳐요
    for (const c of comments) if (!this.db.comments.some((x) => x.id === c.id)) this.db.comments.push(c);
    const reached = this.db.deliveries.filter(
      (d) =>
        d.postId === a.postId &&
        d.kind !== "reply" &&
        (d.status === "sent" || d.status === "queued" || d.status === "retrying"),
    );
    // 이미 DM을 받은(또는 받을) 댓글과 사람은 빼요 — 취소·실패한 발송은 받은 걸로 치지 않아요
    const already = new Set(reached.filter((d) => d.commentId).map((d) => d.commentId!));
    const seenUsers = new Set<string>(reached.map((d) => d.userId));
    const targets = [...comments]
      .sort((x, y) => x.createdAt - y.createdAt)
      .filter((c) => {
        if (c.parentId || this.isOwn(c.userId, c.username) || already.has(c.id)) return false;
        if (!keywordHit(a.trigger, c.text)) return false;
        // 같은 게시물의 다른 키워드 자동화가 맡을 댓글은 제외
        if (this.pickBatchOwner(a, c.text) !== a.id) return false;
        // 같은 사람에게는 한 번만
        if (seenUsers.has(c.userId) || this.alreadyReached(a.id, c.userId)) return false;
        seenUsers.add(c.userId);
        return true;
      });
    for (const c of targets) {
      this.enqueue(a, {
        kind: a.dm.followGate.enabled ? "gate" : "main",
        origin: "batch",
        commentId: c.id,
        userId: c.userId,
        username: c.username,
        notBefore: this.now(),
      });
    }
    // 다시 이어서 불러온 경우까지 포함해 이 자동화의 일괄 발송 전체 수
    const total = this.db.deliveries.filter((d) => d.automationId === a.id && d.origin === "batch").length;
    a.batch = { startedAt: a.batch?.startedAt ?? this.now(), total };
    this.store.changed();
    return targets.length;
  }

  private pickBatchOwner(a: Automation, text: string): string | null {
    if (a.trigger.type === "keyword") return a.id;
    const others = this.db.automations.filter(
      (x) => x.id !== a.id && x.postId === a.postId && x.trigger.type === "keyword" && keywordHit(x.trigger, text),
    );
    return others.length ? others[0].id : a.id;
  }

  /* ───────────── 대기열 ───────────── */

  /** 답글 고르기 — 같은 게시물에서 최근에 단 답글과 겹치지 않게 (자동화가 여러 개여도 게시물 기준) */
  private nextReply(a: Automation): string {
    const r = a.extras.commentReply;
    const pool = [...new Set(replyPool(r.tone, r.count, r.custom, { gated: a.dm.followGate.enabled }))];
    if (!pool.length) return "DM 보냈어요!";
    const key = a.postId ?? a.id;
    const recent = this.db.recentReplies[key] ?? [];
    const avoid = new Set(recent.slice(-Math.max(0, Math.min(3, pool.length - 1))));
    const candidates = pool.filter((t) => !avoid.has(t));
    const from = candidates.length ? candidates : pool;
    const text = from[Math.floor(Math.random() * from.length)];
    this.db.recentReplies[key] = [...recent, text].slice(-5);
    return text;
  }

  /** 댓글로 시작한 첫 DM(확인 DM 또는 본 DM)이 나간 뒤에 그 댓글에 답글을 달아요 */
  private queueReply(a: Automation, item: QueueItem): void {
    if (!item.commentId || item.origin !== "comment" || (item.kind !== "gate" && item.kind !== "main")) return;
    if (!a.extras.commentReply.enabled || a.sendMode !== "immediate" || this.db.settings.replyPaused) return;
    if (this.db.deliveries.some((d) => d.kind === "reply" && d.commentId === item.commentId)) return;
    this.enqueue(a, {
      kind: "reply",
      origin: "comment",
      commentId: item.commentId,
      userId: item.userId,
      username: item.username,
      notBefore: this.now(),
    });
  }

  /** 대기열에서 빼고 기록은 "건너뜀"으로 남겨요 */
  private skipItem(item: QueueItem, reason: string): void {
    this.db.queue = this.db.queue.filter((q) => q.id !== item.id);
    const log = this.db.deliveries.find((d) => d.id === item.deliveryId);
    if (log) {
      log.status = "skipped";
      log.error = reason;
    }
    this.store.changed();
  }

  private lastReplyAt(): number {
    let t = 0;
    for (const d of this.db.deliveries) if (d.kind === "reply" && d.status === "sent" && (d.sentAt ?? 0) > t) t = d.sentAt!;
    return t;
  }

  private enqueue(
    a: Automation,
    p: {
      kind: DeliveryKind;
      origin: DeliveryOrigin;
      commentId?: string;
      userId: string;
      username: string;
      notBefore: number;
      replyText?: string;
      priority?: boolean;
    },
  ): DeliveryLog {
    const log: DeliveryLog = {
      id: uid("dl"),
      automationId: a.id,
      postId: a.postId,
      commentId: p.commentId,
      userId: p.userId,
      username: p.username,
      kind: p.kind,
      origin: p.origin,
      status: "queued",
      createdAt: this.now(),
    };
    this.db.deliveries.push(log);
    const item: QueueItem = {
      id: uid("q"),
      automationId: a.id,
      deliveryId: log.id,
      kind: p.kind,
      origin: p.origin,
      postId: a.postId,
      commentId: p.commentId,
      userId: p.userId,
      username: p.username,
      replyText: p.replyText,
      notBefore: p.priority ? 0 : p.notBefore,
      attempts: 0,
      createdAt: this.now(),
    };
    if (p.priority) this.db.queue.unshift(item);
    else this.db.queue.push(item);
    return log;
  }

  /** 예약 시각을 바꾸면 모아 둔 발송도 함께 옮겨요 */
  reschedule(a: Automation): void {
    if (a.sendMode !== "scheduled" || !a.schedule || a.schedule.firedAt) return;
    for (const q of this.db.queue) if (q.automationId === a.id && q.origin === "scheduled") q.notBefore = a.schedule.at;
    this.store.changed();
  }

  /** 자동화 삭제 시 대기 중인 발송 취소 (이미 보낸 기록은 남겨요) */
  cancelQueued(automationId: string): void {
    const ids = new Set(this.db.queue.filter((q) => q.automationId === automationId).map((q) => q.deliveryId));
    this.db.queue = this.db.queue.filter((q) => q.automationId !== automationId);
    for (const d of this.db.deliveries) if (ids.has(d.id)) d.status = "skipped";
  }

  queuedCount(automationId?: string): number {
    return this.db.queue.filter((q) => !automationId || q.automationId === automationId).length;
  }

  private sentInLastHour(kind: "dm" | "reply"): number {
    const since = this.now() - HOUR;
    return this.db.deliveries.filter(
      (d) => d.status === "sent" && (d.sentAt ?? 0) >= since && (kind === "reply" ? d.kind === "reply" : d.kind !== "reply"),
    ).length;
  }

  /** 1초마다: 예약 발송 처리 → 대기열 발송 → 일괄 발송 완료 확인 */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.fireSchedules();
      await this.retryFollowChecks();
      await this.drainQueue();
      this.finishBatches();
    } finally {
      this.ticking = false;
    }
  }

  private fireSchedules(): void {
    for (const a of this.db.automations) {
      if (a.sendMode === "scheduled" && a.schedule && !a.schedule.firedAt && a.schedule.at <= this.now()) {
        a.schedule.firedAt = this.now();
        a.updatedAt = this.now();
        this.store.changed();
      }
    }
  }

  /** 서버가 꺼졌다 켜져도 끝나지 않은 일괄 발송을 이어서 해요 */
  async resumeBatches(): Promise<void> {
    for (const a of this.db.automations) {
      if (a.sendMode === "batch" && (!a.batch || a.batch.fetching)) {
        if (!a.batch) a.batch = { startedAt: this.now(), total: 0, fetching: true };
        await this.startBatch(a).catch(() => {});
      }
    }
  }

  private finishBatches(): void {
    for (const a of this.db.automations) {
      if (a.sendMode === "batch" && a.batch && !a.batch.fetching && !a.batch.finishedAt && this.queuedCount(a.id) === 0) {
        a.batch.finishedAt = this.now();
        a.sendMode = "immediate"; // 다 보내면 즉시 발송 자동화로 바뀌어요
        a.updatedAt = this.now();
        this.store.changed();
      }
    }
  }

  private async drainQueue(): Promise<void> {
    const limit = this.db.settings.rateLimitPerHour;
    let dmBudget = Math.max(0, limit - this.sentInLastHour("dm"));
    let replyBudget = Math.max(0, REPLY_LIMIT_PER_HOUR - this.sentInLastHour("reply"));
    const now = this.now();
    // 답글은 간격을 두고 한 틱에 하나씩만
    let replyAllowed = now - this.lastReplyAt() >= REPLY_MIN_GAP;
    const paused = this.db.settings.dmPaused;
    // 한 번에 너무 몰리지 않게 틱마다 최대 20건
    let perTick = 20;
    for (const item of [...this.db.queue]) {
      if (perTick <= 0) break;
      if (item.notBefore > now) continue;
      const isReply = item.kind === "reply";
      const owner = this.db.automations.find((x) => x.id === item.automationId);
      if (isReply) {
        // 답글을 끈 뒤에는 밀려 있던 답글도 달지 않아요
        if (this.db.settings.replyPaused) {
          this.skipItem(item, "설정에서 댓글 자동 답글을 멈춰서 달지 않았어요");
          continue;
        }
        if (!owner || !owner.extras.commentReply.enabled) {
          this.skipItem(item, "자동화에서 댓글 답글을 꺼서 달지 않았어요");
          continue;
        }
        if (now - item.createdAt > REPLY_MAX_AGE) {
          this.skipItem(item, "오래 밀린 답글이라 달지 않았어요");
          continue;
        }
      }
      // 일시 중지 중에는 이미 시작한 일괄 발송만 계속 보내요
      if (paused && item.origin !== "batch") continue;
      // 꺼 둔 자동화는 다시 켤 때까지 보내지 않아요 (팔로우 확인 응답·일괄 발송은 이어서 보내요)
      if (owner && !owner.enabled && item.origin !== "postback" && item.origin !== "batch") continue;
      if (isReply ? replyBudget <= 0 || !replyAllowed : dmBudget <= 0) continue;
      perTick--;
      if (isReply) {
        replyBudget--;
        replyAllowed = false;
      } else dmBudget--;
      await this.sendItem(item);
    }
  }

  private async sendItem(item: QueueItem): Promise<void> {
    const db = this.db;
    const log = db.deliveries.find((d) => d.id === item.deliveryId);
    const a = db.automations.find((x) => x.id === item.automationId);
    const removeItem = () => {
      db.queue = db.queue.filter((q) => q.id !== item.id);
    };
    if (!log || !a) {
      removeItem();
      if (log) log.status = "skipped";
      this.store.changed();
      return;
    }
    const gw = this.gateway();
    const { base, track } = this.opts.trackingBase();
    const link = makeLinkBuilder(base, track, this.opts.assetBase?.() ?? base);
    let msg: OutgoingMessage | null = null;
    if (item.kind === "gate" || (item.kind === "main" && !a.dm.followGate.enabled)) msg = buildFirstMessage(a, log.id, link);
    else if (item.kind === "main") msg = buildFollowerMessage(a, log.id, link);
    else if (item.kind === "nonFollower") msg = buildNonFollowerMessage(a, log.id, link);

    if (msg) log.links = collectLinks(a, item.kind);
    const ctx = { deliveryId: log.id, userId: item.userId, username: item.username };
    let result;
    try {
      if (item.kind === "reply") {
        if (!item.replyText) item.replyText = this.nextReply(a);
        result = await gw.replyToComment(item.commentId!, item.replyText);
      }
      else if (item.commentId && (item.kind === "gate" || item.kind === "main") && item.origin !== "postback")
        result = await gw.sendPrivateReply(item.commentId, msg!, ctx);
      else result = await gw.sendDirect(item.userId, msg!, ctx);
    } catch (e) {
      result = { ok: false as const, error: `발송 오류: ${(e as Error).message}`, retryable: true };
    }

    if (result.ok) {
      log.status = "sent";
      log.sentAt = this.now();
      log.messageId = result.messageId;
      log.error = undefined;
      removeItem();
      this.queueReply(a, item);
    } else {
      item.attempts += 1;
      log.error = result.error;
      if (result.recipient) log.recipientIssue = true;
      if (result.authError && db.account) db.account.needsReauth = true;
      if (result.retryable && item.attempts < MAX_ATTEMPTS) {
        log.status = "retrying";
        item.notBefore = this.now() + Math.min(60_000 * 2 ** item.attempts, 30 * 60_000);
      } else {
        log.status = "failed";
        removeItem();
      }
    }
    this.store.changed();
  }
}
