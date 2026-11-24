import { IconDot3VerticalLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { useNavigate, useParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { Switch, Switchmark } from "seed-design/ui/switch";
import { List, ListDivider, ListItem, ListSwitchItem } from "seed-design/ui/list";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "seed-design/ui/menu";
import type { AutomationView, DeliveryLog } from "@shared/types";
import { DMPreview } from "../components/dm/DMEditor";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { HealthText, Loading, PageHeader, PostThumb, Section, StatTile, StatusBadge } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { SEND_MODE_LABEL, TONE_LABEL, copyText, fanGuideText, fmtDateTime, fmtNumber, fmtRelative, fmtWhen, josa, postTitle, triggerSummary } from "../lib/format";
import { FRIENDLY_REPLIES, POLITE_REPLIES } from "@shared/presets";
import { useAutomationActions } from "./Home";

/** 발송 기록의 DM 종류 — 편집 화면 탭 이름과 같게 */
const kindLabel = (kind: DeliveryLog["kind"], gated: boolean) =>
  ({ gate: "팔로우 확인 DM", main: gated ? "팔로워 DM" : "DM", nonFollower: "비팔로워 DM", reply: "댓글 답글", broadcast: "단체 DM" })[kind];
const ORIGIN_LABEL: Record<DeliveryLog["origin"], string> = {
  comment: "댓글",
  share: "DM 공유",
  code: "DM 코드",
  postback: "팔로우 확인 버튼",
  batch: "일괄 발송",
  scheduled: "예약 발송",
  broadcast: "단체 DM",
};
const STATUS_TEXT: Record<DeliveryLog["status"], { t: string; tone: "positive" | "neutral" | "critical" | "warning" | "informative" }> = {
  sent: { t: "보냄", tone: "positive" },
  queued: { t: "대기", tone: "informative" },
  retrying: { t: "재시도 중", tone: "warning" },
  failed: { t: "실패", tone: "critical" },
  skipped: { t: "취소", tone: "neutral" },
};

export function AutomationDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state } = useAppState();
  const { data, error, reload } = useApi<{ automation: AutomationView; recent: DeliveryLog[] }>(`/automations/${id}`);
  const act = useAutomationActions();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();

  if (error)
    return (
      <div className="page page--narrow">
        <PageHeader back="/" title="자동화를 찾을 수 없어요" description="이미 삭제됐을 수 있어요. 보낸 DM 기록은 홈 통계에 남아 있어요." />
      </div>
    );
  if (!data || !state) return <Loading />;
  const a = data.automation;
  const sending = a.status === "sending";
  const stopBatch = async () => {
    const ok = await confirm({
      title: "일괄 발송을 멈출까요?",
      description: "아직 보내지 않은 댓글에는 보내지 않아요. 이미 보낸 DM은 그대로예요. 자동화는 꺼진 상태로 남아요.",
      confirmLabel: "발송 중단",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/automations/${a.id}/stop-batch`, { body: {} });
      await reload();
      toast("일괄 발송을 멈췄어요");
    } catch (e) {
      onError(e);
    }
  };
  const canDuplicate = a.sendMode !== "scheduled" && a.origin !== "scheduled";

  const setExtra = async (patch: Partial<AutomationView["extras"]>) => {
    if (a.extras.codeReply && patch.codeReply === false) {
      const ok = await confirm({
        title: "DM 코드를 끌까요?",
        description: `코드 ${a.code}는 끄면 다시 쓸 수 없어요. 다시 켜면 새 코드가 만들어지니, 이미 알려 준 안내 문구도 바꿔 주세요.`,
        confirmLabel: "코드 끄기",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api(`/automations/${a.id}`, { method: "PATCH", body: { extras: { ...a.extras, ...patch } } });
      toast("저장했어요", "positive");
    } catch (e) {
      onError(e);
    }
  };

  const guide = fanGuideText(state.account.username, a.code, a.extras.shareReply, a.extras.codeReply);

  return (
    <div className="page">
      <PageHeader
        back="/"
        title={a.title || triggerSummary(a.trigger)}
        description={
          <HStack gap="x1_5" wrap>
            <StatusBadge status={a.status} />
            <Badge size="medium" variant="outline" tone="neutral">
              {a.sendMode === "immediate" && a.origin === "batch" ? "일괄 → 즉시 발송" : SEND_MODE_LABEL[a.sendMode]}
            </Badge>
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              {fmtDateTime(a.createdAt)} 등록
            </Text>
          </HStack>
        }
        actions={
          // 버튼은 두 개까지 (SEED action-button: 세 개 이상 나란히 두지 않기) — 나머지는 더 보기 메뉴
          <>
            <ActionButton variant="neutralSolid" disabled={sending} onClick={() => nav(`/automations/${a.id}/edit`)}>
              수정
            </ActionButton>
            <MenuRoot>
              <MenuTrigger asChild>
                <ActionButton layout="iconOnly" variant="ghost" aria-label="더 보기">
                  <Icon svg={<IconDot3VerticalLine />} />
                </ActionButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  label="복제"
                  description={canDuplicate ? undefined : "예약 발송 자동화는 복제할 수 없어요"}
                  disabled={!canDuplicate}
                  onClick={() => act.duplicate(a)}
                />
                <MenuItem label="템플릿으로 저장" onClick={() => act.saveAsTemplate(a)} />
                <MenuItem
                  label="삭제"
                  tone="critical"
                  description={sending ? "일괄 발송 중에는 삭제할 수 없어요" : undefined}
                  disabled={sending}
                  onClick={() => act.remove(a, () => nav("/"))}
                />
              </MenuContent>
            </MenuRoot>
          </>
        }
      />

      <div className="split">
        <VStack gap="x4">
          <Section title="상태와 결과">
            <VStack gap="x4">
              <HStack gap="x3" align="center">
                <PostThumb post={a.post ?? null} size="sm" />
                <VStack gap="x0_5" grow style={{ minWidth: 0 }}>
                  <Text textStyle="t4Bold" maxLines={1}>
                    {a.post ? postTitle(a.post) : "다음에 올릴 게시물 (첫 댓글이 달리면 연결돼요)"}
                  </Text>
                  <Text textStyle="t3Regular" color="fg.neutralMuted">
                    {a.schedule
                      ? `${fmtDateTime(a.schedule.at)} ${a.schedule.firedAt ? "보냄" : "발송 예정"}${a.schedule.continueAfter ? " · 이후 새 댓글에도 발송" : ""}`
                      : a.boundAt
                        ? `${fmtRelative(a.boundAt)} 게시물에 연결됨`
                        : SEND_MODE_LABEL[a.sendMode]}
                  </Text>
                </VStack>
                {a.sendMode === "immediate" && a.status !== "waiting" && (
                  <Switch checked={a.enabled} disabled={state.settings.dmPaused} onCheckedChange={(v) => act.toggle(a, v)} aria-label="자동화 켜고 끄기" />
                )}
              </HStack>
              {state.settings.dmPaused && (
                <Callout tone="warning" description="설정에서 DM 발송을 일시 중지해 둬서 지금은 보내지 않아요. 일시 중지 중에는 스위치를 바꿀 수 없어요." />
              )}
              {sending && a.batch && (
                <Callout
                  tone="informative"
                  title={a.batch.fetching ? "지난 댓글을 불러오는 중이에요" : `일괄 발송 중 · ${a.batch.total}건 중 ${a.batch.total - a.stats.queued}건 처리`}
                  description={
                    // 시간당 한도 때문에 기다리는 중이면 이유와 끝나는 때를 알려 줘요
                    a.stats.queued > 0
                      ? `시간당 ${state.settings.rateLimitPerHour}건까지 보내서 남은 ${a.stats.queued}건은 약 ${fmtWhen(
                          Date.now() + Math.ceil(a.stats.queued / Math.max(1, state.settings.rateLimitPerHour)) * 3600_000,
                        )}까지 보내요. 보내는 동안 수정·삭제할 수 없어요.`
                      : "보내는 동안 수정·삭제할 수 없어요."
                  }
                  linkProps={{ children: "발송 중단", onClick: stopBatch }}
                />
              )}
              {a.batch?.stopped && (
                <Callout tone="neutral" description="일괄 발송을 중단했어요. 자동화는 꺼진 즉시 발송으로 남아 있어요. 켜면 이후 새 댓글에 보내요." />
              )}
              {a.stats.held > 0 && (
                <Callout tone="informative" description={`예약 시각에 보낼 댓글 ${a.stats.held}개를 모아 뒀어요. 발송 시간·메시지·버튼 링크는 보내기 전까지 고칠 수 있어요.`} />
              )}
              {a.stats.queued > 0 && !sending && (
                <Callout
                  tone="warning"
                  title={`순차 발송중 · ${a.stats.queued}건 대기`}
                  description="인스타그램은 계정마다 일정 시간 동안 보낼 수 있는 DM 수를 제한해요. 누락되지 않게 대기열에 두고 보낼 수 있는 시간에 차례로 보내요."
                />
              )}
              <div className="grid-3">
                <StatTile label="전송" value={fmtNumber(a.stats.sent)} hint="실제로 보낸 DM 수" />
                <StatTile label="읽음" value={fmtNumber(a.stats.read)} hint="DM을 연 사람 수" />
                <StatTile label="클릭" value={fmtNumber(a.stats.clicks)} hint="버튼·링크 클릭 수" />
              </div>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--seed-color-fg-neutral-muted)" }}>결과 수 세는 방법</summary>
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    <tr>
                      <th style={{ width: 80 }}>전송</th>
                      <td>실제로 보낸 DM 수. 팔로우 확인 DM과 팔로워 DM을 둘 다 보냈다면 2로 세요</td>
                    </tr>
                    <tr>
                      <th>읽음</th>
                      <td>DM을 연 사람 수. 한 사람이 여러 번 열어도 1이에요</td>
                    </tr>
                    <tr>
                      <th>클릭</th>
                      <td>버튼이나 링크를 누른 횟수. 팔로우 확인 버튼은 세지 않아요</td>
                    </tr>
                  </tbody>
                </table>
              </details>
              <HStack gap="x3" align="flex-start" className="guide-box">
                <Text textStyle="t4Bold" style={{ minWidth: 140 }}>
                  최근 24시간 발송 상태
                </Text>
                <VStack gap="x1" grow>
                  <HealthText health={a.health} />
                  {a.health.state !== "ok" && (
                    <button type="button" className="link-row" onClick={() => nav("/help")}>
                      원인과 해결 방법 보기 →
                    </button>
                  )}
                </VStack>
              </HStack>
            </VStack>
          </Section>

          <Section
            title="추가 기능"
            description={
              sending
                ? "일괄 발송이 끝나면 바꿀 수 있어요"
                : "DM 공유·DM 코드는 여기서 바로 켜고 끌 수 있어요. 댓글 답글은 ‘수정’에서 바꿔요"
            }
          >
            <VStack gap="x4">
              {/* 바로 적용되는 설정 — SEED List + Switch (줄 전체가 누르는 영역) */}
              <List>
                <ListItem
                  title={
                    <HStack as="span" gap="x1_5" align="center">
                      댓글에 답글 달기
                      <Badge size="medium" variant="weak" tone={a.extras.commentReply.enabled && !state.settings.replyPaused ? "positive" : "neutral"}>
                        {!a.extras.commentReply.enabled ? "꺼짐" : state.settings.replyPaused ? "설정에서 멈춤" : "켜짐"}
                      </Badge>
                    </HStack>
                  }
                  detail={
                    a.sendMode !== "immediate"
                      ? "예약·일괄 발송에서는 쓸 수 없어요"
                      : !a.extras.commentReply.enabled
                        ? "DM이 나간 뒤 그 댓글에 답글을 달 수 있어요"
                        : a.extras.commentReply.tone === "custom"
                          ? `내 답글 ${a.extras.commentReply.custom.length}개 · 예) ${a.extras.commentReply.custom[0] ?? ""}`
                          : `${TONE_LABEL[a.extras.commentReply.tone]} · ${a.extras.commentReply.count}개 돌려 쓰기 · 예) ${(a.extras.commentReply.tone === "polite" ? POLITE_REPLIES : FRIENDLY_REPLIES)[0]}`
                  }
                  suffix={
                    a.sendMode === "immediate" ? (
                      <ActionButton size="small" variant="neutralWeak" disabled={sending} onClick={() => nav(`/automations/${a.id}/edit`)}>
                        바꾸기
                      </ActionButton>
                    ) : undefined
                  }
                />
                <ListDivider />
                <ListSwitchItem
                  title="DM 공유에도 답하기"
                  detail={a.postId ? "팬이 이 게시물을 ✈️ 공유로 내 계정에 보내면 같은 DM을 보내요" : "게시물에 연결된 뒤에 동작해요"}
                  checked={a.extras.shareReply}
                  disabled={sending}
                  onCheckedChange={(v) => setExtra({ shareReply: v })}
                  suffix={<Switchmark />}
                />
                <ListDivider />
                <ListSwitchItem
                  title="DM 코드에도 답하기"
                  detail="팬이 4자리 코드를 DM으로 보내면 같은 DM을 보내요"
                  checked={a.extras.codeReply}
                  disabled={sending}
                  onCheckedChange={(v) => setExtra({ codeReply: v })}
                  suffix={<Switchmark />}
                />
              </List>
              {a.extras.codeReply && (
                <HStack gap="x3" align="center" wrap>
                  <button type="button" className="code-chip" aria-label={`코드 ${a.code} 복사`} onClick={async () => (await copyText(a.code)) && toast("코드를 복사했어요")}>
                    {a.code}
                  </button>
                  <Text textStyle="t3Regular" color="fg.neutralMuted">
                    누르면 복사돼요
                  </Text>
                </HStack>
              )}
              {guide && (
                <div className="guide-box">
                  <HStack justify="space-between" pb="x1">
                    <Text textStyle="t3Regular" color="fg.neutralMuted">
                      팬에게 이렇게 알려 주세요
                    </Text>
                    <ActionButton size="xsmall" variant="ghost" onClick={async () => (await copyText(guide)) && toast("문구를 복사했어요. 스토리나 캡션에 붙여 넣으세요", "positive")}>
                      복사
                    </ActionButton>
                  </HStack>
                  <Text as="p" textStyle="t4Bold">
                    {guide}
                  </Text>
                </div>
              )}
            </VStack>
          </Section>

          <Section title="최근 발송 기록" description="최근 50건 · 이미 보낸 기록은 자동화를 지워도 남아요" flat>
            {data.recent.length === 0 ? (
              <div style={{ padding: "0 20px 20px" }}>
                <Text color="fg.neutralSubtle">아직 보낸 DM이 없어요.</Text>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>받는 사람</th>
                      <th>종류</th>
                      <th>계기</th>
                      <th>상태</th>
                      <th>시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((d) => (
                      <tr key={d.id}>
                        <td>@{d.username || d.userId}</td>
                        <td>{kindLabel(d.kind, a.dm.followGate.enabled)}</td>
                        <td>{ORIGIN_LABEL[d.origin]}</td>
                        <td>
                          <VStack gap="x0_5">
                            <HStack gap="x1">
                              <Badge size="medium" variant="weak" tone={STATUS_TEXT[d.status].tone}>
                                {STATUS_TEXT[d.status].t}
                              </Badge>
                              {d.readAt && (
                                <Badge size="medium" variant="weak" tone="neutral">
                                  읽음
                                </Badge>
                              )}
                            </HStack>
                            {d.error && (
                              <Text textStyle="t2Regular" color="fg.critical">
                                {d.error}
                              </Text>
                            )}
                          </VStack>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtRelative(d.sentAt ?? d.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </VStack>

        <div className="split__aside">
          <VStack gap="x2">
            <Text textStyle="t4Bold" color="fg.neutralMuted">
              보내는 DM
            </Text>
            <DMPreview
              dm={a.dm}
              username={state.account.username}
              post={a.post ?? null}
              sampleComment={a.trigger.type === "keyword" ? `${a.trigger.keywords[0]} 주세요!` : undefined}
              header={
                <Text textStyle="t3Medium" color="fg.neutralMuted" style={{ padding: "4px 4px 0" }}>
                  {a.trigger.type === "all"
                    ? "모든 댓글에"
                    : `${triggerSummary(a.trigger)}${josa(a.trigger.keywords[a.trigger.keywords.length - 1] ?? "", "이/가")} 들어간 댓글에`}
                </Text>
              }
            />
          </VStack>
        </div>
      </div>
    </div>
  );
}
