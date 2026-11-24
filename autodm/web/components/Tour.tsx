import { HStack, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Modal } from "./Modal";

const SLIDES = [
  {
    emoji: "🏠",
    title: "홈에서 한눈에 봐요",
    body: "보낸 DM·읽음·클릭률과 최근 7일 추이, 게시물별로 묶인 자동화를 한 화면에서 확인해요.",
  },
  {
    emoji: "⚡",
    title: "세 단계면 자동 DM 완성",
    body: "게시물 → 템플릿 → 최종 확인. 템플릿을 고르면 DM 문구·버튼·팔로우 확인·답글 설정이 한 번에 채워져요.",
  },
  {
    emoji: "✏️",
    title: "미리보기에서 바로 고쳐요",
    body: "팬이 받을 DM이 인스타그램 화면 그대로 보여요. 말풍선과 버튼을 누르면 바로 수정할 수 있어요.",
  },
  {
    emoji: "🗂️",
    title: "자주 쓰는 DM은 템플릿으로",
    body: "DM과 추가 기능 설정을 템플릿으로 저장해 두면, 다음부터 고르기만 하면 돼요.",
  },
  {
    emoji: "⏸️",
    title: "한 번에 멈추고 다시 켜요",
    body: "이벤트가 끝났거나 링크를 잠깐 바꿔야 할 때 설정 › 운영에서 DM 발송과 댓글 답글을 한 번에 멈출 수 있어요.",
  },
];

export const TOUR_KEY = "autodm:tour-seen";

/** 오토DM 둘러보기 */
export function Tour(props: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const close = () => {
    localStorage.setItem(TOUR_KEY, "1");
    setI(0);
    props.onClose();
  };
  const s = SLIDES[i];
  return (
    <Modal
      open={props.open}
      onClose={close}
      title="오토DM 둘러보기"
      footer={
        <HStack gap="x2" width="full">
          {i > 0 && (
            <ActionButton variant="neutralWeak" onClick={() => setI(i - 1)}>
              이전
            </ActionButton>
          )}
          <ActionButton variant="brandSolid" flexGrow onClick={() => (last ? close() : setI(i + 1))}>
            {last ? "시작하기" : "다음"}
          </ActionButton>
        </HStack>
      }
    >
      <VStack gap="x4" align="center" py="x6" style={{ textAlign: "center", minHeight: 220 }}>
        <div style={{ fontSize: 56 }}>{s.emoji}</div>
        <Text textStyle="t7Bold">{s.title}</Text>
        <Text textStyle="t4Regular" color="fg.neutralMuted">
          {s.body}
        </Text>
        <HStack gap="x1_5" pt="x2" aria-label={`${i + 1} / ${SLIDES.length}`}>
          {SLIDES.map((_, k) => (
            <span
              key={k}
              style={{
                width: k === i ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: k === i ? "var(--seed-color-bg-neutral-inverted)" : "var(--seed-color-bg-neutral-weak)",
                transition: "width 0.2s",
              }}
            />
          ))}
        </HStack>
      </VStack>
    </Modal>
  );
}
