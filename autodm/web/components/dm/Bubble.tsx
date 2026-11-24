import {
  IconChevronRightLine,
  IconPaperclipLine,
  IconPencilFill,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { Icon, Text } from "@seed-design/react";
import type { ReactNode } from "react";
import type { DMButton, DMContent, DMMessage, Post } from "@shared/types";
import { isValidUrl } from "@shared/validation";
import { PostThumb } from "../ui";

export type DMTab = "gate" | "follower" | "nonFollower";

export interface BubbleEdit {
  onEditText?: () => void;
  onEditButton?: (b: DMButton) => void;
  onAddButton?: () => void;
  onEditCard?: (index: number) => void;
}

export interface ExtraButton {
  title: string;
  note?: string;
  onClick?: () => void;
}

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

export function BubbleAvatar({ name }: { name?: string }) {
  return (
    <div className="bubble-avatar">
      {(name ?? "M").slice(0, 1).toUpperCase()}
    </div>
  );
}

function Pill(props: {
  title: string;
  missing?: boolean;
  editable?: boolean;
  note?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={props.editable ? "pill pill--editable" : "pill"}
      data-missing={props.missing || undefined}
      onClick={props.onClick}
      tabIndex={props.onClick ? 0 : -1}
    >
      {props.title || "버튼 이름"}
      {props.missing && <small>링크 설정 안 됨</small>}
      {!props.missing && props.note && (
        <small style={{ color: "var(--seed-color-fg-neutral-subtle)" }}>
          {props.note}
        </small>
      )}
      {props.editable && (
        <span className="pill__icon" aria-hidden>
          <Icon svg={<IconPencilFill />} />
        </span>
      )}
    </button>
  );
}

/** 인스타그램 DM 한 개 (문구+버튼 또는 이미지 캐러셀) */
export function MessageBubble(props: {
  message: DMMessage;
  username?: string;
  edit?: BubbleEdit;
  maxButtons?: number;
  extraButtons?: ExtraButton[];
}) {
  const { message: m, edit } = props;
  const max = props.maxButtons ?? 3;
  if (m.format === "carousel") {
    return (
      <div className="msg-row">
        <BubbleAvatar name={props.username} />
        <div className="cards-row">
          {m.cards.length === 0 && (
            <Text color="fg.neutralSubtle">카드를 추가해 주세요</Text>
          )}
          {m.cards.map((c, i) => (
            <div
              key={c.id}
              className={
                edit?.onEditCard ? "c-card c-card--editable" : "c-card"
              }
              onClick={() => edit?.onEditCard?.(i)}
              role={edit?.onEditCard ? "button" : undefined}
              tabIndex={edit?.onEditCard ? 0 : undefined}
              onKeyDown={(e) => {
                if (edit?.onEditCard && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  edit.onEditCard(i);
                }
              }}
              aria-label={edit?.onEditCard ? `${i + 1}번 카드 수정` : undefined}
            >
              <div
                className="c-card__img"
                style={
                  c.imageUrl
                    ? { backgroundImage: `url("${c.imageUrl}")` }
                    : undefined
                }
              >
                {!c.imageUrl && "이미지 없음"}
              </div>
              <div className="c-card__body">
                <Text as="p" textStyle="t4Bold" maxLines={2}>
                  {c.title || "카드 제목"}
                </Text>
                {c.subtitle && (
                  <Text
                    as="p"
                    textStyle="t2Regular"
                    color="fg.neutralMuted"
                    maxLines={2}
                  >
                    {c.subtitle}
                  </Text>
                )}
              </div>
              {c.buttons.map((b) => (
                <Pill
                  key={b.id}
                  title={b.title}
                  missing={!!edit && !isValidUrl(b.url)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="msg-row">
      <BubbleAvatar name={props.username} />
      <div className="bubble">
        {edit?.onEditText && (
          <button
            type="button"
            className="bubble__edit"
            aria-label="DM 글 수정"
            onClick={edit.onEditText}
          >
            <Icon svg={<IconPencilFill />} />
          </button>
        )}
        <div
          className={
            edit?.onEditText
              ? "bubble__text bubble__text--editable"
              : "bubble__text"
          }
          onClick={edit?.onEditText}
          role={edit?.onEditText ? "button" : undefined}
          tabIndex={edit?.onEditText ? 0 : undefined}
          onKeyDown={(e) => {
            if (edit?.onEditText && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              edit.onEditText();
            }
          }}
        >
          {m.text || (
            <span style={{ color: "var(--seed-color-fg-placeholder)" }}>
              DM 문구를 넣어 주세요
            </span>
          )}
        </div>
        {m.buttons.map((b) => (
          <Pill
            key={b.id}
            title={b.title}
            missing={!!edit && !isValidUrl(b.url)}
            editable={!!edit?.onEditButton}
            onClick={
              edit?.onEditButton ? () => edit.onEditButton!(b) : undefined
            }
          />
        ))}
        {props.extraButtons?.map((b) => (
          <Pill
            key={b.title}
            title={b.title}
            note={b.note}
            editable={!!b.onClick}
            onClick={b.onClick}
          />
        ))}
        {edit?.onAddButton && m.buttons.length < max && (
          <button
            type="button"
            className="pill pill--add"
            onClick={edit.onAddButton}
          >
            <Icon svg={<IconPlusLine />} size="x4" />
            버튼 추가
            <span>
              {m.buttons.length}/{max}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/** 말풍선 아래 버튼 링크 목록 */
export function LinkRows({
  buttons,
  onEdit,
}: {
  buttons: DMButton[];
  onEdit?: (b: DMButton) => void;
}) {
  const list = buttons.filter((b) => b.title || b.url);
  if (!list.length) return null;
  return (
    <div className="link-rows">
      {list.map((b) => (
        <button
          key={b.id}
          type="button"
          className="link-row"
          onClick={() => onEdit?.(b)}
          disabled={!onEdit}
        >
          <Icon svg={<IconPaperclipLine />} />
          <b>{b.title || "버튼"}</b>
          <span
            style={{
              color: isValidUrl(b.url)
                ? undefined
                : "var(--seed-color-fg-critical)",
            }}
          >
            {isValidUrl(b.url) ? hostOf(b.url) : "링크 설정 안 됨"}
          </span>
          {onEdit && <Icon svg={<IconChevronRightLine />} />}
        </button>
      ))}
    </div>
  );
}

export function FanComment(props: {
  username?: string;
  text: string;
  post?: Post | null;
  meta?: string;
}) {
  const name = props.username ?? "fan.minji";
  return (
    <div className="fan-comment">
      <div className="fan-comment__avatar">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text as="p" textStyle="t4Regular">
          <b>{name}</b> {props.text}
        </Text>
        <Text as="p" textStyle="t2Regular" color="fg.neutralSubtle">
          {props.meta ?? "방금 · 게시물 댓글"}
        </Text>
      </div>
      {props.post !== undefined && <PostThumb post={props.post} size="xs" />}
    </div>
  );
}

export function FanBubbleRow({ children }: { children: ReactNode }) {
  return (
    <div className="msg-row msg-row--fan">
      <div className="fan-bubble">{children}</div>
    </div>
  );
}

/** 팬 입장에서 보는 대화 — 댓글 → 자동 DM */
export function Conversation(props: {
  dm: DMContent;
  tab: DMTab;
  username?: string;
  post?: Post | null;
  sampleComment?: string;
  edit?: BubbleEdit & { onEditGateButton?: () => void };
  showLinks?: boolean;
  /** 팬이 반응한 곳: 댓글 / DM 공유 / DM 코드 */
  via?: "comment" | "share" | "code";
  code?: string;
}) {
  const { dm, tab, edit } = props;
  const gate = dm.followGate.enabled;
  const gateTitle = dm.followGate.gateButtonTitle || "팔로우했어요";
  const current: DMTab = gate ? tab : "follower";
  const msg = current === "nonFollower" ? dm.followGate.nonFollower : dm.main;
  const maxButtons = current === "nonFollower" ? 2 : 3;

  return (
    <div className="convo">
      {(current === "gate" || !gate) && (
        <>
          {props.via === "share" ? (
            <FanBubbleRow>✈️ 게시물을 DM으로 공유했어요</FanBubbleRow>
          ) : props.via === "code" ? (
            <FanBubbleRow>{props.code ?? "AB7K"}</FanBubbleRow>
          ) : (
            <FanComment
              text={props.sampleComment ?? "와 너무 좋아요! 정보 궁금해요"}
              post={props.post}
            />
          )}
          <div className="divider-label">자동으로 DM을 보내요</div>
        </>
      )}
      {current === "gate" ? (
        <MessageBubble
          message={{
            format: "text",
            text: dm.followGate.gateText,
            buttons: [],
            cards: [],
          }}
          username={props.username}
          edit={edit?.onEditText ? { onEditText: edit.onEditText } : undefined}
          extraButtons={[
            {
              title: gateTitle,
              note: edit
                ? "팔로우 확인 버튼 · 이름만 바꿀 수 있어요"
                : undefined,
              onClick: edit?.onEditGateButton,
            },
          ]}
        />
      ) : (
        <>
          {gate && (
            <>
              <div className="convo__caption">
                {current === "follower"
                  ? "확인 버튼을 눌렀을 때 팔로우 중이면"
                  : "확인 버튼을 눌렀을 때 아직 팔로우 전이면"}
              </div>
              <FanBubbleRow>{gateTitle} 🙌</FanBubbleRow>
            </>
          )}
          <MessageBubble
            message={msg}
            username={props.username}
            edit={edit}
            maxButtons={maxButtons}
            extraButtons={
              current === "nonFollower"
                ? [
                    {
                      title: gateTitle,
                      note: "다시 확인 버튼 (자동으로 붙어요)",
                    },
                  ]
                : undefined
            }
          />
          {props.showLinks && msg.format === "text" && (
            <LinkRows buttons={msg.buttons} onEdit={edit?.onEditButton} />
          )}
        </>
      )}
    </div>
  );
}
