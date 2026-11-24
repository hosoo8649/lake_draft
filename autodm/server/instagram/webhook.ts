import crypto from "node:crypto";
import type { Engine } from "../engine/engine";

/** X-Hub-Signature-256 검증 (앱 시크릿으로 서명) */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!appSecret) return false;
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const got = header.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
  } catch {
    return false;
  }
}

interface CommentChange {
  field: string;
  value: {
    id: string;
    text?: string;
    parent_id?: string;
    from?: { id: string; username?: string };
    media?: { id: string };
  };
}

interface MessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string; payload?: { url?: string; ig_post_media_id?: string; id?: string; reel_video_id?: string } }[];
  };
  postback?: { mid?: string; title?: string; payload?: string };
  read?: { mid?: string; watermark?: number };
}

export interface WebhookPayload {
  object?: string;
  entry?: { id?: string; time?: number; changes?: CommentChange[]; messaging?: MessagingEvent[] }[];
}

/** 인스타그램 웹훅 → 엔진 이벤트 */
export async function dispatchWebhook(
  payload: WebhookPayload,
  engine: Engine,
  resolveUsername: (userId: string) => Promise<string>,
): Promise<number> {
  let handled = 0;
  for (const entry of payload.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if ((ch.field === "comments" || ch.field === "live_comments") && ch.value?.media?.id && ch.value.from) {
        await engine.handleComment({
          id: ch.value.id,
          postId: ch.value.media.id,
          userId: ch.value.from.id,
          username: ch.value.from.username ?? "",
          text: ch.value.text ?? "",
          createdAt: (entry.time ?? Date.now() / 1000) * 1000,
          parentId: ch.value.parent_id,
        });
        handled++;
      }
    }
    for (const ev of entry.messaging ?? []) {
      const userId = ev.sender?.id;
      if (!userId) continue;
      if (ev.message?.is_echo) continue;
      if (ev.postback?.payload) {
        await engine.handlePostback(userId, await resolveUsername(userId), ev.postback.payload, ev.postback.mid);
        handled++;
      } else if (ev.read) {
        engine.handleRead(userId, ev.timestamp ?? Date.now());
        handled++;
      } else if (ev.message) {
        // 게시물·릴스 공유 (첨부 종류 이름이 바뀌어도 받도록 넓게 확인)
        const share = ev.message.attachments?.find((a) => ["share", "ig_post", "ig_reel", "reel"].includes(a.type ?? ""));
        await engine.handleMessage(
          userId,
          await resolveUsername(userId),
          {
            text: ev.message.text,
            sharedPostId: share?.payload?.ig_post_media_id ?? share?.payload?.reel_video_id ?? share?.payload?.id,
            sharedUrl: share?.payload?.url,
          },
          ev.message.mid,
        );
        handled++;
      }
    }
  }
  return handled;
}
