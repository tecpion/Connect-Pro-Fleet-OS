// Connect Pro Fleet — Fleet Vehicle Performance presentational parts.
//
// Pure presentational components for the fleet-level performance workspace:
// KPI tiles (Gross Revenue hero is visually dominant), insight cards (null →
// clean empty state, never fabricated), filter selects, table rows, and
// mobile cards. Performance labels use the approved Strong/Watch/Underperforming
// tones — no opaque score.

import type { ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { FleetRow } from "@/lib/vehiclePerformanceFleet";
import type { PerformanceLabel } from "@/lib/vehiclePerformanceAssessment";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import { PERFORMANCE_LABELS } from "@/lib/vehiclePerformanceSettings";

export const PERF_TONE: Record<
  PerformanceLabel,
  "available" | "maintenance" | "out"
> = {
  strong_performer: "available",
  watch: "maintenance",
  underperforming: "out",
};

const TONE_CLASSES: Record<string, string> = {
  positive: "text-emerald-600",
  danger: "text-red-600",
  warning: "text-amber-600",
  neutral: "text-foreground",
  available: "text-emerald-600",
  out: "text-red-600",
};

const PERF_BADGE: Record<PerformanceLabel, string> = {
  strong_performer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  watch: "bg-amber-50 text-amber-700 ring-amber-200",
  underperforming: "bg-red-50 text-red-700 ring-red-200",
};

export function CompactKpi({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone?: "positive" | "danger" | "warning" | "neutral" | "available";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn(TONE_CLASSES[tone] ?? TONE_CLASSES.neutral)}>
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 font-mono text-xl font-semibold tabular",
          TONE_CLASSES[tone] ?? TONE_CLASSES.neutral,
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function InsightCard({
  label,
  icon,
  tone,
  data,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tone: "positive" | "warning" | "out" | "available";
  data: { title: string; value: string } | null;
  onClick?: () => void;
}) {
  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2/40 p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Info size={14} />
          <span className="text-xs font-medium uppercase tracking-wide">
            {label}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          No qualifying data
        </p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-start rounded-xl border border-border bg-surface p-4 text-left transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn(TONE_CLASSES[tone] ?? TONE_CLASSES.neutral)}>
          {icon}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold text-foreground">
        {data.title}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm tabular",
          TONE_CLASSES[tone] ?? TONE_CLASSES.neutral,
        )}
      >
        {data.value}
      </p>
    </button>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-surface px-2 py-1 text-sm text-foreground"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PerfBadge({ label }: { label: PerformanceLabel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        PERF_BADGE[label],
      )}
      title={
        (PERFORMANCE_LABELS[label] ?? "") +
        (label !== "strong_performer" ? " — see reasons" : "")
      }
    >
      {PERFORMANCE_LABELS[label] ?? label}
    </span>
  );
}

function moneyOrDash(v: number, hasData: boolean, missing: boolean): string {
  if (missing) return "—";
  if (!hasData && v === 0) return "No data";
  return fmtMoney(v);
}

export function FleetRow({
  row,
  showMoney,
  showExpenses,
  onOpen,
}: {
  row: FleetRow;
  showMoney: boolean;
  showExpenses: boolean;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-border/60 transition hover:bg-surface-2/40"
    >
      <td className="py-2.5 pr-4">
        <div className="font-medium text-foreground">{row.vehicleLabel}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono">{row.plate || "—"}</span>
          {row.className && <span>· {row.className}</span>}
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-medium",
              row.ownershipType === "company_owned"
                ? "bg-surface-2 text-muted-foreground"
                : "bg-primary/10 text-primary",
            )}
          >
            {OWNERSHIP_TYPE_LABELS[row.ownershipType] ?? row.ownershipType}
          </span>
        </div>
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-foreground">
        {showMoney
          ? moneyOrDash(row.grossRevenue, row.hasFinancialData, false)
          : "—"}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {showMoney
          ? moneyOrDash(row.cashCollected, row.hasFinancialData, false)
          : "—"}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {showExpenses
          ? moneyOrDash(row.expenses, row.hasFinancialData, false)
          : "—"}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-foreground">
        {showMoney
          ? moneyOrDash(row.netContribution, row.hasFinancialData, false)
          : "—"}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {fmtPct(row.fleetUtilization)}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {fmtPct(row.rentableUtilization)}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {row.rentableIdleDays}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {row.downtimeDays}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono tabular text-muted-foreground">
        {row.purchasePriceMissing ? "—" : fmtPct(row.lifetimeReturn)}
      </td>
      <td className="py-2.5 pr-4">
        <PerfBadge label={row.performanceLabel} />
      </td>
      <td className="py-2.5 text-right">
        <ChevronRight size={16} className="ml-auto text-muted-foreground" />
      </td>
    </tr>
  );
}

export function FleetCard({
  row,
  showMoney,
  showExpenses,
  onOpen,
}: {
  row: FleetRow;
  showMoney: boolean;
  showExpenses: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{row.vehicleLabel}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{row.plate || "—"}</span>
            {row.className && <span>· {row.className}</span>}
          </div>
        </div>
        <PerfBadge label={row.performanceLabel} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Gross Revenue</div>
          <div className="font-mono tabular text-foreground">
            {showMoney
              ? moneyOrDash(row.grossRevenue, row.hasFinancialData, false)
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Net Contribution</div>
          <div className="font-mono tabular text-foreground">
            {showMoney
              ? moneyOrDash(row.netContribution, row.hasFinancialData, false)
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Utilization</div>
          <div className="font-mono tabular text-muted-foreground">
            {fmtPct(row.rentableUtilization)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Lifetime Return</div>
          <div className="font-mono tabular text-muted-foreground">
            {row.purchasePriceMissing ? "—" : fmtPct(row.lifetimeReturn)}
          </div>
        </div>
        {showExpenses && (
          <div>
            <div className="text-xs text-muted-foreground">Expenses</div>
            <div className="font-mono tabular text-muted-foreground">
              {moneyOrDash(row.expenses, row.hasFinancialData, false)}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs text-muted-foreground">Idle Days</div>
          <div className="font-mono tabular text-muted-foreground">
            {row.rentableIdleDays}
          </div>
        </div>
      </div>
      {row.performanceReasons.length > 0 &&
        row.performanceLabel !== "strong_performer" && (
          <p className="text-xs text-muted-foreground">
            {row.performanceReasons[0]}
          </p>
        )}
    </button>
  );
}
