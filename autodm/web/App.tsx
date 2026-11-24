import {
  IconBookLine,
  IconFlaskLine,
  IconGearLine,
  IconHouseLine,
  IconMegaphoneLine,
  IconPaperclipLine,
  IconQuestionmarkCircleLine,
  IconSquare2StackedLine,
  IconTrophyLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Layout, Text, VStack, useBreakpoint, Snackbar } from "@seed-design/react";
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { Badge } from "seed-design/ui/badge";
import {
  SideNavigationContent,
  SideNavigationFooter,
  SideNavigationGroup,
  SideNavigationHeader,
  SideNavigationInset,
  SideNavigationItemButton,
  SideNavigationProvider,
  SideNavigationRoot,
  SideNavigationTrigger,
} from "seed-design/ui/side-navigation";
import { Avatar } from "./components/dm/Phone";
import { EmptyState, Loading } from "./components/ui";
import { useOffline } from "./lib/api";
import { useAppState } from "./lib/appState";
import { AutomationDetailPage } from "./pages/AutomationDetail";
import { AutomationWizardPage } from "./pages/AutomationWizard";
import { BroadcastsPage } from "./pages/Broadcasts";
import { ConnectConfirmPage, ConnectPage } from "./pages/Connect";
import { DrawsPage } from "./pages/Draws";
import { HelpPage } from "./pages/Help";
import { HomePage } from "./pages/Home";
import { LinksPage } from "./pages/Links";
import { LoginPage } from "./pages/Login";
import { SettingsPage } from "./pages/Settings";
import { SimulatorPage } from "./pages/Simulator";
import { TemplateEditorPage } from "./pages/TemplateEditor";
import { TemplatesPage } from "./pages/Templates";

/** 좁은 화면(휴대폰·앱)에서는 하단 탭으로 이동해요 */
function MobileShell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const tabs = [
    { label: "홈", path: "/", icon: <IconHouseLine />, match: (p: string) => p === "/" || p.startsWith("/automations") || p === "/broadcasts" },
    { label: "템플릿", path: "/templates", icon: <IconSquare2StackedLine />, match: (p: string) => p.startsWith("/templates") },
    { label: "추첨", path: "/draws", icon: <IconTrophyLine />, match: (p: string) => p.startsWith("/draws") },
    { label: "링크", path: "/links", icon: <IconPaperclipLine />, match: (p: string) => p === "/links" },
    { label: "설정", path: "/settings", icon: <IconGearLine />, match: (p: string) => ["/settings", "/connect", "/help", "/simulator"].includes(p) },
  ];
  // 자동화·템플릿 만들기 같은 단계형 화면은 앱처럼 하단 탭 없이 전체 화면으로 보여요
  const flow = /^\/(automations\/(new|[^/]+\/edit)|templates\/(new|[^/]+\/edit))/.test(pathname);
  if (flow) return <>{children}</>;
  return (
    <div className="has-tabbar" style={{ paddingBottom: 72 }}>
      {children}
      <Snackbar.AvoidOverlap>
        <nav className="tabbar" aria-label="주요 메뉴">
          {tabs.map((t) => (
            <button
              key={t.path}
              type="button"
              data-current={t.match(pathname)}
              aria-current={t.match(pathname) ? "page" : undefined}
              onClick={() => nav(t.path)}
            >
              <Icon svg={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </Snackbar.AvoidOverlap>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { state } = useAppState();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const bp = useBreakpoint();
  const acc = state?.account;
  if (bp === "base" || bp === "sm") return <MobileShell>{children}</MobileShell>;
  const item = (label: string, path: string, icon: React.ReactNode, match?: (p: string) => boolean) => ({
    label,
    prefixIcon: icon,
    current: match ? match(pathname) : pathname === path,
    onClick: () => nav(path),
  });

  return (
    <Layout.Root>
      {/* 키보드 사용자는 메뉴 9개를 건너뛰고 바로 본문으로 */}
      <a href="#main" className="skip-link">
        본문으로 건너뛰기
      </a>
      <SideNavigationProvider>
        <SideNavigationRoot>
          <SideNavigationHeader>
            <HStack gap="x2" align="center" style={{ flex: 1, minWidth: 0 }}>
              <BrandMark />
              <Text textStyle="t6Bold" className="brand-name">
                캐롤DM
              </Text>
            </HStack>
            <SideNavigationTrigger />
          </SideNavigationHeader>
          <SideNavigationContent>
            {acc?.connected && (
              <div className="sidebar-account">
                <Avatar name={acc.username} />
                <VStack gap="x0_5" style={{ minWidth: 0 }}>
                  <Text textStyle="t4Bold" maxLines={1}>
                    @{acc.username}
                  </Text>
                  <HStack gap="x1">
                    <Badge size="medium" variant="weak" tone={acc.mode === "demo" ? "warning" : "positive"}>
                      {acc.mode === "demo" ? "데모" : "인스타그램 연동"}
                    </Badge>
                    {state?.settings.dmPaused && (
                      <Badge size="medium" variant="weak" tone="critical">
                        일시 중지
                      </Badge>
                    )}
                  </HStack>
                </VStack>
              </div>
            )}
            <SideNavigationGroup
              items={[
                item("홈", "/", <IconHouseLine />, (p) => p === "/" || p.startsWith("/automations")),
                item("내 템플릿", "/templates", <IconSquare2StackedLine />, (p) => p.startsWith("/templates")),
                item("단체 DM", "/broadcasts", <IconMegaphoneLine />),
                item("댓글 추첨", "/draws", <IconTrophyLine />, (p) => p.startsWith("/draws")),
                item("내 링크", "/links", <IconPaperclipLine />),
              ]}
            />
            <SideNavigationGroup
              label="도구"
              items={[
                ...(acc?.mode === "demo" ? [item("시뮬레이터", "/simulator", <IconFlaskLine />)] : []),
                item("도움말", "/help", <IconQuestionmarkCircleLine />, (p) => p.startsWith("/help")),
              ]}
            />
          </SideNavigationContent>
          <SideNavigationFooter>
            <SideNavigationItemButton prefixIcon={<IconBookLine />} label="연동·계정" current={pathname.startsWith("/connect")} onClick={() => nav("/connect")} />
            <SideNavigationItemButton prefixIcon={<IconGearLine />} label="설정" current={pathname === "/settings"} onClick={() => nav("/settings")} />
          </SideNavigationFooter>
        </SideNavigationRoot>
        <SideNavigationInset>
          <main id="main" tabIndex={-1} style={{ outline: "none" }}>
            {children}
          </main>
        </SideNavigationInset>
      </SideNavigationProvider>
    </Layout.Root>
  );
}

/** 처음 열 때 서버에 닿지 못하면 — 끝없는 로딩 대신 이유와 다시 시도 (몇 초마다 저절로 다시 확인해요) */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  useEffect(() => {
    const t = setInterval(onRetry, 5000);
    return () => clearInterval(t);
  }, [onRetry]);
  return (
    <div className="page page--narrow">
      <EmptyState
        emoji="🔌"
        title="캐롤DM 서버에 연결할 수 없어요"
        description="PC에서 캐롤DM이 켜져 있는지 확인해 주세요. 휴대폰에서 터널 주소로 열었다면 PC가 절전 모드가 아닌지도 확인해 주세요. 연결되면 저절로 열려요."
        action={{ label: "다시 시도", onClick: onRetry }}
      />
    </div>
  );
}

/** 쓰는 도중 서버와 끊기면 화면 위에 알려요 — 다시 연결되면 저절로 사라지고 새로 불러와요 */
function OfflineBar() {
  const offline = useOffline();
  const { state } = useAppState();
  // 처음부터 못 열린 경우는 화면 전체로 알려서 띠는 띄우지 않아요
  if (!offline || !state) return null;
  return (
    <div className="offline-bar" role="status" aria-live="polite">
      <ProgressCircle size="24" tone="staticWhite" />
      서버와 연결이 끊겼어요 · 다시 연결하는 중
    </div>
  );
}

export function App() {
  return (
    <>
      <OfflineBar />
      <AppRoutes />
    </>
  );
}

function AppRoutes() {
  const { state, needsLogin, loadError, reload } = useAppState();
  const { pathname } = useLocation();
  if (needsLogin) return <LoginPage />;
  if (!state && loadError) return <OfflineScreen onRetry={reload} />;
  if (!state) return <Loading />;
  const connected = state.account.connected;
  if (!connected && !pathname.startsWith("/connect")) return <Navigate to="/connect" replace />;
  if (!connected) {
    return (
      <Routes>
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/connect/confirm" element={<ConnectConfirmPage />} />
        <Route path="*" element={<Navigate to="/connect" replace />} />
      </Routes>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/automations/new" element={<AutomationWizardPage mode="create" />} />
        <Route path="/automations/:id" element={<AutomationDetailPage />} />
        <Route path="/automations/:id/edit" element={<AutomationWizardPage mode="edit" />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/new" element={<TemplateEditorPage />} />
        <Route path="/templates/:id/edit" element={<TemplateEditorPage />} />
        <Route path="/broadcasts" element={<BroadcastsPage />} />
        <Route path="/draws" element={<DrawsPage />} />
        <Route path="/links" element={<LinksPage />} />
        <Route path="/simulator" element={<SimulatorPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/connect/confirm" element={<ConnectConfirmPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

/** 캐롤DM 로고 — 말풍선 안의 음표 */
function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.2 3.6c-.5.4-1.3 0-1.3-.6V16A3.5 3.5 0 0 1 4 12.5z"
          fill="currentColor"
        />
        <path d="M13.6 6.2v4.9a1.6 1.6 0 1 1-1-1.5V7.4l-2 .5v4.1a1.6 1.6 0 1 1-1-1.5V7.1z" fill="var(--seed-color-bg-brand-solid)" />
      </svg>
    </span>
  );
}
