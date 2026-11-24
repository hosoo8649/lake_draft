import {
  IconChevronRightLine,
  IconDot3HorizontalChatbubbleLeftLine,
  IconKeyholeShieldLine,
  IconPaperplaneLine,
  IconPerson2Line,
  IconTrashcanLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { useEffect, useState, type ReactNode } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Chip } from "seed-design/ui/chip";
import { Switch } from "seed-design/ui/switch";
import { LIMITS } from "@shared/limits";
import { FRIENDLY_REPLIES, POLITE_REPLIES } from "@shared/presets";
import type {
  CommentReplySetting,
  Extras,
  ReplySet,
  SendMode,
} from "@shared/types";
import { replyKey } from "@shared/validation";
import { api, useApi } from "../../lib/api";
import { TONE_LABEL, copyText, fanGuideText } from "../../lib/format";
import { useErrorToast, useToast } from "../feedback";
import { TextInput } from "../fields";
import { Modal } from "../Modal";
import { IconBtn } from "../ui";

export function FeatureCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
  tags?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="feature-card">
      <div className="feature-card__icon">{props.icon}</div>
      <VStack gap="x3" grow style={{ minWidth: 0 }}>
        <HStack justify="space-between" align="flex-start" gap="x3">
          <VStack gap="x0_5">
            <HStack gap="x1_5" align="center">
              <Text
                textStyle="t5Bold"
                color={props.disabled ? "fg.disabled" : "fg.neutral"}
              >
                {props.title}
              </Text>
              {props.badge && (
                <span className="no-shrink">
                  <Badge size="medium" variant="outline" tone="brand">
                    {props.badge}
                  </Badge>
                </span>
              )}
            </HStack>
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              {props.description}
            </Text>
            {props.tags && (
              <Text textStyle="t2Regular" color="fg.neutralSubtle">
                {props.tags}
              </Text>
            )}
          </VStack>
          <Switch
            checked={props.checked}
            disabled={props.disabled || !props.onChange}
            onCheckedChange={props.onChange}
            aria-label={props.title}
          />
        </HStack>
        {props.children}
      </VStack>
    </div>
  );
}

/* ───────────── 말투 고르기 / 답글 고르기 ───────────── */

function ReplyPickerModal(props: {
  open: boolean;
  value: CommentReplySetting;
  onClose: () => void;
  onSave: (v: CommentReplySetting) => void;
}) {
  const [v, setV] = useState(props.value);
  const [draft, setDraft] = useState("");
  const [saveName, setSaveName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const sets = useApi<ReplySet[]>(props.open ? "/reply-sets" : null);
  const toast = useToast();
  const onError = useErrorToast();
  useEffect(() => {
    if (props.open) {
      setV(props.value);
      setDraft("");
      setSaveName("");
      setConfirmDel(null);
    }
  }, [props.open]);

  const custom = v.custom;
  const setCustom = (c: string[]) =>
    setV({ ...v, custom: c.slice(0, LIMITS.customRepliesMax) });
  const add = () => {
    const t = replyKey(draft);
    if (!t) return;
    if (custom.some((c) => replyKey(c) === t)) {
      toast("이미 넣은 답글이에요. 다른 답글을 넣어 주세요");
      return;
    }
    setCustom([...custom, t]);
    setDraft("");
  };
  const sample = (tone: "polite" | "friendly") =>
    tone === "polite" ? POLITE_REPLIES[0] : FRIENDLY_REPLIES[0];
  const customOk = custom.length >= LIMITS.customRepliesMin;

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="답글 말투"
      description="DM을 보낸 댓글에 공개 답글로 달려요. 같은 문구가 반복되면 인스타그램이 반복 활동으로 볼 수 있어 무작위로 돌려 써요."
      primary={{
        label: "완료",
        onClick: () => (props.onSave(v), props.onClose()),
        disabled: v.tone === "custom" && !customOk,
      }}
    >
      <VStack gap="x4">
        {(["polite", "friendly", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className="option-card"
            data-selected={v.tone === t}
            onClick={() => setV({ ...v, tone: t })}
          >
            <VStack gap="x0_5" as="span" grow>
              <Text textStyle="t5Bold">{TONE_LABEL[t]}</Text>
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                {t === "custom"
                  ? "답글을 직접 쓰거나 저장해 둔 답글 모음을 불러와요"
                  : `예) ${sample(t)}`}
              </Text>
            </VStack>
            <span className="option-card__radio" aria-hidden />
          </button>
        ))}

        {v.tone === "custom" && (
          <VStack gap="x3">
            <HStack justify="space-between">
              <Text textStyle="t4Bold">답글 고르기</Text>
              <Text
                textStyle="t2Regular"
                color={customOk ? "fg.neutralSubtle" : "fg.critical"}
              >
                {custom.length}/{LIMITS.customRepliesMax} ·{" "}
                {LIMITS.customRepliesMin}개 이상
              </Text>
            </HStack>
            {(sets.data?.length ?? 0) > 0 && (
              <VStack gap="x1_5">
                <Text textStyle="t3Medium" color="fg.neutralMuted">
                  저장한 답글 모음 불러오기
                </Text>
                <div className="chips">
                  {sets.data!.map((s) => (
                    <HStack key={s.id} gap="x0_5" align="center">
                      <Chip.Button
                        size="small"
                        variant="outlineStrong"
                        onClick={() => {
                          // 이미 쓴 답글은 지우지 않고, 없는 답글만 더해요
                          const have = new Set(custom.map(replyKey));
                          const add = s.replies.filter(
                            (x) => !have.has(replyKey(x)),
                          );
                          const merged = [...custom, ...add].slice(
                            0,
                            LIMITS.customRepliesMax,
                          );
                          setCustom(merged);
                          toast(
                            custom.length
                              ? `‘${s.name}’에서 답글 ${merged.length - custom.length}개를 더했어요`
                              : `‘${s.name}’ 답글 ${merged.length}개를 불러왔어요`,
                          );
                        }}
                      >
                        <Chip.Label>
                          {s.name} · {s.replies.length}
                        </Chip.Label>
                      </Chip.Button>
                      {confirmDel === s.id ? (
                        // 창 위에 창을 또 띄우지 않고 그 자리에서 한 번 더 확인해요
                        <ActionButton
                          size="xsmall"
                          variant="criticalSolid"
                          onClick={async () => {
                            try {
                              await api(`/reply-sets/${s.id}`, {
                                method: "DELETE",
                              });
                              toast(`‘${s.name}’ 답글 모음을 삭제했어요`);
                              setConfirmDel(null);
                              void sets.reload();
                            } catch (e) {
                              onError(e);
                            }
                          }}
                        >
                          삭제할까요?
                        </ActionButton>
                      ) : (
                        <IconBtn
                          label={`${s.name} 삭제`}
                          icon={<IconTrashcanLine />}
                          onClick={() => setConfirmDel(s.id)}
                        />
                      )}
                    </HStack>
                  ))}
                </div>
              </VStack>
            )}
            {custom.map((c, i) => (
              <HStack
                key={`${i}-${c}`}
                gap="x2"
                className="card"
                style={{ padding: "8px 12px" }}
              >
                <Text textStyle="t4Regular" style={{ flex: 1 }}>
                  {c}
                </Text>
                <IconBtn
                  label="답글 삭제"
                  icon={<IconTrashcanLine />}
                  onClick={() => setCustom(custom.filter((_, j) => j !== i))}
                />
              </HStack>
            ))}
            {custom.length < LIMITS.customRepliesMax && (
              <HStack gap="x2" align="flex-start">
                <div style={{ flex: 1 }}>
                  <TextInput
                    ariaLabel="새 답글"
                    placeholder="예: DM 확인해 주세요 💌"
                    value={draft}
                    onChange={setDraft}
                    max={LIMITS.replyText}
                    onEnter={add}
                  />
                </div>
                <ActionButton
                  variant="neutralWeak"
                  disabled={!draft.trim()}
                  onClick={add}
                >
                  추가
                </ActionButton>
              </HStack>
            )}
            {customOk && (
              <HStack gap="x2" align="flex-start">
                <div style={{ flex: 1 }}>
                  <TextInput
                    ariaLabel="답글 모음 이름"
                    placeholder="이 답글들을 모음으로 저장 (이름)"
                    value={saveName}
                    onChange={setSaveName}
                    max={LIMITS.replySetName}
                  />
                </div>
                <ActionButton
                  variant="neutralWeak"
                  disabled={!saveName.trim()}
                  onClick={async () => {
                    try {
                      await api("/reply-sets", {
                        body: { name: saveName, replies: custom },
                      });
                      setSaveName("");
                      toast(
                        "답글 모음을 저장했어요. 다음부터 불러올 수 있어요",
                        "positive",
                      );
                      void sets.reload();
                    } catch (e) {
                      onError(e);
                    }
                  }}
                >
                  모음 저장
                </ActionButton>
              </HStack>
            )}
          </VStack>
        )}
      </VStack>
    </Modal>
  );
}

/* ───────────── 추가 기능도 켤까요? (가이드 2-6) ───────────── */

export function ExtrasEditor(props: {
  extras: Extras;
  onChange?: (e: Extras) => void;
  /** 정해진 발송 방식 (예약·일괄이면 댓글 답글 불가) */
  sendMode?: SendMode;
  code?: string;
  username?: string;
  /** 템플릿 만들기 1단계처럼 설명 태그를 보여 줄 때 */
  showTags?: boolean;
  /** 팔로워/비팔로워 다른 DM 스위치를 함께 보여 줄 때 (템플릿 만들기) */
  gate?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  const e = props.extras;
  const r = e.commentReply;
  const ro = !props.onChange;
  const set = (patch: Partial<Extras>) => props.onChange?.({ ...e, ...patch });
  const setReply = (patch: Partial<CommentReplySetting>) =>
    set({ commentReply: { ...r, ...patch } });
  const replyBlocked = props.sendMode && props.sendMode !== "immediate";
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();

  const toneSample =
    r.tone === "custom"
      ? r.custom.length
        ? `${r.custom[0]}${r.custom.length > 1 ? ` 외 ${r.custom.length - 1}개` : ""}`
        : "답글을 넣어 주세요"
      : r.tone === "polite"
        ? POLITE_REPLIES[0]
        : FRIENDLY_REPLIES[0];
  const guide = fanGuideText(
    props.username,
    props.code ?? "····",
    e.shareReply,
    e.codeReply,
  );

  return (
    <VStack gap="x3">
      {props.gate && (
        <FeatureCard
          icon={<Icon svg={<IconPerson2Line />} />}
          title="팔로워/비팔로워에게 다른 DM 보내기"
          description="팔로우 여부에 따라 서로 다른 DM을 보내요"
          tags={props.showTags ? "#팔로우유도 #팔로워전용혜택" : undefined}
          checked={props.gate.checked}
          onChange={props.gate.onChange}
        />
      )}
      <FeatureCard
        icon={<Icon svg={<IconDot3HorizontalChatbubbleLeftLine />} />}
        title="댓글에 답글 달기"
        description={
          replyBlocked
            ? "예약·일괄 발송에서는 댓글 답글을 쓸 수 없어요 (짧은 시간에 답글이 몰리면 인스타그램이 제한할 수 있어요)"
            : "DM이 나간 뒤 그 댓글에 답글을 달아요. 몰리지 않게 하나씩 간격을 두고 달고, DM을 못 보낸 댓글에는 달지 않아요"
        }
        tags={props.showTags ? "#DM확인안내 #댓글반응늘리기" : undefined}
        checked={r.enabled && !replyBlocked}
        disabled={!!replyBlocked}
        onChange={ro ? undefined : (v) => setReply({ enabled: v })}
      >
        {r.enabled && !replyBlocked && (
          <VStack gap="x2">
            {r.tone !== "custom" && (
              <VStack gap="x1">
                <Text textStyle="t3Medium" color="fg.neutralMuted">
                  돌려 쓸 기본 답글 수 — 많을수록 같은 답글이 덜 반복돼요
                </Text>
                <Chip.RadioRoot
                  value={String(r.count)}
                  onValueChange={(v: string) =>
                    setReply({ count: Number(v) as 10 | 20 | 30 })
                  }
                  aria-label="돌려 쓸 답글 수"
                >
                  <HStack gap="x2">
                    {[10, 20, 30].map((n) => (
                      <Chip.RadioItem
                        key={n}
                        value={String(n)}
                        size="medium"
                        variant="outlineStrong"
                        disabled={ro}
                      >
                        <Chip.Label>{n}개</Chip.Label>
                      </Chip.RadioItem>
                    ))}
                  </HStack>
                </Chip.RadioRoot>
              </VStack>
            )}
            <button
              type="button"
              className="tone-row"
              onClick={() => !ro && setPickerOpen(true)}
              disabled={ro}
            >
              <Text
                textStyle="t3Bold"
                color="fg.neutralMuted"
                style={{ flexShrink: 0 }}
              >
                {TONE_LABEL[r.tone]}
              </Text>
              <Text textStyle="t4Regular" maxLines={1} style={{ flex: 1 }}>
                {toneSample}
              </Text>
              <Icon svg={<IconChevronRightLine />} />
            </button>
            {r.tone === "custom" &&
              r.custom.length < LIMITS.customRepliesMin && (
                <Text textStyle="t2Regular" color="fg.critical">
                  내 답글은 {LIMITS.customRepliesMin}개 이상 넣어 주세요
                </Text>
              )}
          </VStack>
        )}
      </FeatureCard>
      <FeatureCard
        icon={<Icon svg={<IconPaperplaneLine />} />}
        title="DM 공유에도 답하기"
        badge="NEW"
        description="이 게시물을 내 계정에 DM으로 공유한 팬에게 자동 DM을 보내요. 댓글을 남기지 않는 팬에게도 닿아요"
        checked={e.shareReply}
        onChange={ro ? undefined : (v) => set({ shareReply: v })}
      />
      <FeatureCard
        icon={<Icon svg={<IconKeyholeShieldLine />} />}
        title="DM 코드에도 답하기"
        badge="NEW"
        description="DM으로 코드를 보낸 팬에게 자동 DM을 보내요. 스토리·라이브처럼 댓글을 받기 어려운 곳에서 쓰기 좋아요"
        checked={e.codeReply}
        onChange={ro ? undefined : (v) => set({ codeReply: v })}
      />
      {guide && props.code !== undefined && (
        <div className="guide-box">
          <HStack justify="space-between" pb="x1">
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              팬에게 이렇게 알려 주세요
            </Text>
            <ActionButton
              size="xsmall"
              variant="ghost"
              onClick={async () =>
                (await copyText(guide)) &&
                toast(
                  "문구를 복사했어요. 스토리나 캡션에 붙여 넣으세요",
                  "positive",
                )
              }
            >
              복사
            </ActionButton>
          </HStack>
          <Text as="p" textStyle="t4Bold">
            {e.codeReply ? (
              <>
                {guide.split(props.code!)[0]}
                <span className="code-inline">{props.code}</span>
                {guide.split(props.code!)[1]}
              </>
            ) : (
              guide
            )}
          </Text>
          {e.shareReply && (
            <Text
              as="p"
              textStyle="t2Regular"
              color="fg.neutralSubtle"
              style={{ marginTop: 6 }}
            >
              팬이 게시물의 ✈️ 공유 아이콘을 눌러 내 계정으로 보내야 동작해요.
              @아이디를 함께 알려 주면 공유 목록에서 바로 찾을 수 있어요.
            </Text>
          )}
        </div>
      )}
      {e.codeReply && props.code === undefined && props.onChange && (
        <div className="guide-box">
          <Text textStyle="t3Regular" color="fg.neutralMuted">
            DM 코드는 저장하면 새로 만들어져요. 저장한 뒤 자동화 상세에서 코드와
            팬 안내 문구를 확인·복사할 수 있어요.
          </Text>
        </div>
      )}
      <ReplyPickerModal
        open={pickerOpen}
        value={r}
        onClose={() => setPickerOpen(false)}
        onSave={(v) => setReply(v)}
      />
    </VStack>
  );
}
