// Connect Pro Fleet — notification rules + recipient resolution (Build #12).
//
// Centralized configuration mapping each source event to: whether a system
// task already covers it (low-noise suppression), default recipients, priority,
// default in-app/email preferences, and future webhook eligibility. Recipient
// resolution is centralized here so pages don't scatter recipient rules.
//
// Low-noise rule: if one operational condition creates a system task AND that
// task assignment already generates a notification/email to the responsible
// person, do NOT also send a second direct domain notification saying the same
// thing. We suppress the direct notification when a task covers the same event.

import type {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from "./notificationTypes";
import type { Staff } from "./types";

export interface NotificationRule {
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Does a system task already cover this event? If true, suppress the direct
   *  notification to avoid duplicate alerts to the same person. */
  taskCoversEvent: boolean;
  defaultInApp: boolean;
  defaultEmail: boolean;
  futureWebhookEligible: boolean;
  /** Reason shown in the email footer. */
  reason: string;
}

export const NOTIFICATION_RULES: Record<NotificationType, NotificationRule> = {
  "task.assigned": {
    type: "task.assigned",
    category: "task",
    priority: "normal",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a task was assigned to you",
  },
  "task.reassigned": {
    type: "task.reassigned",
    category: "task",
    priority: "normal",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a task was reassigned to you",
  },
  "task.due_today": {
    type: "task.due_today",
    category: "task",
    priority: "normal",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "you have a task due today",
  },
  "task.overdue": {
    type: "task.overdue",
    category: "task",
    priority: "high",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a task assigned to you is overdue",
  },
  "task.cancelled": {
    type: "task.cancelled",
    category: "task",
    priority: "info",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: false,
    futureWebhookEligible: false,
    reason: "a task assigned to you was cancelled",
  },
  "payment_arrangement.broken": {
    type: "payment_arrangement.broken",
    category: "payment_arrangement",
    priority: "high",
    // A system task covers broken arrangements — suppress the direct
    // notification to the same responsible person to avoid duplicates.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "a payment arrangement you're responsible for was broken",
  },
  "payment_arrangement.promise_due": {
    type: "payment_arrangement.promise_due",
    category: "payment_arrangement",
    priority: "normal",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "a promised payment is due today",
  },
  "rental.overdue": {
    type: "rental.overdue",
    category: "rental",
    priority: "high",
    // System task covers overdue rentals — suppress direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "a rental you're responsible for is overdue",
  },
  "payment.received": {
    type: "payment.received",
    category: "payment",
    priority: "info",
    taskCoversEvent: false,
    defaultInApp: false,
    defaultEmail: false,
    futureWebhookEligible: true,
    reason: "a payment was recorded",
  },
  "deposit.refund_pending": {
    type: "deposit.refund_pending",
    category: "deposit",
    priority: "high",
    // System task covers refund-pending deposits — suppress direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "a security deposit refund is pending",
  },
  "deposit.refunded": {
    type: "deposit.refunded",
    category: "deposit",
    priority: "info",
    taskCoversEvent: false,
    defaultInApp: false,
    defaultEmail: false,
    futureWebhookEligible: true,
    reason: "a security deposit was refunded",
  },
  "maintenance.overdue": {
    type: "maintenance.overdue",
    category: "maintenance",
    priority: "normal",
    // System task covers overdue maintenance — suppress direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a vehicle is overdue for maintenance",
  },
  "vehicle.registration_expiring": {
    type: "vehicle.registration_expiring",
    category: "document",
    priority: "normal",
    // System task covers expiring registration — suppress direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a vehicle registration is expiring",
  },
  "vehicle.insurance_expiring": {
    type: "vehicle.insurance_expiring",
    category: "document",
    priority: "normal",
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a vehicle insurance policy is expiring",
  },
  "verification.review_required": {
    type: "verification.review_required",
    category: "verification",
    priority: "normal",
    // System task covers verification review — suppress direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a driver verification requires manual review",
  },
  "inspection.damage_flagged": {
    type: "inspection.damage_flagged",
    category: "damage",
    priority: "high",
    // System task covers damage review — suppress direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "an inspection flagged possible vehicle damage",
  },
  "incident.created": {
    type: "incident.created",
    category: "incident",
    priority: "high",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "an incident was logged",
  },
  "violation.created": {
    type: "violation.created",
    category: "violation",
    priority: "normal",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: true,
    reason: "a traffic violation was logged",
  },
  "system_task.unassigned": {
    type: "system_task.unassigned",
    category: "system",
    priority: "high",
    taskCoversEvent: false,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a system task has no assignee and needs a manager's attention",
  },
  "compliance.expiring_soon": {
    type: "compliance.expiring_soon",
    category: "document",
    priority: "normal",
    // A compliance review task covers expiring-soon — suppress the direct
    // duplicate to the same responsible person (low-noise rule).
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a compliance document is expiring soon",
  },
  "compliance.expired": {
    type: "compliance.expired",
    category: "document",
    priority: "high",
    // A compliance review task covers expired — suppress the direct duplicate.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a compliance document has expired",
  },
  "compliance.blocking": {
    type: "compliance.blocking",
    category: "document",
    priority: "urgent",
    // A blocking compliance issue creates a review task — suppress the direct
    // duplicate to the same responsible person.
    taskCoversEvent: true,
    defaultInApp: true,
    defaultEmail: true,
    futureWebhookEligible: false,
    reason: "a compliance issue is blocking an operation",
  },
};

/** Resolve recipients for a notification. Priority:
 *  1. Explicit responsible staff (the assignee / responsible party).
 *  2. Manager fallback for unassigned/escalated exceptions.
 *  Never invent staff ids; never notify every employee. */
export function resolveNotificationRecipients(input: {
  responsibleUserId: string | null;
  staff: Staff[];
  managerFallback: boolean;
}): string[] {
  const recipients = new Set<string>();
  if (input.responsibleUserId) {
    recipients.add(input.responsibleUserId);
  }
  if (input.managerFallback || !input.responsibleUserId) {
    // Notify managers (role owner/manager) for unassigned/escalated exceptions.
    for (const s of input.staff) {
      if (s.role === "owner" || s.role === "manager") {
        recipients.add(s.id);
      }
    }
  }
  return Array.from(recipients);
}

/** Managers in the tenant (owner + manager roles). */
export function managers(staff: Staff[]): Staff[] {
  return staff.filter((s) => s.role === "owner" || s.role === "manager");
}
