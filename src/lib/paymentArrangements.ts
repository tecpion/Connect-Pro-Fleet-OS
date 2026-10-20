// Connect Pro Fleet — Payment Arrangement domain helpers (Build #10 / cleanup).
//
// Pure selectors over PaymentArrangement + installments + the actual ledger.
// A promise is NOT a payment: these helpers derive operational promise-tracking
// state (installment status, paid-toward-arrangement, remaining, broken) from
// the arrangement record + its linked actual FinancialTransactions. They NEVER
// reduce a financial balance — the ledger is the sole source of financial truth.
//
// Build #10 cleanup — reconciliation:
// The actual outstanding balance can drop WITHOUT an arrangement payment (e.g.
// a security deposit application, a manual credit, a reversed charge). We
// distinguish:
//   scheduledRemaining      = what the original/restructured promise schedule
//                             still says the customer promised (historical).
//   collectibleRemaining    = min(scheduledRemaining, currentActualOutstanding)
//                             — what can still legitimately be collected.
//   resolvedByCredits       = scheduledRemaining − paid − collectibleRemaining
//                             (debt resolved by non-payment balance reductions).
// An arrangement is "effectively resolved" when collectibleRemaining = 0, even
// if the customer never made a payment — so it stops surfacing as actionable.
//
// Date semantics use org-local-day comparison (consistent with the rest of the
// app) so a Friday promise isn't "late" Thursday evening. "Today" is resolved
// through the org-timezone helpers (getOrgTimezone → UTC safe default) — never
// the server/browser wall clock — so the same stored due dates produce the same
// installment/arrangement verdicts regardless of the runtime's TZ.

import type { FinancialTransaction } from "./types";
import { getOrgTimezone, startOfDayInTz } from "./timezone";
import type {
  ArrangementStatus,
  InstallmentStatus,
  PaymentArrangement,
  PaymentArrangementInstallment,
  ScheduleFrequency,
} from "./paymentArrangementTypes";

export type { ScheduleFrequency };

const DAY = 86_400_000;

function todayStr(tz?: string): string {
  // Org-local "today" as a date-only string. Resolved through getOrgTimezone
  // (UTC safe default) so a missing org timezone never silently follows the
  // machine wall clock.
  return startOfDayInTz(new Date(), getOrgTimezone(tz))
    .toISOString()
    .slice(0, 10);
}

function dayDiff(dueDate: string, tz?: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date(todayStr(tz) + "T00:00:00");
  return Math.round((today.getTime() - due.getTime()) / DAY);
}

/** Sum of allocated amounts from non-reversed posted payments linked to an
 *  installment. Uses the per-link allocation (linked_payments) so a single
 *  payment spanning two installments counts correctly toward each. */
export function installmentPaidAmount(
  installment: PaymentArrangementInstallment,
  transactions: FinancialTransaction[],
): number {
  const links = installment.linked_payments?.length
    ? installment.linked_payments
    : installment.linked_payment_transaction_ids.map((id) => ({
        transaction_id: id,
        amount: 0,
      }));
  let total = 0;
  for (const link of links) {
    const t = transactions.find((x) => x.id === link.transaction_id);
    if (!t || t.status !== "posted") continue;
    if (t.category !== "payment") continue;
    // Exclude deposit applications (held money, not a customer payment).
    if (t.deposit_id && t.metadata?.deposit_kind === "application") continue;
    total += link.amount || t.amount;
  }
  return Math.min(total, installment.amount_due);
}

/** Derive an installment's operational status from due date + linked payments.
 *  `tz` is the org timezone; the due/late boundary is org-local. Omitted `tz`
 *  resolves to the UTC safe default (getOrgTimezone), never the machine clock. */
export function installmentStatus(
  installment: PaymentArrangementInstallment,
  transactions: FinancialTransaction[],
  gracePeriodDays = 0,
  tz?: string,
): InstallmentStatus {
  const paid = installmentPaidAmount(installment, transactions);
  if (paid >= installment.amount_due) return "paid";
  if (paid > 0) return "partially_paid";
  const diff = dayDiff(installment.due_date, tz);
  if (diff < 0) return "upcoming";
  if (diff === 0) return "due_today";
  // Past due — late if within grace, missed if beyond it.
  if (diff > gracePeriodDays) return "missed";
  return "late";
}

/** Total actually paid toward an arrangement (sum of all installment linked payments). */
export function arrangementPaidAmount(
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
): number {
  return installments.reduce(
    (sum, ins) => sum + installmentPaidAmount(ins, transactions),
    0,
  );
}

/** Remaining promised amount (arrangement amount minus actually paid). */
export function arrangementRemaining(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
): number {
  return Math.max(
    0,
    arrangement.arrangement_amount -
      arrangementPaidAmount(installments, transactions),
  );
}

/** Next unpaid installment (oldest due first), or null if none. */
export function getNextInstallment(
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
): PaymentArrangementInstallment | null {
  const unpaid = installments
    .filter((ins) => installmentPaidAmount(ins, transactions) < ins.amount_due)
    .sort((a, b) =>
      a.due_date === b.due_date
        ? a.sequence - b.sequence
        : a.due_date < b.due_date
          ? -1
          : 1,
    );
  return unpaid[0] ?? null;
}

/** Is the arrangement broken? Deterministic: any installment missed beyond
 *  grace. `tz` is the org timezone; see `installmentStatus`. */
export function isArrangementBroken(
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  gracePeriodDays: number,
  tz?: string,
): boolean {
  return installments.some(
    (ins) =>
      installmentStatus(ins, transactions, gracePeriodDays, tz) === "missed",
  );
}

/** Derive the arrangement's effective status from installments + ledger.
 *  `tz` is the org timezone; the broken check is org-local. */
export function deriveArrangementStatus(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  tz?: string,
): ArrangementStatus {
  if (arrangement.status === "cancelled") return "cancelled";
  const paid = arrangementPaidAmount(installments, transactions);
  if (paid >= arrangement.arrangement_amount) return "completed";
  if (
    isArrangementBroken(
      installments,
      transactions,
      arrangement.grace_period_days,
      tz,
    )
  )
    return "broken";
  return "active";
}

/** Promises due today across all arrangements (installments due today + unpaid).
 *  If `outstandingFor` is supplied, arrangements whose collectible debt is $0
 *  (resolved by credits, not payments) are excluded — no point surfacing a
 *  promise against debt that no longer exists. */
export function getPromisesDueToday(
  arrangements: PaymentArrangement[],
  installmentsByArrangement: (id: string) => PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  outstandingFor?: (arrangement: PaymentArrangement) => number,
  tz?: string,
): PaymentArrangementInstallment[] {
  const out: PaymentArrangementInstallment[] = [];
  for (const a of arrangements) {
    if (a.status === "cancelled" || a.status === "completed") continue;
    if (
      outstandingFor &&
      isArrangementEffectivelyResolved(
        a,
        installmentsByArrangement(a.id),
        transactions,
        outstandingFor(a),
      )
    )
      continue;
    for (const ins of installmentsByArrangement(a.id)) {
      if (
        installmentStatus(ins, transactions, a.grace_period_days, tz) ===
        "due_today"
      )
        out.push(ins);
    }
  }
  return out;
}

/** Broken arrangements (derived). Excludes arrangements whose collectible debt
 *  is $0 (resolved by credits) when `outstandingFor` is supplied. */
export function getBrokenArrangements(
  arrangements: PaymentArrangement[],
  installmentsByArrangement: (id: string) => PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  outstandingFor?: (arrangement: PaymentArrangement) => number,
  tz?: string,
): PaymentArrangement[] {
  return arrangements.filter((a) => {
    if (a.status === "cancelled" || a.status === "completed") return false;
    if (
      outstandingFor &&
      isArrangementEffectivelyResolved(
        a,
        installmentsByArrangement(a.id),
        transactions,
        outstandingFor(a),
      )
    )
      return false;
    return isArrangementBroken(
      installmentsByArrangement(a.id),
      transactions,
      a.grace_period_days,
      tz,
    );
  });
}

// ---------------------------------------------------------------------------
// Reconciliation — actual balance can change without an arrangement payment.
// ---------------------------------------------------------------------------

/** The current actual outstanding balance for the debt covered by an
 *  arrangement. Caller supplies the authoritative outstanding (from the
 *  ledger / billing selectors) for the rental/customer so this helper stays
 *  pure and never re-implements ledger allocation. */
export function getArrangementCurrentOutstanding(
  arrangement: PaymentArrangement,
  rentalOutstanding: number,
): number {
  // The arrangement covers debt up to its original snapshot. New charges added
  // after the arrangement was created are NOT part of the covered debt, so cap
  // the applicable outstanding at the original outstanding amount.
  return Math.max(
    0,
    Math.min(rentalOutstanding, arrangement.original_outstanding_amount),
  );
}

/** Scheduled promise remaining = arrangement amount − actual linked payments.
 *  Historical; never changes merely because the ledger balance changed. */
export function getScheduledRemaining(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
): number {
  return arrangementRemaining(arrangement, installments, transactions);
}

/** Collectible arrangement remaining = min(scheduledRemaining, currentOutstanding).
 *  What can still legitimately be collected against the current actual debt. */
export function getArrangementCollectibleRemaining(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  rentalOutstanding: number,
): number {
  const scheduled = getScheduledRemaining(
    arrangement,
    installments,
    transactions,
  );
  const currentOutstanding = getArrangementCurrentOutstanding(
    arrangement,
    rentalOutstanding,
  );
  return Math.max(0, Math.min(scheduled, currentOutstanding));
}

/** Debt resolved by non-payment balance reductions (deposit application, manual
 *  credit, reversed charge, waived fee). Never counts as a customer payment. */
export function getArrangementResolvedByCredits(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  rentalOutstanding: number,
): number {
  const scheduled = getScheduledRemaining(
    arrangement,
    installments,
    transactions,
  );
  const collectible = getArrangementCollectibleRemaining(
    arrangement,
    installments,
    transactions,
    rentalOutstanding,
  );
  return Math.max(0, scheduled - collectible);
}

/** Is the arrangement effectively resolved (no collectible debt remains), even
 *  if the customer never made a payment? Used to stop surfacing as actionable. */
export function isArrangementEffectivelyResolved(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  rentalOutstanding: number,
): boolean {
  if (arrangement.status === "cancelled" || arrangement.status === "completed")
    return true;
  return (
    getArrangementCollectibleRemaining(
      arrangement,
      installments,
      transactions,
      rentalOutstanding,
    ) <= 0
  );
}

/** Does the schedule exceed the current balance (needs reconciliation notice)? */
export function arrangementNeedsReconciliation(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  rentalOutstanding: number,
): boolean {
  if (arrangement.status === "cancelled" || arrangement.status === "completed")
    return false;
  const scheduled = getScheduledRemaining(
    arrangement,
    installments,
    transactions,
  );
  const collectible = getArrangementCollectibleRemaining(
    arrangement,
    installments,
    transactions,
    rentalOutstanding,
  );
  return scheduled > collectible + 0.001;
}

/** Additional balance outside the arrangement (new charges added after it was
 *  created). Distinct from the arranged debt. */
export function getAdditionalBalanceOutsideArrangement(
  arrangement: PaymentArrangement,
  rentalOutstanding: number,
): number {
  return Math.max(
    0,
    rentalOutstanding - arrangement.original_outstanding_amount,
  );
}

/** Reconciled view of an arrangement — all derived values in one call so UI
 *  components never re-implement the math. */
export interface ArrangementReconciliation {
  scheduledRemaining: number;
  collectibleRemaining: number;
  resolvedByCredits: number;
  paidAmount: number;
  currentOutstanding: number;
  additionalOutsideArrangement: number;
  needsReconciliation: boolean;
  effectivelyResolved: boolean;
}

export function reconcileArrangement(
  arrangement: PaymentArrangement,
  installments: PaymentArrangementInstallment[],
  transactions: FinancialTransaction[],
  rentalOutstanding: number,
): ArrangementReconciliation {
  const paidAmount = arrangementPaidAmount(installments, transactions);
  const scheduledRemaining = getScheduledRemaining(
    arrangement,
    installments,
    transactions,
  );
  const collectibleRemaining = getArrangementCollectibleRemaining(
    arrangement,
    installments,
    transactions,
    rentalOutstanding,
  );
  return {
    scheduledRemaining,
    collectibleRemaining,
    resolvedByCredits: Math.max(0, scheduledRemaining - collectibleRemaining),
    paidAmount,
    currentOutstanding: getArrangementCurrentOutstanding(
      arrangement,
      rentalOutstanding,
    ),
    additionalOutsideArrangement: getAdditionalBalanceOutsideArrangement(
      arrangement,
      rentalOutstanding,
    ),
    needsReconciliation: arrangementNeedsReconciliation(
      arrangement,
      installments,
      transactions,
      rentalOutstanding,
    ),
    effectivelyResolved: isArrangementEffectivelyResolved(
      arrangement,
      installments,
      transactions,
      rentalOutstanding,
    ),
  };
}

// ---------------------------------------------------------------------------
// Schedule generation — installments that sum EXACTLY to the arrangement amount.
// ---------------------------------------------------------------------------

export interface GeneratedInstallment {
  amount: number;
  due_date: string;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  return new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);
}

/** Generate an equal-installment schedule. The last installment absorbs the
 *  rounding remainder so the total is EXACTLY `amount` (no lost cents). */
export function generateSchedule(
  amount: number,
  count: number,
  firstDueDate: string,
  frequency: ScheduleFrequency,
): GeneratedInstallment[] {
  if (count <= 0 || amount <= 0) return [];
  const interval =
    frequency === "daily"
      ? 1
      : frequency === "weekly"
        ? 7
        : frequency === "biweekly"
          ? 14
          : 7; // custom falls back to weekly spacing
  const base = Math.floor((amount * 100) / count) / 100;
  const out: GeneratedInstallment[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    let amt = base;
    if (i === count - 1) amt = Math.round((amount - allocated) * 100) / 100;
    allocated = Math.round((allocated + amt) * 100) / 100;
    out.push({ amount: amt, due_date: addDaysISO(firstDueDate, i * interval) });
  }
  return out;
}

/** Validate a custom schedule: must sum exactly to arrangement amount. */
export function validateCustomSchedule(
  installments: { amount: number; due_date: string }[],
  arrangementAmount: number,
): { ok: boolean; error?: string } {
  if (installments.length === 0)
    return { ok: false, error: "Add at least one installment." };
  const sum =
    Math.round(installments.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  if (Math.round(sum * 100) !== Math.round(arrangementAmount * 100))
    return {
      ok: false,
      error: `Installments total ${sum.toFixed(2)} but the arrangement is ${arrangementAmount.toFixed(2)}.`,
    };
  for (const i of installments) {
    if (i.amount <= 0)
      return { ok: false, error: "Installments must be greater than zero." };
    if (!i.due_date)
      return { ok: false, error: "Every installment needs a due date." };
  }
  return { ok: true };
}

/** Generate the next arrangement number, e.g. PA-000123. */
export function nextArrangementNumber(existing: PaymentArrangement[]): string {
  const year = new Date().getFullYear();
  const max = existing.reduce((m, a) => {
    const match = a.arrangement_number.match(/PA-(\d{4})-(\d+)/);
    if (match && match[1] === String(year)) {
      return Math.max(m, parseInt(match[2], 10));
    }
    return m;
  }, 0);
  return `PA-${year}-${String(max + 1).padStart(6, "0")}`;
}
