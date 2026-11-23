import { uid } from "../../shared/factory";
import { DAY, HOUR, LIMITS } from "../../shared/limits";
import { replyPool } from "../../shared/presets";
import type { Automation, Comment, DeliveryKind, DeliveryLog, DeliveryOrigin } from "../../shared/types";
import { keywordHit } from "../../shared/validation";
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
const REPLY_LIMIT_PER_HOUR = 60;

export interface EngineOptions {
  now?: () => number;
  /** 클릭 추적 링크 기본 주소 (데모는 빈 문자열 = 상대 경로) */
  trackingBase: () => { base: string; track: boolean };
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
      if (post.timestamp >= a.createdAt - 60_000) {
        a.postId = postId;
        a.boundAt = this.now();
        a.updatedAt = this.now();
      }
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
    if (!a) return { skipped: "no-match" };
    if (this.db.settings.dmPaused) return { automationId: a.id, skipped: "paused" };

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
    if (a.extras.commentReply.enabled && a.sendMode === "immediate" && !this.db.settings.replyPaused) {
      this.enqueue(a, {
        kind: "reply",
        origin: "comment",
        commentId: c.id,
        userId: c.userId,
        username: c.username,
        notBefore,
        replyText: this.nextReply(a),
      });
    }
    this.store.changed();
    return { automationId: a.id };
  }

  /** 팔로우 확인 버튼 (postback) */
  async handlePostback(userId: string, username: string, payload: string): Promise<{ follower?: boolean; skipped?: string }> {
    if (!payload.startsWith(FOLLOW_CHECK_PREFIX)) return { skipped: "unknown-payload" };
    const a = this.db.automations.find((x) => x.id === payload.slice(FOLLOW_CHECK_PREFIX.length));
    if (!a) return { skipped: "automation-deleted" };
    if (this.db.settings.dmPaused) return { skipped: "paused" };
    const follower = await this.gateway().isFollower(userId);
    this.enqueue(a, {
      kind: follower ? "main" : "nonFollower",
      origin: "postback",
      userId,
      username,
      notBefore: this.now(),
      priority: true,
    });
    this.store.changed();
    await this.tick();
    return { follower: !!follower };
  }

  /** 팬이 보낸 DM — 게시물 공유 또는 4자리 코드 */
  async handleMessage(
    userId: string,
    username: string,
    msg: { text?: string; sharedPostId?: string; sharedUrl?: string },
  ): Promise<{ automationId?: string; skipped?: string }> {
    if (this.isOwn(userId, username)) return { skipped: "own" };
    let a: Automation | undefined;
    let origin: DeliveryOrigin = "code";
    if (msg.sharedPostId || msg.sharedUrl) {
      const postId =
        msg.sharedPostId ??
        this.db.posts.find((p) => p.permalink && msg.sharedUrl && msg.sharedUrl.startsWith(p.permalink.replace(/\/$/, "")))?.id;
      if (postId) {
        a = this.db.automations.find(
          (x) => x.postId === postId && x.extras.shareReply && this.acceptsDirectTriggers(x),
        );
        origin = "share";
      }
    }
    const text = msg.text?.trim() ?? "";
    if (!a && new RegExp(`^\\d{${LIMITS.codeLength}}$`).test(text)) {
      a = this.db.automations.find(
        (x) => x.extras.codeReply && !x.codeRetired && x.code === text && this.acceptsDirectTriggers(x),
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
    const a = d ? this.db.automations.find((x) => x.id === d.automationId) : undefined;
    const button = a ? findButton(a, buttonId) : undefined;
    if (!d || !button) return button?.url ?? null;
    this.db.clicks.push({
      id: uid("clk"),
      automationId: d.automationId,
      deliveryId,
      buttonId,
      url: button.url,
      userId: d.userId,
      createdAt: this.now(),
    });
    if (!d.readAt) d.readAt = this.now();
    this.store.changed();
    return button.url;
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
    // 웹훅으로 이미 받은 댓글과 합쳐요
    for (const c of comments) if (!this.db.comments.some((x) => x.id === c.id)) this.db.comments.push(c);
    const already = new Set(
      this.db.deliveries
        .filter((d) => d.postId === a.postId && d.commentId && (d.kind === "gate" || d.kind === "main") && d.status !== "failed")
        .map((d) => d.commentId!),
    );
    const targets = comments.filter(
      (c) =>
        !c.parentId &&
        !this.isOwn(c.userId, c.username) &&
        !already.has(c.id) &&
        keywordHit(a.trigger, c.text) &&
        // 같은 게시물의 다른 키워드 자동화가 맡을 댓글은 제외
        this.pickBatchOwner(a, c.text) === a.id,
    );
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
    a.batch = { startedAt: this.now(), total: targets.length };
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

  private nextReply(a: Automation): string {
    const r = a.extras.commentReply;
    const pool = replyPool(r.tone, r.count, r.custom);
    if (!pool.length) return "DM 보냈어요!";
    const last = this.db.replyCursor[a.id] ?? -1;
    let idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === last) idx = (idx + 1) % pool.length;
    this.db.replyCursor[a.id] = idx;
    return pool[idx];
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

  private finishBatches(): void {
    for (const a of this.db.automations) {
      if (a.sendMode === "batch" && a.batch && !a.batch.finishedAt && this.queuedCount(a.id) === 0) {
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
    const paused = this.db.settings.dmPaused;
    // 한 번에 너무 몰리지 않게 틱마다 최대 20건
    let perTick = 20;
    for (const item of [...this.db.queue]) {
      if (perTick <= 0) break;
      if (item.notBefore > now) continue;
      const isReply = item.kind === "reply";
      // 일시 중지 중에는 이미 시작한 일괄 발송만 계속 보내요
      if (paused && item.origin !== "batch") continue;
      if (isReply && this.db.settings.replyPaused) continue;
      if (isReply ? replyBudget <= 0 : dmBudget <= 0) continue;
      perTick--;
      if (isReply) replyBudget--;
      else dmBudget--;
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
    const link = makeLinkBuilder(base, track);
    let msg: OutgoingMessage | null = null;
    if (item.kind === "gate" || (item.kind === "main" && !a.dm.followGate.enabled)) msg = buildFirstMessage(a, log.id, link);
    else if (item.kind === "main") msg = buildFollowerMessage(a, log.id, link);
    else if (item.kind === "nonFollower") msg = buildNonFollowerMessage(a, log.id, link);

    const ctx = { deliveryId: log.id, userId: item.userId, username: item.username };
    let result;
    try {
      if (item.kind === "reply") result = await gw.replyToComment(item.commentId!, item.replyText ?? "DM 보냈어요!");
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
    } else {
      item.attempts += 1;
      log.error = result.error;
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
