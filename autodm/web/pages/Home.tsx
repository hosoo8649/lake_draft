import {
  IconBookmarkLine,
  IconChevronRightLine,
  IconDot3VerticalLine,
  IconMegaphoneLine,
  IconPlusLine,
  IconQuestionmarkCircleLine,
  IconTrophyLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, PrefixIcon, Text, VStack } from "@seed-design/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { List, ListButtonItem, ListDivider } from "seed-design/ui/list";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "seed-design/ui/menu";
import { PageBanner, PageBannerButton } from "seed-design/ui/page-banner";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { Switch } from "seed-design/ui/switch";
import type { AutomationView, HomeSummary } from "@shared/types";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { RiskBanner } from "../components/RiskNotice";
import { TOUR_KEY, Tour } from "../components/Tour";
import { TrendChart } from "../components/TrendChart";
import { EmptyState, Loading, PageHeader, PostThumb, Section, StatTile, StatusBadge } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { SEND_MODE_LABEL, fmtDateTime, fmtNumber, fmtRelative, postTitle, triggerSummary } from "../lib/format";

interface HomeData {
  summary: HomeSummary;
  automations: AutomationView[];
  templateCount: number;
}

export function useAutomationActions() {
  const nav = useNavigate();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  return {
    toggle: async (a: AutomationView, enabled: boolean) => {
      try {
        await api(`/automations/${a.id}`, { method: "PATCH", body: { enabled } });
        toast(enabled ? "자동화를 켰어요. 이제 댓글이 달리면 DM을 보내요" : "자동화를 껐어요. 다시 켜기 전까지 DM을 보내지 않아요", enabled ? "positive" : "default");
      } catch (e) {
        onError(e);
      }
    },
    duplicate: (a: AutomationView) => {
      if (a.origin === "scheduled" || a.sendMode === "scheduled") {
        toast("예약 발송은 복제할 수 없어요", "critical");
        return;
      }
      nav(`/automations/new?duplicate=${a.id}`);
    },
    remove: async (a: AutomationView, after?: () => void) => {
      const ok = await confirm({
        title: "자동화를 삭제할까요?",
        description: "삭제는 되돌릴 수 없지만, 이미 보낸 DM 기록은 남아요.",
        confirmLabel: "자동화 삭제",
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/automations/${a.id}`, { method: "DELETE" });
        toast("자동화를 삭제했어요");
        after?.();
      } catch (e) {
        onError(e);
      }
    },
    saveAsTemplate: (a: AutomationView) => nav(`/templates/new?fromAutomation=${a.id}`),
  };
}

function AutomationRow({ a }: { a: AutomationView }) {
  const nav = useNavigate();
  const act = useAutomationActions();
  const { state } = useAppState();
  const canToggle = a.sendMode === "immediate" && a.status !== "waiting";
  return (
    <HStack gap="x3" py="x3" align="center" className="auto-row">
      {/* 목록 한 줄 전체가 상세로 가는 버튼 — 키보드로도 열 수 있어요 */}
      <button type="button" className="row-main" onClick={() => nav(`/automations/${a.id}`)}>
        <HStack gap="x1_5" wrap as="span">
          <Text textStyle="t4Bold">{a.title || triggerSummary(a.trigger)}</Text>
          <StatusBadge status={a.status} />
          {/* 배지는 한 줄에 2개까지 (SEED badge 가이드) — 가장 중요한 것 하나만 더 보여요 */}
          {a.health.state !== "ok" ? (
            <Badge size="medium" variant="weak" tone="critical">
              확인 필요
            </Badge>
          ) : a.stats.queued > 0 ? (
            <Badge size="medium" variant="weak" tone="warning">
              순차 발송중 {a.stats.queued}
            </Badge>
          ) : null}
        </HStack>
        <Text as="span" textStyle="t3Regular" color="fg.neutralMuted" maxLines={2}>
          {a.sendMode === "immediate" && a.origin === "batch" ? "일괄 → 즉시 발송" : SEND_MODE_LABEL[a.sendMode]}
          {a.dm.followGate.enabled ? " · 팔로우 확인" : ""}
          {a.title ? ` · ${triggerSummary(a.trigger)}` : ""}
          {a.sendMode === "scheduled" && a.schedule && !a.schedule.firedAt ? ` · ${fmtDateTime(a.schedule.at)} 발송` : ""}
          {` · 전송 ${fmtNumber(a.stats.sent)} · 읽음 ${fmtNumber(a.stats.read)} · 클릭 ${fmtNumber(a.stats.clicks)}`}
        </Text>
      </button>
      {canToggle ? (
        <Switch
          checked={a.enabled}
          disabled={state?.settings.dmPaused}
          onCheckedChange={(v) => act.toggle(a, v)}
          aria-label="자동화 켜고 끄기"
        />
      ) : null}
      <MenuRoot>
        <MenuTrigger asChild>
          <ActionButton layout="iconOnly" variant="ghost" size="small" aria-label={`${a.title || triggerSummary(a.trigger)} 더 보기`}>
            <Icon svg={<IconDot3VerticalLine />} />
          </ActionButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem label="상세 보기" onClick={() => nav(`/automations/${a.id}`)} />
          <MenuItem label="수정" onClick={() => nav(`/automations/${a.id}/edit`)} />
          <MenuItem label="복제" onClick={() => act.duplicate(a)} />
          <MenuItem label="템플릿으로 저장" onClick={() => act.saveAsTemplate(a)} />
          <MenuItem label="삭제" tone="critical" onClick={() => act.remove(a)} />
        </MenuContent>
      </MenuRoot>
    </HStack>
  );
}

export function HomePage() {
  const nav = useNavigate();
  const { state, reload } = useAppState();
  const { data } = useApi<HomeData>("/home");
  const [sort, setSort] = useState<"post" | "recent">("post");
  const onError = useErrorToast();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    // 처음 들어오면 둘러보기를 열고, 설정 › 도움말에서 다시 열 수 있어요
    if (params.get("tour") === "1" || !localStorage.getItem(TOUR_KEY)) setTourOpen(true);
    if (params.get("tour")) {
      params.delete("tour");
      setParams(params, { replace: true });
    }
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, AutomationView[]>();
    for (const a of data.automations) {
      const k = a.postId ?? "__next";
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    const arr = [...m.entries()].map(([k, list]) => ({
      key: k,
      post: list[0].post,
      list: [...list].sort((x, y) => y.createdAt - x.createdAt),
      latest: Math.max(...list.map((x) => x.createdAt)),
    }));
    return arr.sort((a, b) =>
      sort === "recent" ? b.latest - a.latest : (b.post?.timestamp ?? Infinity) - (a.post?.timestamp ?? Infinity),
    );
  }, [data, sort]);

  if (!data || !state) return <Loading />;
  const s = data.summary;
  const acc = state.account;

  const resumeAll = async () => {
    try {
      await api("/settings", { method: "PATCH", body: { dmPaused: false, replyPaused: false } });
      await reload();
      toast("DM 발송과 댓글 답글을 다시 켰어요", "positive");
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="홈"
        description={`@${acc.username}의 자동 DM 성과와 게시물별 자동화를 한눈에 봐요`}
        actions={
          data.automations.length > 0 ? (
            <ActionButton variant="brandSolid" onClick={() => nav("/automations/new")}>
              <PrefixIcon svg={<IconPlusLine />} />
              자동화 추가
            </ActionButton>
          ) : undefined
        }
      />

      <VStack gap="x5">
        {acc.needsReauth && (
          <PageBanner
            tone="critical"
            variant="solid"
            title="인스타그램 연결이 끊겼어요"
            description="다시 연동해도 자동화와 데이터는 그대로예요."
            suffix={<PageBannerButton onClick={() => nav("/connect")}>다시 연동</PageBannerButton>}
          />
        )}
        {/* 페이지 배너는 한 화면에 하나만 — 연결 끊김 > 일시 중지 > 데모 안내 순서 */}
        {/* 제한 신호로 답글만 자동으로 멈춘 경우는 아래 안전 장치 알림으로 알려요 */}
        {!acc.needsReauth && (state.settings.dmPaused || (state.settings.replyPaused && !state.settings.risk.autoPausedReplies)) ? (
          <PageBanner
            tone="warning"
            title="일시 중지 중"
            description={state.settings.dmPaused ? "댓글이 달려도 DM을 보내지 않아요 (이미 시작한 일괄 발송은 끝까지 보내요)" : "댓글 자동 답글만 멈춰 있어요"}
            suffix={<PageBannerButton onClick={resumeAll}>모두 다시 켜기</PageBannerButton>}
          />
        ) : null}
        {acc.mode === "demo" && !acc.needsReauth && !state.settings.dmPaused && !state.settings.replyPaused && (
          <PageBanner
            tone="informative"
            description="데모 모드예요. 시뮬레이터에서 팬처럼 댓글을 달고 받은 DM을 확인해 보세요."
            suffix={<PageBannerButton onClick={() => nav("/simulator")}>시뮬레이터 열기</PageBannerButton>}
          />
        )}

        <RiskBanner />

        <div className="grid-4">
          <StatTile label="전송" value={fmtNumber(s.totals.sent)} hint={s.queued ? `순차 발송 대기 ${s.queued}건` : "보낸 DM 수 · 팔로우 확인 DM 포함"} />
          <StatTile label="읽음" value={fmtNumber(s.totals.read)} hint="DM을 연 사람 수" />
          <StatTile label="클릭" value={fmtNumber(s.totals.clicks)} hint="버튼·링크 클릭 수" />
          <StatTile label="클릭률" value={`${s.totals.ctr}%`} hint="전송한 DM 대비 클릭 수" />
        </div>

        {/* 바로 가기 — SEED List (줄 전체가 누르는 영역) */}
        <section className="card card--list">
          <List>
            {[
              { icon: <IconBookmarkLine />, title: "내 템플릿", desc: data.templateCount ? `${data.templateCount}개 저장됨` : "자주 쓰는 DM 저장하기", to: "/templates" },
              { icon: <IconMegaphoneLine />, title: "단체 DM", desc: "24시간 안에 반응한 팬에게 한 번에 보내기", to: "/broadcasts" },
              { icon: <IconTrophyLine />, title: "댓글 추첨", desc: "이벤트 댓글에서 당첨자 뽑기", to: "/draws" },
              { icon: <IconQuestionmarkCircleLine />, title: "DM이 안 가요?", desc: "원인과 해결 방법", to: "/help" },
            ].map((c, i) => (
              <Fragment key={c.to}>
                {i > 0 && <ListDivider />}
                <ListButtonItem
                  prefix={
                    <span className="list-icon">
                      <Icon svg={c.icon} />
                    </span>
                  }
                  title={c.title}
                  detail={c.desc}
                  suffix={<Icon svg={<IconChevronRightLine />} color="fg.neutralSubtle" />}
                  onClick={() => nav(c.to)}
                />
              </Fragment>
            ))}
          </List>
        </section>

        <Section title="최근 7일 추이">
          <TrendChart data={s.last7} />
        </Section>

        <Section
          title="게시물별 자동화"
          description={`총 ${data.automations.length}개`}
          actions={
            <SegmentedControl aria-label="정렬" value={sort} onValueChange={(v) => setSort(v as "post" | "recent")}>
              <SegmentedControlItem value="post">게시물 순</SegmentedControlItem>
              <SegmentedControlItem value="recent">최신 순</SegmentedControlItem>
            </SegmentedControl>
          }
        >
          {groups.length === 0 ? (
            <EmptyState
              emoji="💬"
              title="아직 자동화가 없어요"
              description="게시물과 템플릿만 고르면 세 단계 만에 자동 DM을 만들 수 있어요."
              action={{ label: "첫 자동화 만들기", onClick: () => nav("/automations/new"), variant: "brandSolid" }}
            />
          ) : (
            <VStack gap="x4">
              {groups.map((g) => (
                <div key={g.key} className="card auto-group">
                  <HStack gap="x3" pb="x3" align="center">
                    <PostThumb post={g.post} size="sm" />
                    <VStack gap="x0_5" grow style={{ minWidth: 0 }}>
                      <Text textStyle="t5Bold" maxLines={1}>
                        {g.post ? postTitle(g.post) : "다음에 올릴 게시물"}
                      </Text>
                      <Text textStyle="t3Regular" color="fg.neutralMuted">
                        {g.post
                          ? `${fmtRelative(g.post.timestamp)} 게시 · 댓글 ${fmtNumber(g.post.commentsCount)} · 자동화 ${g.list.length}개`
                          : "새 게시물에 첫 댓글이 달리면 연결돼요"}
                      </Text>
                    </VStack>
                    {g.post && (
                      <ActionButton size="small" variant="neutralWeak" onClick={() => nav(`/automations/new?postId=${g.post!.id}`)}>
                        <PrefixIcon svg={<IconPlusLine />} />
                        추가
                      </ActionButton>
                    )}
                  </HStack>
                  {g.list.map((a) => (
                    <AutomationRow key={a.id} a={a} />
                  ))}
                </div>
              ))}
            </VStack>
          )}
        </Section>
      </VStack>
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
