// Connect Pro Fleet — deposit domain helpers (Build #8 / Build #8 cleanup).
//
// Pure selectors over RentalDeposit + ledger transactions. Derived values
// (held balance, refund due, collect due) are computed here rather than
// scattered across components. The ledger remains the financial source of
// truth; these helpers derive operational state from the deposit record +
// its linked transactions.
//
// Build #8 cleanup — deposit transaction semantics:
// A deposit transaction carries metadata.deposit_kind identifying WHY money
// moved, so selectors can treat each kind correctly instead of blanket-
// excluding every deposit-tagged transaction:
//   - "collection"  : held cash in. NOT rental revenue; does NOT satisfy
//                     ordinary rental charges (excluded from the obligation
//                     payment pool).
//   - "application" : held funds applied to an EXISTING charge. Reduces the
//                     customer's outstanding obligation (acts like a payment
//                     against charges) but is NOT new revenue.
//   - "refund"      : held funds returned. NOT negative rental revenue.
//   - "forfeiture"  : held funds retained as recognized revenue (a real
//                     charge). Counts toward billed revenue exactly once.
//   - "reversal"    : undoes a prior deposit event (opposite sign).

import type { FinancialTransaction } from "./types";
import type {
  DepositHistoryEvent,
  DepositStatus,
  RentalDeposit,
} from "./depositTypes";

/** The semantic kind of a deposit-linked transaction. */
export type DepositKind =
  "collection" | "application" | "refund" | "forfeiture" | "reversal";

/** Read the deposit kind from a transaction's metadata. */
export function depositKind(t: FinancialTransaction): DepositKind | null {
  const k = t.metadata?.deposit_kind;
  if (
    k === "collection" ||
    k === "application" ||
    k === "refund" ||
    k === "forfeiture" ||
    k === "reversal"
  ) {
    return k;
  }
  return null;
}

/** Is this transaction a deposit HELD-money movement (not an obligation settlement)?
 *  Held events (collection, refund) and their reversals do not affect the
 *  rental obligation and are not counted as rental collections/revenue. */
export function isDepositHeldEvent(t: FinancialTransaction): boolean {
  if (!t.deposit_id) return false;
  const k = depositKind(t);
  if (k === "collection" || k === "refund") return true;
  if (k === "reversal") {
    const of = t.metadata?.reversal_of as DepositKind | undefined;
    return of === "collection" || of === "refund";
  }
  return false;
}

/**
 * Does this transaction affect the customer's rental obligation balance?
 *   - application : YES (reduces outstanding, like a payment)
 *   - forfeiture   : YES (increases outstanding as a recognized charge)
 *   - collection/refund : NO (held money, not obligation)
 *   - reversal-of-application  : YES (restores outstanding, +amount)
 *   - reversal-of-forfeiture   : YES (removes recognized revenue, −amount)
 *   - reversal-of-collection/refund : NO (held money)
 * Non-deposit transactions always affect the obligation per normal ledger rules.
 */
export function affectsRentalObligation(t: FinancialTransaction): boolean {
  if (!t.deposit_id) return true; // ordinary ledger transaction
  const k = depositKind(t);
  if (k === "application" || k === "forfeiture") return true;
  if (k === "reversal") {
    const of = t.metadata?.reversal_of as DepositKind | undefined;
    return of === "application" || of === "forfeiture";
  }
  return false; // collection / refund (held money)
}

/**
 * Signed obligation impact of a transaction (positive = customer owes more).
 * Mirrors ledger.signedAmount but applies deposit semantics: held-money
 * movements (collection/refund) contribute 0 to the obligation, while
 * application acts as a payment (−) and forfeiture acts as a charge (+).
 */
export function obligationSignedAmount(t: FinancialTransaction): number {
  if (t.status !== "posted") return 0;
  if (t.deposit_id) {
    const k = depositKind(t);
    if (k === "collection" || k === "refund") return 0; // held money, not obligation
    if (k === "application") return -t.amount; // settles an existing charge
    if (k === "forfeiture") return t.amount; // recognized revenue charge
    if (k === "reversal") {
      // Reversal mirrors the original's obligation impact with opposite sign.
      const reversalOf = t.metadata?.reversal_of as DepositKind | undefined;
      if (reversalOf === "collection" || reversalOf === "refund") return 0;
      if (reversalOf === "application") return t.amount; // undo the −amount
      if (reversalOf === "forfeiture") return -t.amount; // undo the +amount
      return 0;
    }
    return 0;
  }
  // Ordinary ledger transaction.
  // A reversal (metadata.reversal) is an audit companion to a voided original;
  // the voided original returns 0 above (status !== "posted"), so the reversal
  // must also return 0 to avoid a lone opposite-signed obligation entry.
  if (t.metadata?.reversal === true) return 0;
  switch (t.category) {
    case "charge":
      return t.amount;
    case "payment":
      return -t.amount;
    case "credit":
      return -t.amount;
    case "refund":
      return t.amount;
    default:
      return 0;
  }
}

/** Held balance = collected − applied − refunded − forfeited. */
export function getDepositHeldBalance(d: RentalDeposit): number {
  return Math.max(
    0,
    d.collected_amount -
      d.applied_amount -
      d.refunded_amount -
      d.forfeited_amount,
  );
}

/** Amount still owed by the customer to fully collect the required deposit. */
export function getDepositCollectDue(d: RentalDeposit): number {
  return Math.max(0, d.required_amount - d.collected_amount);
}

/** Refundable balance = held − (already refunded). Money the company owes back. */
export function getDepositRefundDue(d: RentalDeposit): number {
  return Math.max(
    0,
    d.collected_amount -
      d.applied_amount -
      d.forfeited_amount -
      d.refunded_amount,
  );
}

/** Has the required deposit been fully collected? */
export function isDepositCollected(
  d: RentalDeposit | null | undefined,
): boolean {
  if (!d) return true; // no deposit record = no requirement (zero-deposit)
  return d.collected_amount >= d.required_amount;
}

/** Is collection required before checkout can proceed? */
export function depositBlocksCheckout(
  d: RentalDeposit | null | undefined,
): boolean {
  if (!d) return false;
  if (d.required_amount <= 0) return false;
  return getDepositCollectDue(d) > 0;
}

/**
 * Derive the operational status from the deposit's amounts. This is the
 * canonical status computation — the stored status is kept in sync with it
 * so there's one source of truth for the lifecycle.
 */
export function deriveDepositStatus(d: RentalDeposit): DepositStatus {
  const collectDue = getDepositCollectDue(d);
  const held = getDepositHeldBalance(d);
  const refundDue = getDepositRefundDue(d);

  if (d.required_amount <= 0 && d.collected_amount === 0) return "cancelled";
  if (d.forfeited_amount > 0 && held === 0 && refundDue === 0)
    return "forfeited";
  if (d.refunded_amount > 0 && refundDue === 0 && held === 0) return "refunded";
  if (d.refunded_amount > 0 && refundDue > 0) return "partially_refunded";
  // Applied states take precedence over refund-pending (application is a
  // concrete money movement; refund-pending is set explicitly by markRefundPending).
  if (d.applied_amount > 0 && held === 0 && refundDue === 0)
    return "fully_applied";
  if (d.applied_amount > 0 && held > 0) return "partially_applied";
  // Refund pending = rental completed with refundable held deposit not yet issued.
  if (d.refund_due_at !== null && refundDue > 0) return "refund_pending";
  if (collectDue === 0 && held > 0) return "held";
  if (d.collected_amount > 0 && collectDue > 0) return "pending";
  return "required";
}

/** Ledger transactions linked to a deposit (collection / application / refund / forfeiture). */
export function depositTransactions(
  all: FinancialTransaction[],
  depositId: string,
): FinancialTransaction[] {
  return all
    .filter((t) => t.deposit_id === depositId && t.status === "posted")
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/** Chronological history events for a deposit. */
export function depositHistory(
  events: DepositHistoryEvent[],
  depositId: string,
): DepositHistoryEvent[] {
  return events
    .filter((e) => e.deposit_id === depositId)
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

/**
 * Settlement impact of a deposit for final rental settlement. Derived from
 * the deposit record so the settlement selector doesn't duplicate arithmetic.
 */
export interface DepositSettlementImpact {
  collected: number;
  applied: number;
  refunded: number;
  forfeited: number;
  held: number;
  refundDue: number;
}

export function getDepositSettlementImpact(
  d: RentalDeposit | null,
): DepositSettlementImpact {
  if (!d)
    return {
      collected: 0,
      applied: 0,
      refunded: 0,
      forfeited: 0,
      held: 0,
      refundDue: 0,
    };
  return {
    collected: d.collected_amount,
    applied: d.applied_amount,
    refunded: d.refunded_amount,
    forfeited: d.forfeited_amount,
    held: getDepositHeldBalance(d),
    refundDue: getDepositRefundDue(d),
  };
}

/**
 * Outstanding rental obligation for a set of transactions, applying deposit
 * semantics: held-money movements (collection/refund) do not affect the
 * obligation; application reduces it; forfeiture increases it. This is the
 * authoritative obligation computation shared by settlement + selectors so
 * they never disagree.
 */
export function obligationBalance(
  transactions: FinancialTransaction[],
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    total += obligationSignedAmount(t);
  }
  return Math.max(0, total);
}

/** Sum of recognized revenue charges, excluding held deposit collection. */
export function recognizedCharges(
  transactions: FinancialTransaction[],
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    if (t.category !== "charge") continue;
    if (isDepositHeldEvent(t)) continue; // collection isn't a charge anyway
    total += t.amount;
  }
  return total;
}

/** Sum of obligation-reducing payments/credits, including deposit applications. */
export function obligationPayments(
  transactions: FinancialTransaction[],
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.status !== "posted") continue;
    if (!affectsRentalObligation(t)) continue;
    const signed = obligationSignedAmount(t);
    if (signed < 0) total += -signed;
  }
  return total;
}
