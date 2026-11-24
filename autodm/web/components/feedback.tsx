import { ResponsivePair } from "@seed-design/react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogRoot,
  AlertDialogTitle,
} from "seed-design/ui/alert-dialog";
import { Snackbar, SnackbarProvider, useSnackbarAdapter } from "seed-design/ui/snackbar";
import { ApiError } from "../lib/api";

/* ───────────── 토스트 (Snackbar) ───────────── */

type ToastFn = (message: string, variant?: "default" | "positive" | "critical") => void;
const ToastCtx = createContext<ToastFn>(() => {});
const DismissCtx = createContext<() => void>(() => {});

function ToastBridge({ children }: { children: ReactNode }) {
  const adapter = useSnackbarAdapter();
  const toast = useCallback<ToastFn>(
    (message, variant = "default") => {
      adapter.create({ timeout: 3000, strategy: "immediate", render: () => <Snackbar variant={variant} message={message} /> });
    },
    [adapter],
  );
  const dismiss = useCallback(() => adapter.dismiss(), [adapter]);
  return (
    <ToastCtx.Provider value={toast}>
      <DismissCtx.Provider value={dismiss}>{children}</DismissCtx.Provider>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
/** 떠 있는 알림 닫기 (단계를 넘기거나 오류를 고쳤을 때) */
export const useDismissToast = () => useContext(DismissCtx);

/** API 오류를 토스트로 */
export function useErrorToast() {
  const toast = useToast();
  return useCallback(
    (e: unknown) => {
      const msg = e instanceof ApiError ? e.details[0] || e.message : (e as Error)?.message ?? "오류가 발생했어요";
      toast(msg, "critical");
    },
    [toast],
  );
}

/* ───────────── 확인 다이얼로그 ───────────── */

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);

function ConfirmHost({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<(v: boolean) => void>(() => {});

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    setOpen(false);
    resolver.current(v);
    resolver.current = () => {};
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertDialogRoot open={open} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <ResponsivePair gap="x2">
              <ActionButton variant="neutralWeak" onClick={() => close(false)}>
                {opts?.cancelLabel ?? "취소"}
              </ActionButton>
              <ActionButton variant={opts?.danger ? "criticalSolid" : "neutralSolid"} onClick={() => close(true)}>
                {opts?.confirmLabel ?? "확인"}
              </ActionButton>
            </ResponsivePair>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider>
      <ToastBridge>
        <ConfirmHost>{children}</ConfirmHost>
      </ToastBridge>
    </SnackbarProvider>
  );
}
