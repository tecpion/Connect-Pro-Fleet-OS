// Connect Pro Fleet — Vehicle Performance tab content components.

import { Link } from "@/lib/router-compat";
import {
  ChevronRight,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Wallet,
  Receipt,
  ShieldCheck,
  Gauge,
  Clock,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { SectionCard } from "@/components/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { VehiclePerformance } from "@/lib/vehiclePerformance";
import type { WhatChangedItem } from "@/lib/vehiclePerformanceWhatsChanged";
import {
  MetricTile,
  MoneyRow,
  Row,
  TimelineItem,
} from "./PerformancePrimitives";

export function OverviewTab({
  perf,
  showMoney,
  showExpenses,
  view,
  canViewCompany,
}: {
  perf: VehiclePerformance;
  showMoney: boolean;
  showExpenses: boolean;
  view: "vehicle" | "company";
  canViewCompany: boolean;
}) {
  return (
    <div className="space-y-5">
      <SectionCard title="Where the Money Went">
        {showExpenses ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Gross Revenue</span>
              <span className="font-mono font-semibold">
                {fmtMoney(perf.grossRevenueGenerated)}
              </span>
            </div>
            <MoneyRow
              label="Maintenance"
              amount={perf.expenseBreakdown.maintenance}
            />
            <MoneyRow
              label="Insurance"
              amount={perf.expenseBreakdown.insurance}
            />
            <MoneyRow
              label="Registration"
              amount={perf.expenseBreakdown.registration}
            />
            <MoneyRow label="Fuel" amount={perf.expenseBreakdown.fuel} />
            <MoneyRow
              label="Other Expenses"
              amount={perf.expenseBreakdown.other}
            />
            <MoneyRow
              label="Damage Net Impact"
              amount={perf.damage.netCompanyImpact ?? 0}
            />
            <MoneyRow
              label="Violations Absorbed"
              amount={perf.violations.netCompanyImpact}
            />
            {perf.financing.hasFinancingData && (
              <MoneyRow
                label="Financing (Car Notes)"
                amount={perf.financing.carNotePayments}
              />
            )}
            {view === "company" &&
              canViewCompany &&
              perf.investorPayout != null && (
                <MoneyRow
                  label="JV / Investor Payout"
                  amount={perf.investorPayout}
                />
              )}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="font-semibold text-foreground">
                {view === "company" && canViewCompany
                  ? "Company Net Contribution"
                  : "Cash-Flow Contribution"}
              </span>
              <span className="font-mono font-bold text-primary">
                {fmtMoney(
                  view === "company" && canViewCompany
                    ? (perf.companyNetContribution ?? 0)
                    : perf.cashFlowContribution,
                )}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Expense breakdown requires expense view permission.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Utilization Snapshot">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Fleet Utilization"
            value={fmtPct(perf.fleetUtilization)}
            sub="Rented ÷ calendar days"
            icon={<Gauge size={15} />}
          />
          <MetricTile
            label="Rentable Utilization"
            value={fmtPct(perf.rentableUtilization)}
            sub="Rented ÷ available days"
            icon={<Gauge size={15} />}
          />
          <MetricTile
            label="Revenue / Rented Day"
            value={showMoney ? fmtMoney(perf.revenuePerRentedDay) : "—"}
            icon={<DollarSign size={15} />}
          />
          <MetricTile
            label="Net / Calendar Day"
            value={
              showMoney ? fmtMoney(perf.netContributionPerCalendarDay) : "—"
            }
            icon={<TrendingUp size={15} />}
          />
        </div>
      </SectionCard>

      <WhatChangedSection items={perf.whatsChanged} rangeKey={perf.range} />

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Deposits">
          <dl className="space-y-2 text-sm">
            <Row
              label="Deposits Held"
              value={fmtMoney(perf.deposits.held)}
              hint="Not revenue"
            />
            <Row label="Applied" value={fmtMoney(perf.deposits.applied)} />
            <Row label="Refunded" value={fmtMoney(perf.deposits.refunded)} />
            <Row
              label="Net Retained"
              value={fmtMoney(perf.deposits.netRetained)}
            />
          </dl>
        </SectionCard>
        <SectionCard title="Damage Economics">
          <dl className="space-y-2 text-sm">
            <Row
              label="Repair Cost"
              value={
                perf.damage.repairCost == null
                  ? "No records"
                  : fmtMoney(perf.damage.repairCost)
              }
            />
            <Row
              label="Renter Recovery"
              value={fmtMoney(perf.damage.renterRecovery)}
            />
            <Row
              label="Insurance Recovery"
              value={fmtMoney(perf.damage.insuranceRecovery)}
            />
            <Row
              label="Net Company Impact"
              value={
                perf.damage.netCompanyImpact == null
                  ? "—"
                  : fmtMoney(perf.damage.netCompanyImpact)
              }
              tone={
                perf.damage.netCompanyImpact != null &&
                perf.damage.netCompanyImpact > 0
                  ? "danger"
                  : "positive"
              }
            />
          </dl>
        </SectionCard>
        <SectionCard title="Violations / Tolls">
          <dl className="space-y-2 text-sm">
            <Row
              label="Total Assessed"
              value={fmtMoney(perf.violations.totalAssessed)}
            />
            <Row
              label="Company Paid"
              value={fmtMoney(perf.violations.companyPaid)}
            />
            <Row
              label="Recovered"
              value={fmtMoney(perf.violations.recovered)}
            />
            <Row
              label="Net Company Impact"
              value={fmtMoney(perf.violations.netCompanyImpact)}
              tone={
                perf.violations.netCompanyImpact > 0 ? "danger" : "positive"
              }
            />
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}

export function RevenueTab({
  perf,
  showMoney,
}: {
  perf: VehiclePerformance;
  showMoney: boolean;
}) {
  return (
    <SectionCard title="Revenue">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Gross Revenue"
          value={showMoney ? fmtMoney(perf.grossRevenueGenerated) : "—"}
          icon={<DollarSign size={15} />}
          tone="primary"
        />
        <MetricTile
          label="Cash Collected"
          value={showMoney ? fmtMoney(perf.cashCollected) : "—"}
          icon={<Wallet size={15} />}
        />
        <MetricTile
          label="Outstanding"
          value={showMoney ? fmtMoney(perf.outstanding) : "—"}
          icon={<AlertTriangle size={15} />}
          tone="warning"
        />
        <MetricTile
          label="Revenue / Rented Day"
          value={showMoney ? fmtMoney(perf.revenuePerRentedDay) : "—"}
          icon={<DollarSign size={15} />}
        />
        <MetricTile
          label="Revenue / Calendar Day"
          value={showMoney ? fmtMoney(perf.revenuePerCalendarDay) : "—"}
          icon={<DollarSign size={15} />}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Gross Revenue ≠ Cash Collected. Held deposits are excluded from revenue.
      </p>
    </SectionCard>
  );
}

export function CostsTab({
  perf,
  showExpenses,
}: {
  perf: VehiclePerformance;
  showExpenses: boolean;
}) {
  if (!showExpenses) {
    return (
      <SectionCard title="Costs">
        <p className="text-sm text-muted-foreground">
          Expense breakdown requires expense view permission.
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Cost Breakdown">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          label="Maintenance"
          value={fmtMoney(perf.expenseBreakdown.maintenance)}
          icon={<Receipt size={15} />}
        />
        <MetricTile
          label="Insurance"
          value={fmtMoney(perf.expenseBreakdown.insurance)}
          icon={<ShieldCheck size={15} />}
        />
        <MetricTile
          label="Registration"
          value={fmtMoney(perf.expenseBreakdown.registration)}
          icon={<Receipt size={15} />}
        />
        <MetricTile
          label="Fuel"
          value={fmtMoney(perf.expenseBreakdown.fuel)}
          icon={<Receipt size={15} />}
        />
        <MetricTile
          label="Other"
          value={fmtMoney(perf.expenseBreakdown.other)}
          icon={<Receipt size={15} />}
        />
        <MetricTile
          label="Total Expenses"
          value={fmtMoney(perf.expenseBreakdown.total)}
          icon={<Receipt size={15} />}
          tone="warning"
        />
      </div>
      {perf.financing.hasFinancingData && (
        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Financing (separate from operating expenses)
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {fmtMoney(perf.financing.carNotePayments)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Car-note payments reduce cash-flow contribution, not operating
            contribution.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

export function UtilizationTab({ perf }: { perf: VehiclePerformance }) {
  return (
    <SectionCard title="Utilization & Time Classification">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          label="Fleet Utilization"
          value={fmtPct(perf.fleetUtilization)}
          sub="Rented ÷ calendar days"
          icon={<Gauge size={15} />}
        />
        <MetricTile
          label="Rentable Utilization"
          value={fmtPct(perf.rentableUtilization)}
          sub="Rented ÷ available days"
          icon={<Gauge size={15} />}
        />
        <MetricTile
          label="Rented Days"
          value={String(perf.time.rentedDays)}
          icon={<Clock size={15} />}
        />
        <MetricTile
          label="Rentable Idle Days"
          value={String(perf.time.rentableIdleDays)}
          icon={<Clock size={15} />}
          tone="warning"
        />
        <MetricTile
          label="Maintenance Downtime"
          value={`${perf.time.maintenanceDowntimeDays}d`}
          icon={<AlertTriangle size={15} />}
        />
        <MetricTile
          label="Damage Downtime"
          value={`${perf.time.damageDowntimeDays}d`}
          icon={<AlertTriangle size={15} />}
        />
        <MetricTile
          label="Other Unavailable"
          value={`${perf.time.otherUnavailableDays}d`}
          icon={<Clock size={15} />}
        />
        <MetricTile
          label="Calendar Days"
          value={String(perf.time.calendarDays)}
          icon={<Clock size={15} />}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Unavailable days are not counted as "idle." Rentable Idle = available
        but not rented.
      </p>
    </SectionCard>
  );
}

export function TimelineTab({
  perf,
  vehicleId,
}: {
  perf: VehiclePerformance;
  vehicleId: string;
}) {
  return (
    <SectionCard title="Economic Timeline">
      <p className="text-sm text-muted-foreground">
        Major vehicle economic events for {perf.vehicleLabel} (
        {perf.periodStart} → {perf.periodEnd}).
      </p>
      <div className="mt-3 space-y-2">
        <TimelineItem
          label="Gross Revenue Generated"
          value={fmtMoney(perf.grossRevenueGenerated)}
        />
        <TimelineItem
          label="Cash Collected"
          value={fmtMoney(perf.cashCollected)}
        />
        <TimelineItem
          label="Total Expenses"
          value={fmtMoney(perf.totalExpenses)}
        />
        {perf.damage.repairCost != null && (
          <TimelineItem
            label="Damage Repair Cost"
            value={fmtMoney(perf.damage.repairCost)}
          />
        )}
        {perf.violations.companyPaid > 0 && (
          <TimelineItem
            label="Violations Company-Paid"
            value={fmtMoney(perf.violations.companyPaid)}
          />
        )}
        {perf.investorPayout != null && (
          <TimelineItem
            label="JV / Investor Payout"
            value={fmtMoney(perf.investorPayout)}
          />
        )}
        <TimelineItem
          label="Net Contribution"
          value={fmtMoney(perf.netContribution)}
          highlight
        />
      </div>
      <Link
        to={`/vehicles/${vehicleId}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        View full Vehicle Digital Twin <ChevronRight size={14} />
      </Link>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// What Changed — prior-period comparison insights (transparent, explainable).
// ---------------------------------------------------------------------------

const RANGE_LABEL: Record<string, string> = {
  this_week: "previous week",
  this_month: "previous month",
  last_month: "prior month",
  ytd: "prior-year period",
  last_30_days: "previous 30 days",
  last_90_days: "previous 90 days",
  last_12_months: "previous 12 months",
  lifetime: "Lifetime",
};

function WhatChangedSection({
  items,
  rangeKey,
}: {
  items: WhatChangedItem[];
  rangeKey: string;
}) {
  const vsLabel = RANGE_LABEL[rangeKey] ?? "prior period";
  // Lifetime has no comparison.
  if (rangeKey === "lifetime") {
    return (
      <SectionCard title="What Changed">
        <p className="text-sm text-muted-foreground">
          No prior-period comparison for Lifetime.
        </p>
      </SectionCard>
    );
  }
  if (items.length === 0) {
    return (
      <SectionCard title="What Changed">
        <p className="text-sm text-muted-foreground">
          Not enough prior-period data yet to compare against the {vsLabel}.
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="What Changed">
      <p className="mb-3 text-xs text-muted-foreground">vs {vsLabel}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <div
            key={c.metric}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
          >
            {c.direction === "up" ? (
              <ArrowUp
                size={14}
                className={
                  c.sentiment === "positive"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              />
            ) : c.direction === "down" ? (
              <ArrowDown
                size={14}
                className={
                  c.sentiment === "positive"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              />
            ) : (
              <span className="text-muted-foreground">→</span>
            )}
            <span className="text-sm text-foreground">{c.text}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
