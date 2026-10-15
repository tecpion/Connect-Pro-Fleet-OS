// Connect Pro Fleet — AI Workforce shared primitives (Build #47 UX polish).
//
// Small presentational helpers reused across the Overview / Approvals /
// Activity / Usage tabs. Keeps each tab file focused. No business logic.

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { CustomerAgentStatus } from "@/lib/agentWorkspaceSelectors";

/** A compact KPI card for the overview summary header. */
export function SummaryKpi({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "neutral" | "out" | "primary";
  hint?: string;
}) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl font-semibold",
          tone === "out" && "text-amber-600",
          tone === "primary" && "text-primary",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A small label/value metric used inside agent cards + run rows. */
export function MiniMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "out" | "primary";
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-medium",
          tone === "out" && "text-amber-600",
          tone === "primary" && "text-primary",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

const STATUS_TONES: Record<CustomerAgentStatus, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Paused: "bg-amber-100 text-amber-700",
  Disabled: "bg-surface-2 text-muted-foreground",
  Beta: "bg-blue-100 text-blue-700",
  "Coming Soon": "bg-surface-2 text-muted-foreground",
  "Upgrade Required": "bg-violet-100 text-violet-700",
};

/** Customer-facing agent status badge (never shows "framework-only"). */
export function CustomerStatusBadge({
  status,
}: {
  status: CustomerAgentStatus;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_TONES[status] ?? "bg-surface-2 text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

/** A ghost/outline button used for secondary actions in agent cards. */
export function GhostButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A primary button used for Run Now / Approve. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-press disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A small info banner (dev/provider honesty, cap reached, etc). */
export function InfoBanner({
  tone = "amber",
  children,
}: {
  tone?: "amber" | "emerald" | "blue";
  children: ReactNode;
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return (
    <div className={cn("rounded-md border px-4 py-2.5 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
