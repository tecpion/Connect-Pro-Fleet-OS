// Connect Pro Fleet — ledger core methods (Build #5 / Build #10 / Build #14).
// postTransaction, postPayment, postCharge, voidTransaction, sync, receipts.
// The ledger is the financial source of truth. Build #10: postPayment links
// actual posted payments to active payment arrangements (promise tracking).
// Build #14 cleanup: postPayment accepts a canonical TenderMethod + optional
// PaymentProcessor and persists them in transaction.metadata (alongside the
// legacy payment_method for backward compat) so collection reporting can group
// by tender/processor without a destructive migration.

import {
  fmtMoney,
  padSeq,
  paymentMethodMeta,
  paymentTypeForMethod,
  transactionTypeMeta,
} from "../format";
import { rentalTransactions, summarize, type LedgerSummary } from "../ledger";
import type {
  ChargeType,
  FinancialTransaction,
  PaymentMethod,
  Receipt,
  TransactionType,
} from "../types";
import {
  normalizePaymentMethod,
  toLegacyPaymentMethod,
  tenderLabel,
  type TenderMethod,
  type PaymentProcessor,
} from "../paymentMethodTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { emitPaymentPosted, emitPaymentReversed } from "./integrationEmission";
import { persistLedgerInsert } from "../supabase/phase2StoreSync";

export function buildLedgerMethods(
  s: StoreState,
  arrangements?: {
    linkPaymentToArrangement: (
      arrangementId: string,
      paymentTxnId: string,
      txn?: import("../types").FinancialTransaction | null,
    ) => void;
    refreshArrangementStatuses: () => void;
  },
) {
  function syncRentalFromLedger(rentalId: string) {
    const rental = s.rentals.find((r) => r.id === rentalId);
    if (!rental) return;
    const summary = summarize(rentalTransactions(s.transactions, rentalId));
    const now = new Date().toISOString();
    s.setRentals((rs) =>
      rs.map((r) =>
        r.id === rentalId
          ? {
              ...r,
              amount_paid: summary.paid,
              balance_due: summary.balance,
              status:
                summary.balance <= 0 &&
                ["payment_due", "late", "overdue"].includes(r.status)
                  ? "active"
                  : r.status,
              late_fee_applied:
                summary.balance <= 0 ? false : r.late_fee_applied,
              updated_at: now,
            }
          : r,
      ),
    );
  }

  // Build #5 cleanup: accept the txn + the UPDATED transaction array directly
  // (not a stale id lookup on s.transactions, which hasn't flushed yet after
  // setTransactions). This was a latent bug — receipts were never created
  // because the id lookup hit pre-update state and returned undefined.
  function issueReceiptForPayment(
    txn: FinancialTransaction,
    updatedTxns: FinancialTransaction[],
  ) {
    if (!txn || txn.category !== "payment" || txn.status !== "posted") return;
    if (s.receipts.some((r) => r.payment_transaction_id === txn.id)) return;
    const rental = s.rentals.find((r) => r.id === txn.rental_id);
    const year = new Date().getFullYear();
    const seq = padSeq(892 + s.receipts.length);
    const receipt: Receipt = {
      id: uid("rct"),
      tenant_id: TENANT_ID,
      receipt_number: `RCT-${year}-${seq}`,
      customer_id: txn.customer_id,
      rental_id: txn.rental_id,
      reservation_id: txn.reservation_id ?? null,
      vehicle_id: txn.vehicle_id ?? null,
      payment_transaction_id: txn.id,
      amount: txn.amount,
      payment_method: txn.payment_method ?? "other",
      external_transaction_id: txn.external_transaction_id ?? null,
      applied_invoice_ids: txn.invoice_id ? [txn.invoice_id] : [],
      remaining_balance: rental
        ? summarize(rentalTransactions(updatedTxns, rental.id)).balance
        : 0,
      issued_at: new Date().toISOString(),
      issued_by: s.currentStaffId,
      status: "issued",
    };
    s.setReceipts((rs) => [receipt, ...rs]);
  }

  // Expose sync so invoice module can recompute after a payment posts.
  // Build #14: accepts a canonical TenderMethod + optional processor. The
  // legacy PaymentMethod is derived via toLegacyPaymentMethod so existing
  // ledger consumers keep working; the canonical values are persisted in
  // metadata for collection reporting.
  function postPayment(
    rentalId: string,
    amount: number,
    method: PaymentMethod | TenderMethod,
    opts?: {
      reference?: string;
      notes?: string;
      effectiveDate?: string;
      invoiceId?: string;
      processor?: PaymentProcessor | null;
      paymentSource?: string | null;
    },
  ): number {
    const rental = s.rentals.find((r) => r.id === rentalId);
    if (!rental || amount <= 0) return rental?.balance_due ?? 0;
    const now = new Date().toISOString();
    const effective = opts?.effectiveDate ?? now.slice(0, 10);
    // Normalize to canonical tender + legacy payment method.
    const tender = normalizePaymentMethod(method);
    const legacyMethod: PaymentMethod = toLegacyPaymentMethod(tender);
    const txnType: TransactionType = paymentTypeForMethod[legacyMethod];
    const txn: FinancialTransaction = {
      id: uid("txn"),
      tenant_id: TENANT_ID,
      rental_id: rentalId,
      reservation_id: rental.reservation_id,
      customer_id: rental.customer_id,
      vehicle_id: rental.vehicle_id,
      invoice_id: opts?.invoiceId ?? null,
      deposit_id: null,
      transaction_type: txnType,
      category: "payment",
      description: `Payment · ${tenderLabel(tender)}`,
      amount,
      direction: "payment",
      payment_method: legacyMethod,
      external_transaction_id: opts?.reference ?? null,
      status: "posted",
      effective_date: effective,
      created_at: now,
      created_by: s.currentStaffId,
      notes: opts?.notes ?? null,
      related_transaction_id: null,
      billing_period: null,
      metadata: {
        tender_method: tender,
        processor: opts?.processor ?? null,
        payment_source: opts?.paymentSource ?? null,
      },
    };
    const updatedTxns = [...s.transactions, txn];
    s.setTransactions((ts) => [...ts, txn]);
    persistLedgerInsert(txn);
    if (opts?.invoiceId) {
      s.setTransactions((ts) =>
        ts.map((t) =>
          t.id === txn.id ? { ...t, invoice_id: opts.invoiceId! } : t,
        ),
      );
    }
    // Sync the rental's derived balance from the UPDATED ledger (including the
    // new payment) so amount_paid/balance_due are correct immediately — reading
    // s.transactions here would be stale (the setTransactions hasn't flushed).
    const summary = summarize(rentalTransactions(updatedTxns, rentalId));
    s.setRentals((rs) =>
      rs.map((r) =>
        r.id === rentalId
          ? {
              ...r,
              amount_paid: summary.paid,
              balance_due: summary.balance,
              status:
                summary.balance <= 0 &&
                ["payment_due", "late", "overdue"].includes(r.status)
                  ? "active"
                  : r.status,
              late_fee_applied:
                summary.balance <= 0 ? false : r.late_fee_applied,
              updated_at: now,
            }
          : r,
      ),
    );
    s.setRentalEvents((es) => [
      {
        id: uid("rev"),
        rental_id: rentalId,
        type: "payment",
        label: `Payment recorded — ${fmtMoney(amount)} (${tenderLabel(tender)})`,
        at: now,
        tone: "available",
        staff_id: s.currentStaffId,
      },
      ...es,
    ]);
    s.setActivity((a) =>
      [
        {
          id: uid("act"),
          at: now,
          label: `Payment recorded · ${fmtMoney(amount)} · ${tenderLabel(tender)} on ${rental.agreement_number}`,
          tone: "available" as const,
        },
        ...a,
      ].slice(0, 30),
    );
    issueReceiptForPayment(txn, updatedTxns);
    // Build #10 — link the actual posted payment to any active arrangement.
    if (arrangements) {
      const active = s.paymentArrangements.find(
        (a) =>
          a.rental_id === rentalId &&
          a.status !== "cancelled" &&
          a.status !== "completed",
      );
      if (active) arrangements.linkPaymentToArrangement(active.id, txn.id, txn);
    }
    // Build #21 — emit outbound PAYMENT_RECEIVED + BALANCE_CHANGED so Connect
    // Pro can stop reminders / send a receipt. Skipped for Connect-Pro-origin
    // payments (those post their own events with the inbound event as origin).
    emitPaymentPosted(s, txn, updatedTxns, opts?.paymentSource ?? null);
    return summarize(rentalTransactions(updatedTxns, rentalId)).balance;
  }

  return {
    syncRentalFromLedger,
    postPayment,

    recordLedgerPayment: (
      rentalId: string,
      amount: number,
      method: PaymentMethod | TenderMethod,
      opts?: {
        reference?: string;
        notes?: string;
        effectiveDate?: string;
        processor?: PaymentProcessor | null;
        paymentSource?: string | null;
      },
    ) => postPayment(rentalId, amount, method, opts),

    postCharge: (
      rentalId: string,
      input: {
        type: ChargeType;
        amount: number;
        description?: string;
        notes?: string;
      },
    ): string => {
      const rental = s.rentals.find((r) => r.id === rentalId);
      if (!rental || input.amount <= 0) return "";
      const now = new Date().toISOString();
      const meta = transactionTypeMeta[input.type];
      const txn: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: rentalId,
        reservation_id: rental.reservation_id ?? null,
        customer_id: rental.customer_id,
        vehicle_id: rental.vehicle_id,
        invoice_id: null,
        deposit_id: null,
        transaction_type: input.type,
        category: "charge",
        description: input.description ?? meta.label,
        amount: input.amount,
        direction: "charge",
        payment_method: null,
        external_transaction_id: null,
        status: "posted",
        effective_date: now.slice(0, 10),
        created_at: now,
        created_by: s.currentStaffId,
        notes: input.notes ?? null,
        related_transaction_id: null,
        billing_period: null,
        metadata: null,
      };
      s.setTransactions((ts) => [...ts, txn]);
      persistLedgerInsert(txn);
      syncRentalFromLedger(rentalId);
      s.setRentalEvents((es) => [
        {
          id: uid("rev"),
          rental_id: rentalId,
          type: "payment",
          label: `${meta.label} — ${fmtMoney(input.amount)}`,
          at: now,
          tone: "maintenance",
          staff_id: s.currentStaffId,
        },
        ...es,
      ]);
      s.setActivity((a) =>
        [
          {
            id: uid("act"),
            at: now,
            label: `${meta.label} applied · ${fmtMoney(input.amount)} on ${rental.agreement_number}`,
            tone: "maintenance" as const,
          },
          ...a,
        ].slice(0, 30),
      );
      return txn.id;
    },

    postTransaction: (
      input: Omit<
        FinancialTransaction,
        "id" | "tenant_id" | "created_at" | "created_by"
      > & { created_by?: string | null },
    ): string => {
      const now = new Date().toISOString();
      const txn: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: input.rental_id,
        reservation_id: input.reservation_id ?? null,
        customer_id: input.customer_id,
        vehicle_id: input.vehicle_id ?? null,
        invoice_id: input.invoice_id ?? null,
        deposit_id: input.deposit_id ?? null,
        transaction_type: input.transaction_type,
        category: input.category,
        description: input.description,
        amount: input.amount,
        direction: input.direction,
        payment_method: input.payment_method ?? null,
        external_transaction_id: input.external_transaction_id ?? null,
        status: "posted",
        effective_date: input.effective_date,
        created_at: now,
        created_by: input.created_by ?? s.currentStaffId,
        notes: input.notes ?? null,
        related_transaction_id: input.related_transaction_id ?? null,
        billing_period: input.billing_period ?? null,
        metadata: input.metadata ?? null,
      };
      s.setTransactions((ts) => [...ts, txn]);
      persistLedgerInsert(txn);
      return txn.id;
    },

    voidTransaction: (transactionId: string, reason?: string) => {
      const original = s.transactions.find((t) => t.id === transactionId);
      if (!original || original.status === "voided") return;
      const now = new Date().toISOString();
      s.setTransactions((ts) =>
        ts.map((t) =>
          t.id === transactionId ? { ...t, status: "voided" } : t,
        ),
      );
      const reversal: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: original.rental_id,
        reservation_id: original.reservation_id ?? null,
        customer_id: original.customer_id,
        vehicle_id: original.vehicle_id ?? null,
        invoice_id: original.invoice_id ?? null,
        deposit_id: original.deposit_id ?? null,
        transaction_type: original.transaction_type,
        category: original.category,
        description: `Reversal — ${original.description}`,
        amount: original.amount,
        direction: original.direction,
        payment_method: original.payment_method ?? null,
        external_transaction_id: null,
        status: "posted",
        effective_date: now.slice(0, 10),
        created_at: now,
        created_by: s.currentStaffId,
        notes: reason ?? "Voided by staff",
        related_transaction_id: transactionId,
        billing_period: null,
        metadata: { reversal: true },
      };
      s.setTransactions((ts) => [...ts, reversal]);
      persistLedgerInsert(reversal);
      if (s.rentals.find((r) => r.id === original.rental_id))
        syncRentalFromLedger(original.rental_id);
      if (arrangements) arrangements.refreshArrangementStatuses();
      s.setActivity((a) =>
        [
          {
            id: uid("act"),
            at: now,
            label: `Transaction voided — ${fmtMoney(original.amount)} (${original.description})${reason ? ` · ${reason}` : ""}`,
            tone: "neutral" as const,
          },
          ...a,
        ].slice(0, 30),
      );
      // Build #21 — emit PAYMENT_REVERSED + BALANCE_CHANGED for voided payments.
      emitPaymentReversed(s, original, reversal.id, reason);
    },

    /** Merge metadata into a posted transaction (e.g. tag a damage charge with
     *  damage_claim_id). Non-destructive: existing keys are preserved. */
    tagTransactionMetadata: (
      transactionId: string,
      meta: Record<string, unknown>,
    ) => {
      s.setTransactions((ts) =>
        ts.map((t) =>
          t.id === transactionId
            ? { ...t, metadata: { ...(t.metadata ?? {}), ...meta } }
            : t,
        ),
      );
    },

    rentalFinancials: (rentalId: string): LedgerSummary =>
      summarize(rentalTransactions(s.transactions, rentalId)),
    rentalLedger: (rentalId: string) =>
      rentalTransactions(s.transactions, rentalId),
    customerLedger: (customerId: string) =>
      s.transactions.filter(
        (t) => t.customer_id === customerId && t.status === "posted",
      ),
  };
}
