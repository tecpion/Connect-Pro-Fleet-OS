// Connect Pro Fleet — Build #18 management summary selector.
//
// Composes existing authoritative selectors into the Management Summary. NO
// new financial logic — every figure derives from the authoritative ledgers.

import type { ReportContext, ReportFilter } from "./reportContext";
import { filterToDateRange } from "./reportInputs";
import {
  getCompanyProfitability,
  getFleetProfitability,
} from "./profitabilitySelectors";
import type {
  CompanyProfitability,
  FleetProfitability,
} from "./profitabilityTypes";
import { getPaymentObligations } from "./billingSelectors";
import {
  getOpenDamageClaims,
  getClaimsRecoveryPending,
  getClaimsAwaitingResponsibility,
  getDamageClaimEconomics,
} from "./damageClaimSelectors";
import type { DamageClaimEconomics } from "./damageClaimTypes";
import {
  isWorkOrderActive,
  isWorkOrderPastExpectedReady,
  getActiveDowntimeWorkOrders,
} from "./maintenanceSelectors";
import {
  getUnreviewedTransactions,
  getSuggestedTransactions,
} from "./reconciliationSelectors";
import { getOverdueTasks, getUnassignedTasks } from "./taskSelectors";
import { isTaskActive } from "./taskSelectors";
import { getOutstandingReimbursementTotal } from "./expenseSelectors";

function inPeriod(iso: string, start: Date, end: Date): boolean {
  const d = new Date(iso);
  return d >= start && d <= end;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ManagementSummary {
  period_start: string;
  period_end: string;
  financial: CompanyProfitability;
  fleet: FleetProfitability;
  rentals: {
    new_rentals: number;
    active_rentals: number;
    completed_rentals: number;
    overdue_rentals: number;
    extensions: number;
    exchanges: number;
  };
  collections: { total_collected: number; late_balances: number };
  maintenance: {
    open_work_orders: number;
    overdue_work_orders: number;
    downtime_active: number;
  };
  damage: {
    open_claims: number;
    recovery_pending: number;
    awaiting_responsibility: number;
    actual_claim_cost: number;
    total_recovery: number;
    net_damage_loss: number;
  };
  accounting_quality: {
    unreconciled_transactions: number;
    suggested_matches: number;
    missing_receipts: number;
    reimbursements_owed: number;
  };
  tasks: {
    open: number;
    overdue: number;
    completed_in_period: number;
    unassigned: number;
  };
}

export function getManagementSummary(
  ctx: ReportContext,
  filter: ReportFilter,
): ManagementSummary {
  const { store, billingPeriods, damageClaims, damageRecoveries, inputs } = ctx;
  const { start, end } = filterToDateRange(filter);
  const financial = getCompanyProfitability(inputs, { start, end });
  const fleet = getFleetProfitability(inputs, { start, end });

  const rentals = store.rentals;
  const newRentals = rentals.filter(
    (r) => r.checkout_date && inPeriod(r.checkout_date, start, end),
  ).length;
  const activeRentals = rentals.filter((r) => r.status === "active").length;
  const completedRentals = rentals.filter(
    (r) =>
      r.status === "completed" &&
      r.actual_return_date &&
      inPeriod(r.actual_return_date, start, end),
  ).length;
  const overdueRentals = rentals.filter(
    (r) => r.status === "overdue" || r.status === "late",
  ).length;
  const extensions = store.rentalEvents.filter(
    (e) => e.type === "extended" && inPeriod(e.at, start, end),
  ).length;
  const exchanges = store.rentalEvents.filter(
    (e) => e.type === "exchanged" && inPeriod(e.at, start, end),
  ).length;

  const obligations = getPaymentObligations(
    store.rentals,
    billingPeriods,
    store.transactions,
  );
  const lateBalances = obligations
    .filter((o) => o.bucket === "late")
    .reduce((s, o) => s + o.amountDue, 0);

  const openWos = store.workOrders.filter(isWorkOrderActive).length;
  const overdueWos = store.workOrders.filter(
    (w) =>
      isWorkOrderPastExpectedReady(w) &&
      w.status !== "completed" &&
      w.status !== "cancelled",
  ).length;
  const downtimeActive = getActiveDowntimeWorkOrders(store.workOrders).length;

  const openClaims = getOpenDamageClaims(damageClaims);
  const ecoMap = new Map<string, DamageClaimEconomics>();
  for (const c of damageClaims) {
    ecoMap.set(
      c.id,
      getDamageClaimEconomics(c, {
        transactions: store.transactions,
        expenses: store.expenses,
        recoveries: damageRecoveries,
      }),
    );
  }
  const recoveryPending = getClaimsRecoveryPending(damageClaims, ecoMap).length;
  const awaitingResp = getClaimsAwaitingResponsibility(damageClaims).length;
  let actualCost = 0;
  let totalRecovery = 0;
  let netLoss = 0;
  for (const c of openClaims) {
    const eco = getDamageClaimEconomics(c, {
      transactions: store.transactions,
      expenses: store.expenses,
      recoveries: damageRecoveries,
    });
    if (eco.actual_cost != null) actualCost += eco.actual_cost;
    totalRecovery += eco.total_recovered;
    if (eco.company_net_loss != null) netLoss += eco.company_net_loss;
  }

  const unreconciled = getUnreviewedTransactions(
    store.importedTransactions,
  ).length;
  const suggested = getSuggestedTransactions(store.importedTransactions).length;
  const reimbursementsOwed = getOutstandingReimbursementTotal(
    store.expenseReimbursements,
  );

  const openTasks = store.tasks.filter(isTaskActive).length;
  const overdueTasks = getOverdueTasks(store.tasks).length;
  const completedInPeriod = store.tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completed_at &&
      inPeriod(t.completed_at, start, end),
  ).length;
  const unassigned = getUnassignedTasks(store.tasks).length;

  return {
    period_start: filter.start,
    period_end: filter.end,
    financial,
    fleet,
    rentals: {
      new_rentals: newRentals,
      active_rentals: activeRentals,
      completed_rentals: completedRentals,
      overdue_rentals: overdueRentals,
      extensions,
      exchanges,
    },
    collections: {
      total_collected: financial.collections,
      late_balances: round2(lateBalances),
    },
    maintenance: {
      open_work_orders: openWos,
      overdue_work_orders: overdueWos,
      downtime_active: downtimeActive,
    },
    damage: {
      open_claims: openClaims.length,
      recovery_pending: recoveryPending,
      awaiting_responsibility: awaitingResp,
      actual_claim_cost: round2(actualCost),
      total_recovery: round2(totalRecovery),
      net_damage_loss: round2(netLoss),
    },
    accounting_quality: {
      unreconciled_transactions: unreconciled,
      suggested_matches: suggested,
      missing_receipts: financial.missing_receipts,
      reimbursements_owed: reimbursementsOwed,
    },
    tasks: {
      open: openTasks,
      overdue: overdueTasks,
      completed_in_period: completedInPeriod,
      unassigned,
    },
  };
}
