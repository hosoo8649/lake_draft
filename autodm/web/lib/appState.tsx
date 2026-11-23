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
}

interface Ctx {
  state?: AppStateData;
  reload: () => Promise<void>;
  links: LinkItem[];
}

const AppCtx = createContext<Ctx>({ reload: async () => {}, links: [] });

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { data, reload } = useApi<AppStateData>("/state");
  const links = useApi<LinkItem[]>("/links");
  return <AppCtx.Provider value={{ state: data, reload, links: links.data ?? [] }}>{children}</AppCtx.Provider>;
}

export const useAppState = () => useContext(AppCtx);
