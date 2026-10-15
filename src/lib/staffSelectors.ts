// Connect Pro Fleet — staff workload & assignment selectors (Build #24).
//
// Pure selectors that compose existing domain stores (tasks, rentals, work
// orders, damage claims, operational assignments) into per-staff workload
// summaries. Workload is OPERATIONAL (counts of open work), never employee
// performance scoring. Financial values are only surfaced when the caller has
// the relevant financial permission — selectors accept a `canSeeFinancials`
// flag so the UI can hide dollar amounts from staff without financial perms.

import type { Task } from "./taskTypes";
import type { RentalAgreement } from "./types";
import type { MaintenanceWorkOrder } from "./maintenanceTypes";
import type { DamageClaim } from "./damageClaimTypes";
import type {
  OperationalStaffAssignment,
  OperationalAssignmentType,
  AssignmentEntityType,
} from "./staffTypes";

export interface WorkloadInputs {
  tasks: Task[];
  rentals: RentalAgreement[];
  workOrders: MaintenanceWorkOrder[];
  damageClaims: DamageClaim[];
  assignments: OperationalStaffAssignment[];
}

export interface WorkloadBreakdownItem {
  label: string;
  count: number;
}

export interface StaffWorkloadSummary {
  staffId: string;
  openTasks: number;
  overdueTasks: number;
  /** Tasks due today (not overdue). */
  dueTodayTasks: number;
  /** Open tasks with urgent/high priority. */
  urgentTasks: number;
  activeRentals: number;
  lateAccounts: number;
  openMaintenance: number;
  openDamageClaims: number;
  totalActiveAssignments: number;
  /** Transparent breakdown for display (no fake "points"). */
  breakdown: WorkloadBreakdownItem[];
  /** True when the staff member has no open work at all. */
  hasNoWork: boolean;
}

const ACTIVE_TASK_STATUSES = ["open", "in_progress"];
const ACTIVE_WO_STATUSES = [
  "open",
  "scheduled",
  "in_progress",
  "waiting_for_parts",
  "waiting_for_approval",
];
const ACTIVE_CLAIM_STATUSES = [
  "open",
  "under_review",
  "customer_responsible",
  "insurance_pending",
  "repair_in_progress",
  "recovery_pending",
];
const ACTIVE_RENTAL_STATUSES = [
  "active",
  "payment_due",
  "late",
  "overdue",
  "return_pending",
];

function isOverdue(t: Task, now: Date): boolean {
  if (!ACTIVE_TASK_STATUSES.includes(t.status)) return false;
  if (!t.due_date) return false;
  const due = new Date(t.due_date + (t.due_time ? `T${t.due_time}` : "T23:59"));
  return due < now;
}

/** Due today = due date is today (calendar day) and not already overdue. */
function isDueToday(t: Task, now: Date): boolean {
  if (!ACTIVE_TASK_STATUSES.includes(t.status)) return false;
  if (!t.due_date) return false;
  if (isOverdue(t, now)) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(t.due_date + "T00:00");
  return due.getTime() === today.getTime();
}

export function staffWorkloadSummary(
  inputs: WorkloadInputs,
  staffId: string,
  now: Date = new Date(),
): StaffWorkloadSummary {
  const { tasks, rentals, workOrders, damageClaims, assignments } = inputs;

  const staffTasks = tasks.filter(
    (t) =>
      t.assigned_to_user_id === staffId &&
      ACTIVE_TASK_STATUSES.includes(t.status),
  );
  const overdueTasks = staffTasks.filter((t) => isOverdue(t, now));
  const dueTodayTasks = staffTasks.filter((t) => isDueToday(t, now));
  const urgentTasks = staffTasks.filter(
    (t) => t.priority === "urgent" || t.priority === "high",
  );

  const staffRentals = rentals.filter((r) => {
    if (!ACTIVE_RENTAL_STATUSES.includes(r.status)) return false;
    return assignments.some(
      (a) =>
        a.staff_id === staffId &&
        a.status === "active" &&
        a.entity_type === "rental" &&
        a.entity_id === r.id,
    );
  });
  const lateAccounts = staffRentals.filter((r) =>
    ["late", "overdue"].includes(r.status),
  );

  const staffWOs = workOrders.filter(
    (w) =>
      w.assigned_user_id === staffId && ACTIVE_WO_STATUSES.includes(w.status),
  );

  const staffClaims = damageClaims.filter(
    (c) =>
      c.assigned_user_id === staffId &&
      ACTIVE_CLAIM_STATUSES.includes(c.claim_status),
  );

  const activeAssignments = assignments.filter(
    (a) => a.staff_id === staffId && a.status === "active",
  );

  const breakdown: WorkloadBreakdownItem[] = [];
  if (staffTasks.length)
    breakdown.push({ label: "tasks", count: staffTasks.length });
  if (staffRentals.length)
    breakdown.push({ label: "rentals", count: staffRentals.length });
  if (staffWOs.length) breakdown.push({ label: "WOs", count: staffWOs.length });
  if (staffClaims.length)
    breakdown.push({ label: "claims", count: staffClaims.length });

  return {
    staffId,
    openTasks: staffTasks.length,
    overdueTasks: overdueTasks.length,
    dueTodayTasks: dueTodayTasks.length,
    urgentTasks: urgentTasks.length,
    activeRentals: staffRentals.length,
    lateAccounts: lateAccounts.length,
    openMaintenance: staffWOs.length,
    openDamageClaims: staffClaims.length,
    totalActiveAssignments: activeAssignments.length,
    breakdown,
    hasNoWork:
      staffTasks.length === 0 &&
      staffRentals.length === 0 &&
      staffWOs.length === 0 &&
      staffClaims.length === 0 &&
      activeAssignments.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Unassigned work — entities the company expects to have an owner but don't.
// ---------------------------------------------------------------------------

export interface UnassignedWorkItem {
  entityType: AssignmentEntityType;
  entityId: string;
  label: string;
  reason: string;
  priority: "low" | "normal" | "high" | "urgent";
}

export function getUnassignedWork(
  inputs: WorkloadInputs,
  now: Date = new Date(),
): UnassignedWorkItem[] {
  const { rentals, workOrders, damageClaims, tasks, assignments } = inputs;
  const out: UnassignedWorkItem[] = [];

  // Active rentals with no active CSR assignment.
  for (const r of rentals) {
    if (!ACTIVE_RENTAL_STATUSES.includes(r.status)) continue;
    const hasCSR = assignments.some(
      (a) =>
        a.status === "active" &&
        a.entity_type === "rental" &&
        a.entity_id === r.id &&
        (a.assignment_type === "rental_csr" ||
          a.assignment_type === "rental_account_owner"),
    );
    if (!hasCSR) {
      out.push({
        entityType: "rental",
        entityId: r.id,
        label: r.agreement_number,
        reason: "No CSR assigned",
        priority: ["late", "overdue"].includes(r.status) ? "high" : "normal",
      });
    }
  }

  // Open work orders with no coordinator.
  for (const w of workOrders) {
    if (!ACTIVE_WO_STATUSES.includes(w.status)) continue;
    const hasCoord = assignments.some(
      (a) =>
        a.status === "active" &&
        a.entity_type === "work_order" &&
        a.entity_id === w.id &&
        a.assignment_type === "work_order_coordinator",
    );
    if (!hasCoord && !w.assigned_user_id) {
      out.push({
        entityType: "work_order",
        entityId: w.id,
        label: w.work_order_number,
        reason: "No coordinator assigned",
        priority:
          w.priority === "urgent"
            ? "urgent"
            : w.priority === "high"
              ? "high"
              : "normal",
      });
    }
  }

  // Active damage claims with no owner.
  for (const c of damageClaims) {
    if (!ACTIVE_CLAIM_STATUSES.includes(c.claim_status)) continue;
    const hasOwner = assignments.some(
      (a) =>
        a.status === "active" &&
        a.entity_type === "damage_claim" &&
        a.entity_id === c.id &&
        a.assignment_type === "damage_claim_owner",
    );
    if (!hasOwner && !c.assigned_user_id) {
      out.push({
        entityType: "damage_claim",
        entityId: c.id,
        label: c.claim_number,
        reason: "No claim owner assigned",
        priority:
          c.severity === "critical"
            ? "urgent"
            : c.severity === "major"
              ? "high"
              : "normal",
      });
    }
  }

  // High/urgent open tasks with no assignee.
  for (const t of tasks) {
    if (!ACTIVE_TASK_STATUSES.includes(t.status)) continue;
    if (t.assigned_to_user_id) continue;
    if (!["high", "urgent"].includes(t.priority)) continue;
    out.push({
      entityType: "general",
      entityId: t.id,
      label: t.title,
      reason: "Unassigned high-priority task",
      priority: t.priority,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Assignment history for an entity (chronological).
// ---------------------------------------------------------------------------

export function assignmentHistoryForEntity(
  assignments: OperationalStaffAssignment[],
  entityType: AssignmentEntityType,
  entityId: string,
): OperationalStaffAssignment[] {
  return assignments
    .filter((a) => a.entity_type === entityType && a.entity_id === entityId)
    .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1));
}

/** The single active assignment of a given type for an entity, if any. */
export function activeAssignment(
  assignments: OperationalStaffAssignment[],
  entityType: AssignmentEntityType,
  entityId: string,
  assignmentType: OperationalAssignmentType,
): OperationalStaffAssignment | undefined {
  return assignments.find(
    (a) =>
      a.status === "active" &&
      a.entity_type === entityType &&
      a.entity_id === entityId &&
      a.assignment_type === assignmentType,
  );
}

/** All active assignments for an entity (any type). */
export function activeAssignmentsForEntity(
  assignments: OperationalStaffAssignment[],
  entityType: AssignmentEntityType,
  entityId: string,
): OperationalStaffAssignment[] {
  return assignments.filter(
    (a) =>
      a.status === "active" &&
      a.entity_type === entityType &&
      a.entity_id === entityId,
  );
}
