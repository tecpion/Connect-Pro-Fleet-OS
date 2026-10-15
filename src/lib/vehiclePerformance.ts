// Connect Pro Fleet — Vehicle Performance / Financial Intelligence (V1).
//
// Owner-facing vehicle economics composed from EXISTING authoritative data:
// rentals, billing (rental ledger), payments, expenses, maintenance, damage
// claims, violations, security deposits, ownership/JV, profitability. This is
// a PRESENTATION/composition layer — it never mutates or duplicates accounting
// truth. All values are derived from the authoritative selectors already built.
//
// Core distinction (never interchangeable):
//   - Gross Revenue Generated : recognized rental revenue generated in-period
//   - Cash Collected          : actual payments collected & allocated in-period
//   - Net Contribution        : revenue minus expenses under the selected view
//
// Deposits: held deposits are NOT revenue. Only applied/forfeited amounts that
// settle a real charge affect economics (via existing deposit authority).
//
// Financing: the FULL monthly car-note payment reduces cash-flow contribution.
// JV/Investor payout is NOT an operating expense — it is a distribution,
// subtracted only in the Company Economics view.
//
// Damage/Violations: net company impact = cost - recovery. A fully-recovered
// damage/violation has zero net impact (never left as a permanent expense).
//
// No depreciation, market value, or opaque score. Lifetime Return =
// cumulative net contribution ÷ purchase price.

import type { Vehicle } from "./types";
import type { DamageClaim, DamageRecovery } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import type { RentalDeposit } from "./depositTypes";
import type { DateRange } from "./profitabilityHelpers";
import { round2, safeDiv } from "./profitabilityHelpers";
import {
  getVehicleProfitability,
  type ProfitabilityInputs,
} from "./profitabilitySelectors";
import { pairingForVehicle } from "./profitabilityInvestor";
import type { PerformanceRange } from "./vehiclePerformanceRanges";
import {
  computeDepositMetrics,
  type DepositMetrics,
} from "./vehiclePerformanceDeposits";
import {
  computeExpenseBreakdown,
  buildFinancingView,
  type ExpenseBreakdownView,
  type FinancingView,
} from "./vehiclePerformanceExpenses";
import {
  computeDamageEconomics,
  type DamageEconomicsView,
} from "./vehiclePerformanceDamage";
import {
  computeViolationEconomics,
  type ViolationEconomicsView,
} from "./vehiclePerformanceViolations";
import {
  computeTimeClassification,
  daysBetween,
  type TimeClassification,
} from "./vehiclePerformanceTime";
import {
  assessPerformance,
  maintenancePctOfRevenue,
  type PerformanceAssessment,
  type PerformanceLabel,
} from "./vehiclePerformanceAssessment";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  type PerformanceThresholds,
} from "./vehiclePerformanceSettings";
import { resolvePriorPerformanceRange } from "./vehiclePerformancePrior";
import {
  computeWhatsChanged,
  type WhatChangedItem,
} from "./vehiclePerformanceWhatsChanged";

export interface VehiclePerformanceInputs extends ProfitabilityInputs {
  deposits: RentalDeposit[];
  damageClaims: DamageClaim[];
  damageRecoveries: DamageRecovery[];
  violations: Violation[];
  workOrders: MaintenanceWorkOrder[];
}

export interface VehiclePerformance {
  vehicleId: string;
  vehicleLabel: string;
  plate: string;
  periodStart: string;
  periodEnd: string;
  range: PerformanceRange;
  grossRevenueGenerated: number;
  cashCollected: number;
  outstanding: number;
  totalExpenses: number;
  netContribution: number;
  purchasePrice: number;
  lifetimeReturn: number;
  acquisitionBasisFullyRecovered: boolean;
  acquisitionBasisRecoveredPct: number;
  deposits: DepositMetrics;
  expenseBreakdown: ExpenseBreakdownView;
  financing: FinancingView;
  damage: DamageEconomicsView;
  violations: ViolationEconomicsView;
  operatingContribution: number;
  cashFlowContribution: number;
  hasInvestor: boolean;
  investorPayout: number | null;
  companyNetContribution: number | null;
  fleetUtilization: number;
  rentableUtilization: number;
  time: TimeClassification;
  revenuePerRentedDay: number;
  revenuePerCalendarDay: number;
  netContributionPerCalendarDay: number;
  timeInFleetDays: number;
  /** Transparent performance label + reasons + helping/hurting. No opaque score. */
  performance: PerformanceAssessment;
  /** What changed vs a prior period, if comparison data exists. Empty when no comparison. */
  whatsChanged: WhatChangedItem[];
  /** Data-availability flags surfaced as missing-data states (never invented zeros). */
  dataMissing: {
    purchasePrice: boolean;
    expenses: boolean;
    financing: boolean;
    completedRentals: boolean;
    insurance: boolean;
  };
}

function vehicleLabel(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model}`.trim();
}

/**
 * Compute the full Vehicle Performance result for one vehicle over a range.
 * Composes the existing profitability selector with deposit/damage/violation/
 * financing/utilization economics. Pure function — no domain mutation.
 */
export function getVehiclePerformance(
  vehicleId: string,
  inputs: VehiclePerformanceInputs,
  range: DateRange,
  rangeKey: PerformanceRange = "lifetime",
  now: Date = new Date(),
  lifetimeStart?: string,
  /** Internal: skip whatsChanged recursion when computing the prior period. */
  _skipWhatsChanged = false,
): VehiclePerformance {
  const vehicle = inputs.vehicles.find((v) => v.id === vehicleId);
  const label = vehicle ? vehicleLabel(vehicle) : vehicleId;
  const plate = vehicle?.license_plate ?? "";

  const base = getVehicleProfitability(vehicleId, inputs, range);

  const { breakdown, financingPayments } = computeExpenseBreakdown(
    inputs,
    vehicleId,
    range,
  );

  const depositMetrics = computeDepositMetrics(
    inputs.deposits,
    vehicleId,
    range,
  );

  const damage = computeDamageEconomics(
    inputs.transactions,
    inputs.expenses,
    inputs.damageClaims,
    inputs.damageRecoveries,
    vehicleId,
    range,
  );

  const violations = computeViolationEconomics(
    inputs.transactions,
    inputs.expenses,
    inputs.violations,
    vehicleId,
    range,
  );

  const time = computeTimeClassification(
    inputs.rentals,
    inputs.exchanges,
    inputs.workOrders,
    inputs.damageClaims,
    vehicleId,
    range,
    vehicle,
  );

  const totalExpenses = round2(
    breakdown.total + damage.netCompanyImpact + violations.netCompanyImpact,
  );

  const operatingContribution = round2(base.billed_revenue - totalExpenses);

  const purchasePrice = vehicle?.purchase_price ?? 0;
  const financing = buildFinancingView(financingPayments, purchasePrice <= 0);
  const cashFlowContribution = round2(
    operatingContribution - financing.carNotePayments,
  );
  const netContribution = cashFlowContribution;

  const pairing = pairingForVehicle(vehicleId, inputs.investorVehicles);
  const hasInvestor = pairing != null;
  const investorPayout = base.investor_compensation;
  const companyNetContribution = hasInvestor
    ? round2(operatingContribution - (investorPayout ?? 0))
    : null;

  const fleetUtilization = round2(
    safeDiv(time.rentedDays, time.calendarDays) * 100,
  );
  const rentableDays = Math.max(
    0,
    time.calendarDays -
      time.maintenanceDowntimeDays -
      time.damageDowntimeDays -
      time.otherUnavailableDays,
  );
  const rentableUtilization = round2(
    safeDiv(time.rentedDays, rentableDays) * 100,
  );

  const revenuePerRentedDay = round2(
    safeDiv(base.billed_revenue, time.rentedDays),
  );
  const revenuePerCalendarDay = round2(
    safeDiv(base.billed_revenue, time.calendarDays),
  );
  const netContributionPerCalendarDay = round2(
    safeDiv(netContribution, time.calendarDays),
  );

  const lifetimeReturn =
    purchasePrice > 0 ? round2((netContribution / purchasePrice) * 100) : 0;
  const acquisitionBasisFullyRecovered =
    netContribution >= purchasePrice && purchasePrice > 0;
  const acquisitionBasisRecoveredPct =
    purchasePrice > 0
      ? round2(Math.min(100, (netContribution / purchasePrice) * 100))
      : 0;

  const timeInFleetDays = vehicle?.purchase_date
    ? daysBetween(vehicle.purchase_date, new Date().toISOString().slice(0, 10))
    : 0;

  const downtimeDays = time.maintenanceDowntimeDays + time.damageDowntimeDays;
  const maintPct = maintenancePctOfRevenue(
    breakdown.maintenance,
    base.billed_revenue,
  );
  const performance = assessPerformance(
    base.billed_revenue,
    netContribution,
    rentableUtilization,
    time.rentableIdleDays,
    downtimeDays,
    financing.financingState,
    DEFAULT_PERFORMANCE_THRESHOLDS,
    maintPct,
  );

  const dataMissing = {
    purchasePrice: purchasePrice <= 0,
    expenses: breakdown.total <= 0,
    financing: !financing.hasFinancingData,
    completedRentals: time.rentedDays <= 0,
    insurance: breakdown.insurance <= 0,
  };

  return {
    vehicleId,
    vehicleLabel: label,
    plate,
    periodStart: range.start.toISOString().slice(0, 10),
    periodEnd: range.end.toISOString().slice(0, 10),
    range: rangeKey,
    grossRevenueGenerated: round2(base.billed_revenue),
    cashCollected: round2(base.collected_amount),
    outstanding: round2(base.outstanding_balance),
    totalExpenses,
    netContribution,
    purchasePrice,
    lifetimeReturn,
    acquisitionBasisFullyRecovered,
    acquisitionBasisRecoveredPct,
    deposits: depositMetrics,
    expenseBreakdown: breakdown,
    financing,
    damage,
    violations,
    operatingContribution,
    cashFlowContribution,
    hasInvestor,
    investorPayout,
    companyNetContribution,
    fleetUtilization,
    rentableUtilization,
    time,
    revenuePerRentedDay,
    revenuePerCalendarDay,
    netContributionPerCalendarDay,
    timeInFleetDays,
    performance,
    whatsChanged: _skipWhatsChanged
      ? []
      : computeWhatsChanged(
          vehicleId,
          inputs,
          range,
          resolvePriorPerformanceRange(rangeKey, now, lifetimeStart),
          rangeKey,
          now,
          lifetimeStart,
        ).items,
    dataMissing,
  };
}

// ---------------------------------------------------------------------------
// Fleet-level performance table
// ---------------------------------------------------------------------------

export interface FleetPerformanceRow {
  vehicleId: string;
  vehicleLabel: string;
  grossRevenue: number;
  cashCollected: number;
  expenses: number;
  netContribution: number;
  fleetUtilization: number;
  rentableIdleDays: number;
  downtimeDays: number;
  lifetimeReturn: number;
}

export function getFleetPerformanceRows(
  inputs: VehiclePerformanceInputs,
  range: DateRange,
  rangeKey: PerformanceRange = "lifetime",
): FleetPerformanceRow[] {
  return inputs.vehicles.map((v) => {
    const p = getVehiclePerformance(v.id, inputs, range, rangeKey);
    return {
      vehicleId: p.vehicleId,
      vehicleLabel: p.vehicleLabel,
      grossRevenue: p.grossRevenueGenerated,
      cashCollected: p.cashCollected,
      expenses: p.totalExpenses,
      netContribution: p.netContribution,
      fleetUtilization: p.fleetUtilization,
      rentableIdleDays: p.time.rentableIdleDays,
      downtimeDays: p.time.maintenanceDowntimeDays + p.time.damageDowntimeDays,
      lifetimeReturn: p.lifetimeReturn,
    };
  });
}
