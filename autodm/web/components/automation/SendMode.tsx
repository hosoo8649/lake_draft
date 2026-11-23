import { HStack, Text, VStack } from "@seed-design/react";
import { useMemo } from "react";
import { Chip } from "seed-design/ui/chip";
import { SelectContent, SelectGroup, SelectItem, SelectRoot, SelectTrigger } from "seed-design/ui/select";
import { Switch } from "seed-design/ui/switch";
import { DAY, LIMITS, MINUTE } from "@shared/limits";
import type { SendMode } from "@shared/types";
import { SEND_MODE_DESC, SEND_MODE_LABEL, fmtDateTime } from "../../lib/format";

const ICON: Record<SendMode, string> = { immediate: "✈️", scheduled: "⏱️", batch: "📨" };

export function SendModeOptions(props: {
  value: SendMode;
  onChange: (m: SendMode) => void;
  disabled?: Partial<Record<SendMode, string>>;
}) {
  return (
    <VStack gap="x2" role="radiogroup" aria-label="언제 보낼까요?">
      {(["immediate", "scheduled", "batch"] as SendMode[]).map((m) => {
        const reason = props.disabled?.[m];
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={props.value === m}
            className="option-card"
            data-selected={props.value === m}
            disabled={!!reason}
            onClick={() => props.onChange(m)}
          >
            <span className="option-card__icon">{ICON[m]}</span>
            <VStack gap="x0_5" as="span">
              <Text textStyle="t5Bold">{SEND_MODE_LABEL[m]}</Text>
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                {reason ?? SEND_MODE_DESC[m]}
              </Text>
            </VStack>
          </button>
        );
      })}
    </VStack>
  );
}

const STEP = LIMITS.scheduleStepMinutes * MINUTE;
const ceilSlot = (t: number) => Math.ceil(t / STEP) * STEP;

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function SchedulePicker(props: {
  at: number;
  continueAfter: boolean;
  onChange: (at: number, continueAfter: boolean) => void;
  now?: number;
}) {
  const now = props.now ?? Date.now();
  const first = ceilSlot(now + MINUTE);
  const last = Math.floor((now + LIMITS.scheduleMaxDays * DAY) / STEP) * STEP;

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let t = first; t <= last; t += STEP) out.push(t);
    return out;
  }, [first, last]);

  const days = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of slots) if (!m.has(dayKey(s))) m.set(dayKey(s), s);
    return [...m.entries()];
  }, [slots]);

  const selectedDay = dayKey(props.at);
  const timesOfDay = slots.filter((s) => dayKey(s) === selectedDay);

  const at = (base: Date, h: number) => {
    const d = new Date(base);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  };
  const today = new Date(now);
  const tomorrow = new Date(now + DAY);
  const quick = [
    { label: "1시간 뒤", t: ceilSlot(now + 60 * MINUTE) },
    { label: "오늘 저녁", t: at(today, 19) },
    { label: "내일 아침", t: at(tomorrow, 9) },
    { label: "내일 저녁", t: at(tomorrow, 19) },
  ].filter((q) => q.t >= first && q.t <= last);

  const dLabel = (ts: number) => {
    const d = new Date(ts);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY);
    const pre = diff === 0 ? "오늘" : diff === 1 ? "내일" : `${d.getMonth() + 1}/${d.getDate()}`;
    return `${pre} (${"일월화수목금토"[d.getDay()]})`;
  };
  const tLabel = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <VStack gap="x4">
      <VStack gap="x2">
        <Text textStyle="t4Bold">빠른 선택</Text>
        <div className="chips">
          {quick.map((q) => (
            <Chip.Toggle
              key={q.label}
              size="small"
              variant="outlineStrong"
              checked={props.at === q.t}
              onCheckedChange={() => props.onChange(q.t, props.continueAfter)}
            >
              <Chip.Label>{q.label}</Chip.Label>
            </Chip.Toggle>
          ))}
        </div>
      </VStack>
      <HStack gap="x3" wrap>
        <VStack gap="x1_5" style={{ minWidth: 170, flex: 1 }}>
          <Text textStyle="t3Medium" color="fg.neutralMuted">
            날짜
          </Text>
          <SelectRoot
            value={[selectedDay]}
            onValueChange={(v) => {
              const start = days.find(([k]) => k === v[0])?.[1];
              if (!start) return;
              // 같은 시각을 유지하되 없으면 그 날 첫 슬롯
              const d = new Date(start);
              const keep = new Date(props.at);
              d.setHours(keep.getHours(), keep.getMinutes(), 0, 0);
              const t = slots.includes(d.getTime()) ? d.getTime() : start;
              props.onChange(t, props.continueAfter);
            }}
          >
            <SelectTrigger aria-label="날짜" placeholder="날짜" />
            <SelectContent>
              <SelectGroup>
                {days.map(([k, s]) => (
                  <SelectItem key={k} value={k} label={dLabel(s)} />
                ))}
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        </VStack>
        <VStack gap="x1_5" style={{ minWidth: 140, flex: 1 }}>
          <Text textStyle="t3Medium" color="fg.neutralMuted">
            시간 (30분 단위)
          </Text>
          <SelectRoot value={[String(props.at)]} onValueChange={(v) => props.onChange(Number(v[0]), props.continueAfter)}>
            <SelectTrigger aria-label="시간" placeholder="시간" />
            <SelectContent>
              <SelectGroup>
                {timesOfDay.map((s) => (
                  <SelectItem key={s} value={String(s)} label={tLabel(s)} />
                ))}
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        </VStack>
      </HStack>
      <Text textStyle="t3Regular" color="fg.brand">
        {fmtDateTime(props.at)}에 그때까지 모인 댓글에 한 번에 보내요
      </Text>
      <HStack justify="space-between" align="flex-start" gap="x4" className="card" style={{ padding: "14px 16px" }}>
        <VStack gap="x0_5">
          <Text textStyle="t4Bold">보낸 뒤 새 댓글에도 바로 보내기</Text>
          <Text textStyle="t3Regular" color="fg.neutralMuted">
            켜 두면 예약 시각이 지난 뒤 달리는 댓글에도 바로 보내요
          </Text>
        </VStack>
        <Switch checked={props.continueAfter} onCheckedChange={(v) => props.onChange(props.at, v)} aria-label="보낸 뒤 새 댓글에도 바로 보내기" />
      </HStack>
    </VStack>
  );
}

export function defaultScheduleAt(now = Date.now()): number {
  return ceilSlot(now + 60 * MINUTE);
}
