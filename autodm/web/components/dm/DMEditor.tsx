import { IconChevronRightLine, IconPersonCircleLine } from "@karrotmarket/react-monochrome-icon";
import { Icon, SuffixIcon, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { TabsList, TabsRoot, TabsTrigger } from "seed-design/ui/tabs";
import { Checkbox } from "seed-design/ui/checkbox";
import { emptyButton } from "@shared/factory";
import type { DMButton, DMContent, DMMessage, LinkItem, Post } from "@shared/types";
import { Conversation, type DMTab } from "./Bubble";
import { ButtonEditSheet, FullEditModal, TextEditSheet, tabOk } from "./sheets";

export type { DMTab };

/** 원래 문구 + 다른 문구 수 */
const variantCount = (m: DMMessage) => (m.format === "text" ? 1 + (m.variants ?? []).filter((x) => x.trim()).length : 1);

function GateTabs(props: { value: DMTab; onChange: (t: DMTab) => void; dm: DMContent; readOnly?: boolean }) {
  // 보이지 않는 탭에 고칠 곳이 있으면 점으로 알려 줘요 (SEED Tabs notification) — 미리보기에서는 표시 안 함
  const warn = (t: DMTab) => !props.readOnly && !tabOk(props.dm, t);
  return (
    <TabsRoot value={props.value} onValueChange={(v) => props.onChange(v as DMTab)} triggerLayout="fill" size="small">
      <TabsList aria-label="받는 사람">
        <TabsTrigger value="gate" notification={warn("gate")}>팔로우 확인</TabsTrigger>
        <TabsTrigger value="follower" notification={warn("follower")}>팔로워</TabsTrigger>
        <TabsTrigger value="nonFollower" notification={warn("nonFollower")}>비팔로워</TabsTrigger>
      </TabsList>
    </TabsRoot>
  );
}

/**
 * 팬이 받을 DM 확인·수정 (가이드 2-4, 2-5)
 * - 말풍선·버튼을 누르면 바로 수정
 * - 팔로우 확인 후 보내기 스위치 → 팔로우 확인 / 팔로워 / 비팔로워 탭
 */
export function DMStage(props: {
  dm: DMContent;
  onChange: (dm: DMContent) => void;
  username?: string;
  post?: Post | null;
  links: LinkItem[];
  /** 등록한 뒤에는 팔로우 확인 여부를 바꿀 수 없어요 */
  gateLocked?: boolean;
  /** 템플릿 만들기 2단계처럼 스위치 없이 쓰는 경우 */
  hideGateSwitch?: boolean;
  sampleComment?: string;
}) {
  const { dm, onChange } = props;
  const gate = dm.followGate.enabled;
  const [tab, setTab] = useState<DMTab>("gate");
  const current: DMTab = gate ? tab : "follower";

  const [textOpen, setTextOpen] = useState(false);
  const [btnOpen, setBtnOpen] = useState(false);
  const [btn, setBtn] = useState<DMButton | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);

  const msgOf = (t: DMTab): DMMessage => (t === "nonFollower" ? dm.followGate.nonFollower : dm.main);
  const setMsg = (t: DMTab, m: DMMessage) => {
    if (t === "nonFollower") onChange({ ...dm, followGate: { ...dm.followGate, nonFollower: m } });
    else onChange({ ...dm, main: m });
  };

  return (
    <VStack gap="x3">
      <div className="stage">
        {!props.hideGateSwitch && (
          <div className="stage__head">
            <VStack gap="x0_5" grow>
              {/* 등록할 때 함께 저장되는 선택 → Checkbox (SEED: Switch는 바로 적용될 때만) */}
              <Checkbox
                label="팔로우 확인 후 보내기"
                weight="bold"
                checked={gate}
                disabled={props.gateLocked}
                onCheckedChange={(c) => {
                  const v = c === true;
                  const main = !v && dm.main.format === "carousel" ? { ...dm.main, format: "text" as const } : dm.main;
                  onChange({ ...dm, main, followGate: { ...dm.followGate, enabled: v } });
                  setTab("gate");
                }}
              />
              {props.gateLocked && (
                <Text textStyle="t2Regular" color="fg.neutralSubtle">
                  팔로우 확인 여부는 등록한 뒤 바꿀 수 없어요
                </Text>
              )}
            </VStack>
          </div>
        )}
        {gate && <GateTabs value={current} onChange={setTab} dm={dm} />}
        <Conversation
          dm={dm}
          tab={current}
          username={props.username}
          post={props.post}
          sampleComment={props.sampleComment}
          showLinks
          edit={{
            onEditText: () => setTextOpen(true),
            onEditButton: (b) => {
              setBtn(b);
              setBtnOpen(true);
            },
            onAddButton: () => {
              setBtn(null);
              setBtnOpen(true);
            },
            onEditCard: (i) => {
              setCardIdx(i);
              setFullOpen(true);
            },
            onEditGateButton: () => {
              setBtn({ id: "gate", title: dm.followGate.gateButtonTitle, url: "" });
              setBtnOpen(true);
            },
          }}
        />
      </div>
      <ActionButton variant="neutralWeak" size="large" onClick={() => (setCardIdx(0), setFullOpen(true))}>
        DM 전체 편집하기
        <SuffixIcon svg={<IconChevronRightLine />} />
      </ActionButton>
      <Text textStyle="t2Regular" color="fg.neutralSubtle" align="center">
        말풍선과 버튼을 누르면 바로 수정할 수 있어요
        {current !== "gate" && variantCount(msgOf(current)) > 1 && ` · 문구 ${variantCount(msgOf(current))}개 중 하나를 팬마다 골라 보내요`}
      </Text>

      <TextEditSheet
        open={textOpen}
        title={current === "gate" ? "팔로우 확인 DM 수정" : "DM 글 수정"}
        value={current === "gate" ? dm.followGate.gateText : msgOf(current).text}
        variants={current === "gate" ? undefined : (msgOf(current).variants ?? [])}
        onClose={() => setTextOpen(false)}
        onSave={(text, variants) => {
          if (current === "gate") onChange({ ...dm, followGate: { ...dm.followGate, gateText: text } });
          else setMsg(current, { ...msgOf(current), text, variants });
        }}
      />
      <ButtonEditSheet
        open={btnOpen}
        button={btn}
        nameOnly={btn?.id === "gate"}
        links={props.links}
        onClose={() => setBtnOpen(false)}
        onDelete={btn && btn.id !== "gate" ? () => setMsg(current, { ...msgOf(current), buttons: msgOf(current).buttons.filter((x) => x.id !== btn.id) }) : undefined}
        onSave={(b) => {
          if (b.id === "gate") {
            onChange({ ...dm, followGate: { ...dm.followGate, gateButtonTitle: b.title } });
            return;
          }
          const m = msgOf(current);
          const exists = m.buttons.some((x) => x.id === b.id);
          setMsg(current, { ...m, buttons: exists ? m.buttons.map((x) => (x.id === b.id ? b : x)) : [...m.buttons, { ...emptyButton(), ...b }] });
        }}
      />
      <FullEditModal
        open={fullOpen}
        dm={dm}
        initialTab={current}
        initialCard={cardIdx}
        links={props.links}
        username={props.username}
        post={props.post}
        sampleComment={props.sampleComment}
        onClose={() => setFullOpen(false)}
        onSave={onChange}
      />
    </VStack>
  );
}

/** 읽기 전용 미리보기 (템플릿·상세) */
export function DMPreview(props: { dm: DMContent; username?: string; post?: Post | null; sampleComment?: string; header?: React.ReactNode }) {
  const gate = props.dm.followGate.enabled;
  const [tab, setTab] = useState<DMTab>("gate");
  return (
    <div className="stage">
      {props.header}
      {gate && <GateTabs value={tab} onChange={setTab} dm={props.dm} readOnly />}
      <Conversation dm={props.dm} tab={gate ? tab : "follower"} username={props.username} post={props.post} sampleComment={props.sampleComment} />
    </div>
  );
}

