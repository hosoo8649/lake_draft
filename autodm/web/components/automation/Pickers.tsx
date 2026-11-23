import { IconArrowClockwiseCircularLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, PrefixIcon, Text, VStack } from "@seed-design/react";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import type { Post, Template } from "@shared/types";
import { fmtNumber, fmtRelative } from "../../lib/format";
import { EmptyState, PostThumb } from "../ui";

export type PostWithMeta = Post & { automationCount: number; usedKeywords: string[] };

export function PostPicker(props: {
  posts: PostWithMeta[];
  postId: string | null;
  nextPost: boolean;
  onChange: (v: { postId: string | null; nextPost: boolean }) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  allowNextPost?: boolean;
}) {
  const mode = props.nextPost ? "next" : "existing";
  return (
    <VStack gap="x4">
      {props.allowNextPost !== false && (
        <SegmentedControl
          aria-label="게시물 선택 방법"
          value={mode}
          onValueChange={(v) => props.onChange({ postId: v === "next" ? null : props.postId, nextPost: v === "next" })}
        >
          <SegmentedControlItem value="existing">올린 게시물에서 고르기</SegmentedControlItem>
          <SegmentedControlItem value="next">다음에 올릴 게시물에 적용</SegmentedControlItem>
        </SegmentedControl>
      )}
      {mode === "next" ? (
        <VStack gap="x3">
          <Callout
            tone="informative"
            title="다음 게시물 자동화는 이렇게 연결돼요"
            description="① 지금 자동화를 설정해요 → ② 인스타그램에 새 게시물을 올려요 → ③ 그 게시물에 첫 댓글이 달리면 자동화가 연결돼요 → ④ 설정한 조건에 따라 DM이 나가요"
          />
          <Callout
            tone="warning"
            description="게시물을 올리기만 해서는 연결되지 않아요(첫 댓글이 달려야 해요). 다음 게시물 1개에만 적용되고, 새 게시물이 여러 개면 가장 먼저 댓글이 달린 게시물에 연결돼요."
          />
        </VStack>
      ) : props.posts.length === 0 ? (
        <EmptyState emoji="🖼️" title="게시물이 없어요" description="인스타그램에 올린 게시물이 여기에 보여요." />
      ) : (
        <>
          <HStack justify="space-between">
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              공동작업 게시물은 처음 올린 계정에서만 설정할 수 있어요. 연령·국가 제한 게시물은 자동화가 동작하지 않아요.
            </Text>
            {props.onRefresh && (
              <ActionButton size="xsmall" variant="ghost" loading={props.refreshing} onClick={props.onRefresh}>
                <PrefixIcon svg={<IconArrowClockwiseCircularLine />} />
                새로고침
              </ActionButton>
            )}
          </HStack>
          <div className="post-grid" role="listbox" aria-label="게시물">
            {props.posts.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={props.postId === p.id}
                className="post-tile"
                data-selected={props.postId === p.id}
                onClick={() => props.onChange({ postId: p.id, nextPost: false })}
              >
                <PostThumb post={p} />
                <div className="post-tile__meta">
                  <Text as="p" textStyle="t3Regular" className="clamp-2">
                    {p.caption || "(캡션 없음)"}
                  </Text>
                  <HStack gap="x1" pt="x1_5" wrap>
                    <Text textStyle="t2Regular" color="fg.neutralSubtle">
                      {fmtRelative(p.timestamp)} · 댓글 {fmtNumber(p.commentsCount)}
                    </Text>
                  </HStack>
                  <HStack gap="x1" pt="x1" wrap>
                    {p.automationCount > 0 && (
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
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </VStack>
  );
}

export function TemplateList(props: {
  mine: Template[];
  builtin: Template[];
  selectedId: string | null;
  onSelect: (t: Template) => void;
  onAdd?: () => void;
  onEdit?: (t: Template) => void;
}) {
  const Item = ({ t }: { t: Template }) => (
    <button
      type="button"
      className="option-card"
      data-selected={props.selectedId === t.id}
      aria-pressed={props.selectedId === t.id}
      onClick={() => props.onSelect(t)}
    >
      <span className="option-card__icon">{t.emoji ?? "💬"}</span>
      <VStack gap="x0_5" grow as="span">
        <HStack gap="x1_5" as="span">
          <Text textStyle="t5Bold">{t.name}</Text>
          {t.recommended && (
            <Badge size="medium" variant="solid" tone="brand">
              추천
            </Badge>
          )}
          {t.dm.followGate.enabled && (
            <Badge size="medium" variant="weak" tone="informative">
              팔로우 확인
            </Badge>
          )}
        </HStack>
        <Text textStyle="t3Regular" color="fg.neutralMuted">
          {t.description ?? `버튼 ${t.dm.main.buttons.length}개 · 이 템플릿으로 만든 자동화 ${t.usedCount}개`}
        </Text>
      </VStack>
      {props.onEdit && !t.builtin && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            props.onEdit!(t);
          }}
          style={{ fontSize: 13, color: "var(--seed-color-fg-neutral-muted)", padding: "4px 6px" }}
        >
          수정
        </span>
      )}
    </button>
  );

  return (
    <VStack gap="x5">
      <VStack gap="x2">
        <Text textStyle="t4Bold" color="fg.neutralMuted">
          내 템플릿
        </Text>
        {props.mine.map((t) => (
          <Item key={t.id} t={t} />
        ))}
        {props.onAdd && (
          <ActionButton variant="neutralOutline" onClick={props.onAdd}>
            + 템플릿 추가
          </ActionButton>
        )}
      </VStack>
      <VStack gap="x2">
        <Text textStyle="t4Bold" color="fg.neutralMuted">
          기본 템플릿
        </Text>
        {props.builtin.map((t) => (
          <Item key={t.id} t={t} />
        ))}
      </VStack>
    </VStack>
  );
}
