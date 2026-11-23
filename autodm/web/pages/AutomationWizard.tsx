import { HStack, Text, VStack } from "@seed-design/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { PageBanner, PageBannerButton } from "seed-design/ui/page-banner";
import { cloneDeep, defaultDM, defaultExtras, emptyButton, reissueIds, textMessage } from "@shared/factory";
import { GENERIC_KEYWORD_IDEAS } from "@shared/presets";
import type { AutomationView, DMContent, Extras, LinkItem, SendMode, Template, Trigger } from "@shared/types";
import { validateDM, validateExtras, validateTrigger } from "@shared/validation";
import { DMEditor } from "../components/dm/DMEditor";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { ExtrasEditor } from "../components/automation/ExtrasEditor";
import { KeywordInput } from "../components/automation/KeywordInput";
import { PostPicker, TemplateList, type PostWithMeta } from "../components/automation/Pickers";
import { SchedulePicker, SendModeOptions, defaultScheduleAt } from "../components/automation/SendMode";
import { Modal } from "../components/Modal";
import { Loading, PageHeader, PostThumb, Progress } from "../components/ui";
import { ApiError, api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { SEND_MODE_LABEL, fmtDateTime, postTitle, triggerSummary } from "../lib/format";

interface Draft {
  postId: string | null;
  nextPost: boolean;
  templateId: string | null;
  title: string;
  trigger: Trigger;
  dm: DMContent;
  extras: Extras;
  sendMode: SendMode;
  scheduleAt: number;
  continueAfter: boolean;
}

type Step = "post" | "template" | "final";
type Sec = "trigger" | "dm" | "extras";

const DRAFT_KEY = "autodm:wizard-draft";

function newDraft(): Draft {
  return {
    postId: null,
    nextPost: false,
    templateId: null,
    title: "",
    trigger: { type: "keyword", keywords: [] },
    dm: defaultDM(),
    extras: defaultExtras(),
    sendMode: "immediate",
    scheduleAt: defaultScheduleAt(),
    continueAfter: true,
  };
}

function linkDraft(link: LinkItem): Partial<Draft> {
  return {
    trigger: { type: "all", keywords: [] },
    dm: {
      ...defaultDM(),
      main: textMessage(`요청하신 링크 보내드려요 🔗\n아래 버튼을 눌러 확인해 주세요!`, [
        { ...emptyButton(link.title.slice(0, 20), link.url), linkId: link.id },
      ]),
    },
    extras: defaultExtras(),
  };
}

/** 수정 화면: 바뀐 곳 세기 */
function countChanges(a: AutomationView, d: Draft): number {
  const eq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  let n = 0;
  if ((a.title ?? "") !== d.title.trim()) n++;
  if (!eq(a.trigger, d.trigger)) n++;
  if (!eq(a.dm.main, d.dm.main)) n++;
  if (a.dm.followGate.gateText !== d.dm.followGate.gateText || a.dm.followGate.gateButtonTitle !== d.dm.followGate.gateButtonTitle) n++;
  if (!eq(a.dm.followGate.nonFollower, d.dm.followGate.nonFollower)) n++;
  if (!eq(a.extras.commentReply, d.extras.commentReply)) n++;
  if (a.extras.shareReply !== d.extras.shareReply) n++;
  if (a.extras.codeReply !== d.extras.codeReply) n++;
  if (a.schedule && (a.schedule.at !== d.scheduleAt || a.schedule.continueAfter !== d.continueAfter)) n++;
  return n;
}

function SectionCard(props: {
  num: number;
  title: string;
  open: boolean;
  done: boolean;
  summary: React.ReactNode;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <button type="button" className="collapsible-head" onClick={props.onOpen} aria-expanded={props.open}>
        <span className="step-num" data-done={props.done && !props.open} data-active={props.open}>
          {props.done && !props.open ? "✓" : props.num}
        </span>
        <VStack gap="x0_5" grow style={{ minWidth: 0 }}>
          <Text textStyle="t6Bold">{props.title}</Text>
          {!props.open && (
            <Text textStyle="t3Regular" color="fg.neutralMuted" maxLines={1}>
              {props.summary}
            </Text>
          )}
        </VStack>
        {!props.open && props.done && (
          <Text textStyle="t3Medium" color="fg.brand">
            수정
          </Text>
        )}
      </button>
      {props.open && <div style={{ marginTop: 20 }}>{props.children}</div>}
    </section>
  );
}

export function AutomationWizardPage({ mode }: { mode: "create" | "edit" }) {
  const nav = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { state, links } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();

  const posts = useApi<PostWithMeta[]>("/posts");
  const templates = useApi<{ mine: Template[]; builtin: Template[] }>("/templates", { live: false });
  const editing = useApi<{ automation: AutomationView }>(mode === "edit" && id ? `/automations/${id}` : null, { live: false });
  const dupId = params.get("duplicate");
  const dup = useApi<{ automation: AutomationView }>(dupId ? `/automations/${dupId}` : null, { live: false });
  const linkId = params.get("link");

  const [draft, setDraft] = useState<Draft>(newDraft);
  const [step, setStep] = useState<Step>("post");
  const [open, setOpen] = useState<Record<Sec, boolean>>({ trigger: true, dm: false, extras: false });
  const [done, setDone] = useState<Record<Sec, boolean>>({ trigger: false, dm: false, extras: false });
  const [showErrors, setShowErrors] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const initialized = useRef(false);
  const fromLink = useRef(false);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  /* ───── 초기화 ───── */
  useEffect(() => {
    if (initialized.current) return;
    if (mode === "edit") {
      const a = editing.data?.automation;
      if (!a) return;
      initialized.current = true;
      setDraft({
        postId: a.postId,
        nextPost: a.nextPost,
        templateId: a.templateId ?? null,
        title: a.title ?? "",
        trigger: cloneDeep(a.trigger),
        dm: cloneDeep(a.dm),
        extras: cloneDeep(a.extras),
        sendMode: a.sendMode,
        scheduleAt: a.schedule?.at ?? defaultScheduleAt(),
        continueAfter: a.schedule?.continueAfter ?? true,
      });
      setStep("final");
      setOpen({ trigger: true, dm: true, extras: true });
      setDone({ trigger: true, dm: true, extras: true });
      return;
    }
    if (dupId) {
      const a = dup.data?.automation;
      if (!a) return;
      initialized.current = true;
      setDraft({
        ...newDraft(),
        title: a.title ?? "",
        trigger: cloneDeep(a.trigger),
        dm: reissueIds(a.dm),
        extras: cloneDeep(a.extras),
        templateId: null,
      });
      setStep("post");
      return;
    }
    if (linkId) {
      const l = links.find((x) => x.id === linkId);
      if (!l) return;
      initialized.current = true;
      fromLink.current = true;
      setDraft({ ...newDraft(), ...linkDraft(l) });
      return;
    }
    initialized.current = true;
    const back = params.get("selectTemplate");
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (back && saved) {
      const d = JSON.parse(saved) as Draft;
      setDraft(d);
      setStep("template");
      sessionStorage.removeItem(DRAFT_KEY);
      // 템플릿 목록을 다시 불러온 뒤 선택
      void templates.reload();
      return;
    }
    const pid = params.get("postId");
    if (pid) {
      set({ postId: pid, nextPost: false });
      setStep("template");
    }
  }, [mode, editing.data, dup.data, dupId, linkId, links, params, templates]);

  // 템플릿 화면에서 "이 템플릿으로 자동화 만들기"
  useEffect(() => {
    const tid = params.get("template");
    if (!tid || !templates.data) return;
    const t = [...templates.data.mine, ...templates.data.builtin].find((x) => x.id === tid);
    if (t) applyTemplate(t);
  }, [templates.data]);

  // 템플릿 만들고 돌아왔을 때 새 템플릿 자동 선택
  useEffect(() => {
    const back = params.get("selectTemplate");
    if (!back || !templates.data) return;
    const t = templates.data.mine.find((x) => x.id === back);
    if (t) {
      applyTemplate(t);
      params.delete("selectTemplate");
      setParams(params, { replace: true });
    }
  }, [templates.data]);

  const post = posts.data?.find((p) => p.id === draft.postId) ?? null;
  const usedOnPost = useMemo(() => {
    const others = posts.data?.find((p) => p.id === draft.postId)?.usedKeywords ?? [];
    if (mode === "edit" && editing.data) {
      const mine = editing.data.automation.trigger.keywords;
      return others.filter((k) => !mine.includes(k));
    }
    return others;
  }, [posts.data, draft.postId, mode, editing.data]);

  const homeData = useApi<{ automations: AutomationView[] }>("/home");
  const siblings = useMemo(
    () =>
      (homeData.data?.automations ?? []).filter(
        (a) => a.id !== id && (draft.nextPost ? a.nextPost && !a.postId : a.postId === draft.postId && !!draft.postId),
      ),
    [homeData.data, draft.postId, draft.nextPost, id],
  );
  const allTaken = siblings.some((a) => a.trigger.type === "all");
  const siblingMode = siblings[0]?.sendMode;

  const selectedTemplate = useMemo(() => {
    const all = [...(templates.data?.mine ?? []), ...(templates.data?.builtin ?? [])];
    return all.find((t) => t.id === draft.templateId) ?? null;
  }, [templates.data, draft.templateId]);

  function applyTemplate(t: Template) {
    setDraft((d) => ({
      ...d,
      templateId: t.id,
      dm: reissueIds(t.dm),
      extras: cloneDeep(t.extras),
    }));
  }

  /* ───── 검증 ───── */
  const triggerErrors = validateTrigger(draft.trigger);
  const dmErrors = validateDM(draft.dm);
  // 발송 방식은 마지막에 고르고, 예약·일괄이면 답글은 자동으로 꺼져요
  const extrasErrors = validateExtras(draft.extras, editing.data?.automation.sendMode ?? "immediate");

  const exit = async () => {
    if (mode === "create") {
      const ok = await confirm({
        title: "만들던 자동화를 나갈까요?",
        description: "나가면 고른 내용은 저장되지 않아요.",
        confirmLabel: "나가기",
      });
      if (!ok) return;
    }
    nav(mode === "edit" && id ? `/automations/${id}` : "/");
  };

  const confirmSection = (s: Sec) => {
    const errs = s === "trigger" ? triggerErrors : s === "dm" ? dmErrors : extrasErrors;
    if (errs.length) {
      setShowErrors(true);
      toast(errs[0], "critical");
      return;
    }
    const order: Sec[] = ["trigger", "dm", "extras"];
    const next = order[order.indexOf(s) + 1];
    setDone((d) => ({ ...d, [s]: true }));
    setOpen((o) => ({ ...o, [s]: false, ...(next ? { [next]: true } : {}) }));
    setShowErrors(false);
  };

  /* ───── 저장 ───── */
  const body = () => ({
    title: draft.title,
    postId: draft.nextPost ? null : draft.postId,
    nextPost: draft.nextPost,
    trigger: draft.trigger,
    dm: draft.dm,
    extras:
      draft.sendMode === "immediate" ? draft.extras : { ...draft.extras, commentReply: { ...draft.extras.commentReply, enabled: false } },
    sendMode: draft.sendMode,
    schedule: draft.sendMode === "scheduled" ? { at: draft.scheduleAt, continueAfter: draft.continueAfter } : undefined,
    templateId: draft.templateId && !draft.templateId.startsWith("builtin_") ? draft.templateId : undefined,
  });

  const register = async () => {
    if (draft.sendMode === "batch") {
      // 다이얼로그 위에 다이얼로그를 겹치지 않도록 먼저 닫고 물어봐요
      setSendOpen(false);
      await new Promise((r) => setTimeout(r, 250));
      const ok = await confirm({
        title: "지난 댓글에 지금 보낼까요?",
        description: "최근 7일 안에 달린 댓글 중 아직 DM을 받지 않은 댓글에 한 번에 보내요. 보내는 동안에는 수정·삭제할 수 없어요.",
        confirmLabel: "지난 댓글에 보내기",
      });
      if (!ok) {
        setSendOpen(true);
        return;
      }
    }
    setSaving(true);
    setServerErrors([]);
    try {
      const a = await api<AutomationView>("/automations", { method: "POST", body: body() });
      setSendOpen(false);
      await new Promise((r) => setTimeout(r, 250));
      toast(
        a.sendMode === "scheduled" ? `예약했어요 · ${fmtDateTime(a.schedule!.at)}에 보내요` : a.sendMode === "batch" ? "지난 댓글에 보내기 시작했어요" : "자동화를 등록했어요",
        "positive",
      );
      if ((templates.data?.mine.length ?? 0) === 0) {
        const ok = await confirm({
          title: "방금 만든 자동화, 템플릿으로 만들어 볼까요?",
          description: "다음에 같은 DM을 쓸 거라면 템플릿으로 저장해 두세요. 템플릿만 고르면 DM이 한 번에 채워져요.",
          confirmLabel: "템플릿 만들기",
          cancelLabel: "다음에",
        });
        if (ok) {
          nav(`/templates/new?fromAutomation=${a.id}`);
          return;
        }
      }
      nav("/");
    } catch (e) {
      if (e instanceof ApiError) setServerErrors(e.details);
      onError(e);
      setSendOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!id) return;
    setSaving(true);
    setServerErrors([]);
    try {
      const a = editing.data!.automation;
      const patch: Record<string, unknown> = { title: draft.title, dm: draft.dm, extras: body().extras };
      if (a.sendMode !== "scheduled") patch.trigger = draft.trigger;
      if (a.sendMode === "scheduled" && !a.schedule?.firedAt) {
        const ok = await confirm({ title: "보낼 시각을 확인해 주세요", description: `${fmtDateTime(draft.scheduleAt)}에 보내요.`, confirmLabel: "저장" });
        if (!ok) return;
        patch.schedule = { at: draft.scheduleAt, continueAfter: draft.continueAfter };
      }
      await api(`/automations/${id}`, { method: "PATCH", body: patch });
      toast("바꾼 내용을 저장했어요. 다음 댓글부터 적용돼요", "positive");
      nav(`/automations/${id}`);
    } catch (e) {
      if (e instanceof ApiError) setServerErrors(e.details);
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  if (!posts.data || !templates.data || !state || (mode === "edit" && !editing.data)) return <Loading />;

  const original = editing.data?.automation;
  const batchSending = original?.status === "sending";
  const scheduledLocked = original?.sendMode === "scheduled";
  const changes = original ? countChanges(original, draft) : 0;
  const ideas = selectedTemplate?.keywordIdeas.length ? selectedTemplate.keywordIdeas : GENERIC_KEYWORD_IDEAS;
  const sample = draft.trigger.type === "keyword" && draft.trigger.keywords[0] ? `${draft.trigger.keywords[0]} 주세요!` : "와 너무 좋아요!";

  const stepIndex = mode === "edit" ? 3 : step === "post" ? 1 : step === "template" ? 2 : 3;
  const skipTemplate = !!dupId || fromLink.current;
  const totalSteps = skipTemplate ? 2 : 3;
  const progress = mode === "edit" ? 1 : (skipTemplate ? (step === "post" ? 1 : 2) : stepIndex) / (totalSteps + 0.5);

  const disabledModes: Partial<Record<SendMode, string>> = {};
  if (siblingMode) {
    for (const m of ["immediate", "scheduled", "batch"] as SendMode[])
      if (m !== siblingMode) disabledModes[m] = `이 게시물에는 이미 ${SEND_MODE_LABEL[siblingMode]} 자동화가 있어요`;
  }
  if (draft.nextPost) disabledModes.batch = "다음 게시물에는 아직 댓글이 없어요";

  const nextFromPost = () => {
    if (!draft.nextPost && !draft.postId) {
      toast("자동화를 걸 게시물을 골라 주세요", "critical");
      return;
    }
    if (post?.restricted) toast("이 게시물은 제한된 콘텐츠라 댓글 DM이 동작하지 않을 수 있어요. DM 공유·코드 기능을 함께 켜 두세요.");
    setStep(skipTemplate ? "final" : "template");
  };

  const triggerSection = (
    <SectionCard
      num={1}
      title="어떤 댓글에 보낼까요?"
      open={open.trigger}
      done={done.trigger}
      summary={triggerSummary(draft.trigger)}
      onOpen={() => setOpen((o) => ({ ...o, trigger: !o.trigger }))}
    >
      <VStack gap="x4">
        {scheduledLocked && <Callout tone="neutral" description="예약 발송은 키워드 조건을 바꿀 수 없어요." />}
        <VStack gap="x2">
          {(["all", "keyword"] as const).map((t) => {
            const disabled = scheduledLocked || (t === "all" && allTaken && draft.trigger.type !== "all");
            return (
              <button
                key={t}
                type="button"
                className="option-card"
                data-selected={draft.trigger.type === t}
                disabled={disabled}
                onClick={() => set({ trigger: { type: t, keywords: t === "all" ? [] : draft.trigger.keywords } })}
              >
                <span className="option-card__icon">{t === "all" ? "💬" : "🔑"}</span>
                <VStack gap="x0_5" as="span">
                  <Text textStyle="t5Bold">{t === "all" ? "모든 댓글" : "키워드 댓글"}</Text>
                  <Text textStyle="t3Regular" color="fg.neutralMuted">
                    {t === "all"
                      ? allTaken && draft.trigger.type !== "all"
                        ? "이 게시물에는 이미 모든 댓글 자동화가 있어요 (게시물마다 하나)"
                        : "게시물에 달리는 모든 댓글에 DM을 보내요"
                      : "정한 키워드가 들어간 댓글에만 보내요. 같은 게시물에 키워드가 다른 자동화를 여러 개 만들 수 있어요"}
                  </Text>
                </VStack>
              </button>
            );
          })}
        </VStack>
        {draft.trigger.type === "keyword" && (
          <KeywordInput
            keywords={draft.trigger.keywords}
            onChange={(keywords) => set({ trigger: { type: "keyword", keywords } })}
            usedOnPost={usedOnPost}
            ideas={ideas}
            showEmptyError={showErrors}
            disabled={scheduledLocked}
          />
        )}
        {draft.trigger.type === "keyword" && (
          <Text textStyle="t3Regular" color="fg.neutralSubtle">
            💡 키워드는 짧고 자주 쓰는 말로 정해 주세요. 캡션에 “댓글에 ‘{draft.trigger.keywords[0] ?? "링크"}’라고 남겨 주세요”처럼 함께 안내하면 효과가 커져요.
          </Text>
        )}
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralSolid" onClick={() => confirmSection("trigger")}>
              다음
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionCard>
  );

  const dmSection = (
    <SectionCard
      num={2}
      title="팬이 받을 DM을 확인해 주세요"
      open={open.dm}
      done={done.dm}
      summary={`${draft.dm.followGate.enabled ? "팔로우 확인 후 보내기 · " : ""}${
        draft.dm.main.format === "carousel" ? `캐러셀 ${draft.dm.main.cards.length}장` : draft.dm.main.text.split("\n")[0]
      }`}
      onOpen={() => setOpen((o) => ({ ...o, dm: !o.dm }))}
    >
      <VStack gap="x4" style={{ maxWidth: 440, margin: "0 auto" }}>
        <DMEditor
          dm={draft.dm}
          onChange={(dm) => set({ dm })}
          username={state.account.username}
          links={links}
          gateSwitch={mode === "edit" ? "locked" : "show"}
          sampleComment={sample}
        />
        {(showErrors || mode === "edit") && dmErrors.length > 0 && (
          <Callout tone="critical" description={dmErrors.join(" · ")} />
        )}
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralSolid" onClick={() => confirmSection("dm")}>
              다음
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionCard>
  );

  const extrasSection = (
    <SectionCard
      num={3}
      title="추가 기능도 켤까요?"
      open={open.extras}
      done={done.extras}
      summary={
        [
          draft.extras.commentReply.enabled && "댓글 답글",
          draft.extras.shareReply && "DM 공유",
          draft.extras.codeReply && "DM 코드",
        ]
          .filter(Boolean)
          .join(" · ") || "추가 기능 없음"
      }
      onOpen={() => setOpen((o) => ({ ...o, extras: !o.extras }))}
    >
      <VStack gap="x4">
        <ExtrasEditor
          extras={draft.extras}
          onChange={(extras) => set({ extras })}
          sendMode={mode === "edit" ? original?.sendMode : undefined}
          code={original?.code}
        />
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralSolid" onClick={() => confirmSection("extras")}>
              확인
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionCard>
  );

  const allDone = done.trigger && done.dm && done.extras;

  return (
    <div className="page" style={{ maxWidth: step === "template" ? 1080 : 820 }}>
      <PageHeader
        back
        onBack={exit}
        title={mode === "edit" ? "자동화 수정" : dupId ? "자동화 복제" : "자동화 추가"}
        description={
          mode === "edit"
            ? "바꾼 내용은 다음 댓글부터 적용돼요"
            : step === "post"
              ? "자동화를 걸 게시물을 골라 주세요"
              : step === "template"
                ? "팬에게 보낼 DM의 틀을 골라요. 템플릿을 고르면 DM 문구·버튼·팔로우 확인·답글 설정이 한 번에 채워져요"
                : "아래 세 가지를 차례로 확인해 주세요"
        }
      />
      <div style={{ marginBottom: 20 }}>
        <Progress value={progress} />
      </div>

      {/* 수정 중인 게시물 / 선택한 게시물 요약 */}
      {step !== "post" && (
        <HStack gap="x3" className="card" align="center" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <PostThumb post={draft.nextPost ? null : post} size="xs" />
          <VStack gap="x0_5" grow style={{ minWidth: 0 }}>
            <Text textStyle="t4Bold" maxLines={1}>
              {draft.nextPost ? "다음에 올릴 게시물" : postTitle(post)}
            </Text>
            <Text textStyle="t2Regular" color="fg.neutralSubtle">
              {selectedTemplate ? `템플릿: ${selectedTemplate.name}` : dupId ? "복제한 설정" : fromLink.current ? "내 링크로 제안된 설정" : ""}
              {original ? `${SEND_MODE_LABEL[original.sendMode]}` : ""}
            </Text>
          </VStack>
          {mode === "create" && (
            <ActionButton size="small" variant="ghost" onClick={() => setStep("post")}>
              게시물 바꾸기
            </ActionButton>
          )}
        </HStack>
      )}

      {mode === "edit" && changes > 0 && (
        <div style={{ marginBottom: 16 }}>
          <PageBanner
            tone="informative"
            description={`${changes}곳을 바꿨어요. 저장해야 반영돼요.`}
            suffix={<PageBannerButton onClick={saveEdit}>바꾼 내용 저장</PageBannerButton>}
          />
        </div>
      )}
      {batchSending && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warning" description="일괄 발송은 보내는 동안 수정하거나 삭제할 수 없어요." />
        </div>
      )}
      {serverErrors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="critical" title="등록하지 못했어요" description={serverErrors.join(" · ")} />
        </div>
      )}

      {step === "post" && (
        <VStack gap="x4">
          <PostPicker
            posts={posts.data}
            postId={draft.postId}
            nextPost={draft.nextPost}
            onChange={(v) => set(v)}
            refreshing={refreshing}
            onRefresh={
              state.account.mode === "live"
                ? async () => {
                    setRefreshing(true);
                    try {
                      posts.setData(await api<PostWithMeta[]>("/posts?refresh=1"));
                    } catch (e) {
                      onError(e);
                    } finally {
                      setRefreshing(false);
                    }
                  }
                : undefined
            }
          />
          <div className="footer-bar">
            <ActionButton variant="brandSolid" size="large" onClick={nextFromPost}>
              다음
            </ActionButton>
          </div>
        </VStack>
      )}

      {step === "template" && (
        <div className="split">
          <VStack gap="x4">
            <TemplateList
              mine={templates.data.mine}
              builtin={templates.data.builtin}
              selectedId={draft.templateId}
              onSelect={applyTemplate}
              onAdd={() => {
                sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
                nav(`/templates/new?return=${encodeURIComponent("/automations/new")}`);
              }}
              onEdit={(t) => nav(`/templates/${t.id}/edit`)}
            />
            <Text textStyle="t3Regular" color="fg.neutralSubtle">
              💡 ‘추천’ 표시가 붙은 템플릿은 많이 쓰는 템플릿이에요. 기본 템플릿의 키워드는 다음 단계에서 정해요.
            </Text>
          </VStack>
          <div className="split__aside">
            <VStack gap="x2">
              <Text textStyle="t4Bold" color="fg.neutralMuted">
                미리보기
              </Text>
              {selectedTemplate ? (
                <DMEditor dm={draft.dm} username={state.account.username} links={links} gateSwitch="hidden" />
              ) : (
                <div className="card">
                  <Text color="fg.neutralSubtle">템플릿을 고르면 발송될 DM을 미리 볼 수 있어요</Text>
                </div>
              )}
            </VStack>
          </div>
          <div className="footer-bar" style={{ gridColumn: "1 / -1" }}>
            <ActionButton variant="neutralWeak" size="large" onClick={() => setStep("post")}>
              이전
            </ActionButton>
            <ActionButton
              variant="brandSolid"
              size="large"
              disabled={!draft.templateId}
              onClick={() => {
                setStep("final");
                setOpen({ trigger: true, dm: false, extras: false });
                setDone({ trigger: false, dm: false, extras: false });
              }}
            >
              다음
            </ActionButton>
          </div>
        </div>
      )}

      {step === "final" && (
        <VStack gap="x3">
          {fromLink.current && mode === "create" && (
            <Callout
              tone="informative"
              title="이 게시물의 모든 댓글에 링크를 안내하는 DM을 제안했어요"
              description="그대로 쓰려면 아래 ‘이대로 등록’을 누르세요. 메시지나 키워드를 바꾸고 싶다면 각 단계를 열어 직접 수정할 수 있어요."
            />
          )}
          {triggerSection}
          {dmSection}
          {extrasSection}

          {mode === "edit" && original?.sendMode === "scheduled" && (
            <section className="card">
              <VStack gap="x4">
                <Text textStyle="t6Bold">보낼 시각</Text>
                {original.schedule?.firedAt ? (
                  <Text color="fg.neutralMuted">이미 {fmtDateTime(original.schedule.firedAt)}에 보냈어요.</Text>
                ) : (
                  <SchedulePicker at={draft.scheduleAt} continueAfter={draft.continueAfter} onChange={(at, c) => set({ scheduleAt: at, continueAfter: c })} />
                )}
              </VStack>
            </section>
          )}

          <section className="card">
            <TextInput
              label="자동화 이름 (선택)"
              description="홈 목록에서 알아보기 쉽게 이름을 붙여요"
              value={draft.title}
              onChange={(title) => set({ title })}
              max={30}
              placeholder={triggerSummary(draft.trigger)}
            />
          </section>

          <div className="footer-bar">
            {mode === "edit" ? (
              <>
                <ActionButton variant="neutralWeak" size="large" onClick={exit}>
                  취소
                </ActionButton>
                <ActionButton variant="brandSolid" size="large" loading={saving} disabled={changes === 0 || batchSending} onClick={saveEdit}>
                  바꾼 내용 저장
                </ActionButton>
              </>
            ) : (
              <>
                {fromLink.current && (
                  <ActionButton
                    variant="neutralSolid"
                    size="large"
                    loading={saving}
                    onClick={() => void register()}
                  >
                    이대로 등록
                  </ActionButton>
                )}
                <ActionButton
                  variant="brandSolid"
                  size="large"
                  onClick={() => {
                    if (!allDone && !fromLink.current) {
                      const first = (["trigger", "dm", "extras"] as Sec[]).find((s) => !done[s])!;
                      setOpen((o) => ({ ...o, [first]: true }));
                      toast("아직 확인하지 않은 단계가 있어요", "critical");
                      return;
                    }
                    const errs = [...triggerErrors, ...dmErrors, ...extrasErrors];
                    if (errs.length) {
                      setShowErrors(true);
                      toast(errs[0], "critical");
                      return;
                    }
                    if (siblingMode && draft.sendMode !== siblingMode) set({ sendMode: siblingMode });
                    setSendOpen(true);
                  }}
                >
                  자동화 등록
                </ActionButton>
              </>
            )}
          </div>
        </VStack>
      )}

      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="언제 보낼까요?"
        description="발송 방식은 등록한 뒤 바꿀 수 없어요"
        primary={{
          label: draft.sendMode === "scheduled" ? "예약하고 등록" : draft.sendMode === "batch" ? "지난 댓글에 보내기" : "자동화 등록",
          onClick: register,
          loading: saving,
        }}
      >
        <VStack gap="x5">
          <SendModeOptions value={draft.sendMode} onChange={(m) => set({ sendMode: m })} disabled={disabledModes} />
          {draft.sendMode === "scheduled" && (
            <SchedulePicker at={draft.scheduleAt} continueAfter={draft.continueAfter} onChange={(at, c) => set({ scheduleAt: at, continueAfter: c })} />
          )}
          {draft.sendMode !== "immediate" && draft.extras.commentReply.enabled && (
            <Callout tone="warning" description="예약·일괄 발송에서는 댓글 답글이 꺼진 채로 등록돼요 (답글이 한꺼번에 몰리면 인스타그램이 제한할 수 있어요)." />
          )}
          {draft.sendMode === "batch" && (
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              이미 즉시·예약 발송으로 DM을 받은 댓글에는 다시 보내지 않아요. 다 보내면 즉시 발송으로 바뀌어 이후 댓글에도 계속 보내요. 자주 다시 설정하는 건 계정에 부담이 될 수 있어 권장하지 않아요.
            </Text>
          )}
          {siblingMode && (
            <HStack gap="x1">
              <Badge size="medium" variant="weak" tone="neutral">
                안내
              </Badge>
              <Text textStyle="t2Regular" color="fg.neutralMuted">
                같은 게시물에는 발송 방식을 하나만 걸 수 있어요.
              </Text>
            </HStack>
          )}
        </VStack>
      </Modal>
    </div>
  );
}
