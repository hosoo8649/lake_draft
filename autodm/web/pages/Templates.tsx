import { IconBookmarkLine, IconChevronRightLine, IconPlusLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, PrefixIcon, Text, VStack } from "@seed-design/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { LIMITS } from "@shared/limits";
import type { Template } from "@shared/types";
import { featureRows } from "../components/automation/Pickers";
import { DMPreview } from "../components/dm/DMEditor";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { Modal } from "../components/Modal";
import { Loading, PageHeader, Section } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { josa } from "../lib/format";

function buttonCount(t: Template): string {
  return t.dm.main.format === "carousel" ? `카드 ${t.dm.main.cards.length}장` : `버튼 ${t.dm.main.buttons.length}개`;
}

export function TemplatesPage() {
  const nav = useNavigate();
  const { state } = useAppState();
  const { data, reload } = useApi<{ mine: Template[]; builtin: Template[] }>("/templates");
  const suggestion = useApi<{ sent: number } | null>("/templates/suggestion");
  const [sort, setSort] = useState<"used" | "recent">("used");
  const [preview, setPreview] = useState<Template | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const onError = useErrorToast();

  const mine = useMemo(() => {
    const list = [...(data?.mine ?? [])];
    return sort === "used"
      ? list.sort((a, b) => b.usedCount - a.usedCount || b.updatedAt - a.updatedAt)
      : list.sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt));
  }, [data, sort]);

  if (!data || !state) return <Loading />;
  const totalUsed = data.mine.reduce((s, t) => s + t.usedCount, 0);
  const full = data.mine.length >= LIMITS.templates;

  const remove = async (t: Template) => {
    setPreview(null);
    await new Promise((r) => setTimeout(r, 200));
    const ok = await confirm({
      title: `‘${t.name}’${josa(t.name, "을/를")} 삭제할까요?`,
      description: "템플릿을 지워도 그 템플릿으로 만든 자동화는 그대로 남아요.",
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/templates/${t.id}`, { method: "DELETE" });
      toast("템플릿을 삭제했어요");
      void reload();
    } catch (e) {
      onError(e);
    }
  };

  const Row = ({ t }: { t: Template }) => (
    <button type="button" className="option-card" style={{ alignItems: "center" }} onClick={() => setPreview(t)}>
      <span className="option-card__icon">{t.builtin ? <span style={{ fontSize: 20 }}>{t.emoji}</span> : <Icon svg={<IconBookmarkLine />} />}</span>
      <VStack gap="x0_5" grow as="span" style={{ minWidth: 0 }}>
        <HStack gap="x1_5" as="span" wrap>
          <Text textStyle="t5Bold">{t.name}</Text>
          {t.recommended && (
            <Badge size="medium" variant="solid" tone="brand">
              추천
            </Badge>
          )}
        </HStack>
        <Text textStyle="t3Regular" color="fg.neutralMuted" maxLines={1}>
          {t.builtin ? t.description : `${buttonCount(t)} · 이 템플릿으로 만든 자동화 ${t.usedCount}개`}
        </Text>
      </VStack>
      <Icon svg={<IconChevronRightLine />} color="fg.neutralSubtle" />
    </button>
  );

  return (
    <div className="page page--narrow">
      <PageHeader title="내 템플릿" />
      <VStack gap="x5">
        <div className="stage" style={{ padding: 24 }}>
          <Text textStyle="t3Medium" color="fg.neutralMuted">
            템플릿 {data.mine.length}개 · 최대 {LIMITS.templates}개
          </Text>
          <Text as="h2" textStyle="t8Bold">
            저장한 템플릿으로
            <br />
            자동화를 간편하게 만들어요
          </Text>
          <Text textStyle="t3Regular" color="fg.neutralMuted">
            DM 문구·버튼·팔로우 확인·댓글 답글·DM 공유/코드 설정을 한 묶음으로 저장해요. 게시물·키워드·발송 시점은 자동화를 만들 때마다 정해요.
          </Text>
          <HStack pt="x1">
            <ActionButton variant="brandSolid" disabled={full} onClick={() => nav("/templates/new")}>
              <PrefixIcon svg={<IconPlusLine />} />새 템플릿 만들기
            </ActionButton>
          </HStack>
          {full && (
            <Text textStyle="t2Regular" color="fg.critical">
              템플릿은 {LIMITS.templates}개까지 저장할 수 있어요. 안 쓰는 템플릿을 지워 주세요.
            </Text>
          )}
        </div>

        <Section
          title={
            <HStack gap="x1_5" as="span">
              내 템플릿
              <Badge size="medium" variant="weak" tone="neutral">
                {data.mine.length}
              </Badge>
            </HStack>
          }
          description={data.mine.length ? `이 템플릿들로 만든 자동화 ${totalUsed}개` : undefined}
          actions={
            data.mine.length > 1 ? (
              <SegmentedControl aria-label="정렬" value={sort} onValueChange={(v) => setSort(v as "used" | "recent")}>
                <SegmentedControlItem value="used">자주 쓴 순</SegmentedControlItem>
                <SegmentedControlItem value="recent">최근 순</SegmentedControlItem>
              </SegmentedControl>
            ) : undefined
          }
        >
          {data.mine.length === 0 ? (
            <VStack gap="x3">
              <Text color="fg.neutralMuted">아직 저장한 템플릿이 없어요. 자주 보내는 DM을 템플릿으로 저장해 두면 다음부터 고르기만 하면 돼요.</Text>
              {suggestion.data && suggestion.data.sent > 0 && (
                <Callout
                  tone="informative"
                  title="자주 쓰던 DM으로 첫 템플릿 만들기"
                  description={`지금까지 가장 많이 보낸 DM(${suggestion.data.sent}건)으로 채워 드려요.`}
                  linkProps={{ children: "만들기", onClick: () => nav("/templates/new?fromSuggestion=1") }}
                />
              )}
            </VStack>
          ) : (
            <VStack gap="x2">
              {mine.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </VStack>
          )}
        </Section>

        <Section title="기본 템플릿" description="자주 쓰는 상황별로 준비된 템플릿이에요">
          <VStack gap="x2">
            {data.builtin.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </VStack>
        </Section>
      </VStack>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name ?? ""}
        description={preview?.builtin ? preview.description : preview ? `${buttonCount(preview)} · 이 템플릿으로 만든 자동화 ${preview.usedCount}개` : undefined}
        footer={
          preview && (
            <HStack gap="x2" width="full" wrap>
              {!preview.builtin ? (
                <>
                  <ActionButton variant="neutralWeak" onClick={() => remove(preview)}>
                    삭제
                  </ActionButton>
                  <ActionButton variant="neutralWeak" onClick={() => nav(`/templates/${preview.id}/edit`)}>
                    수정
                  </ActionButton>
                </>
              ) : (
                <ActionButton variant="neutralWeak" disabled={full} onClick={() => nav(`/templates/new?fromBuiltin=${preview.id}`)}>
                  내 템플릿으로 복사
                </ActionButton>
              )}
              <ActionButton variant="brandSolid" flexGrow onClick={() => nav(`/automations/new?template=${preview.id}`)}>
                이 템플릿으로 자동화 만들기
              </ActionButton>
            </HStack>
          )
        }
      >
        {preview && (
          <VStack gap="x3">
            <DMPreview dm={preview.dm} username={state.account.username} />
            <div className="feature-list">
              {featureRows(preview).length === 0 ? (
                <div>추가 기능 없이 DM만 보내요</div>
              ) : (
                featureRows(preview).map((r) => (
                  <div key={r.text}>
                    <Icon svg={r.icon} />
                    {r.text}
                  </div>
                ))
              )}
            </div>
          </VStack>
        )}
      </Modal>
    </div>
  );
}
