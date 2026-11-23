import { HStack, Text, VStack } from "@seed-design/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { Switch } from "seed-design/ui/switch";
import { cloneDeep, defaultDM, defaultExtras, reissueIds } from "@shared/factory";
import { LIMITS } from "@shared/limits";
import type { AutomationView, DMContent, Extras, Template } from "@shared/types";
import { ExtrasEditor } from "../components/automation/ExtrasEditor";
import { DMEditor } from "../components/dm/DMEditor";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Loading, PageHeader, Progress } from "../components/ui";
import { ApiError, api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";

type Step = 1 | 2 | 3;

export function TemplateEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { state, links } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  const all = useApi<{ mine: Template[]; builtin: Template[] }>("/templates", { live: false });
  const fromAuto = params.get("fromAutomation");
  const auto = useApi<{ automation: AutomationView }>(fromAuto ? `/automations/${fromAuto}` : null, { live: false });
  const suggestion = useApi<{ dm: DMContent; extras: Extras } | null>(params.get("fromSuggestion") ? "/templates/suggestion" : null, {
    live: false,
  });

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [dm, setDm] = useState<DMContent>(defaultDM);
  const [extras, setExtras] = useState<Extras>(defaultExtras);
  const [keywordIdeas, setKeywordIdeas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const ready = useRef(false);

  useEffect(() => {
    if (ready.current || !all.data) return;
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
      setName((a.title ?? "").slice(0, LIMITS.templateName));
    } else if (params.get("fromSuggestion")) {
      if (suggestion.data === undefined) return;
      if (suggestion.data) {
        setDm(reissueIds(suggestion.data.dm));
        setExtras(cloneDeep(suggestion.data.extras));
      }
    } else if (params.get("fromBuiltin")) {
      const t = all.data.builtin.find((x) => x.id === params.get("fromBuiltin"));
      if (t) {
        setDm(reissueIds(t.dm));
        setExtras(cloneDeep(t.extras));
        setKeywordIdeas(t.keywordIdeas);
        setName(t.name);
      }
    }
    ready.current = true;
  }, [all.data, auto.data, suggestion.data, id, fromAuto, params]);

  if (!all.data || !state || (fromAuto && !auto.data)) return <Loading />;

  const leave = async () => {
    const ok = await confirm({ title: "템플릿 만들기를 그만둘까요?", description: "입력한 내용은 저장되지 않아요.", confirmLabel: "나가기" });
    if (ok) nav(params.get("return") ?? "/templates");
  };

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const body = { name, dm, extras, keywordIdeas };
      const t = id
        ? await api<Template>(`/templates/${id}`, { method: "PUT", body })
        : await api<Template>("/templates", { method: "POST", body });
      toast(id ? "템플릿을 고쳤어요. 다음에 만드는 자동화부터 바뀐 내용이 들어가요" : "템플릿을 저장했어요", "positive");
      const ret = params.get("return");
      nav(ret ? `${ret}?selectTemplate=${t.id}` : "/templates");
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.details);
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  const title = id ? "템플릿 수정" : "새 템플릿 만들기";
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <PageHeader
        back
        onBack={leave}
        title={title}
        description={
          step === 1
            ? "1단계 · 템플릿에 넣을 공통 설정을 골라 주세요"
            : step === 2
              ? "2단계 · 어떤 DM을 보낼까요?"
              : "3단계 · 마지막으로 템플릿을 확인하고 이름을 정해 주세요"
        }
      />
      <div style={{ marginBottom: 20 }}>
        <Progress value={step / 3} />
      </div>

      {step === 1 && (
        <VStack gap="x4">
          <section className="card">
            <HStack justify="space-between" align="flex-start" gap="x4">
              <VStack gap="x0_5">
                <Text textStyle="t5Bold">팔로워/비팔로워에게 다른 DM 보내기</Text>
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  팔로우 확인 후 보내기를 켜요. 다음 단계에서 팔로워용 DM과 아직 팔로우 전인 팬용 DM을 따로 써요
                </Text>
              </VStack>
              <Switch
                checked={dm.followGate.enabled}
                onCheckedChange={(v) =>
                  setDm({
                    ...dm,
                    main: !v && dm.main.format === "carousel" ? { ...dm.main, format: "text" } : dm.main,
                    followGate: { ...dm.followGate, enabled: v },
                  })
                }
                aria-label="팔로워/비팔로워에게 다른 DM 보내기"
              />
            </HStack>
          </section>
          <section className="card">
            <ExtrasEditor extras={extras} onChange={setExtras} />
          </section>
          <Text textStyle="t3Regular" color="fg.neutralSubtle">
            DM 공유·DM 코드를 켜 두면 이 템플릿으로 만드는 자동화에 같이 켜져요. DM 코드는 자동화마다 새로 생겨요.
          </Text>
          <div className="footer-bar">
            <ActionButton variant="brandSolid" size="large" onClick={() => setStep(2)}>
              다음
            </ActionButton>
          </div>
        </VStack>
      )}

      {step === 2 && (
        <VStack gap="x4" style={{ maxWidth: 460, margin: "0 auto" }}>
          <DMEditor dm={dm} onChange={setDm} username={state.account.username} links={links} gateSwitch="hidden" />
          <Callout tone="neutral" description="버튼 링크는 비워 둬도 템플릿으로 저장할 수 있어요. 자동화를 만들 때 넣으면 돼요." />
          <div className="footer-bar">
            <ActionButton variant="neutralWeak" size="large" onClick={() => setStep(1)}>
              이전
            </ActionButton>
            <ActionButton
              variant="brandSolid"
              size="large"
              disabled={dm.main.format === "text" && !dm.main.text.trim()}
              onClick={() => setStep(3)}
            >
              다음
            </ActionButton>
          </div>
        </VStack>
      )}

      {step === 3 && (
        <div className="split">
          <VStack gap="x4">
            <section className="card">
              <TextInput label="템플릿 이름" value={name} onChange={setName} max={LIMITS.templateName} placeholder="예: 공구 오픈 안내" autoFocus />
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
            <DMEditor dm={dm} username={state.account.username} links={links} gateSwitch="hidden" />
          </div>
        </div>
      )}
    </div>
  );
}
