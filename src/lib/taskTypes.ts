// Connect Pro Fleet — Tasks domain types (Build #11).
//
// A Task is an operational action: what needs to be done, who's responsible, when
// it's due, and what record it's connected to. Tasks are the human-action layer —
// they are NOT financial transactions, notifications, activity-log entries, or
// maintenance records. They may LINK to those records but never replace them.
//
// Two sources: MANUAL (created by a staff member) and SYSTEM (created because an
// operational event requires human action). Both use the same Task model; the
// `source_type` field lets staff tell why a task exists.
//
// Overdue is DERIVED (status OPEN/IN_PROGRESS + due date passed), never stored,
// so a completed/cancelled task can never become stale-overdue. Date-only tasks
// remain due through the end of the tenant-local calendar day.

export type TaskStatus = "open" | "in_progress" | "completed" | "cancelled";

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_TONE: Record<
  TaskStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  open: "maintenance",
  in_progress: "rented",
  completed: "available",
  cancelled: "neutral",
};

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TASK_PRIORITY_TONE: Record<
  TaskPriority,
  "available" | "maintenance" | "out" | "neutral"
> = {
  low: "neutral",
  normal: "neutral",
  high: "maintenance",
  urgent: "out",
};

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type TaskCategory =
  | "customer_follow_up"
  | "payment_collection"
  | "payment_arrangement"
  | "reservation"
  | "checkout"
  | "return"
  | "vehicle"
  | "maintenance"
  | "inspection"
  | "damage"
  | "incident"
  | "violation"
  | "document"
  | "deposit"
  | "administrative"
  | "other";

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  customer_follow_up: "Customer Follow-Up",
  payment_collection: "Payment Collection",
  payment_arrangement: "Payment Arrangement",
  reservation: "Reservation",
  checkout: "Checkout",
  return: "Return",
  vehicle: "Vehicle",
  maintenance: "Maintenance",
  inspection: "Inspection",
  damage: "Damage",
  incident: "Incident",
  violation: "Violation",
  document: "Document",
  deposit: "Deposit",
  administrative: "Administrative",
  other: "Other",
};

export type TaskSourceType = "manual" | "system";

/** The operational entity a task links to (one primary link for V1). */
export type TaskEntityType =
  | "customer"
  | "reservation"
  | "rental"
  | "vehicle"
  | "billing_period"
  | "payment_arrangement"
  | "maintenance"
  | "maintenance_work_order"
  | "inspection"
  | "incident"
  | "violation"
  | "deposit"
  | "expense"
  | "damage_claim";

/** Structured source event for system-generated tasks (never parsed from text). */
export type TaskSourceEvent =
  | "payment_arrangement.broken"
  | "rental.overdue"
  | "verification.review_required"
  | "maintenance.overdue"
  | "deposit.refund_pending"
  | "vehicle.registration_expiring"
  | "vehicle.insurance_expiring"
  | "inspection.damage_review"
  // Build #26 — compliance review tasks (gated by auto_create_review_task).
  | "compliance.missing_required"
  | "compliance.expired"
  | "compliance.expiring_soon"
  | "compliance.rejected"
  | "compliance.pending_review";

export interface TaskNote {
  id: string;
  tenant_id: string;
  task_id: string;
  author_id: string | null; // staff id, or null for SYSTEM
  author_is_system: boolean;
  text: string;
  at: string;
}

export type TaskEventType =
  | "created"
  | "assigned"
  | "reassigned"
  | "due_date_changed"
  | "priority_changed"
  | "started"
  | "completed"
  | "reopened"
  | "cancelled"
  | "note_added"
  | "system_generated"
  | "system_resolved";

export interface TaskEvent {
  id: string;
  tenant_id: string;
  task_id: string;
  type: TaskEventType;
  label: string;
  at: string;
  actor_id: string | null; // staff id, or null for SYSTEM
  actor_is_system: boolean;
  old_value?: string | null;
  new_value?: string | null;
}

export interface Task {
  id: string;
  tenant_id: string;
  task_number: string; // TSK-000124
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source_type: TaskSourceType;
  source_event: TaskSourceEvent | null;
  assigned_to_user_id: string | null;
  assigned_by_user_id: string | null;
  created_by_user_id: string | null;
  due_date: string | null; // ISO date (YYYY-MM-DD)
  due_time: string | null; // "HH:MM" or null for date-only
  completed_at: string | null;
  completed_by_user_id: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  entity_type: TaskEntityType | null;
  entity_id: string | null;
  entity_label: string | null; // snapshot so historical tasks stay readable
  location_id: string | null;
  category: TaskCategory;
  tags: string[];
  notes: string | null;
  // Stable dedupe key for system tasks (source_event + entity + occurrence).
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
}
