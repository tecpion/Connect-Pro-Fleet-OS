// Connect Pro Fleet — Build #18 shared report UI components.
//
// Reusable filter bar, KPI tiles, report shell, and responsive table/card
// primitives used across all report pages. Follows the existing design system
// (charcoal/concrete/teal, Space Grotesk headers, JetBrains Mono numbers).

import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import type { ReportFilter } from "@/lib/reportInputs";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// ---------------------------------------------------------------------------
// ReportFilterBar — date presets + location/vehicle/class/ownership scope
// ---------------------------------------------------------------------------

export type DatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  last_week: "Last Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
  custom: "Custom",
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}
const DAY = 86_400_000;

export function presetRange(
  preset: DatePreset,
  now = new Date(),
): { start: string; end: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { start: iso(today), end: iso(endOfDay(now)) };
    case "yesterday": {
      const y = new Date(today.getTime() - DAY);
      return { start: iso(y), end: iso(y) };
    }
    case "this_week": {
      const day = (now.getDay() + 6) % 7;
      return {
        start: iso(new Date(today.getTime() - day * DAY)),
        end: iso(endOfDay(now)),
      };
    }
    case "last_week": {
      const day = (now.getDay() + 6) % 7;
      const ws = new Date(today.getTime() - (day + 7) * DAY);
      const we = new Date(ws.getTime() + 6 * DAY);
      return { start: iso(ws), end: iso(we) };
    }
    case "this_month":
      return {
        start: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: iso(endOfDay(now)),
      };
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: iso(s), end: iso(e) };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: iso(new Date(now.getFullYear(), q * 3, 1)),
        end: iso(endOfDay(now)),
      };
    }
    case "this_year":
      return {
        start: iso(new Date(now.getFullYear(), 0, 1)),
        end: iso(endOfDay(now)),
      };
    case "custom":
      return { start: iso(today), end: iso(endOfDay(now)) };
  }
}

export function ReportFilterBar({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
  locations,
  onLocationChange,
  vehicleClasses,
  onClassChange,
  ownershipTypes,
  onOwnershipChange,
}: {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  custom: { start: string; end: string };
  onCustomChange: (c: { start: string; end: string }) => void;
  locations: { id: string; name: string }[];
  onLocationChange?: (id: string | null) => void;
  vehicleClasses: { id: string; name: string }[];
  onClassChange?: (id: string | null) => void;
  ownershipTypes?: { value: string; label: string }[];
  onOwnershipChange?: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(DATE_PRESET_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onPresetChange(key as DatePreset)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              preset === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={custom.start}
            onChange={(e) =>
              onCustomChange({ ...custom, start: e.target.value })
            }
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={custom.end}
            onChange={(e) => onCustomChange({ ...custom, end: e.target.value })}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {onLocationChange && (
          <select
            onChange={(e) => onLocationChange(e.target.value || null)}
            value=""
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {onClassChange && (
          <select
            onChange={(e) => onClassChange(e.target.value || null)}
            value=""
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          >
            <option value="">All classes</option>
            {vehicleClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {onOwnershipChange && ownershipTypes && (
          <select
            onChange={(e) => onOwnershipChange(e.target.value || null)}
            value=""
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
          >
            <option value="">All ownership</option>
            {ownershipTypes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

export function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "danger" | "positive";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-4",
        tone === "warning" && "border-status-maintenance/40",
        tone === "danger" && "border-status-out/40",
        tone === "positive" && "border-status-available/40",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular text-foreground">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function MoneyTile({
  label,
  amount,
  sub,
  tone,
}: {
  label: string;
  amount: number;
  sub?: string;
  tone?: "default" | "warning" | "danger" | "positive";
}) {
  return (
    <KpiTile label={label} value={fmtMoney(amount)} sub={sub} tone={tone} />
  );
}

// ---------------------------------------------------------------------------
// Report shell — header + generated-at + disclaimer
// ---------------------------------------------------------------------------

export function ReportShell({
  title,
  subtitle,
  generatedAt,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between print:block">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Generated {generatedAt.toLocaleString()}
          </p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {actions}
          </div>
        )}
      </div>
      {children}
      <p className="border-t border-border pt-3 text-xs text-muted-foreground print:pt-2">
        Operational management reporting based on data recorded in Connect Pro
        Fleet. Not a substitute for formal accounting or tax statements.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Responsive table — desktop table, mobile stacked cards
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  mono?: boolean;
}

export function ReportTable<T>({
  columns,
  rows,
  emptyMessage,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0 && emptyMessage) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-border last:border-0",
                  onRowClick && "cursor-pointer hover:bg-surface-2",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2 text-foreground",
                      c.mono && "font-mono tabular",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="space-y-2 lg:hidden">
        {rows.map((row, i) => (
          <div
            key={i}
            onClick={() => onRowClick?.(row)}
            className={cn(
              "rounded-lg border border-border bg-surface p-3",
              onRowClick && "cursor-pointer",
            )}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-2 py-0.5"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c.header}
                </span>
                <span
                  className={cn(
                    "text-sm text-foreground",
                    c.mono && "font-mono tabular",
                  )}
                >
                  {c.render(row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Export button
// ---------------------------------------------------------------------------

export function ExportButton({
  onClick,
  ...rest
}: { onClick: () => void } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface print:hidden"
      {...rest}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Export CSV
    </button>
  );
}

export type { ReportFilter };
