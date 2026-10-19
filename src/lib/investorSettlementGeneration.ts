import { recordUuid } from "./recordUuid";
// Shared frozen V1 settlement calculation used by the store and live E2E.
// Persistence and period idempotency remain the store/repository's responsibility.
import type {
  InvestorVehicle,
  Settlement,
  VehicleOperatingCost,
  VehicleRepairCost,
} from "./investorTypes";
import type { FinancialTransaction } from "./chargeTypes";
function monthsBetween(start: string, end: string) {
  const a = new Date(start),
    b = new Date(end);
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1
  );
}
export function calculateInvestorSettlement(input: {
  pairing: InvestorVehicle;
  investorId: string;
  vehicleId: string;
  periodStart: string;
  periodEnd: string;
  operatorFeePct: number;
  transactions: FinancialTransaction[];
  operatingCosts: VehicleOperatingCost[];
  repairCosts: VehicleRepairCost[];
}): Settlement {
  const {
    pairing,
    investorId,
    vehicleId,
    periodStart,
    periodEnd,
    operatorFeePct,
    transactions,
    operatingCosts: vocState,
    repairCosts: vrcState,
  } = input;
  // Gross revenue from posted rental charges on this vehicle in period.
  const txns = transactions.filter(
    (t) =>
      t.vehicle_id === vehicleId &&
      t.category === "charge" &&
      t.status === "posted" &&
      t.effective_date >= periodStart &&
      t.effective_date <= periodEnd,
  );
  const grossRevenue = txns.reduce((s, t) => s + t.amount, 0);

  const months = Math.max(1, monthsBetween(periodStart, periodEnd));

  // Operating costs: pro-rated monthly, split by responsibility.
  const vocs = vocState.filter((c) => c.vehicle_id === vehicleId);
  const operatorOperating = vocs
    .filter((c) => c.responsibility === "operator_pays")
    .reduce((s, c) => s + c.monthly_amount * months, 0);
  const investorOperating = vocs
    .filter((c) => c.responsibility === "investor_pays")
    .reduce((s, c) => s + c.monthly_amount * months, 0);

  // Repair costs in period, split by responsibility.
  const vrcs = vrcState.filter(
    (c) =>
      c.vehicle_id === vehicleId &&
      c.incurred_date >= periodStart &&
      c.incurred_date <= periodEnd,
  );
  const operatorRepairs = vrcs
    .filter((c) => c.responsibility === "operator_pays")
    .reduce((s, c) => s + c.amount, 0);
  const investorRepairs = vrcs
    .filter((c) => c.responsibility === "investor_pays")
    .reduce((s, c) => s + c.amount, 0);

  const operatorCosts = operatorOperating + operatorRepairs;
  const investorCosts = investorOperating + investorRepairs;

  const operatorFee = grossRevenue * (operatorFeePct / 100);

  // Build #6 — resolve the compensation arrangement. Percentage splits
  // honor the basis (gross vs net); the legacy net calculation is
  // preserved when no typed arrangement exists. Fixed/custom arrangements
  // are surfaced as configured (automated scheduling is a later build).
  const compensation = pairing.compensation ?? {
    type: "percentage" as const,
    basis: "net" as const,
    investor_percentage: pairing.revenue_split_investor_pct,
    operator_percentage: pairing.revenue_split_operator_pct,
    effective_date: pairing.effective_date ?? periodStart,
    end_date: null,
    notes: null,
  };

  let investorPayout: number;
  if (compensation.type === "percentage") {
    const investorPct = compensation.investor_percentage / 100;
    const base =
      compensation.basis === "gross"
        ? grossRevenue
        : grossRevenue - operatorCosts - operatorFee;
    investorPayout = base * investorPct - investorCosts;
  } else if (compensation.type === "fixed") {
    // Configured fixed payout — automated scheduling comes later. For
    // now the settlement records the configured amount as the payout.
    investorPayout = compensation.fixed_amount;
  } else {
    // Custom — not auto-calculated. Payout recorded as 0 until finalized.
    investorPayout = 0;
  }

  const settlement: Settlement = {
    id: recordUuid(),
    tenant_id: pairing.tenant_id,
    investor_id: investorId,
    vehicle_id: vehicleId,
    period_start: periodStart,
    period_end: periodEnd,
    gross_revenue: grossRevenue,
    operating_costs: operatorOperating + investorOperating,
    repair_costs: operatorRepairs + investorRepairs,
    operator_fee_amount: operatorFee,
    investor_payout_amount: Math.round(investorPayout * 100) / 100,
    payout_status: "pending",
    payout_date: null,
    statement_pdf_url: null,
    created_at: new Date().toISOString(),
  };

  return settlement;
}
