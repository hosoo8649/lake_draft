import { HStack, Text, VStack } from "@seed-design/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { cloneDeep, defaultDM, defaultExtras, reissueIds } from "@shared/factory";
import { LIMITS } from "@shared/limits";
import type { AutomationView, DMContent, Extras, Template } from "@shared/types";
import { ExtrasEditor } from "../components/automation/ExtrasEditor";
import { Conversation } from "../components/dm/Bubble";
import { DMStage } from "../components/dm/DMEditor";
import { useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Loading, PageHeader } from "../components/ui";
import { ApiError, api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { useLeaveGuard } from "../lib/useLeaveGuard";

type Step = 1 | 2 | 3;

function featureSummary(dm: DMContent, e: Extras): string {
  return (
    [
      dm.followGate.enabled && "팔로워/비팔로워 다른 DM",
      e.commentReply.enabled && "댓글 답글",
      e.shareReply && "DM 공유에 답장",
      e.codeReply && "DM 코드로 답장",
    ]
      .filter(Boolean)
      .join(" · ") || "추가 기능 없이 DM만 보내요"
  );
}

export function TemplateEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { state, links } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const all = useApi<{ mine: Template[]; builtin: Template[] }>("/templates", { live: false });
  const fromAuto = params.get("fromAutomation");
  const auto = useApi<{ automation: AutomationView }>(fromAuto ? `/automations/${fromAuto}` : null, { live: false });
  const suggestion = useApi<{ dm: DMContent; extras: Extras } | null>(params.get("fromSuggestion") ? "/templates/suggestion" : null, { live: false });

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [dm, setDm] = useState<DMContent>(defaultDM);
  const [extras, setExtras] = useState<Extras>(defaultExtras);
  const [keywordIdeas, setKeywordIdeas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [via, setVia] = useState<"comment" | "dm">("comment");
  const [touched, setTouched] = useState(false);
  const ready = useRef(false);
  const ret = params.get("return");

  const allowLeave = useLeaveGuard(touched && !saving, {
    title: id ? "템플릿 수정을 그만둘까요?" : "템플릿 만들기를 그만둘까요?",
    description: "입력한 내용은 저장되지 않아요.",
  });

  useEffect(() => {
    if (ready.current || !all.data) return;
    const defaultName = `내 템플릿 ${all.data.mine.length + 1}`;
    if (id) {
      const t = all.data.mine.find((x) => x.id === id);
      if (!t) return;
      setName(t.name);
      setDm(cloneDeep(t.dm));
      setExtras(cloneDeep(t.extras));
      setKeywordIdeas(t.keywordIdeas);
    } else if (fromAuto) {
      const a = auto.data?.automation;
      if (!a) return;
      setDm(reissueIds(a.dm));
      setExtras(cloneDeep(a.extras));
      setKeywordIdeas(a.trigger.keywords);
      setName((a.title ?? defaultName).slice(0, LIMITS.templateName));
    } else if (params.get("fromSuggestion")) {
      if (suggestion.data === undefined) return;
      if (suggestion.data) {
        setDm(reissueIds(suggestion.data.dm));
        setExtras(cloneDeep(suggestion.data.extras));
      }
      setName(defaultName);
    } else if (params.get("fromBuiltin")) {
      const t = all.data.builtin.find((x) => x.id === params.get("fromBuiltin"));
      if (t) {
        setDm(reissueIds(t.dm));
        setExtras(cloneDeep(t.extras));
        setKeywordIdeas(t.keywordIdeas);
        setName(t.name);
      }
    } else {
      setName(defaultName);
    }
    ready.current = true;
  }, [all.data, auto.data, suggestion.data, id, fromAuto, params]);

  if (!all.data || !state || (fromAuto && !auto.data)) return <Loading />;
  if (id && !all.data.mine.some((x) => x.id === id))
    return (
      <div className="page page--narrow">
        <PageHeader back="/templates" title="템플릿을 찾을 수 없어요" />
      </div>
    );

  const leave = () => nav(ret ?? "/templates");
  const touch = () => setTouched(true);

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const body = { name, dm, extras, keywordIdeas };
      const t = id ? await api<Template>(`/templates/${id}`, { method: "PUT", body }) : await api<Template>("/templates", { method: "POST", body });
      toast(id ? "템플릿을 고쳤어요. 다음에 만드는 자동화부터 바뀐 내용이 들어가요" : "템플릿을 저장했어요", "positive");
      allowLeave();
      nav(ret ? `${ret}?selectTemplate=${t.id}` : "/templates");
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiError) setErrors(e.details);
      onError(e);
    }
  };

  const titles: Record<Step, string> = {
    1: "템플릿에 넣을 공통 설정을 골라 주세요",
    2: "어떤 DM을 보낼까요?",
    3: "마지막으로 템플릿을 확인하고 이름을 정해 주세요",
  };

  return (
    <div className="page" style={{ maxWidth: step === 3 ? 980 : 760 }}>
      <PageHeader back onBack={() => (step > 1 ? setStep((step - 1) as Step) : leave())} title={titles[step]} description={id ? "템플릿 수정" : "템플릿 만들기"} />
      <div className="seg-progress" style={{ marginBottom: 20 }}>
        {[1, 2, 3].map((n) => (
          <span key={n} data-on={step >= n} />
        ))}
      </div>

      {step === 1 && (
        <VStack gap="x4">
          <Text textStyle="t3Regular" color="fg.neutralMuted">
            함께 쓸 기능을 켜요. 여러 기능을 동시에 켤 수 있어요. DM 코드는 이 템플릿으로 자동화를 만들 때마다 새로 생겨요.
          </Text>
          <ExtrasEditor
            extras={extras}
            onChange={(e) => (setExtras(e), touch())}
            showTags
            gate={{
              checked: dm.followGate.enabled,
              onChange: (v) => {
                touch();
                setDm({ ...dm, main: !v && dm.main.format === "carousel" ? { ...dm.main, format: "text" } : dm.main, followGate: { ...dm.followGate, enabled: v } });
              },
            }}
          />
          <div className="footer-bar">
            <ActionButton variant="brandSolid" size="large" onClick={() => setStep(2)}>
              다음
            </ActionButton>
          </div>
        </VStack>
      )}

      {step === 2 && (
        <VStack gap="x4" style={{ maxWidth: 480, margin: "0 auto" }}>
          <DMStage dm={dm} onChange={(d) => (setDm(d), touch())} username={state.account.username} links={links} hideGateSwitch />
          <Callout tone="neutral" description="버튼 링크는 비워 둬도 템플릿으로 저장할 수 있어요. 자동화를 만들 때 넣으면 돼요." />
          <div className="footer-bar">
            <ActionButton variant="neutralWeak" size="large" onClick={() => setStep(1)}>
              이전
            </ActionButton>
            <ActionButton variant="brandSolid" size="large" disabled={dm.main.format === "text" && !dm.main.text.trim()} onClick={() => setStep(3)}>
              다음
            </ActionButton>
          </div>
        </VStack>
      )}

      {step === 3 && (
        <div className="split">
          <VStack gap="x4">
            <section className="card">
              <VStack gap="x3">
                <TextInput label="템플릿 이름" value={name} onChange={(v) => (setName(v), touch())} max={LIMITS.templateName} autoFocus />
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  {featureSummary(dm, extras)}
                </Text>
              </VStack>
            </section>
            {errors.length > 0 && <Callout tone="critical" description={errors.join(" · ")} />}
            <Text textStyle="t3Regular" color="fg.neutralSubtle">
              템플릿에는 게시물, 댓글 조건(키워드), 발송 시점은 담기지 않아요.
            </Text>
            <div className="footer-bar" style={{ justifyContent: "flex-start" }}>
              <ActionButton variant="neutralWeak" size="large" onClick={() => setStep(2)}>
                이전
              </ActionButton>
              <ActionButton variant="brandSolid" size="large" loading={saving} disabled={!name.trim()} onClick={save}>
                저장
              </ActionButton>
            </div>
          </VStack>
          <div className="split__aside">
            <VStack gap="x3">
              {(extras.shareReply || extras.codeReply) && (
                <SegmentedControl aria-label="미리보기" value={via} onValueChange={(v) => setVia(v as "comment" | "dm")}>
                  <SegmentedControlItem value="comment">댓글에서</SegmentedControlItem>
                  <SegmentedControlItem value="dm">DM에서</SegmentedControlItem>
                </SegmentedControl>
              )}
              <div className="stage">
                <Conversation
                  dm={dm}
                  tab={dm.followGate.enabled ? "gate" : "follower"}
                  username={state.account.username}
                  via={via === "dm" ? (extras.shareReply ? "share" : "code") : "comment"}
                  code="AB7K"
                />
                {dm.followGate.enabled && <Conversation dm={dm} tab="follower" username={state.account.username} />}
              </div>
              <HStack justify="center">
                <Text textStyle="t2Regular" color="fg.neutralSubtle">
                  팬이 받게 될 DM 미리보기
                </Text>
              </HStack>
            </VStack>
          </div>
        </div>
      )}
    </div>
  );
}
