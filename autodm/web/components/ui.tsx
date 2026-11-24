import { IconChevronLeftLine } from "@karrotmarket/react-monochrome-icon";
import { HStack, Icon, Text, VStack } from "@seed-design/react";
import type { CSSProperties, ReactNode } from "react";
import { Snackbar } from "@seed-design/react";
import { useNavigate } from "react-router-dom";
import { ActionButton } from "seed-design/ui/action-button";
import { Badge } from "seed-design/ui/badge";
import { ProgressCircle } from "seed-design/ui/progress-circle";
import { ResultSection } from "seed-design/ui/result-section";
import type { AutomationHealth, AutomationStatus, Post } from "@shared/types";
import { MEDIA_LABEL, STATUS_LABEL, STATUS_TONE } from "../lib/format";

export function PageHeader(props: {
  title: ReactNode;
  description?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  onBack?: () => void;
}) {
  const nav = useNavigate();
  return (
    <HStack justify="space-between" align="flex-start" gap="x4" pb="x6" wrap>
      <VStack gap="x1" style={{ minWidth: 0 }}>
        {props.back && (
          <HStack>
            <ActionButton
              layout="iconOnly"
              variant="ghost"
              size="medium"
              bleedX="asPadding"
              aria-label="뒤로"
              onClick={() => {
                if (props.onBack) props.onBack();
                else if (props.back === true) nav(-1);
                else nav(props.back as string);
              }}
            >
              <Icon svg={<IconChevronLeftLine />} />
            </ActionButton>
          </HStack>
        )}
        <Text as="h1" textStyle="t9Bold">
          {props.title}
        </Text>
        {props.description &&
          (typeof props.description === "string" ? (
            <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
              {props.description}
            </Text>
          ) : (
            props.description
          ))}
      </VStack>
      {props.actions && (
        <HStack gap="x2" wrap>
          {props.actions}
        </HStack>
      )}
    </HStack>
  );
}

export function Section(props: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flat?: boolean;
}) {
  return (
    <section className={props.flat ? "card card--flat" : "card"}>
      {(props.title || props.actions) && (
        <HStack
          justify="space-between"
          align="center"
          gap="x3"
          pb="x4"
          px={props.flat ? "x5" : 0}
          pt={props.flat ? "x5" : 0}
        >
          <VStack gap="x0_5">
            {props.title && (
              <Text as="h2" textStyle="t6Bold">
                {props.title}
              </Text>
            )}
            {props.description && (
              <Text textStyle="t3Regular" color="fg.neutralMuted">
                {props.description}
              </Text>
            )}
          </VStack>
          {props.actions}
        </HStack>
      )}
      {props.children}
    </section>
  );
}

export function StatTile(props: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <VStack
      className="card"
      gap="x1"
      style={{ padding: "var(--seed-dimension-x4)" }}
    >
      <Text textStyle="t3Medium" color="fg.neutralMuted">
        {props.label}
      </Text>
      <Text textStyle="t10Bold" className="stat-value">
        {props.value}
      </Text>
      {props.hint && (
        <Text textStyle="t2Regular" color="fg.neutralSubtle">
          {props.hint}
        </Text>
      )}
    </VStack>
  );
}

export function PostThumb({
  post,
  size = "md",
}: {
  post?: Post | null;
  size?: "xs" | "sm" | "md";
}) {
  const cls = size === "md" ? "thumb" : `thumb thumb--${size}`;
  if (!post) {
    return (
      <div className={cls} aria-label="다음 게시물">
        <span style={{ fontSize: size === "md" ? 40 : 20 }}>⏭️</span>
      </div>
    );
  }
  return (
    <div className={cls}>
      {post.thumbnailUrl ? (
        <img src={post.thumbnailUrl} alt="" loading="lazy" />
      ) : (
        <span>{post.emoji ?? "🖼️"}</span>
      )}
      {size === "md" && (
        <span className="thumb__badge">
          <Badge size="medium" variant="solid" tone="neutral">
            {MEDIA_LABEL[post.mediaType]}
          </Badge>
        </span>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: AutomationStatus }) {
  return (
    <Badge size="medium" variant="weak" tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function HealthText({ health }: { health: AutomationHealth }) {
  if (health.state === "ok")
    return (
      <VStack gap="x0_5">
        <Text textStyle="t3Medium" color="fg.positive">
          정상
        </Text>
        {health.reasons.map((r) => (
          <Text key={r} textStyle="t2Regular" color="fg.neutralMuted">
            · {r}
          </Text>
        ))}
      </VStack>
    );
  const label =
    health.state === "blocked"
      ? "발송 막힘"
      : health.state === "retrying"
        ? "일시 오류 · 재시도 중"
        : `확인 필요 · 실패 ${health.failedCount}건`;
  return (
    <VStack gap="x0_5">
      <Text
        textStyle="t3Bold"
        color={health.state === "retrying" ? "fg.warning" : "fg.critical"}
      >
        {label}
      </Text>
      {health.reasons.map((r) => (
        <Text key={r} textStyle="t2Regular" color="fg.neutralMuted">
          · {r}
        </Text>
      ))}
    </VStack>
  );
}

/** 빈 상태 — SEED ResultSection */
export function EmptyState(props: {
  emoji: string;
  title: ReactNode;
  description?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "brandSolid" | "neutralSolid" | "neutralWeak";
  };
}) {
  return (
    <VStack py="x8" px="x4">
      <ResultSection
        size="medium"
        asset={
          <span className="result-emoji" aria-hidden>
            {props.emoji}
          </span>
        }
        title={props.title}
        description={props.description}
        primaryActionProps={
          props.action
            ? {
                children: props.action.label,
                onClick: props.action.onClick,
                variant: props.action.variant ?? "neutralSolid",
              }
            : undefined
        }
      />
    </VStack>
  );
}

/** 아이콘만 있는 버튼 — SEED ActionButton(iconOnly, ghost) */
export function IconBtn(props: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <ActionButton
      layout="iconOnly"
      variant="ghost"
      size="small"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon svg={props.icon} />
    </ActionButton>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Loading() {
  return (
    <VStack align="center" py="x10" role="status" aria-label="불러오는 중">
      <ProgressCircle size="40" tone="neutral" />
    </VStack>
  );
}

/** 화면 아래 고정 버튼 영역 — 알림(스낵바)이 버튼을 가리지 않도록 그 위에 떠요 */
export function FooterBar(props: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Snackbar.AvoidOverlap>
      <div className="footer-bar" style={props.style}>
        {props.children}
      </div>
    </Snackbar.AvoidOverlap>
  );
}
