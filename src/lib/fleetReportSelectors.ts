// Connect Pro Fleet — Build #18 fleet report selectors.
//
// Vehicle performance, utilization, class/location aggregation, maintenance,
// vendor, and damage-claim reports. Vehicle performance reuses Build #16
// profitability selectors (never recalculates P&L). Maintenance spend uses
// linked ExpenseTransactions (counted once, never WO cost + expense).

import type { ReportContext, ReportFilter } from "./reportContext";
import { filterToDateRange } from "./reportInputs";
import {
  getVehiclePerformanceRows,
  getClassProfitability,
  getLocationProfitability,
} from "./profitabilitySelectors";
import type { VehiclePerformanceRow } from "./profitabilityTypes";
import {
  isWorkOrderActive,
  isWorkOrderPastExpectedReady,
  getActiveDowntimeWorkOrders,
  getWorkOrdersForVendor,
  getWorkOrderCost,
  getDowntimeDuration,
} from "./maintenanceSelectors";
import {
  getOpenDamageClaims,
  getClaimsRecoveryPending,
  getClaimsAwaitingResponsibility,
  getDamageClaimEconomics,
  getClaimAge,
} from "./damageClaimSelectors";
import type { DamageClaim } from "./damageClaimTypes";
import type { DamageClaimEconomics } from "./damageClaimTypes";
import { inRange } from "./reconciliationSelectors";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Vehicle Performance Report (reuses Build #16)
// ---------------------------------------------------------------------------

export interface VehiclePerformanceReport {
  rows: VehiclePerformanceRow[];
}

export function getVehiclePerformanceReport(
  ctx: ReportContext,
  filter: ReportFilter,
): VehiclePerformanceReport {
  const { inputs } = ctx;
  const { start, end } = filterToDateRange(filter);
  const rows = getVehiclePerformanceRows(inputs, { start, end });
  return { rows };
}

// ---------------------------------------------------------------------------
// Maintenance Report
// ---------------------------------------------------------------------------

export interface MaintenanceReport {
  total_spend: number;
  open_work_orders: number;
  completed_work_orders: number;
  overdue_work_orders: number;
  average_downtime_ms: number;
  total_downtime_active: number;
  by_status: { status: string; count: number }[];
  by_vehicle: {
    vehicle_id: string;
    vehicle: string;
    spend: number;
    work_orders: number;
  }[];
  by_vendor: {
    vendor_id: string;
    vendor: string;
    work_orders: number;
    spend: number;
  }[];
  upcoming_service: number;
}

export function getMaintenanceReport(
  ctx: ReportContext,
  filter: ReportFilter,
): MaintenanceReport {
  const { store } = ctx;
  const { start, end } = filterToDateRange(filter);
  const inPeriod = (iso: string | null) =>
    iso ? inRange(iso, start, end) : false;

  const wos = store.workOrders;
  const openWos = wos.filter(isWorkOrderActive);
  const completed = wos.filter(
    (w) => w.status === "completed" && inPeriod(w.completed_at),
  );
  const overdue = wos.filter(
    (w) =>
      isWorkOrderPastExpectedReady(w) &&
      w.status !== "completed" &&
      w.status !== "cancelled",
  );
  const downtimeActive = getActiveDowntimeWorkOrders(wos);

  // Spend from linked expenses (authoritative, counted once)
  const maintenanceExpenses = store.expenses.filter(
    (e) =>
      e.status !== "voided" &&
      inPeriod(e.transaction_date) &&
      e.maintenance_work_order_id,
  );
  const totalSpend = maintenanceExpenses.reduce(
    (s, e) => s + (e.reversal_of ? -e.amount : e.amount),
    0,
  );

  // By status
  const statusMap = new Map<string, number>();
  for (const w of wos) {
    statusMap.set(w.status, (statusMap.get(w.status) ?? 0) + 1);
  }

  // By vehicle
  const vehMap = new Map<string, { spend: number; count: number }>();
  for (const e of maintenanceExpenses) {
    if (!e.vehicle_id) continue;
    const cur = vehMap.get(e.vehicle_id) ?? { spend: 0, count: 0 };
    cur.spend += e.reversal_of ? -e.amount : e.amount;
    vehMap.set(e.vehicle_id, cur);
  }
  for (const w of wos) {
    const cur = vehMap.get(w.vehicle_id) ?? { spend: 0, count: 0 };
    cur.count += 1;
    vehMap.set(w.vehicle_id, cur);
  }
  const byVehicle = Array.from(vehMap.entries())
    .map(([vid, v]) => {
      const veh = store.vehicles.find((x) => x.id === vid);
      return {
        vehicle_id: vid,
        vehicle: veh ? `${veh.make} ${veh.model}` : "—",
        spend: round2(v.spend),
        work_orders: v.count,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  // By vendor
  const vendorMap = new Map<string, { spend: number; count: number }>();
  for (const w of wos) {
    if (!w.vendor_id) continue;
    const cur = vendorMap.get(w.vendor_id) ?? { spend: 0, count: 0 };
    cur.count += 1;
    const cost = getWorkOrderCost(w);
    if (w.status === "completed" && inPeriod(w.completed_at) && cost != null) {
      cur.spend += cost;
    }
    vendorMap.set(w.vendor_id, cur);
  }
  const byVendor = Array.from(vendorMap.entries())
    .map(([vid, v]) => {
      const vendor = store.maintenanceVendors.find((x) => x.id === vid);
      return {
        vendor_id: vid,
        vendor: vendor?.name ?? "—",
        work_orders: v.count,
        spend: round2(v.spend),
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const avgDowntime =
    downtimeActive.length > 0
      ? downtimeActive.reduce((s, w) => s + getDowntimeDuration(w), 0) /
        downtimeActive.length
      : 0;

  const upcoming = wos.filter(
    (w) => w.status === "scheduled" && w.scheduled_start_at,
  ).length;

  return {
    total_spend: round2(totalSpend),
    open_work_orders: openWos.length,
    completed_work_orders: completed.length,
    overdue_work_orders: overdue.length,
    average_downtime_ms: Math.round(avgDowntime),
    total_downtime_active: downtimeActive.length,
    by_status: Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    })),
    by_vehicle: byVehicle,
    by_vendor: byVendor,
    upcoming_service: upcoming,
  };
}

// ---------------------------------------------------------------------------
// Damage Claims Report
// ---------------------------------------------------------------------------

export interface DamageClaimReportRow {
  claim_id: string;
  claim_number: string;
  vehicle: string;
  customer: string;
  status: string;
  responsibility: string;
  age_days: number;
  actual_cost: number | null;
  customer_charged: number;
  customer_recovered: number;
  deposit_applied: number;
  insurance_recovered: number;
  total_recovery: number;
  net_loss: number | null;
  outstanding_damage_balance: number;
}

export interface DamageClaimsReport {
  rows: DamageClaimReportRow[];
  open_count: number;
  recovery_pending_count: number;
  awaiting_responsibility_count: number;
  total_actual_cost: number;
  total_recovery: number;
  total_net_loss: number;
}

export function getDamageClaimsReport(ctx: ReportContext): DamageClaimsReport {
  const { store, damageClaims, damageRecoveries } = ctx;
  const open = getOpenDamageClaims(damageClaims);
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
  const recoveryPending = getClaimsRecoveryPending(damageClaims, ecoMap);
  const awaiting = getClaimsAwaitingResponsibility(damageClaims);

  const rows: DamageClaimReportRow[] = damageClaims.map((c) => {
    const eco = getDamageClaimEconomics(c, {
      transactions: store.transactions,
      expenses: store.expenses,
      recoveries: damageRecoveries,
    });
    const veh = store.vehicles.find((v) => v.id === c.vehicle_id);
    const cust = c.customer_id ? store.customerName(c.customer_id) : "—";
    return {
      claim_id: c.id,
      claim_number: c.claim_number,
      vehicle: veh ? `${veh.make} ${veh.model}` : "—",
      customer: cust,
      status: c.claim_status,
      responsibility: c.responsibility_status,
      age_days: getClaimAge(c),
      actual_cost: eco.actual_cost,
      customer_charged: round2(eco.customer_charged),
      customer_recovered: round2(eco.customer_paid),
      deposit_applied: round2(eco.deposit_applied),
      insurance_recovered: round2(eco.insurance_recovered),
      total_recovery: round2(eco.total_recovered),
      net_loss: eco.company_net_loss,
      outstanding_damage_balance: round2(
        eco.outstanding_customer_damage_balance,
      ),
    };
  });
  rows.sort((a, b) => (b.net_loss ?? 0) - (a.net_loss ?? 0));

  let totalActual = 0;
  let totalRecovery = 0;
  let totalLoss = 0;
  for (const c of damageClaims) {
    const eco = getDamageClaimEconomics(c, {
      transactions: store.transactions,
      expenses: store.expenses,
      recoveries: damageRecoveries,
    });
    if (eco.actual_cost != null) totalActual += eco.actual_cost;
    totalRecovery += eco.total_recovered;
    if (eco.company_net_loss != null) totalLoss += eco.company_net_loss;
  }

  return {
    rows,
    open_count: open.length,
    recovery_pending_count: recoveryPending.length,
    awaiting_responsibility_count: awaiting.length,
    total_actual_cost: round2(totalActual),
    total_recovery: round2(totalRecovery),
    total_net_loss: round2(totalLoss),
  };
}

// ---------------------------------------------------------------------------
// Class & Location reports (reuse Build #16 aggregations)
// ---------------------------------------------------------------------------

export function getClassReport(ctx: ReportContext, filter: ReportFilter) {
  const { inputs } = ctx;
  const { start, end } = filterToDateRange(filter);
  return getClassProfitability(inputs, { start, end });
}

export function getLocationReport(ctx: ReportContext, filter: ReportFilter) {
  const { inputs } = ctx;
  const { start, end } = filterToDateRange(filter);
  return getLocationProfitability(inputs, { start, end });
}

export type { DamageClaim };
