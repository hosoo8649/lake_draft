import { createContext, useContext, type ReactNode } from "react";
import type { AccountPublic, LinkItem, Settings } from "@shared/types";
import { useApi } from "./api";

export interface AppStateData {
  account: AccountPublic;
  settings: Settings;
  liveAvailable: boolean;
  publicBaseUrl: string;
  webhookUrl: string;
  redirectUri: string;
  /** AI 문구 변형을 쓸 수 있는지 (ANTHROPIC_API_KEY) */
  aiAvailable: boolean;
  /** 최근 24시간 인스타그램 제한 신호 수 */
  riskLevel: number;
}

interface Ctx {
  state?: AppStateData;
  /** 바깥(터널)에서 열었는데 로그인하지 않은 상태 */
  needsLogin: boolean;
  reload: () => Promise<void>;
  links: LinkItem[];
}

const AppCtx = createContext<Ctx>({ reload: async () => {}, links: [], needsLogin: false });

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { data, reload, error } = useApi<AppStateData>("/state");
  const links = useApi<LinkItem[]>("/links");
  const needsLogin = error?.status === 401;
  return <AppCtx.Provider value={{ state: data, reload, links: links.data ?? [], needsLogin }}>{children}</AppCtx.Provider>;
}

export const useAppState = () => useContext(AppCtx);
