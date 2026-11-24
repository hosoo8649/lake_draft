import { IconChevronRightLine, IconEyeLine, IconEyeSlashLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { Switchmark } from "seed-design/ui/switch";
import { List, ListButtonItem, ListDivider, ListSwitchItem } from "seed-design/ui/list";
import type { Settings } from "@shared/types";
import { isPublicHttpsUrl } from "@shared/validation";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { IconBtn, Loading, PageHeader, Section } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { copyText } from "../lib/format";

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
  const rateNum = Number(rate);
  // 공개 주소: 비우거나, https:// 로 시작하는 실제 주소만
  const baseError = !base.trim() ? null : isPublicHttpsUrl(base.trim()) ? null : "https:// 로 시작하는 주소를 넣어 주세요 (예: https://xxxx.trycloudflare.com)";
  const rateError = !rate.trim()
    ? "숫자를 넣어 주세요"
    : !Number.isInteger(rateNum) || rateNum < 1 || rateNum > 1000
      ? "1부터 1000 사이의 정수로 넣어 주세요"
      : null;

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
          <List>
            <ListSwitchItem
              title="DM 자동 발송"
              detail="끄면 댓글이 달려도 DM을 보내지 않아요. 즉시·예약 발송과 DM 공유·코드 답장이 모두 멈춰요. 이미 시작한 일괄 발송은 끝까지 보내요."
              checked={!s.dmPaused}
              onCheckedChange={(v) => patch({ dmPaused: !v }, v ? "DM 자동 발송을 다시 켰어요" : "DM 자동 발송을 멈췄어요")}
              suffix={<Switchmark />}
            />
            <ListDivider />
            <ListSwitchItem
              title="댓글 자동 답글"
              detail={
                s.dmPaused
                  ? "DM 발송을 멈춘 동안에는 답글도 함께 멈춰요."
                  : "답글만 따로 멈출 수 있어요. 멈춘 동안 달릴 예정이던 답글은 다시 켜도 달지 않아요."
              }
              checked={!s.replyPaused && !s.dmPaused}
              disabled={s.dmPaused}
              onCheckedChange={(v) => patch({ replyPaused: !v }, v ? "댓글 자동 답글을 다시 켰어요" : "댓글 자동 답글을 멈췄어요")}
              suffix={<Switchmark />}
            />
          </List>
          {(s.dmPaused || s.replyPaused) && (
            <HStack pt="x2">
              <ActionButton variant="neutralSolid" onClick={() => patch({ dmPaused: false, replyPaused: false }, "모두 다시 켰어요")}>
                모두 다시 켜기
              </ActionButton>
            </HStack>
          )}
        </Section>

        <Section title="발송 한도" description="인스타그램은 계정마다 일정 시간 동안 보낼 수 있는 DM 수를 제한해요. 넘는 만큼은 대기열에 두었다가 순차로 보내요.">
          <HStack gap="x2" align="flex-start">
            <div style={{ width: 220 }}>
              <TextInput
                label="시간당 최대 DM 수"
                type="number"
                value={rate}
                onChange={setRate}
                suffix="건/시간"
                description={rateError ? undefined : "1~1000 사이로 정해요"}
                error={rateError ?? undefined}
              />
            </div>
            <div style={{ paddingTop: 30 }}>
              <ActionButton
                variant="neutralWeak"
                disabled={!!rateError || Number(rate) === s.rateLimitPerHour}
                onClick={() => patch({ rateLimitPerHour: Number(rate) }, "발송 한도를 저장했어요")}
              >
                저장
              </ActionButton>
            </div>
          </HStack>
        </Section>

        <Section title="공개 주소 (실제 인스타그램 연동용)" description="인스타그램 로그인 리디렉션·웹훅·버튼 클릭 추적에 쓰는 HTTPS 주소예요. PC에서는 cloudflared·ngrok 같은 터널 주소를 넣어요.">
          <VStack gap="x3">
            <HStack gap="x2" align="flex-end">
              <div style={{ flex: 1 }}>
                <TextInput
                  label="공개 주소"
                  placeholder="https://xxxx.trycloudflare.com"
                  value={base}
                  onChange={setBase}
                  error={baseError ?? undefined}
                />
              </div>
              <ActionButton
                variant="neutralWeak"
                disabled={base.trim() === s.publicBaseUrl || !!baseError}
                onClick={() => patch({ publicBaseUrl: base.trim() }, base.trim() ? "공개 주소를 저장했어요" : "공개 주소를 지웠어요")}
              >
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

        <AdminPasswordSection />

        <Section title="계정 · 도움말">
          <List>
            {[
              {
                title: "계정",
                detail: `@${state.account.username} · ${state.account.mode === "demo" ? "데모" : "인스타그램 연동"} — 연동 상태 확인, 다시 연동, 해지`,
                to: "/connect",
              },
              ...(state.account.mode === "demo"
                ? [{ title: "시뮬레이터", detail: "팬이 되어 댓글·DM·버튼을 눌러 보며 자동화를 시험해요", to: "/simulator" }]
                : []),
              { title: "캐롤DM 둘러보기", detail: "주요 화면과 기능을 한 장씩 다시 봐요", to: "/?tour=1" },
              { title: "이용 가이드", detail: "연동부터 자동 DM 만들기·관리·추첨까지 시작 순서", to: "/help?tab=guide" },
              { title: "DM 발송 문제", detail: "DM이 전송되지 않을 때 확인할 것들", to: "/help?tab=dm" },
              { title: "연동 문제", detail: "연동이 안 되거나 다른 계정으로 연동됐을 때", to: "/help?tab=connect" },
            ].map((r, i) => (
              <Fragment key={r.to}>
                {i > 0 && <ListDivider />}
                <ListButtonItem
                  title={r.title}
                  detail={r.detail}
                  suffix={<Icon svg={<IconChevronRightLine />} color="fg.neutralSubtle" />}
                  onClick={() => nav(r.to)}
                />
              </Fragment>
            ))}
          </List>
        </Section>
      </VStack>
    </div>
  );
}

function AdminPasswordSection() {
  const info = useApi<{ password: string | null; fromEnv: boolean }>("/admin-password", { live: false });
  const [show, setShow] = useState(false);
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  return (
    <Section
      title="관리자 비밀번호"
      description="이 PC의 브라우저에서는 필요 없어요. 터널 주소나 다른 기기에서 관리 화면을 열 때 이 비밀번호로 로그인해요."
    >
      {info.data?.fromEnv ? (
        <Text textStyle="t4Regular" color="fg.neutralMuted">
          .env의 ADMIN_PASSWORD로 정해져 있어요.
        </Text>
      ) : (
        <HStack gap="x2" wrap align="center">
          <HStack gap="x1" align="center" className="secret-box">
            <span className="mono">{info.data?.password ? (show ? info.data.password : "••••••••••••") : "…"}</span>
            <IconBtn label={show ? "비밀번호 숨기기" : "비밀번호 보기"} icon={show ? <IconEyeSlashLine /> : <IconEyeLine />} onClick={() => setShow(!show)} />
          </HStack>
          <ActionButton
            size="small"
            variant="neutralWeak"
            onClick={async () => info.data?.password && (await copyText(info.data.password)) && toast("비밀번호를 복사했어요")}
          >
            복사
          </ActionButton>
          <ActionButton
            size="small"
            variant="ghost"
            onClick={async () => {
              const ok = await confirm({
                title: "비밀번호를 새로 만들까요?",
                description: "바깥에서 로그인해 둔 브라우저는 모두 로그아웃돼요.",
                confirmLabel: "새로 만들기",
              });
              if (!ok) return;
              try {
                info.setData(await api("/admin-password/rotate", { body: {} }));
                setShow(true);
                toast("새 비밀번호를 만들었어요", "positive");
              } catch (e) {
                onError(e);
              }
            }}
          >
            새로 만들기
          </ActionButton>
        </HStack>
      )}
    </Section>
  );
}
