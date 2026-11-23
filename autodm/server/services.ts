import { cloneDeep, uid } from "../shared/factory";
import { DAY, LIMITS, MINUTE } from "../shared/limits";
import { BUILTIN_TEMPLATES } from "../shared/presets";
import type {
  Automation,
  DMContent,
  Draw,
  DrawWinner,
  Extras,
  LinkItem,
  SendMode,
  Template,
  Trigger,
} from "../shared/types";
import {
  findConflicts,
  isValidUrl,
  keywordHit,
  normalizeUrl,
  validateDM,
  validateExtras,
  validateTrigger,
} from "../shared/validation";
import type { Engine } from "./engine/engine";
import type { Gateway } from "./instagram/gateway";
import type { Store } from "./store";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[],
  ) {
    super(message);
  }
}

const bad = (details: string[]) => new HttpError(400, details[0] ?? "잘못된 요청이에요", details);

export interface AutomationInput {
  title?: string;
  postId: string | null;
  nextPost: boolean;
  trigger: Trigger;
  dm: DMContent;
  extras: Extras;
  sendMode: SendMode;
  schedule?: { at: number; continueAfter: boolean };
  templateId?: string;
}

export class Services {
  constructor(
    private store: Store,
    private engine: Engine,
    private gateway: () => Gateway,
    private now: () => number = Date.now,
  ) {}

  private get db() {
    return this.store.db;
  }

  /* ───────────── 자동화 ───────────── */

  private newCode(): string {
    const used = new Set([...this.db.automations.map((a) => a.code), ...this.db.retiredCodes]);
    for (let i = 0; i < 2000; i++) {
      const c = String(Math.floor(1000 + Math.random() * 9000));
      if (!used.has(c)) return c;
    }
    throw new HttpError(500, "코드를 만들 수 없어요");
  }

  private validateSchedule(s: AutomationInput["schedule"]): string[] {
    if (!s) return ["예약 시각을 골라 주세요"];
    const now = this.now();
    if (s.at <= now) return ["예약 시각은 지금 이후로 골라 주세요"];
    if (s.at > now + LIMITS.scheduleMaxDays * DAY + 30 * MINUTE) return [`예약은 ${LIMITS.scheduleMaxDays}일 뒤까지 정할 수 있어요`];
    const d = new Date(s.at);
    if (d.getMinutes() % LIMITS.scheduleStepMinutes !== 0) return ["예약 시각은 30분 단위로 정할 수 있어요"];
    return [];
  }

  private sanitizeDM(dm: DMContent): DMContent {
    const c = cloneDeep(dm);
    const fix = (b: { url: string }) => (b.url = b.url.trim() ? normalizeUrl(b.url) : "");
    c.main.buttons.forEach(fix);
    c.main.cards.forEach((card) => card.buttons.forEach(fix));
    c.followGate.nonFollower.buttons.forEach(fix);
    c.followGate.nonFollower.format = "text";
    if (!c.followGate.enabled && c.main.format === "carousel") c.main.format = "text";
    return c;
  }

  createAutomation(input: AutomationInput): Automation {
    const errs: string[] = [];
    if (!input.nextPost) {
      if (!input.postId || !this.db.posts.some((p) => p.id === input.postId)) errs.push("게시물을 골라 주세요");
    } else if (input.sendMode === "batch") {
      errs.push("다음 게시물에는 일괄 발송을 쓸 수 없어요");
    }
    const dm = this.sanitizeDM(input.dm);
    errs.push(...validateTrigger(input.trigger), ...validateDM(dm), ...validateExtras(input.extras, input.sendMode));
    if (input.sendMode === "scheduled") errs.push(...this.validateSchedule(input.schedule));
    const candidate = {
      id: "new",
      postId: input.nextPost ? null : input.postId,
      nextPost: input.nextPost,
      trigger: input.trigger,
      sendMode: input.sendMode,
    };
    errs.push(...findConflicts(candidate, this.db.automations));
    if (errs.length) throw bad(errs);

    const now = this.now();
    const a: Automation = {
      id: uid("auto"),
      title: input.title?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      postId: candidate.postId,
      nextPost: input.nextPost,
      trigger: { type: input.trigger.type, keywords: input.trigger.type === "keyword" ? input.trigger.keywords.map((k) => k.trim()) : [] },
      dm,
      extras: cloneDeep(input.extras),
      code: this.newCode(),
      sendMode: input.sendMode,
      origin: input.sendMode,
      schedule: input.sendMode === "scheduled" ? { ...input.schedule! } : undefined,
      enabled: true,
      templateId: input.templateId,
    };
    if (a.sendMode !== "immediate") a.extras.commentReply.enabled = false;
    this.db.automations.unshift(a);
    if (input.templateId) {
      const t = this.db.templates.find((x) => x.id === input.templateId);
      if (t) {
        t.usedCount += 1;
        t.lastUsedAt = now;
      }
    }
    this.store.changed();
    if (a.sendMode === "batch") void this.engine.startBatch(a);
    return a;
  }

  getAutomation(id: string): Automation {
    const a = this.db.automations.find((x) => x.id === id);
    if (!a) throw new HttpError(404, "자동화를 찾을 수 없어요");
    return a;
  }

  updateAutomation(id: string, patch: Partial<AutomationInput> & { enabled?: boolean }): Automation {
    const a = this.getAutomation(id);
    if (a.sendMode === "batch" && a.batch && !a.batch.finishedAt)
      throw new HttpError(409, "일괄 발송은 보내는 동안 수정할 수 없어요");
    if (patch.sendMode && patch.sendMode !== a.sendMode && !(a.origin === "batch" && patch.sendMode === "batch"))
      throw new HttpError(400, "발송 방식은 등록한 뒤 바꿀 수 없어요. 새로 만들어 주세요");

    const next = cloneDeep(a);
    const errs: string[] = [];
    if (patch.title !== undefined) next.title = patch.title.trim() || undefined;

    if (patch.dm) {
      const dm = this.sanitizeDM(patch.dm);
      if (dm.followGate.enabled !== a.dm.followGate.enabled) errs.push("팔로우 확인 여부는 등록한 뒤 바꿀 수 없어요");
      next.dm = dm;
      errs.push(...validateDM(dm));
    }

    if (a.sendMode === "scheduled") {
      if (patch.trigger && JSON.stringify(patch.trigger) !== JSON.stringify(a.trigger))
        errs.push("예약 발송은 키워드 조건을 바꿀 수 없어요");
      if (patch.postId !== undefined && patch.postId !== a.postId) errs.push("예약 발송은 게시물을 바꿀 수 없어요");
      if (patch.schedule) {
        if (a.schedule?.firedAt) errs.push("이미 보낸 예약은 시각을 바꿀 수 없어요");
        else {
          errs.push(...this.validateSchedule(patch.schedule));
          next.schedule = { ...a.schedule!, at: patch.schedule.at, continueAfter: patch.schedule.continueAfter };
        }
      }
      if (patch.extras) next.extras = { ...cloneDeep(patch.extras), commentReply: { ...patch.extras.commentReply, enabled: false } };
    } else {
      if (patch.trigger) {
        errs.push(...validateTrigger(patch.trigger));
        next.trigger = cloneDeep(patch.trigger);
        if (next.trigger.type === "all") next.trigger.keywords = [];
      }
      if (patch.postId !== undefined && patch.postId !== a.postId) {
        if (!patch.postId || !this.db.posts.some((p) => p.id === patch.postId)) errs.push("게시물을 골라 주세요");
        next.postId = patch.postId;
        next.nextPost = false;
      }
      if (patch.extras) {
        errs.push(...validateExtras(patch.extras, next.sendMode));
        next.extras = cloneDeep(patch.extras);
      }
    }
    if (patch.enabled !== undefined && patch.enabled !== a.enabled) {
      if (this.db.settings.dmPaused) errs.push("DM 발송을 일시 중지해 둔 동안에는 스위치를 바꿀 수 없어요");
      next.enabled = patch.enabled;
    }
    errs.push(...findConflicts(next, this.db.automations));
    if (errs.length) throw bad([...new Set(errs)]);

    // DM 코드: 끄면 그 코드는 다시 쓸 수 없어요 → 다시 켜면 새 코드
    if (a.extras.codeReply && !next.extras.codeReply) {
      this.db.retiredCodes.push(a.code);
      next.codeRetired = true;
    }
    if (!a.extras.codeReply && next.extras.codeReply && (a.codeRetired || next.codeRetired)) {
      next.code = this.newCode();
      next.codeRetired = false;
    }
    next.updatedAt = this.now();
    Object.assign(a, next);
    this.engine.reschedule(a);
    this.store.changed();
    return a;
  }

  deleteAutomation(id: string): void {
    const a = this.getAutomation(id);
    if (a.sendMode === "batch" && a.batch && !a.batch.finishedAt)
      throw new HttpError(409, "일괄 발송은 보내는 동안 삭제할 수 없어요");
    this.engine.cancelQueued(id);
    if (a.extras.codeReply) this.db.retiredCodes.push(a.code);
    this.db.automations = this.db.automations.filter((x) => x.id !== id);
    this.store.changed();
  }

  /** 게시물에 이미 걸린 키워드 (키워드 입력 칩에서 바로 안내) */
  keywordsOnPost(postId: string | null, excludeId?: string): string[] {
    return this.db.automations
      .filter((a) => a.id !== excludeId && (postId ? a.postId === postId : a.nextPost && !a.postId))
      .flatMap((a) => (a.trigger.type === "keyword" ? a.trigger.keywords : []));
  }

  /* ───────────── 템플릿 ───────────── */

  listTemplates(): { mine: Template[]; builtin: Template[] } {
    return { mine: this.db.templates, builtin: BUILTIN_TEMPLATES };
  }

  private validateTemplate(t: Pick<Template, "name" | "dm" | "extras">): string[] {
    const errs: string[] = [];
    if (!t.name.trim()) errs.push("템플릿 이름을 넣어 주세요");
    if ([...t.name].length > LIMITS.templateName) errs.push(`템플릿 이름은 ${LIMITS.templateName}자까지예요`);
    // 템플릿은 링크 없이 저장할 수도 있게 문구만 확인
    if (t.dm.main.format === "text" && !t.dm.main.text.trim()) errs.push("DM 문구를 넣어 주세요");
    if ([...t.dm.main.text].length > LIMITS.dmText) errs.push(`DM 문구는 ${LIMITS.dmText}자까지 쓸 수 있어요`);
    if (t.dm.main.buttons.length > LIMITS.buttonsPerMessage) errs.push(`버튼은 ${LIMITS.buttonsPerMessage}개까지예요`);
    if (t.dm.main.buttons.some((b) => [...b.title].length > LIMITS.buttonTitle)) errs.push(`버튼 이름은 ${LIMITS.buttonTitle}자까지예요`);
    if (t.dm.main.buttons.some((b) => b.url.trim() && !isValidUrl(normalizeUrl(b.url)))) errs.push("버튼 링크가 올바르지 않아요");
    return errs;
  }

  createTemplate(input: Pick<Template, "name" | "dm" | "extras"> & { keywordIdeas?: string[] }): Template {
    if (this.db.templates.length >= LIMITS.templates) throw new HttpError(400, `템플릿은 ${LIMITS.templates}개까지 저장할 수 있어요`);
    const errs = this.validateTemplate(input);
    if (errs.length) throw bad(errs);
    const now = this.now();
    const t: Template = {
      id: uid("tpl"),
      name: input.name.trim(),
      keywordIdeas: input.keywordIdeas ?? [],
      dm: this.sanitizeDM(input.dm),
      extras: cloneDeep(input.extras),
      createdAt: now,
      updatedAt: now,
      usedCount: 0,
    };
    this.db.templates.unshift(t);
    this.store.changed();
    return t;
  }

  updateTemplate(id: string, input: Pick<Template, "name" | "dm" | "extras">): Template {
    const t = this.db.templates.find((x) => x.id === id);
    if (!t) throw new HttpError(404, "템플릿을 찾을 수 없어요");
    const errs = this.validateTemplate(input);
    if (errs.length) throw bad(errs);
    // 템플릿을 고쳐도 이미 만든 자동화는 바뀌지 않아요
    t.name = input.name.trim();
    t.dm = this.sanitizeDM(input.dm);
    t.extras = cloneDeep(input.extras);
    t.updatedAt = this.now();
    this.store.changed();
    return t;
  }

  deleteTemplate(id: string): void {
    this.db.templates = this.db.templates.filter((t) => t.id !== id);
    this.store.changed();
  }

  /** 가장 많이 보낸 DM으로 첫 템플릿 제안 */
  templateSuggestion(): { dm: DMContent; extras: Extras; sent: number } | null {
    let best: { a: Automation; sent: number } | null = null;
    for (const a of this.db.automations) {
      const sent = this.db.deliveries.filter((d) => d.automationId === a.id && d.status === "sent").length;
      if (!best || sent > best.sent) best = { a, sent };
    }
    return best ? { dm: cloneDeep(best.a.dm), extras: cloneDeep(best.a.extras), sent: best.sent } : null;
  }

  /* ───────────── 내 링크 ───────────── */

  upsertLink(input: { id?: string; title: string; url: string }): LinkItem {
    const url = normalizeUrl(input.url);
    const errs: string[] = [];
    if (!input.title.trim()) errs.push("링크 이름을 넣어 주세요");
    if ([...input.title].length > LIMITS.linkTitle) errs.push(`링크 이름은 ${LIMITS.linkTitle}자까지예요`);
    if (!isValidUrl(url)) errs.push("올바른 링크 주소를 넣어 주세요");
    if (errs.length) throw bad(errs);
    if (input.id) {
      const l = this.db.links.find((x) => x.id === input.id);
      if (!l) throw new HttpError(404, "링크를 찾을 수 없어요");
      l.title = input.title.trim();
      l.url = url;
      this.store.changed();
      return l;
    }
    const l: LinkItem = { id: uid("lnk"), title: input.title.trim(), url, createdAt: this.now() };
    this.db.links.unshift(l);
    this.store.changed();
    return l;
  }

  deleteLink(id: string): void {
    this.db.links = this.db.links.filter((l) => l.id !== id);
    this.store.changed();
  }

  /* ───────────── 댓글 추첨 ───────────── */

  async draw(input: { postId: string; trigger: Trigger; winnerCount: number; redrawId?: string }): Promise<Draw> {
    const errs = validateTrigger(input.trigger);
    if (errs.length) throw bad(errs);
    const post = this.db.posts.find((p) => p.id === input.postId);
    if (!post) throw new HttpError(400, "게시물을 골라 주세요");
    let comments = await this.gateway().fetchComments(input.postId, 0).catch(() => []);
    if (!comments.length) comments = this.db.comments.filter((c) => c.postId === input.postId);
    const acc = this.db.account;
    const byUser = new Map<string, DrawWinner>();
    for (const c of comments) {
      if (c.parentId) continue;
      if (acc && (c.userId === acc.igUserId || c.username === acc.username)) continue;
      if (!keywordHit(input.trigger, c.text)) continue;
      // 한 사람은 한 번만 (여러 번 댓글을 달아도 동일)
      if (!byUser.has(c.userId))
        byUser.set(c.userId, { userId: c.userId, username: c.username, commentId: c.id, commentText: c.text });
    }
    const candidates = [...byUser.values()];
    if (!candidates.length) throw new HttpError(400, "조건에 맞는 댓글이 없어요");
    const n = Math.max(1, Math.min(input.winnerCount, candidates.length));
    // Fisher–Yates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const winners = candidates.slice(0, n);
    if (input.redrawId) {
      const d = this.db.draws.find((x) => x.id === input.redrawId);
      if (!d) throw new HttpError(404, "추첨 기록을 찾을 수 없어요");
      Object.assign(d, {
        trigger: input.trigger,
        winnerCount: n,
        candidateCount: candidates.length,
        winners,
        redrawnAt: this.now(),
      });
      this.store.changed();
      return d;
    }
    const d: Draw = {
      id: uid("draw"),
      postId: input.postId,
      trigger: cloneDeep(input.trigger),
      winnerCount: n,
      candidateCount: candidates.length,
      winners,
      createdAt: this.now(),
    };
    this.db.draws.unshift(d);
    this.store.changed();
    return d;
  }
}
