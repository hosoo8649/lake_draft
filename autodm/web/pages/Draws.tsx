import { HStack, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { PostPicker, type PostWithMeta } from "../components/automation/Pickers";
import { KeywordInput } from "../components/automation/KeywordInput";
import { Avatar } from "../components/dm/Phone";
import { useConfirm, useErrorToast, useToast } from "../components/feedback";
import { EmptyState, Loading, PageHeader, PostThumb, Progress, Section } from "../components/ui";
import { api, useApi } from "../lib/api";
import type { Draw, Trigger } from "@shared/types";
import { copyText, fmtDateTime, postTitle, triggerSummary } from "../lib/format";

type Mode = { kind: "list" } | { kind: "new"; step: 1 | 2 } | { kind: "result"; id: string };

function announcement(d: Draw, postCaption: string): string {
  const names = d.winners.map((w) => `@${w.username}`).join("\n");
  return `🎉 당첨자 발표 🎉\n\n‘${postCaption}’ 이벤트에 참여해 주신 모든 분들 감사합니다!\n참여자 ${d.candidateCount}명 중 ${d.winners.length}명을 무작위로 뽑았어요.\n\n${names}\n\n당첨되신 분들께는 DM으로 연락드릴게요 💌`;
}

export function DrawsPage() {
  const posts = useApi<PostWithMeta[]>("/posts");
  const draws = useApi<Draw[]>("/draws");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [postId, setPostId] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<Trigger>({ type: "all", keywords: [] });
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();

  if (!posts.data || !draws.data) return <Loading />;
  const postOf = (id: string) => posts.data!.find((p) => p.id === id);
  const selected = postId ? postOf(postId) : undefined;

  const run = async () => {
    if (!postId) return;
    setBusy(true);
    try {
      const d = await api<Draw>("/draws", { body: { postId, trigger, winnerCount: count } });
      await draws.reload();
      setMode({ kind: "result", id: d.id });
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const redraw = async (d: Draw) => {
    const ok = await confirm({ title: "다시 뽑을까요?", description: "지금 결과를 덮어써요. 이전 당첨자는 남지 않아요.", confirmLabel: "다시 뽑기", danger: true });
    if (!ok) return;
    try {
      await api(`/draws/${d.id}/redraw`, { body: {} });
      await draws.reload();
      toast("다시 뽑았어요", "positive");
    } catch (e) {
      onError(e);
    }
  };

  if (mode.kind === "result") {
    const d = draws.data.find((x) => x.id === mode.id);
    if (!d) return <Loading />;
    const p = postOf(d.postId);
    const text = announcement(d, postTitle(p));
    return (
      <div className="page page--narrow">
        <PageHeader back onBack={() => setMode({ kind: "list" })} title="추첨 결과" description={`${fmtDateTime(d.redrawnAt ?? d.createdAt)} · ${triggerSummary(d.trigger)}`} />
        <VStack gap="x4">
          <Section>
            <HStack gap="x3" align="center" pb="x4">
              <PostThumb post={p} size="sm" />
              <VStack gap="x0_5">
                <Text textStyle="t5Bold">{postTitle(p)}</Text>
                <Text textStyle="t3Regular" color="fg.neutralMuted">
                  참여자 {d.candidateCount}명 중 {d.winners.length}명 당첨 (한 사람은 한 번만)
                </Text>
              </VStack>
            </HStack>
            {d.winners.map((w, i) => (
              <div key={w.userId} className="winner">
                <Badge size="large" variant="solid" tone="brand">
                  {i + 1}
                </Badge>
                <Avatar name={w.username} />
                <VStack gap="x0_5">
                  <Text textStyle="t4Bold">@{w.username}</Text>
                  <Text textStyle="t3Regular" color="fg.neutralMuted">
                    “{w.commentText}”
                  </Text>
                </VStack>
              </div>
            ))}
          </Section>
          <Section title="발표 글" description="복사해서 게시물·스토리에 바로 쓸 수 있어요">
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, fontSize: 14, lineHeight: 1.6 }}>{text}</pre>
            <HStack gap="x2" pt="x4" wrap>
              <ActionButton variant="neutralSolid" onClick={async () => (await copyText(text)) && toast("발표 글을 복사했어요", "positive")}>
                발표 글 복사
              </ActionButton>
              <ActionButton
                variant="neutralWeak"
                onClick={async () => {
                  if (navigator.share) await navigator.share({ text }).catch(() => {});
                  else if (await copyText(text)) toast("공유할 수 없어 클립보드에 복사했어요");
                }}
              >
                발표 글 공유
              </ActionButton>
              <ActionButton variant="neutralWeak" onClick={() => redraw(d)}>
                다시 뽑기
              </ActionButton>
            </HStack>
          </Section>
        </VStack>
      </div>
    );
  }

  if (mode.kind === "new") {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <PageHeader
          back
          onBack={() => (mode.step === 2 ? setMode({ kind: "new", step: 1 }) : setMode({ kind: "list" }))}
          title="새 추첨"
          description={mode.step === 1 ? "추첨할 게시물을 골라 주세요" : "어떤 댓글에서 몇 명을 뽑을까요?"}
        />
        <div style={{ marginBottom: 20 }}>
          <Progress value={mode.step / 2.5} />
        </div>
        {mode.step === 1 ? (
          <>
            <PostPicker posts={posts.data} postId={postId} nextPost={false} allowNextPost={false} onChange={(v) => setPostId(v.postId)} />
            <div className="footer-bar">
              <ActionButton
                variant="brandSolid"
                size="large"
                disabled={!postId || (selected?.commentsCount ?? 0) === 0}
                onClick={() => setMode({ kind: "new", step: 2 })}
              >
                다음
              </ActionButton>
            </div>
          </>
        ) : (
          <VStack gap="x4">
            <Section title="조건">
              <VStack gap="x3">
                {(["all", "keyword"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="option-card"
                    data-selected={trigger.type === t}
                    onClick={() => setTrigger({ type: t, keywords: t === "all" ? [] : trigger.keywords })}
                  >
                    <span className="option-card__icon">{t === "all" ? "💬" : "🔑"}</span>
                    <VStack gap="x0_5" as="span">
                      <Text textStyle="t5Bold">{t === "all" ? "모든 댓글" : "키워드가 있을 때"}</Text>
                      <Text textStyle="t3Regular" color="fg.neutralMuted">
                        {t === "all" ? "댓글을 단 모든 사람 중에서 뽑아요" : "특정 키워드를 남긴 사람 중에서만 뽑아요"}
                      </Text>
                    </VStack>
                  </button>
                ))}
                {trigger.type === "keyword" && (
                  <KeywordInput keywords={trigger.keywords} onChange={(k) => setTrigger({ type: "keyword", keywords: k })} usedOnPost={[]} ideas={["응모", "참여", "이벤트"]} />
                )}
              </VStack>
            </Section>
            <Section title="뽑을 인원" description={`댓글 수(${selected?.commentsCount ?? 0}개)까지 정할 수 있어요. 한 사람이 여러 번 댓글을 달아도 한 번만 뽑혀요.`}>
              <HStack gap="x3" align="center">
                <ActionButton variant="neutralWeak" disabled={count <= 1} onClick={() => setCount(count - 1)} aria-label="한 명 줄이기">
                  −
                </ActionButton>
                <Text textStyle="t9Bold" style={{ minWidth: 48, textAlign: "center" }}>
                  {count}
                </Text>
                <ActionButton
                  variant="neutralWeak"
                  disabled={count >= (selected?.commentsCount ?? 1)}
                  onClick={() => setCount(count + 1)}
                  aria-label="한 명 늘리기"
                >
                  +
                </ActionButton>
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  명
                </Text>
              </HStack>
            </Section>
            <div className="footer-bar">
              <ActionButton
                variant="brandSolid"
                size="large"
                loading={busy}
                disabled={trigger.type === "keyword" && trigger.keywords.length === 0}
                onClick={run}
              >
                {count}명 추첨하기
              </ActionButton>
            </div>
          </VStack>
        )}
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <PageHeader
        title="댓글 추첨"
        description="게시물 댓글에서 당첨자를 무작위로 뽑아요"
        actions={
          <ActionButton
            variant="brandSolid"
            onClick={() => {
              setPostId(null);
              setTrigger({ type: "all", keywords: [] });
              setCount(1);
              setMode({ kind: "new", step: 1 });
            }}
          >
            새 추첨 시작
          </ActionButton>
        }
      />
      <Section title="지난 추첨">
        {draws.data.length === 0 ? (
          <EmptyState emoji="🎁" title="아직 추첨 기록이 없어요" description="이벤트 게시물의 댓글에서 당첨자를 뽑아 보세요." />
        ) : (
          <VStack gap="x2">
            {draws.data.map((d) => {
              const p = postOf(d.postId);
              return (
                <button key={d.id} type="button" className="option-card" onClick={() => setMode({ kind: "result", id: d.id })}>
                  <PostThumb post={p} size="xs" />
                  <VStack gap="x0_5" grow as="span">
                    <Text textStyle="t4Bold">{postTitle(p)}</Text>
                    <Text textStyle="t3Regular" color="fg.neutralMuted">
                      {fmtDateTime(d.redrawnAt ?? d.createdAt)} · {triggerSummary(d.trigger)} · {d.winners.length}명 당첨
                    </Text>
                  </VStack>
                </button>
              );
            })}
          </VStack>
        )}
      </Section>
    </div>
  );
}
