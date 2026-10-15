// Connect Pro Fleet — investor/JV economics for profitability (Build #16).
//
// Computes PROJECTED partner compensation for a vehicle's operating profit
// over a report period. Distinguishes vehicle operating profit from company
// economic share (what the operating company retains after partner/investor
// compensation). Custom arrangements are NOT machine-calculable — surfaced as
// null so the UI labels them "manual review required" rather than fabricating
// a payout.
//
// Build #16 cleanup — period-aware fixed compensation + expense-rule-aware net:
//   - Fixed compensation now scales by frequency (weekly/biweekly/monthly)
//     across the eligible weeks/periods in the report range, respecting the
//     agreement effective_date/end_date. A $300/week agreement over 4 eligible
//     weeks projects $1,200 — not a single $300.
//   - Percentage NET basis now deducts ONLY the expense categories the
//     partnership expense rules mark "deduct_before_split" (or, for legacy
//     pairings without structured rules, all direct vehicle expenses). Company
//     overhead is NEVER deducted before the investor split.
//   - Guarantee flags (guaranteed_when_not_rented / guaranteed_during_downtime)
//     are honored: a non-guaranteed fixed payout is only owed when the vehicle
//     actually generated rental activity (rentedDays > 0) in the period.
//
// This wraps/reuses the same authoritative economic rules as the settlement
// engine so profitability and settlements never disagree for the same period.

import type { CompensationArrangement } from "./ownershipTypes";
import type { InvestorVehicle } from "./investorTypes";
import type { PartnershipExpenseRule } from "./partnershipTypes";
import type { VehicleExpenseBreakdown } from "./profitabilityTypes";
import { DAY, round2, type DateRange } from "./profitabilityHelpers";

/** Resolve the active investor-vehicle pairing for a vehicle. */
export function pairingForVehicle(
  vehicleId: string,
  investorVehicles: InvestorVehicle[],
): InvestorVehicle | null {
  return (
    investorVehicles.find((iv) => iv.vehicle_id === vehicleId && iv.active) ??
    null
  );
}

/** Days the agreement is active within the report range (effective_date/end_date). */
function agreementActiveDays(
  comp: { effective_date: string; end_date: string | null },
  range: DateRange,
): number {
  const eff = new Date(comp.effective_date + "T00:00:00");
  const start = eff > range.start ? eff : range.start;
  const endRaw = comp.end_date ? new Date(comp.end_date + "T00:00:00") : null;
  const end = endRaw && endRaw < range.end ? endRaw : range.end;
  if (end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / DAY) + 1;
}

/** Number of complete billing periods of a given frequency that fit in `days`. */
function periodsForFrequency(
  frequency: "weekly" | "biweekly" | "monthly" | "custom",
  days: number,
): number {
  if (days <= 0) return 0;
  switch (frequency) {
    case "weekly":
      return Math.floor(days / 7);
    case "biweekly":
      return Math.floor(days / 14);
    case "monthly":
      return Math.floor(days / 30);
    case "custom":
      // Custom frequency isn't machine-calculable per-period; fall back to a
      // single period so the projection isn't zero, flagged for manual review.
      return days > 0 ? 1 : 0;
  }
}

/** Sum the expense-breakdown buckets permitted by the partnership expense rules
 *  (deduct_before_split). For legacy pairings without structured rules, all
 *  direct vehicle expenses are deducted (preserves prior net behavior). */
function netDeductibleExpenses(
  breakdown: VehicleExpenseBreakdown,
  rules: PartnershipExpenseRule[] | null,
): number {
  if (!rules || rules.length === 0) {
    // Legacy pairing — deduct all direct vehicle expenses (prior behavior).
    return breakdown.total_direct_expenses;
  }
  const deduct = new Set(
    rules
      .filter((r) => r.treatment === "deduct_before_split")
      .map((r) => r.category),
  );
  if (deduct.size === 0) return 0; // gross-equivalent net (nothing deducted)
  let total = 0;
  if (deduct.has("maintenance")) total += breakdown.maintenance_expenses;
  if (deduct.has("insurance")) total += breakdown.insurance_expenses;
  if (deduct.has("registration")) total += breakdown.registration_expenses;
  if (deduct.has("oil_service")) total += breakdown.maintenance_expenses;
  if (deduct.has("detailing")) total += breakdown.other_vehicle_expenses;
  if (deduct.has("other")) total += breakdown.other_vehicle_expenses;
  // "repairs","parts","labor","tires","brakes","towing","gps","recovery",
  // "taxes_fees" all map to the maintenance/other buckets already captured
  // above; include them explicitly so a rule on any of these still deducts.
  if (
    deduct.has("repairs") ||
    deduct.has("parts") ||
    deduct.has("labor") ||
    deduct.has("tires") ||
    deduct.has("brakes") ||
    deduct.has("towing") ||
    deduct.has("gps") ||
    deduct.has("recovery") ||
    deduct.has("taxes_fees")
  ) {
    total += breakdown.maintenance_expenses + breakdown.other_vehicle_expenses;
  }
  // Avoid double-counting if multiple of the above buckets overlap.
  return Math.min(total, breakdown.total_direct_expenses);
}

/** Compute projected partner compensation for a vehicle's operating profit
 *  over a report range. Returns null for custom (non-machine-calculable)
 *  arrangements. */
export function projectedPartnerCompensation(
  pairing: InvestorVehicle | null,
  grossRevenue: number,
  directExpenses: VehicleExpenseBreakdown,
  range: DateRange,
  rentedDays: number,
  expenseRules: PartnershipExpenseRule[] | null,
): {
  compensation: number | null;
  type: CompensationArrangement["type"] | null;
} {
  if (!pairing) return { compensation: null, type: null };
  const comp = pairing.compensation ?? null;
  if (!comp) {
    // Legacy pairing — treat as net percentage over all direct expenses.
    const investorPct = pairing.revenue_split_investor_pct / 100;
    return {
      compensation: round2(
        (grossRevenue - directExpenses.total_direct_expenses) * investorPct,
      ),
      type: "percentage",
    };
  }
  if (comp.type === "percentage") {
    const deductible =
      comp.basis === "gross"
        ? 0
        : netDeductibleExpenses(directExpenses, expenseRules);
    const base = grossRevenue - deductible;
    return {
      compensation: round2(base * (comp.investor_percentage / 100)),
      type: "percentage",
    };
  }
  if (comp.type === "fixed") {
    const activeDays = agreementActiveDays(comp, range);
    const periods = periodsForFrequency(comp.fixed_frequency, activeDays);
    if (periods <= 0) return { compensation: 0, type: "fixed" };
    // Non-guaranteed fixed payout is only owed when the vehicle was actually
    // rented in the period (honor guaranteed_when_not_rented).
    if (!comp.guaranteed_when_not_rented && rentedDays <= 0) {
      return { compensation: 0, type: "fixed" };
    }
    return {
      compensation: round2(comp.fixed_amount * periods),
      type: "fixed",
    };
  }
  return { compensation: null, type: "custom" };
}
