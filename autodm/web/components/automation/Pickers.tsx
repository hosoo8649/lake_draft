import {
  IconArrowClockwiseCircularLine,
  IconBookmarkLine,
  IconCheckmarkFill,
  IconDot3HorizontalChatbubbleLeftLine,
  IconDot3VerticalLine,
  IconKeyholeShieldLine,
  IconPaperplaneLine,
  IconPerson2Line,
  IconPictureLine,
  IconPlusLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, PrefixIcon, Text, VStack } from "@seed-design/react";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "seed-design/ui/menu";
import type { Post, Template } from "@shared/types";
import { MEDIA_LABEL, fmtNumber, fmtRelative } from "../../lib/format";
import { Conversation } from "../dm/Bubble";
import { EmptyState } from "../ui";

export type PostWithMeta = Post & { automationCount: number; usedKeywords: string[] };

function RadioCard(props: { icon: React.ReactNode; title: string; description?: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={props.selected} className="option-card" data-selected={props.selected} disabled={props.disabled} onClick={props.onClick}>
      <span className="option-card__icon">
        <Icon svg={props.icon} />
      </span>
      <VStack gap="x0_5" as="span" grow>
        <Text textStyle="t5Bold">{props.title}</Text>
        {props.description && (
          <Text textStyle="t3Regular" color="fg.neutralMuted">
            {props.description}
          </Text>
        )}
      </VStack>
      <span className="option-card__radio" aria-hidden />
    </button>
  );
}

export function PostGrid(props: { posts: PostWithMeta[]; postId: string | null; onSelect: (id: string) => void; showAutomationCount?: boolean }) {
  return (
    <div className="post-grid" role="listbox" aria-label="게시물">
      {props.posts.map((p) => {
        const selected = props.postId === p.id;
        return (
          <button key={p.id} type="button" role="option" aria-selected={selected} className="post-tile" data-selected={selected} onClick={() => props.onSelect(p.id)}>
            <div className="thumb">
              {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" loading="lazy" /> : <span>{p.emoji ?? "🖼️"}</span>}
              {selected && (
                <span className="thumb__check" aria-hidden>
                  <Icon svg={<IconCheckmarkFill />} />
                </span>
              )}
              <span className="thumb__badge">
                <Badge size="medium" variant="solid" tone="neutral">
                  {MEDIA_LABEL[p.mediaType]}
                </Badge>
              </span>
            </div>
            <div className="post-tile__meta">
              <Text as="p" textStyle="t3Regular" className="clamp-2">
                {p.caption || "(캡션 없음)"}
              </Text>
              <Text as="p" textStyle="t2Regular" color="fg.neutralSubtle" style={{ marginTop: 4 }}>
                {fmtRelative(p.timestamp)} · 댓글 {fmtNumber(p.commentsCount)}
              </Text>
              {(p.automationCount > 0 || p.restricted) && (
                <HStack gap="x1" pt="x1" wrap>
                  {props.showAutomationCount !== false && p.automationCount > 0 && (
                    <Badge size="medium" variant="weak" tone="brand">
                      자동화 {p.automationCount}
                    </Badge>
                  )}
                  {p.restricted && (
                    <Badge size="medium" variant="weak" tone="critical">
                      제한된 게시물
                    </Badge>
                  )}
                </HStack>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** 2-1. 게시물 선택하기 */
export function PostPicker(props: {
  posts: PostWithMeta[];
  postId: string | null;
  nextPost: boolean;
  onChange: (v: { postId: string | null; nextPost: boolean }) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** 이미 다음 게시물 자동화가 있으면 이유를 넣어 막아요 */
  nextPostDisabled?: string;
}) {
  return (
    <VStack gap="x4">
      <VStack gap="x2" role="radiogroup" aria-label="게시물 선택 방법">
        <RadioCard
          icon={<IconPictureLine />}
          title="올린 게시물에서 고르기"
          selected={!props.nextPost}
          onClick={() => props.onChange({ postId: props.postId, nextPost: false })}
        />
        <RadioCard
          icon={<IconPlusLine />}
          title="다음에 올릴 게시물에 적용"
          description={props.nextPostDisabled ?? "아직 올리지 않은 다음 게시물 1개에 미리 설정해요"}
          selected={props.nextPost}
          disabled={!!props.nextPostDisabled}
          onClick={() => props.onChange({ postId: null, nextPost: true })}
        />
      </VStack>
      {props.nextPost ? (
        <Callout
          tone="informative"
          title="다음 게시물 자동화는 이렇게 연결돼요"
          description="① 지금 자동화를 설정해요 → ② 인스타그램에 새 게시물을 올려요 → ③ 그 게시물에 첫 댓글이 달리면 자동화가 연결돼요 → ④ 조건에 따라 DM이 나가요. 게시물을 올리기만 해서는 연결되지 않고, 다음 게시물 1개에만 적용돼요."
        />
      ) : props.posts.length === 0 ? (
        <EmptyState emoji="🖼️" title="게시물이 없어요" description="인스타그램에 올린 게시물이 여기에 보여요." />
      ) : (
        <>
          <HStack justify="space-between" gap="x3">
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              캐러셀·릴스·광고 게시물도 고를 수 있어요. 공동작업 게시물은 처음 올린 계정에서만 설정할 수 있어요.
            </Text>
            {props.onRefresh && (
              <ActionButton size="xsmall" variant="ghost" loading={props.refreshing} onClick={props.onRefresh}>
                <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
                새로고침
              </ActionButton>
            )}
          </HStack>
          <PostGrid posts={props.posts} postId={props.postId} onSelect={(id) => props.onChange({ postId: id, nextPost: false })} />
        </>
      )}
    </VStack>
  );
}

/** 템플릿에 담긴 추가 기능 목록 */
export function featureRows(t: Pick<Template, "dm" | "extras">) {
  return [
    t.dm.followGate.enabled && { icon: <IconPerson2Line />, text: "팔로워에게만 본 DM을 보내요" },
    t.extras.commentReply.enabled && { icon: <IconDot3HorizontalChatbubbleLeftLine />, text: "댓글에 답글도 남겨요" },
    t.extras.shareReply && { icon: <IconPaperplaneLine />, text: "게시물을 DM으로 공유해도 보내요" },
    t.extras.codeReply && { icon: <IconKeyholeShieldLine />, text: "DM으로 코드를 보내도 보내요" },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
}

/** 2-2. 템플릿 미리보기 */
export function TemplatePreviewCard(props: { template: Pick<Template, "dm" | "extras"> | null; username?: string; post?: Post | null }) {
  if (!props.template)
    return (
      <div className="stage">
        <div className="convo">
          <Text color="fg.neutralSubtle">템플릿을 고르면 팬이 받을 DM을 미리 볼 수 있어요</Text>
        </div>
      </div>
    );
  const rows = featureRows(props.template);
  return (
    <div className="stage">
      <Text textStyle="t3Medium" color="fg.neutralMuted" style={{ padding: "4px 4px 0" }}>
        {props.template.dm.followGate.enabled ? "팔로우를 확인한 뒤 이렇게 보내요" : "댓글에 이렇게 보내요"}
      </Text>
      <Conversation dm={props.template.dm} tab={props.template.dm.followGate.enabled ? "follower" : "follower"} username={props.username} post={props.post} />
      <div className="feature-list" style={{ padding: "12px 4px 4px" }}>
        {rows.length === 0 ? (
          <div>추가 기능 없이 DM만 보내요</div>
        ) : (
          rows.map((r) => (
            <div key={r.text}>
              <Icon svg={r.icon} />
              {r.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 2-2. 템플릿 목록 — 내 템플릿 먼저, ⋯에서 수정·삭제 */
export function TemplateList(props: {
  mine: Template[];
  builtin: Template[];
  selectedId: string | null;
  onSelect: (t: Template) => void;
  onAdd?: () => void;
  onEdit?: (t: Template) => void;
  onDelete?: (t: Template) => void;
}) {
  const Row = ({ t }: { t: Template }) => {
    const selected = props.selectedId === t.id;
    return (
      <div className="option-card" data-selected={selected} style={{ alignItems: "center", padding: "12px 14px", cursor: "pointer" }} onClick={() => props.onSelect(t)}>
        <span className="option-card__icon">{t.builtin ? <span style={{ fontSize: 20 }}>{t.emoji}</span> : <Icon svg={<IconBookmarkLine />} />}</span>
        <button type="button" aria-pressed={selected} style={{ all: "unset", flex: 1, minWidth: 0, cursor: "pointer" }} onClick={(e) => (e.stopPropagation(), props.onSelect(t))}>
          <HStack gap="x1_5" as="span" wrap>
            <Text textStyle="t5Bold">{t.name}</Text>
            {t.recommended && (
              <Badge size="medium" variant="solid" tone="brand">
                추천
              </Badge>
            )}
          </HStack>
          <Text as="p" textStyle="t3Regular" color="fg.neutralMuted" maxLines={1}>
            {t.builtin ? t.description : `버튼 ${t.dm.main.format === "carousel" ? `${t.dm.main.cards.length}장 카드` : `${t.dm.main.buttons.length}개`} · 자동화 ${t.usedCount}개`}
          </Text>
        </button>
        {!t.builtin && (props.onEdit || props.onDelete) && (
          <span onClick={(e) => e.stopPropagation()}>
            <MenuRoot>
              <MenuTrigger asChild>
                <button type="button" className="icon-btn" aria-label={`${t.name} 더 보기`}>
                  <Icon svg={<IconDot3VerticalLine />} />
                </button>
              </MenuTrigger>
              <MenuContent>
                {props.onEdit && <MenuItem label="수정" onClick={() => props.onEdit!(t)} />}
                {props.onDelete && <MenuItem label="삭제" onClick={() => props.onDelete!(t)} />}
              </MenuContent>
            </MenuRoot>
          </span>
        )}
      </div>
    );
  };

  return (
    <VStack gap="x5">
      <VStack gap="x2">
        <Text textStyle="t4Bold" color="fg.neutralMuted">
          내 템플릿
        </Text>
        {props.mine.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        {props.onAdd && (
          <button type="button" className="dashed-btn" onClick={props.onAdd}>
            + 템플릿 추가
          </button>
        )}
      </VStack>
      <VStack gap="x2">
        <Text textStyle="t4Bold" color="fg.neutralMuted">
          기본 템플릿
        </Text>
        {props.builtin.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </VStack>
    </VStack>
  );
}
