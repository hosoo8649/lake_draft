import { IconTrashcanLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Chip } from "seed-design/ui/chip";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { Switch } from "seed-design/ui/switch";
import { LIMITS } from "@shared/limits";
import { FRIENDLY_REPLIES, POLITE_REPLIES } from "@shared/presets";
import type { Extras, SendMode } from "@shared/types";
import { TextInput } from "../fields";
import { IconBtn } from "../ui";

function ToggleRow(props: { title: string; description: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <HStack justify="space-between" align="flex-start" gap="x4">
      <VStack gap="x0_5">
        <Text textStyle="t5Bold" color={props.disabled ? "fg.disabled" : "fg.neutral"}>
          {props.title}
        </Text>
        <Text textStyle="t3Regular" color="fg.neutralMuted">
          {props.description}
        </Text>
      </VStack>
      <Switch checked={props.checked} disabled={props.disabled} onCheckedChange={props.onChange} aria-label={props.title} />
    </HStack>
  );
}

export function ExtrasEditor(props: {
  extras: Extras;
  onChange?: (e: Extras) => void;
  /** 정해진 발송 방식 (예약·일괄이면 댓글 답글 불가) */
  sendMode?: SendMode;
  code?: string;
}) {
  const e = props.extras;
  const r = e.commentReply;
  const set = (patch: Partial<Extras>) => props.onChange?.({ ...e, ...patch });
  const setReply = (patch: Partial<Extras["commentReply"]>) => set({ commentReply: { ...r, ...patch } });
  const replyBlocked = props.sendMode && props.sendMode !== "immediate";
  const [draft, setDraft] = useState("");
  const ro = !props.onChange;

  const preview = r.tone === "polite" ? POLITE_REPLIES.slice(0, r.count) : r.tone === "friendly" ? FRIENDLY_REPLIES.slice(0, r.count) : [];

  return (
    <VStack gap="x6">
      <VStack gap="x4">
        <ToggleRow
          title="댓글에 답글 달기"
          description={
            replyBlocked
              ? "예약·일괄 발송에서는 댓글 답글을 쓸 수 없어요 (짧은 시간에 답글이 몰리면 인스타그램이 제한할 수 있어요)"
              : "DM을 보낸 댓글에 공개 답글도 달아요. 팬이 DM을 확인하도록 알려 주고, 게시물 반응도 살아나요"
          }
          checked={r.enabled && !replyBlocked}
          disabled={ro || !!replyBlocked}
          onChange={(v) => setReply({ enabled: v })}
        />
        {r.enabled && !replyBlocked && (
          <VStack gap="x4" pl="x4" style={{ borderLeft: "2px solid var(--seed-color-stroke-neutral-subtle)" }}>
            <VStack gap="x2">
              <Text textStyle="t4Bold">말투</Text>
              <SegmentedControl aria-label="말투" value={r.tone} onValueChange={(v) => setReply({ tone: v as typeof r.tone })}>
                <SegmentedControlItem value="polite">정중하게</SegmentedControlItem>
                <SegmentedControlItem value="friendly">친근하게</SegmentedControlItem>
                <SegmentedControlItem value="custom">내 답글</SegmentedControlItem>
              </SegmentedControl>
            </VStack>
            {r.tone !== "custom" ? (
              <VStack gap="x2">
                <Text textStyle="t4Bold">답글 개수</Text>
                <Chip.RadioRoot value={String(r.count)} onValueChange={(v: string) => setReply({ count: Number(v) as 10 | 20 | 30 })} aria-label="답글 개수">
                  <HStack gap="x2">
                    {[10, 20, 30].map((n) => (
                      <Chip.RadioItem key={n} value={String(n)} size="small" variant="outlineStrong">
                        <Chip.Label>{n}개</Chip.Label>
                      </Chip.RadioItem>
                    ))}
                  </HStack>
                </Chip.RadioRoot>
                <Text textStyle="t2Regular" color="fg.neutralSubtle">
                  {r.count}개의 답글 중에서 무작위로 골라 달아요. 예: “{preview[0]}”, “{preview[1]}”
                </Text>
              </VStack>
            ) : (
              <VStack gap="x2">
                <HStack justify="space-between">
                  <Text textStyle="t4Bold">내 답글</Text>
                  <Text textStyle="t2Regular" color={r.custom.length < LIMITS.customRepliesMin ? "fg.critical" : "fg.neutralSubtle"}>
                    {r.custom.length}/{LIMITS.customRepliesMax} · {LIMITS.customRepliesMin}개 이상
                  </Text>
                </HStack>
                {r.custom.map((c, i) => (
                  <HStack key={i} gap="x2" className="card" style={{ padding: "8px 12px" }}>
                    <Text textStyle="t4Regular" style={{ flex: 1 }}>
                      {c}
                    </Text>
                    <IconBtn label="답글 삭제" icon={<IconTrashcanLine />} onClick={() => setReply({ custom: r.custom.filter((_, j) => j !== i) })} />
                  </HStack>
                ))}
                {r.custom.length < LIMITS.customRepliesMax && (
                  <HStack gap="x2" align="flex-start">
                    <div style={{ flex: 1 }}>
                      <TextInput
                        ariaLabel="새 답글"
                        placeholder="예: DM 확인해 주세요 💌"
                        value={draft}
                        onChange={setDraft}
                        max={LIMITS.replyText}
                        onEnter={() => {
                          if (draft.trim()) setReply({ custom: [...r.custom, draft.trim()] });
                          setDraft("");
                        }}
                      />
                    </div>
                    <ActionButton
                      variant="neutralWeak"
                      disabled={!draft.trim()}
                      onClick={() => {
                        setReply({ custom: [...r.custom, draft.trim()] });
                        setDraft("");
                      }}
                    >
                      추가
                    </ActionButton>
                  </HStack>
                )}
                <Text textStyle="t2Regular" color="fg.neutralSubtle">
                  같은 문구가 반복되면 인스타그램이 반복 활동으로 볼 수 있어요. 최대한 다양하게 써 주세요.
                </Text>
              </VStack>
            )}
          </VStack>
        )}
      </VStack>

      <ToggleRow
        title="DM 공유에도 답하기"
        description="팬이 이 게시물을 ✈️ 공유로 내 계정에 DM으로 보내면 같은 DM을 보내요. 댓글을 남기지 않는 팬에게도 닿을 수 있어요"
        checked={e.shareReply}
        disabled={ro}
        onChange={(v) => set({ shareReply: v })}
      />
      <ToggleRow
        title="DM 코드에도 답하기"
        description={`팬이 ${LIMITS.codeLength}자리 코드를 DM으로 보내면 같은 DM을 보내요. 스토리·라이브처럼 댓글을 받기 어려운 곳에서 쓰기 좋아요${
          props.code ? ` (코드: ${props.code})` : " (코드는 등록하면 만들어져요)"
        }`}
        checked={e.codeReply}
        disabled={ro}
        onChange={(v) => set({ codeReply: v })}
      />
    </VStack>
  );
}
