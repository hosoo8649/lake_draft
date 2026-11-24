import { IconPersonLine, IconPlusLine, IconSparkle2Line, IconTrashcanLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, PrefixIcon, Text, VStack } from "@seed-design/react";
import { useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { LIMITS, MAX_VARIANTS } from "@shared/limits";
import { glen } from "@shared/validation";
import { api } from "../../lib/api";
import { useAppState } from "../../lib/appState";
import { useErrorToast, useToast } from "../feedback";
import { TextArea } from "../fields";
import { IconBtn } from "../ui";

export const NAME_TOKEN = "{이름}";

/**
 * DM 문구 입력 + {이름} 넣기
 * 커서가 있던 자리에 {이름}을 넣어요. 보낼 때 받는 팬의 인스타그램 아이디로 바뀌어요.
 */
export function PersonalTextArea(props: {
  label?: string;
  /** 칸 이름을 화면에 보이지 않을 때 */
  ariaLabel?: string;
  /** 다른 문구처럼 여러 칸이 이어질 때는 버튼만 작게 */
  compact?: boolean;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  autoFocus?: boolean;
  description?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const insertName = () => {
    const ta = box.current?.querySelector("textarea");
    const v = props.value;
    const start = ta?.selectionStart ?? v.length;
    const end = ta?.selectionEnd ?? v.length;
    if (glen(v) + NAME_TOKEN.length - (end - start) > LIMITS.dmText) return;
    // 앞 글자와 붙지 않게 띄어 쓰지 않아요 — "{이름}님" 처럼 바로 이어 쓰는 경우가 많아요
    const next = v.slice(0, start) + NAME_TOKEN + v.slice(end);
    props.onChange(next);
    requestAnimationFrame(() => {
      const el = box.current?.querySelector("textarea");
      if (!el) return;
      el.focus();
      const pos = start + NAME_TOKEN.length;
      el.setSelectionRange(pos, pos);
    });
  };
  return (
    <VStack gap="x2" ref={box}>
      <TextArea
        label={props.label}
        ariaLabel={props.ariaLabel}
        value={props.value}
        onChange={props.onChange}
        max={LIMITS.dmText}
        rows={props.rows ?? 5}
        autoFocus={props.autoFocus}
        description={props.description}
      />
      <HStack gap="x2" align="center" wrap>
        <ActionButton size="xsmall" variant="neutralWeak" onClick={insertName}>
          <PrefixIcon svg={<IconPersonLine />} />
          {NAME_TOKEN} 넣기
        </ActionButton>
        {!props.compact && (
          <Text textStyle="t2Regular" color="fg.neutralSubtle">
            보낼 때 팬의 인스타그램 아이디로 바뀌어요
          </Text>
        )}
      </HStack>
    </VStack>
  );
}

/**
 * 다른 문구 (선택)
 * 여러 개를 넣으면 팬마다 하나를 골라 보내요. 똑같은 DM을 수백 번 보내는 것보다 안전해요.
 */
export function VariantsEditor(props: { text: string; variants: string[]; onChange: (v: string[]) => void }) {
  const { state } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const [busy, setBusy] = useState(false);
  const list = props.variants;
  const room = MAX_VARIANTS - list.length;
  const set = (i: number, v: string) => props.onChange(list.map((x, j) => (j === i ? v : x)));

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api<{ variants: string[] }>("/ai/variants", { body: { text: props.text, count: Math.min(3, room) } });
      // 빈 칸은 AI 문구로 채우고, 남는 건 뒤에 붙여요
      const kept = list.filter((x) => x.trim());
      const next = [...kept, ...r.variants.filter((x) => !kept.includes(x))].slice(0, MAX_VARIANTS);
      props.onChange(next);
      toast(`AI가 문구 ${next.length - kept.length}개를 만들었어요. 보내기 전에 한 번 읽어 봐 주세요`, "positive");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap="x3" className="variants">
      <VStack gap="x1">
        <Text textStyle="t4Bold">다른 문구 (선택)</Text>
        <Text textStyle="t3Regular" color="fg.neutralMuted">
          뜻이 같은 문구를 여러 개 넣으면 팬마다 하나를 골라 보내요. 똑같은 DM을 반복해서 보내는 것보다 인스타그램 스팸 감지에 덜 걸려요.
        </Text>
      </VStack>
      {list.map((v, i) => (
        <HStack key={i} gap="x2" align="flex-start">
          <div style={{ flex: 1, minWidth: 0 }}>
            <PersonalTextArea ariaLabel={`다른 문구 ${i + 1}`} value={v} onChange={(x) => set(i, x)} rows={3} compact />
          </div>
          <div style={{ paddingTop: 6 }}>
            <IconBtn label={`${i + 1}번째 다른 문구 삭제`} icon={<IconTrashcanLine />} onClick={() => props.onChange(list.filter((_, j) => j !== i))} />
          </div>
        </HStack>
      ))}
      <HStack gap="x2" wrap>
        <ActionButton size="small" variant="neutralWeak" disabled={room <= 0} onClick={() => props.onChange([...list, ""])}>
          <PrefixIcon svg={<IconPlusLine />} />
          직접 추가
        </ActionButton>
        {state?.aiAvailable && (
          <ActionButton size="small" variant="neutralWeak" loading={busy} disabled={room <= 0 || !props.text.trim()} onClick={generate}>
            <PrefixIcon svg={<IconSparkle2Line />} />
            AI로 만들기
          </ActionButton>
        )}
      </HStack>
      <Text textStyle="t2Regular" color="fg.neutralSubtle">
        {room <= 0
          ? `다른 문구는 ${MAX_VARIANTS}개까지 넣을 수 있어요`
          : state?.aiAvailable
            ? "AI는 지금 문구와 뜻이 같게, 링크와 {이름}은 그대로 두고 표현만 바꿔요"
            : `원래 문구까지 최대 ${MAX_VARIANTS + 1}개 중 하나를 보내요`}
      </Text>
    </VStack>
  );
}
