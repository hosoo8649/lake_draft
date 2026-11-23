import { ResponsivePair } from "@seed-design/react";
import type { ReactNode } from "react";
import { ActionButton } from "seed-design/ui/action-button";
import {
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogRoot,
} from "seed-design/ui/responsive-dialog";

/** PC에서는 다이얼로그, 좁은 화면(앱)에서는 바텀시트로 열려요 */
export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** 확인 버튼 */
  primary?: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; loading?: boolean };
  secondary?: { label: string; onClick: () => void };
  footer?: ReactNode;
}) {
  return (
    <ResponsiveDialogRoot open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <ResponsiveDialogContent title={props.title} description={props.description}>
        <ResponsiveDialogBody>
          <div style={{ maxHeight: "min(64vh, 640px)", overflowY: "auto", padding: "2px 2px 8px" }}>{props.children}</div>
        </ResponsiveDialogBody>
        {(props.primary || props.footer) && (
          <ResponsiveDialogFooter>
            {props.footer ?? (
              <ResponsivePair gap="x2">
                <ActionButton variant="neutralWeak" onClick={props.secondary?.onClick ?? props.onClose}>
                  {props.secondary?.label ?? "취소"}
                </ActionButton>
                <ActionButton
                  variant={props.primary!.danger ? "criticalSolid" : "neutralSolid"}
                  disabled={props.primary!.disabled}
                  loading={props.primary!.loading}
                  onClick={props.primary!.onClick}
                >
                  {props.primary!.label}
                </ActionButton>
              </ResponsivePair>
            )}
          </ResponsiveDialogFooter>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialogRoot>
  );
}
