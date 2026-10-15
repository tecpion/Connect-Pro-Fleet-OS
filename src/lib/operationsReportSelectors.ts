// Connect Pro Fleet — Build #18 operations report selectors.
//
// Rental activity, tasks, and staff activity/workload reports. Staff activity
// is factual only — no productivity scoring or gamification.

import type { ReportContext, ReportFilter } from "./reportContext";
import { filterToDateRange } from "./reportInputs";
import {
  isTaskActive,
  getOverdueTasks,
  getUnassignedTasks,
} from "./taskSelectors";
import { getOpenDamageClaims } from "./damageClaimSelectors";
import { inRange } from "./reconciliationSelectors";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Rental Activity Report
// ---------------------------------------------------------------------------

export interface RentalActivityReport {
  started: number;
  active: number;
  completed: number;
  extended: number;
  exchanged: number;
  overdue: number;
  by_model: { model: string; count: number }[];
}

export function getRentalActivityReport(
  ctx: ReportContext,
  filter: ReportFilter,
): RentalActivityReport {
  const { store } = ctx;
  const { start, end } = filterToDateRange(filter);
  const inPeriod = (iso: string | null) =>
    iso ? inRange(iso, start, end) : false;
  const rentals = store.rentals;
  const started = rentals.filter((r) => inPeriod(r.checkout_date)).length;
  const active = rentals.filter((r) => r.status === "active").length;
  const completed = rentals.filter(
    (r) => r.status === "completed" && inPeriod(r.actual_return_date),
  ).length;
  const extended = store.rentalEvents.filter(
    (e) => e.type === "extended" && inPeriod(e.at),
  ).length;
  const exchanged = store.rentalEvents.filter(
    (e) => e.type === "exchanged" && inPeriod(e.at),
  ).length;
  const overdue = rentals.filter(
    (r) => r.status === "overdue" || r.status === "late",
  ).length;

  const modelMap = new Map<string, number>();
  for (const r of rentals) {
    modelMap.set(r.rate_type, (modelMap.get(r.rate_type) ?? 0) + 1);
  }

  return {
    started,
    active,
    completed,
    extended,
    exchanged,
    overdue,
    by_model: Array.from(modelMap.entries()).map(([model, count]) => ({
      model,
      count,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tasks Report
// ---------------------------------------------------------------------------

export interface TasksReport {
  open: number;
  in_progress: number;
  completed_in_period: number;
  overdue: number;
  urgent: number;
  unassigned: number;
  by_category: { category: string; count: number }[];
  by_assignee: { assignee: string; open: number; overdue: number }[];
}

export function getTasksReport(
  ctx: ReportContext,
  filter: ReportFilter,
): TasksReport {
  const { store } = ctx;
  const { start, end } = filterToDateRange(filter);
  const inPeriod = (iso: string | null) =>
    iso ? inRange(iso, start, end) : false;
  const tasks = store.tasks;
  const open = tasks.filter((t) => t.status === "open").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completedInPeriod = tasks.filter(
    (t) => t.status === "completed" && inPeriod(t.completed_at),
  ).length;
  const overdue = getOverdueTasks(tasks).length;
  const urgent = tasks.filter(
    (t) => isTaskActive(t) && t.priority === "urgent",
  ).length;
  const unassigned = getUnassignedTasks(tasks).length;

  const catMap = new Map<string, number>();
  for (const t of tasks) {
    if (!isTaskActive(t)) continue;
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + 1);
  }
  const assigneeMap = new Map<string, { open: number; overdue: number }>();
  for (const t of tasks) {
    if (!isTaskActive(t)) continue;
    const key = t.assigned_to_user_id ?? "unassigned";
    const cur = assigneeMap.get(key) ?? { open: 0, overdue: 0 };
    cur.open += 1;
    assigneeMap.set(key, cur);
  }
  for (const t of getOverdueTasks(tasks)) {
    const key = t.assigned_to_user_id ?? "unassigned";
    const cur = assigneeMap.get(key) ?? { open: 0, overdue: 0 };
    cur.overdue += 1;
    assigneeMap.set(key, cur);
  }

  return {
    open,
    in_progress: inProgress,
    completed_in_period: completedInPeriod,
    overdue,
    urgent,
    unassigned,
    by_category: Array.from(catMap.entries()).map(([category, count]) => ({
      category,
      count,
    })),
    by_assignee: Array.from(assigneeMap.entries()).map(([aid, v]) => ({
      assignee:
        aid === "unassigned"
          ? "Unassigned"
          : (store.staff.find((s) => s.id === aid)?.full_name ?? "—"),
      open: v.open,
      overdue: v.overdue,
    })),
  };
}

// ---------------------------------------------------------------------------
// Staff Activity & Workload Report
// ---------------------------------------------------------------------------

export interface StaffWorkloadRow {
  staff_id: string;
  name: string;
  open_tasks: number;
  overdue_tasks: number;
  open_claims: number;
  open_work_orders: number;
}

export interface StaffActivityRow {
  staff_id: string;
  name: string;
  tasks_completed: number;
}

export interface StaffActivityReport {
  workload: StaffWorkloadRow[];
  activity: StaffActivityRow[];
}

export function getStaffActivityReport(
  ctx: ReportContext,
  filter: ReportFilter,
): StaffActivityReport {
  const { store, damageClaims } = ctx;
  const { start, end } = filterToDateRange(filter);
  const inPeriod = (iso: string) => inRange(iso, start, end);

  const workload: StaffWorkloadRow[] = store.staff.map((s) => {
    const openTasks = store.tasks.filter(
      (t) => isTaskActive(t) && t.assigned_to_user_id === s.id,
    ).length;
    const overdueTasks = store.tasks.filter(
      (t) =>
        isTaskActive(t) &&
        t.assigned_to_user_id === s.id &&
        getOverdueTasks([t]).length > 0,
    ).length;
    const openClaims = damageClaims.filter(
      (c) => c.assigned_user_id === s.id && getOpenDamageClaims([c]).length > 0,
    ).length;
    const openWos = store.workOrders.filter(
      (w) =>
        w.assigned_user_id === s.id &&
        w.status !== "completed" &&
        w.status !== "cancelled",
    ).length;
    return {
      staff_id: s.id,
      name: s.full_name,
      open_tasks: openTasks,
      overdue_tasks: overdueTasks,
      open_claims: openClaims,
      open_work_orders: openWos,
    };
  });

  const activityMap = new Map<string, number>();
  for (const t of store.tasks) {
    if (
      t.status === "completed" &&
      t.completed_at &&
      inPeriod(t.completed_at)
    ) {
      const key = t.completed_by_user_id ?? "system";
      activityMap.set(key, (activityMap.get(key) ?? 0) + 1);
    }
  }
  const activity: StaffActivityRow[] = store.staff.map((s) => ({
    staff_id: s.id,
    name: s.full_name,
    tasks_completed: activityMap.get(s.id) ?? 0,
  }));

  return { workload, activity };
}

export { round2 };
