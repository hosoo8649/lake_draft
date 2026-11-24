import {
  IconCheckmarkFill,
  IconPaperclipLine,
  IconTrashcanLine,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { RadioGroup, RadioGroupItem } from "seed-design/ui/radio-group";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "seed-design/ui/segmented-control";
import { cloneDeep, emptyButton, emptyCard } from "@shared/factory";
import { LIMITS } from "@shared/limits";
import type {
  CarouselCard,
  DMButton,
  DMContent,
  DMMessage,
  LinkItem,
  Post,
} from "@shared/types";
import {
  isValidImageUrl,
  isValidUrl,
  normalizeUrl,
  validateMessage,
} from "@shared/validation";
import { api, uploadImage } from "../../lib/api";
import { useErrorToast, useToast } from "../feedback";
import { TextArea, TextInput } from "../fields";
import { TabsList, TabsRoot, TabsTrigger } from "seed-design/ui/tabs";
import { Chip } from "seed-design/ui/chip";
import { Modal } from "../Modal";
import { IconBtn } from "../ui";
import { Conversation, type DMTab } from "./Bubble";

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
      primary={{
        label: "완료",
        onClick: () => (props.onSave(v), props.onClose()),
        disabled: !v.trim(),
      }}
    >
      <TextArea
        label="DM 문구"
        value={v}
        onChange={setV}
        max={LIMITS.dmText}
        rows={6}
        autoFocus
      />
    </Modal>
  );
}

/* ───────────── 링크 고르기 ───────────── */

export function LinkPicker(props: {
  url: string;
  onChange: (url: string, linkId?: string) => void;
  links: LinkItem[];
  linkId?: string;
}) {
  const [mode, setMode] = useState<"paste" | "mine">(
    props.linkId ? "mine" : "paste",
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const onError = useErrorToast();
  const normalized = props.url.trim() ? normalizeUrl(props.url) : "";
  const canSave = !!normalized && isValidUrl(normalized) && !props.links.some((l) => l.url === normalized);
  // 만드는 도중에도 이 주소를 '내 링크'에 저장해서 다음에 바로 고를 수 있어요
  const saveToMine = async () => {
    setSaving(true);
    try {
      const host = new URL(normalized).hostname.replace(/^www\./, "");
      const l = await api<LinkItem>("/links", { body: { title: host.slice(0, 40), url: normalized } });
      props.onChange(l.url, l.id);
      toast("내 링크에 저장했어요. 이름은 ‘내 링크’에서 바꿀 수 있어요", "positive");
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <VStack gap="x3">
      {/* 한 화면에 Segmented Control은 하나만 — 링크 넣는 방법은 칩으로 골라요 */}
      <Chip.RadioRoot aria-label="링크 넣는 방법" value={mode} onValueChange={(v: string) => setMode(v as "paste" | "mine")}>
        <HStack gap="x2">
          <Chip.RadioItem value="paste" size="small" variant="outlineStrong">
            <Chip.Label>주소 붙여넣기</Chip.Label>
          </Chip.RadioItem>
          <Chip.RadioItem value="mine" size="small" variant="outlineStrong">
            <Chip.Label>내 링크에서 고르기</Chip.Label>
          </Chip.RadioItem>
        </HStack>
      </Chip.RadioRoot>
      {mode === "paste" ? (
        <TextInput
          label="연결할 링크"
          placeholder="https://"
          value={props.url}
          onChange={(u) => props.onChange(u)}
          error={
            props.url && !isValidUrl(normalizeUrl(props.url))
              ? "올바른 링크 주소를 넣어 주세요"
              : undefined
          }
          suffix={
            canSave ? (
              <ActionButton size="xsmall" variant="ghost" loading={saving} onClick={saveToMine}>
                내 링크에 저장
              </ActionButton>
            ) : undefined
          }
        />
      ) : props.links.length === 0 ? (
        <Callout
          tone="neutral"
          description="저장한 링크가 아직 없어요. ‘주소 붙여넣기’로 주소를 넣고 ‘내 링크에 저장’을 누르면 여기서 바로 고를 수 있어요."
        />
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

/* ───────────── 버튼 수정 (말풍선의 버튼을 눌렀을 때) ───────────── */

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
      title={
        props.nameOnly
          ? "버튼 이름 수정"
          : props.button
            ? "버튼 수정"
            : "버튼 추가"
      }
      description={
        props.nameOnly ? "팔로우 확인 버튼은 이름만 바꿀 수 있어요." : undefined
      }
      footer={
        <HStack gap="x2" width="full">
          {props.onDelete && (
            <ActionButton
              variant="neutralWeak"
              onClick={() => (props.onDelete!(), props.onClose())}
            >
              삭제
            </ActionButton>
          )}
          <ActionButton
            variant="neutralSolid"
            flexGrow
            disabled={!b.title.trim() || !urlOk}
            onClick={() => {
              props.onSave({
                ...b,
                title: b.title.trim(),
                url: props.nameOnly ? b.url : normalizeUrl(b.url),
              });
              props.onClose();
            }}
          >
            완료
          </ActionButton>
        </HStack>
      }
    >
      <VStack gap="x5">
        <TextInput
          label="버튼 이름"
          value={b.title}
          onChange={(title) => setB({ ...b, title })}
          max={LIMITS.buttonTitle}
          autoFocus
        />
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

/* ───────────── 버튼 목록 (다이얼로그 안에서 펼쳐서 편집) ───────────── */

function ButtonsEditor(props: {
  buttons: DMButton[];
  max: number;
  onChange: (b: DMButton[]) => void;
  links: LinkItem[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (id: string, patch: Partial<DMButton>) =>
    props.onChange(
      props.buttons.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    );
  return (
    <VStack gap="x2">
      <HStack justify="space-between">
        <Text textStyle="t4Bold">버튼</Text>
        <Text textStyle="t2Regular" color="fg.neutralSubtle">
          {props.buttons.length}/{props.max}
        </Text>
      </HStack>
      {props.buttons.map((b) =>
        open === b.id ? (
          <VStack key={b.id} gap="x3" className="card" style={{ padding: 14 }}>
            <TextInput
              label="버튼 이름"
              value={b.title}
              onChange={(title) => set(b.id, { title })}
              max={LIMITS.buttonTitle}
              autoFocus
            />
            <LinkPicker
              url={b.url}
              linkId={b.linkId}
              links={props.links}
              onChange={(url, linkId) => set(b.id, { url, linkId })}
            />
            <HStack justify="flex-end" gap="x2">
              <ActionButton
                size="small"
                variant="neutralWeak"
                onClick={() =>
                  props.onChange(props.buttons.filter((x) => x.id !== b.id))
                }
              >
                삭제
              </ActionButton>
              <ActionButton
                size="small"
                variant="neutralSolid"
                onClick={() => {
                  set(b.id, { url: b.url.trim() ? normalizeUrl(b.url) : "" });
                  setOpen(null);
                }}
              >
                완료
              </ActionButton>
            </HStack>
          </VStack>
        ) : (
          <div key={b.id} className="list-btn">
            <Icon
              svg={<IconPaperclipLine />}
              size="x4"
              color="fg.neutralSubtle"
            />
            <button
              type="button"
              className="list-btn__main"
              onClick={() => setOpen(b.id)}
              aria-label={`${b.title || "버튼"} 수정`}
            >
              <Text as="p" textStyle="t4Bold">
                {b.title || "(이름 없음)"}
              </Text>
              <Text
                as="p"
                textStyle="t2Regular"
                color={isValidUrl(b.url) ? "fg.neutralSubtle" : "fg.critical"}
                maxLines={1}
              >
                {isValidUrl(b.url) ? b.url : "링크 설정 안 됨"}
              </Text>
            </button>
            <IconBtn
              label="버튼 삭제"
              icon={<IconTrashcanLine />}
              onClick={() =>
                props.onChange(props.buttons.filter((x) => x.id !== b.id))
              }
            />
          </div>
        ),
      )}
      <button
        type="button"
        className="dashed-btn"
        disabled={props.buttons.length >= props.max}
        onClick={() => {
          const nb = emptyButton("", "");
          props.onChange([...props.buttons, nb]);
          setOpen(nb.id);
        }}
      >
        <Icon svg={<IconPlusLine />} size="x4" />
        버튼 추가
      </button>
    </VStack>
  );
}

/* ───────────── 캐러셀 카드 ───────────── */

function CardEditor(props: {
  card: CarouselCard;
  onChange: (c: CarouselCard) => void;
  /** 비동기 작업(이미지 올리기·링크 불러오기)이 끝났을 때 최신 카드에 덧붙여 적용 */
  onPatch: (
    cardId: string,
    patch: (c: CarouselCard) => Partial<CarouselCard>,
  ) => void;
  links: LinkItem[];
}) {
  const c = props.card;
  const [fillUrl, setFillUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onError = useErrorToast();

  const fill = async () => {
    const url = normalizeUrl(fillUrl);
    if (!isValidUrl(url)) return;
    setBusy(true);
    try {
      const meta = await api<{
        title: string;
        description: string;
        image: string;
      }>(`/link-preview?url=${encodeURIComponent(url)}`);
      props.onPatch(c.id, (cur) => ({
        title: (meta.title || cur.title).slice(0, LIMITS.cardTitle),
        subtitle: (meta.description || cur.subtitle).slice(
          0,
          LIMITS.cardSubtitle,
        ),
        imageUrl: meta.image || cur.imageUrl,
        buttons: cur.buttons.length
          ? cur.buttons
          : [emptyButton("자세히 보기", url)],
      }));
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
          />
        </div>
        <ActionButton
          variant="neutralWeak"
          loading={busy}
          onClick={fill}
          disabled={!fillUrl.trim()}
        >
          불러오기
        </ActionButton>
      </HStack>
      <VStack gap="x2">
        <Text textStyle="t4Bold">이미지</Text>
        <HStack gap="x3" align="center">
          <div
            className="c-card__img"
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              ...(c.imageUrl
                ? { backgroundImage: `url("${c.imageUrl}")` }
                : {}),
            }}
          >
            {!c.imageUrl && "없음"}
          </div>
          <VStack gap="x1_5" grow>
            <HStack gap="x2">
              <ActionButton
                size="small"
                variant="neutralWeak"
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                이미지 올리기
              </ActionButton>
              {c.imageUrl && (
                <ActionButton
                  size="small"
                  variant="ghost"
                  onClick={() => props.onChange({ ...c, imageUrl: "" })}
                >
                  지우기
                </ActionButton>
              )}
            </HStack>
            <Text textStyle="t2Regular" color="fg.neutralSubtle">
              1:1 비율을 권장해요 (세로로 긴 이미지는 잘려 보일 수 있어요) ·
              최대 8MB
            </Text>
          </VStack>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setUploading(true);
              try {
                const imageUrl = await uploadImage(f);
                props.onPatch(c.id, () => ({ imageUrl }));
              } catch (err) {
                onError(err);
              } finally {
                setUploading(false);
              }
            }}
          />
        </HStack>
        <TextInput
          ariaLabel="이미지 주소"
          placeholder="또는 이미지 주소 붙여넣기 (https://)"
          value={c.imageUrl}
          onChange={(imageUrl) => props.onChange({ ...c, imageUrl })}
          error={
            c.imageUrl && !isValidImageUrl(c.imageUrl)
              ? "올바른 이미지 주소가 아니에요"
              : undefined
          }
        />
      </VStack>
      <TextInput
        label="제목"
        value={c.title}
        onChange={(title) => props.onChange({ ...c, title })}
        max={LIMITS.cardTitle}
      />
      <TextInput
        label="설명"
        value={c.subtitle}
        onChange={(subtitle) => props.onChange({ ...c, subtitle })}
        max={LIMITS.cardSubtitle}
      />
      <ButtonsEditor
        buttons={c.buttons}
        max={LIMITS.buttonsPerMessage}
        links={props.links}
        onChange={(buttons) => props.onChange({ ...c, buttons })}
      />
    </VStack>
  );
}

/** 카드 칩 — 끌어서 순서 바꾸기 */
function CardChips(props: {
  cards: CarouselCard[];
  current: number;
  onSelect: (i: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd?: () => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="chips" role="tablist" aria-label="카드">
      {props.cards.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={i === props.current}
          className="drag-chip"
          data-dragging={drag === i}
          data-over={over === i && drag !== i}
          draggable
          onDragStart={(e) => {
            setDrag(i);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (drag !== null && drag !== i) props.onReorder(drag, i);
            setDrag(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onClick={() => props.onSelect(i)}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid var(--seed-color-stroke-neutral-weak)",
            background:
              i === props.current
                ? "var(--seed-color-bg-neutral-inverted)"
                : "var(--seed-color-bg-layer-default)",
            color:
              i === props.current
                ? "var(--seed-color-fg-neutral-inverted)"
                : "var(--seed-color-fg-neutral)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "grab",
          }}
          title="끌어서 순서를 바꿀 수 있어요"
        >
          카드 {i + 1}
        </button>
      ))}
      {props.onAdd && (
        <button
          type="button"
          className="dashed-btn dashed-btn--compact"
          onClick={props.onAdd}
        >
          <Icon svg={<IconPlusLine />} size="x4" />
          카드 추가 ({props.cards.length}/{LIMITS.cards})
        </button>
      )}
    </div>
  );
}

/* ───────────── DM 전체 편집 ───────────── */

/** 받는 사람 탭마다 내용이 다 채워졌는지 (탭에 문제 표시) */
export function tabOk(dm: DMContent, t: DMTab): boolean {
  if (t === "gate")
    return (
      !!dm.followGate.gateText.trim() && !!dm.followGate.gateButtonTitle.trim()
    );
  if (t === "nonFollower")
    return (
      validateMessage(dm.followGate.nonFollower, {
        allowCarousel: false,
        maxButtons: 2,
        label: "",
      }).length === 0
    );
  return (
    validateMessage(dm.main, {
      allowCarousel: dm.followGate.enabled,
      maxButtons: 3,
      label: "",
    }).length === 0
  );
}

const TAB_LABEL: Record<DMTab, string> = {
  gate: "팔로우 확인",
  follower: "팔로워",
  nonFollower: "비팔로워",
};

export function FullEditModal(props: {
  open: boolean;
  dm: DMContent;
  initialTab: DMTab;
  initialCard?: number;
  links: LinkItem[];
  username?: string;
  post?: Post | null;
  sampleComment?: string;
  onClose: () => void;
  onSave: (dm: DMContent) => void;
}) {
  const [dm, setDm] = useState<DMContent>(cloneDeep(props.dm));
  const [tab, setTab] = useState<DMTab>(props.initialTab);
  const [cardIdx, setCardIdx] = useState(0);
  const [askDiscard, setAskDiscard] = useState(false);
  useEffect(() => {
    if (props.open) {
      setDm(cloneDeep(props.dm));
      setTab(props.dm.followGate.enabled ? props.initialTab : "follower");
      setCardIdx(props.initialCard ?? 0);
      setAskDiscard(false);
    }
  }, [props.open]);
  // 고친 내용이 있으면 X·취소로 닫기 전에 그 자리에서 한 번 더 물어봐요 (창 위에 창을 띄우지 않아요)
  const dirty = props.open && JSON.stringify(dm) !== JSON.stringify(props.dm);
  const requestClose = () =>
    dirty && !askDiscard ? setAskDiscard(true) : props.onClose();

  const gate = dm.followGate.enabled;
  const msgKey = tab === "nonFollower" ? "nonFollower" : "main";
  const m: DMMessage =
    tab === "nonFollower" ? dm.followGate.nonFollower : dm.main;
  const setM = (next: DMMessage) =>
    setDm((d) =>
      msgKey === "nonFollower"
        ? { ...d, followGate: { ...d.followGate, nonFollower: next } }
        : { ...d, main: next },
    );
  const allowCarousel = gate && tab === "follower";
  const maxButtons =
    tab === "nonFollower"
      ? LIMITS.buttonsPerMessage - 1
      : LIMITS.buttonsPerMessage;

  return (
    <Modal
      open={props.open}
      onClose={requestClose}
      title="DM 전체 편집하기"
      wide
      secondary={{ label: "취소", onClick: requestClose }}
      primary={{
        label: "완료",
        onClick: () => (props.onSave(dm), props.onClose()),
      }}
    >
      {askDiscard && (
        <div className="discard-bar" role="alert">
          <Text textStyle="t4Medium">
            고친 내용이 있어요. 저장하지 않고 닫을까요?
          </Text>
          <HStack gap="x2">
            <ActionButton
              size="small"
              variant="neutralWeak"
              onClick={() => setAskDiscard(false)}
            >
              계속 고치기
            </ActionButton>
            <ActionButton
              size="small"
              variant="ghost"
              color="fg.critical"
              onClick={props.onClose}
            >
              저장 안 하고 닫기
            </ActionButton>
          </HStack>
        </div>
      )}
      {gate && (
        <TabsRoot value={tab} onValueChange={(v) => setTab(v as DMTab)} triggerLayout="fill" size="medium">
          <TabsList aria-label="받는 사람">
            {(["gate", "follower", "nonFollower"] as DMTab[]).map((t) => (
              <TabsTrigger key={t} value={t}>
                <HStack as="span" gap="x1" align="center">
                  <span className="tab-check" data-ok={tabOk(dm, t)}>
                    <Icon svg={<IconCheckmarkFill />} />
                  </span>
                  {TAB_LABEL[t]}
                </HStack>
              </TabsTrigger>
            ))}
          </TabsList>
        </TabsRoot>
      )}
      <div className="edit-grid">
        <VStack gap="x5">
          {tab === "gate" ? (
            <>
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                댓글을 남긴 팬이 팔로우 여부와 상관없이 가장 먼저 받는 DM이에요.
                팔로우를 부탁하는 문구를 넣어 주세요.
              </Text>
              <TextArea
                label="메시지"
                value={dm.followGate.gateText}
                onChange={(gateText) =>
                  setDm({ ...dm, followGate: { ...dm.followGate, gateText } })
                }
                max={LIMITS.dmText}
                rows={5}
              />
              <TextInput
                label="팔로우 확인 버튼 이름"
                description="이 버튼은 이름만 바꿀 수 있어요"
                value={dm.followGate.gateButtonTitle}
                onChange={(gateButtonTitle) =>
                  setDm({
                    ...dm,
                    followGate: { ...dm.followGate, gateButtonTitle },
                  })
                }
                max={LIMITS.buttonTitle}
              />
            </>
          ) : (
            <>
              <VStack gap="x2">
                <SegmentedControl
                  aria-label="DM 형식"
                  value={m.format}
                  onValueChange={(v) => {
                    if (v === "carousel" && !allowCarousel) return;
                    setM({
                      ...m,
                      format: v as DMMessage["format"],
                      cards:
                        v === "carousel" && m.cards.length === 0
                          ? [emptyCard()]
                          : m.cards,
                    });
                  }}
                >
                  <SegmentedControlItem value="text">
                    텍스트
                  </SegmentedControlItem>
                  <SegmentedControlItem
                    value="carousel"
                    disabled={!allowCarousel}
                  >
                    이미지 캐러셀
                  </SegmentedControlItem>
                </SegmentedControl>
                {!allowCarousel && (
                  <Text textStyle="t2Regular" color="fg.neutralSubtle">
                    이미지 캐러셀은 팔로우 확인을 켰을 때 팔로워 DM에서만 쓸 수
                    있어요
                  </Text>
                )}
              </VStack>
              {m.format === "text" ? (
                <>
                  <TextArea
                    label="메시지"
                    value={m.text}
                    onChange={(text) => setM({ ...m, text })}
                    max={LIMITS.dmText}
                    rows={5}
                  />
                  <ButtonsEditor
                    buttons={m.buttons}
                    max={maxButtons}
                    links={props.links}
                    onChange={(buttons) => setM({ ...m, buttons })}
                  />
                  {tab === "nonFollower" && (
                    <Text textStyle="t2Regular" color="fg.neutralSubtle">
                      비팔로워 DM에는 다시 확인 버튼이 자동으로 붙어서 버튼은
                      2개까지 넣을 수 있어요
                    </Text>
                  )}
                </>
              ) : (
                <VStack gap="x4">
                  <CardChips
                    cards={m.cards}
                    current={cardIdx}
                    onSelect={setCardIdx}
                    onReorder={(from, to) => {
                      const cards = [...m.cards];
                      const [moved] = cards.splice(from, 1);
                      cards.splice(to, 0, moved);
                      setM({ ...m, cards });
                      setCardIdx(to);
                    }}
                    onAdd={
                      m.cards.length < LIMITS.cards
                        ? () => {
                            setM({ ...m, cards: [...m.cards, emptyCard()] });
                            setCardIdx(m.cards.length);
                          }
                        : undefined
                    }
                  />
                  <Text textStyle="t2Regular" color="fg.neutralSubtle">
                    카드를 끌어서 순서를 바꿀 수 있어요
                  </Text>
                  {m.cards[cardIdx] && (
                    <>
                      <CardEditor
                        card={m.cards[cardIdx]}
                        links={props.links}
                        onChange={(c) =>
                          setM({
                            ...m,
                            cards: m.cards.map((x) => (x.id === c.id ? c : x)),
                          })
                        }
                        onPatch={(cardId, patch) =>
                          setDm((d) => {
                            const key =
                              tab === "nonFollower" ? "nonFollower" : "main";
                            const msg =
                              key === "nonFollower"
                                ? d.followGate.nonFollower
                                : d.main;
                            const cards = msg.cards.map((x) =>
                              x.id === cardId ? { ...x, ...patch(x) } : x,
                            );
                            return key === "nonFollower"
                              ? {
                                  ...d,
                                  followGate: {
                                    ...d.followGate,
                                    nonFollower: { ...msg, cards },
                                  },
                                }
                              : { ...d, main: { ...msg, cards } };
                          })
                        }
                      />
                      {m.cards.length > 1 && (
                        <HStack>
                          <ActionButton
                            size="small"
                            variant="neutralWeak"
                            onClick={() => {
                              setM({
                                ...m,
                                cards: m.cards.filter((_, j) => j !== cardIdx),
                              });
                              setCardIdx(Math.max(0, cardIdx - 1));
                            }}
                          >
                            이 카드 삭제
                          </ActionButton>
                        </HStack>
                      )}
                    </>
                  )}
                </VStack>
              )}
            </>
          )}
        </VStack>
        <div className="edit-grid__preview">
          <Conversation
            dm={dm}
            tab={tab}
            username={props.username}
            post={props.post}
            sampleComment={props.sampleComment}
          />
          <Text
            as="p"
            textStyle="t2Regular"
            color="fg.neutralSubtle"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            DM은 짧고 분명할수록 클릭이 많아요. 길면 인스타그램에서 일부가 접혀
            보여요.
          </Text>
        </div>
      </div>
    </Modal>
  );
}
