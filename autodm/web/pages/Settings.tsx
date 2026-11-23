import { HStack, Text, VStack } from "@seed-design/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { Switch } from "seed-design/ui/switch";
import type { Settings } from "@shared/types";
import { useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Loading, PageHeader, Section } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/appState";

function Row(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <HStack justify="space-between" align="flex-start" gap="x4" py="x3">
      <VStack gap="x0_5">
        <Text textStyle="t5Bold">{props.title}</Text>
        <Text textStyle="t3Regular" color="fg.neutralMuted">
          {props.description}
        </Text>
      </VStack>
      {props.children}
    </HStack>
  );
}

export function SettingsPage() {
  const { state, reload } = useAppState();
  const nav = useNavigate();
  const toast = useToast();
  const onError = useErrorToast();
  const [rate, setRate] = useState("");
  const [base, setBase] = useState("");

  useEffect(() => {
    if (state) {
      setRate(String(state.settings.rateLimitPerHour));
      setBase(state.settings.publicBaseUrl);
    }
  }, [state?.settings.rateLimitPerHour, state?.settings.publicBaseUrl]);

  if (!state) return <Loading />;
  const s = state.settings;

  const patch = async (p: Partial<Settings>, msg?: string) => {
    try {
      await api("/settings", { method: "PATCH", body: p });
      await reload();
      if (msg) toast(msg, "positive");
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="page page--narrow">
      <PageHeader title="설정" description="운영 일시 중지, 발송 한도, 연동 정보를 관리해요" />
      <VStack gap="x4">
        <Section title="운영" description="이벤트가 끝났거나 링크를 잠깐 바꿔야 할 때, 자동화를 하나씩 끄지 않고 여기서 한 번에 멈출 수 있어요">
          <Row title="DM 자동 발송" description="끄면 댓글이 달려도 DM을 보내지 않아요. 즉시·예약 발송과 DM 공유·코드 답장이 모두 멈춰요. 이미 시작한 일괄 발송은 끝까지 보내요.">
            <Switch
              checked={!s.dmPaused}
              onCheckedChange={(v) => patch({ dmPaused: !v }, v ? "DM 자동 발송을 다시 켰어요" : "DM 자동 발송을 멈췄어요")}
              aria-label="DM 자동 발송"
            />
          </Row>
          <Row title="댓글 자동 답글" description="답글만 따로 멈출 수 있어요. DM 발송을 멈추면 답글도 함께 멈춰요.">
            <Switch
              checked={!s.replyPaused && !s.dmPaused}
              disabled={s.dmPaused}
              onCheckedChange={(v) => patch({ replyPaused: !v }, v ? "댓글 자동 답글을 다시 켰어요" : "댓글 자동 답글을 멈췄어요")}
              aria-label="댓글 자동 답글"
            />
          </Row>
          {(s.dmPaused || s.replyPaused) && (
            <HStack pt="x2">
              <ActionButton variant="brandSolid" onClick={() => patch({ dmPaused: false, replyPaused: false }, "모두 다시 켰어요")}>
                모두 다시 켜기
              </ActionButton>
            </HStack>
          )}
        </Section>

        <Section title="발송 한도" description="인스타그램은 계정마다 일정 시간 동안 보낼 수 있는 DM 수를 제한해요. 넘는 만큼은 대기열에 두었다가 순차로 보내요.">
          <HStack gap="x2" align="flex-end">
            <div style={{ width: 200 }}>
              <TextInput label="시간당 최대 DM 수" type="number" value={rate} onChange={setRate} suffix="건/시간" />
            </div>
            <ActionButton
              variant="neutralWeak"
              disabled={!rate || Number(rate) === s.rateLimitPerHour}
              onClick={() => patch({ rateLimitPerHour: Number(rate) }, "발송 한도를 저장했어요")}
            >
              저장
            </ActionButton>
          </HStack>
        </Section>

        <Section title="공개 주소 (실제 인스타그램 연동용)" description="인스타그램 로그인 리디렉션·웹훅·버튼 클릭 추적에 쓰는 HTTPS 주소예요. PC에서는 cloudflared·ngrok 같은 터널 주소를 넣어요.">
          <VStack gap="x3">
            <HStack gap="x2" align="flex-end">
              <div style={{ flex: 1 }}>
                <TextInput label="공개 주소" placeholder="https://xxxx.trycloudflare.com" value={base} onChange={setBase} />
              </div>
              <ActionButton variant="neutralWeak" disabled={base === s.publicBaseUrl} onClick={() => patch({ publicBaseUrl: base }, "공개 주소를 저장했어요")}>
                저장
              </ActionButton>
            </HStack>
            {state.publicBaseUrl && (
              <Callout
                tone="neutral"
                title="Meta 개발자 앱에 넣을 주소"
                description={`OAuth 리디렉션: ${state.redirectUri}  ·  웹훅 콜백: ${state.webhookUrl}  ·  확인 토큰: .env의 WEBHOOK_VERIFY_TOKEN`}
              />
            )}
          </VStack>
        </Section>

        <Section title="그 밖의 메뉴">
          <VStack gap="x2">
            <Row title="계정" description={`@${state.account.username} · ${state.account.mode === "demo" ? "데모" : "인스타그램 연동"} — 연동 상태 확인, 다시 연동, 해지`}>
              <ActionButton size="small" variant="neutralWeak" onClick={() => nav("/connect")}>
                관리
              </ActionButton>
            </Row>
            {state.account.mode === "demo" && (
              <Row title="시뮬레이터" description="팬이 되어 댓글·DM·버튼을 눌러 보며 자동화를 시험해요">
                <ActionButton size="small" variant="neutralWeak" onClick={() => nav("/simulator")}>
                  열기
                </ActionButton>
              </Row>
            )}
            <Row title="도움말" description="DM이 전송되지 않을 때 확인할 것들">
              <ActionButton size="small" variant="neutralWeak" onClick={() => nav("/help")}>
                열기
              </ActionButton>
            </Row>
          </VStack>
        </Section>
      </VStack>
    </div>
  );
}
