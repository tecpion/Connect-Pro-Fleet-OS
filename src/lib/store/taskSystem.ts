// Connect Pro Fleet — system task generation pass (Build #11).
//
// Scans existing domain records for actionable conditions and ensures system
// tasks exist (idempotent). Called from the Tasks page / a manual trigger — no
// background scheduler. Conservative: only generates tasks for clear human-action
// exceptions, never routine scheduled work (no task per pickup/return/invoice).
//
// Each trigger uses a stable occurrence key so a repeated scan never duplicates
// an open task, and a genuinely new occurrence (e.g. a later mileage threshold)
// can create a new task.

import { fmtMoney } from "../format";
import { getOrgTimezone, startOfDayInTz } from "../timezone";
import type { TaskSourceEvent } from "../taskTypes";
import type { StoreState } from "./storeState";

type EnsureFn = (input: {
  sourceEvent: TaskSourceEvent;
  entityType: import("../taskTypes").TaskEntityType;
  entityId: string;
  entityLabel: string;
  title: string;
  description?: string | null;
  category: import("../taskTypes").TaskCategory;
  priority?: import("../taskTypes").TaskPriority;
  occurrence?: string;
  assignedToUserId?: string | null;
  dueDate?: string | null;
}) => { created: boolean; taskId: string };

export function generateSystemTasksPass(
  s: StoreState,
  ensure: EnsureFn,
): { created: number } {
  let created = 0;
  // "Today" is the ORG's business day, resolved from the persisted
  // companyInfo.timezone through the org-timezone helpers — not the server
  // wall clock — so the same stored records produce the same due-today /
  // overdue verdicts regardless of the runtime's TZ.
  const tz = getOrgTimezone(s.companyInfo?.timezone);
  const today = startOfDayInTz(new Date(), tz);

  // 1. Broken payment arrangements with collectible debt.
  for (const a of s.paymentArrangements) {
    if (a.status !== "broken") continue;
    const installments = s.arrangementInstallments.filter(
      (i) => i.arrangement_id === a.id,
    );
    const paid = installments.reduce((sum, ins) => {
      const linked = (ins.linked_payments ?? []).reduce(
        (s2, lp) => s2 + lp.amount,
        0,
      );
      return sum + linked;
    }, 0);
    const remaining = Math.max(0, a.arrangement_amount - paid);
    if (remaining <= 0) continue;
    const customer = s.customers.find((c) => c.id === a.customer_id);
    const label = `${a.arrangement_number}${customer ? ` · ${customer.first_name} ${customer.last_name}` : ""}`;
    const res = ensure({
      sourceEvent: "payment_arrangement.broken",
      entityType: "payment_arrangement",
      entityId: a.id,
      entityLabel: label,
      title: "Follow up on broken payment arrangement",
      description: `Payment arrangement ${a.arrangement_number} was broken. ${fmtMoney(remaining)} still collectible. Contact the customer to restructure or collect.`,
      category: "payment_arrangement",
      priority: "high",
      occurrence: "1",
    });
    if (res.created) created++;
  }

  // 2. Overdue active rentals (past scheduled return, not returned).
  for (const r of s.rentals) {
    if (r.status !== "active" && r.status !== "overdue") continue;
    if (!r.scheduled_return_date) continue;
    const due = new Date(r.scheduled_return_date + "T00:00:00");
    if (isNaN(due.getTime()) || due >= today) continue;
    const customer = s.customers.find((c) => c.id === r.customer_id);
    const vehicle = s.vehicles.find((v) => v.id === r.vehicle_id);
    const label = `${r.agreement_number}${customer ? ` · ${customer.first_name} ${customer.last_name}` : ""}`;
    const res = ensure({
      sourceEvent: "rental.overdue",
      entityType: "rental",
      entityId: r.id,
      entityLabel: label,
      title: "Follow up on overdue rental",
      description: `Rental ${r.agreement_number} is past its scheduled return date. ${vehicle ? `${vehicle.make} ${vehicle.model}` : ""} has not been returned.`,
      category: "return",
      priority: "high",
      occurrence: r.scheduled_return_date,
    });
    if (res.created) created++;
  }

  // 3. Pending driver verification (manual review required).
  for (const d of s.drivers) {
    if (d.verification_status !== "pending") continue;
    const res = s.reservations.find((r) => r.id === d.reservation_id);
    const customerName = res?.renter_name ?? d.full_name;
    const res2 = ensure({
      sourceEvent: "verification.review_required",
      entityType: res?.customer_id ? "customer" : "reservation",
      entityId: res?.customer_id ?? d.reservation_id,
      entityLabel: customerName,
      title: "Review driver verification",
      description: `Driver license verification for ${customerName} is pending manual review.`,
      category: "document",
      priority: "normal",
      occurrence: "1",
    });
    if (res2.created) created++;
  }

  // 4. Overdue maintenance (structured condition).
  for (const m of s.maintenance) {
    if (m.completed_date) continue;
    const v = s.vehicles.find((x) => x.id === m.vehicle_id);
    let overdue = false;
    if (new Date(m.scheduled_date) < today) overdue = true;
    if (
      m.next_service_mileage_estimate &&
      v &&
      v.current_mileage >= m.next_service_mileage_estimate
    )
      overdue = true;
    if (
      m.next_service_date_estimate &&
      new Date(m.next_service_date_estimate) <= today
    )
      overdue = true;
    if (!overdue) continue;
    const label = v
      ? `${v.make} ${v.model} · ${m.service_type}`
      : m.service_type;
    const res = ensure({
      sourceEvent: "maintenance.overdue",
      entityType: "maintenance",
      entityId: m.id,
      entityLabel: label,
      title: `Schedule overdue maintenance — ${v ? `${v.make} ${v.model}` : "vehicle"}`,
      description: `${m.service_type} is overdue. ${v ? `${v.make} ${v.model} · ${v.license_plate}` : ""}`,
      category: "maintenance",
      priority: "normal",
      occurrence: String(m.next_service_mileage_estimate || m.scheduled_date),
    });
    if (res.created) created++;
  }

  // 5. Deposit refund pending.
  for (const d of s.rentalDeposits) {
    if (d.status !== "refund_pending") continue;
    const customer = s.customers.find((c) => c.id === d.customer_id);
    const label = `Deposit${customer ? ` · ${customer.first_name} ${customer.last_name}` : ""}`;
    const res = ensure({
      sourceEvent: "deposit.refund_pending",
      entityType: "deposit",
      entityId: d.id,
      entityLabel: label,
      title: "Process security deposit refund",
      description: `Deposit refund is pending. Issue the refund to the customer.`,
      category: "deposit",
      priority: "high",
      occurrence: "1",
    });
    if (res.created) created++;
  }

  // 6. Expiring vehicle registration / insurance (structured expiry, 30 days).
  const soon = new Date(today.getTime() + 30 * 86400000);
  for (const v of s.vehicles) {
    if (v.registration_expiry) {
      const exp = new Date(v.registration_expiry + "T00:00:00");
      if (!isNaN(exp.getTime()) && exp <= soon && exp >= today) {
        const res = ensure({
          sourceEvent: "vehicle.registration_expiring",
          entityType: "vehicle",
          entityId: v.id,
          entityLabel: `${v.make} ${v.model} · ${v.license_plate}`,
          title: `Renew registration — ${v.make} ${v.model}`,
          description: `Registration expires ${v.registration_expiry}. Upload the renewed document.`,
          category: "document",
          priority: "normal",
          occurrence: v.registration_expiry,
        });
        if (res.created) created++;
      }
    }
    if (v.insurance_expiry) {
      const exp = new Date(v.insurance_expiry + "T00:00:00");
      if (!isNaN(exp.getTime()) && exp <= soon && exp >= today) {
        const res = ensure({
          sourceEvent: "vehicle.insurance_expiring",
          entityType: "vehicle",
          entityId: v.id,
          entityLabel: `${v.make} ${v.model} · ${v.license_plate}`,
          title: `Review expiring insurance — ${v.make} ${v.model}`,
          description: `Insurance expires ${v.insurance_expiry}. Confirm coverage is renewed.`,
          category: "document",
          priority: "normal",
          occurrence: v.insurance_expiry,
        });
        if (res.created) created++;
      }
    }
  }

  // 7. Possible damage review (checkin inspection flagged damage).
  for (const ins of s.inspections) {
    if (ins.inspection_type !== "checkin" || !ins.damage_detected) continue;
    const rental = s.rentals.find(
      (r) => r.reservation_id === ins.reservation_id,
    );
    const label = rental
      ? `${rental.agreement_number} · ${ins.damage_notes || "damage flagged"}`
      : ins.damage_notes || "damage flagged";
    const res = ensure({
      sourceEvent: "inspection.damage_review",
      entityType: "inspection",
      entityId: ins.id,
      entityLabel: label,
      title: "Review possible vehicle damage",
      description:
        `Check-in inspection flagged possible damage. ${ins.damage_notes || ""}`.trim(),
      category: "damage",
      priority: "high",
      occurrence: ins.id,
    });
    if (res.created) created++;
  }

  return { created };
}
