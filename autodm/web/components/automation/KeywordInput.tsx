import { IconPlusLine, IconXmarkLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Chip } from "seed-design/ui/chip";
import { LIMITS } from "@shared/limits";
import { keywordAddError, keywordKey, keywordsTotalChars, normalizeKeyword, splitKeywordInput } from "@shared/validation";

export function KeywordInput(props: {
  keywords: string[];
  onChange: (k: string[]) => void;
  usedOnPost: string[];
  ideas: string[];
  showEmptyError?: boolean;
  disabled?: boolean;
  /** 입력 상자 아래 안내 (기본: 자동 DM 기준) */
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = (raw: string) => {
    const parts = splitKeywordInput(raw);
    let next = [...props.keywords];
    let err: string | null = null;
    for (const p of parts) {
      const e = keywordAddError(p, next, props.usedOnPost);
      if (e) {
        err = `${e}: ${p}`;
        continue;
      }
      next = [...next, p];
    }
    props.onChange(next);
    setError(err);
    setDraft("");
  };

  const ideas = props.ideas.filter((i) => !props.keywords.some((k) => normalizeKeyword(k) === normalizeKeyword(i)));
  const total = keywordsTotalChars(props.keywords);
  const usedKeys = new Set(props.usedOnPost.map(keywordKey));
  const conflict = props.keywords.find((k) => usedKeys.has(keywordKey(k)));
  const shownError =
    error ??
    (conflict
      ? `이미 이 게시물의 다른 자동화에 걸린 키워드예요: ${conflict} (눌러서 지워 주세요)`
      : props.showEmptyError && props.keywords.length === 0
        ? "키워드를 넣어 주세요"
        : null);

  return (
    <VStack gap="x3">
      <div className="keyword-box" data-invalid={!!shownError}>
        {props.keywords.map((k) => (
          <Chip.Button
            key={k}
            size="small"
            variant="solid"
            disabled={props.disabled}
            onClick={() => props.onChange(props.keywords.filter((x) => x !== k))}
            aria-label={`${k} 지우기`}
          >
            <Chip.Label>{k}</Chip.Label>
            <Chip.SuffixIcon>
              <Icon svg={<IconXmarkLine />} />
            </Chip.SuffixIcon>
          </Chip.Button>
        ))}
        <input
          className="kbd-input"
          value={draft}
          disabled={props.disabled}
          placeholder={props.keywords.length ? "키워드 더 넣기" : "키워드 입력 (쉼표로 여러 개)"}
          aria-label="키워드 입력"
          onChange={(e) => {
            const v = e.target.value;
            if (/[,\n]/.test(v)) add(v);
            else {
              setDraft(v);
              setError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (draft.trim()) add(draft);
            }
            if (e.key === "Backspace" && !draft && props.keywords.length) {
              props.onChange(props.keywords.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
        />
        <ActionButton
          layout="iconOnly"
          variant="ghost"
          size="small"
          aria-label="키워드 추가"
          disabled={props.disabled || !draft.trim()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => draft.trim() && add(draft)}
        >
          <Icon svg={<IconPlusLine />} />
        </ActionButton>
      </div>
      <HStack justify="space-between">
        <Text textStyle="t2Regular" color={shownError ? "fg.critical" : "fg.neutralSubtle"}>
          {shownError ?? props.hint ?? "‘링크 주세요’처럼 키워드가 문장 안에 있어도 보내요"}
        </Text>
        <Text textStyle="t2Regular" color="fg.neutralSubtle">
          {total}/{LIMITS.keywordsTotalChars}자
        </Text>
      </HStack>
      {ideas.length > 0 && !props.disabled && (
        <VStack gap="x2">
          <Text textStyle="t3Medium" color="fg.neutralMuted">
            키워드 아이디어
          </Text>
          <div className="chips">
            {ideas.map((i) => (
              <button key={i} type="button" className="idea-chip" onClick={() => add(i)} aria-label={`키워드 ${i} 넣기`}>
                <Icon svg={<IconPlusLine />} />
                {i}
              </button>
            ))}
          </div>
        </VStack>
      )}
    </VStack>
  );
}
