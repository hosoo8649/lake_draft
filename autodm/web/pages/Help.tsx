import { HStack, Text, VStack } from "@seed-design/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "seed-design/ui/accordion";
import { SegmentedControl, SegmentedControlItem } from "seed-design/ui/segmented-control";
import { PageHeader, Section } from "../components/ui";

type Tab = "guide" | "dm" | "connect";

const DM_ITEMS: { title: string; body: string[] }[] = [
  {
    title: "1. 다른 자동 DM 서비스 연결이 남아 있어요",
    body: [
      "예전에 다른 자동화 서비스를 썼다면 인스타그램이 댓글·메시지 이벤트를 그쪽으로 보내고 있을 수 있어요.",
      "인스타그램 설정 › 웹사이트 권한 › 앱 및 웹사이트에서 이 앱만 활성 상태인지 확인하고, 다른 서비스는 연결을 해제해 주세요.",
    ],
  },
  {
    title: "2. 팔로우 확인 뒤 본 DM이 오지 않아요",
    body: [
      "Facebook 설정 › 연결된 계정에서 인스타그램과 연결된 페이지가 맞는지 확인해 주세요 (PC).",
      "Meta 비즈니스 설정의 ‘대화 라우팅’에서 기본 라우팅 앱이 없거나 이 앱으로 되어 있어야 해요.",
      "인스타그램 앱 설정 › 메시지 › ‘연결된 도구’의 메시지 액세스 허용이 켜져 있어야 해요.",
      "팬이 인스타그램 웹(브라우저)으로 보는 경우 팔로우 확인 버튼이 인스타그램 자체 제한으로 동작하지 않을 수 있어요.",
    ],
  },
  {
    title: "3. 특정 게시물에서만 안 돼요 (제한된 콘텐츠)",
    body: [
      "연령·국가 제한, 민감한 콘텐츠로 분류된 게시물은 외부 서비스가 댓글 정보를 받을 수 없어 댓글 DM이 동작하지 않아요.",
      "확인 방법: 시크릿 창에서 게시물 링크를 열었을 때 게시물이 안 보이거나, 연령 안내·로그인 요구가 뜨면 제한된 상태예요.",
      "지금 댓글 단 분들께는 일괄 발송으로 보낼 수 있는 경우가 많아요 (최근 7일, 아직 DM을 받지 않은 댓글).",
      "앞으로는 DM 공유·DM 코드 답장을 켜 두세요. 제한 상태에서도 동작해요.",
    ],
  },
  {
    title: "4. 다음 게시물 자동화가 엉뚱한 게시물에 연결됐어요",
    body: ["다음 게시물 자동화는 새 게시물 중 가장 먼저 댓글이 달린 게시물에 연결돼요. 홈에서 지금 어느 게시물에 연결됐는지 확인해 주세요."],
  },
  {
    title: "5. ‘순차 발송중’이라고 떠요",
    body: [
      "인스타그램은 계정마다 일정 시간 동안 보낼 수 있는 DM 수를 제한해요. 넘는 만큼은 누락되지 않게 대기열에 두고 차례로 보내요.",
      "그동안 전송 수가 바로 늘지 않을 수 있어요. 잠시 뒤 다시 확인해 주세요. 한도는 설정 › 발송 한도에서 조정할 수 있어요.",
    ],
  },
  {
    title: "6. DM이 요청함·숨겨진 요청함으로 갔어요",
    body: [
      "나를 팔로우하지 않거나 대화한 적이 없는 사람에게는 DM이 ‘요청’ 폴더로 갈 수 있어요. 특정 단어가 들어가면 ‘숨겨진 요청’으로 갈 수도 있어요.",
      "팬에게 요청·숨겨진 요청 폴더를 확인하도록 안내해 주세요. 같은 문제가 반복되면 DM 문구에 제한될 만한 표현이 없는지 살펴 주세요.",
    ],
  },
  {
    title: "7. 받는 사람 설정이나 인스타그램 정책으로 막혔어요",
    body: [
      "받는 사람이 메시지 요청을 막았거나, 청소년 계정이면서 팔로우 관계가 아니거나, 나를 차단·제한한 경우에는 보낼 수 없어요.",
      "내 계정이 스팸 활동으로 일시 제한된 경우에도 자동·수동 DM이 모두 막혀요.",
    ],
  },
  {
    title: "8. 기본 설정을 다시 확인해 주세요",
    body: [
      "본인 계정이 단 댓글에는 DM이 가지 않아요 — 테스트는 다른 계정으로 해 주세요.",
      "같은 사람에게는 자동화마다 한 번만 보내요. 같은 계정으로 여러 번 댓글을 달면 처음 한 번만 받아요.",
      "자동화를 만든 뒤에 달린 댓글인지(지난 댓글은 일괄 발송으로), 키워드가 맞는지, 자동화 스위치와 설정의 운영 스위치가 켜져 있는지 확인해 주세요.",
    ],
  },
  {
    title: "9. 그래도 안 되면 다시 연동해요",
    body: ["연동·계정 › 다시 연동하기를 눌러 주세요. 같은 계정으로 다시 연동하면 자동화와 데이터는 그대로 유지돼요. ‘연동 해지’는 모든 자동화를 지우니 주의하세요."],
  },
];

const CONNECT_ITEMS: { title: string; body: string[] }[] = [
  {
    title: "개인 계정도 연동할 수 있나요?",
    body: ["인스타그램 연동에는 프로페셔널(크리에이터·비즈니스) 계정이 필요해요. 인스타그램 설정에서 무료로 전환할 수 있어요."],
  },
  {
    title: "다른 계정으로 연동됐어요",
    body: [
      "로그인할 때 이메일·전화번호로 들어가면 인스타그램이 다른 계정을 골라 연동하는 경우가 있어요.",
      "연동·계정 › 다시 연동하기를 누르고, 로그인 칸에 @를 뺀 인스타그램 아이디를 직접 입력해 주세요. (예: @my_shop → my_shop)",
    ],
  },
  {
    title: "연결이 자꾸 끊겨요",
    body: [
      "인스타그램은 보안을 위해 외부 서비스 연결 권한을 주기적으로 확인해요. 비밀번호·보안 설정을 바꾸면 더 빨리 끊길 수 있어요.",
      "끊기면 홈에 안내가 떠요. 같은 계정으로 다시 연동하면 기존 자동화와 데이터는 그대로예요. 연결 토큰은 만료 전에 자동으로 갱신해요.",
    ],
  },
  {
    title: "연동 중에 code 400 오류가 떠요",
    body: ["인스타그램 계정 센터 › 내 정보 및 권한 › ‘Meta 테크놀로지 외부의 활동’에서 향후 활동 연결을 해제했다가 다시 연결해 주세요."],
  },
  {
    title: "권한 화면에서 일부만 허용했어요",
    body: ["프로필·미디어, 댓글, 메시지, 콘텐츠, 인사이트 권한을 모두 허용해야 자동 DM이 정상 동작해요. 다시 연동하기로 권한을 다시 받아 주세요."],
  },
  {
    title: "로그인·웹훅 주소를 모르겠어요",
    body: ["설정 › 공개 주소에 터널 주소를 넣으면 Meta 개발자 앱에 넣을 OAuth 리디렉션 주소와 웹훅 주소가 보여요. 자세한 순서는 README의 ‘실제 인스타그램 연동’을 참고해 주세요."],
  },
];

function FaqList({ items }: { items: { title: string; body: string[] }[] }) {
  return (
    <Accordion multiple>
      {items.map((it) => (
        <AccordionItem key={it.title} value={it.title}>
          <AccordionTrigger title={it.title} />
          <AccordionContent>
            <VStack gap="x2" pb="x2">
              {it.body.map((b) => (
                <Text key={b} as="p" textStyle="t4Regular" color="fg.neutralMuted">
                  · {b}
                </Text>
              ))}
            </VStack>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

const GUIDE_STEPS = [
  { n: 1, title: "인스타그램 연동", body: "연동·계정에서 프로페셔널 계정을 연동해요. Meta 앱 없이도 데모로 모든 기능을 먼저 써 볼 수 있어요.", to: "/connect", cta: "연동·계정" },
  { n: 2, title: "자동 DM 만들기", body: "홈 › 자동화 추가 → 게시물 → 템플릿 → 최종 확인(댓글 조건·DM·추가 기능) → 발송 시점(즉시·예약·일괄)을 골라 등록해요.", to: "/automations/new", cta: "자동화 추가" },
  { n: 3, title: "템플릿으로 저장", body: "자주 쓰는 DM과 설정은 내 템플릿으로 저장해 두면 다음부터 고르기만 하면 돼요.", to: "/templates", cta: "내 템플릿" },
  { n: 4, title: "결과 보고 관리하기", body: "홈에서 전송·읽음·클릭과 최근 7일 추이를 보고, 자동화 상세에서 최근 24시간 발송 상태와 실패 이유를 확인해요.", to: "/", cta: "홈" },
  { n: 5, title: "댓글 추첨", body: "이벤트 게시물 댓글에서 당첨자를 무작위로 뽑고, 발표 글을 복사해 바로 올려요.", to: "/draws", cta: "댓글 추첨" },
];

export function HelpPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "guide";
  return (
    <div className="page page--narrow">
      <PageHeader title="도움말" description="이용 방법과 DM·연동 문제 해결 방법을 모았어요" />
      <VStack gap="x4">
        <SegmentedControl aria-label="도움말 종류" value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <SegmentedControlItem value="guide">가이드</SegmentedControlItem>
          <SegmentedControlItem value="dm">DM 발송</SegmentedControlItem>
          <SegmentedControlItem value="connect">연동</SegmentedControlItem>
        </SegmentedControl>
        {tab === "guide" && (
          <Section title="시작 순서">
            <VStack gap="x3">
              {GUIDE_STEPS.map((s) => (
                <HStack key={s.n} gap="x3" align="flex-start" className="guide-box" wrap>
                  <span className="step-num" data-active="true">
                    {s.n}
                  </span>
                  <VStack gap="x1" grow style={{ flexBasis: 200 }}>
                    <Text textStyle="t5Bold">{s.title}</Text>
                    <Text textStyle="t3Regular" color="fg.neutralMuted">
                      {s.body}
                    </Text>
                  </VStack>
                  <ActionButton size="small" variant="neutralWeak" onClick={() => nav(s.to)}>
                    {s.cta}
                  </ActionButton>
                </HStack>
              ))}
              <HStack>
                <ActionButton variant="ghost" size="small" onClick={() => nav("/?tour=1")}>
                  둘러보기 다시 보기 →
                </ActionButton>
              </HStack>
            </VStack>
          </Section>
        )}
        {tab === "dm" && (
          <Section title="DM이 전송되지 않아요" description="원인은 다양해요. 아래 항목을 순서대로 확인해 보세요.">
            <FaqList items={DM_ITEMS} />
          </Section>
        )}
        {tab === "connect" && (
          <Section title="연동이 정상적으로 되지 않아요">
            <FaqList items={CONNECT_ITEMS} />
          </Section>
        )}
      </VStack>
    </div>
  );
}
