import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { DEFAULT_RATE_LIMIT_PER_HOUR, SAFETY_DEFAULTS } from "../shared/limits";
import type {
  AccountPublic,
  Automation,
  Broadcast,
  ClickLog,
  Comment,
  Contact,
  DeliveryKind,
  DeliveryLog,
  DeliveryOrigin,
  DemoState,
  Draw,
  Id,
  LinkItem,
  Post,
  ReplySet,
  Settings,
  Template,
} from "../shared/types";

export interface AccountPrivate extends AccountPublic {
  accessToken?: string;
}

export interface QueueItem {
  id: string;
  automationId: string;
  deliveryId: string;
  kind: DeliveryKind;
  origin: DeliveryOrigin;
  postId: string | null;
  commentId?: string;
  userId: string;
  username: string;
  replyText?: string;
  notBefore: number;
  attempts: number;
  createdAt: number;
}

export interface PendingFollowCheck {
  automationId: string;
  userId: string;
  username: string;
  attempts: number;
  notBefore: number;
}

export interface DB {
  version: 1;
  account: AccountPrivate | null;
  posts: Post[];
  comments: Comment[];
  automations: Automation[];
  templates: Template[];
  links: LinkItem[];
  replySets: ReplySet[];
  draws: Draw[];
  deliveries: DeliveryLog[];
  clicks: ClickLog[];
  queue: QueueItem[];
  pendingChecks: PendingFollowCheck[];
  settings: Settings;
  demo: DemoState;
  retiredCodes: string[];
  /** 게시물별 최근에 단 답글 (같은 답글이 연달아 달리지 않게) */
  recentReplies: Record<string, string[]>;
  /** 직접 반응한 팬 (단체 DM 24시간 판단용) */
  contacts: Record<Id, Contact>;
  broadcasts: Broadcast[];
  /** Instagram 로그인 보안 확인 값 */
  oauthState?: string;
  /** Instagram 로그인 뒤 돌아갈 화면 주소 */
  oauthReturn?: string;
  /** 바깥(터널)에서 접속할 때 쓰는 관리자 비밀번호·세션 키 */
  auth?: { password: string; secret: string };
}

export function emptyDB(): DB {
  return {
    version: 1,
    account: null,
    posts: [],
    comments: [],
    automations: [],
    templates: [],
    links: [],
    replySets: [],
    draws: [],
    deliveries: [],
    clicks: [],
    queue: [],
    pendingChecks: [],
    settings: {
      dmPaused: false,
      replyPaused: false,
      rateLimitPerHour: DEFAULT_RATE_LIMIT_PER_HOUR,
      publicBaseUrl: config.publicBaseUrl,
      replyDelayMinSec: SAFETY_DEFAULTS.replyDelayMinSec,
      replyDelayMaxSec: SAFETY_DEFAULTS.replyDelayMaxSec,
      replyPerHour: SAFETY_DEFAULTS.replyPerHour,
      dmSpread: SAFETY_DEFAULTS.dmSpread,
      risk: { signals: [] },
    },
    contacts: {},
    broadcasts: [],
    demo: { fans: [], inbox: [], replies: [] },
    retiredCodes: [],
    recentReplies: {},
  };
}

export class Store {
  db: DB;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<() => void>();

  constructor(private file: string | null) {
    this.db = file ? this.load(file) : emptyDB();
  }

  private load(file: string): DB {
    if (!fs.existsSync(file)) return emptyDB();
    const raw = fs.readFileSync(file, "utf8");
    try {
      const parsed = JSON.parse(raw) as Partial<DB>;
      const base = emptyDB();
      const settings = { ...base.settings, ...parsed.settings };
      if (!settings.risk?.signals) settings.risk = { signals: [] };
      return { ...base, ...parsed, settings };
    } catch (e) {
      // 파일이 깨졌으면 덮어쓰기 전에 따로 보관해 둬요 (토큰·자동화·기록을 잃지 않도록)
      const backup = `${file}.corrupt-${Date.now()}`;
      fs.copyFileSync(file, backup);
      console.error(`\n  ⚠ 데이터 파일을 읽지 못했어요 (${(e as Error).message}). 원본을 ${backup} 에 보관하고 빈 상태로 시작해요.\n`);
      return emptyDB();
    }
  }

  /** 변경 후 호출 — 디스크에 모아서 저장하고 구독자에게 알림 */
  changed(): void {
    for (const l of this.listeners) l();
    if (!this.file) return;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 250);
  }

  flush(): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(next: DB = emptyDB()): void {
    this.db = next;
    this.changed();
  }
}
