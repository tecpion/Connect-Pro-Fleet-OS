// Connect Pro Fleet — scan-driven notification generation (Build #12).
//
// Time-based events: task due today, task overdue, payment promise due today,
// unassigned system task. Idempotent via dedupe keys. No background scheduler —
// called from a manual trigger. Runtime task-coverage suppression is applied
// inside notify() itself, so the scan doesn't need to duplicate that logic.

import type { StoreState } from "./storeState";
import type { CreateNotificationInput } from "./notificationContext";

export function generateNotificationsPass(
  s: StoreState,
  notify: (input: CreateNotificationInput) => string | null,
): { created: number } {
  let created = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Task due today / overdue (per assignee, once per occurrence).
  for (const t of s.tasks) {
    if (t.status !== "open" && t.status !== "in_progress") continue;
    if (!t.assigned_to_user_id) continue;
    if (!t.due_date) continue;
    const due = new Date(t.due_date + "T00:00:00");
    const isToday = due.getTime() === today.getTime();
    const isOverdue = due.getTime() < today.getTime();
    if (!isToday && !isOverdue) continue;
    const occurrence = t.due_date;
    const type = isOverdue ? "task.overdue" : "task.due_today";
    const id = notify({
      recipientUserId: t.assigned_to_user_id,
      type,
      title: isOverdue
        ? `Task overdue: ${t.title}`
        : `Task due today: ${t.title}`,
      message: isOverdue
        ? `This task was due ${t.due_date} and is now overdue.`
        : `This task is due today${t.due_time ? ` at ${t.due_time}` : ""}.`,
      entityType: t.entity_type,
      entityId: t.entity_id,
      entityLabel: t.entity_label,
      actionUrl: `/tasks?task=${t.id}`,
      sourceEventId: t.id,
      occurrence,
      actorUserId: null,
      metadata: { task_id: t.id },
    });
    if (id) created++;
  }

  // Payment arrangement promise due today (notify responsible staff once).
  for (const a of s.paymentArrangements) {
    if (a.status !== "active") continue;
    const installments = s.arrangementInstallments.filter(
      (i) => i.arrangement_id === a.id,
    );
    for (const ins of installments) {
      if (ins.paid_at) continue;
      const due = new Date(ins.due_date + "T00:00:00");
      if (due.getTime() !== today.getTime()) continue;
      const customer = s.customers.find((c) => c.id === a.customer_id);
      const responsible = a.created_by ?? null;
      const recipients = responsible
        ? [responsible]
        : s.staff
            .filter((x) => x.role === "owner" || x.role === "manager")
            .map((x) => x.id);
      for (const r of recipients) {
        const id = notify({
          recipientUserId: r,
          type: "payment_arrangement.promise_due",
          title: `Payment promise due today — ${customer ? `${customer.first_name} ${customer.last_name}` : "customer"}`,
          message: `A promised payment of $${ins.amount_due.toFixed(2)} is due today.`,
          entityType: "payment_arrangement",
          entityId: a.id,
          entityLabel: `${a.arrangement_number}${customer ? ` · ${customer.first_name} ${customer.last_name}` : ""}`,
          actionUrl: `/payment-arrangements?arrangement=${a.id}`,
          sourceEventId: ins.id,
          occurrence: ins.due_date,
          actorUserId: null,
          metadata: { arrangement_id: a.id, installment_id: ins.id },
        });
        if (id) created++;
      }
    }
  }

  // Unassigned system tasks (high/urgent) -> notify managers.
  for (const t of s.tasks) {
    if (t.source_type !== "system") continue;
    if (t.assigned_to_user_id) continue;
    if (t.status !== "open" && t.status !== "in_progress") continue;
    if (t.priority !== "high" && t.priority !== "urgent") continue;
    const managers = s.staff.filter(
      (x) => x.role === "owner" || x.role === "manager",
    );
    for (const m of managers) {
      const id = notify({
        recipientUserId: m.id,
        type: "system_task.unassigned",
        title: `Unassigned task requires attention: ${t.title}`,
        message: `A system-generated task has no assignee. Assign it to the right staff member.`,
        entityType: t.entity_type,
        entityId: t.entity_id,
        entityLabel: t.entity_label,
        actionUrl: `/tasks?task=${t.id}`,
        sourceEventId: t.id,
        occurrence: "unassigned",
        actorUserId: null,
        metadata: { task_id: t.id },
      });
      if (id) created++;
    }
  }

  return { created };
}
