import { IconPaperplaneLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, PrefixIcon, Text, VStack } from "@seed-design/react";
import { Fragment, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { List, ListDivider, ListItem } from "seed-design/ui/list";
import { LIMITS } from "@shared/limits";
import type { Broadcast, Contact, DMButton, DMMessage } from "@shared/types";
import { validateMessage } from "@shared/validation";
import { MessageBubble } from "../components/dm/Bubble";
import { Phone } from "../components/dm/Phone";
import { ButtonsEditor } from "../components/dm/sheets";
import { PersonalTextArea } from "../components/dm/TextVariants";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { EmptyState, Loading, PageHeader, Section } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { fmtNumber, fmtRelative, fmtWhen } from "../lib/format";

interface Audience {
  count: number;
  contacts: (Contact & { expiresAt: number })[];
}
interface BroadcastView extends Broadcast {
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  clicks: number;
}

const KIND_LABEL: Record<Contact["lastInboundKind"], string> = {
  message: "DM 보냄",
  postback: "버튼 누름",
  share: "게시물 공유",
  code: "코드 보냄",
};

/** 마감까지 남은 시간 */
function leftLabel(expiresAt: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((expiresAt - now) / 60_000));
  if (m < 60) return `${m}분 남음`;
  return `${Math.floor(m / 60)}시간 남음`;
}

/**
 * 단체 DM — 최근 24시간 안에 DM을 보내거나 버튼을 누른 팬에게만 (인스타그램 메시지 규칙)
 * 댓글만 단 팬, 오래전에 대화한 팬에게는 보낼 수 없어요.
 */
export function BroadcastsPage() {
  const { state, links } = useAppState();
  const audience = useApi<Audience>("/broadcasts/audience");
  const history = useApi<BroadcastView[]>("/broadcasts");
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [buttons, setButtons] = useState<DMButton[]>([]);
  const [sending, setSending] = useState(false);

  if (!state || !audience.data || !history.data) return <Loading />;
  const count = audience.data.count;
  const message: DMMessage = { format: "text", text, buttons, cards: [] };
  const errors = text.trim()
    ? validateMessage(message, {
        allowCarousel: false,
        maxButtons: LIMITS.buttonsPerMessage,
        label: "",
      })
    : [];
  const canSend = count > 0 && !!text.trim() && errors.length === 0 && !sending;

  const send = async () => {
    const ok = await confirm({
      title: `팬 ${fmtNumber(count)}명에게 보낼까요?`,
      description: state.settings.dmPaused
        ? "지금 DM 자동 발송이 멈춰 있어서, 다시 켜야 보내기 시작해요. 그 사이 24시간이 지난 팬에게는 보내지 않아요."
        : `시간당 DM 한도(${fmtNumber(state.settings.rateLimitPerHour)}건) 안에서 순서대로 보내요. 보내기 전에 24시간이 지난 팬은 자동으로 빼요.`,
      confirmLabel: "보내기",
    });
    if (!ok) return;
    setSending(true);
    try {
      await api("/broadcasts", { body: { text, buttons } });
      setText("");
      setButtons([]);
      await Promise.all([history.reload(), audience.reload()]);
      toast(`팬 ${fmtNumber(count)}명에게 보내기 시작했어요`, "positive");
    } catch (e) {
      onError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="단체 DM"
        description="최근 24시간 안에 나에게 DM을 보내거나 버튼을 누른 팬에게 한 번에 보내요"
      />
      <VStack gap="x5">
        <Callout
          tone="informative"
          title="인스타그램 규칙상 24시간 안에 반응한 팬에게만 보낼 수 있어요"
          description="댓글만 단 팬, 반응한 지 24시간이 지난 팬, 나를 팔로우만 한 팬에게는 보낼 수 없어요. 홍보용 대량 발송은 계정 제한으로 이어질 수 있으니 꼭 필요한 안내만 보내 주세요."
        />

        <div className="edit-grid edit-grid--preview-last">
          <Section title="보낼 DM">
            <VStack gap="x5">
              <PersonalTextArea
                label="DM 문구"
                value={text}
                onChange={setText}
                rows={5}
              />
              <ButtonsEditor
                buttons={buttons}
                max={LIMITS.buttonsPerMessage}
                links={links}
                onChange={setButtons}
              />
              {errors.length > 0 && (
                <Text textStyle="t3Regular" color="fg.critical">
                  {errors[0]}
                </Text>
              )}
              <HStack gap="x2" align="center" wrap>
                <ActionButton
                  variant="brandSolid"
                  size="large"
                  disabled={!canSend}
                  loading={sending}
                  onClick={send}
                >
                  <PrefixIcon svg={<IconPaperplaneLine />} />
                  {count > 0
                    ? `${fmtNumber(count)}명에게 보내기`
                    : "보낼 수 있는 팬이 없어요"}
                </ActionButton>
              </HStack>
            </VStack>
          </Section>

          {/* 휴대폰에서는 문구를 쓰기 시작하면 미리보기를 보여요 */}
          <div className="edit-grid__preview" data-empty={!text.trim()}>
            <Phone username={state.account.username} caption="팬이 받을 DM">
              <MessageBubble
                message={text.trim() ? message : { ...message, text: "" }}
                username={state.account.username}
              />
            </Phone>
          </div>
        </div>

        <Section
          title="받을 수 있는 팬"
          description={
            count
              ? `지금 ${fmtNumber(count)}명${count > audience.data.contacts.length ? ` (최근 ${audience.data.contacts.length}명만 보여요)` : ""} · 시간이 지나면 목록에서 빠져요`
              : undefined
          }
        >
          {count === 0 ? (
            <EmptyState
              emoji="⏳"
              title="지금 보낼 수 있는 팬이 없어요"
              description="팬이 나에게 DM을 보내거나 DM의 버튼(팔로우 확인 등)을 누르면 그때부터 24시간 동안 이 목록에 보여요."
            />
          ) : (
            <List>
              {audience.data.contacts.map((c, i) => (
                <Fragment key={c.userId}>
                  {i > 0 && <ListDivider />}
                  <ListItem
                    title={`@${c.username || c.userId}`}
                    detail={`${fmtRelative(c.lastInboundAt)} ${KIND_LABEL[c.lastInboundKind]}`}
                    suffix={
                      <Badge
                        size="medium"
                        variant="weak"
                        tone={
                          c.expiresAt - Date.now() < 3 * 3600_000
                            ? "warning"
                            : "neutral"
                        }
                      >
                        {leftLabel(c.expiresAt)}
                      </Badge>
                    }
                  />
                </Fragment>
              ))}
            </List>
          )}
        </Section>
        <Section title="보낸 단체 DM">
          {history.data.length === 0 ? (
            <Text textStyle="t4Regular" color="fg.neutralMuted">
              아직 보낸 단체 DM이 없어요.
            </Text>
          ) : (
            <List>
              {history.data.map((b, i) => (
                <Fragment key={b.id}>
                  {i > 0 && <ListDivider />}
                  <ListItem
                    title={b.text.split("\n")[0]}
                    detail={[
                      fmtWhen(b.createdAt),
                      `대상 ${fmtNumber(b.total)}명`,
                      `보냄 ${fmtNumber(b.sent)}`,
                      b.clicks ? `클릭 ${fmtNumber(b.clicks)}` : "",
                      b.failed ? `실패 ${fmtNumber(b.failed)}` : "",
                      b.skipped
                        ? `24시간 지나 건너뜀 ${fmtNumber(b.skipped)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    suffix={
                      b.pending > 0 ? (
                        <Badge size="medium" variant="weak" tone="informative">
                          보내는 중 {fmtNumber(b.pending)}
                        </Badge>
                      ) : (
                        <Badge size="medium" variant="weak" tone="positive">
                          완료
                        </Badge>
                      )
                    }
                  />
                </Fragment>
              ))}
            </List>
          )}
        </Section>
      </VStack>
    </div>
  );
}
