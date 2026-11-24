import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    public details: string[],
    public status: number,
  ) {
    super(message);
  }
}

/* ───────────── 서버 연결 상태 ───────────── */

/** 서버(PC의 캐롤DM)에 닿지 않을 때 보여 줄 말 */
export const OFFLINE_MESSAGE = "캐롤DM 서버에 연결하지 못했어요. PC에서 캐롤DM이 켜져 있는지 확인해 주세요";

let offline = false;
const connListeners = new Set<(offline: boolean) => void>();
let probe: ReturnType<typeof setInterval> | null = null;

/** 서버가 응답하는지 한 번 확인 — 로그인 필요(401)도 서버는 켜져 있는 거예요 */
async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch("/api/session", { headers: { "X-AutoDM": "1" } });
    return r.ok || r.status === 401;
  } catch {
    return false;
  }
}

function setOffline(v: boolean) {
  if (offline === v) return;
  offline = v;
  for (const l of connListeners) l(v);
  if (v) {
    // 끊긴 동안 몇 초마다 다시 확인해요
    if (!probe)
      probe = setInterval(async () => {
        if (await serverUp()) setOffline(false);
      }, 4000);
    return;
  }
  if (probe) clearInterval(probe);
  probe = null;
  // 다시 연결되면 실시간 연결을 새로 맺고 화면 데이터를 새로 불러와요
  if (source) {
    source.close();
    source = null;
    ensureSource();
  }
  for (const l of listeners) l();
}

/** 서버와 연결이 끊겼는지 — 끊기면 화면 위에 알림을 띄워요 */
export function useOffline(): boolean {
  const [v, setV] = useState(offline);
  useEffect(() => {
    connListeners.add(setV);
    setV(offline);
    return () => void connListeners.delete(setV);
  }, []);
  return v;
}

/** 서버가 꺼졌거나(네트워크 오류) 터널·개발 서버가 대신 답한 경우(502·503·504) */
const isGatewayError = (status: number) => status === 502 || status === 503 || status === 504;

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      // X-AutoDM: 다른 웹사이트가 몰래 보내는 요청과 구분하는 표시
      headers: { "X-AutoDM": "1", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    setOffline(true);
    throw new ApiError(OFFLINE_MESSAGE, [OFFLINE_MESSAGE], 0);
  }
  const json = await res.json().catch(() => ({}));
  if (isGatewayError(res.status) && !(json as { error?: string }).error) {
    setOffline(true);
    throw new ApiError(OFFLINE_MESSAGE, [OFFLINE_MESSAGE], res.status);
  }
  setOffline(false);
  if (!res.ok) {
    const j = json as { error?: string; details?: string[] };
    throw new ApiError(j.error ?? `요청 실패 (${res.status})`, j.details ?? [j.error ?? ""], res.status);
  }
  return json as T;
}

/* ───────────── 서버 변경 알림 (SSE) ───────────── */

type Listener = () => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

/** 화면을 보고만 있어도 끊긴 걸 알 수 있게, 보이는 동안 15초마다 가볍게 확인해요 */
let heartbeat: ReturnType<typeof setInterval> | null = null;
function startHeartbeat() {
  if (heartbeat || typeof window === "undefined") return;
  heartbeat = setInterval(async () => {
    if (offline || document.visibilityState !== "visible") return;
    if (!(await serverUp())) setOffline(true);
  }, 15_000);
}

function ensureSource() {
  startHeartbeat();
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/events");
  source.onmessage = () => {
    for (const l of listeners) l();
  };
  source.onopen = () => setOffline(false);
  // 실시간 연결이 끊기면 서버가 꺼졌는지 바로 확인해요
  source.onerror = async () => {
    if (!(await serverUp())) setOffline(true);
  };
}

export function onServerChange(fn: Listener): () => void {
  ensureSource();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 화면에서 쓰는 데이터 훅 — 서버가 바뀌면 자동으로 다시 불러와요 */
export function useApi<T>(path: string | null, opts: { live?: boolean } = { live: true }) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    try {
      const d = await api<T>(p);
      if (pathRef.current === p) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (pathRef.current === p) setError(e as ApiError);
    } finally {
      if (pathRef.current === p) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(!!path);
    void reload();
  }, [path, reload]);

  useEffect(() => {
    if (!opts.live) return;
    return onServerChange(() => void reload());
  }, [opts.live, reload]);

  return { data, error, loading, reload, setData };
}

/** 캐러셀 이미지 올리기 → /uploads/... 주소 */
export async function uploadImage(file: File): Promise<string> {
  const res = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": file.type, "X-AutoDM": "1" }, body: file });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; details?: string[] };
  if (!res.ok || !json.url) throw new ApiError(json.error ?? "이미지를 올리지 못했어요", json.details ?? [json.error ?? "이미지를 올리지 못했어요"], res.status);
  return json.url;
}
