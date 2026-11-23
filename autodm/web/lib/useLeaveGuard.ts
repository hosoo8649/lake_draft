import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { useConfirm } from "../components/feedback";

/**
 * 만들던 내용이 있을 때 다른 화면으로 나가려 하면 한 번 더 물어요.
 * 브라우저 탭을 닫을 때도 경고해요. allowNext()를 부르면 바로 다음 이동은 묻지 않아요.
 */
export function useLeaveGuard(when: boolean, opts: { title: string; description: string; confirmLabel?: string }) {
  const confirm = useConfirm();
  const bypass = useRef(false);
  const whenRef = useRef(when);
  whenRef.current = when;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypass.current) {
      bypass.current = false;
      return false;
    }
    return whenRef.current && currentLocation.pathname !== nextLocation.pathname;
  });
  const asking = useRef(false);

  useEffect(() => {
    if (blocker.state !== "blocked" || asking.current) return;
    asking.current = true;
    void confirm({ title: opts.title, description: opts.description, confirmLabel: opts.confirmLabel ?? "나가기" }).then((ok) => {
      asking.current = false;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm, opts.title, opts.description, opts.confirmLabel]);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);

  return useCallback(() => {
    bypass.current = true;
  }, []);
}
