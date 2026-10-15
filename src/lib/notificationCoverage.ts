// Connect Pro Fleet — runtime task-coverage suppression (Build #12 cleanup).
//
// Low-noise rule: if one operational condition creates a system task AND that
// task assignment already generated a notification/email to the responsible
// person, do NOT also send a second direct domain notification saying the same
// thing. This helper inspects actual task + task-notification state (never
// notification title text) to decide whether a direct domain notification is
// redundant for a given recipient + occurrence.
//
// Coverage is occurrence-specific: a different occurrence or a different
// recipient is NOT suppressed. An unassigned system task is covered by the
// manager "unassigned task" notification, not by an assignee notification.

import type { Notification, NotificationType } from "./notificationTypes";
import type { Task } from "./taskTypes";
import { isTaskActive } from "./taskSelectors";

/** The notification types that a system task's assignment/reassignment
 *  notification covers. These are the "task.assigned"/"task.reassigned"
 *  notifications generated when a system task is assigned. */
const TASK_ASSIGNMENT_TYPES = new Set<NotificationType>([
  "task.assigned",
  "task.reassigned",
]);

/** The notification types generated for unassigned system tasks (manager
 *  fallback). */
const UNASSIGNED_TASK_TYPES = new Set<NotificationType>([
  "system_task.unassigned",
]);

/** Map a domain notification type to the task source_event that covers it.
 *  Only types whose NOTIFICATION_RULES entry has taskCoversEvent: true appear
 *  here. */
const COVERED_DOMAIN_EVENTS: Partial<Record<NotificationType, string>> = {
  "payment_arrangement.broken": "payment_arrangement.broken",
  "rental.overdue": "rental.overdue",
  "deposit.refund_pending": "deposit.refund_pending",
  "maintenance.overdue": "maintenance.overdue",
  "vehicle.registration_expiring": "vehicle.registration_expiring",
  "vehicle.insurance_expiring": "vehicle.insurance_expiring",
  "verification.review_required": "verification.review_required",
  "inspection.damage_flagged": "inspection.damage_review",
  // Build #26 — compliance review tasks cover the matching compliance
  // notifications (low-noise: the task assignment alert already tells the
  // responsible person).
  "compliance.expiring_soon": "compliance.expiring_soon",
  "compliance.expired": "compliance.expired",
  "compliance.blocking": "compliance.blocking",
};

export interface CoverageInput {
  /** The notification type being considered for creation. */
  notificationType: NotificationType;
  /** The recipient staff id. */
  recipientUserId: string;
  /** The entity the domain event concerns (rental id, arrangement id, etc.). */
  entityId: string | null;
  /** The occurrence key (e.g. due date, "1"). */
  occurrence: string;
  /** All tasks in the tenant. */
  tasks: Task[];
  /** All notifications in the tenant. */
  notifications: Notification[];
}

/** Extract the occurrence key from a system task's dedupe_key. The dedupe_key
 *  format is `sys:sourceEvent:entityType:entityId:occurrence`, so the
 *  occurrence is the segment after the last colon. Returns null if the key
 *  can't be parsed (e.g. a manual task with no dedupe_key). */
function taskOccurrence(task: Task): string | null {
  if (!task.dedupe_key) return null;
  const parts = task.dedupe_key.split(":");
  if (parts.length < 5) return null;
  return parts[parts.length - 1];
}

/** Is the direct domain notification for this occurrence already covered by a
 *  system task's assignment notification to the same recipient?
 *
 *  A domain event is "covered" when:
 *    1. The domain type maps to a task source_event (taskCoversEvent: true).
 *    2. An active system task exists for that source_event + entity + SAME
 *       occurrence (coverage is occurrence-specific).
 *    3. That task is assigned to this recipient (assignee notification
 *       covers), OR the task is unassigned and a manager unassigned-task
 *       notification was already generated for this recipient.
 *
 *  Returns false for notification types that are NOT domain-covered (task.*,
 *  payment_arrangement.promise_due, payment.received, deposit.refunded,
 *  incident.created, violation.created, system_task.unassigned). */
export function isEventCoveredByTaskNotification(
  input: CoverageInput,
): boolean {
  const sourceEvent = COVERED_DOMAIN_EVENTS[input.notificationType];
  if (!sourceEvent) return false;

  // Find an active system task for this source_event + entity + occurrence.
  const task = input.tasks.find(
    (t) =>
      t.source_type === "system" &&
      t.source_event === sourceEvent &&
      t.entity_id === input.entityId &&
      isTaskActive(t) &&
      taskOccurrence(t) === input.occurrence,
  );
  if (!task) return false;

  if (task.assigned_to_user_id === input.recipientUserId) {
    // The task is assigned to this recipient. Did an assignment notification
    // already get generated for them? Check existing notifications for a
    // task.assigned/reassigned to this recipient for this task id.
    return input.notifications.some(
      (n) =>
        TASK_ASSIGNMENT_TYPES.has(n.notification_type) &&
        n.recipient_user_id === input.recipientUserId &&
        n.source_event_id === task.id,
    );
  }

  if (!task.assigned_to_user_id) {
    // Unassigned system task: covered by the manager unassigned-task
    // notification if one was already generated for this recipient.
    return input.notifications.some(
      (n) =>
        UNASSIGNED_TASK_TYPES.has(n.notification_type) &&
        n.recipient_user_id === input.recipientUserId &&
        n.source_event_id === task.id,
    );
  }

  return false;
}
