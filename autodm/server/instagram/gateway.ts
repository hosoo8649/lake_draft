import type { AppMode, Comment, Post } from "../../shared/types";

export interface OutgoingButton {
  type: "web_url" | "postback";
  title: string;
  url?: string;
  payload?: string;
}

export interface OutgoingCard {
  title: string;
  subtitle: string;
  imageUrl: string;
  buttons: OutgoingButton[];
}

export type OutgoingMessage =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: OutgoingButton[] }
  | { kind: "carousel"; cards: OutgoingCard[] };

export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; retryable: boolean; authError?: boolean; recipient?: boolean };

export interface SendContext {
  deliveryId: string;
  userId: string;
  username: string;
}

export interface IGProfile {
  igUserId: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
}

/** 실제 인스타그램(Graph API)과 데모 시뮬레이터가 같은 인터페이스로 동작해요 */
export interface Gateway {
  mode: AppMode;
  /** 댓글에 대한 비공개 답장 (댓글 단 사람에게 첫 DM) */
  sendPrivateReply(commentId: string, msg: OutgoingMessage, ctx: SendContext): Promise<SendResult>;
  /** 대화가 열린 사용자에게 보내는 일반 DM (버튼 클릭·DM 이후 24시간) */
  sendDirect(userId: string, msg: OutgoingMessage, ctx: SendContext): Promise<SendResult>;
  /** 댓글에 공개 답글 */
  replyToComment(commentId: string, text: string): Promise<SendResult>;
  /** 팔로우 여부 (알 수 없으면 null) */
  isFollower(userId: string): Promise<boolean | null>;
  fetchProfile(): Promise<IGProfile>;
  fetchPosts(): Promise<Post[]>;
  fetchPost(postId: string): Promise<Post | null>;
  /** sinceMs 이후의 댓글 (일괄 발송·추첨용) */
  fetchComments(postId: string, sinceMs: number): Promise<Comment[]>;
}

/** Graph API 오류를 사람이 읽을 수 있는 이유로 바꿔요 */
export function describeGraphError(e: {
  code?: number;
  error_subcode?: number;
  message?: string;
}): { error: string; retryable: boolean; authError?: boolean; recipient?: boolean } {
  const code = e.code ?? 0;
  const sub = e.error_subcode ?? 0;
  if (code === 190 || code === 102) return { error: "인스타그램 연결이 만료됐어요. 다시 연동해 주세요", retryable: false, authError: true };
  // recipient: 받는 사람 쪽 사정이라 크리에이터가 고칠 수 없는 실패 (자동화 상태 경고에서 빼요)
  if (code === 10 && sub === 2534022) return { error: "답장 기한이 지났어요", retryable: false, recipient: true };
  if (code === 10) return { error: "메시지 권한이 없어요 (메시지 액세스 허용을 확인해 주세요)", retryable: false };
  if (code === 551 || sub === 1545041) return { error: "수신자가 메시지를 받을 수 없는 상태예요", retryable: false, recipient: true };
  if (code === 4 || code === 17 || code === 32 || code === 613 || sub === 2534025)
    return { error: "인스타그램에서 발송을 제한했어요 (잠시 후 다시 보내요)", retryable: true };
  if (code === 1 || code === 2) return { error: "인스타그램 일시 오류 (재시도 중)", retryable: true };
  if (code === 100 && sub === 2018001) return { error: "수신자를 찾을 수 없어요", retryable: false, recipient: true };
  if (code === 368) return { error: "계정이 일시적으로 제한됐어요", retryable: false };
  return { error: e.message ? `인스타그램 오류: ${e.message}` : "알 수 없는 오류", retryable: false };
}
