import { createTransport } from "nodemailer";
import type { AlertSettings, Settings } from "../shared/types";
import type { EngineAlert } from "./engine/engine";
import type { Store } from "./store";

/*
 * 메일 알림 (Gmail)
 * 인스타그램 제한 신호·답글 자동 멈춤·연결 끊김을 메일로 알려요.
 * 보내는 계정은 설정 화면 또는 .env(GMAIL_USER·GMAIL_APP_PASSWORD·ALERT_EMAIL_TO)로 정해요. .env가 우선이에요.
 */

export interface MailCreds {
  user: string;
  pass: string;
  to: string;
  fromEnv: boolean;
}

export interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

export type SendMail = (creds: MailCreds, msg: MailMessage) => Promise<void>;

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
export const isEmail = (v: string) => EMAIL_RE.test(v);

/** 메일을 보낼 수 있는 계정 — 없으면 null */
export function mailCreds(s: Settings): MailCreds | null {
  const envUser = process.env.GMAIL_USER?.trim();
  const envPass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (envUser && envPass) return { user: envUser, pass: envPass, to: process.env.ALERT_EMAIL_TO?.trim() || s.alerts.to || envUser, fromEnv: true };
  const a = s.alerts;
  if (a.gmailUser && a.gmailAppPassword) return { user: a.gmailUser, pass: a.gmailAppPassword, to: a.to || a.gmailUser, fromEnv: false };
  return null;
}

/** 화면·API로 내보내는 설정 — 앱 비밀번호는 빼고 넣었는지만 알려요 */
export function publicSettings(s: Settings): Settings {
  const { gmailAppPassword: _secret, ...rest } = s.alerts;
  const creds = mailCreds(s);
  const alerts: AlertSettings = {
    ...rest,
    gmailUser: creds?.fromEnv ? creds.user : rest.gmailUser,
    to: creds?.fromEnv && process.env.ALERT_EMAIL_TO?.trim() ? process.env.ALERT_EMAIL_TO.trim() : rest.to,
    hasPassword: !!creds,
    fromEnv: !!creds?.fromEnv,
  };
  return { ...s, alerts };
}

/** Gmail SMTP로 보내기 (앱 비밀번호 사용) */
export const gmailSend: SendMail = async (creds, msg) => {
  const t = createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await t.sendMail({ from: { name: "캐롤DM", address: creds.user }, to: creds.to, subject: msg.subject, text: msg.text, html: msg.html });
  } finally {
    t.close();
  }
};

/** 메일 오류 → 사용자에게 보여 줄 말 */
export function mailError(e: unknown): string {
  const err = (e ?? {}) as { code?: string; responseCode?: number; message?: string };
  if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534)
    return "Gmail 로그인에 실패했어요. Gmail 주소와 앱 비밀번호(16자리)를 확인해 주세요";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(err.code ?? ""))
    return "Gmail 메일 서버에 연결하지 못했어요. 인터넷 연결이나 방화벽(465 포트)을 확인해 주세요";
  if (err.code === "EENVELOPE") return "받는 주소가 올바르지 않아요";
  return `메일을 보내지 못했어요 (${err.message ?? "알 수 없는 오류"})`;
}

/* ───────────── 메일 내용 ───────────── */

interface Body {
  intro: string;
  facts: [string, string][];
  did: string[];
  todo: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(subject: string, b: Body, link: string): MailMessage {
  const text = [
    b.intro,
    "",
    ...b.facts.map(([k, v]) => `- ${k}: ${v}`),
    ...(b.did.length ? ["", "캐롤DM이 한 일", ...b.did.map((x) => `- ${x}`)] : []),
    ...(b.todo.length ? ["", "이렇게 해 주세요", ...b.todo.map((x) => `- ${x}`)] : []),
    ...(link ? ["", `설정 열기: ${link}`] : []),
    "",
    "— 캐롤DM 알림 메일이에요. 알림은 캐롤DM 설정 › 메일 알림에서 끌 수 있어요.",
  ].join("\n");
  const list = (title: string, items: string[]) =>
    items.length ? `<p style="margin:16px 0 4px;font-weight:700">${esc(title)}</p><ul style="margin:0;padding-left:20px">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const html = `<div style="font-family:Pretendard,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:1.6;color:#1a1c20;max-width:560px">
<p style="margin:0 0 12px">${esc(b.intro)}</p>
<table style="border-collapse:collapse;font-size:14px">${b.facts.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b6e76;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join("")}</table>
${list("캐롤DM이 한 일", b.did)}${list("이렇게 해 주세요", b.todo)}
${link ? `<p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#ff6600;color:#fff;text-decoration:none;font-weight:700">설정 열기</a></p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#8b8e96">캐롤DM 알림 메일이에요. 알림은 캐롤DM 설정 › 메일 알림에서 끌 수 있어요.</p>
</div>`;
  return { subject, text, html };
}

/** 알림 메일 만들기 */
export function composeAlert(a: EngineAlert | { type: "test" }, ctx: { username: string; demo: boolean; at: number; settingsUrl: string }): MailMessage {
  const tag = ctx.demo ? "[캐롤DM 체험]" : "[캐롤DM]";
  const who = ctx.username ? `@${ctx.username}` : "연동한";
  const when = new Date(ctx.at).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
  const openSettings = ctx.settingsUrl ? "" : "PC에서 캐롤DM을 열어 설정 › 발송 속도 · 안전 장치를 확인해 주세요.";
  const link = ctx.settingsUrl;

  if (a.type === "test")
    return render(
      `${tag} 테스트 메일이에요`,
      {
        intro: `메일 알림이 잘 연결됐어요. ${who} 계정에 인스타그램 제한 신호가 오거나 연결이 끊기면 이 주소로 알려 드릴게요.`,
        facts: [["보낸 때", when]],
        did: [],
        todo: [],
      },
      link,
    );

  if (a.type === "reauth")
    return render(
      `${tag} 인스타그램 연결이 끊겼어요 · DM이 나가지 않아요`,
      {
        intro: `${who} 계정의 인스타그램 연결이 끊겨서 자동 DM과 답글을 보내지 못하고 있어요.`,
        facts: [["알게 된 때", when]],
        did: ["보내지 못한 DM은 실패로 기록했어요."],
        todo: [
          "캐롤DM › 연동·계정에서 ‘다시 연동하기’를 눌러 주세요. 같은 계정으로 다시 연동하면 자동화와 기록은 그대로예요.",
          ...(openSettings ? ["PC에서 캐롤DM을 열어 연동·계정을 확인해 주세요."] : []),
        ],
      },
      link ? link.replace(/\/settings#safety$/, "/connect") : "",
    );

  const facts: [string, string][] = [
    ["언제", when],
    ["최근 24시간 신호", `${a.level}번`],
    ["내용", a.reason],
  ];
  const common = [
    "인스타그램 앱에서 계정 상태(제한·경고가 있는지)를 확인해 주세요.",
    "DM에 ‘다른 문구’를 여러 개 넣고, 발송 속도를 낮춰 주세요.",
  ];
  if (a.autoPaused)
    return render(
      `${tag} 제한 신호 ${a.level}번 · 댓글 답글을 자동으로 멈췄어요`,
      {
        intro: `${who} 계정에 인스타그램 제한 신호가 계속 와서 댓글 자동 답글을 멈췄어요. DM은 계속 보내고 있어요.`,
        facts,
        did: ["댓글 자동 답글을 멈췄어요. 밀려 있던 답글도 달지 않아요.", "DM은 시간당 한도 안에서 그대로 보내요."],
        todo: [
          ...common,
          "몇 시간 쉬었다가, 괜찮아지면 캐롤DM 설정 › 발송 속도 · 안전 장치에서 ‘기록 지우기’를 눌러 주세요. 답글도 다시 켜져요.",
          ...(openSettings ? [openSettings] : []),
        ],
      },
      link,
    );
  if (a.level >= 3)
    return render(
      `${tag} 인스타그램 제한 신호가 계속되고 있어요 (${a.level}번)`,
      {
        intro: `${who} 계정에 인스타그램 제한 신호가 계속 오고 있어요.`,
        facts,
        did: ["댓글 답글은 이미 멈춰 있어요."],
        todo: [...common, "DM도 잠시 쉬려면 캐롤DM 설정 › 운영에서 ‘DM 자동 발송’을 꺼 주세요.", ...(openSettings ? [openSettings] : [])],
      },
      link,
    );
  return render(
    `${tag} 인스타그램 제한 신호 ${a.level}번 · 답글을 천천히 달고 있어요`,
    {
      intro: `${who} 계정에서 인스타그램이 발송을 제한했다는 신호를 받았어요.`,
      facts,
      did: [
        "계정을 보호하려고 댓글 답글을 10분에 하나씩만 달고 있어요. DM은 그대로 보내요.",
        a.level >= 2 ? "한 번 더 신호를 받으면 댓글 답글을 자동으로 멈춰요." : "신호가 3번 쌓이면 댓글 답글을 자동으로 멈춰요.",
      ],
      todo: [...common, ...(openSettings ? [openSettings] : [])],
    },
    link,
  );
}

/* ───────────── 보내기 ───────────── */

/** 3번째 신호 뒤에도 신호가 계속 오면 이 간격으로만 다시 알려요 */
const REPEAT_RISK_MAIL_MS = 3 * 60 * 60 * 1000;

export class Notifier {
  private lastRepeatRiskAt = 0;

  constructor(
    private store: Store,
    private opts: { send?: SendMail; now: () => number; settingsUrl: () => string },
  ) {}

  private ctx() {
    const acc = this.store.db.account;
    return { username: acc?.username ?? "", demo: acc?.mode === "demo", at: this.opts.now(), settingsUrl: this.opts.settingsUrl() };
  }

  /** 엔진 알림 → 메일 (꺼져 있거나 계정이 없으면 아무것도 안 해요) */
  alert(a: EngineAlert): Promise<void> {
    const s = this.store.db.settings;
    if (!s.alerts.email || !mailCreds(s)) return Promise.resolve();
    if (a.type === "risk" && a.level > 3 && !a.autoPaused) {
      if (this.opts.now() - this.lastRepeatRiskAt < REPEAT_RISK_MAIL_MS) return Promise.resolve();
      this.lastRepeatRiskAt = this.opts.now();
    }
    return this.deliver(composeAlert(a, this.ctx())).catch(() => {});
  }

  /** 테스트 메일 — 실패하면 오류를 던져요 */
  test(): Promise<void> {
    return this.deliver(composeAlert({ type: "test" }, this.ctx()));
  }

  private async deliver(msg: MailMessage): Promise<void> {
    const s = this.store.db.settings;
    const creds = mailCreds(s);
    if (!creds) throw new Error("메일 계정이 없어요");
    try {
      await (this.opts.send ?? gmailSend)(creds, msg);
      s.alerts.lastSentAt = this.opts.now();
      s.alerts.lastError = undefined;
      s.alerts.lastErrorAt = undefined;
    } catch (e) {
      s.alerts.lastError = mailError(e);
      s.alerts.lastErrorAt = this.opts.now();
      console.error("[mail]", (e as Error)?.message ?? e);
      throw e;
    } finally {
      this.store.changed();
    }
  }
}
