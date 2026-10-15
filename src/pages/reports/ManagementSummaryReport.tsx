// Connect Pro Fleet — Build #18 Management Summary report page.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { useReportContext } from "./useReportContext";
import { getManagementSummary } from "@/lib/managementSummarySelector";
import {
  ReportShell,
  ReportFilterBar,
  KpiTile,
  MoneyTile,
  type DatePreset,
  presetRange,
} from "./ReportShared";
import { fmtMoney, fmtPct } from "@/lib/format";

export default function ManagementSummaryReport() {
  const ctx = useReportContext();
  const store = useStore();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewOverhead = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "expenses.view_company_overhead",
  );
  const canViewCompany = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "reports.view_company_profitability",
  );

  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const range = preset === "custom" ? custom : presetRange(preset);
  const filter = { start: range.start, end: range.end };

  const summary = useMemo(
    () => getManagementSummary(ctx, filter),
    [ctx, filter.start, filter.end],
  );

  const fin = summary.financial;
  // Privacy: hide company operating profit if overhead hidden (would let user
  // infer overhead from revenue - fleet profit).
  const hideCompanyProfit = !canViewCompany || !canViewOverhead;

  return (
    <ReportShell
      title="Management Summary"
      subtitle="Executive snapshot across the business for the selected period."
      generatedAt={new Date()}
    >
      <ReportFilterBar
        preset={preset}
        onPresetChange={setPreset}
        custom={custom}
        onCustomChange={setCustom}
        locations={store.locations}
        vehicleClasses={store.vehicleClasses}
      />

      {/* Financial Snapshot */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Financial Snapshot
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyTile label="Operating Revenue" amount={fin.operating_revenue} />
          <MoneyTile label="Collections" amount={fin.collections} />
          <MoneyTile
            label="Outstanding Receivables"
            amount={fin.outstanding_receivables}
            tone="warning"
          />
          <MoneyTile
            label="Fleet Direct Expenses"
            amount={fin.fleet_direct_expenses}
          />
          {canViewOverhead && (
            <MoneyTile label="Company Overhead" amount={fin.company_overhead} />
          )}
          <MoneyTile
            label="Gross Fleet Profit"
            amount={fin.gross_fleet_profit}
            tone="positive"
          />
          {!hideCompanyProfit && (
            <MoneyTile
              label="Operating Profit"
              amount={fin.operating_profit}
              tone={fin.operating_profit >= 0 ? "positive" : "danger"}
              sub={`Margin ${fmtPct(fin.margin_percent)}`}
            />
          )}
          <MoneyTile
            label="Taxes Collected"
            amount={fin.revenue.tax_collected}
            sub="Pass-through, not revenue"
          />
        </div>
      </section>

      {/* Rental Activity */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Rental Activity
        </h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="New" value={String(summary.rentals.new_rentals)} />
          <KpiTile
            label="Active"
            value={String(summary.rentals.active_rentals)}
          />
          <KpiTile
            label="Completed"
            value={String(summary.rentals.completed_rentals)}
          />
          <KpiTile
            label="Overdue"
            value={String(summary.rentals.overdue_rentals)}
            tone={summary.rentals.overdue_rentals > 0 ? "danger" : "default"}
          />
          <KpiTile
            label="Extensions"
            value={String(summary.rentals.extensions)}
          />
          <KpiTile
            label="Exchanges"
            value={String(summary.rentals.exchanges)}
          />
        </div>
      </section>

      {/* Fleet */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fleet
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Utilization"
            value={fmtPct(summary.fleet.utilization)}
          />
          <KpiTile
            label="Active Vehicles"
            value={String(summary.fleet.active_vehicle_count)}
          />
          <KpiTile
            label="Rented Vehicles"
            value={String(summary.fleet.rented_vehicle_count)}
          />
          <KpiTile
            label="Avg Revenue / Vehicle"
            value={fmtMoney(summary.fleet.average_revenue_per_vehicle)}
          />
        </div>
      </section>

      {/* Collections */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Collections
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyTile
            label="Total Collected"
            amount={summary.collections.total_collected}
          />
          <MoneyTile
            label="Late Balances"
            amount={summary.collections.late_balances}
            tone="warning"
          />
          <MoneyTile
            label="Tender Mix"
            amount={fin.collections}
            sub="See Collections report"
          />
        </div>
      </section>

      {/* Maintenance */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Maintenance
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile
            label="Open Work Orders"
            value={String(summary.maintenance.open_work_orders)}
          />
          <KpiTile
            label="Overdue"
            value={String(summary.maintenance.overdue_work_orders)}
            tone={
              summary.maintenance.overdue_work_orders > 0
                ? "warning"
                : "default"
            }
          />
          <KpiTile
            label="Active Downtime"
            value={String(summary.maintenance.downtime_active)}
          />
        </div>
      </section>

      {/* Damage Claims */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Damage Claims
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Open Claims"
            value={String(summary.damage.open_claims)}
          />
          <KpiTile
            label="Recovery Pending"
            value={String(summary.damage.recovery_pending)}
            tone="warning"
          />
          <MoneyTile
            label="Actual Claim Cost"
            amount={summary.damage.actual_claim_cost}
          />
          <MoneyTile
            label="Net Damage Loss"
            amount={summary.damage.net_damage_loss}
            tone={summary.damage.net_damage_loss > 0 ? "danger" : "positive"}
          />
        </div>
      </section>

      {/* Accounting Quality */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Accounting Quality
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            label="Unreconciled Txns"
            value={String(summary.accounting_quality.unreconciled_transactions)}
            tone={
              summary.accounting_quality.unreconciled_transactions > 0
                ? "warning"
                : "default"
            }
          />
          <KpiTile
            label="Suggested Matches"
            value={String(summary.accounting_quality.suggested_matches)}
          />
          <KpiTile
            label="Missing Receipts"
            value={String(summary.accounting_quality.missing_receipts)}
            tone={
              summary.accounting_quality.missing_receipts > 0
                ? "warning"
                : "default"
            }
          />
          <MoneyTile
            label="Reimbursements Owed"
            amount={summary.accounting_quality.reimbursements_owed}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            to="/finance?tab=banking"
            className="text-primary hover:underline"
          >
            Open Banking →
          </Link>
          <Link
            to="/reports/missing-receipts"
            className="text-primary hover:underline"
          >
            Missing Receipts →
          </Link>
        </div>
      </section>

      {/* Tasks */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tasks
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Open" value={String(summary.tasks.open)} />
          <KpiTile
            label="Overdue"
            value={String(summary.tasks.overdue)}
            tone={summary.tasks.overdue > 0 ? "danger" : "default"}
          />
          <KpiTile
            label="Completed (period)"
            value={String(summary.tasks.completed_in_period)}
          />
          <KpiTile
            label="Unassigned"
            value={String(summary.tasks.unassigned)}
            tone={summary.tasks.unassigned > 0 ? "warning" : "default"}
          />
        </div>
      </section>
    </ReportShell>
  );
}
