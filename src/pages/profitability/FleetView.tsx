// Connect Pro Fleet — Fleet P&L view (Build #16).

import { SectionCard, EmptyState } from "@/components/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { FleetProfitability } from "@/lib/profitabilityTypes";
import { RevenueExpenseChart, ProfitTrendChart } from "./ProfitabilityCharts";

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "out" | "available" | "neutral";
}) {
  const toneClass =
    tone === "out"
      ? "text-out"
      : tone === "available"
        ? "text-available"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-semibold tabular ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export function FleetView({
  fleet,
  trend,
  canViewInvestorFinancials,
}: {
  fleet: FleetProfitability;
  trend: { date: string; revenue: number; expenses: number; profit: number }[];
  canViewInvestorFinancials: boolean;
}) {
  const hasData =
    fleet.total_billed_revenue > 0 || fleet.vehicle_direct_expenses > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Fleet revenue"
          value={fmtMoney(fleet.total_billed_revenue)}
        />
        <Kpi label="Collections" value={fmtMoney(fleet.total_collections)} />
        <Kpi
          label="Outstanding receivables"
          value={fmtMoney(fleet.outstanding_receivables)}
          tone={fleet.outstanding_receivables > 0 ? "out" : "neutral"}
        />
        <Kpi
          label="Direct fleet expenses"
          value={fmtMoney(fleet.vehicle_direct_expenses)}
        />
        <Kpi
          label="Gross fleet profit"
          value={fmtMoney(fleet.gross_fleet_profit)}
          tone={fleet.gross_fleet_profit < 0 ? "out" : "available"}
        />
        <Kpi label="Fleet utilization" value={fmtPct(fleet.utilization)} />
        <Kpi
          label="Avg revenue / vehicle"
          value={fmtMoney(fleet.average_revenue_per_vehicle)}
        />
        <Kpi
          label="Avg profit / vehicle"
          value={fmtMoney(fleet.average_profit_per_vehicle)}
        />
      </div>

      {canViewInvestorFinancials &&
        fleet.total_partner_compensation != null && (
          <div className="grid grid-cols-2 gap-3">
            <Kpi
              label="Projected partner/JV compensation"
              value={fmtMoney(fleet.total_partner_compensation)}
            />
            <Kpi
              label="Projected company fleet contribution"
              value={fmtMoney(fleet.company_fleet_contribution ?? 0)}
              tone={
                (fleet.company_fleet_contribution ?? 0) < 0
                  ? "out"
                  : "available"
              }
            />
          </div>
        )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Active vehicles"
          value={String(fleet.active_vehicle_count)}
        />
        <Kpi
          label="Rented vehicles"
          value={String(fleet.rented_vehicle_count)}
        />
        <Kpi
          label="Maintenance expenses"
          value={fmtMoney(fleet.maintenance_expenses)}
        />
        <Kpi
          label="Acquisition spend"
          value={fmtMoney(fleet.acquisition_spend)}
        />
      </div>

      {hasData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Revenue vs expenses">
            <RevenueExpenseChart data={trend} />
          </SectionCard>
          <SectionCard title="Operating profit trend">
            <ProfitTrendChart
              data={trend.map((t) => ({ date: t.date, profit: t.profit }))}
            />
          </SectionCard>
        </div>
      ) : (
        <EmptyState
          title="No fleet data for this period"
          hint="Fleet revenue and expenses in this date range will appear here."
        />
      )}
    </div>
  );
}
