// Connect Pro Fleet — shared analytics header + trend + breakdown cards for the
// Incidents & Violations workspace. Pure presentation over the existing selectors.

import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { Siren, Gavel, TrendingUp, Car } from "lucide-react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  workspaceSummary,
  buildTrend,
  incidentTypeBreakdown,
  violationTypeBreakdown,
  topVehiclesByFrequency,
  resolveAnalyticsRange,
  comparisonIndicator,
  type AnalyticsRange,
  type TrendGranularity,
} from "@/lib/incidentsViolationsAnalytics";
import { VIOLATION_TYPE_LABELS } from "@/lib/violationTypes";
import { titleCase } from "../shared";

const RANGE_OPTIONS: { key: AnalyticsRange; label: string }[] = [
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "this_year", label: "This Year" },
  { key: "last_year", label: "Last Year" },
  { key: "last_12_months", label: "Last 12 Months" },
  { key: "custom", label: "Custom" },
];

export function SharedAnalytics({
  range,
  setRange,
  custom,
  setCustom,
  summary,
  incComparison,
  vioComparison,
  canViewVioFinancials,
  needsAttention,
  overdueCritical,
}: {
  range: AnalyticsRange;
  setRange: (r: AnalyticsRange) => void;
  custom: { start: string; end: string };
  setCustom: (c: { start: string; end: string }) => void;
  summary: ReturnType<typeof workspaceSummary>;
  incComparison: ReturnType<typeof comparisonIndicator>;
  vioComparison: ReturnType<typeof comparisonIndicator>;
  canViewVioFinancials: boolean;
  needsAttention: number;
  overdueCritical: number;
}) {
  return (
    <SectionCard
      title="Workspace Summary"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as AnalyticsRange)}
            className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {range === "custom" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={custom.start}
                onChange={(e) =>
                  setCustom({ ...custom, start: e.target.value })
                }
                className="w-36 font-mono text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={custom.end}
                onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                className="w-36 font-mono text-xs"
              />
            </div>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryKpi
          label="Incidents This Period"
          value={String(summary.incidentsThisPeriod)}
          sub={cmpText(incComparison, summary.priorLabel)}
          subTone={
            incComparison.direction === "up"
              ? "available"
              : incComparison.direction === "down"
                ? "out"
                : "neutral"
          }
        />
        <SummaryKpi
          label="Violations This Period"
          value={String(summary.violationsThisPeriod)}
          sub={cmpText(vioComparison, summary.priorLabel)}
          subTone={
            vioComparison.direction === "up"
              ? "out"
              : vioComparison.direction === "down"
                ? "available"
                : "neutral"
          }
        />
        <SummaryKpi
          label="Incidents This Year"
          value={String(summary.incidentsThisYear)}
        />
        <SummaryKpi
          label="Violations This Year"
          value={String(summary.violationsThisYear)}
        />
        <SummaryKpi
          label="Total Fines"
          value={
            canViewVioFinancials ? fmtMoney(summary.totalFinesThisPeriod) : "—"
          }
        />
        <SummaryKpi
          label="Billed to Renters"
          value={
            canViewVioFinancials ? fmtMoney(summary.amountBilledToRenters) : "—"
          }
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <SummaryKpi
          label="Needs Attention"
          value={String(needsAttention)}
          tone="maintenance"
        />
        <SummaryKpi
          label="Overdue / Critical"
          value={String(overdueCritical)}
          tone="out"
        />
      </div>
    </SectionCard>
  );
}

function cmpText(
  c: ReturnType<typeof comparisonIndicator>,
  priorLabel: string | null,
): string | undefined {
  if (c.direction === "unknown" && c.prior == null) return undefined;
  if (c.prior == null) return undefined;
  const arrow = c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "→";
  const pct =
    c.pctChange != null ? `${Math.abs(Math.round(c.pctChange))}%` : "";
  return `${arrow} ${pct} ${priorLabel ?? ""}`.trim() || undefined;
}

function SummaryKpi({
  label,
  value,
  sub,
  subTone = "neutral",
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "available" | "maintenance" | "out" | "neutral";
  tone?: "available" | "maintenance" | "out" | "neutral";
}) {
  const subColor: Record<string, string> = {
    available: "text-status-available",
    maintenance: "text-status-maintenance",
    out: "text-status-out",
    neutral: "text-muted-foreground",
  };
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3",
        tone === "out" && "border-l-4 border-l-status-out",
        tone === "maintenance" && "border-l-4 border-l-status-maintenance",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-foreground">
        {value}
      </p>
      {sub && (
        <p className={cn("mt-0.5 text-[11px]", subColor[subTone])}>{sub}</p>
      )}
    </div>
  );
}

export function TrendCard({
  trend,
  granularity,
  setGranularity,
}: {
  trend: ReturnType<typeof buildTrend>;
  granularity: TrendGranularity;
  setGranularity: (g: TrendGranularity) => void;
}) {
  const hasData = trend.some((p) => p.incidents > 0 || p.violations > 0);
  return (
    <SectionCard
      title="Incidents & Violations Trend"
      icon={<TrendingUp size={16} />}
      right={
        <div className="seg-control">
          {(["monthly", "yearly"] as TrendGranularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              data-active={granularity === g}
              className="seg-control-item"
            >
              {g === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      }
    >
      {hasData ? (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trend}
              margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--surface))",
                }}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="incidents"
                name="Incidents"
                fill="hsl(var(--status-out))"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="violations"
                name="Violations"
                fill="hsl(var(--kpi-teal))"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/30 text-center">
          <div className="empty-disc mb-3" data-tone="teal">
            <TrendingUp className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            No trend data yet
          </p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
            Incidents and violations will populate this chart as they're logged.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

export function BreakdownCards({
  incBreakdown,
  vioBreakdown,
  topVehicles,
  vehicleLabel,
}: {
  incBreakdown: ReturnType<typeof incidentTypeBreakdown>;
  vioBreakdown: ReturnType<typeof violationTypeBreakdown>;
  topVehicles: ReturnType<typeof topVehiclesByFrequency>;
  vehicleLabel: (id: string) => string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <BreakdownCard
        title="Incident Types"
        icon={<Siren size={16} />}
        items={incBreakdown.map((b) => ({
          label: titleCase(b.type),
          value: b.count,
        }))}
        empty="No incidents in this period."
      />
      <BreakdownCard
        title="Violation Types"
        icon={<Gavel size={16} />}
        items={vioBreakdown.map((b) => ({
          label:
            VIOLATION_TYPE_LABELS[
              b.type as keyof typeof VIOLATION_TYPE_LABELS
            ] ?? titleCase(b.type),
          value: b.count,
        }))}
        empty="No violations in this period."
      />
      <TopVehiclesCard items={topVehicles} vehicleLabel={vehicleLabel} />
    </div>
  );
}

function BreakdownCard({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: { label: string; value: number }[];
  empty: string;
}) {
  const max = items.length ? Math.max(...items.map((i) => i.value)) : 1;
  return (
    <SectionCard title={title} icon={icon}>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{it.label}</span>
                <span className="font-mono tabular text-muted-foreground">
                  {it.value}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(it.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function TopVehiclesCard({
  items,
  vehicleLabel,
}: {
  items: ReturnType<typeof topVehiclesByFrequency>;
  vehicleLabel: (id: string) => string;
}) {
  return (
    <SectionCard
      title="Vehicles With Most Incidents / Violations"
      icon={<Car size={16} />}
    >
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No vehicle activity in this period.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((v, idx) => (
            <li
              key={v.vehicleId}
              className="flex items-center gap-3 rounded-md border border-border bg-surface-2/40 p-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {vehicleLabel(v.vehicleId)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.violations} violations · {v.incidents} incidents
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-foreground">
                {v.total}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Raw frequency only — not a risk assessment.
      </p>
    </SectionCard>
  );
}

export { resolveAnalyticsRange };
