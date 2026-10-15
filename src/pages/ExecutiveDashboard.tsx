// Connect Pro Fleet — Executive Dashboard page (Build #30).
//
// The owner's operating console. A single composition pass (buildExecutiveDashboard)
// feeds every panel so P&L / utilization / opportunity / health are never
// recomputed independently. Permission-aware: financial/profitability values are
// gated BEFORE forming (never briefly rendered then hidden). Mobile-first
// ordering at 375px: Health → Needs Attention → Collections/Overdue →
// Utilization → Money Left on Table → Idle Fleet → Operations.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useExecutiveSources } from "@/lib/useExecutiveSources";
import { buildExecutiveDashboard } from "@/lib/executiveDashboardComposer";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import type { ExecutiveDatePreset } from "@/lib/executiveTypes";
import type { ExecutiveRange } from "@/lib/executiveTypes";
import { fmtMoney, fmtNumber, fmtDate, pct } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AskCopilotButton } from "@/components/copilot/AskCopilotButton";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  Car,
  AlertTriangle,
  HeartPulse,
  Wrench,
  ShieldAlert,
  FileWarning,
  DollarSign,
} from "lucide-react";

const PRESETS: { value: ExecutiveDatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "last_month", label: "Last Month" },
];

function resolveRange(preset: ExecutiveDatePreset, now: Date): ExecutiveRange {
  const map: Record<
    ExecutiveDatePreset,
    "today" | "this_week" | "this_month" | "last_month" | "last_30_days"
  > = {
    today: "today",
    this_week: "this_week",
    this_month: "this_month",
    last_30_days: "last_30_days",
    last_month: "last_month",
    custom: "this_month",
  };
  const r = resolveProfitabilityRange(map[preset]);
  return { preset, start: r.start, end: r.end, as_of: now };
}

function TrendIcon({ dir }: { dir: string }) {
  if (dir === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (dir === "down") return <TrendingDown className="h-4 w-4 text-rose-500" />;
  if (dir === "flat")
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  return null;
}

function gradeColor(grade: string): string {
  if (grade === "excellent") return "text-emerald-500";
  if (grade === "good") return "text-emerald-600";
  if (grade === "needs_attention") return "text-amber-500";
  return "text-rose-500";
}

function gradeLabel(grade: string): string {
  if (grade === "excellent") return "Excellent";
  if (grade === "good") return "Good";
  if (grade === "needs_attention") return "Needs Attention";
  return "Critical";
}

function moneyOrHidden(v: number | null, canSee: boolean): string {
  if (!canSee) return "—";
  if (v == null) return "N/A";
  return fmtMoney(v);
}

export default function ExecutiveDashboard() {
  const { sources, perms, healthConfig } = useExecutiveSources();
  const [preset, setPreset] = useState<ExecutiveDatePreset>("this_month");
  const [showHealthWhy, setShowHealthWhy] = useState(false);
  const now = useMemo(() => new Date(), []);

  const range = useMemo(() => resolveRange(preset, now), [preset, now]);

  const summary = useMemo(
    () => buildExecutiveDashboard(sources, range, perms, healthConfig, now),
    [sources, range, perms, healthConfig, now],
  );

  const f = summary.financial;
  const p = summary.profitability;
  const u = summary.fleet_utilization;
  const idle = summary.idle_fleet;
  const m = summary.money_left_on_table;
  const h = summary.health;
  const load = summary.operational_load;
  const canMoney = perms.canViewFinancials;
  const canProfit = perms.canViewProfitability;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Dashboard"
        subtitle={`${summary.company_name} · ${fmtDate(range.start.toISOString())} – ${fmtDate(range.end.toISOString())}`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as ExecutiveDatePreset)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <AskCopilotButton promptLabel="Ask Copilot about this dashboard" />
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Collections"
          value={moneyOrHidden(f.collections, canMoney)}
          icon={<Wallet className="h-4 w-4" />}
          trend={f.collections_trend}
        />
        <KpiTile
          label="Outstanding"
          value={moneyOrHidden(f.outstanding_balance, canMoney)}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KpiTile
          label="Overdue"
          value={
            canMoney
              ? moneyOrHidden(f.overdue_balance, canMoney)
              : `${f.overdue_count}`
          }
          sub={canMoney ? `${f.overdue_count} accounts` : undefined}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KpiTile
          label="Utilization"
          value={pct(u.utilization_pct)}
          icon={<Car className="h-4 w-4" />}
          trend={u.utilization_trend}
        />
        <KpiTile
          label="Operating Profit"
          value={moneyOrHidden(p.operating_profit, canProfit)}
          icon={<TrendingUp className="h-4 w-4" />}
          trend={p.profit_trend}
        />
        <KpiTile
          label="Health Score"
          value={`${h.overall_score}`}
          sub={gradeLabel(h.grade)}
          icon={<HeartPulse className="h-4 w-4" />}
        />
      </div>

      {/* Row 2: Health + Needs Attention */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Business Health"
          icon={<HeartPulse className="h-5 w-5" />}
        >
          <div className="flex items-baseline gap-3">
            <span className={cn("text-5xl font-bold", gradeColor(h.grade))}>
              {h.overall_score}
            </span>
            <span className="text-lg text-muted-foreground">/ 100</span>
            <span
              className={cn(
                "ml-auto text-lg font-semibold",
                gradeColor(h.grade),
              )}
            >
              {gradeLabel(h.grade)}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {h.components.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between text-sm">
                  <span>{c.label}</span>
                  <span className="font-medium">
                    {c.score}{" "}
                    <span className="text-muted-foreground">({c.weight}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setShowHealthWhy((v) => !v)}
          >
            {showHealthWhy ? "Hide" : "Why is my score"} {h.overall_score}?
          </Button>
          {showHealthWhy && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs text-muted-foreground">
              {h.explanation}
            </pre>
          )}
        </SectionCard>

        <SectionCard
          title="Needs Attention"
          icon={<AlertTriangle className="h-5 w-5" />}
        >
          {summary.needs_attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No critical items need attention.
            </p>
          ) : (
            <ul className="space-y-2">
              {summary.needs_attention.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium",
                      item.priority === "critical" &&
                        "bg-rose-500/15 text-rose-500",
                      item.priority === "high" &&
                        "bg-amber-500/15 text-amber-600",
                      item.priority === "medium" &&
                        "bg-sky-500/15 text-sky-600",
                      item.priority === "informational" &&
                        "bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {item.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{item.title}</span>
                    {item.reason && (
                      <span className="block text-xs text-muted-foreground">
                        {item.reason}
                      </span>
                    )}
                  </div>
                  {item.deep_link && (
                    <Link
                      to={item.deep_link}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Row 3: Utilization + Idle Fleet */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="Fleet Utilization"
          icon={<Car className="h-5 w-5" />}
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat
              label="Utilization"
              value={pct(u.utilization_pct)}
              trend={u.utilization_trend}
            />
            <Stat label="Rented Days" value={fmtNumber(u.rented_days)} />
            <Stat label="Rentable Days" value={fmtNumber(u.rentable_days)} />
            <Stat label="Blocked Days" value={fmtNumber(u.blocked_days)} />
            <Stat label="Idle Days" value={fmtNumber(u.idle_available_days)} />
            <Stat label="Available Now" value={fmtNumber(u.available_now)} />
          </div>
        </SectionCard>

        <SectionCard title="Idle Fleet" icon={<Activity className="h-5 w-5" />}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Idle Vehicles" value={fmtNumber(idle.idle_count)} />
            <Stat
              label="Total Idle Days"
              value={fmtNumber(idle.total_idle_days)}
            />
            <Stat
              label="Past Threshold"
              value={fmtNumber(idle.idle_past_threshold_count)}
            />
            <Stat
              label="Longest Idle"
              value={idle.longest_idle_label ?? "—"}
              sub={`${idle.longest_idle_days}d`}
            />
          </div>
          {idle.top_idle.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Top Longest Idle
              </p>
              <ul className="space-y-1 text-sm">
                {idle.top_idle.map((v) => (
                  <li
                    key={v.vehicle_id}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{v.label}</span>
                    <span className="text-muted-foreground">
                      {v.idle_days}d
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Row 4: Money Left on the Table */}
      <SectionCard
        title="Money Left on the Table"
        icon={<DollarSign className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Known Recoverable
            </p>
            <p className="text-3xl font-bold">
              {moneyOrHidden(m.known_recoverable_total, canMoney)}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {m.quantified.length === 0 && (
                <li className="text-muted-foreground">
                  No known recoverable amounts.
                </li>
              )}
              {m.quantified.map((o, i) => (
                <li
                  key={`${o.source_module}-${o.entity_id}-${i}`}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{o.label}</span>
                  <span className="text-muted-foreground">
                    {canMoney ? fmtMoney(o.amount) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Idle Fleet Opportunity
            </p>
            <p className="text-3xl font-bold">
              {fmtNumber(m.idle_opportunity.idle_count)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                vehicles
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {fmtNumber(m.idle_opportunity.total_idle_days)} idle days
            </p>
            <p className="text-xs text-muted-foreground">
              {m.idle_opportunity.vehicles_without_future_reservation} without a
              future reservation
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Row 5: Operational Load */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <LoadCard
          title="Maintenance"
          icon={<Wrench className="h-5 w-5" />}
          stats={[
            {
              label: "Open WOs",
              value: fmtNumber(load.maintenance.open_work_orders),
            },
            {
              label: "Blocking",
              value: fmtNumber(load.maintenance.blocking_work_orders),
            },
            {
              label: "Overdue",
              value: fmtNumber(load.maintenance.overdue_work_orders),
            },
            {
              label: "Cost",
              value: moneyOrHidden(load.maintenance.maintenance_cost, canMoney),
            },
          ]}
        />
        <LoadCard
          title="Damage"
          icon={<AlertTriangle className="h-5 w-5" />}
          stats={[
            { label: "Open Claims", value: fmtNumber(load.damage.open_claims) },
            {
              label: "Blocking",
              value: fmtNumber(load.damage.blocking_claims),
            },
            {
              label: "Unresolved",
              value: fmtNumber(load.damage.unresolved_responsibility),
            },
            {
              label: "Unrecovered",
              value: moneyOrHidden(load.damage.unrecovered_amount, canMoney),
            },
          ]}
        />
        <LoadCard
          title="Violations"
          icon={<ShieldAlert className="h-5 w-5" />}
          stats={[
            {
              label: "Unresolved",
              value: fmtNumber(load.violations.unresolved),
            },
            { label: "Disputed", value: fmtNumber(load.violations.disputed) },
            { label: "Overdue", value: fmtNumber(load.violations.overdue) },
            {
              label: "Customer Owed",
              value: moneyOrHidden(
                load.violations.customer_outstanding,
                canMoney,
              ),
            },
          ]}
        />
        <LoadCard
          title="Compliance"
          icon={<FileWarning className="h-5 w-5" />}
          stats={[
            {
              label: "Blocked",
              value: fmtNumber(load.compliance.blocked_vehicles),
            },
            {
              label: "Expired",
              value: fmtNumber(load.compliance.expired_docs),
            },
            {
              label: "Expiring",
              value: fmtNumber(load.compliance.expiring_soon),
            },
            {
              label: "Missing",
              value: fmtNumber(load.compliance.missing_required),
            },
          ]}
        />
      </div>

      {/* Row 6: Vehicle Performance */}
      <SectionCard
        title={`Vehicle Performance — ${PRESETS.find((x) => x.value === preset)?.label}`}
        icon={<TrendingUp className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Highest Operating Profit
            </p>
            {p.top_vehicle ? (
              <div className="text-sm">
                <span className="font-medium">{p.top_vehicle.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {canProfit ? fmtMoney(p.top_vehicle.profit ?? 0) : "—"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Lowest Operating Profit
            </p>
            {p.bottom_vehicle ? (
              <div className="text-sm">
                <span className="font-medium">{p.bottom_vehicle.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {canProfit ? fmtMoney(p.bottom_vehicle.profit ?? 0) : "—"}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function KpiTile({
  label,
  value,
  sub,
  icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-bold">{value}</span>
        {trend && trend !== "unavailable" && <TrendIcon dir={trend} />}
      </div>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="font-semibold">{value}</span>
        {trend && trend !== "unavailable" && <TrendIcon dir={trend} />}
      </div>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function LoadCard({
  title,
  icon,
  stats,
}: {
  title: string;
  icon: React.ReactNode;
  stats: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="font-semibold">{title}</span>
      </div>
      <dl className="space-y-1 text-sm">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <dt className="text-muted-foreground">{s.label}</dt>
            <dd className="font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
