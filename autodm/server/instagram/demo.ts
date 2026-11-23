import { uid } from "../../shared/factory";
import { DAY, HOUR } from "../../shared/limits";
import type { Comment, DemoFan, DemoInboxMessage, Post } from "../../shared/types";
import type { Store } from "../store";
import type { Gateway, IGProfile, OutgoingMessage, SendContext, SendResult } from "./gateway";

export const DEMO_PROFILE: IGProfile = {
  igUserId: "demo_me",
  username: "my_studio",
  name: "마이 스튜디오",
  followersCount: 12840,
};

/** 데모 모드: 인스타그램 대신 앱 안의 가상 계정·팬·DM함으로 동작 */
export class DemoGateway implements Gateway {
  mode = "demo" as const;
  constructor(private store: Store) {}

  private fan(userId: string): DemoFan | undefined {
    return this.store.db.demo.fans.find((f) => f.id === userId);
  }

  private deliver(fanId: string, msg: OutgoingMessage, ctx: SendContext): SendResult {
    const fan = this.fan(fanId);
    if (!fan) return { ok: false, error: "수신자를 찾을 수 없어요", retryable: false };
    if (fan.restricted) return { ok: false, error: "수신자가 메시지를 받을 수 없는 상태예요", retryable: false };
    const m: DemoInboxMessage = {
      id: uid("dm"),
      fanId,
      from: "business",
      createdAt: Date.now(),
      deliveryId: ctx.deliveryId,
    };
    if (msg.kind === "text") m.text = msg.text;
    if (msg.kind === "buttons") {
      m.text = msg.text;
      m.buttons = msg.buttons.map((b) => ({ type: b.type, title: b.title, url: b.url, payload: b.payload }));
    }
    if (msg.kind === "carousel") {
      m.cards = msg.cards.map((c) => ({
        title: c.title,
        subtitle: c.subtitle,
        imageUrl: c.imageUrl,
        buttons: c.buttons.map((b) => ({ type: "web_url" as const, title: b.title, url: b.url ?? "" })),
      }));
    }
    this.store.db.demo.inbox.push(m);
    return { ok: true, messageId: m.id };
  }

  async sendPrivateReply(commentId: string, msg: OutgoingMessage, ctx: SendContext): Promise<SendResult> {
    const c = this.store.db.comments.find((x) => x.id === commentId);
    if (!c) return { ok: false, error: "댓글을 찾을 수 없어요", retryable: false };
    if (Date.now() - c.createdAt > 7 * DAY) return { ok: false, error: "7일이 지난 댓글에는 보낼 수 없어요", retryable: false };
    return this.deliver(c.userId, msg, ctx);
  }

  async sendDirect(userId: string, msg: OutgoingMessage, ctx: SendContext): Promise<SendResult> {
    return this.deliver(userId, msg, ctx);
  }

  async replyToComment(commentId: string, text: string): Promise<SendResult> {
    this.store.db.demo.replies.push({ commentId, text, createdAt: Date.now() });
    return { ok: true };
  }

  async isFollower(userId: string): Promise<boolean | null> {
    return this.fan(userId)?.following ?? false;
  }

  async fetchProfile(): Promise<IGProfile> {
    return DEMO_PROFILE;
  }

  async fetchPosts(): Promise<Post[]> {
    return this.store.db.posts;
  }

  async fetchPost(postId: string): Promise<Post | null> {
    return this.store.db.posts.find((p) => p.id === postId) ?? null;
  }

  async fetchComments(postId: string, sinceMs: number): Promise<Comment[]> {
    return this.store.db.comments.filter((c) => c.postId === postId && c.createdAt >= sinceMs);
  }
}

/* ───────────── 데모 데이터 ───────────── */

const FAN_NAMES = [
  "daily_mina", "jun.hobby", "soyeon_cook", "travel_hj", "coffee.lover_k", "yuna.style",
  "dev_minsu", "plant.mom.ji", "run_with_tae", "book_hae", "camping_dong", "seoul.eats",
];

const POST_SPECS: { emoji: string; caption: string; type: Post["mediaType"]; hoursAgo: number; restricted?: boolean }[] = [
  { emoji: "🧴", caption: "요즘 매일 쓰는 수분 크림 리뷰 💧 댓글에 '링크' 남겨 주시면 DM으로 보내드려요!", type: "REELS", hoursAgo: 5 },
  { emoji: "👜", caption: "가을 데일리백 공구 오픈 예정 👜 '공구' 댓글 남기면 오픈 알림 드려요", type: "CAROUSEL_ALBUM", hoursAgo: 30 },
  { emoji: "☕", caption: "홈카페 레시피 모음 ☕ '자료' 댓글 주시면 PDF 보내드려요 (팔로워 전용)", type: "IMAGE", hoursAgo: 52 },
  { emoji: "🧢", caption: "볼캡 코디 5가지 🧢", type: "REELS", hoursAgo: 80 },
  { emoji: "🍯", caption: "꿀 선물세트 이벤트 🎁 댓글로 응모하세요!", type: "IMAGE", hoursAgo: 120 },
  { emoji: "🧺", caption: "피크닉 준비물 체크리스트 🧺", type: "CAROUSEL_ALBUM", hoursAgo: 200, restricted: false },
];

const SAMPLE_COMMENTS = [
  "링크 주세요!", "정보 부탁드려요", "공구 언제 해요?", "자료 받고 싶어요", "응모합니다 🙋", "가격 궁금해요",
  "와 너무 예뻐요", "구매 링크 부탁해요", "저도 링크요!", "이벤트 참여해요", "공구 알림 신청", "자료 주세요",
];

export function seedDemo(store: Store): void {
  const db = store.db;
  const now = Date.now();
  db.demo = {
    fans: FAN_NAMES.map((username, i) => ({
      id: `fan_${i + 1}`,
      username,
      following: i % 3 !== 0, // 3명 중 1명은 비팔로워
      restricted: username === "camping_dong",
    })),
    inbox: [],
    replies: [],
  };
  db.posts = POST_SPECS.map((p, i) => ({
    id: `post_${i + 1}`,
    caption: p.caption,
    mediaType: p.type,
    emoji: p.emoji,
    permalink: `https://instagram.com/p/demo${i + 1}`,
    timestamp: now - p.hoursAgo * HOUR,
    commentsCount: 0,
    restricted: p.restricted,
  }));
  // 지난 댓글 (일괄 발송·추첨 체험용)
  db.comments = [];
  db.posts.forEach((post, pi) => {
    const n = 4 + ((pi * 3) % 6);
    for (let k = 0; k < n; k++) {
      const fan = db.demo.fans[(pi * 5 + k) % db.demo.fans.length];
      const age = Math.min(post.timestamp + (k + 1) * HOUR, now - 10 * 60 * 1000);
      db.comments.push({
        id: `c_${post.id}_${k}`,
        postId: post.id,
        userId: fan.id,
        username: fan.username,
        text: SAMPLE_COMMENTS[(pi + k) % SAMPLE_COMMENTS.length],
        createdAt: age,
      });
    }
    post.commentsCount = n;
  });
  store.changed();
}

export function randomSampleComment(): string {
  return SAMPLE_COMMENTS[Math.floor(Math.random() * SAMPLE_COMMENTS.length)];
}
