// Connect Pro Fleet — profitability selectors (Build #16).
//
// Pure functions deriving Vehicle / Fleet / Company P&L from the authoritative
// Rental Financial Ledger + Accounting Expense Ledger. Profitability is NEVER
// stored — always derived here so there is one source of truth.
//
// Revenue attribution across exchanges: a rental may serve multiple vehicles.
// Revenue is attributed by the days each vehicle served within the selected
// period (proportional allocation), unless the transaction carries an explicit
// vehicle_id (per-period charge tied to the current vehicle).
//
// Maintenance non-double-counting: work-order costs flow in as linked
// ExpenseTransactions (source = maintenance_work_order). Vehicle direct
// expenses EXCLUDE those (counted via the maintenance path) so a repair is
// counted exactly once.
//
// Deposit semantics (Build #8): held collection/refund are NOT revenue;
// application is NOT new revenue; forfeiture IS recognized revenue (once).
// Tax is pass-through, NOT operator revenue.

import type { FinancialTransaction } from "./chargeTypes";
import type {
  ExpenseCategory,
  ExpenseLineItem,
  ExpenseTransaction,
} from "./expenseTypes";
import type { FeeRule } from "./taxFeeTypes";
import type { RentalAgreement, Vehicle, VehicleClass, Location } from "./types";
import type { RentalVehicleExchange } from "./store/storeContext";
import type { InvestorVehicle } from "./investorTypes";
import type { VehicleOwnershipType } from "./ownershipTypes";
import type { PartnershipExpenseRule } from "./partnershipTypes";
import type {
  CompanyProfitability,
  FleetProfitability,
  VehicleProfitability,
  VehiclePerformanceRow,
  ClassProfitability,
  LocationProfitability,
  RevenueBreakdown,
} from "./profitabilityTypes";
import { affectsRentalObligation } from "./deposit";
import { isCollectionPayment } from "./collectionSelectors";
import {
  buildRevenueBreakdown,
  isRevenueCharge,
  isTaxCharge,
  isCompanyOnlyFeeRevenue,
  isAcquisitionExpense,
  isProcessorFeeExpense,
  expenseNet,
  inRange,
  round2,
  safeDiv,
  type DateRange,
} from "./profitabilityHelpers";
import {
  attributeRevenueToVehicles,
  vehicleDirectExpenses,
  vehicleRentedDays,
  vehicleAvailableDays,
  rentalDaysInRange,
} from "./profitabilityAttribution";
import {
  pairingForVehicle,
  projectedPartnerCompensation,
} from "./profitabilityInvestor";

export { resolveProfitabilityRange } from "./profitabilityHelpers";
export type { DateRange } from "./profitabilityHelpers";

export interface ProfitabilityInputs {
  transactions: FinancialTransaction[];
  expenses: ExpenseTransaction[];
  expenseLineItems: ExpenseLineItem[];
  expenseCategories: ExpenseCategory[];
  feeRules: FeeRule[];
  vehicles: Vehicle[];
  vehicleClasses: VehicleClass[];
  locations: Location[];
  rentals: RentalAgreement[];
  exchanges: RentalVehicleExchange[];
  investorVehicles: InvestorVehicle[];
  // Build #16 cleanup — partnership expense rules (deduct_before_split) drive
  // the NET basis for percentage investor compensation. Null/empty = legacy
  // pairing (deduct all direct vehicle expenses, prior behavior).
  expenseRules?: PartnershipExpenseRule[];
  importedTransactions: { review_status: string }[];
  expenseReceipts: { expense_id: string; voided_at: string | null }[];
  expenseReimbursements: { status: string; amount: number }[];
}

/** Compute profitability for a single vehicle over a date range. */
export function getVehicleProfitability(
  vehicleId: string,
  inputs: ProfitabilityInputs,
  range: DateRange,
): VehicleProfitability {
  const vehicle = inputs.vehicles.find((v) => v.id === vehicleId);
  const ownershipType: VehicleOwnershipType =
    (vehicle?.ownership_type as VehicleOwnershipType) ?? "company_owned";

  // Revenue: attribute transactions whose rental served this vehicle.
  const revTxns: FinancialTransaction[] = [];
  let collected = 0;
  for (const t of inputs.transactions) {
    if (t.status !== "posted") continue;
    if (!inRange(t.effective_date, range.start, range.end)) continue;
    const rental = inputs.rentals.find((r) => r.id === t.rental_id);
    const alloc = attributeRevenueToVehicles(
      t,
      rental,
      inputs.exchanges,
      range,
    );
    const amt = alloc.get(vehicleId);
    if (amt == null) continue;
    if (isRevenueCharge(t) || isTaxCharge(t)) {
      revTxns.push({ ...t, amount: Math.abs(amt) });
    }
    if (isCollectionPayment(t)) {
      collected += Math.abs(amt);
    }
  }

  // Outstanding for this vehicle's rentals (all posted, deposit-aware).
  let outstanding = 0;
  const vehicleRentalIds = new Set(
    inputs.rentals
      .filter(
        (r) =>
          r.vehicle_id === vehicleId ||
          inputs.exchanges.some(
            (e) =>
              e.rental_id === r.id &&
              (e.old_vehicle_id === vehicleId ||
                e.new_vehicle_id === vehicleId),
          ),
      )
      .map((r) => r.id),
  );
  for (const t of inputs.transactions) {
    if (t.status !== "posted") continue;
    if (!vehicleRentalIds.has(t.rental_id)) continue;
    if (!affectsRentalObligation(t)) continue;
    if (t.category === "charge") outstanding += t.amount;
    else if (t.category === "payment" || t.category === "credit")
      outstanding -= t.amount;
    else if (t.category === "refund") outstanding += t.amount;
  }
  outstanding = Math.max(0, round2(outstanding));

  // Vehicle P&L uses VEHICLE-ELIGIBLE revenue: fee charges marked
  // include_in_vehicle_revenue=false are excluded (they remain valid company
  // revenue but not vehicle revenue).
  const revenue = buildRevenueBreakdown(revTxns, true);
  const billedRevenue = revenue.total_revenue;

  const { breakdown: expenses } = vehicleDirectExpenses(
    inputs.expenses,
    inputs.expenseLineItems,
    inputs.expenseCategories,
    vehicleId,
    range,
  );

  const grossProfit = round2(billedRevenue - expenses.total_direct_expenses);

  const rentedDays = vehicleRentedDays(
    vehicleId,
    inputs.rentals,
    inputs.exchanges,
    range,
  );
  const availableDays = vehicleAvailableDays(range);
  const utilization = round2(safeDiv(rentedDays, availableDays) * 100);

  const pairing = pairingForVehicle(vehicleId, inputs.investorVehicles);
  // Resolve the partnership expense rules for this pairing (NET basis uses only
  // deduct_before_split categories). Null for legacy pairings.
  const pairingExpenseRules =
    pairing && inputs.expenseRules
      ? inputs.expenseRules.filter((r) => r.pairing_id === pairing.id)
      : null;
  const partner = projectedPartnerCompensation(
    pairing,
    billedRevenue,
    expenses,
    range,
    rentedDays,
    pairingExpenseRules,
  );
  const companyShare =
    partner.compensation != null
      ? round2(grossProfit - partner.compensation)
      : grossProfit;

  return {
    vehicle_id: vehicleId,
    period_start: range.start.toISOString().slice(0, 10),
    period_end: range.end.toISOString().slice(0, 10),
    billed_revenue: billedRevenue,
    collected_amount: round2(collected),
    revenue,
    expenses,
    gross_profit: grossProfit,
    net_contribution: companyShare,
    rented_days: rentedDays,
    available_days: availableDays,
    utilization_rate: utilization,
    revenue_per_rented_day: round2(safeDiv(billedRevenue, rentedDays)),
    expense_per_rented_day: round2(
      safeDiv(expenses.total_direct_expenses, rentedDays),
    ),
    profit_per_rented_day: round2(safeDiv(grossProfit, rentedDays)),
    outstanding_balance: outstanding,
    ownership_type: ownershipType,
    investor_compensation: partner.compensation,
    company_economic_share: companyShare,
    compensation_type: partner.type,
  };
}

export function getFleetProfitability(
  inputs: ProfitabilityInputs,
  range: DateRange,
): FleetProfitability {
  const rows = inputs.vehicles.map((v) =>
    getVehicleProfitability(v.id, inputs, range),
  );

  const revenue: RevenueBreakdown = rows.reduce(
    (acc, r) => {
      acc.base_rental_revenue += r.revenue.base_rental_revenue;
      acc.fee_revenue += r.revenue.fee_revenue;
      acc.late_fee_revenue += r.revenue.late_fee_revenue;
      acc.forfeiture_revenue += r.revenue.forfeiture_revenue;
      acc.other_revenue += r.revenue.other_revenue;
      acc.tax_collected += r.revenue.tax_collected;
      acc.total_revenue += r.revenue.total_revenue;
      return acc;
    },
    {
      base_rental_revenue: 0,
      fee_revenue: 0,
      late_fee_revenue: 0,
      forfeiture_revenue: 0,
      other_revenue: 0,
      tax_collected: 0,
      total_revenue: 0,
    },
  );

  const vehicleDirectExpensesTotal = rows.reduce(
    (s, r) => s + r.expenses.total_direct_expenses,
    0,
  );
  const maintenanceExpenses = rows.reduce(
    (s, r) => s + r.expenses.maintenance_expenses,
    0,
  );
  const acquisitionSpend = rows.reduce(
    (s, r) => s + r.expenses.acquisition_spend,
    0,
  );
  const collections = rows.reduce((s, r) => s + r.collected_amount, 0);
  const outstanding = rows.reduce((s, r) => s + r.outstanding_balance, 0);
  const grossFleetProfit = round2(
    revenue.total_revenue - vehicleDirectExpensesTotal,
  );

  const partnerComp = rows.reduce((s, r) => {
    if (r.investor_compensation == null) return s;
    return s + r.investor_compensation;
  }, 0);
  const hasPartner = rows.some((r) => r.investor_compensation != null);
  const companyContribution = hasPartner
    ? round2(grossFleetProfit - partnerComp)
    : grossFleetProfit;

  const rentedVehicleCount = rows.filter((r) => r.rented_days > 0).length;
  const totalAvailable = rows.reduce((s, r) => s + r.available_days, 0);
  const totalRented = rows.reduce((s, r) => s + r.rented_days, 0);

  return {
    period_start: range.start.toISOString().slice(0, 10),
    period_end: range.end.toISOString().slice(0, 10),
    total_billed_revenue: round2(revenue.total_revenue),
    total_collections: round2(collections),
    outstanding_receivables: round2(outstanding),
    revenue,
    vehicle_direct_expenses: round2(vehicleDirectExpensesTotal),
    maintenance_expenses: round2(maintenanceExpenses),
    acquisition_spend: round2(acquisitionSpend),
    gross_fleet_profit: grossFleetProfit,
    total_partner_compensation: hasPartner ? round2(partnerComp) : null,
    company_fleet_contribution: companyContribution,
    active_vehicle_count: inputs.vehicles.length,
    rented_vehicle_count: rentedVehicleCount,
    utilization: round2(safeDiv(totalRented, totalAvailable) * 100),
    average_revenue_per_vehicle: round2(
      safeDiv(revenue.total_revenue, inputs.vehicles.length),
    ),
    average_profit_per_vehicle: round2(
      safeDiv(grossFleetProfit, inputs.vehicles.length),
    ),
  };
}

export function getCompanyProfitability(
  inputs: ProfitabilityInputs,
  range: DateRange,
): CompanyProfitability {
  const fleet = getFleetProfitability(inputs, range);

  // Company-only fee revenue: fee charges with include_in_vehicle_revenue=false
  // are valid COMPANY operating revenue but were excluded from vehicle P&L.
  // Add them back at the company level so company revenue isn't understated.
  let companyOnlyFeeRevenue = 0;
  for (const t of inputs.transactions) {
    if (t.status !== "posted") continue;
    if (!inRange(t.effective_date, range.start, range.end)) continue;
    if (!isCompanyOnlyFeeRevenue(t)) continue;
    companyOnlyFeeRevenue += t.amount;
  }
  companyOnlyFeeRevenue = round2(companyOnlyFeeRevenue);

  let overhead = 0;
  let processorFees = 0;
  for (const e of inputs.expenses) {
    if (e.status === "voided") continue;
    if (!inRange(e.transaction_date, range.start, range.end)) continue;
    if (e.vehicle_id || e.rental_id || e.maintenance_work_order_id) continue;
    const net = expenseNet(e);
    if (isAcquisitionExpense(e, inputs.expenseCategories)) continue;
    if (isProcessorFeeExpense(e, inputs.expenseCategories)) {
      processorFees += net;
      continue;
    }
    overhead += net;
  }
  overhead = round2(overhead);
  processorFees = round2(processorFees);

  const operatingRevenue = round2(
    fleet.total_billed_revenue + companyOnlyFeeRevenue,
  );
  const grossFleetProfit = round2(
    fleet.gross_fleet_profit + companyOnlyFeeRevenue,
  );
  const operatingProfit = round2(grossFleetProfit - overhead - processorFees);
  const margin = round2(safeDiv(operatingProfit, operatingRevenue) * 100);

  const unreconciled = inputs.importedTransactions.filter(
    (t) => t.review_status === "unreviewed",
  ).length;
  const missingReceipts = inputs.expenses.filter(
    (e) =>
      e.status === "posted" &&
      e.receipt_required &&
      e.receipt_status === "missing" &&
      !inputs.expenseReceipts.some(
        (r) => r.expense_id === e.id && !r.voided_at,
      ),
  ).length;
  const reimbursementsOutstanding = inputs.expenseReimbursements
    .filter((r) => r.status === "owed" || r.status === "approved")
    .reduce((s, r) => s + r.amount, 0);

  return {
    period_start: fleet.period_start,
    period_end: fleet.period_end,
    operating_revenue: operatingRevenue,
    collections: fleet.total_collections,
    outstanding_receivables: fleet.outstanding_receivables,
    revenue: fleet.revenue,
    fleet_direct_expenses: fleet.vehicle_direct_expenses,
    gross_fleet_profit: grossFleetProfit,
    company_overhead: overhead,
    processor_fees: processorFees,
    partner_compensation: fleet.total_partner_compensation,
    operating_profit: operatingProfit,
    margin_percent: margin,
    acquisition_spend: fleet.acquisition_spend,
    unreconciled_transactions: unreconciled,
    missing_receipts: missingReceipts,
    reimbursements_outstanding: round2(reimbursementsOutstanding),
  };
}

export function getVehiclePerformanceRows(
  inputs: ProfitabilityInputs,
  range: DateRange,
): VehiclePerformanceRow[] {
  return inputs.vehicles.map((v) => {
    const p = getVehicleProfitability(v.id, inputs, range);
    const cls = inputs.vehicleClasses.find((c) => c.id === v.vehicle_class_id);
    return {
      vehicle_id: v.id,
      label: `${v.year} ${v.make} ${v.model}`,
      class_name: cls?.name ?? null,
      ownership_type: p.ownership_type,
      revenue: p.billed_revenue,
      collections: p.collected_amount,
      expenses: p.expenses.total_direct_expenses,
      gross_profit: p.gross_profit,
      company_share: p.company_economic_share,
      utilization: p.utilization_rate,
      margin: round2(safeDiv(p.gross_profit, p.billed_revenue) * 100),
      rented_days: p.rented_days,
    };
  });
}

export function getClassProfitability(
  inputs: ProfitabilityInputs,
  range: DateRange,
): ClassProfitability[] {
  const map = new Map<string | null, ClassProfitability>();
  for (const v of inputs.vehicles) {
    const p = getVehicleProfitability(v.id, inputs, range);
    const cls = inputs.vehicleClasses.find((c) => c.id === v.vehicle_class_id);
    const key = cls?.id ?? null;
    const cur = map.get(key) ?? {
      class_id: key,
      class_name: cls?.name ?? "Unclassified",
      vehicle_count: 0,
      revenue: 0,
      expenses: 0,
      gross_profit: 0,
      utilization: 0,
      revenue_per_vehicle: 0,
    };
    cur.vehicle_count += 1;
    cur.revenue += p.billed_revenue;
    cur.expenses += p.expenses.total_direct_expenses;
    cur.gross_profit += p.gross_profit;
    cur.utilization += p.utilization_rate;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((c) => ({
    ...c,
    revenue: round2(c.revenue),
    expenses: round2(c.expenses),
    gross_profit: round2(c.gross_profit),
    utilization: round2(safeDiv(c.utilization, c.vehicle_count)),
    revenue_per_vehicle: round2(safeDiv(c.revenue, c.vehicle_count)),
  }));
}

export function getLocationProfitability(
  inputs: ProfitabilityInputs,
  range: DateRange,
): LocationProfitability[] {
  const map = new Map<string | null, LocationProfitability>();
  for (const v of inputs.vehicles) {
    const p = getVehicleProfitability(v.id, inputs, range);
    const loc = inputs.locations.find((l) => l.name === v.location);
    const key = loc?.id ?? null;
    const cur = map.get(key) ?? {
      location_id: key,
      location_name: loc?.name ?? v.location ?? "Unassigned",
      vehicle_count: 0,
      revenue: 0,
      expenses: 0,
      gross_profit: 0,
      utilization: 0,
    };
    cur.vehicle_count += 1;
    cur.revenue += p.billed_revenue;
    cur.expenses += p.expenses.total_direct_expenses;
    cur.gross_profit += p.gross_profit;
    cur.utilization += p.utilization_rate;
    map.set(key, cur);
  }
  return Array.from(map.values()).map((c) => ({
    ...c,
    revenue: round2(c.revenue),
    expenses: round2(c.expenses),
    gross_profit: round2(c.gross_profit),
    utilization: round2(safeDiv(c.utilization, c.vehicle_count)),
  }));
}
