// Connect Pro Fleet — Daily Briefing presentational primitives (Build #36).
//
// Small, reusable display components for the Daily Briefing page. They use
// semantic design tokens only (no raw colors) and reuse the BriefingItem shape
// from the Build #28 composer. No business logic lives here.

import type { Dispatch, SetStateAction } from "react";
import { Link } from "@/lib/router-compat";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BriefingPriority } from "@/lib/briefingTypes";
import { ArrowRight, CircleDot } from "lucide-react";

export const PRIORITY_TONE: Record<BriefingPriority, string> = {
  critical: "border-l-status-out bg-status-out/5",
  high: "border-l-status-maintenance bg-status-maintenance/5",
  medium: "border-l-primary/40 bg-surface-2",
  informational: "border-l-border bg-surface-2",
};

export const PRIORITY_DOT: Record<BriefingPriority, string> = {
  critical: "bg-status-out",
  high: "bg-status-maintenance",
  medium: "bg-primary",
  informational: "bg-muted-foreground",
};

type Accent = "teal" | "green" | "red" | "blue" | "orange" | "amber";

const GLANCE_TILE: Record<Accent, string> = {
  teal: "bg-kpi-teal/10 text-kpi-teal",
  green: "bg-kpi-green/10 text-kpi-green",
  red: "bg-kpi-red/10 text-kpi-red",
  blue: "bg-kpi-blue/10 text-kpi-blue",
  orange: "bg-kpi-orange/10 text-kpi-orange",
  amber: "bg-status-maintenance/15 text-status-maintenance",
};

export function GlanceKpi({
  label,
  value,
  sub,
  icon,
  accent,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: Accent;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="card-surface card-surface-hover group flex flex-col p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={cn("kpi-icon-tile", GLANCE_TILE[accent])}>{icon}</span>
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Link>
  );
}

export interface BriefingRowItem {
  id: string;
  title: string;
  reason: string | null;
  priority: BriefingPriority;
  amount?: number | null;
  deep_link: string | null;
  action_label?: string | null;
}

export function PriorityRow({
  item,
  canSeeMoney,
  compact,
}: {
  item: BriefingRowItem;
  canSeeMoney: boolean;
  compact?: boolean;
}) {
  const amount =
    item.amount != null && canSeeMoney ? fmtMoney(item.amount) : null;
  return (
    <Link
      to={item.deep_link ?? "#"}
      className={cn(
        "block rounded-md border border-border border-l-4 p-3 transition-colors hover:bg-surface-2",
        PRIORITY_TONE[item.priority],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                PRIORITY_DOT[item.priority],
              )}
            />
            <p className="truncate text-sm font-medium text-foreground">
              {item.title}
            </p>
          </div>
          {item.reason && !compact && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {item.reason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {amount && (
            <span className="font-mono text-sm font-semibold tabular text-foreground">
              {amount}
            </span>
          )}
          {item.action_label && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-primary">
              {item.action_label}
              <ArrowRight size={12} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  // Accept a useState setter directly. Dispatch<SetStateAction<T>> is assignable
  // to (k: T) => void. T is inferred from the `value` prop (the narrow union),
  // not widened from the option key literals.
  onChange: Dispatch<SetStateAction<T>>;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-surface hover:text-foreground",
          )}
        >
          {o.label}
          {typeof o.count === "number" && (
            <span className="ml-1.5 font-mono tabular opacity-80">
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function CompactEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <CircleDot size={22} className="text-muted-foreground/60" />
      <p className="mt-2 font-display text-sm font-semibold text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function PayStat({
  label,
  value,
  amount,
  to,
  tone,
}: {
  label: string;
  value: string;
  amount?: number | null;
  to: string;
  tone?: "out";
}) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-surface-2 p-3 transition-colors hover:border-primary/40"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-lg font-semibold tabular text-foreground">
        {value}
      </p>
      {amount != null && (
        <p
          className={cn(
            "mt-0.5 font-mono text-xs tabular",
            tone === "out" ? "text-status-out" : "text-muted-foreground",
          )}
        >
          {fmtMoney(amount)}
        </p>
      )}
    </Link>
  );
}
