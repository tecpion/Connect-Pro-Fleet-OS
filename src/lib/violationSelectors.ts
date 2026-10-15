// Connect Pro Fleet — violation selectors (Build #25).
//
// Pure functions over Violation[] (+ linked ledger/expense records) for
// reporting, workload, and the Needs Review queue. Financial values are
// DERIVED from authoritative ledgers where passed in; selectors never invent
// a second balance. Permission-safe variants hide financial values when the
// caller lacks violations.view_financials.

import type { Violation, ViolationStatus } from "./violationTypes";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import type { FinancialTransaction } from "./types";
import type { ExpenseTransaction } from "./expenseTypes";

const DAY = 86_400_000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** Open (non-terminal) violations. */
export function getOpenViolations(violations: Violation[]): Violation[] {
  return violations.filter((v) => VIOLATION_OPEN_STATUSES.includes(v.status));
}

/** Violations due within `withinDays` from `now` (default 7). Excludes ones
 *  already resolved/cancelled and ones with no due date. */
export function getViolationsDueSoon(
  violations: Violation[],
  now: Date = new Date(),
  withinDays = 7,
): Violation[] {
  const nowTs = now.getTime();
  const horizon = nowTs + withinDays * DAY;
  return violations.filter((v) => {
    if (!VIOLATION_OPEN_STATUSES.includes(v.status)) return false;
    const due = parse(v.due_at);
    if (due == null) return false;
    return due >= nowTs && due <= horizon;
  });
}

/** Overdue unresolved violations (due_at in the past, still open). */
export function getOverdueViolations(
  violations: Violation[],
  now: Date = new Date(),
): Violation[] {
  const nowTs = now.getTime();
  return violations.filter((v) => {
    if (!VIOLATION_OPEN_STATUSES.includes(v.status)) return false;
    const due = parse(v.due_at);
    if (due == null) return false;
    return due < nowTs;
  });
}

/** Days overdue (0 if not overdue / no due date). */
export function daysOverdue(v: Violation, now: Date = new Date()): number {
  if (!VIOLATION_OPEN_STATUSES.includes(v.status)) return 0;
  const due = parse(v.due_at);
  if (due == null) return 0;
  const diff = now.getTime() - due;
  return diff > 0 ? Math.floor(diff / DAY) : 0;
}

/** Violations attributed to a customer (by customer_id). */
export function getViolationsByCustomer(
  violations: Violation[],
  customerId: string,
): Violation[] {
  return violations.filter((v) => v.customer_id === customerId);
}

/** Violations for a vehicle. */
export function getViolationsByVehicle(
  violations: Violation[],
  vehicleId: string,
): Violation[] {
  return violations.filter((v) => v.vehicle_id === vehicleId);
}

/** Violations attributed to a rental. */
export function getViolationsByRental(
  violations: Violation[],
  rentalId: string,
): Violation[] {
  return violations.filter((v) => v.rental_id === rentalId);
}

/** Disputed violations. */
export function getDisputedViolations(violations: Violation[]): Violation[] {
  return violations.filter((v) => v.dispute_status !== "not_disputed");
}

/** Responsibility summary counts. */
export function getViolationResponsibilitySummary(
  violations: Violation[],
): Record<string, number> {
  const out: Record<string, number> = {
    customer: 0,
    company: 0,
    shared: 0,
    unknown: 0,
    third_party: 0,
  };
  for (const v of violations) {
    out[v.responsibility] = (out[v.responsibility] ?? 0) + 1;
  }
  return out;
}

export interface ViolationFinancialSummary {
  totalAssessed: number;
  companyPaid: number;
  customerCharged: number;
  recovered: number;
  unrecoveredExposure: number;
  openCount: number;
  disputedCount: number;
}

/** Aggregate financial summary. `recovered` is derived from customer payments
 *  allocated to violation charges (passed in as linkedPayments) plus any
 *  expense reimbursements. Company-paid comes from linked expenses. */
export function getViolationFinancialSummary(
  violations: Violation[],
  linkedPayments: FinancialTransaction[],
  linkedExpenses: ExpenseTransaction[],
): ViolationFinancialSummary {
  let totalAssessed = 0;
  let customerCharged = 0;
  let companyPaid = 0;
  let recovered = 0;

  for (const v of violations) {
    totalAssessed += v.total_amount;
    if (v.customer_charge_status === "charged") {
      customerCharged += v.total_amount;
    }
  }

  // Recovered = sum of customer payments toward violation charges.
  for (const p of linkedPayments) {
    if (p.category === "payment") recovered += p.amount;
  }

  // Company paid = sum of posted (non-voided) linked expenses.
  for (const e of linkedExpenses) {
    if (e.status === "posted") companyPaid += e.amount;
  }

  // Unrecovered exposure = company-paid not yet offset by a customer charge
  // (receivable) or actual cash recovery. Once the customer is charged the
  // company holds a receivable, so the exposure is closed from this summary's
  // perspective; actual still-collectable cash is tracked separately by
  // getUnrecoveredViolationExposure.
  const unrecoveredExposure = Math.max(
    0,
    companyPaid - Math.max(customerCharged, recovered),
  );

  return {
    totalAssessed,
    companyPaid,
    customerCharged,
    recovered,
    unrecoveredExposure,
    openCount: getOpenViolations(violations).length,
    disputedCount: getDisputedViolations(violations).length,
  };
}

export interface UnrecoveredExposure {
  companyPaid: number;
  customerRecoverable: number;
  recovered: number;
  stillRecoverable: number;
}

/** Money-left-on-the-table: company paid, customer-recoverable, recovered so
 *  far, and the amount still recoverable. Derived from authoritative records. */
export function getUnrecoveredViolationExposure(
  violations: Violation[],
  linkedPayments: FinancialTransaction[],
  linkedExpenses: ExpenseTransaction[],
): UnrecoveredExposure {
  let companyPaid = 0;
  let customerRecoverable = 0;
  let recovered = 0;

  for (const v of violations) {
    if (v.company_payment_status === "paid") {
      companyPaid += v.total_amount;
      // Customer-recoverable only when customer is responsible (or shared).
      if (v.responsibility === "customer" || v.responsibility === "shared") {
        customerRecoverable += v.total_amount;
      }
    }
  }

  for (const p of linkedPayments) {
    if (p.category === "payment") recovered += p.amount;
  }
  // Voided linked expenses reduce company-paid (already excluded below).
  for (const e of linkedExpenses) {
    if (e.status === "voided")
      companyPaid = Math.max(0, companyPaid - e.amount);
  }

  const stillRecoverable = Math.max(0, customerRecoverable - recovered);
  return { companyPaid, customerRecoverable, recovered, stillRecoverable };
}

// ---------------------------------------------------------------------------
// Needs Review queue
// ---------------------------------------------------------------------------

export type NeedsReviewReason =
  | "no_rental_match"
  | "multiple_match"
  | "unknown_responsibility"
  | "missing_amount"
  | "overdue_unresolved"
  | "customer_dispute"
  | "company_paid_not_charged"
  | "missing_evidence";

export const NEEDS_REVIEW_REASON_LABELS: Record<NeedsReviewReason, string> = {
  no_rental_match: "No rental match",
  multiple_match: "Multiple possession matches",
  unknown_responsibility: "Unknown responsibility",
  missing_amount: "Missing amount",
  overdue_unresolved: "Overdue unresolved",
  customer_dispute: "Customer dispute",
  company_paid_not_charged: "Company paid, customer not charged",
  missing_evidence: "Missing evidence (required)",
};

export interface NeedsReviewItem {
  violation: Violation;
  reasons: NeedsReviewReason[];
}

/** Build the Needs Review queue. A violation appears once with all its
 *  reasons. */
export function getNeedsReview(
  violations: Violation[],
  evidenceByViolation: Record<string, number>,
  now: Date = new Date(),
  evidenceRequired = false,
): NeedsReviewItem[] {
  const out: NeedsReviewItem[] = [];
  for (const v of violations) {
    if (v.status === "resolved" || v.status === "cancelled") continue;
    const reasons: NeedsReviewReason[] = [];
    if (v.responsibility === "unknown") reasons.push("unknown_responsibility");
    if (v.total_amount <= 0) reasons.push("missing_amount");
    if (
      VIOLATION_OPEN_STATUSES.includes(v.status) &&
      v.due_at &&
      parse(v.due_at)! < now.getTime()
    )
      reasons.push("overdue_unresolved");
    if (v.dispute_status === "customer_disputed")
      reasons.push("customer_dispute");
    if (
      v.company_payment_status === "paid" &&
      v.customer_charge_status === "not_charged" &&
      (v.responsibility === "customer" || v.responsibility === "shared")
    )
      reasons.push("company_paid_not_charged");
    if (
      evidenceRequired &&
      v.customer_charge_status === "not_charged" &&
      (evidenceByViolation[v.id] ?? 0) === 0
    )
      reasons.push("missing_evidence");
    // no_rental_match / multiple_match are set by the resolver at creation;
    // surfaced via responsibility_notes / status. We also flag any open
    // violation with no rental and unknown responsibility as no match.
    if (
      !v.rental_id &&
      v.responsibility === "unknown" &&
      v.responsibility_reason === null
    )
      reasons.push("no_rental_match");
    if (reasons.length > 0) out.push({ violation: v, reasons });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unassigned work
// ---------------------------------------------------------------------------

export function getUnassignedViolations(violations: Violation[]): Violation[] {
  return violations.filter(
    (v) => !v.assigned_staff_id && VIOLATION_OPEN_STATUSES.includes(v.status),
  );
}

/** Violations assigned to a staff member (open). */
export function getViolationsForStaff(
  violations: Violation[],
  staffId: string,
): Violation[] {
  return violations.filter(
    (v) =>
      v.assigned_staff_id === staffId &&
      VIOLATION_OPEN_STATUSES.includes(v.status),
  );
}

// ---------------------------------------------------------------------------
// Permission-safe display
// ---------------------------------------------------------------------------

/** Returns a violation's financial amount only when the viewer is permitted.
 *  Otherwise returns null (UI shows a non-financial summary). */
export function safeAmount(
  v: Violation,
  canViewFinancials: boolean,
): number | null {
  return canViewFinancials ? v.total_amount : null;
}

/** Mask a financial summary for a viewer without financial permission:
 *  zeroes all money fields but preserves counts. */
export function maskFinancialSummary(
  summary: ViolationFinancialSummary,
  canViewFinancials: boolean,
): ViolationFinancialSummary {
  if (canViewFinancials) return summary;
  return {
    totalAssessed: 0,
    companyPaid: 0,
    customerCharged: 0,
    recovered: 0,
    unrecoveredExposure: 0,
    openCount: summary.openCount,
    disputedCount: summary.disputedCount,
  };
}

/** Statuses for the Violation Center tabs. */
export function statusForTab(tab: string): ViolationStatus[] | null {
  switch (tab) {
    case "open":
      return [
        "new",
        "assigned",
        "awaiting_customer",
        "due_soon",
        "overdue",
        "paid_by_company",
        "customer_charged",
        "partially_recovered",
      ];
    case "needs_review":
      return ["needs_review"];
    case "customer":
      return ["customer_charged", "partially_recovered", "awaiting_customer"];
    case "company":
      return ["paid_by_company"];
    case "disputed":
      return ["disputed"];
    case "resolved":
      return ["resolved", "cancelled"];
    default:
      return null;
  }
}
