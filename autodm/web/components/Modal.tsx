import { ResponsivePair, Snackbar } from "@seed-design/react";
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
  primary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    loading?: boolean;
  };
  secondary?: { label: string; onClick: () => void };
  footer?: ReactNode;
  /** 넓은 다이얼로그 (두 칸 편집 화면) */
  wide?: boolean;
}) {
  return (
    <ResponsiveDialogRoot
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      dialogRootProps={{ size: props.wide ? "large" : "medium" }}
    >
      <ResponsiveDialogContent
        title={props.title || undefined}
        aria-label={
          typeof props.title === "string" && props.title
            ? undefined
            : "대화상자"
        }
        description={props.description}
        // 아래에 '취소' 버튼이 있으면 위의 ✕는 숨겨요 (SEED dialog: 닫기 수단을 겹쳐 두지 않기)
        showCloseButton={!props.primary}
      >
        {/* 스크롤은 SEED Dialog/BottomSheet Body가 맡아요 */}
        <ResponsiveDialogBody>{props.children}</ResponsiveDialogBody>
        {(props.primary || props.footer) && (
          <ResponsiveDialogFooter>
            {/* 알림이 창의 버튼을 가리지 않게 */}
            <Snackbar.AvoidOverlap>
              <div style={{ width: "100%" }}>
                {props.footer ?? (
                  <ResponsivePair gap="x2">
                    <ActionButton
                      variant="neutralWeak"
                      onClick={props.secondary?.onClick ?? props.onClose}
                    >
                      {props.secondary?.label ?? "취소"}
                    </ActionButton>
                    <ActionButton
                      variant={
                        props.primary!.danger ? "criticalSolid" : "neutralSolid"
                      }
                      disabled={props.primary!.disabled}
                      loading={props.primary!.loading}
                      onClick={props.primary!.onClick}
                    >
                      {props.primary!.label}
                    </ActionButton>
                  </ResponsivePair>
                )}
              </div>
            </Snackbar.AvoidOverlap>
          </ResponsiveDialogFooter>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialogRoot>
  );
}
