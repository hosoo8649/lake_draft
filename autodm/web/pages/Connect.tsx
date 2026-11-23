import { HStack, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { Checkbox } from "seed-design/ui/checkbox";
import { ResultSection } from "seed-design/ui/result-section";
import { Avatar } from "../components/dm/Phone";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { Modal } from "../components/Modal";
import { PageHeader, Section } from "../components/ui";
import { api } from "../lib/api";
import { useAppState } from "../lib/appState";
import { fmtDateTime, fmtNumber } from "../lib/format";

const ERRORS: Record<string, string> = {
  not_configured: "실제 인스타그램 연동을 쓰려면 서버의 .env에 IG_APP_ID와 IG_APP_SECRET을 넣어 주세요.",
  no_public_url: "인스타그램 로그인은 HTTPS 공개 주소가 필요해요. .env의 PUBLIC_BASE_URL(또는 설정 > 공개 주소)을 넣어 주세요.",
  state: "보안 확인에 실패했어요. 같은 브라우저에서 처음부터 다시 연동해 주세요.",
  denied: "인스타그램에서 권한을 허용하지 않았어요. 모든 권한을 허용해야 자동 DM이 동작해요.",
  user_denied: "인스타그램에서 권한을 허용하지 않았어요. 모든 권한을 허용해야 자동 DM이 동작해요.",
};

const PERMISSIONS = [
  "프로필 조회 및 미디어 액세스",
  "댓글 액세스 및 관리",
  "메시지 액세스 및 관리",
  "콘텐츠 액세스 및 게시",
  "인사이트 액세스 및 관리",
];

function TermsModal(props: { open: boolean; onClose: () => void; onAgree: () => void }) {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="연동을 위해 아래 정보 제공에 동의해 주세요"
      primary={{ label: "동의하고 계속", onClick: props.onAgree, disabled: !(a && b) }}
    >
      <VStack gap="x4">
        <Checkbox label="모두 동의하기" weight="bold" checked={a && b} onCheckedChange={(v) => (setA(v), setB(v))} />
        <VStack gap="x2" pl="x2">
          <Checkbox label="서비스 이용약관 (필수) — 내 PC에 저장되는 자동화 설정·발송 기록 이용" checked={a} onCheckedChange={setA} />
          <Checkbox label="개인정보 처리 (필수) — 댓글 작성자 아이디·댓글 내용을 DM 발송에만 사용" checked={b} onCheckedChange={setB} />
        </VStack>
        <Callout
          tone="warning"
          title="인스타그램 권한 화면에서 모두 허용해 주세요"
          description={`${PERMISSIONS.join(" · ")} — 하나라도 꺼 두면 자동 DM이 제대로 동작하지 않아요.`}
        />
        <Text textStyle="t3Regular" color="fg.neutralMuted">
          로그인 칸에는 이메일·전화번호가 아니라 인스타그램 아이디(@ 없이)를 직접 입력해 주세요. 다른 계정으로 연동되는 걸 막을 수 있어요.
        </Text>
      </VStack>
    </Modal>
  );
}

export function ConnectPage() {
  const { state, reload } = useAppState();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const acc = state?.account;
  const err = params.get("error");

  const startDemo = async () => {
    if (acc?.connected) {
      const ok = await confirm({
        title: "데모를 처음부터 다시 시작할까요?",
        description: "지금 계정의 자동화와 발송 기록이 모두 지워져요. 템플릿과 내 링크는 남아요.",
        confirmLabel: "다시 시작",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api("/account/demo", { method: "POST", body: {} });
      await reload();
      toast("데모 계정이 연결됐어요. 시뮬레이터에서 댓글을 달아 보세요!", "positive");
      nav("/");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: "연동을 해지할까요?",
      description: "해지하면 설정했던 자동화와 기록이 모두 삭제되며 복구할 수 없어요. 템플릿과 내 링크는 남아요.",
      confirmLabel: "연동 해지",
      danger: true,
    });
    if (!ok) return;
    await api("/account", { method: "DELETE" });
    await reload();
    nav("/connect");
  };

  // 데모로 연결돼 있으면 위 ‘연동된 계정’에 다시 시작 버튼이 있어요
  const demoSection = !acc?.connected && (
          <Section title="데모로 체험하기" description="Meta 앱 없이 PC에서 바로 모든 자동 DM 기능을 시험해 봐요">
            <VStack gap="x3">
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                가상의 계정(@my_studio)·게시물 6개·팬 12명이 준비돼요. 시뮬레이터에서 팬처럼 댓글을 달고, 받은 DM의 버튼을 눌러 보며 팔로우 확인·예약·일괄 발송까지 확인할 수 있어요.
              </Text>
              <HStack>
                <ActionButton variant="neutralSolid" size="large" loading={busy} onClick={startDemo}>
                  {acc?.connected && acc.mode === "demo" ? "데모 처음부터 다시" : "데모로 시작하기"}
                </ActionButton>
              </HStack>
            </VStack>
          </Section>
        );

  return (
    <div className="page page--narrow">
      {!acc?.connected ? (
        <div className="hero">
          <div className="hero__emoji">💌</div>
          <Text as="h1" textStyle="t10Bold">
            인스타그램 DM 자동화
          </Text>
          <Text as="p" textStyle="t5Regular" color="fg.neutralMuted" style={{ marginTop: 8 }}>
            댓글에 키워드가 달리면 자동으로 DM을 보내요. 한 번 세팅하면 팬과의 소통이 자동으로 이어져요.
          </Text>
        </div>
      ) : (
        <PageHeader title="연동·계정" description="인스타그램 연동 상태를 확인하고 관리해요" back="/" />
      )}

      <VStack gap="x4">
        {err && <Callout tone="critical" title="연동하지 못했어요" description={ERRORS[err] ?? err} />}

        {acc?.connected && (
          <Section title="연동된 계정">
            <HStack gap="x3" align="center">
              <Avatar name={acc.username} />
              <VStack gap="x0_5" grow>
                <Text textStyle="t5Bold">@{acc.username}</Text>
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  {acc.name} · 팔로워 {fmtNumber(acc.followersCount ?? 0)}
                  {acc.connectedAt ? ` · ${fmtDateTime(acc.connectedAt)} 연동` : ""}
                </Text>
              </VStack>
              <Badge size="large" variant="weak" tone={acc.needsReauth ? "critical" : acc.mode === "demo" ? "warning" : "positive"} style={{ flexShrink: 0 }}>
                {acc.needsReauth ? "재연동 필요" : acc.mode === "demo" ? "데모" : "정상"}
              </Badge>
            </HStack>
            {acc.needsReauth && (
              <div style={{ marginTop: 16 }}>
                <Callout
                  tone="critical"
                  description="인스타그램 보안 정책으로 연결이 만료됐어요. 다시 연동해도 기존 자동화와 데이터는 그대로 유지돼요."
                />
              </div>
            )}
            <HStack gap="x2" pt="x4" wrap>
              {acc.mode === "live" && (
                <ActionButton variant="neutralSolid" onClick={() => (window.location.href = "/auth/instagram/start?force=1")}>
                  다시 연동하기
                </ActionButton>
              )}
              {acc.mode === "demo" && (
                <ActionButton variant="neutralWeak" loading={busy} onClick={startDemo}>
                  데모 처음부터 다시
                </ActionButton>
              )}
              <ActionButton variant="criticalSolid" onClick={disconnect}>
                연동 해지
              </ActionButton>
            </HStack>
          </Section>
        )}

        {!state?.liveAvailable && demoSection}
        <Section title="인스타그램 연동하기" description="실제 내 인스타그램 계정의 댓글에 자동으로 DM을 보내요">
          <VStack gap="x3">
            <Callout
              tone="informative"
              title="연동하기 전에 확인해 주세요"
              description="① 프로페셔널(크리에이터·비즈니스) 계정이어야 해요 ② 인스타그램 앱 안 브라우저보다 PC·모바일 브라우저에서 진행해 주세요 ③ 계정 센터 > 내 정보 및 권한 > ‘Meta 테크놀로지 외부의 활동’이 켜져 있어야 해요 ④ 다른 자동 DM 서비스가 연결돼 있다면 먼저 해제해 주세요"
            />
            {!state?.liveAvailable ? (
              <Callout
                tone="warning"
                title="아직 Meta 앱이 설정되지 않았어요"
                description="README의 ‘실제 인스타그램 연동’ 순서대로 Meta 개발자 앱을 만들고 .env에 IG_APP_ID, IG_APP_SECRET, WEBHOOK_VERIFY_TOKEN, PUBLIC_BASE_URL을 넣은 뒤 서버를 다시 켜 주세요. 그 전에는 데모로 모든 기능을 체험할 수 있어요."
              />
            ) : !state.publicBaseUrl ? (
              <Callout
                tone="warning"
                description="인스타그램 로그인·웹훅에는 HTTPS 공개 주소가 필요해요. 터널(cloudflared 등)을 켜고 설정 > 공개 주소에 넣어 주세요."
              />
            ) : (
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                리디렉션 주소: <span className="mono">{state.redirectUri}</span>
                <br />
                웹훅 주소: <span className="mono">{state.webhookUrl}</span>
              </Text>
            )}
            <HStack>
              <ActionButton
                variant="brandSolid"
                size="large"
                disabled={!state?.liveAvailable || !state.publicBaseUrl}
                onClick={() => setTerms(true)}
              >
                🔗 인스타그램 연동하기
              </ActionButton>
            </HStack>
          </VStack>
        </Section>

        {state?.liveAvailable && demoSection}
      </VStack>

      <TermsModal
        open={terms}
        onClose={() => setTerms(false)}
        onAgree={() => {
          setTerms(false);
          window.location.href = "/auth/instagram/start";
        }}
      />
    </div>
  );
}

export function ConnectConfirmPage() {
  const { state } = useAppState();
  const nav = useNavigate();
  const [done, setDone] = useState(false);
  const acc = state?.account;
  if (!acc?.connected) return <ConnectPage />;
  return (
    <div className="page page--narrow">
      {!done ? (
        <VStack gap="x6" align="center" py="x10">
          <VStack gap="x1" align="center">
            <Text as="h1" textStyle="t9Bold">
              연동된 계정을 확인해 주세요
            </Text>
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              다른 계정이라면 다시 로그인해서 바꿀 수 있어요.
            </Text>
          </VStack>
          <HStack gap="x3" className="card" align="center" style={{ minWidth: 320 }}>
            <Avatar name={acc.username} />
            <VStack gap="x0_5">
              <Text textStyle="t5Bold">@{acc.username}</Text>
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                팔로워 {fmtNumber(acc.followersCount ?? 0)}
              </Text>
            </VStack>
          </HStack>
          <VStack gap="x2" style={{ width: 320 }}>
            <ActionButton variant="brandSolid" size="large" onClick={() => setDone(true)}>
              맞아요
            </ActionButton>
            <ActionButton variant="neutralWeak" size="large" onClick={() => (window.location.href = "/auth/instagram/start?force=1")}>
              다른 계정으로 연동하기
            </ActionButton>
          </VStack>
        </VStack>
      ) : (
        <ResultSection
          asset={<div style={{ fontSize: 56 }}>✅</div>}
          title="인스타그램 연동이 완료됐어요!"
          description="이제 자동 DM과 댓글 추첨을 바로 사용할 수 있어요."
          primaryActionProps={{ children: "자동 DM 설정하러 가기", onClick: () => nav("/automations/new") }}
          secondaryActionProps={{ children: "홈으로", onClick: () => nav("/") }}
        />
      )}
    </div>
  );
}
