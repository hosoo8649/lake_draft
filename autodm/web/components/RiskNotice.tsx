import { IconExclamationmarkTriangleLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Text, VStack } from "@seed-design/react";
import { useNavigate } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { ActionableCallout, Callout } from "seed-design/ui/callout";
import type { Settings } from "@shared/types";
import { useConfirm, useErrorToast, useToast } from "./feedback";
import { api } from "../lib/api";
import { useAppState } from "../lib/appState";
import { fmtRelative } from "../lib/format";

/** 제한 신호 수에 따른 안내 — 1~2번: 답글을 천천히 · 3번: 답글 자동 멈춤 (DM은 계속) */
export function riskCopy(level: number, s: Settings): { tone: "warning" | "critical"; title: string; description: string } | null {
  if (s.risk.autoPausedReplies && s.replyPaused)
    return {
      tone: "critical",
      title: "인스타그램 제한 신호가 계속돼서 댓글 답글을 멈췄어요",
      description: "DM은 계속 보내고 있어요. 몇 시간 쉬었다가 설정에서 답글을 다시 켜 주세요.",
    };
  if (level <= 0) return null;
  return {
    tone: "warning",
    title: `최근 24시간 인스타그램 제한 신호 ${level}번`,
    description:
      level >= 2
        ? "답글을 10분에 하나씩만 달고 있어요. 한 번 더 신호를 받으면 답글을 자동으로 멈춰요 (DM은 계속 보내요)."
        : "계정을 보호하려고 답글을 10분에 하나씩만 달고 있어요. DM은 그대로 보내요.",
  };
}

/** 홈 상단 — 누르면 설정의 안전 장치로 */
export function RiskBanner() {
  const { state } = useAppState();
  const nav = useNavigate();
  if (!state) return null;
  const c = riskCopy(state.riskLevel, state.settings);
  if (!c) return null;
  return (
    <ActionableCallout
      tone={c.tone}
      prefixIcon={<IconExclamationmarkTriangleLine />}
      title={c.title}
      description={c.description}
      onClick={() => nav("/settings#safety")}
    />
  );
}

/** 설정 — 받은 신호와 기록 지우기 */
export function RiskStatus() {
  const { state, reload } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  if (!state) return null;
  const s = state.settings;
  const c = riskCopy(state.riskLevel, s);
  if (!c)
    return (
      <Callout
        tone="positive"
        title="최근 24시간 동안 제한 신호가 없어요"
        description={
          s.alerts.email
            ? "인스타그램이 발송을 제한하면 답글 속도를 자동으로 줄이고, 여기와 홈, 메일로 알려 드려요."
            : "인스타그램이 발송을 제한하면 답글 속도를 자동으로 줄이고 여기와 홈에 알려 드려요. 아래 메일 알림을 켜면 메일로도 받을 수 있어요."
        }
      />
    );
  const recent = [...s.risk.signals].reverse().slice(0, 3);
  return (
    <VStack gap="x3">
      <Callout tone={c.tone} prefixIcon={<IconExclamationmarkTriangleLine />} title={c.title} description={c.description} />
      {recent.length > 0 && (
        <VStack gap="x1" as="ul" className="plain-list">
          {recent.map((x) => (
            <li key={x.at}>
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                {fmtRelative(x.at)} · {x.reason}
              </Text>
            </li>
          ))}
        </VStack>
      )}
      <HStack>
        <ActionButton
          size="small"
          variant="neutralWeak"
          onClick={async () => {
            const ok = await confirm({
              title: "제한 신호 기록을 지울까요?",
              description: s.risk.autoPausedReplies
                ? "원래 속도로 돌아가고 멈췄던 댓글 답글도 다시 켜져요. 인스타그램 앱에서 계정 상태가 괜찮은지 먼저 확인해 주세요."
                : "답글 간격이 원래대로 돌아가요. 인스타그램 앱에서 계정 상태가 괜찮은지 먼저 확인해 주세요.",
              confirmLabel: "기록 지우기",
            });
            if (!ok) return;
            try {
              await api("/risk/reset", { body: {} });
              await reload();
              toast("원래 속도로 돌아갔어요", "positive");
            } catch (e) {
              onError(e);
            }
          }}
        >
          괜찮아졌어요 · 기록 지우기
        </ActionButton>
      </HStack>
    </VStack>
  );
}
