// Connect Pro Fleet — Build #18 daily & weekly operating report selectors.

import type { ReportContext, ReportFilter } from "./reportContext";
import { filterToDateRange } from "./reportInputs";
import { getFleetProfitability } from "./profitabilitySelectors";
import { getPaymentObligations } from "./billingSelectors";
import { getBrokenArrangements } from "./paymentArrangements";
import { getOpenDamageClaims } from "./damageClaimSelectors";
import { getActiveDowntimeWorkOrders } from "./maintenanceSelectors";
import { getOverdueTasks, getUnassignedTasks } from "./taskSelectors";
import { isTaskActive } from "./taskSelectors";
import { startOfDay, DAY } from "./expenseSelectors";
import { endOfDay } from "./profitabilityHelpers";

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DailyOperatingReport {
  date: string;
  pickups_today: { rental_id: string; customer: string; vehicle: string }[];
  returns_today: { rental_id: string; customer: string; vehicle: string }[];
  overdue_rentals: { rental_id: string; customer: string; vehicle: string }[];
  payments_due_today: { rental_id: string; customer: string; amount: number }[];
  late_payments: { rental_id: string; customer: string; amount: number }[];
  broken_arrangements: {
    arrangement_id: string;
    customer: string;
    amount: number;
  }[];
  vehicles_in_maintenance: number;
  open_urgent_tasks: number;
  unassigned_system_tasks: number;
  open_damage_claims: number;
  deposits_needing_action: number;
}

export function getDailyOperatingReport(
  ctx: ReportContext,
  date: Date,
): DailyOperatingReport {
  const { store, billingPeriods, damageClaims } = ctx;
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const sameDay = (iso: string) => {
    const d = new Date(iso);
    return d >= dayStart && d <= dayEnd;
  };
  const customerName = (id: string) => store.customerName(id);
  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.make} ${v.model}` : "—";
  };

  const pickups = store.rentals.filter(
    (r) => r.checkout_date && sameDay(r.checkout_date),
  );
  const returns = store.rentals.filter(
    (r) => r.scheduled_return_date && sameDay(r.scheduled_return_date),
  );
  const overdue = store.rentals.filter(
    (r) => r.status === "overdue" || r.status === "late",
  );

  const obligations = getPaymentObligations(
    store.rentals,
    billingPeriods,
    store.transactions,
  );
  const dueToday = obligations.filter((o) => o.bucket === "due_today");
  const late = obligations.filter((o) => o.bucket === "late");

  const installmentsByArr = (id: string) =>
    store.arrangementInstallments.filter((i) => i.arrangement_id === id);
  const broken = getBrokenArrangements(
    store.paymentArrangements,
    installmentsByArr,
    store.transactions,
  );

  const vehiclesInMaintenance = store.vehicles.filter(
    (v) => v.status === "maintenance" || v.status === "out_of_service",
  ).length;
  const urgentTasks = store.tasks.filter(
    (t) => isTaskActive(t) && t.priority === "urgent",
  ).length;
  const unassigned = getUnassignedTasks(store.tasks).length;
  const openClaims = getOpenDamageClaims(damageClaims).length;
  const depositsAction = (store.rentalDeposits ?? []).filter(
    (d) =>
      d.status === "refund_pending" ||
      d.status === "required" ||
      d.status === "pending",
  ).length;

  return {
    date: dayStart.toISOString().slice(0, 10),
    pickups_today: pickups.map((r) => ({
      rental_id: r.id,
      customer: customerName(r.customer_id),
      vehicle: vehicleLabel(r.vehicle_id),
    })),
    returns_today: returns.map((r) => ({
      rental_id: r.id,
      customer: customerName(r.customer_id),
      vehicle: vehicleLabel(r.vehicle_id),
    })),
    overdue_rentals: overdue.map((r) => ({
      rental_id: r.id,
      customer: customerName(r.customer_id),
      vehicle: vehicleLabel(r.vehicle_id),
    })),
    payments_due_today: dueToday.map((o) => {
      const r = store.rentals.find((x) => x.id === o.rentalId);
      return {
        rental_id: o.rentalId,
        customer: r ? customerName(r.customer_id) : "—",
        amount: o.amountDue,
      };
    }),
    late_payments: late.map((o) => {
      const r = store.rentals.find((x) => x.id === o.rentalId);
      return {
        rental_id: o.rentalId,
        customer: r ? customerName(r.customer_id) : "—",
        amount: o.amountDue,
      };
    }),
    broken_arrangements: broken.map((a) => ({
      arrangement_id: a.id,
      customer: customerName(a.customer_id),
      amount: a.arrangement_amount,
    })),
    vehicles_in_maintenance: vehiclesInMaintenance,
    open_urgent_tasks: urgentTasks,
    unassigned_system_tasks: unassigned,
    open_damage_claims: openClaims,
    deposits_needing_action: depositsAction,
  };
}

export interface WeeklyOperatingReport {
  week_start: string;
  week_end: string;
  rentals_started: number;
  rentals_completed: number;
  extensions: number;
  exchanges: number;
  utilization: number;
  collections: number;
  billed_revenue: number;
  late_balances: number;
  late_fees_assessed: number;
  maintenance_spend: number;
  maintenance_downtime_active: number;
  damage_claims_created: number;
  damage_claims_resolved: number;
  expenses_recorded: number;
  tasks_completed: number;
  tasks_overdue: number;
}

export function getWeeklyOperatingReport(
  ctx: ReportContext,
  weekStart: Date,
): WeeklyOperatingReport {
  const { store, billingPeriods, damageClaims, inputs } = ctx;
  const start = startOfDay(weekStart);
  const end = endOfDay(new Date(start.getTime() + 6 * DAY_MS));
  const inWeek = (iso: string) => {
    const d = new Date(iso);
    return d >= start && d <= end;
  };

  const fleet = getFleetProfitability(inputs, { start, end });

  const rentalsStarted = store.rentals.filter(
    (r) => r.checkout_date && inWeek(r.checkout_date),
  ).length;
  const rentalsCompleted = store.rentals.filter(
    (r) =>
      r.status === "completed" &&
      r.actual_return_date &&
      inWeek(r.actual_return_date),
  ).length;
  const extensions = store.rentalEvents.filter(
    (e) => e.type === "extended" && inWeek(e.at),
  ).length;
  const exchanges = store.rentalEvents.filter(
    (e) => e.type === "exchanged" && inWeek(e.at),
  ).length;

  const obligations = getPaymentObligations(
    store.rentals,
    billingPeriods,
    store.transactions,
  );
  const lateBalances = obligations
    .filter((o) => o.bucket === "late")
    .reduce((s, o) => s + o.amountDue, 0);

  const lateFeesAssessed = store.transactions
    .filter(
      (t) =>
        t.status === "posted" &&
        t.transaction_type === "late_fee" &&
        inWeek(t.effective_date),
    )
    .reduce((s, t) => s + t.amount, 0);

  const maintenanceSpend = store.expenses
    .filter(
      (e) =>
        e.status !== "voided" &&
        inWeek(e.transaction_date) &&
        e.maintenance_work_order_id,
    )
    .reduce((s, e) => s + (e.reversal_of ? -e.amount : e.amount), 0);

  const downtimeActive = getActiveDowntimeWorkOrders(store.workOrders).length;

  const damageCreated = damageClaims.filter((c) =>
    inWeek(c.discovered_at),
  ).length;
  const damageResolved = damageClaims.filter(
    (c) =>
      (c.claim_status === "resolved" || c.claim_status === "closed") &&
      c.closed_at &&
      inWeek(c.closed_at),
  ).length;

  const expensesRecorded = store.expenses
    .filter((e) => e.status !== "voided" && inWeek(e.transaction_date))
    .reduce((s, e) => s + (e.reversal_of ? -e.amount : e.amount), 0);

  const tasksCompleted = store.tasks.filter(
    (t) => t.status === "completed" && t.completed_at && inWeek(t.completed_at),
  ).length;
  const tasksOverdue = getOverdueTasks(store.tasks).length;

  return {
    week_start: start.toISOString().slice(0, 10),
    week_end: end.toISOString().slice(0, 10),
    rentals_started: rentalsStarted,
    rentals_completed: rentalsCompleted,
    extensions,
    exchanges,
    utilization: fleet.utilization,
    collections: fleet.total_collections,
    billed_revenue: fleet.total_billed_revenue,
    late_balances: round2(lateBalances),
    late_fees_assessed: round2(lateFeesAssessed),
    maintenance_spend: round2(maintenanceSpend),
    maintenance_downtime_active: downtimeActive,
    damage_claims_created: damageCreated,
    damage_claims_resolved: damageResolved,
    expenses_recorded: round2(expensesRecorded),
    tasks_completed: tasksCompleted,
    tasks_overdue: tasksOverdue,
  };
}

export { DAY_MS };
