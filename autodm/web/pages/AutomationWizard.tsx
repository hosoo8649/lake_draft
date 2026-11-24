import { IconCheckmarkFatFill, IconChevronDownLine } from "@karrotmarket/react-monochrome-icon";
import { Box, HStack, Icon, Text, VStack } from "@seed-design/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { ActionableCallout, Callout } from "seed-design/ui/callout";
import { ResultSection } from "seed-design/ui/result-section";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { cloneDeep, defaultDM, defaultExtras, emptyButton, reissueIds, textMessage } from "@shared/factory";
import { GENERIC_KEYWORD_IDEAS } from "@shared/presets";
import type { AutomationView, DMContent, Extras, LinkItem, SendMode, Template, Trigger } from "@shared/types";
import { effectiveMode, keywordKey, validateDM, validateExtras, validateTrigger } from "@shared/validation";
import { ExtrasEditor } from "../components/automation/ExtrasEditor";
import { KeywordInput } from "../components/automation/KeywordInput";
import { PostGrid, PostPicker, TemplateList, TemplatePreviewCard, type PostWithMeta } from "../components/automation/Pickers";
import { SchedulePicker, SendModeOptions, defaultScheduleAt } from "../components/automation/SendMode";
import { DMStage } from "../components/dm/DMEditor";
import { useConfirm, useErrorToast, useToast, useDismissToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Modal } from "../components/Modal";
import { Loading, PageHeader, PostThumb, FooterBar } from "../components/ui";
import { RadioSelectBoxItem, RadioSelectBoxRadiomark, RadioSelectBoxRoot } from "seed-design/ui/select-box";
import { IconDot3HorizontalChatbubbleLeftLine, IconMagnifyingglassLine } from "@karrotmarket/react-monochrome-icon";
import { ApiError, api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { SEND_MODE_LABEL, fmtDateTime, josa, postTitle, triggerSummary } from "../lib/format";
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

/** 이 탭에 저장해 둔 만들던 자동화 (30분 안에 저장한 것만) */
function readDraft(): {
  draft: Draft;
  code?: string;
  open?: Record<Sec, boolean>;
  done?: Record<Sec, boolean>;
  fromLink?: boolean;
} | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.draft || (v.at && Date.now() - v.at > 30 * 60_000)) return null;
    return v;
  } catch {
    return null;
  }
}

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
  return t.keywords.length
    ? `${t.keywords.map((k) => `‘${k}’`).join(" ")}${josa(t.keywords[t.keywords.length - 1], "이/가")} 들어간 댓글`
    : "키워드를 넣어 주세요";
}

/** 최종 확인의 각 단계 — 확인을 마치면 한 줄 요약으로 접혀요 */
function SectionBlock(props: {
  id: string;
  title: string;
  label: string;
  summary: string;
  open: boolean;
  done: boolean;
  onOpen: () => void;
  children: React.ReactNode;
  icon: string;
  /** 이 단계에서 해야 할 일 안내 (등록을 눌렀는데 아직 확인하지 않았을 때) */
  nudge?: string | null;
  /** 이 단계의 오류 — 알림(토스트) 대신 그 자리에 계속 보여요 */
  errors?: string[];
}) {
  if (!props.open)
    return (
      <button type="button" id={props.id} className="summary-card" onClick={props.onOpen} aria-label={`${props.title} 다시 열기`}>
        <span className="list-icon" style={{ fontSize: "var(--seed-font-size-t6)" }}>
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
    <section className="card" id={props.id} style={{ scrollMarginTop: 16 }}>
      <Text as="h2" textStyle="t7Bold" style={{ marginBottom: 16 }}>
        {props.title}
      </Text>
      {props.nudge && (
        <Box pb="x4">
          <Callout tone="informative" description={props.nudge} />
        </Box>
      )}
      {props.errors && props.errors.length > 0 && (
        <Box pb="x4">
          <Callout tone="critical" description={props.errors.join(" · ")} />
        </Box>
      )}
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
  // 만들기 단계는 주소(?step=)에도 남겨요 → 뒤로 가기는 이전 단계로, 새로고침해도 이어서
  const urlStep = mode === "create" ? ((params.get("step") as Step | null) ?? "post") : null;
  const [step, setStepState] = useState<Step>(urlStep ?? "post");
  const setStep = (s: Step) => {
    setStepState(s);
    if (mode !== "create") return;
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set("step", s);
        n.delete("selectTemplate");
        n.delete("template");
        return n;
      },
      { replace: false },
    );
  };
  useEffect(() => {
    if (urlStep && urlStep !== step) setStepState(urlStep);
  }, [urlStep]);
  const dismissToast = useDismissToast();
  const previewRef = useRef<HTMLDivElement>(null);
  // 단계를 넘기면 이전 단계의 알림은 닫아요
  useEffect(() => dismissToast(), [step]);
  const [open, setOpen] = useState<Record<Sec, boolean>>({ trigger: true, dm: false, extras: false });
  const [done, setDone] = useState<Record<Sec, boolean>>({ trigger: false, dm: false, extras: false });
  const [touched, setTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  /** 등록을 눌렀는데 아직 확인하지 않은 단계 */
  const [nudge, setNudge] = useState<Sec | null>(null);
  /** 게시물을 고르지 않고 다음을 눌렀을 때 */
  const [postError, setPostError] = useState(false);
  const scrollToSection = (s: Sec) =>
    requestAnimationFrame(() => document.getElementById(`sec-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  // 만드는 중인 내용은 이 탭에 계속 저장해 둬요 (새로고침·템플릿 편집 다녀오기에도 이어서)
  useEffect(() => {
    if (mode !== "create" || !touched || phase !== "idle") return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, code, open, done, fromLink: fromLink.current, at: Date.now() }));
  }, [mode, touched, phase, draft, code, open, done]);

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
      // 꺼 둔 코드는 다시 쓸 수 없어요 — 다시 켜면 저장할 때 새 코드가 만들어져요
      setCode(a.codeRetired && !a.extras.codeReply ? "" : a.code);
      setStep("final");
      setOpen({ trigger: true, dm: true, extras: true });
      setDone({ trigger: true, dm: true, extras: true });
      return;
    }
    // 새로고침·뒤로 가기·템플릿 편집에서 돌아왔을 때 만들던 내용을 이어서
    const saved = readDraft();
    const back = params.get("selectTemplate");
    if (saved && (params.get("step") || back || params.get("restore"))) {
      initialized.current = true;
      setDraft(saved.draft);
      if (saved.code) setCode(saved.code);
      if (saved.open) setOpen(saved.open);
      if (saved.done) setDone(saved.done);
      fromLink.current = !!saved.fromLink;
      setTouched(true);
      if (back) setStepState("template");
      void templates.reload();
      return;
    }
    if (!params.get("step")) sessionStorage.removeItem(DRAFT_KEY);
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

  // 템플릿 화면의 "이 템플릿으로 자동화 만들기" / 템플릿을 만들거나 고치고 돌아왔을 때 — 한 번만 적용
  useEffect(() => {
    if (!templates.data) return;
    const tid = params.get("template") ?? params.get("selectTemplate");
    if (!tid) return;
    const t = [...templates.data.mine, ...templates.data.builtin].find((x) => x.id === tid);
    if (!t) return;
    // 다른 템플릿을 고치고 돌아왔다면 원래 고른 템플릿을 그대로 둬요 (고른 템플릿을 고쳤을 때만 다시 적용)
    const edited = params.get("edited") === "1";
    if (!edited || readDraft()?.draft.templateId === tid) applyTemplate(t);
    params.delete("template");
    params.delete("selectTemplate");
    params.delete("edited");
    setParams(params, { replace: true });
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
  const siblingMode = siblings.map(effectiveMode).find((m): m is SendMode => !!m);
  const pendingNext = (home.data?.automations ?? []).some((a) => a.id !== id && a.nextPost && !a.postId);
  // 이 게시물에 이미 모든 댓글 자동화가 있으면 처음부터 키워드 댓글로 골라 둬요
  useEffect(() => {
    if (mode === "create" && allTaken && draft.trigger.type === "all") setDraft((d) => ({ ...d, trigger: { type: "keyword", keywords: [] } }));
  }, [mode, allTaken, draft.trigger.type]);

  const selectedTemplate = useMemo(() => {
    const all = [...(templates.data?.mine ?? []), ...(templates.data?.builtin ?? [])];
    return all.find((t) => t.id === draft.templateId) ?? null;
  }, [templates.data, draft.templateId]);

  /* ───── 검증 ───── */
  // 복제하거나 게시물을 바꿨을 때 이미 이 게시물에 걸린 키워드·모든 댓글과 겹치는지 바로 알려 줘요
  const takenKeys = new Set(usedOnPost.map(keywordKey));
  const triggerErrors = [
    ...validateTrigger(draft.trigger),
    ...(draft.trigger.type === "keyword"
      ? draft.trigger.keywords.filter((k) => takenKeys.has(keywordKey(k))).map((k) => `이미 이 게시물에 걸린 키워드예요: ${k}`)
      : allTaken
        ? ["이 게시물에는 이미 모든 댓글 자동화가 있어요. 키워드 댓글로 바꾸거나 다른 게시물을 골라 주세요"]
        : []),
  ];
  // 기본 템플릿의 예시 날짜(00월 00일)를 그대로 보내지 않게
  const placeholderLeft = [draft.dm.main.text, draft.dm.followGate.nonFollower.text, draft.dm.followGate.gateText].some((t) =>
    /00월\s*00일/.test(t ?? ""),
  );
  const dmErrors = [...validateDM(draft.dm), ...(placeholderLeft ? ["DM의 예시 날짜(00월 00일)를 실제 날짜로 바꿔 주세요"] : [])];
  const extrasErrors = validateExtras(draft.extras, original?.sendMode ?? "immediate");

  const confirmSection = (s: Sec) => {
    const errs = s === "trigger" ? triggerErrors : s === "dm" ? dmErrors : extrasErrors;
    if (errs.length) {
      // 오류는 토스트 대신 그 단계 안에 계속 보여 주고, 그 자리로 이동해요
      setShowErrors(true);
      scrollToSection(s);
      return;
    }
    const next = SECS[SECS.indexOf(s) + 1];
    if (nudge === s) setNudge(null);
    dismissToast();
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
      const a = await api<AutomationView>("/automations", { method: "POST", body: body(sendMode) });
      setCreatedId(a.id);
      setPhase("done");
      sessionStorage.removeItem(DRAFT_KEY);
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
      setPostError(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (skipTemplate) {
      // 복제·내 링크에서 시작하면 내용이 이미 채워져 있어요 → 확인을 마친 상태로 열고, 문제 있는 단계만 펼쳐요
      const bad: Sec | null = triggerErrors.length ? "trigger" : dmErrors.length ? "dm" : extrasErrors.length ? "extras" : null;
      setDone({ trigger: bad !== "trigger", dm: bad !== "dm", extras: bad !== "extras" });
      setOpen({ trigger: bad === "trigger", dm: bad === "dm", extras: bad === "extras" });
      if (bad) setShowErrors(true);
    }
    setStep(skipTemplate ? "final" : "template");
    window.scrollTo({ top: 0 });
  };

  const goBack = () => {
    if (mode === "edit") return nav(`/automations/${id}`);
    if (step === "final" && !skipTemplate) return setStep("template");
    if (step === "final" || step === "template") return setStep("post");
    nav("/");
  };

  /** 등록 전 확인 — 문제가 있는 단계를 펼치고 그 자리로 이동해요 (두 등록 버튼 모두 같은 확인) */
  const readyToRegister = (): boolean => {
    if (!SECS.every((s) => done[s]) && !fromLink.current) {
      const first = SECS.find((s) => !done[s])!;
      setOpen((o) => ({ ...o, [first]: true }));
      setNudge(first);
      scrollToSection(first);
      return false;
    }
    const errs = [...triggerErrors, ...dmErrors, ...extrasErrors];
    if (errs.length) {
      setShowErrors(true);
      const first: Sec = triggerErrors.length ? "trigger" : dmErrors.length ? "dm" : "extras";
      setOpen((o) => ({ ...o, [first]: true }));
      setDone((d) => ({ ...d, [first]: false }));
      scrollToSection(first);
      return false;
    }
    return true;
  };

  const openSendSheet = () => {
    if (!readyToRegister()) return;
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
        ? {
            title: dupId ? "복제한 자동화를 어느 게시물에 걸까요?" : "어떤 게시물의 댓글에 반응할까요?",
            desc: dupId
              ? `${dup.data?.automation.title ? `‘${dup.data.automation.title}’` : dup.data ? triggerSummary(dup.data.automation.trigger) : ""} 자동화의 조건·DM·추가 기능을 그대로 가져와요. 같은 게시물이면 키워드는 바꿔 주세요`
              : "캐러셀·릴스도 고를 수 있어요",
          }
        : step === "template"
          ? { title: "어떤 템플릿으로 보낼까요?", desc: "템플릿을 고르면 팬이 받을 DM을 미리 볼 수 있어요" }
          : { title: "최종 확인", desc: "아래 세 가지를 차례로 확인해 주세요. 확인을 마친 단계는 한 줄 요약으로 접혀요." };

  /* ───── 최종 확인 세 단계 ───── */
  const triggerSection = (
    <SectionBlock
      id="sec-trigger"
      nudge={nudge === "trigger" ? "이 단계를 확인하고 ‘다음’을 눌러 주세요" : null}
      // 키워드 칸이 직접 보여 주는 오류(빈 키워드·겹치는 키워드)는 빼고 보여요
      errors={showErrors ? triggerErrors.filter((e) => !e.startsWith("키워드를 넣어") && !e.startsWith("이미 이 게시물에 걸린 키워드")) : undefined}
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
        <RadioSelectBoxRoot
          aria-label="보낼 댓글"
          value={draft.trigger.type}
          onValueChange={(v) => {
            const t = v as "all" | "keyword";
            set({ trigger: { type: t, keywords: t === "all" ? [] : draft.trigger.keywords } });
          }}
        >
          {(["all", "keyword"] as const).map((t) => {
            const disabled = scheduledLocked || (t === "all" && allTaken && draft.trigger.type !== "all");
            return (
              <RadioSelectBoxItem
                key={t}
                value={t}
                disabled={disabled}
                prefixIcon={t === "all" ? <IconDot3HorizontalChatbubbleLeftLine /> : <IconMagnifyingglassLine />}
                label={t === "all" ? "모든 댓글" : "키워드 댓글"}
                description={
                  t === "all"
                    ? disabled && !scheduledLocked
                      ? "이 게시물에는 이미 모든 댓글 자동화가 있어요 (게시물마다 하나)"
                      : "댓글을 남긴 모든 분께 DM을 보내요"
                    : "지정한 키워드가 포함된 댓글에만 DM을 보내요"
                }
                suffix={<RadioSelectBoxRadiomark />}
              />
            );
          })}
        </RadioSelectBoxRoot>
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
            <ActionButton variant="neutralWeak" onClick={() => confirmSection("trigger")}>
              다음
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionBlock>
  );

  const dmSection = (
    <SectionBlock
      id="sec-dm"
      nudge={nudge === "dm" ? "이 단계를 확인하고 ‘다음’을 눌러 주세요" : null}
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
            <ActionButton variant="neutralWeak" onClick={() => confirmSection("dm")}>
              다음
            </ActionButton>
          </HStack>
        )}
      </VStack>
    </SectionBlock>
  );

  const extrasSection = (
    <SectionBlock
      id="sec-extras"
      nudge={nudge === "extras" ? "이 단계를 확인하고 ‘확인’을 눌러 주세요" : null}
      errors={showErrors ? extrasErrors : undefined}
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
        <ExtrasEditor extras={draft.extras} onChange={(extras) => set({ extras })} sendMode={original?.sendMode} code={code || undefined} username={state.account.username} />
        {mode === "create" && (
          <HStack justify="flex-end">
            <ActionButton variant="neutralWeak" onClick={() => confirmSection("extras")}>
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
            <ActionButton size="small" variant="neutralWeak" onClick={() => setPostOpen(true)}>
              게시물 바꾸기
            </ActionButton>
          )}
        </HStack>
      )}

      {mode === "edit" && changes > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="informative" description={`${changes}곳을 바꿨어요. 아래 ‘바꾼 내용 저장’을 눌러야 반영돼요.`} />
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
            onChange={(v) => (setPostError(false), set(v))}
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
          {postError && !draft.postId && !draft.nextPost && <Callout tone="critical" description="자동화를 걸 게시물을 골라 주세요." />}
          {post?.restricted && (
            <Callout
              tone="warning"
              title="제한된 게시물이에요"
              description="연령 제한 등으로 제한된 게시물은 댓글 DM이 동작하지 않아요. 추가 기능에서 DM 공유·DM 코드를 함께 켜 두세요."
            />
          )}
          <FooterBar>
            <ActionButton variant="brandSolid" size="large" onClick={nextFromPost}>
              다음
            </ActionButton>
          </FooterBar>
        </VStack>
      )}

      {step === "template" && (
        <div className="split">
          <VStack gap="x4">
            <TemplateList
              mine={templates.data.mine}
              builtin={templates.data.builtin}
              selectedId={draft.templateId}
              onSelect={(t) => {
                applyTemplate(t);
                // 휴대폰에서는 미리보기가 목록 아래에 있어서, 고르면 미리보기로 내려가요
                if (window.matchMedia("(max-width: 767px)").matches)
                  requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}
              onAdd={() => {
                sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, code, open, done, fromLink: fromLink.current, at: Date.now() }));
                allowLeave();
                nav(`/templates/new?return=${encodeURIComponent("/automations/new?step=template")}`);
              }}
              onEdit={(t) => {
                sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, code, open, done, fromLink: fromLink.current, at: Date.now() }));
                allowLeave();
                nav(`/templates/${t.id}/edit?return=${encodeURIComponent("/automations/new?step=template&edited=1")}`);
              }}
              onDelete={async (t) => {
                const ok = await confirm({
                  title: `‘${t.name}’${josa(t.name, "을/를")} 삭제할까요?`,
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
          <div className="split__aside" ref={previewRef} style={{ scrollMarginTop: 12 }}>
            <TemplatePreviewCard
              template={selectedTemplate ? { dm: draft.dm, extras: draft.extras } : null}
              username={state.account.username}
              post={draft.nextPost ? null : post}
            />
          </div>
          <FooterBar style={{ gridColumn: "1 / -1" }}>
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
          </FooterBar>
        </div>
      )}

      {step === "final" && (
        <VStack gap="x3">
          {fromLink.current && mode === "create" && (
            <Callout
              tone="informative"
              title="이 게시물의 모든 댓글에 링크를 안내하는 DM을 제안했어요"
              description="‘즉시 발송으로 등록’을 누르면 지금부터 바로 보내요. 예약·일괄 발송으로 보내려면 ‘자동화 등록’을 눌러 발송 방식을 골라요. 설정이 마음에 안 들면 각 단계를 열어 고칠 수 있어요."
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

          <FooterBar>
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
                  <ActionButton variant="neutralWeak" size="large" onClick={() => readyToRegister() && void register("immediate")}>
                    즉시 발송으로 등록
                  </ActionButton>
                )}
                <ActionButton variant="brandSolid" size="large" onClick={openSendSheet}>
                  자동화 등록
                </ActionButton>
              </>
            )}
          </FooterBar>
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
      <Modal
        open={postOpen}
        onClose={() => setPostOpen(false)}
        title="게시물 바꾸기"
        description={mode === "edit" ? "바꾼 게시물에는 저장한 뒤 달리는 댓글부터 보내요" : "확인한 키워드·DM·추가 기능은 그대로 둬요"}
        wide
      >
        <PostGrid
          posts={postList}
          postId={draft.postId}
          onSelect={(pid) => {
            set({ postId: pid, nextPost: false });
            setPostOpen(false);
          }}
        />
      </Modal>

      {/* 등록 중 → 등록했어요 (SEED ResultSection) */}
      {phase !== "idle" && mode === "create" && (
        <div className="overlay-screen" role="status" aria-live="polite">
          {phase === "saving" ? (
            <VStack align="center" gap="x4">
              <ProgressCircle size="40" tone="neutral" />
              <Text textStyle="t5Bold">등록 중이에요</Text>
            </VStack>
          ) : (
            <VStack gap="x4" align="center" style={{ width: "min(420px, calc(100vw - 32px))" }}>
              <ResultSection
                asset={
                  <span className="result-check" aria-hidden>
                    <Icon svg={<IconCheckmarkFatFill />} size="x6" />
                  </span>
                }
                title="자동화를 등록했어요"
                description={
                  draft.nextPost
                    ? "다음 게시물을 올리면 첫 댓글이 달릴 때 연결되고, 그때부터 DM을 보내요."
                    : draft.sendMode === "scheduled"
                      ? `${fmtDateTime(draft.scheduleAt)}에 모아 둔 댓글에 보내요.`
                      : draft.sendMode === "batch"
                        ? "지난 댓글에 보내기 시작했어요. 진행 상황은 자동화 상세에서 볼 수 있어요."
                        : "이제 댓글이 달리면 DM을 보내요."
                }
                primaryActionProps={
                  state.account.mode === "demo" && !draft.nextPost && draft.sendMode === "immediate"
                    ? {
                        children: "시뮬레이터에서 바로 시험하기",
                        variant: "brandSolid",
                        onClick: () => {
                          allowLeave();
                          const kw = draft.trigger.type === "keyword" ? draft.trigger.keywords[0] : "";
                          nav(`/simulator?postId=${draft.postId}${kw ? `&text=${encodeURIComponent(`${kw} 주세요!`)}` : ""}`);
                        },
                      }
                    : {
                        children: "자동화 보기",
                        variant: "neutralSolid",
                        onClick: () => {
                          allowLeave();
                          nav(createdId ? `/automations/${createdId}` : "/");
                        },
                      }
                }
                secondaryActionProps={{
                  children: "홈으로",
                  variant: "neutralWeak",
                  onClick: () => {
                    allowLeave();
                    nav("/");
                  },
                }}
              />
              {createdId && (templates.data?.mine.length ?? 0) === 0 && (
                <ActionableCallout
                  tone="neutral"
                  title="이 DM을 템플릿으로 저장할까요?"
                  description="다음에 같은 DM을 쓸 때 템플릿만 고르면 한 번에 채워져요."
                  onClick={() => {
                    allowLeave();
                    nav(`/templates/new?fromAutomation=${createdId}`);
                  }}
                />
              )}
            </VStack>
          )}
        </div>
      )}
    </div>
  );
}
