import { IconChevronLeftLine, IconChevronRightLine, IconTrashcanLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Text, VStack } from "@seed-design/react";
import { useEffect, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { ChipTabsList, ChipTabsRoot, ChipTabsTrigger } from "seed-design/ui/chip-tabs";
import { RadioGroup, RadioGroupItem } from "seed-design/ui/radio-group";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { cloneDeep, emptyButton, emptyCard } from "@shared/factory";
import { LIMITS } from "@shared/limits";
import type { CarouselCard, DMButton, DMMessage, LinkItem } from "@shared/types";
import { isValidUrl, normalizeUrl } from "@shared/validation";
import { api } from "../../lib/api";
import { TextArea, TextInput } from "../fields";
import { Modal } from "../Modal";
import { IconBtn } from "../ui";

/* ───────────── DM 글 수정 ───────────── */

export function TextEditSheet(props: {
  open: boolean;
  title?: string;
  value: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(props.value);
  useEffect(() => {
    if (props.open) setV(props.value);
  }, [props.open, props.value]);
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title ?? "DM 글 수정"}
      description="링크는 본문보다 버튼에 넣어 주세요. 본문의 주소는 눌리지 않을 수 있어요."
      primary={{ label: "완료", onClick: () => (props.onSave(v), props.onClose()), disabled: !v.trim() }}
    >
      <TextArea label="DM 문구" value={v} onChange={setV} max={LIMITS.dmText} rows={6} autoFocus />
    </Modal>
  );
}

/* ───────────── 버튼 수정 ───────────── */

export function LinkPicker(props: { url: string; onChange: (url: string, linkId?: string) => void; links: LinkItem[]; linkId?: string }) {
  const [mode, setMode] = useState<"paste" | "mine">(props.linkId ? "mine" : "paste");
  return (
    <VStack gap="x3">
      <SegmentedControl aria-label="링크 넣는 방법" value={mode} onValueChange={(v) => setMode(v as "paste" | "mine")}>
        <SegmentedControlItem value="paste">주소 붙여넣기</SegmentedControlItem>
        <SegmentedControlItem value="mine">내 링크에서 고르기</SegmentedControlItem>
      </SegmentedControl>
      {mode === "paste" ? (
        <TextInput
          label="연결할 링크"
          placeholder="https://"
          value={props.url}
          onChange={(u) => props.onChange(u)}
          error={props.url && !isValidUrl(normalizeUrl(props.url)) ? "올바른 링크 주소를 넣어 주세요" : undefined}
        />
      ) : props.links.length === 0 ? (
        <Callout tone="neutral" description="저장한 링크가 없어요. 왼쪽 메뉴의 ‘내 링크’에서 자주 쓰는 링크를 저장해 두세요." />
      ) : (
        <RadioGroup
          aria-label="내 링크"
          value={props.linkId ?? ""}
          onValueChange={(id) => {
            const l = props.links.find((x) => x.id === id);
            if (l) props.onChange(l.url, l.id);
          }}
        >
          {props.links.map((l) => (
            <RadioGroupItem
              key={l.id}
              value={l.id}
              label={
                <VStack gap="x0_5" as="span">
                  <Text textStyle="t4Medium">{l.title}</Text>
                  <Text textStyle="t2Regular" color="fg.neutralSubtle">
                    {l.url}
                  </Text>
                </VStack>
              }
            />
          ))}
        </RadioGroup>
      )}
    </VStack>
  );
}

export function ButtonEditSheet(props: {
  open: boolean;
  button: DMButton | null;
  nameOnly?: boolean;
  links: LinkItem[];
  onClose: () => void;
  onSave: (b: DMButton) => void;
  onDelete?: () => void;
}) {
  const [b, setB] = useState<DMButton>(props.button ?? emptyButton());
  useEffect(() => {
    if (props.open) setB(props.button ?? emptyButton());
  }, [props.open, props.button]);
  const urlOk = props.nameOnly || isValidUrl(normalizeUrl(b.url));
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.nameOnly ? "버튼 이름 수정" : "버튼 수정"}
      description={props.nameOnly ? "팔로우 확인 버튼은 이름만 바꿀 수 있어요." : undefined}
      footer={
        <HStack gap="x2" width="full">
          {props.onDelete && (
            <ActionButton variant="neutralWeak" onClick={() => (props.onDelete!(), props.onClose())}>
              삭제
            </ActionButton>
          )}
          <ActionButton
            variant="neutralSolid"
            flexGrow
            disabled={!b.title.trim() || !urlOk}
            onClick={() => {
              props.onSave({ ...b, title: b.title.trim(), url: props.nameOnly ? b.url : normalizeUrl(b.url) });
              props.onClose();
            }}
          >
            완료
          </ActionButton>
        </HStack>
      }
    >
      <VStack gap="x5">
        <TextInput label="버튼 이름" value={b.title} onChange={(title) => setB({ ...b, title })} max={LIMITS.buttonTitle} autoFocus />
        {!props.nameOnly && (
          <LinkPicker
            url={b.url}
            linkId={b.linkId}
            links={props.links}
            onChange={(url, linkId) => setB({ ...b, url, linkId })}
          />
        )}
      </VStack>
    </Modal>
  );
}

/* ───────────── DM 전체 편집 ───────────── */

function ButtonsEditor(props: { buttons: DMButton[]; max: number; onChange: (b: DMButton[]) => void; links: LinkItem[] }) {
  const [editing, setEditing] = useState<DMButton | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <VStack gap="x2">
      <HStack justify="space-between">
        <Text textStyle="t4Bold">버튼</Text>
        <Text textStyle="t2Regular" color="fg.neutralSubtle">
          {props.buttons.length}/{props.max}
        </Text>
      </HStack>
      {props.buttons.map((b, i) => (
        <HStack key={b.id} gap="x2" className="card" style={{ padding: "10px 12px" }}>
          <VStack grow gap="x0_5" style={{ minWidth: 0, cursor: "pointer" }} onClick={() => (setEditing(b), setOpen(true))}>
            <Text textStyle="t4Medium">{b.title || "(이름 없음)"}</Text>
            <Text textStyle="t2Regular" color={isValidUrl(b.url) ? "fg.neutralSubtle" : "fg.critical"} maxLines={1}>
              {isValidUrl(b.url) ? b.url : "링크 설정 안 됨"}
            </Text>
          </VStack>
          <IconBtn label="버튼 삭제" icon={<IconTrashcanLine />} onClick={() => props.onChange(props.buttons.filter((_, j) => j !== i))} />
        </HStack>
      ))}
      {props.buttons.length < props.max && (
        <ActionButton
          variant="neutralOutline"
          size="small"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + 버튼 추가
        </ActionButton>
      )}
      <ButtonEditSheet
        open={open}
        button={editing}
        links={props.links}
        onClose={() => setOpen(false)}
        onSave={(nb) => {
          const exists = props.buttons.some((x) => x.id === nb.id);
          props.onChange(exists ? props.buttons.map((x) => (x.id === nb.id ? nb : x)) : [...props.buttons, nb]);
        }}
      />
    </VStack>
  );
}

function CardEditor(props: { card: CarouselCard; onChange: (c: CarouselCard) => void; links: LinkItem[] }) {
  const c = props.card;
  const [fillUrl, setFillUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fill = async () => {
    const url = normalizeUrl(fillUrl);
    if (!isValidUrl(url)) return;
    setBusy(true);
    try {
      const meta = await api<{ title: string; description: string; image: string }>(`/link-preview?url=${encodeURIComponent(url)}`);
      props.onChange({
        ...c,
        title: (meta.title || c.title).slice(0, LIMITS.cardTitle),
        subtitle: (meta.description || c.subtitle).slice(0, LIMITS.cardSubtitle),
        imageUrl: meta.image || c.imageUrl,
        buttons: c.buttons.length ? c.buttons : [emptyButton("자세히 보기", url)],
      });
      setFillUrl("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <VStack gap="x4">
      <HStack gap="x2" align="flex-end">
        <div style={{ flex: 1 }}>
          <TextInput
            label="링크로 카드 한 번에 채우기"
            placeholder="https://"
            value={fillUrl}
            onChange={setFillUrl}
            onEnter={fill}
            description="링크의 제목·설명·이미지로 지금 카드를 채워요"
          />
        </div>
        <ActionButton variant="neutralWeak" loading={busy} onClick={fill} disabled={!fillUrl.trim()} style={{ marginBottom: 22 }}>
          불러오기
        </ActionButton>
      </HStack>
      <TextInput label="이미지 주소" placeholder="https:// (1:1 비율 권장)" value={c.imageUrl} onChange={(imageUrl) => props.onChange({ ...c, imageUrl })} />
      <TextInput label="제목" value={c.title} onChange={(title) => props.onChange({ ...c, title })} max={LIMITS.cardTitle} />
      <TextInput label="설명" value={c.subtitle} onChange={(subtitle) => props.onChange({ ...c, subtitle })} max={LIMITS.cardSubtitle} />
      <ButtonsEditor buttons={c.buttons} max={LIMITS.buttonsPerMessage} links={props.links} onChange={(buttons) => props.onChange({ ...c, buttons })} />
    </VStack>
  );
}

export function FullEditSheet(props: {
  open: boolean;
  title: string;
  message: DMMessage;
  allowCarousel: boolean;
  carouselHint?: string;
  maxButtons: number;
  links: LinkItem[];
  initialCard?: number;
  onClose: () => void;
  onSave: (m: DMMessage) => void;
}) {
  const [m, setM] = useState<DMMessage>(cloneDeep(props.message));
  const [cardIdx, setCardIdx] = useState(0);
  useEffect(() => {
    if (props.open) {
      setM(cloneDeep(props.message));
      setCardIdx(props.initialCard ?? 0);
    }
  }, [props.open, props.message, props.initialCard]);

  const setCard = (i: number, c: CarouselCard) => setM({ ...m, cards: m.cards.map((x, j) => (j === i ? c : x)) });
  const moveCard = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.cards.length) return;
    const cards = [...m.cards];
    [cards[i], cards[j]] = [cards[j], cards[i]];
    setM({ ...m, cards });
    setCardIdx(j);
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      primary={{ label: "완료", onClick: () => (props.onSave(m), props.onClose()) }}
    >
      <VStack gap="x5">
        <VStack gap="x2">
          <Text textStyle="t4Bold">DM 형식</Text>
          <SegmentedControl
            aria-label="DM 형식"
            value={m.format}
            onValueChange={(v) => {
              if (v === "carousel" && !props.allowCarousel) return;
              setM({ ...m, format: v as DMMessage["format"], cards: v === "carousel" && m.cards.length === 0 ? [emptyCard()] : m.cards });
            }}
          >
            <SegmentedControlItem value="text">텍스트</SegmentedControlItem>
            <SegmentedControlItem value="carousel" disabled={!props.allowCarousel}>
              이미지 캐러셀
            </SegmentedControlItem>
          </SegmentedControl>
          {!props.allowCarousel && props.carouselHint && (
            <Text textStyle="t2Regular" color="fg.neutralSubtle">
              {props.carouselHint}
            </Text>
          )}
        </VStack>

        {m.format === "text" ? (
          <>
            <TextArea label="메시지" value={m.text} onChange={(text) => setM({ ...m, text })} max={LIMITS.dmText} rows={6} />
            <ButtonsEditor buttons={m.buttons} max={props.maxButtons} links={props.links} onChange={(buttons) => setM({ ...m, buttons })} />
          </>
        ) : (
          <VStack gap="x4">
            <HStack justify="space-between" gap="x2" wrap>
              <ChipTabsRoot value={String(cardIdx)} onValueChange={(v) => setCardIdx(Number(v))} size="medium" variant="neutralSolid">
                <ChipTabsList>
                  {m.cards.map((c, i) => (
                    <ChipTabsTrigger key={c.id} value={String(i)}>
                      카드 {i + 1}
                    </ChipTabsTrigger>
                  ))}
                </ChipTabsList>
              </ChipTabsRoot>
              {m.cards.length < LIMITS.cards && (
                <ActionButton
                  size="small"
                  variant="neutralOutline"
                  onClick={() => {
                    setM({ ...m, cards: [...m.cards, emptyCard()] });
                    setCardIdx(m.cards.length);
                  }}
                >
                  + 카드 추가 ({m.cards.length}/{LIMITS.cards})
                </ActionButton>
              )}
            </HStack>
            {m.cards[cardIdx] && (
              <>
                <HStack gap="x1" justify="flex-end">
                  <IconBtn label="앞으로" icon={<IconChevronLeftLine />} onClick={() => moveCard(cardIdx, -1)} />
                  <IconBtn label="뒤로" icon={<IconChevronRightLine />} onClick={() => moveCard(cardIdx, 1)} />
                  {m.cards.length > 1 && (
                    <IconBtn
                      label="카드 삭제"
                      icon={<IconTrashcanLine />}
                      onClick={() => {
                        setM({ ...m, cards: m.cards.filter((_, j) => j !== cardIdx) });
                        setCardIdx(Math.max(0, cardIdx - 1));
                      }}
                    />
                  )}
                </HStack>
                <CardEditor card={m.cards[cardIdx]} links={props.links} onChange={(c) => setCard(cardIdx, c)} />
              </>
            )}
          </VStack>
        )}
      </VStack>
    </Modal>
  );
}
