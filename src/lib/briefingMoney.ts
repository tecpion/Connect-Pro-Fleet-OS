// Connect Pro Fleet — Daily Briefing money + rental selectors (Build #28).
//
// DERIVED from the authoritative billing selectors + exact-time late evaluator
// (Build #21) + the rental store. Never re-implements lateness or balance math:
// getPaymentObligations / isObligationLate are the single source. The briefing
// surfaces "due today" (not yet late) SEPARATELY from "overdue" (authoritatively
// past the cutoff + grace), so someone due at 2 PM is NOT in Overdue at 10 AM.
//
// `asOf` is explicit and deterministic — no buried `new Date()`.

import type { BriefingItem, BriefingSources } from "./briefingTypes";
import { getPaymentObligations } from "./billingSelectors";
import { isObligationLate } from "./lateEvaluator";
import {
  getPromisesDueToday,
  getBrokenArrangements,
} from "./paymentArrangements";
import { attentionKey, overduePriority } from "./briefingPriority";

const DAY = 86_400_000;

/** Money due today — not yet late (authoritative obligations due today). */
export function getMoneyDueToday(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const obligations = getPaymentObligations(
    s.rentals,
    src.billingPeriods ?? [],
    s.transactions,
    asOf,
  );
  return obligations
    .filter((o) => o.bucket === "due_today")
    .map((o) => {
      const r = s.rentals.find((x) => x.id === o.rentalId);
      return {
        id: attentionKey("billing", "rental", o.rentalId, `due:${o.period.id}`),
        category: "money" as const,
        priority: "high" as const,
        title: "Payment due today",
        reason: `Due ${o.period.due_at}${r?.payment_cutoff_time ? ` at ${r.payment_cutoff_time}` : ""}`,
        entity_type: "rental",
        entity_id: o.rentalId,
        customer_id: r?.customer_id ?? null,
        rental_id: o.rentalId,
        amount: o.amountDue,
        due_at: o.period.due_at,
        status: "due_today",
        action_type: "view_rental",
        action_label: "View Rental",
        deep_link: `/rentals/${o.rentalId}`,
        assigned_staff_id: r?.created_by ?? null,
        source_module: "billing",
        source_entity: "billing_period",
        source_id: o.period.id,
        sensitive: false,
      };
    });
}

/** Overdue accounts — authoritatively past the cutoff + grace. Sorted by
 *  severity (age) then amount then oldest obligation. */
export function getOverdueAccounts(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const obligations = getPaymentObligations(
    s.rentals,
    src.billingPeriods ?? [],
    s.transactions,
    asOf,
  );
  return obligations
    .filter((o) => o.bucket === "late")
    .map((o) => {
      const r = s.rentals.find((x) => x.id === o.rentalId);
      const cutoff = r?.payment_cutoff_time ?? null;
      const grace = r?.grace_period ?? 0;
      const late = isObligationLate(
        { due_at: o.period.due_at, cutoff_time: cutoff, grace_period: grace },
        asOf,
      );
      const ageDays = late.late
        ? Math.max(1, Math.round((asOf.getTime() - late.due_at_ms) / DAY))
        : o.daysLate || 1;
      return {
        id: attentionKey(
          "billing",
          "rental",
          o.rentalId,
          `overdue:${o.period.id}`,
        ),
        category: "money" as const,
        priority: overduePriority(ageDays),
        title: "Payment overdue",
        reason: `Due ${o.period.due_at}${cutoff ? ` at ${cutoff}` : ""} · ${ageDays}d late`,
        entity_type: "rental",
        entity_id: o.rentalId,
        customer_id: r?.customer_id ?? null,
        rental_id: o.rentalId,
        amount: o.amountDue,
        due_at: o.period.due_at,
        age_days: ageDays,
        status: "overdue",
        action_type: "view_rental",
        action_label: "View Rental",
        deep_link: `/rentals/${o.rentalId}`,
        assigned_staff_id: r?.created_by ?? null,
        source_module: "billing",
        source_entity: "billing_period",
        source_id: o.period.id,
        sensitive: false,
      };
    });
}

/** Payment-arrangement attention: promises due today + broken arrangements.
 *  Reuses Build #10 arrangement selectors — never duplicates the calculation. */
export function getArrangementAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const arrangements = src.paymentArrangements ?? [];
  const installments = src.arrangementInstallments ?? [];
  const byArr = (id: string) =>
    installments.filter((i) => i.arrangement_id === id);
  const items: BriefingItem[] = [];

  const promisesDue = getPromisesDueToday(arrangements, byArr, s.transactions);
  for (const ins of promisesDue) {
    const a = arrangements.find((x) => x.id === ins.arrangement_id);
    items.push({
      id: attentionKey(
        "arrangement",
        "arrangement",
        ins.arrangement_id,
        ins.id,
      ),
      category: "money",
      priority: "medium",
      title: "Arrangement payment due today",
      reason: `Promise to pay due ${ins.due_date}`,
      entity_type: "arrangement",
      entity_id: ins.arrangement_id,
      customer_id: a?.customer_id ?? null,
      amount: ins.amount_due,
      due_at: ins.due_date,
      status: "due_today",
      action_type: "view_arrangements",
      action_label: "View Arrangements",
      deep_link: "/payment-arrangements",
      source_module: "payment_arrangements",
      source_entity: "installment",
      source_id: ins.id,
      sensitive: false,
    });
  }

  const broken = getBrokenArrangements(arrangements, byArr, s.transactions);
  for (const a of broken) {
    items.push({
      id: attentionKey("arrangement", "arrangement", a.id, "broken"),
      category: "money",
      priority: "high",
      title: "Broken payment arrangement",
      reason: "A promised installment was missed beyond grace",
      entity_type: "arrangement",
      entity_id: a.id,
      customer_id: a.customer_id,
      status: "broken",
      action_type: "view_arrangements",
      action_label: "View Arrangements",
      deep_link: "/payment-arrangements",
      source_module: "payment_arrangements",
      source_entity: "arrangement",
      source_id: a.id,
      sensitive: false,
    });
  }

  return items;
}

/** Payments received today (positive context). Excludes reversed/voided. */
export function getPaymentsReceivedToday(
  src: BriefingSources,
  asOf: Date,
): { count: number; amount: number } {
  const s = src.store;
  const today = asOf.toISOString().slice(0, 10);
  let count = 0;
  let amount = 0;
  for (const t of s.transactions) {
    if (t.category !== "payment") continue;
    if (t.status !== "posted") continue;
    if (t.effective_date !== today) continue;
    count++;
    amount += t.amount;
  }
  return { count, amount };
}

/** Today's payment summary — counts + amounts (amounts are caller-gated). */
export function getTodaysPaymentSummary(
  src: BriefingSources,
  asOf: Date,
): {
  due_count: number;
  due_amount: number;
  overdue_count: number;
  overdue_amount: number;
  arrangement_due_count: number;
  arrangement_broken_count: number;
  payments_received_today_count: number;
  payments_received_today_amount: number;
} {
  const s = src.store;
  const obligations = getPaymentObligations(
    s.rentals,
    src.billingPeriods ?? [],
    s.transactions,
    asOf,
  );
  const dueToday = obligations.filter((o) => o.bucket === "due_today");
  const overdue = obligations.filter((o) => o.bucket === "late");
  const arrangements = src.paymentArrangements ?? [];
  const installments = src.arrangementInstallments ?? [];
  const byArr = (id: string) =>
    installments.filter((i) => i.arrangement_id === id);
  const promisesDue = getPromisesDueToday(arrangements, byArr, s.transactions);
  const broken = getBrokenArrangements(arrangements, byArr, s.transactions);
  const received = getPaymentsReceivedToday(src, asOf);
  return {
    due_count: dueToday.length,
    due_amount: dueToday.reduce((sum, o) => sum + o.amountDue, 0),
    overdue_count: overdue.length,
    overdue_amount: overdue.reduce((sum, o) => sum + o.amountDue, 0),
    arrangement_due_count: promisesDue.length,
    arrangement_broken_count: broken.length,
    payments_received_today_count: received.count,
    payments_received_today_amount: received.amount,
  };
}
