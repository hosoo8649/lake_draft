import { IconCalendarLine, IconCheckmarkLine, IconDot3HorizontalChatbubbleLeftLine, IconPaperplaneLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { useMemo, type ReactNode } from "react";
import { Chip } from "seed-design/ui/chip";
import { Switch } from "seed-design/ui/switch";
import { WheelPicker } from "seed-design/ui/wheel-picker";
import { DAY, LIMITS, MINUTE } from "@shared/limits";
import type { SendMode } from "@shared/types";
import { SEND_MODE_LABEL, fmtDateTime } from "../../lib/format";

const STEP = LIMITS.scheduleStepMinutes * MINUTE;
const ceilSlot = (t: number) => Math.ceil(t / STEP) * STEP;

export function defaultScheduleAt(now = Date.now()): number {
  return ceilSlot(now + 60 * MINUTE);
}

const ICON: Record<SendMode, ReactNode> = {
  immediate: <IconDot3HorizontalChatbubbleLeftLine />,
  scheduled: <IconCalendarLine />,
  batch: <IconPaperplaneLine />,
};

const SUMMARY: Record<SendMode, string> = {
  immediate: "댓글이 달릴 때마다 바로",
  scheduled: "설정 후 새로 달린 댓글에, 정한 시간에 한 번에",
  batch: `최근 ${LIMITS.batchLookbackDays}일 이내에 달린 댓글에 한 번에`,
};

const DETAILS: Record<SendMode, [string, string][]> = {
  immediate: [
    ["댓글이 달리면 바로 보내요.", "언제든 껐다 켤 수 있어요."],
    ["같은 사람에게는 한 번만.", "이미 DM을 받은 댓글에는 다시 보내지 않아요."],
  ],
  scheduled: [
    ["보내기 전까지 고칠 수 있어요.", "발송 시간·메시지 내용·버튼 링크"],
    ["등록 후 고칠 수 없어요.", "키워드 조건·팔로워 조건 같은 발송 대상 옵션"],
  ],
  batch: [
    ["이미 DM을 받은 댓글에는 다시 가지 않아요.", "기존 자동화를 끄거나 지워도 마찬가지예요."],
    ["다 보내면 즉시 발송으로 바뀌어요.", "이후 댓글에도 계속 보내요."],
    ["보내는 동안 수정·삭제할 수 없어요.", "놓친 댓글이 많이 쌓였을 때 한 번만 쓰는 걸 권장해요."],
  ],
};

export function SendModeOptions(props: {
  value: SendMode;
  onChange: (m: SendMode) => void;
  disabled?: Partial<Record<SendMode, string>>;
  /** 고른 방식 아래에 펼쳐 보여 줄 내용 (예약 시각 고르기) */
  expanded?: Partial<Record<SendMode, ReactNode>>;
}) {
  return (
    <VStack gap="x2" role="radiogroup" aria-label="언제 보낼까요?">
      {(["immediate", "scheduled", "batch"] as SendMode[]).map((m) => {
        const reason = props.disabled?.[m];
        const selected = props.value === m;
        return (
          <div key={m} className="option-card" data-selected={selected} style={{ flexDirection: "column", cursor: "default", opacity: reason ? 0.5 : 1 }}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!!reason}
              onClick={() => props.onChange(m)}
              style={{ all: "unset", display: "flex", gap: 12, alignItems: "center", width: "100%", cursor: reason ? "not-allowed" : "pointer" }}
            >
              <span className="option-card__icon">
                <Icon svg={ICON[m]} />
              </span>
              <VStack gap="x0_5" as="span" grow>
                <Text textStyle="t5Bold">{SEND_MODE_LABEL[m]}</Text>
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  {reason ?? SUMMARY[m]}
                </Text>
              </VStack>
              <span className="option-card__radio" aria-hidden />
            </button>
            {selected && !reason && (
              <div className="option-card__detail" style={{ width: "100%" }}>
                {DETAILS[m].map(([b, rest]) => (
                  <HStack key={b} gap="x2" align="flex-start">
                    <Icon svg={<IconCheckmarkLine />} size="x4" color="fg.neutralSubtle" />
                    <span>
                      <b>{b}</b> {rest}
                    </span>
                  </HStack>
                ))}
                {props.expanded?.[m] && <div style={{ marginTop: 8 }}>{props.expanded[m]}</div>}
              </div>
            )}
          </div>
        );
      })}
    </VStack>
  );
}

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 예약 시각 — 빠른 선택 + 시간 휠 (다음 30분 단위부터 7일 뒤까지) */
export function SchedulePicker(props: { at: number; continueAfter: boolean; onChange: (at: number, continueAfter: boolean) => void; now?: number }) {
  const now = props.now ?? Date.now();
  const first = ceilSlot(now + MINUTE);
  const last = Math.floor((now + LIMITS.scheduleMaxDays * DAY) / STEP) * STEP;

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let t = first; t <= last; t += STEP) out.push(t);
    return out;
  }, [first, last]);

  const days = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of slots) m.set(dayKey(s), [...(m.get(dayKey(s)) ?? []), s]);
    return [...m.entries()];
  }, [slots]);

  const at = slots.includes(props.at) ? props.at : slots[0];
  const selectedDay = dayKey(at);
  const timesOfDay = days.find(([k]) => k === selectedDay)?.[1] ?? [];

  const setHour = (base: Date, h: number) => {
    const d = new Date(base);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  };
  const quick = [
    { label: "1시간 뒤", t: ceilSlot(now + 60 * MINUTE) },
    { label: "오늘 저녁", t: setHour(new Date(now), 19) },
    { label: "내일 아침", t: setHour(new Date(now + DAY), 9) },
    { label: "내일 저녁", t: setHour(new Date(now + DAY), 19) },
  ].filter((q) => q.t >= first && q.t <= last);

  const dLabel = (ts: number) => {
    const d = new Date(ts);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
    const pre = diff === 0 ? "오늘" : diff === 1 ? "내일" : `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `${pre} (${"일월화수목금토"[d.getDay()]})`;
  };
  const tLabel = (ts: number) => {
    const d = new Date(ts);
    const h = d.getHours();
    return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <VStack gap="x3">
      <div className="chips">
        {quick.map((q) => (
          <Chip.Toggle key={q.label} size="small" variant="outlineStrong" checked={at === q.t} onCheckedChange={() => props.onChange(q.t, props.continueAfter)}>
            <Chip.Label>{q.label}</Chip.Label>
          </Chip.Toggle>
        ))}
      </div>
      <WheelPicker
        aria-label="보낼 시각"
        columns={[
          {
            id: "day",
            "aria-label": "날짜",
            options: days.map(([k, s]) => ({ value: k, label: dLabel(s[0]) })),
            value: selectedDay,
            onValueChange: (k: string) => {
              const list = days.find(([x]) => x === k)?.[1];
              if (!list) return;
              // 같은 시각을 유지하되 없으면 그날 첫 시각
              const keep = new Date(at);
              const same = list.find((s) => new Date(s).getHours() === keep.getHours() && new Date(s).getMinutes() === keep.getMinutes());
              props.onChange(same ?? list[0], props.continueAfter);
            },
          },
          {
            id: "time",
            "aria-label": "시간",
            options: timesOfDay.map((s) => ({ value: String(s), label: tLabel(s) })),
            value: String(at),
            onValueChange: (v: string) => props.onChange(Number(v), props.continueAfter),
          },
        ]}
      />
      <Text textStyle="t3Bold" color="fg.brand" align="center">
        {fmtDateTime(at)}에 보내요
      </Text>
      <HStack justify="space-between" align="flex-start" gap="x4" className="guide-box">
        <VStack gap="x0_5">
          <Text textStyle="t4Bold">보낸 뒤 새 댓글에도 바로 보내기</Text>
          <Text textStyle="t3Regular" color="fg.neutralMuted">
            예약 시각이 지난 뒤 달리는 댓글에도 바로 보내요
          </Text>
        </VStack>
        <Switch checked={props.continueAfter} onCheckedChange={(v) => props.onChange(at, v)} aria-label="보낸 뒤 새 댓글에도 바로 보내기" />
      </HStack>
    </VStack>
  );
}
