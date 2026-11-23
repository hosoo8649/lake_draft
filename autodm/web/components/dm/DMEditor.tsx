import { HStack, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { Switch } from "seed-design/ui/switch";
import { emptyButton } from "@shared/factory";
import { LIMITS } from "@shared/limits";
import type { DMButton, DMContent, DMMessage, LinkItem } from "@shared/types";
import { FanBubble, MessageView, Phone, TextBubble } from "./Phone";
import { ButtonEditSheet, FullEditSheet, TextEditSheet } from "./sheets";

export type DMTab = "gate" | "follower" | "nonFollower";

interface Props {
  dm: DMContent;
  onChange?: (dm: DMContent) => void;
  username?: string;
  links: LinkItem[];
  /** 팔로우 확인 스위치 표시 / 잠금 (등록 후에는 바꿀 수 없어요) */
  gateSwitch?: "show" | "locked" | "hidden";
  /** 팬이 남긴 댓글 예시 */
  sampleComment?: string;
}

export function DMEditor({ dm, onChange, username, links, gateSwitch = "show", sampleComment }: Props) {
  const gate = dm.followGate.enabled;
  const [tab, setTab] = useState<DMTab>("gate");
  const current: DMTab = gate ? tab : "follower";
  const editable = !!onChange;

  const [textOpen, setTextOpen] = useState(false);
  const [btnOpen, setBtnOpen] = useState(false);
  const [btn, setBtn] = useState<DMButton | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);

  const msgOf = (t: DMTab): DMMessage => (t === "nonFollower" ? dm.followGate.nonFollower : dm.main);
  const setMsg = (t: DMTab, m: DMMessage) => {
    if (!onChange) return;
    if (t === "nonFollower") onChange({ ...dm, followGate: { ...dm.followGate, nonFollower: m } });
    else onChange({ ...dm, main: m });
  };
  const maxButtons = current === "nonFollower" ? LIMITS.buttonsPerMessage - 1 : LIMITS.buttonsPerMessage;

  const edit = editable
    ? {
        onEditText: () => setTextOpen(true),
        onEditButton: (b: DMButton) => {
          setBtn(b);
          setBtnOpen(true);
        },
        onAddButton: () => {
          setBtn(null);
          setBtnOpen(true);
        },
        onEditCard: (i: number) => {
          setCardIdx(i);
          setFullOpen(true);
        },
      }
    : undefined;

  const recheck = { title: dm.followGate.gateButtonTitle || "팔로우 했어요", note: "다시 확인 버튼 (자동)" };

  return (
    <VStack gap="x4">
      {gateSwitch !== "hidden" && (
        <HStack justify="space-between" align="center" className="card" style={{ padding: "14px 16px" }}>
          <VStack gap="x0_5">
            <Text textStyle="t5Bold">팔로우 확인 후 보내기</Text>
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              {gateSwitch === "locked"
                ? "팔로우 확인 여부는 등록한 뒤 바꿀 수 없어요"
                : "팔로워에게만 준비한 DM을 보내고, 아직 팔로우하지 않은 팬에게는 다른 DM을 보내요"}
            </Text>
          </VStack>
          <Switch
            checked={gate}
            disabled={gateSwitch === "locked" || !editable}
            onCheckedChange={(v) => {
              if (!onChange) return;
              const main = !v && dm.main.format === "carousel" ? { ...dm.main, format: "text" as const } : dm.main;
              onChange({ ...dm, main, followGate: { ...dm.followGate, enabled: v } });
              setTab("gate");
            }}
          />
        </HStack>
      )}

      {gate && (
        <SegmentedControl aria-label="받는 사람" value={current} onValueChange={(v) => setTab(v as DMTab)}>
          <SegmentedControlItem value="gate">팔로우 확인</SegmentedControlItem>
          <SegmentedControlItem value="follower">팔로워</SegmentedControlItem>
          <SegmentedControlItem value="nonFollower">비팔로워</SegmentedControlItem>
        </SegmentedControl>
      )}

      <Phone
        username={username}
        caption={
          current === "gate"
            ? "댓글을 남긴 팬 전원이 가장 먼저 받는 DM"
            : current === "follower" && gate
              ? "확인 버튼을 눌렀을 때 팔로우 중이면 받는 DM"
              : current === "nonFollower"
                ? "확인 버튼을 눌렀을 때 아직 팔로우하지 않았다면 받는 DM"
                : "댓글을 남긴 팬이 받는 DM"
        }
      >
        {sampleComment && (current === "gate" || !gate) && <FanBubble>💬 댓글: {sampleComment}</FanBubble>}
        {current === "gate" ? (
          <TextBubble
            text={dm.followGate.gateText}
            buttons={[]}
            username={username}
            edit={editable ? { onEditText: () => setTextOpen(true) } : undefined}
            extraButtons={[
              {
                title: dm.followGate.gateButtonTitle || "팔로우 했어요",
                note: editable ? "팔로우 확인 버튼 · 이름만 바꿀 수 있어요" : undefined,
                onClick: editable
                  ? () => {
                      setBtn({ id: "gate", title: dm.followGate.gateButtonTitle, url: "" });
                      setBtnOpen(true);
                    }
                  : undefined,
              },
            ]}
          />
        ) : (
          <>
            {gate && <FanBubble>{recheck.title}</FanBubble>}
            <MessageView
              message={msgOf(current)}
              username={username}
              edit={edit}
              maxButtons={maxButtons}
              extraButtons={current === "nonFollower" ? [recheck] : undefined}
            />
          </>
        )}
      </Phone>

      {editable && current !== "gate" && (
        <ActionButton variant="neutralWeak" onClick={() => (setCardIdx(0), setFullOpen(true))}>
          DM 전체 편집하기
        </ActionButton>
      )}
      {editable && (
        <Text textStyle="t2Regular" color="fg.neutralSubtle" align="center">
          말풍선과 버튼을 누르면 바로 수정할 수 있어요
        </Text>
      )}

      {/* 시트 */}
      <TextEditSheet
        open={textOpen}
        title={current === "gate" ? "팔로우 확인 DM 수정" : "DM 글 수정"}
        value={current === "gate" ? dm.followGate.gateText : msgOf(current).text}
        onClose={() => setTextOpen(false)}
        onSave={(text) => {
          if (!onChange) return;
          if (current === "gate") onChange({ ...dm, followGate: { ...dm.followGate, gateText: text } });
          else setMsg(current, { ...msgOf(current), text });
        }}
      />
      <ButtonEditSheet
        open={btnOpen}
        button={btn}
        nameOnly={btn?.id === "gate"}
        links={links}
        onClose={() => setBtnOpen(false)}
        onDelete={btn && btn.id !== "gate" ? () => setMsg(current, { ...msgOf(current), buttons: msgOf(current).buttons.filter((x) => x.id !== btn.id) }) : undefined}
        onSave={(b) => {
          if (!onChange) return;
          if (b.id === "gate") {
            onChange({ ...dm, followGate: { ...dm.followGate, gateButtonTitle: b.title } });
            return;
          }
          const m = msgOf(current);
          const exists = m.buttons.some((x) => x.id === b.id);
          setMsg(current, {
            ...m,
            buttons: exists ? m.buttons.map((x) => (x.id === b.id ? b : x)) : [...m.buttons, { ...emptyButton(), ...b }],
          });
        }}
      />
      <FullEditSheet
        open={fullOpen}
        title={current === "nonFollower" ? "비팔로워 DM 전체 편집" : gate ? "팔로워 DM 전체 편집" : "DM 전체 편집"}
        message={msgOf(current)}
        allowCarousel={gate && current === "follower"}
        carouselHint="이미지 캐러셀은 팔로우 확인을 켰을 때 팔로워 DM에서만 쓸 수 있어요"
        maxButtons={maxButtons}
        links={links}
        initialCard={cardIdx}
        onClose={() => setFullOpen(false)}
        onSave={(m) => setMsg(current, m)}
      />
    </VStack>
  );
}
