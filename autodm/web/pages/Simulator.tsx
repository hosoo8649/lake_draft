import { HStack, Text, VStack } from "@seed-design/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { Callout } from "seed-design/ui/callout";
import { Checkbox } from "seed-design/ui/checkbox";
import { SelectContent, SelectGroup, SelectItem, SelectRoot, SelectTrigger } from "seed-design/ui/select";
import { Switch } from "seed-design/ui/switch";
import type { Comment, DemoInboxMessage, DemoState } from "@shared/types";
import type { PostWithMeta } from "../components/automation/Pickers";
import { Avatar, FanBubble, Phone } from "../components/dm/Phone";
import { useErrorToast, useToast } from "../components/feedback";
import { TextInput } from "../components/fields";
import { Loading, PageHeader, PostThumb, Section } from "../components/ui";
import { api, useApi } from "../lib/api";
import { useAppState } from "../lib/appState";
import { fmtTime, postTitle } from "../lib/format";

const SKIP_REASON: Record<string, string> = {
  "no-match": "조건에 맞는 자동화가 없어 DM을 보내지 않았어요",
  "own-comment": "본인 계정 댓글이라 보내지 않았어요",
  paused: "설정에서 DM 발송이 일시 중지돼 있어요",
  "restricted-post": "제한된 게시물이라 댓글 이벤트를 받지 못했어요 (DM 공유·코드는 동작해요)",
  duplicate: "이미 처리한 댓글이에요",
};

function BusinessMessage(props: { m: DemoInboxMessage; username?: string; onButton: (b: NonNullable<DemoInboxMessage["buttons"]>[number]) => void }) {
  const { m } = props;
  if (m.cards) {
    return (
      <div className="dm-row" style={{ alignItems: "flex-start" }}>
        <Avatar name={props.username} />
        <div className="dm-carousel">
          {m.cards.map((c, i) => (
            <div key={i} className="dm-card">
              <div className="dm-card__img" style={c.imageUrl ? { backgroundImage: `url("${c.imageUrl}")` } : undefined}>
                {!c.imageUrl && "이미지 없음"}
              </div>
              <div className="dm-card__body">
                <div className="dm-card__title">{c.title}</div>
                {c.subtitle && <div className="dm-card__sub">{c.subtitle}</div>}
              </div>
              {c.buttons.map((b, j) => (
                <button key={j} type="button" className="dm-btn" onClick={() => props.onButton(b)}>
                  {b.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="dm-row">
      <Avatar name={props.username} />
      <div className="dm-msg">
        <div className="dm-text">{m.text}</div>
        {m.buttons?.map((b, j) => (
          <button key={j} type="button" className="dm-btn" onClick={() => props.onButton(b)}>
            {b.title}
            <small>{b.type === "postback" ? "팔로우 확인 버튼" : "링크 버튼 · 클릭 수에 기록돼요"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SimulatorPage() {
  const { state } = useAppState();
  const demo = useApi<DemoState>("/demo");
  const posts = useApi<PostWithMeta[]>("/posts");
  const [postId, setPostId] = useState<string>("");
  const [fanId, setFanId] = useState<string>("fan_2");
  const [text, setText] = useState("링크 주세요!");
  const [asOwner, setAsOwner] = useState(false);
  const [code, setCode] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const comments = useApi<Comment[]>(postId ? `/posts/${postId}/comments` : null);
  const toast = useToast();
  const onError = useErrorToast();
  const inboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!postId && posts.data?.[0]) setPostId(posts.data[0].id);
  }, [posts.data, postId]);

  const fan = demo.data?.fans.find((f) => f.id === fanId);
  const inbox = useMemo(() => demo.data?.inbox.filter((m) => m.fanId === fanId) ?? [], [demo.data, fanId]);
  const unreadBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of demo.data?.inbox ?? []) if (x.from === "business" && !x.readAt) m.set(x.fanId, (m.get(x.fanId) ?? 0) + 1);
    return m;
  }, [demo.data]);
  const replies = new Map((demo.data?.replies ?? []).map((r) => [r.commentId, r.text]));

  useEffect(() => {
    inboxRef.current?.scrollTo({ top: inboxRef.current.scrollHeight, behavior: "smooth" });
  }, [inbox.length]);

  if (state?.account.mode !== "demo") {
    return (
      <div className="page page--narrow">
        <PageHeader title="시뮬레이터" />
        <Callout tone="neutral" description="시뮬레이터는 데모 모드에서만 쓸 수 있어요. 연동·계정에서 데모로 시작할 수 있어요." />
      </div>
    );
  }
  if (!demo.data || !posts.data) return <Loading />;
  const post = posts.data.find((p) => p.id === postId);

  const call = async <T,>(path: string, body: unknown, done?: (r: T) => void) => {
    try {
      const r = await api<T>(path, { body });
      done?.(r);
    } catch (e) {
      onError(e);
    }
  };

  const comment = () =>
    call<{ automationId?: string; skipped?: string }>("/demo/comment", { postId, fanId, text, asOwner }, (r) => {
      const msg = r.skipped ? SKIP_REASON[r.skipped] ?? r.skipped : "자동화가 반응했어요. 오른쪽 DM함을 확인하세요";
      setLastResult(msg);
      toast(msg, r.skipped ? "default" : "positive");
    });

  const onButton = async (b: NonNullable<DemoInboxMessage["buttons"]>[number]) => {
    if (b.type === "postback") {
      await call<{ follower?: boolean; skipped?: string }>("/demo/postback", { fanId, payload: b.payload, title: b.title }, (r) =>
        toast(r.skipped ? r.skipped : r.follower ? "팔로워로 확인됐어요 → 본 DM을 보내요" : "아직 팔로우하지 않았어요 → 비팔로워 DM을 보내요"),
      );
      return;
    }
    await call<{ url: string | null }>("/demo/click", { url: b.url }, (r) => {
      toast(`클릭을 기록했어요 → ${r.url ?? b.url}`, "positive");
      if (r.url) window.open(r.url, "_blank", "noopener");
    });
  };

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHeader
        title="시뮬레이터"
        description="팬이 되어 댓글을 달고, DM을 받고, 버튼을 눌러 보세요. 실제 인스타그램 없이 자동화가 어떻게 동작하는지 확인할 수 있어요."
        actions={
          <ActionButton variant="neutralWeak" onClick={() => call("/demo/fire-schedules", {}, () => toast("예약 시각을 지금으로 당겼어요", "positive"))}>
            ⏱️ 예약 발송 지금 실행
          </ActionButton>
        }
      />
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) 400px" }}>
        <VStack gap="x4">
          <Section title="1. 게시물">
            <VStack gap="x3">
              <SelectRoot value={postId ? [postId] : []} onValueChange={(v) => setPostId(v[0])}>
                <SelectTrigger aria-label="게시물" placeholder="게시물" />
                <SelectContent>
                  <SelectGroup>
                    {posts.data.map((p) => (
                      <SelectItem key={p.id} value={p.id} label={`${p.emoji ?? ""} ${postTitle(p)}`} />
                    ))}
                  </SelectGroup>
                </SelectContent>
              </SelectRoot>
              {post && (
                <HStack gap="x3" align="center">
                  <PostThumb post={post} size="sm" />
                  <VStack gap="x0_5" grow>
                    <Text textStyle="t3Regular" color="fg.neutralMuted">
                      자동화 {post.automationCount}개 · 댓글 {post.commentsCount}개
                      {post.usedKeywords.length ? ` · 키워드: ${post.usedKeywords.join(", ")}` : ""}
                    </Text>
                    <HStack gap="x2" align="center">
                      <Switch
                        checked={!!post.restricted}
                        onCheckedChange={(v) => api(`/demo/posts/${post.id}`, { method: "PATCH", body: { restricted: v } }).catch(onError)}
                        aria-label="제한된 게시물"
                      />
                      <Text textStyle="t3Regular">제한된 게시물(연령 제한 등)로 만들기</Text>
                    </HStack>
                  </VStack>
                </HStack>
              )}
              <HStack gap="x2" wrap>
                <ActionButton
                  size="small"
                  variant="neutralWeak"
                  onClick={() =>
                    call<{ id: string }>("/demo/posts", { caption: "방금 올린 새 릴스 ✨ 댓글에 '링크' 남겨 주세요" }, (p) => {
                      setPostId(p.id);
                      toast("새 게시물을 올렸어요. 다음 게시물 자동화는 첫 댓글이 달리면 연결돼요", "positive");
                    })
                  }
                >
                  + 새 게시물 올리기
                </ActionButton>
              </HStack>
            </VStack>
          </Section>

          <Section title="2. 팬">
            <div className="chips">
              {demo.data.fans.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="option-card"
                  data-selected={f.id === fanId}
                  style={{ width: "auto", padding: "8px 12px", alignItems: "center" }}
                  onClick={() => setFanId(f.id)}
                >
                  <Avatar name={f.username} />
                  <VStack gap="x0_5" as="span">
                    <Text textStyle="t3Bold">@{f.username}</Text>
                    <Text textStyle="t2Regular" color="fg.neutralSubtle">
                      {f.following ? "팔로워" : "비팔로워"}
                      {f.restricted ? " · DM 제한" : ""}
                    </Text>
                  </VStack>
                  {unreadBy.get(f.id) ? (
                    <Badge size="medium" variant="solid" tone="critical">
                      {unreadBy.get(f.id)}
                    </Badge>
                  ) : null}
                </button>
              ))}
            </div>
            {fan && (
              <HStack gap="x5" pt="x4" wrap>
                <HStack gap="x2" align="center">
                  <Switch
                    checked={fan.following}
                    onCheckedChange={(v) => api(`/demo/fans/${fan.id}`, { method: "PATCH", body: { following: v } }).catch(onError)}
                    aria-label="팔로우 중"
                  />
                  <Text textStyle="t3Regular">@{fan.username} 팔로우 중</Text>
                </HStack>
                <HStack gap="x2" align="center">
                  <Switch
                    checked={!!fan.restricted}
                    onCheckedChange={(v) => api(`/demo/fans/${fan.id}`, { method: "PATCH", body: { restricted: v } }).catch(onError)}
                    aria-label="DM 수신 제한"
                  />
                  <Text textStyle="t3Regular">DM 수신 제한 계정</Text>
                </HStack>
              </HStack>
            )}
          </Section>

          <Section title="3. 행동하기">
            <VStack gap="x4">
              <VStack gap="x2">
                <HStack gap="x2" align="flex-end">
                  <div style={{ flex: 1 }}>
                    <TextInput label="댓글 달기" value={text} onChange={setText} onEnter={comment} />
                  </div>
                  <ActionButton variant="brandSolid" onClick={comment} disabled={!text.trim() || !postId}>
                    댓글 달기
                  </ActionButton>
                </HStack>
                <Checkbox label={`내 계정(@${state.account.username})으로 달기 — 본인 댓글은 DM이 가지 않아요`} checked={asOwner} onCheckedChange={setAsOwner} />
                {lastResult && (
                  <Text textStyle="t3Regular" color="fg.neutralMuted">
                    → {lastResult}
                  </Text>
                )}
              </VStack>
              <HStack gap="x2" wrap>
                <ActionButton
                  size="small"
                  variant="neutralWeak"
                  onClick={() => call("/demo/comments/bulk", { postId, count: 20 }, () => toast("여러 팬이 댓글 20개를 달았어요", "positive"))}
                >
                  💬 댓글 20개 한꺼번에
                </ActionButton>
                <ActionButton
                  size="small"
                  variant="neutralWeak"
                  onClick={() =>
                    call<{ skipped?: string }>("/demo/message", { fanId, sharedPostId: postId }, (r) =>
                      toast(r.skipped ? "DM 공유에 답하는 자동화가 없어요" : "게시물을 DM으로 공유했어요", r.skipped ? "default" : "positive"),
                    )
                  }
                >
                  ✈️ 이 게시물을 DM으로 공유
                </ActionButton>
              </HStack>
              <HStack gap="x2" align="flex-end">
                <div style={{ width: 200 }}>
                  <TextInput label="DM 보내기 (코드 등)" placeholder="예: 1234" value={code} onChange={setCode} />
                </div>
                <ActionButton
                  variant="neutralWeak"
                  disabled={!code.trim()}
                  onClick={() =>
                    call<{ skipped?: string }>("/demo/message", { fanId, text: code }, (r) => {
                      toast(r.skipped ? "이 코드에 답하는 자동화가 없어요" : "코드가 맞아요 → 같은 DM을 보내요", r.skipped ? "default" : "positive");
                      setCode("");
                    })
                  }
                >
                  보내기
                </ActionButton>
              </HStack>
            </VStack>
          </Section>

          <Section title="이 게시물의 댓글" description="공개 답글이 달리면 ↳ 로 보여요">
            <VStack gap="x2" style={{ maxHeight: 360, overflowY: "auto" }}>
              {(comments.data ?? []).slice(0, 60).map((c) => (
                <VStack key={c.id} gap="x0_5" pb="x2" style={{ borderBottom: "1px solid var(--seed-color-stroke-neutral-subtle)" }}>
                  <Text textStyle="t3Regular">
                    <b>@{c.username}</b> {c.text} <span style={{ color: "var(--seed-color-fg-neutral-subtle)" }}>· {fmtTime(c.createdAt)}</span>
                  </Text>
                  {replies.get(c.id) && (
                    <Text textStyle="t3Regular" color="fg.neutralMuted">
                      ↳ <b>@{state.account.username}</b> {replies.get(c.id)}
                    </Text>
                  )}
                </VStack>
              ))}
              {comments.data?.length === 0 && <Text color="fg.neutralSubtle">아직 댓글이 없어요</Text>}
            </VStack>
          </Section>
        </VStack>

        <div className="split__aside">
          <VStack gap="x2">
            <HStack justify="space-between">
              <Text textStyle="t4Bold" color="fg.neutralMuted">
                @{fan?.username}의 DM함
              </Text>
              <ActionButton
                size="xsmall"
                variant="neutralWeak"
                disabled={!unreadBy.get(fanId)}
                onClick={() => call("/demo/read", { fanId }, () => toast("DM을 읽었어요 (읽음 수에 기록돼요)"))}
              >
                DM 열어 읽기
              </ActionButton>
            </HStack>
            <Phone username={state.account.username}>
              <div ref={inboxRef} className="sim-inbox">
                <VStack gap="x2">
                  {inbox.length === 0 && <div className="dm-system">아직 받은 DM이 없어요</div>}
                  {inbox.map((m) =>
                    m.from === "fan" ? (
                      <FanBubble key={m.id}>{m.sharedPostId ? "✈️ 게시물을 공유했어요" : m.text}</FanBubble>
                    ) : (
                      <VStack key={m.id} gap="x0_5">
                        <BusinessMessage m={m} username={state.account.username} onButton={onButton} />
                        <Text textStyle="t1Regular" color="fg.neutralSubtle" style={{ paddingLeft: 32 }}>
                          {fmtTime(m.createdAt)} {m.readAt ? "· 읽음" : ""}
                        </Text>
                      </VStack>
                    ),
                  )}
                </VStack>
              </div>
            </Phone>
          </VStack>
        </div>
      </div>
    </div>
  );
}
