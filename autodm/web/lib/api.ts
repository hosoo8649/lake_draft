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

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
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

function ensureSource() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/events");
  source.onmessage = () => {
    for (const l of listeners) l();
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
