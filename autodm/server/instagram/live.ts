import { config, unifiedLogin } from "../config";
import type { Comment, MediaType, Post } from "../../shared/types";
import {
  describeGraphError,
  type Gateway,
  type IGProfile,
  type OutgoingButton,
  type OutgoingMessage,
  type SendResult,
} from "./gateway";

/** Instagram 로그인은 graph.instagram.com, 통합 로그인(시스템 사용자 토큰)은 graph.facebook.com */
const GRAPH = () =>
  unifiedLogin()
    ? `https://graph.facebook.com/${config.graphVersion}`
    : `https://graph.instagram.com/${config.graphVersion}`;

class GraphError extends Error {
  constructor(public info: { code?: number; error_subcode?: number; message?: string }) {
    super(info.message ?? "Graph API error");
  }
}

async function graph<T>(
  token: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string> = {},
  body?: unknown,
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH()}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: GraphError["info"] } & T;
  if (!res.ok || json.error) throw new GraphError(json.error ?? { message: `HTTP ${res.status}` });
  return json;
}

function toButtons(buttons: OutgoingButton[]) {
  return buttons.map((b) =>
    b.type === "postback"
      ? { type: "postback", title: b.title, payload: b.payload }
      : { type: "web_url", title: b.title, url: b.url },
  );
}

export function toGraphMessage(msg: OutgoingMessage): unknown {
  switch (msg.kind) {
    case "text":
      return { text: msg.text };
    case "buttons":
      return {
        attachment: {
          type: "template",
          payload: { template_type: "button", text: msg.text, buttons: toButtons(msg.buttons) },
        },
      };
    case "carousel":
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: msg.cards.map((c) => ({
              title: c.title,
              subtitle: c.subtitle || undefined,
              image_url: c.imageUrl || undefined,
              buttons: c.buttons.length ? toButtons(c.buttons) : undefined,
            })),
          },
        },
      };
  }
}

interface GraphMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  thumbnail_url?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
}

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,comments_count";

function toPost(m: GraphMedia): Post {
  const type: MediaType =
    m.media_product_type === "REELS" ? "REELS" : ((m.media_type as MediaType | undefined) ?? "IMAGE");
  return {
    id: m.id,
    caption: m.caption ?? "",
    mediaType: type,
    thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? undefined : m.media_url),
    permalink: m.permalink,
    timestamp: m.timestamp ? Date.parse(m.timestamp) : Date.now(),
    commentsCount: m.comments_count ?? 0,
  };
}

export class LiveGateway implements Gateway {
  mode = "live" as const;

  constructor(
    private getToken: () => string | undefined,
    private igUserId: () => string | undefined,
  ) {}

  private token(): string {
    const t = this.getToken();
    if (!t) throw new GraphError({ code: 190, message: "not connected" });
    return t;
  }

  private async send(recipient: unknown, msg: OutgoingMessage): Promise<SendResult> {
    try {
      const me = this.igUserId() ?? "me";
      const res = await graph<{ message_id?: string }>(this.token(), "POST", `/${me}/messages`, {}, {
        recipient,
        message: toGraphMessage(msg),
      });
      return { ok: true, messageId: res.message_id };
    } catch (e) {
      return fail(e);
    }
  }

  sendPrivateReply(commentId: string, msg: OutgoingMessage): Promise<SendResult> {
    return this.send({ comment_id: commentId }, msg);
  }

  sendDirect(userId: string, msg: OutgoingMessage): Promise<SendResult> {
    return this.send({ id: userId }, msg);
  }

  async replyToComment(commentId: string, text: string): Promise<SendResult> {
    try {
      const res = await graph<{ id?: string }>(this.token(), "POST", `/${commentId}/replies`, { message: text });
      return { ok: true, messageId: res.id };
    } catch (e) {
      const r = fail(e);
      // 답글은 DM과 실패 이유가 달라요
      if (!r.ok && e instanceof GraphError && !r.authError) {
        if (e.info.code === 10 || e.info.code === 200)
          return { ...r, error: "댓글 답글 권한이 없어요 (다시 연동하면서 댓글 관리 권한을 허용해 주세요)", retryable: false };
        if (e.info.code === 100) return { ...r, error: "댓글이 삭제됐거나 찾을 수 없어요", retryable: false };
      }
      return r;
    }
  }

  async isFollower(userId: string): Promise<boolean | null> {
    try {
      const res = await graph<{ is_user_follow_business?: boolean }>(this.token(), "GET", `/${userId}`, {
        fields: "is_user_follow_business",
      });
      return typeof res.is_user_follow_business === "boolean" ? res.is_user_follow_business : null;
    } catch {
      return null;
    }
  }

  async fetchProfile(): Promise<IGProfile> {
    if (unifiedLogin()) return this.fetchProfileUnified();
    const me = await graph<{
      user_id?: string;
      id: string;
      username: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
    }>(this.token(), "GET", "/me", {
      fields: "user_id,username,name,profile_picture_url,followers_count",
    });
    return {
      igUserId: me.user_id ?? me.id,
      username: me.username,
      name: me.name,
      profilePictureUrl: me.profile_picture_url,
      followersCount: me.followers_count,
    };
  }

  /**
   * 통합 로그인: 토큰의 /me 는 인스타그램 계정이 아니라 비즈니스 시스템 사용자예요.
   * 로그인할 때 공유한 인스타그램 계정을 /me/assigned_instagram_accounts 에서 찾아요.
   */
  private async fetchProfileUnified(): Promise<IGProfile> {
    let igId = this.igUserId();
    if (!igId) {
      const res = await graph<{ data?: { id: string; username?: string }[] }>(
        this.token(),
        "GET",
        "/me/assigned_instagram_accounts",
        { fields: "id,username" },
      );
      const first = res.data?.[0];
      if (!first) throw new Error("연동할 인스타그램 계정을 찾지 못했어요. 로그인할 때 인스타그램 계정을 선택(공유)해 주세요");
      if ((res.data?.length ?? 0) > 1)
        console.warn(`[oauth] 공유된 인스타그램 계정이 ${res.data!.length}개예요. 첫 번째(@${first.username ?? first.id})로 연동해요`);
      igId = first.id;
    }
    const p = await graph<{
      id: string;
      username: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
    }>(this.token(), "GET", `/${igId}`, { fields: "id,username,name,profile_picture_url,followers_count" });
    return {
      igUserId: p.id,
      username: p.username,
      name: p.name,
      profilePictureUrl: p.profile_picture_url,
      followersCount: p.followers_count,
    };
  }

  async fetchPosts(): Promise<Post[]> {
    const owner = unifiedLogin() ? this.igUserId() : "me";
    if (!owner) throw new GraphError({ code: 190, message: "not connected" });
    const res = await graph<{ data: GraphMedia[] }>(this.token(), "GET", `/${owner}/media`, {
      fields: MEDIA_FIELDS,
      limit: "50",
    });
    return res.data.map(toPost);
  }

  async fetchPost(postId: string): Promise<Post | null> {
    try {
      return toPost(await graph<GraphMedia>(this.token(), "GET", `/${postId}`, { fields: MEDIA_FIELDS }));
    } catch {
      return null;
    }
  }

  async fetchComments(postId: string, sinceMs: number): Promise<Comment[]> {
    const out: Comment[] = [];
    let next: string | undefined = `/${postId}/comments`;
    let params: Record<string, string> = { fields: "id,text,timestamp,from,username,parent_id", limit: "50" };
    // 최대 20페이지 (1,000개)까지
    for (let page = 0; next && page < 20; page++) {
      const res: {
        data: { id: string; text?: string; timestamp?: string; from?: { id: string; username?: string }; username?: string; parent_id?: string }[];
        paging?: { next?: string };
      } = await graph(this.token(), "GET", next, params);
      for (const c of res.data) {
        const ts = c.timestamp ? Date.parse(c.timestamp) : Date.now();
        if (ts < sinceMs) continue;
        out.push({
          id: c.id,
          postId,
          userId: c.from?.id ?? "",
          username: c.from?.username ?? c.username ?? "",
          text: c.text ?? "",
          createdAt: ts,
          parentId: c.parent_id,
        });
      }
      next = res.paging?.next;
      params = {};
    }
    return out;
  }
}

function fail(e: unknown): SendResult {
  if (e instanceof GraphError) return { ok: false, ...describeGraphError(e.info) };
  return { ok: false, error: "네트워크 오류 (재시도 중)", retryable: true };
}

/* ───────────── OAuth (Instagram 로그인) ───────────── */

export function authorizeUrl(redirectUri: string, state: string, scopes: string[], forceReauth: boolean): string {
  if (unifiedLogin()) {
    // 통합 로그인: 권한은 구성(config_id)에 들어 있어서 scope를 보내지 않아요
    const u = new URL("https://www.facebook.com/dialog/oauth");
    u.searchParams.set("client_id", config.igAppId);
    u.searchParams.set("config_id", config.igLoginConfigId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("override_default_response_type", "true");
    u.searchParams.set("state", state);
    if (forceReauth) u.searchParams.set("prompt", "login");
    return u.toString();
  }
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", config.igAppId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", scopes.join(","));
  u.searchParams.set("state", state);
  if (forceReauth) u.searchParams.set("force_reauth", "true");
  return u.toString();
}

/** expiresIn 이 0이면 만료되지 않는 토큰(통합 로그인 기본 구성)이에요 */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ token: string; expiresIn: number }> {
  if (unifiedLogin()) {
    const u = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
    u.searchParams.set("client_id", config.igAppId);
    u.searchParams.set("client_secret", config.igAppSecret);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("code", code);
    const res = (await (await fetch(u)).json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!res.access_token) throw new Error(res.error?.message ?? "토큰 발급 실패");
    return { token: res.access_token, expiresIn: res.expires_in && res.expires_in > 0 ? res.expires_in : 0 };
  }
  const form = new URLSearchParams({
    client_id: config.igAppId,
    client_secret: config.igAppSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const short = (await res.json()) as { access_token?: string; error_message?: string };
  if (!short.access_token) throw new Error(short.error_message ?? "토큰 발급 실패");
  // 장기 토큰(60일)으로 교환
  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", config.igAppSecret);
  u.searchParams.set("access_token", short.access_token);
  const long = (await (await fetch(u)).json()) as { access_token?: string; expires_in?: number };
  if (!long.access_token) return { token: short.access_token, expiresIn: 3600 };
  return { token: long.access_token, expiresIn: long.expires_in ?? 60 * 24 * 3600 };
}

export async function refreshToken(token: string): Promise<{ token: string; expiresIn: number } | null> {
  // 통합 로그인의 시스템 사용자 토큰은 갱신 API가 따로 없어요 (만료되는 구성이면 다시 연동)
  if (unifiedLogin()) return null;
  const u = new URL("https://graph.instagram.com/refresh_access_token");
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const res = (await (await fetch(u)).json()) as { access_token?: string; expires_in?: number };
  return res.access_token ? { token: res.access_token, expiresIn: res.expires_in ?? 0 } : null;
}

export async function subscribeWebhooks(token: string, igUserId: string): Promise<void> {
  await graph(token, "POST", `/${igUserId}/subscribed_apps`, {
    subscribed_fields: "comments,messages,messaging_postbacks,messaging_seen",
  });
}
