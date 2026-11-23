import { Text, VStack } from "@seed-design/react";
import { useState } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import { Callout } from "seed-design/ui/callout";
import { TextInput } from "../components/fields";
import { ApiError, api } from "../lib/api";

/** 터널·다른 기기에서 관리 화면을 열었을 때 */
export function LoginPage() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/login", { body: { password: pw } });
      window.location.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.details[0] : "로그인하지 못했어요");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page page--narrow">
      <div className="hero">
        <div className="hero__emoji">🔒</div>
        <Text as="h1" textStyle="t9Bold">
          관리자 로그인
        </Text>
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted" style={{ marginTop: 8 }}>
          이 PC가 아닌 곳(터널 주소·다른 기기)에서 열었어요. 관리자 비밀번호를 넣어 주세요.
        </Text>
      </div>
      <VStack gap="x4" className="card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <TextInput label="관리자 비밀번호" type="password" value={pw} onChange={setPw} onEnter={submit} error={err ?? undefined} autoFocus />
        <ActionButton variant="brandSolid" size="large" loading={busy} disabled={!pw} onClick={submit}>
          로그인
        </ActionButton>
        <Callout
          tone="neutral"
          description="비밀번호는 서버를 켤 때 콘솔에 보이고, 이 PC에서 연 화면의 설정 › 관리자 비밀번호에서도 볼 수 있어요. .env의 ADMIN_PASSWORD로 직접 정할 수도 있어요."
        />
      </VStack>
    </div>
  );
}
