import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { DEFAULT_RATE_LIMIT_PER_HOUR } from "../shared/limits";
import type {
  AccountPublic,
  Automation,
  ClickLog,
  Comment,
  DeliveryKind,
  DeliveryLog,
  DeliveryOrigin,
  DemoState,
  Draw,
  LinkItem,
  Post,
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

export interface DB {
  version: 1;
  account: AccountPrivate | null;
  posts: Post[];
  comments: Comment[];
  automations: Automation[];
  templates: Template[];
  links: LinkItem[];
  draws: Draw[];
  deliveries: DeliveryLog[];
  clicks: ClickLog[];
  queue: QueueItem[];
  settings: Settings;
  demo: DemoState;
  retiredCodes: string[];
  replyCursor: Record<string, number>;
  /** 계정이 연결된 시점에 이미 있던 게시물 (다음 게시물 자동화 판단용) */
  oauthState?: string;
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
    draws: [],
    deliveries: [],
    clicks: [],
    queue: [],
    settings: {
      dmPaused: false,
      replyPaused: false,
      rateLimitPerHour: DEFAULT_RATE_LIMIT_PER_HOUR,
      publicBaseUrl: config.publicBaseUrl,
    },
    demo: { fans: [], inbox: [], replies: [] },
    retiredCodes: [],
    replyCursor: {},
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
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<DB>;
      return { ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...parsed.settings } };
    } catch {
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
