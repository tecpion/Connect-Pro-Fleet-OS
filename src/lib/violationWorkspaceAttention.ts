// Connect Pro Fleet — Violation workspace attention + match/billing presentation.
//
// Pure functions over the rich Violation model for the combined Incidents &
// Violations workspace. Produces transparent attention reasons (never an opaque
// score), separates Match Status / Responsibility / Billing Status, and derives
// due/overdue state. Reuses existing violationSelectors where possible — no
// second financial model, no duplicate counts.

import type { Violation } from "./violationTypes";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import {
  getOverdueViolations,
  getViolationsDueSoon,
  daysOverdue,
} from "./violationSelectors";

const DAY = 86_400_000;

export type AttentionLevel = "none" | "attention" | "critical";

export interface ViolationAttention {
  level: AttentionLevel;
  reasons: string[];
}

/** Match status (separate from responsibility + billing). Derived from the
 *  possession resolution stored on the record. */
export type MatchStatus = "unmatched" | "suggested" | "confirmed";

export function matchStatus(v: Violation): MatchStatus {
  if (v.rental_id && v.responsibility_decided_by) return "confirmed";
  if (v.rental_id) return "suggested";
  return "unmatched";
}

/** Billing status (separate from match + responsibility). */
export type BillingStatus =
  "not_billed" | "billed" | "partially_paid" | "paid" | "waived";

export function billingStatus(v: Violation): BillingStatus {
  if (v.status === "cancelled") return "waived";
  if (v.customer_charge_status === "charged") {
    if (v.reimbursement_status === "full") return "paid";
    if (v.reimbursement_status === "partial") return "partially_paid";
    return "billed";
  }
  if (v.customer_charge_status === "reversed") return "not_billed";
  if (v.customer_charge_status === "partially_recovered")
    return "partially_paid";
  return "not_billed";
}

/** Due/overdue presentation state. */
export type DueState = "none" | "due_soon" | "due_today" | "overdue";

export function dueState(v: Violation, now: Date = new Date()): DueState {
  if (!VIOLATION_OPEN_STATUSES.includes(v.status) || !v.due_at) return "none";
  const due = new Date(v.due_at).getTime();
  if (isNaN(due)) return "none";
  const nowTs = now.getTime();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const endOfToday = startOfToday + DAY;
  if (due < startOfToday) return "overdue";
  if (due >= startOfToday && due < endOfToday) return "due_today";
  if (due <= nowTs + 7 * DAY) return "due_soon";
  return "none";
}

/** Transparent attention state for a violation. Explains WHY action is needed. */
export function violationAttention(
  v: Violation,
  now: Date = new Date(),
): ViolationAttention {
  const reasons: string[] = [];
  let critical = false;
  if (!VIOLATION_OPEN_STATUSES.includes(v.status))
    return { level: "none", reasons: [] };

  const ms = matchStatus(v);
  if (ms === "unmatched") reasons.push("Unmatched — no rental");
  if (ms === "suggested") reasons.push("Match awaiting confirmation");

  if (v.responsibility === "unknown")
    reasons.push("Renter responsibility unresolved");

  const bs = billingStatus(v);
  if (
    v.responsibility === "customer" &&
    bs === "not_billed" &&
    v.customer_charge_status !== "reversed"
  )
    reasons.push("Renter has not been billed");

  if (!v.issuing_authority) reasons.push("Missing issuing-agency information");

  const ds = dueState(v, now);
  if (ds === "due_soon") reasons.push("Payment due soon");
  if (ds === "due_today") reasons.push("Due today");
  if (ds === "overdue") {
    reasons.push(`Overdue ${daysOverdue(v, now)}d`);
    critical = true;
  }

  if (
    v.dispute_status === "customer_disputed" ||
    v.dispute_status === "under_review"
  )
    reasons.push("Disputed");

  if (reasons.length === 0) return { level: "none", reasons: [] };
  return { level: critical ? "critical" : "attention", reasons };
}

/** Auto-match explanation text (transparent — no confidence score). */
export function autoMatchExplanation(v: Violation): string | null {
  if (!v.rental_id) return null;
  if (v.responsibility_reason === "renter_possessed_vehicle")
    return "Matched because this rental covered the violation date.";
  if (v.responsibility_reason === "after_return")
    return "Violation occurred after return — review before charging.";
  if (v.responsibility_reason === "predates_rental")
    return "Violation predates the rental — likely not the renter.";
  return "Matched to a rental covering this date — review before charging.";
}

// Re-export existing selectors used by the workspace KPIs for convenience.
export { getOverdueViolations, getViolationsDueSoon, daysOverdue };
