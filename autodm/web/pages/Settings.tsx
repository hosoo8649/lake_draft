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
import { RiskStatus } from "../components/RiskNotice";
import { IconBtn, Loading, PageHeader, Section } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { copyText } from "../lib/format";

export function SettingsPage() {
  const { state, reload } = useAppState();
  const nav = useNavigate();
  const toast = useToast();
  const onError = useErrorToast();
  const [base, setBase] = useState("");

  useEffect(() => {
    if (state) setBase(state.settings.publicBaseUrl);
  }, [state?.settings.publicBaseUrl]);

  // 홈의 제한 신호 알림에서 들어오면 안전 장치로 바로 이동
  useEffect(() => {
    if (state && window.location.hash === "#safety") document.getElementById("safety")?.scrollIntoView({ block: "start" });
  }, [!!state]);

  if (!state) return <Loading />;
  const s = state.settings;
  // 공개 주소: 비우거나, https:// 로 시작하는 실제 주소만
  const baseError = !base.trim() ? null : isPublicHttpsUrl(base.trim()) ? null : "https:// 로 시작하는 주소를 넣어 주세요 (예: https://xxxx.trycloudflare.com)";

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
      <PageHeader title="설정" description="운영 일시 중지, 발송 속도와 안전 장치, 연동 정보를 관리해요" />
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

        <div id="safety" style={{ scrollMarginTop: 16 }}>
          <SafetySection />
        </div>

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

/** 정수 입력 검사 — 오류 문구 또는 null */
function intError(v: string, min: number, max: number): string | null {
  if (!v.trim()) return "숫자를 넣어 주세요";
  const n = Number(v);
  return !Number.isInteger(n) || n < min || n > max ? `${min}부터 ${max} 사이의 정수로 넣어 주세요` : null;
}

/**
 * 발송 속도 · 안전 장치
 * 사람이 보내는 것처럼 천천히, 몰아서 보내지 않게 — 인스타그램 제한 신호를 받으면 자동으로 더 느려져요
 */
function SafetySection() {
  const { state, reload } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const s = state!.settings;
  const initial = () => ({
    rate: String(s.rateLimitPerHour),
    min: String(s.replyDelayMinSec),
    max: String(s.replyDelayMaxSec),
    replies: String(s.replyPerHour),
  });
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => setF(initial()), [s.rateLimitPerHour, s.replyDelayMinSec, s.replyDelayMaxSec, s.replyPerHour]);

  const errs = {
    rate: intError(f.rate, 1, 1000),
    min: intError(f.min, 0, 3600),
    max: intError(f.max, 0, 3600),
    replies: intError(f.replies, 1, 200),
  };
  const rangeError = !errs.min && !errs.max && Number(f.min) > Number(f.max) ? "앞의 숫자가 뒤의 숫자보다 클 수 없어요" : null;
  const invalid = Object.values(errs).some(Boolean) || !!rangeError;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial());
  const gap = Math.max(1, Math.round(3600 / Math.max(1, Number(f.rate) || s.rateLimitPerHour)));

  const save = async () => {
    setSaving(true);
    try {
      await api("/settings", {
        method: "PATCH",
        body: { rateLimitPerHour: Number(f.rate), replyDelayMinSec: Number(f.min), replyDelayMaxSec: Number(f.max), replyPerHour: Number(f.replies) },
      });
      await reload();
      toast("발송 속도를 저장했어요", "positive");
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="발송 속도 · 안전 장치"
      description="짧은 시간에 너무 많이 보내면 인스타그램이 계정을 제한할 수 있어요. 사람이 보내는 것처럼 간격을 두고 보내요."
    >
      <VStack gap="x6">
        <RiskStatus />

        <VStack gap="x3">
          <Text as="h3" textStyle="t5Bold">
            DM
          </Text>
          <div style={{ maxWidth: 360 }}>
            <TextInput
              label="시간당 최대 DM 수"
              type="number"
              value={f.rate}
              onChange={(rate) => setF({ ...f, rate })}
              suffix="건/시간"
              description={errs.rate ? undefined : "넘는 만큼은 대기열에 두었다가 순서대로 보내요"}
              error={errs.rate ?? undefined}
            />
          </div>
          {/* 위 입력칸과 왼쪽 줄을 맞춰요 */}
          <List className="list-flush">
            <ListSwitchItem
              title="DM 고르게 나눠 보내기"
              detail={`한꺼번에 몰아서 보내지 않고 한도에 맞춰 간격을 둬요. 지금 한도라면 약 ${gap < 60 ? `${gap}초` : `${Math.round(gap / 60)}분`}에 1건씩 보내요.`}
              checked={s.dmSpread}
              onCheckedChange={async (v) => {
                try {
                  await api("/settings", { method: "PATCH", body: { dmSpread: v } });
                  await reload();
                  toast(v ? "DM을 고르게 나눠 보내요" : "DM을 한도 안에서 바로 보내요", "positive");
                } catch (e) {
                  onError(e);
                }
              }}
              suffix={<Switchmark />}
            />
          </List>
        </VStack>

        <VStack gap="x3">
          <Text as="h3" textStyle="t5Bold">
            댓글 답글
          </Text>
          <VStack gap="x1_5" role="group" aria-labelledby="reply-gap-label">
            <Text id="reply-gap-label" textStyle="t5Medium" style={{ paddingInline: 2 }}>
              답글 간격
            </Text>
            <HStack gap="x2" align="center">
              <div style={{ width: 120 }}>
                <TextInput ariaLabel="답글 간격 최소" type="number" value={f.min} onChange={(min) => setF({ ...f, min })} suffix="초" invalidOnly={!!errs.min} />
              </div>
              <Text textStyle="t5Regular" color="fg.neutralMuted" aria-hidden>
                ~
              </Text>
              <div style={{ width: 120 }}>
                <TextInput ariaLabel="답글 간격 최대" type="number" value={f.max} onChange={(max) => setF({ ...f, max })} suffix="초" invalidOnly={!!(errs.max || rangeError)} />
              </div>
            </HStack>
            <Text textStyle="t2Regular" color={errs.min || errs.max || rangeError ? "fg.critical" : "fg.neutralSubtle"}>
              {errs.min ?? errs.max ?? rangeError ?? "이 사이에서 매번 다르게 기다렸다가 답글을 달아요. 제한 신호를 받으면 10분으로 늘어나요."}
            </Text>
          </VStack>
          <div style={{ maxWidth: 360 }}>
            <TextInput
              label="시간당 최대 답글 수"
              type="number"
              value={f.replies}
              onChange={(replies) => setF({ ...f, replies })}
              suffix="건/시간"
              error={errs.replies ?? undefined}
            />
          </div>
        </VStack>

        <HStack gap="x2">
          <ActionButton variant="neutralSolid" disabled={!dirty || invalid} loading={saving} onClick={save}>
            저장
          </ActionButton>
          {dirty && (
            <ActionButton variant="ghost" onClick={() => setF(initial())}>
              되돌리기
            </ActionButton>
          )}
        </HStack>
      </VStack>
    </Section>
  );
}
