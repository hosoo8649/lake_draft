// 서버와 웹이 함께 쓰는 데이터 모델

export type Id = string;

/* ───────────── 계정 ───────────── */

export type AppMode = "demo" | "live";

export interface AccountPublic {
  connected: boolean;
  mode: AppMode;
  igUserId?: string;
  username?: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  connectedAt?: number;
  tokenExpiresAt?: number;
  /** 연결이 만료됐거나 권한 오류로 재연동이 필요한 상태 */
  needsReauth?: boolean;
}

/* ───────────── 게시물 / 댓글 ───────────── */

export type MediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";

export interface Post {
  id: Id;
  caption: string;
  mediaType: MediaType;
  thumbnailUrl?: string;
  /** 데모 게시물 썸네일용 이모지 */
  emoji?: string;
  permalink?: string;
  timestamp: number;
  commentsCount: number;
  /** 연령 제한 등으로 외부 서비스에서 댓글 이벤트를 받을 수 없는 게시물 */
  restricted?: boolean;
}

export interface Comment {
  id: Id;
  postId: Id;
  userId: Id;
  username: string;
  text: string;
  createdAt: number;
  parentId?: Id;
}

/* ───────────── DM 메시지 ───────────── */

export interface DMButton {
  id: Id;
  title: string;
  url: string;
  /** 내 링크에서 고른 경우 */
  linkId?: Id;
}

export interface CarouselCard {
  id: Id;
  imageUrl: string;
  title: string;
  subtitle: string;
  buttons: DMButton[];
}

export type DMFormat = "text" | "carousel";

export interface DMMessage {
  format: DMFormat;
  text: string;
  buttons: DMButton[];
  cards: CarouselCard[];
  /**
   * 같은 뜻의 다른 문구 (팬마다 하나씩 골라 보내요 — 똑같은 문구 반복을 줄여 스팸 위험을 낮춰요).
   * 비어 있으면 text만 써요. {이름} 자리에는 팬 아이디가 들어가요.
   */
  variants?: string[];
}

export interface FollowGate {
  enabled: boolean;
  /** 팔로우 확인 DM 문구 (댓글 단 팬 전원이 가장 먼저 받는 DM) */
  gateText: string;
  /** 팔로우 확인 버튼 이름 (이름만 바꿀 수 있음) */
  gateButtonTitle: string;
  /** 비팔로워 DM. 다시 확인 버튼이 자동으로 붙어요 */
  nonFollower: DMMessage;
}

export interface DMContent {
  /** 팔로우 확인을 끈 경우 유일한 DM, 켠 경우 팔로워 DM */
  main: DMMessage;
  followGate: FollowGate;
}

/* ───────────── 추가 기능 ───────────── */

export type ReplyTone = "polite" | "friendly" | "custom";

export interface CommentReplySetting {
  enabled: boolean;
  /** 정중하게/친근하게 프리셋에서 돌려 쓸 답글 개수 */
  count: 10 | 20 | 30;
  tone: ReplyTone;
  /** 내 답글 (3~30개) */
  custom: string[];
}

export interface Extras {
  commentReply: CommentReplySetting;
  /** 팬이 게시물을 DM으로 공유하면 같은 DM 보내기 */
  shareReply: boolean;
  /** 팬이 4자리 코드를 DM으로 보내면 같은 DM 보내기 */
  codeReply: boolean;
}

/* ───────────── 자동화 ───────────── */

export type TriggerType = "all" | "keyword";

export interface Trigger {
  type: TriggerType;
  keywords: string[];
}

export type SendMode = "immediate" | "scheduled" | "batch";

export interface ScheduleInfo {
  at: number;
  /** 보낸 뒤 새 댓글에도 바로 보내기 */
  continueAfter: boolean;
  firedAt?: number;
}

export interface BatchInfo {
  startedAt: number;
  finishedAt?: number;
  total: number;
  /** 지난 댓글을 불러오는 중 (아직 대기열에 넣기 전) */
  fetching?: boolean;
  /** 보내는 도중에 멈춤 */
  stopped?: boolean;
}

export interface Automation {
  id: Id;
  title?: string;
  createdAt: number;
  updatedAt: number;
  /** 다음 게시물 자동화가 아직 연결되지 않았다면 null */
  postId: Id | null;
  nextPost: boolean;
  boundAt?: number;
  trigger: Trigger;
  dm: DMContent;
  extras: Extras;
  /** DM 코드 (자동화마다 새로 생성) */
  code: string;
  /** 꺼 둔 코드는 다시 쓸 수 없어요 */
  codeRetired?: boolean;
  sendMode: SendMode;
  /** 일괄 발송이 끝나 즉시 발송으로 바뀐 경우 원래 방식 */
  origin: SendMode;
  schedule?: ScheduleInfo;
  batch?: BatchInfo;
  enabled: boolean;
  templateId?: Id;
}

export type AutomationStatus =
  | "running" // 운영 중
  | "off" // 꺼짐
  | "paused" // 일시 중지 (설정에서 전체 중지)
  | "scheduled" // 예약됨
  | "sending" // 보내는 중 (일괄)
  | "sent" // 보냈어요 (예약 발송 완료, 이후 새 댓글 발송 안 함)
  | "waiting"; // 다음 게시물 대기

export type HealthState = "ok" | "blocked" | "failed" | "retrying";

export interface AutomationHealth {
  state: HealthState;
  failedCount: number;
  reasons: string[];
}

export interface AutomationStats {
  sent: number;
  read: number;
  clicks: number;
  /** 보낼 차례가 됐지만 한도 때문에 대기 중인 발송 수 (순차 발송중) */
  queued: number;
  /** 예약 시각까지 모아 둔 발송 수 */
  held: number;
}

export interface AutomationView extends Automation {
  status: AutomationStatus;
  stats: AutomationStats;
  health: AutomationHealth;
  post?: Post;
}

/* ───────────── 발송 기록 ───────────── */

export type DeliveryKind = "gate" | "main" | "nonFollower" | "reply" | "broadcast";
export type DeliveryOrigin = "comment" | "share" | "code" | "postback" | "batch" | "scheduled" | "broadcast";
export type DeliveryStatus = "queued" | "sent" | "failed" | "retrying" | "skipped";

export interface DeliveryLog {
  id: Id;
  automationId: Id;
  postId: Id | null;
  commentId?: Id;
  userId: Id;
  username: string;
  kind: DeliveryKind;
  origin: DeliveryOrigin;
  status: DeliveryStatus;
  error?: string;
  createdAt: number;
  sentAt?: number;
  readAt?: number;
  messageId?: string;
  /** 보낼 때의 버튼 링크 (자동화를 지우거나 고쳐도 클릭이 동작하도록) */
  links?: Record<string, string>;
  /** 받는 사람 쪽 사정으로 실패 (DM 차단·탈퇴 등) — 자동화 경고에는 넣지 않아요 */
  recipientIssue?: boolean;
}

export interface ClickLog {
  id: Id;
  automationId: Id;
  deliveryId?: Id;
  buttonId?: Id;
  url: string;
  userId?: Id;
  createdAt: number;
}

/* ───────────── 템플릿 ───────────── */

export interface Template {
  id: Id;
  name: string;
  description?: string;
  builtin?: boolean;
  recommended?: boolean;
  emoji?: string;
  keywordIdeas: string[];
  dm: DMContent;
  extras: Extras;
  createdAt: number;
  updatedAt: number;
  usedCount: number;
  lastUsedAt?: number;
}

/* ───────────── 답글 모음 ───────────── */

export interface ReplySet {
  id: Id;
  name: string;
  replies: string[];
  createdAt: number;
}

/* ───────────── 내 링크 ───────────── */

export interface LinkItem {
  id: Id;
  title: string;
  url: string;
  createdAt: number;
}

/* ───────────── 추첨 ───────────── */

export interface DrawWinner {
  userId: Id;
  username: string;
  commentId: Id;
  commentText: string;
}

export interface Draw {
  id: Id;
  postId: Id;
  trigger: Trigger;
  winnerCount: number;
  candidateCount: number;
  winners: DrawWinner[];
  createdAt: number;
  redrawnAt?: number;
}

/* ───────────── 설정 ───────────── */

export interface Settings {
  /** DM 자동 발송 일시 중지 */
  dmPaused: boolean;
  /** 댓글 자동 답글 일시 중지 */
  replyPaused: boolean;
  /** 시간당 최대 발송 수 (초과분은 순차 발송) */
  rateLimitPerHour: number;
  /** 클릭 추적용 공개 주소 (예: https://xxxx.trycloudflare.com) */
  publicBaseUrl: string;
  /** 댓글 답글 사이 간격 (초) — 이 범위에서 무작위로 기다려요 */
  replyDelayMinSec: number;
  replyDelayMaxSec: number;
  /** 시간당 최대 댓글 답글 수 */
  replyPerHour: number;
  /** DM을 시간당 한도에 맞춰 고르게 나눠 보내기 (몰아서 보내지 않기) */
  dmSpread: boolean;
  /** 인스타그램 제한 신호 감지 상태 */
  risk: RiskState;
}

/**
 * 인스타그램이 보낸 제한 신호(발송 제한·일시 차단 등)를 모아 자동으로 속도를 줄여요.
 * 1~2번: 답글 간격을 10분으로 늘려요 · 3번: 답글을 멈춰요 (DM은 계속 보내요)
 */
export interface RiskState {
  signals: { at: number; reason: string }[];
  /** 3번째 신호로 답글을 자동으로 멈췄는지 */
  autoPausedReplies?: boolean;
}

/** 24시간 안에 DM을 보냈거나 버튼을 누른 팬 (단체 DM 대상 판단용) */
export interface Contact {
  userId: Id;
  username: string;
  /** 팬이 마지막으로 직접 반응한 때 (DM 보내기·버튼 누르기) — 이때부터 24시간 동안 보낼 수 있어요 */
  lastInboundAt: number;
  lastInboundKind: "message" | "postback" | "share" | "code";
  firstSeenAt: number;
}

/** 단체 DM (24시간 안에 반응한 팬에게만) */
export interface Broadcast {
  id: Id;
  text: string;
  buttons: DMButton[];
  createdAt: number;
  /** 보낼 때 대상이었던 팬 수 */
  total: number;
}

/* ───────────── 홈 요약 ───────────── */

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  sent: number;
  clicks: number;
}

export interface HomeSummary {
  totals: { sent: number; read: number; clicks: number; ctr: number; automations: number; running: number };
  last7: DailyPoint[];
  queued: number;
}

/* ───────────── 데모(시뮬레이터) ───────────── */

export interface DemoFan {
  id: Id;
  username: string;
  following: boolean;
  /** 비공개/DM 제한 계정 */
  restricted?: boolean;
}

export type DemoMessageFrom = "business" | "fan";

export interface DemoInboxMessage {
  id: Id;
  fanId: Id;
  from: DemoMessageFrom;
  createdAt: number;
  text?: string;
  /** 버튼 템플릿 */
  buttons?: { type: "web_url" | "postback"; title: string; url?: string; payload?: string }[];
  /** 캐러셀 */
  cards?: { title: string; subtitle: string; imageUrl: string; buttons: { type: "web_url"; title: string; url: string }[] }[];
  sharedPostId?: Id;
  readAt?: number;
  deliveryId?: Id;
}

export interface DemoState {
  fans: DemoFan[];
  inbox: DemoInboxMessage[];
  replies: { commentId: Id; text: string; createdAt: number }[];
}
