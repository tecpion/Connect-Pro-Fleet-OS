// Connect Pro Fleet — Executive Dashboard profitability selectors (Build #30).
//
// DERIVED from the authoritative Build #16 profitability selectors. Never
// recomputes P&L truth. Operating revenue, expenses, profit, and margin reuse
// getCompanyProfitability; top/bottom vehicles reuse getVehiclePerformanceRows.
// Financial visibility is permission-gated BEFORE result formation (Collections
// ≠ profit: cash collected and operating profit are kept distinct).

import type { FleetStore } from "./store/storeContext";
import type { ProfitabilitySnapshot } from "./executiveTypes";
import type { ExecutiveViewerPermissions } from "./executiveTypes";
import type { TrendDirection } from "./executiveTypes";
import type { DateRange } from "./profitabilityHelpers";
import {
  getCompanyProfitability,
  getVehiclePerformanceRows,
  type ProfitabilityInputs,
} from "./profitabilitySelectors";
import {
  precedingRange,
  safePercentChange,
} from "./executiveFinancialSelectors";
import { round2 } from "./profitabilityHelpers";

export interface ExecutiveProfitabilitySources {
  store: FleetStore;
  inputs: ProfitabilityInputs;
}

/** Build the profitability snapshot — permission-gated BEFORE forming.
 *  Top/bottom vehicles ranked by operating profit (gross_profit) for the
 *  selected period. Zero-revenue margin returns null (never NaN/Infinity). */
export function buildProfitabilitySnapshot(
  src: ExecutiveProfitabilitySources,
  range: DateRange,
  perms: ExecutiveViewerPermissions,
): ProfitabilitySnapshot {
  const canProfit = perms.canViewProfitability;

  const company = getCompanyProfitability(src.inputs, range);

  // Prior-period profit for trend.
  const prior = precedingRange(range.start, range.end);
  const priorCompany = getCompanyProfitability(src.inputs, prior);
  const trend = safePercentChange(
    company.operating_profit,
    priorCompany.operating_profit,
  );

  // Top/bottom vehicles by operating profit (gross_profit) for the period.
  const rows = getVehiclePerformanceRows(src.inputs, range).filter(
    (r) => r.gross_profit !== 0 || r.revenue !== 0,
  );
  const sorted = [...rows].sort((a, b) => b.gross_profit - a.gross_profit);
  const top = sorted[0] ?? null;
  const bottom = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  const margin =
    company.operating_revenue > 0
      ? round2((company.operating_profit / company.operating_revenue) * 100)
      : null;

  return {
    operating_revenue: canProfit ? round2(company.operating_revenue) : null,
    operating_expenses: canProfit
      ? round2(
          company.fleet_direct_expenses +
            company.company_overhead +
            company.processor_fees,
        )
      : null,
    operating_profit: canProfit ? round2(company.operating_profit) : null,
    margin_percent: canProfit ? margin : null,
    top_vehicle: top
      ? {
          id: top.vehicle_id,
          label: top.label,
          profit: canProfit ? round2(top.gross_profit) : null,
        }
      : null,
    bottom_vehicle: bottom
      ? {
          id: bottom.vehicle_id,
          label: bottom.label,
          profit: canProfit ? round2(bottom.gross_profit) : null,
        }
      : null,
    prior_profit: canProfit ? round2(priorCompany.operating_profit) : null,
    profit_trend: trend.direction as TrendDirection,
  };
}
