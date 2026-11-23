import { Text } from "@seed-design/react";
import type { ReactNode } from "react";
import type { CarouselCard, DMButton, DMMessage } from "@shared/types";
import { isValidUrl } from "@shared/validation";

export function Phone(props: { username?: string; children: ReactNode; caption?: ReactNode }) {
  const name = props.username ?? "my_account";
  return (
    <div className="phone" aria-label="팬이 받을 DM 미리보기">
      <div className="phone__head">
        <div className="phone__avatar">{name.slice(0, 1).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <Text textStyle="t4Bold">{name}</Text>
          <Text as="p" textStyle="t2Regular" color="fg.neutralSubtle">
            Instagram 메시지
          </Text>
        </div>
      </div>
      <div className="phone__body">
        {props.caption && <div className="dm-system">{props.caption}</div>}
        {props.children}
      </div>
    </div>
  );
}

export function Avatar({ name }: { name?: string }) {
  return <div className="phone__avatar">{(name ?? "M").slice(0, 1).toUpperCase()}</div>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export interface BubbleEditHandlers {
  onEditText?: () => void;
  onEditButton?: (b: DMButton) => void;
  onAddButton?: () => void;
  onEditCard?: (index: number) => void;
}

/** 버튼 템플릿 형태의 말풍선 (문구 + 버튼) */
export function TextBubble(props: {
  text: string;
  buttons: DMButton[];
  extraButtons?: { title: string; note?: string; onClick?: () => void }[];
  maxButtons?: number;
  username?: string;
  edit?: BubbleEditHandlers;
}) {
  const { edit } = props;
  const canAdd = edit?.onAddButton && props.buttons.length < (props.maxButtons ?? 3);
  return (
    <div className="dm-row">
      <Avatar name={props.username} />
      <div className="dm-msg">
        <div
          className={edit?.onEditText ? "dm-text editable" : "dm-text"}
          role={edit?.onEditText ? "button" : undefined}
          tabIndex={edit?.onEditText ? 0 : undefined}
          onClick={edit?.onEditText}
          onKeyDown={(e) => e.key === "Enter" && edit?.onEditText?.()}
          title={edit?.onEditText ? "눌러서 문구 수정" : undefined}
        >
          {props.text || <span style={{ color: "var(--seed-color-fg-placeholder)" }}>DM 문구를 넣어 주세요</span>}
        </div>
        {props.buttons.map((b) => {
          const missing = !isValidUrl(b.url);
          return (
            <button
              type="button"
              key={b.id}
              className={edit?.onEditButton ? "dm-btn editable" : "dm-btn"}
              data-missing={edit ? missing : undefined}
              onClick={() => edit?.onEditButton?.(b)}
            >
              {b.title || "버튼 이름"}
              {edit && <small>{missing ? "링크 설정 안 됨" : hostOf(b.url)}</small>}
            </button>
          );
        })}
        {props.extraButtons?.map((b) => (
          <button type="button" key={b.title} className={b.onClick ? "dm-btn editable" : "dm-btn"} onClick={b.onClick}>
            {b.title}
            {b.note && <small>{b.note}</small>}
          </button>
        ))}
        {canAdd && (
          <button type="button" className="dm-btn dm-btn--add" onClick={edit?.onAddButton}>
            + 버튼 추가
          </button>
        )}
      </div>
    </div>
  );
}

export function CarouselBubble(props: { cards: CarouselCard[]; username?: string; edit?: BubbleEditHandlers }) {
  return (
    <div className="dm-row" style={{ alignItems: "flex-start" }}>
      <Avatar name={props.username} />
      <div className="dm-carousel">
        {props.cards.length === 0 && <div className="dm-system">카드를 추가해 주세요</div>}
        {props.cards.map((c, i) => (
          <div
            key={c.id}
            className={props.edit?.onEditCard ? "dm-card editable" : "dm-card"}
            onClick={() => props.edit?.onEditCard?.(i)}
            role={props.edit?.onEditCard ? "button" : undefined}
          >
            <div className="dm-card__img" style={c.imageUrl ? { backgroundImage: `url("${c.imageUrl}")` } : undefined}>
              {!c.imageUrl && "이미지 없음"}
            </div>
            <div className="dm-card__body">
              <div className="dm-card__title">{c.title || "카드 제목"}</div>
              {c.subtitle && <div className="dm-card__sub">{c.subtitle}</div>}
            </div>
            {c.buttons.map((b) => (
              <div key={b.id} className="dm-btn" data-missing={props.edit ? !isValidUrl(b.url) : undefined}>
                {b.title || "버튼"}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MessageView(props: {
  message: DMMessage;
  username?: string;
  edit?: BubbleEditHandlers;
  maxButtons?: number;
  extraButtons?: { title: string; note?: string; onClick?: () => void }[];
}) {
  if (props.message.format === "carousel")
    return <CarouselBubble cards={props.message.cards} username={props.username} edit={props.edit} />;
  return (
    <TextBubble
      text={props.message.text}
      buttons={props.message.buttons}
      username={props.username}
      edit={props.edit}
      maxButtons={props.maxButtons}
      extraButtons={props.extraButtons}
    />
  );
}

export function FanBubble({ children }: { children: ReactNode }) {
  return (
    <div className="dm-row dm-row--me">
      <div className="dm-me">{children}</div>
    </div>
  );
}
