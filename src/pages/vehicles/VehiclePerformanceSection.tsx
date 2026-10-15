// Connect Pro Fleet — Vehicle Detail performance section (Build #16).
// Replaces the old trailing-12-month financial summary with the authoritative
// profitability selectors, adding a date-range selector and investor economics
// (permission-gated). Profitability is derived — never stored.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useInvestors } from "@/lib/investorStore";
import { can } from "@/lib/permissions";
import { SectionCard } from "@/components/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/format";
import {
  resolveProfitabilityRange,
  getVehicleProfitability,
  type ProfitabilityInputs,
} from "@/lib/profitabilitySelectors";
import {
  PROFITABILITY_RANGE_LABELS,
  type ProfitabilityRange,
} from "@/lib/profitabilityTypes";
import { Stat } from "./VehicleDetailSections";

export function VehiclePerformanceSection({
  vehicleId,
}: {
  vehicleId: string;
}) {
  const store = useStore();
  const { investorVehicles } = useInvestors();
  const [rangeKey, setRangeKey] = useState<ProfitabilityRange>("this_year");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewInvestorFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.view_financials",
  );

  const range = useMemo(() => resolveProfitabilityRange(rangeKey), [rangeKey]);

  const inputs: ProfitabilityInputs = useMemo(
    () => ({
      transactions: store.transactions,
      expenses: store.expenses,
      expenseLineItems: store.expenseLineItems,
      expenseCategories: store.expenseCategories,
      feeRules: store.feeRules,
      vehicles: store.vehicles,
      vehicleClasses: store.vehicleClasses,
      locations: store.locations,
      rentals: store.rentals,
      exchanges: store.rentals.flatMap((r) => store.vehicleExchanges(r.id)),
      investorVehicles,
      importedTransactions: store.importedTransactions,
      expenseReceipts: store.expenseReceipts,
      expenseReimbursements: store.expenseReimbursements,
    }),
    [store, investorVehicles],
  );

  const p = useMemo(
    () => getVehicleProfitability(vehicleId, inputs, range),
    [vehicleId, inputs, range],
  );

  return (
    <SectionCard
      title="Performance"
      right={
        <div className="flex items-center gap-2">
          <Link
            to={`/vehicles/${vehicleId}/performance`}
            className="rounded-md border border-input bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-2"
          >
            Vehicle Performance →
          </Link>
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as ProfitabilityRange)}
            className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
          >
            {(Object.keys(PROFITABILITY_RANGE_LABELS) as ProfitabilityRange[])
              .filter((k) => k !== "custom")
              .map((k) => (
                <option key={k} value={k}>
                  {PROFITABILITY_RANGE_LABELS[k]}
                </option>
              ))}
          </select>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={fmtMoney(p.billed_revenue)} />
        <Stat label="Collections" value={fmtMoney(p.collected_amount)} />
        <Stat
          label="Direct expenses"
          value={fmtMoney(p.expenses.total_direct_expenses)}
        />
        <Stat label="Gross profit" value={fmtMoney(p.gross_profit)} highlight />
        <Stat label="Days rented" value={String(p.rented_days)} />
        <Stat label="Utilization" value={fmtPct(p.utilization_rate)} />
        <Stat
          label="Revenue / rented day"
          value={fmtMoney(p.revenue_per_rented_day)}
        />
        <Stat
          label="Profit / rented day"
          value={fmtMoney(p.profit_per_rented_day)}
        />
      </div>

      {canViewInvestorFinancials && p.investor_compensation != null && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <Stat
            label="Partner compensation"
            value={fmtMoney(p.investor_compensation)}
          />
          <Stat
            label="Company economic share"
            value={fmtMoney(p.company_economic_share ?? 0)}
            highlight
          />
        </div>
      )}
      {canViewInvestorFinancials && p.compensation_type === "custom" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Custom compensation arrangement — manual settlement review required.
        </p>
      )}

      {p.expenses.acquisition_spend > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Vehicle acquisition spend ({fmtMoney(p.expenses.acquisition_spend)})
          is shown separately and not included in operating profit.
        </p>
      )}
    </SectionCard>
  );
}
