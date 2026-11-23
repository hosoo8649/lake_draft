import { IconCheckmarkFatFill, IconChevronDownLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { PageBanner, PageBannerButton } from "seed-design/ui/page-banner";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { cloneDeep, defaultDM, defaultExtras, emptyButton, reissueIds, textMessage } from "@shared/factory";
import { GENERIC_KEYWORD_IDEAS } from "@shared/presets";
import type { AutomationView, DMContent, Extras, LinkItem, SendMode, Template, Trigger } from "@shared/types";
import { validateDM, validateExtras, validateTrigger } from "@shared/validation";
import { ExtrasEditor } from "../components/automation/ExtrasEditor";
import { KeywordInput } from "../components/automation/KeywordInput";
import { PostGrid, PostPicker, TemplateList, TemplatePreviewCard, type PostWithMeta } from "../components/automation/Pickers";
import { SchedulePicker, SendModeOptions, defaultScheduleAt } from "../components/automation/SendMode";
import { DMStage } from "../components/dm/DMEditor";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Modal } from "../components/Modal";
import { Loading, PageHeader, PostThumb } from "../components/ui";
import { ApiError, api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { SEND_MODE_LABEL, fmtDateTime, postTitle, triggerSummary } from "../lib/format";
import { useLeaveGuard } from "../lib/useLeaveGuard";

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
const SECS: Sec[] = ["trigger", "dm", "extras"];
const DRAFT_KEY = "autodm:wizard-draft";

function newDraft(): Draft {
  return {
    postId: null,
    nextPost: false,
    templateId: null,
    title: "",
    trigger: { type: "all", keywords: [] },
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
      main: textMessage(`요청하신 링크 보내드려요 🔗\n아래 버튼을 눌러 확인해 주세요!`, [{ ...emptyButton(link.title.slice(0, 20), link.url), linkId: link.id }]),
    },
    extras: defaultExtras(),
  };
}

/** 수정 화면: 바뀐 곳 세기 */
function countChanges(a: AutomationView, d: Draft): number {
  const eq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  let n = 0;
  if ((a.title ?? "") !== d.title.trim()) n++;
  if (a.postId !== d.postId) n++;
  if (!eq(a.trigger, d.trigger)) n++;
  if (!eq(a.dm.main, d.dm.main)) n++;
  if (a.dm.followGate.gateText !== d.dm.followGate.gateText || a.dm.followGate.gateButtonTitle !== d.dm.followGate.gateButtonTitle) n++;
  if (!eq(a.dm.followGate.nonFollower, d.dm.followGate.nonFollower)) n++;
  if (!eq(a.extras.commentReply, d.extras.commentReply)) n++;
  if (a.extras.shareReply !== d.extras.shareReply) n++;
  if (a.extras.codeReply !== d.extras.codeReply) n++;
  if (a.schedule && !a.schedule.firedAt && (a.schedule.at !== d.scheduleAt || a.schedule.continueAfter !== d.continueAfter)) n++;
  return n;
}

function triggerLine(t: Trigger): string {
  if (t.type === "all") return "아무 댓글이나 달리면";
  return t.keywords.length ? `${t.keywords.map((k) => `‘${k}’`).join(" ")}가 들어간 댓글` : "키워드를 넣어 주세요";
}

/** 최종 확인의 각 단계 — 확인을 마치면 한 줄 요약으로 접혀요 */
function SectionBlock(props: {
  title: string;
  label: string;
  summary: string;
  open: boolean;
  done: boolean;
  onOpen: () => void;
  children: React.ReactNode;
  icon: string;
}) {
  if (!props.open)
    return (
      <button type="button" className="summary-card" onClick={props.onOpen} aria-label={`${props.title} 다시 열기`}>
        <span className="option-card__icon" style={{ fontSize: 18 }}>
          {props.done ? <Icon svg={<IconCheckmarkFatFill />} color="fg.positive" /> : props.icon}
        </span>
        <VStack gap="x0_5" grow style={{ minWidth: 0 }}>
          <Text textStyle="t2Regular" color="fg.neutralSubtle">
            {props.label}
          </Text>
          <Text textStyle="t5Bold" maxLines={1}>
            {props.done ? props.summary : props.title}
          </Text>
        </VStack>
        <Icon svg={<IconChevronDownLine />} color="fg.neutralSubtle" />
      </button>
    );
  return (
    <section className="card">
      <Text as="h2" textStyle="t7Bold" style={{ marginBottom: 16 }}>
        {props.title}
      </Text>
      {props.children}
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
  const home = useApi<{ automations: AutomationView[] }>("/home");
  const editing = useApi<{ automation: AutomationView }>(mode === "edit" && id ? `/automations/${id}` : null, { live: false });
  const dupId = params.get("duplicate");
  const dup = useApi<{ automation: AutomationView }>(dupId ? `/automations/${dupId}` : null, { live: false });
  const linkId = params.get("link");

  const [draft, setDraft] = useState<Draft>(newDraft);
  const [step, setStep] = useState<Step>("post");
  const [open, setOpen] = useState<Record<Sec, boolean>>({ trigger: true, dm: false, extras: false });
  const [done, setDone] = useState<Record<Sec, boolean>>({ trigger: false, dm: false, extras: false });
  const [touched, setTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "saving" | "done">("idle");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState<string>("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const initialized = useRef(false);
  const fromLink = useRef(false);

  const set = (patch: Partial<Draft>) => {
    setTouched(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const original = editing.data?.automation;
  const changes = original ? countChanges(original, draft) : 0;
  const allowLeave = useLeaveGuard(mode === "create" ? touched && phase === "idle" : changes > 0 && phase === "idle", {
    title: mode === "create" ? "만들던 자동화를 나갈까요?" : "바꾼 내용을 저장하지 않고 나갈까요?",
    description: mode === "create" ? "나가면 고른 내용은 저장되지 않아요." : "저장하지 않은 내용은 사라져요.",
  });

  /* ───── DM 코드는 등록 전에 미리 받아 팬 안내 문구에 보여 줘요 ───── */
  useEffect(() => {
    if (mode === "create" && !code)
      api<{ code: string }>("/codes/new")
        .then((r) => setCode(r.code))
        .catch(() => {});
  }, [mode, code]);

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
      setCode(a.code);
      setStep("final");
      setOpen({ trigger: true, dm: true, extras: true });
      setDone({ trigger: true, dm: true, extras: true });
      return;
    }
    if (dupId) {
      const a = dup.data?.automation;
      if (!a) return;
      initialized.current = true;
      setDraft({ ...newDraft(), title: a.title ?? "", trigger: cloneDeep(a.trigger), dm: reissueIds(a.dm), extras: cloneDeep(a.extras) });
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
      const parsed = JSON.parse(saved) as { draft: Draft; code: string };
      setDraft(parsed.draft);
      if (parsed.code) setCode(parsed.code);
      setTouched(true);
      setStep("template");
      sessionStorage.removeItem(DRAFT_KEY);
      void templates.reload();
      return;
    }
    const pid = params.get("postId");
    if (pid) {
      setDraft((d) => ({ ...d, postId: pid, nextPost: false }));
      setStep("template");
    }
  }, [mode, editing.data, dup.data, dupId, linkId, links, params, templates]);

  function applyTemplate(t: Template) {
    setTouched(true);
    setDraft((d) => ({ ...d, templateId: t.id, dm: reissueIds(t.dm), extras: cloneDeep(t.extras) }));
  }

  // 템플릿 화면의 "이 템플릿으로 자동화 만들기" / 템플릿을 만들거나 고치고 돌아왔을 때
  useEffect(() => {
    if (!templates.data) return;
    const tid = params.get("template") ?? params.get("selectTemplate");
    if (!tid) return;
    const t = [...templates.data.mine, ...templates.data.builtin].find((x) => x.id === tid);
    if (t) applyTemplate(t);
    if (params.get("selectTemplate")) {
      params.delete("selectTemplate");
      setParams(params, { replace: true });
    }
  }, [templates.data]);

  const postList = posts.data ?? [];
  const post = postList.find((p) => p.id === draft.postId) ?? null;
  const siblings = useMemo(
    () =>
      (home.data?.automations ?? []).filter(
        (a) => a.id !== id && (draft.nextPost ? a.nextPost && !a.postId : !!draft.postId && a.postId === draft.postId),
      ),
    [home.data, draft.postId, draft.nextPost, id],
  );
  const usedOnPost = siblings.flatMap((a) => (a.trigger.type === "keyword" ? a.trigger.keywords : []));
  const allTaken = siblings.some((a) => a.trigger.type === "all");
  const siblingMode = siblings[0]?.sendMode;
  const pendingNext = (home.data?.automations ?? []).some((a) => a.id !== id && a.nextPost && !a.postId);

  const selectedTemplate = useMemo(() => {
    const all = [...(templates.data?.mine ?? []), ...(templates.data?.builtin ?? [])];
    return all.find((t) => t.id === draft.templateId) ?? null;
  }, [templates.data, draft.templateId]);

  /* ───── 검증 ───── */
  const triggerErrors = validateTrigger(draft.trigger);
  const dmErrors = validateDM(draft.dm);
  const extrasErrors = validateExtras(draft.extras, original?.sendMode ?? "immediate");

  const confirmSection = (s: Sec) => {
    const errs = s === "trigger" ? triggerErrors : s === "dm" ? dmErrors : extrasErrors;
    if (errs.length) {
      setShowErrors(true);
      toast(errs[0], "critical");
      return;
    }
    const next = SECS[SECS.indexOf(s) + 1];
    setDone((d) => ({ ...d, [s]: true }));
    setOpen((o) => ({ ...o, [s]: false, ...(next && !done[next] ? { [next]: true } : {}) }));
    setShowErrors(false);
  };

  /* ───── 저장 ───── */
  const body = (sendMode = draft.sendMode) => ({
    title: draft.title,
    postId: draft.nextPost ? null : draft.postId,
    nextPost: draft.nextPost,
    trigger: draft.trigger,
    dm: draft.dm,
    extras: sendMode === "immediate" ? draft.extras : { ...draft.extras, commentReply: { ...draft.extras.commentReply, enabled: false } },
    sendMode,
    schedule: sendMode === "scheduled" ? { at: draft.scheduleAt, continueAfter: draft.continueAfter } : undefined,
    templateId: draft.templateId && !draft.templateId.startsWith("builtin_") ? draft.templateId : undefined,
    code,
  });

  const register = async (sendMode = draft.sendMode) => {
    if (sendMode === "batch") {
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
    setSendOpen(false);
    setServerErrors([]);
    setPhase("saving");
    try {
      const [a] = await Promise.all([
        api<AutomationView>("/automations", { method: "POST", body: body(sendMode) }),
        new Promise((r) => setTimeout(r, 700)),
      ]);
      setPhase("done");
      setCreatedId(a.id);
      // 템플릿이 하나도 없으면 등록 완료 화면에서 템플릿으로 만들지 물어봐요
      if ((templates.data?.mine.length ?? 0) > 0) {
        await new Promise((r) => setTimeout(r, 900));
        allowLeave();
        nav("/");
      }
    } catch (e) {
      setPhase("idle");
      if (e instanceof ApiError) setServerErrors(e.details);
      onError(e);
    }
  };

  const saveEdit = async () => {
    if (!id || !original) return;
    const patch: Record<string, unknown> = { title: draft.title, dm: draft.dm, extras: body(original.sendMode).extras };
    if (original.sendMode !== "scheduled") {
      patch.trigger = draft.trigger;
      if (draft.postId !== original.postId) patch.postId = draft.postId;
    }
    if (original.sendMode === "scheduled" && original.schedule && !original.schedule.firedAt) {
      const ok = await confirm({ title: "보낼 시각을 확인해 주세요", description: `${fmtDateTime(draft.scheduleAt)}에 보내요.`, confirmLabel: "저장" });
      if (!ok) return;
      patch.schedule = { at: draft.scheduleAt, continueAfter: draft.continueAfter };
    }
    setPhase("saving");
    setServerErrors([]);
    try {
      await api(`/automations/${id}`, { method: "PATCH", body: patch });
      toast("바꾼 내용을 저장했어요. 다음 댓글부터 적용돼요", "positive");
      allowLeave();
      nav(`/automations/${id}`);
    } catch (e) {
      setPhase("idle");
      if (e instanceof ApiError) setServerErrors(e.details);
      onError(e);
    }
  };

  if (!posts.data || !templates.data || !state || (mode === "edit" && !editing.data)) return <Loading />;

  const batchSending = original?.status === "sending";
  const scheduledLocked = original?.sendMode === "scheduled";
  const ideas = selectedTemplate?.keywordIdeas.length ? selectedTemplate.keywordIdeas : GENERIC_KEYWORD_IDEAS;
  const sample = draft.trigger.type === "keyword" && draft.trigger.keywords[0] ? `${draft.trigger.keywords[0]} 주세요!` : "와 너무 좋아요! 정보 궁금해요";
  const skipTemplate = !!dupId || fromLink.current;

  // 진행 막대: 게시물 · 템플릿 · 댓글 · DM · 추가 기능
  const segs = skipTemplate ? ["post", "trigger", "dm", "extras"] : ["post", "template", "trigger", "dm", "extras"];
  const reached = (k: string) =>
    k === "post" ? true : k === "template" ? step !== "post" : step === "final" && (done[k as Sec] || open[k as Sec]);

  const disabledModes: Partial<Record<SendMode, string>> = {};
  if (siblingMode)
    for (const m of ["immediate", "scheduled", "batch"] as SendMode[])
      if (m !== siblingMode) disabledModes[m] = `이 게시물에는 이미 ${SEND_MODE_LABEL[siblingMode]} 자동화가 있어요`;
  if (draft.nextPost) disabledModes.batch = "다음 게시물에는 아직 댓글이 없어요";

  const nextFromPost = () => {
    if (!draft.nextPost && !draft.postId) {
      toast("자동화를 걸 게시물을 골라 주세요", "critical");
      return;
    }
    if (post?.restricted) toast("연령 제한 등 제한된 게시물은 댓글 DM이 동작하지 않아요. DM 공유·DM 코드를 함께 켜 두세요.");
    setStep(skipTemplate ? "final" : "template");
    window.scrollTo({ top: 0 });
  };

  const goBack = () => {
    if (mode === "edit") return nav(`/automations/${id}`);
    if (step === "final" && !skipTemplate) return setStep("template");
    if (step === "final" || step === "template") return setStep("post");
    nav("/");
  };

  const openSendSheet = () => {
    if (!SECS.every((s) => done[s]) && !fromLink.current) {
      const first = SECS.find((s) => !done[s])!;
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
    const patch: Partial<Draft> = {};
    if (siblingMode && draft.sendMode !== siblingMode) patch.sendMode = siblingMode;
    if (draft.scheduleAt < Date.now() + 60_000) patch.scheduleAt = defaultScheduleAt();
    if (Object.keys(patch).length) set(patch);
    setSendOpen(true);
  };

  const heading =
    mode === "edit"
      ? { title: "자동화 수정", desc: "바꾼 내용은 다음 댓글부터 적용돼요" }
      : step === "post"
        ? { title: "어떤 게시물의 댓글에 반응할까요?", desc: "캐러셀·릴스도 고를 수 있어요" }
        : step === "template"
          ? { title: "어떤 템플릿으로 보낼까요?", desc: "템플릿을 고르면 팬이 받을 DM을 미리 볼 수 있어요" }
          : { title: "최종 확인", desc: "아래 세 가지를 차례로 확인해 주세요. 확인을 마친 단계는 한 줄 요약으로 접혀요." };

  /* ───── 최종 확인 세 단계 ───── */
  const triggerSection = (
    <SectionBlock
      title="어떤 댓글에 보낼까요?"
      label="보낼 댓글"
      icon="💬"
      summary={triggerLine(draft.trigger)}
      open={open.trigger}
      done={done.trigger}
      onOpen={() => setOpen((o) => ({ ...o, trigger: true }))}
    >
      <VStack gap="x4">
        {scheduledLocked && <Callout tone="neutral" description="예약 발송은 키워드 조건을 바꿀 수 없어요." />}
        <VStack gap="x2" role="radiogroup" aria-label="보낼 댓글">
          {(["all", "keyword"] as const).map((t) => {
            const disabled = scheduledLocked || (t === "all" && allTaken && draft.trigger.type !== "all");
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={draft.trigger.type === t}
                className="option-card"
                data-selected={draft.trigger.type === t}
                disabled={disabled}
                onClick={() => set({ trigger: { type: t, keywords: t === "all" ? [] : draft.trigger.keywords } })}
              >
                <span className="option-card__icon">{t === "all" ? "💬" : "🔍"}</span>
                <VStack gap="x0_5" as="span" grow>
                  <Text textStyle="t5Bold">{t === "all" ? "모든 댓글" : "키워드 댓글"}</Text>
                  <Text textStyle="t3Regular" color="fg.neutralMuted">
                    {t === "all"
                      ? disabled && !scheduledLocked
                        ? "이 게시물에는 이미 모든 댓글 자동화가 있어요 (게시물마다 하나)"
                        : "댓글을 남긴 모든 분께 DM을 보내요"
                      : "지정한 키워드가 포함된 댓글에만 DM을 보내요"}
                  </Text>
                </VStack>
                <span className="option-card__radio" aria-hidden />
              </button>
            );
          })}
        </VStack>
        {draft.trigger.type === "keyword" && (
          <>
            <KeywordInput
              keywords={draft.trigger.keywords}
              onChange={(keywords) => set({ trigger: { type: "keyword", keywords } })}
              usedOnPost={usedOnPost}
              ideas={ideas}
              showEmptyError={showErrors}
              disabled={scheduledLocked}
            />
            <Text textStyle="t3Regular" color="fg.neutralSubtle">
              💡 키워드는 짧고 자주 쓰는 말로 정해 주세요. 캡션에 “댓글에 ‘{draft.trigger.keywords[0] ?? "링크"}’라고 남겨 주세요”처럼 함께 안내하면 효과가 커져요.
            </Text>
          </>
        )}
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralSolid" onClick={() => confirmSection("trigger")}>
              다음
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionBlock>
  );

  const dmSection = (
    <SectionBlock
      title="팬이 받을 DM을 확인해 주세요"
      label="보낼 DM"
      icon="✉️"
      summary={`${draft.dm.followGate.enabled ? "팔로우 확인 후 · " : ""}${
        draft.dm.main.format === "carousel" ? `이미지 캐러셀 ${draft.dm.main.cards.length}장` : draft.dm.main.text.split("\n")[0]
      }`}
      open={open.dm}
      done={done.dm}
      onOpen={() => setOpen((o) => ({ ...o, dm: true }))}
    >
      <VStack gap="x4" style={{ maxWidth: 480, margin: "0 auto" }}>
        <DMStage
          dm={draft.dm}
          onChange={(dm) => set({ dm })}
          username={state.account.username}
          post={draft.nextPost ? null : post}
          links={links}
          gateLocked={mode === "edit"}
          sampleComment={sample}
        />
        {(showErrors || mode === "edit") && dmErrors.length > 0 && <Callout tone="critical" description={dmErrors.join(" · ")} />}
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralSolid" onClick={() => confirmSection("dm")}>
              다음
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionBlock>
  );

  const extrasSection = (
    <SectionBlock
      title="추가 기능도 켤까요?"
      label="추가 기능"
      icon="✨"
      summary={
        [draft.extras.commentReply.enabled && "댓글 답글", draft.extras.shareReply && "DM 공유", draft.extras.codeReply && "DM 코드"].filter(Boolean).join(" · ") ||
        "추가 기능 없이 DM만 보내요"
      }
      open={open.extras}
      done={done.extras}
      onOpen={() => setOpen((o) => ({ ...o, extras: true }))}
    >
      <VStack gap="x4">
        <ExtrasEditor extras={draft.extras} onChange={(extras) => set({ extras })} sendMode={original?.sendMode} code={code} username={state.account.username} />
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralSolid" onClick={() => confirmSection("extras")}>
              확인
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionBlock>
  );

  return (
    <div className="page" style={{ maxWidth: step === "template" ? 1080 : 820 }}>
      <PageHeader back onBack={goBack} title={heading.title} description={heading.desc} />
      {mode === "create" && (
        <div className="seg-progress" style={{ marginBottom: 20 }} aria-label="진행 단계">
          {segs.map((k) => (
            <span key={k} data-on={reached(k)} />
          ))}
        </div>
      )}

      {/* 고른 게시물 */}
      {step !== "post" && (
        <HStack gap="x3" className="card" align="center" style={{ padding: "12px 16px", marginBottom: 16 }}>
          <PostThumb post={draft.nextPost ? null : post} size="xs" />
          <VStack gap="x0_5" grow style={{ minWidth: 0 }}>
            <Text textStyle="t4Bold" maxLines={1}>
              {draft.nextPost ? "다음에 올릴 게시물" : postTitle(post)}
            </Text>
            <Text textStyle="t2Regular" color="fg.neutralSubtle">
              {original
                ? `${SEND_MODE_LABEL[original.sendMode]}${original.sendMode === "scheduled" ? " · 예약 발송은 게시물을 바꿀 수 없어요" : ""}`
                : selectedTemplate
                  ? `템플릿: ${selectedTemplate.name}`
                  : dupId
                    ? "복제한 설정 · 게시물만 다시 고르면 돼요"
                    : fromLink.current
                      ? "내 링크로 제안된 설정"
                      : ""}
            </Text>
          </VStack>
          {(mode === "create" || (original?.sendMode === "immediate" && !original.nextPost)) && (
            <ActionButton size="small" variant="neutralWeak" onClick={() => (mode === "create" ? setStep("post") : setPostOpen(true))}>
              게시물 바꾸기
            </ActionButton>
          )}
        </HStack>
      )}

      {mode === "edit" && changes > 0 && (
        <div style={{ marginBottom: 16 }}>
          <PageBanner tone="informative" description={`${changes}곳을 바꿨어요. 저장해야 반영돼요.`} suffix={<PageBannerButton onClick={saveEdit}>바꾼 내용 저장</PageBannerButton>} />
        </div>
      )}
      {batchSending && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="warning" description="일괄 발송은 보내는 동안 수정하거나 삭제할 수 없어요." />
        </div>
      )}
      {serverErrors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="critical" title={mode === "edit" ? "저장하지 못했어요" : "등록하지 못했어요"} description={serverErrors.join(" · ")} />
        </div>
      )}

      {step === "post" && (
        <VStack gap="x4">
          <PostPicker
            posts={postList}
            postId={draft.postId}
            nextPost={draft.nextPost}
            nextPostDisabled={pendingNext ? "이미 다음에 올릴 게시물 자동화가 있어요" : undefined}
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
                sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, code }));
                allowLeave();
                nav(`/templates/new?return=${encodeURIComponent("/automations/new")}`);
              }}
              onEdit={(t) => {
                sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, code }));
                allowLeave();
                nav(`/templates/${t.id}/edit?return=${encodeURIComponent("/automations/new")}`);
              }}
              onDelete={async (t) => {
                const ok = await confirm({
                  title: `‘${t.name}’을(를) 삭제할까요?`,
                  description: "템플릿을 지워도 그 템플릿으로 만든 자동화는 그대로 남아요.",
                  confirmLabel: "삭제",
                  danger: true,
                });
                if (!ok) return;
                await api(`/templates/${t.id}`, { method: "DELETE" });
                if (draft.templateId === t.id) setDraft((d) => ({ ...d, templateId: null }));
                void templates.reload();
                toast("템플릿을 삭제했어요");
              }}
            />
            <Text textStyle="t3Regular" color="fg.neutralSubtle">
              💡 ‘추천’ 표시가 붙은 템플릿은 많이 쓰는 템플릿이에요. 기본 템플릿의 키워드는 다음 단계에서 정해요.
            </Text>
          </VStack>
          <div className="split__aside">
            <TemplatePreviewCard
              template={selectedTemplate ? { dm: draft.dm, extras: draft.extras } : null}
              username={state.account.username}
              post={draft.nextPost ? null : post}
            />
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
                window.scrollTo({ top: 0 });
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
              description="그대로 쓰려면 ‘이대로 등록’을 누르세요. 설정 값이 마음에 안 들면 각 단계를 열어 직접 수정할 수 있어요."
            />
          )}
          {triggerSection}
          {dmSection}
          {extrasSection}

          {mode === "edit" && original?.sendMode === "scheduled" && (
            <section className="card">
              <Text as="h2" textStyle="t7Bold" style={{ marginBottom: 16 }}>
                보낼 시각
              </Text>
              {original.schedule?.firedAt ? (
                <Text color="fg.neutralMuted">이미 {fmtDateTime(original.schedule.firedAt)}에 보냈어요.</Text>
              ) : (
                <SchedulePicker at={draft.scheduleAt} continueAfter={draft.continueAfter} onChange={(at, c) => set({ scheduleAt: at, continueAfter: c })} />
              )}
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
                <ActionButton variant="neutralWeak" size="large" onClick={() => nav(`/automations/${id}`)}>
                  취소
                </ActionButton>
                <ActionButton variant="brandSolid" size="large" loading={phase === "saving"} disabled={changes === 0 || batchSending} onClick={saveEdit}>
                  바꾼 내용 저장
                </ActionButton>
              </>
            ) : (
              <>
                {fromLink.current && (
                  <ActionButton variant="neutralSolid" size="large" onClick={() => void register("immediate")}>
                    이대로 등록
                  </ActionButton>
                )}
                <ActionButton variant="brandSolid" size="large" onClick={openSendSheet}>
                  자동화 등록
                </ActionButton>
              </>
            )}
          </div>
        </VStack>
      )}

      {/* 언제 보낼까요? */}
      <Modal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        title="언제 보낼까요?"
        description="발송 방식은 등록한 뒤 바꿀 수 없어요"
        primary={{
          label: draft.sendMode === "scheduled" ? "예약하고 등록" : draft.sendMode === "batch" ? "지난 댓글에 보내기" : "자동화 등록",
          onClick: () => void register(),
        }}
      >
        <VStack gap="x4">
          <SendModeOptions
            value={draft.sendMode}
            onChange={(m) => set({ sendMode: m })}
            disabled={disabledModes}
            expanded={{
              scheduled: <SchedulePicker at={draft.scheduleAt} continueAfter={draft.continueAfter} onChange={(at, c) => set({ scheduleAt: at, continueAfter: c })} />,
            }}
          />
          {draft.sendMode !== "immediate" && draft.extras.commentReply.enabled && (
            <Callout tone="warning" description="예약·일괄 발송에서는 댓글 답글이 꺼진 채로 등록돼요 (답글이 한꺼번에 몰리면 인스타그램이 제한할 수 있어요)." />
          )}
          {siblingMode && (
            <Text textStyle="t2Regular" color="fg.neutralSubtle">
              같은 게시물에는 발송 방식을 하나만 걸 수 있어요. 다른 방식으로 바꾸려면 기존 자동화를 지우고 새로 등록해 주세요.
            </Text>
          )}
          <Text textStyle="t2Regular" color="fg.neutralSubtle">
            한 번에 DM이 많이 나가면 인스타그램 발송 한도 때문에 순서대로 나눠 보내요.
          </Text>
        </VStack>
      </Modal>

      {/* 수정: 게시물 바꾸기 (즉시 발송만) */}
      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="게시물 바꾸기" description="바꾼 게시물에는 저장한 뒤 달리는 댓글부터 보내요" wide>
        <PostGrid
          posts={postList}
          postId={draft.postId}
          onSelect={(pid) => {
            set({ postId: pid, nextPost: false });
            setPostOpen(false);
          }}
        />
      </Modal>

      {/* 등록 중 → 등록했어요 */}
      {phase !== "idle" && mode === "create" && (
        <div className="overlay-screen" role="status" aria-live="polite">
          <VStack gap="x4" align="center">
            {phase === "saving" ? (
              <ProgressCircle size="40" tone="brand" />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--seed-color-bg-positive-solid)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--seed-color-fg-on-positive-solid)",
                }}
              >
                <Icon svg={<IconCheckmarkFatFill />} size="x6" />
              </div>
            )}
            <Text textStyle="t8Bold">{phase === "saving" ? "등록 중이에요" : "자동화를 등록했어요"}</Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              {phase === "saving"
                ? "잠시만 기다려 주세요"
                : draft.sendMode === "scheduled"
                  ? `${fmtDateTime(draft.scheduleAt)}에 보내요`
                  : draft.sendMode === "batch"
                    ? "지난 댓글에 보내기 시작했어요"
                    : "이제 댓글이 달리면 DM을 보내요"}
            </Text>
            {phase === "done" && createdId && (templates.data?.mine.length ?? 0) === 0 && (
              <VStack gap="x3" align="center" className="guide-box" style={{ marginTop: 16, padding: 20, maxWidth: 380 }}>
                <Text textStyle="t5Bold">방금 만든 자동화, 템플릿으로 만들어 볼까요?</Text>
                <Text textStyle="t3Regular" color="fg.neutralMuted" align="center">
                  다음에 같은 DM을 쓸 거라면 템플릿으로 저장해 두세요. 템플릿만 고르면 DM이 한 번에 채워져요.
                </Text>
                <HStack gap="x2">
                  <ActionButton
                    variant="neutralWeak"
                    onClick={() => {
                      allowLeave();
                      nav("/");
                    }}
                  >
                    다음에
                  </ActionButton>
                  <ActionButton
                    variant="brandSolid"
                    onClick={() => {
                      allowLeave();
                      nav(`/templates/new?fromAutomation=${createdId}`);
                    }}
                  >
                    템플릿 만들기
                  </ActionButton>
                </HStack>
              </VStack>
            )}
          </VStack>
        </div>
      )}
    </div>
  );
}
