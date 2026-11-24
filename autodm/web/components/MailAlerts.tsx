import { IconArrowUpRightLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, SuffixIcon, Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { List, ListSwitchItem } from "seed-design/ui/list";
import { Switchmark } from "seed-design/ui/switch";
import type { AlertSettings, Settings } from "@shared/types";
import { api } from "../lib/api";
import { useAppState } from "../lib/appState";
import { fmtRelative } from "../lib/format";
import { useConfirm, useErrorToast, useToast } from "./feedback";
import { TextInput } from "./fields";
import { Section } from "./ui";

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const APP_PASSWORDS_URL = "https://myaccount.google.com/apppasswords";

/**
 * 메일 알림 (Gmail)
 * 제한 신호·답글 자동 멈춤·인스타그램 연결 끊김을 메일로 받아요. 앱 비밀번호는 서버에만 저장돼요.
 */
export function MailAlertsSection() {
  const { state, reload } = useAppState();
  const toast = useToast();
  const onError = useErrorToast();
  const confirm = useConfirm();
  const a = state!.settings.alerts;
  const configured = !!a.hasPassword;
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);

  const patch = async (alerts: Partial<AlertSettings>, msg?: string) => {
    try {
      await api<Settings>("/settings", { method: "PATCH", body: { alerts } });
      await reload();
      if (msg) toast(msg, "positive");
      return true;
    } catch (e) {
      onError(e);
      return false;
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api<{ to: string }>("/alerts/test", { body: {} });
      toast(`${r.to}로 테스트 메일을 보냈어요. 받은편지함을 확인해 주세요`, "positive");
    } catch (e) {
      onError(e);
    } finally {
      setTesting(false);
      await reload();
    }
  };

  return (
    <Section
      title="메일 알림"
      description="인스타그램 제한 신호가 오거나, 답글이 자동으로 멈추거나, 인스타그램 연결이 끊기면 Gmail로 알려 드려요. 캐롤DM을 열어 보지 않아도 바로 알 수 있어요."
    >
      {!configured || editing ? (
        <AccountForm
          current={a}
          configured={configured}
          onCancel={configured ? () => setEditing(false) : undefined}
          onSave={async (v) => {
            // 처음 넣을 때만 알림을 켜요 — 계정만 바꿀 때는 켜고 끈 상태를 그대로 둬요
            const ok = await patch(configured ? v : { ...v, email: true }, configured ? "메일 계정을 바꿨어요" : "메일 알림을 켰어요. 테스트 메일로 확인해 보세요");
            if (ok) setEditing(false);
          }}
        />
      ) : (
        <VStack gap="x4">
          <List>
            <ListSwitchItem
              title="메일로 알림 받기"
              detail="제한 신호(1·2·3번째), 댓글 답글 자동 멈춤, 인스타그램 연결 끊김"
              checked={a.email}
              onCheckedChange={(v) => patch({ email: v }, v ? "메일 알림을 켰어요" : "메일 알림을 껐어요")}
              suffix={<Switchmark />}
            />
          </List>
          <VStack gap="x1">
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              보내는 Gmail: {a.gmailUser}
            </Text>
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              받는 주소: {a.to || a.gmailUser}
            </Text>
            {a.fromEnv && (
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                서버 설정 파일(.env)의 GMAIL_USER·GMAIL_APP_PASSWORD로 정해져 있어요
              </Text>
            )}
          </VStack>
          {a.lastError ? (
            <Callout tone="critical" title="마지막 알림 메일을 보내지 못했어요" description={`${a.lastErrorAt ? `${fmtRelative(a.lastErrorAt)} · ` : ""}${a.lastError}`} />
          ) : a.lastSentAt ? (
            <Text textStyle="t3Regular" color="fg.neutralSubtle">
              마지막으로 보낸 메일: {fmtRelative(a.lastSentAt)}
            </Text>
          ) : null}
          <HStack gap="x2" wrap>
            <ActionButton size="small" variant="neutralWeak" loading={testing} onClick={test}>
              테스트 메일 보내기
            </ActionButton>
            {!a.fromEnv && (
              <>
                <ActionButton size="small" variant="ghost" onClick={() => setEditing(true)}>
                  계정 바꾸기
                </ActionButton>
                <ActionButton
                  size="small"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "메일 알림 계정을 지울까요?",
                      description: "저장한 Gmail 주소와 앱 비밀번호를 지우고 메일 알림을 꺼요.",
                      confirmLabel: "지우기",
                      danger: true,
                    });
                    if (ok) await patch({ gmailUser: "", to: "", email: false }, "메일 알림 계정을 지웠어요");
                  }}
                >
                  지우기
                </ActionButton>
              </>
            )}
          </HStack>
        </VStack>
      )}
    </Section>
  );
}

function AccountForm(props: {
  current: AlertSettings;
  configured: boolean;
  onSave: (v: { gmailUser: string; gmailAppPassword: string; to: string }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [user, setUser] = useState(props.current.gmailUser);
  const [pass, setPass] = useState("");
  const [to, setTo] = useState(props.current.to);
  const [saving, setSaving] = useState(false);
  const passClean = pass.replace(/\s/g, "");
  const userError = user.trim() && !EMAIL_RE.test(user.trim()) ? "Gmail 주소를 확인해 주세요 (예: name@gmail.com)" : null;
  const passError = passClean && !/^[a-z0-9]{16}$/i.test(passClean) ? `앱 비밀번호는 16자리예요 (지금 ${passClean.length}자리)` : null;
  const toError = to.trim() && !EMAIL_RE.test(to.trim()) ? "받는 주소를 확인해 주세요" : null;
  // 이미 저장한 비밀번호가 있으면 비워 둬도 그대로 써요
  const needPass = !props.configured || user.trim().toLowerCase() !== props.current.gmailUser;
  const canSave = !!user.trim() && (passClean.length === 16 || (!needPass && !passClean)) && !userError && !passError && !toError;

  return (
    <VStack gap="x4">
      <Callout
        tone="neutral"
        title="Gmail 앱 비밀번호가 필요해요"
        description="Google 계정 › 보안에서 2단계 인증을 켠 뒤 ‘앱 비밀번호’를 만들어 16자리를 붙여 넣어 주세요. 평소 쓰는 Gmail 비밀번호는 넣지 마세요."
      />
      <HStack>
        <ActionButton size="small" variant="neutralWeak" onClick={() => window.open(APP_PASSWORDS_URL, "_blank", "noopener")}>
          앱 비밀번호 만들기
          <SuffixIcon svg={<IconArrowUpRightLine />} />
        </ActionButton>
      </HStack>
      <div style={{ maxWidth: 420 }}>
        <VStack gap="x4">
          <TextInput label="보내는 Gmail 주소" type="email" placeholder="name@gmail.com" value={user} onChange={setUser} error={userError ?? undefined} />
          <TextInput
            label="앱 비밀번호"
            type="password"
            placeholder={props.configured && !needPass ? "바꾸지 않으려면 비워 두세요" : "abcd efgh ijkl mnop"}
            value={pass}
            onChange={setPass}
            error={passError ?? undefined}
            description={passError ? undefined : "이 PC의 캐롤DM 데이터 파일에만 저장되고 화면에는 다시 보이지 않아요"}
          />
          <TextInput
            label="받는 주소 (선택)"
            type="email"
            placeholder="비우면 보내는 Gmail로 받아요"
            value={to}
            onChange={setTo}
            error={toError ?? undefined}
          />
        </VStack>
      </div>
      <HStack gap="x2">
        <ActionButton
          variant="neutralSolid"
          disabled={!canSave}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            await props.onSave({ gmailUser: user.trim(), gmailAppPassword: passClean, to: to.trim() });
            setSaving(false);
          }}
        >
          {props.configured ? "저장" : "저장하고 알림 켜기"}
        </ActionButton>
        {props.onCancel && (
          <ActionButton variant="ghost" onClick={props.onCancel}>
            취소
          </ActionButton>
        )}
      </HStack>
    </VStack>
  );
}
