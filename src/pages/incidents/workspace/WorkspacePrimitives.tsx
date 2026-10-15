// Connect Pro Fleet — shared presentation primitives for the Incidents &
// Violations workspace. Small, focused, reusable.

import { StatusPill } from "@/components/Status";
import { cn } from "@/lib/utils";

export function TabKpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "available" | "maintenance" | "out" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3",
        tone === "out" && "border-l-4 border-l-status-out",
        tone === "maintenance" && "border-l-4 border-l-status-maintenance",
        tone === "available" && "border-l-4 border-l-status-available",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  allLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-input bg-surface px-3 py-2 text-sm"
    >
      <option value="all">{allLabel}</option>
      {children}
    </select>
  );
}

export function MatchPill({
  status,
}: {
  status: "unmatched" | "suggested" | "confirmed";
}) {
  const map = {
    unmatched: { tone: "out" as const, label: "Unmatched" },
    suggested: { tone: "maintenance" as const, label: "Suggested" },
    confirmed: { tone: "available" as const, label: "Confirmed" },
  };
  const m = map[status];
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

export function BillingPill({
  status,
}: {
  status: "not_billed" | "billed" | "partially_paid" | "paid" | "waived";
}) {
  const map = {
    not_billed: { tone: "neutral" as const, label: "Not Billed" },
    billed: { tone: "rented" as const, label: "Billed" },
    partially_paid: { tone: "maintenance" as const, label: "Partial" },
    paid: { tone: "available" as const, label: "Paid" },
    waived: { tone: "neutral" as const, label: "Waived" },
  };
  const m = map[status];
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

export function DuePill({
  state,
}: {
  state: "none" | "due_soon" | "due_today" | "overdue";
}) {
  if (state === "none")
    return <span className="text-xs text-muted-foreground">No due date</span>;
  const map = {
    due_soon: { tone: "maintenance" as const, label: "Due Soon" },
    due_today: { tone: "maintenance" as const, label: "Due Today" },
    overdue: { tone: "out" as const, label: "Overdue" },
  };
  const m = map[state];
  return <StatusPill tone={m.tone}>{m.label}</StatusPill>;
}

export function AttentionReasons({
  level,
  reasons,
}: {
  level: "none" | "attention" | "critical";
  reasons: string[];
}) {
  if (level === "none") return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.slice(0, 2).map((r) => (
        <span
          key={r}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px]",
            level === "critical"
              ? "bg-status-out/10 text-status-out"
              : "bg-status-maintenance/10 text-status-maintenance",
          )}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
