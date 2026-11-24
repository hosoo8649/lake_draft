import {
  IconBookLine,
  IconFlaskLine,
  IconGearLine,
  IconHouseLine,
  IconPaperclipLine,
  IconQuestionmarkCircleLine,
  IconSquare2StackedLine,
  IconTrophyLine,
} from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Layout, Text, VStack, useBreakpoint, Snackbar } from "@seed-design/react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import { Loading } from "./components/ui";
import { useAppState } from "./lib/appState";
import { AutomationDetailPage } from "./pages/AutomationDetail";
import { AutomationWizardPage } from "./pages/AutomationWizard";
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
    { label: "홈", path: "/", icon: <IconHouseLine />, match: (p: string) => p === "/" || p.startsWith("/automations") },
    { label: "템플릿", path: "/templates", icon: <IconSquare2StackedLine />, match: (p: string) => p.startsWith("/templates") },
    { label: "추첨", path: "/draws", icon: <IconTrophyLine />, match: (p: string) => p.startsWith("/draws") },
    { label: "링크", path: "/links", icon: <IconPaperclipLine />, match: (p: string) => p === "/links" },
    { label: "설정", path: "/settings", icon: <IconGearLine />, match: (p: string) => ["/settings", "/connect", "/help", "/simulator"].includes(p) },
  ];
  // 자동화·템플릿 만들기 같은 단계형 화면은 앱처럼 하단 탭 없이 전체 화면으로 보여요
  const flow = /^\/(automations\/(new|[^/]+\/edit)|templates\/(new|[^/]+\/edit))/.test(pathname);
  if (flow) return <>{children}</>;
  return (
    <div style={{ paddingBottom: 72 }}>
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
      <SideNavigationProvider>
        <SideNavigationRoot>
          <SideNavigationHeader>
            <HStack gap="x2" align="center" style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>💌</span>
              <Text textStyle="t5Bold">오토DM</Text>
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
        <SideNavigationInset>{children}</SideNavigationInset>
      </SideNavigationProvider>
    </Layout.Root>
  );
}

export function App() {
  const { state, needsLogin } = useAppState();
  const { pathname } = useLocation();
  if (needsLogin) return <LoginPage />;
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
