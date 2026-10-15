// Connect Pro Fleet — payment arrangement store methods (Build #10).
//
// The operational promise lifecycle: create an arrangement (with a generated or
// custom installment schedule), restructure, cancel, and link actual posted
// ledger payments to installments. A promise is NOT a payment — creating an
// arrangement posts NO ledger entries and changes NO financial balances. Only
// actual ledger payments (posted via the authoritative postPayment path) are
// linked to installments for operational tracking.
//
// Idempotency: payment linkage is keyed by transaction id — the same actual
// payment can never be linked twice. Reversal recalculates from posted/non-
// reversed transactions, so a reversed payment restores the installment's
// remaining amount without appending fake negative promise payments.

import { fmtMoney } from "../format";
import type { FinancialTransaction } from "../types";
import type {
  ArrangementEvent,
  ArrangementEventType,
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "../paymentArrangementTypes";
import {
  arrangementPaidAmount,
  deriveArrangementStatus,
  installmentPaidAmount,
  nextArrangementNumber,
} from "../paymentArrangements";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { getIntegrationEmitter } from "../integrationEmitterRef";

export function buildPaymentArrangementMethods(s: StoreState) {
  function logEvent(
    arrangementId: string,
    type: ArrangementEventType,
    label: string,
    opts?: {
      amount?: number | null;
      installmentId?: string | null;
      notes?: string | null;
    },
  ) {
    const ev: ArrangementEvent = {
      id: uid("aev"),
      tenant_id: TENANT_ID,
      arrangement_id: arrangementId,
      type,
      label,
      at: new Date().toISOString(),
      staff_id: s.currentStaffId,
      amount: opts?.amount ?? null,
      installment_id: opts?.installmentId ?? null,
      notes: opts?.notes ?? null,
    };
    s.setArrangementEvents((es) => [ev, ...es]);
  }

  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "neutral",
  ) {
    s.setActivity((a) =>
      [
        { id: uid("act"), at: new Date().toISOString(), label, tone },
        ...a,
      ].slice(0, 30),
    );
  }

  function installmentsFor(
    arrangementId: string,
  ): PaymentArrangementInstallment[] {
    return s.arrangementInstallments
      .filter((i) => i.arrangement_id === arrangementId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  /** Recompute + persist the arrangement's derived status from installments.
   *  Accepts optional merged arrays so it works inside a postPayment call where
   *  s.transactions / s.arrangementInstallments haven't flushed yet. */
  function syncArrangementStatus(
    arrangementId: string,
    mergedTxns?: FinancialTransaction[],
    updatedInstallments?: PaymentArrangementInstallment[],
  ) {
    const a = s.paymentArrangements.find((x) => x.id === arrangementId);
    if (!a) return;
    const installments = updatedInstallments ?? installmentsFor(arrangementId);
    const txns = mergedTxns ?? s.transactions;
    const status = deriveArrangementStatus(a, installments, txns);
    const wasBroken = a.status === "broken";
    const now = new Date().toISOString();
    s.setPaymentArrangements((arrs) =>
      arrs.map((x) =>
        x.id === arrangementId
          ? {
              ...x,
              status,
              completed_at:
                status === "completed"
                  ? (x.completed_at ?? now)
                  : x.completed_at,
              broken_at:
                status === "broken" ? (x.broken_at ?? now) : x.broken_at,
              updated_at: now,
            }
          : x,
      ),
    );
    // Build #21 — emit ARRANGEMENT_BROKEN when the arrangement transitions to
    // broken (Connect Pro can change reminders). Promises are not payments.
    if (status === "broken" && !wasBroken) {
      const emitter = getIntegrationEmitter();
      if (emitter.enabled) {
        emitter.enqueueOutbound({
          event_type: "arrangement.broken",
          entity_type: "rental",
          entity_id: a.rental_id ?? null,
          payload: {
            kind: "arrangement_broken",
            customer_id: a.customer_id,
            rental_id: a.rental_id ?? "",
            arrangement_id: arrangementId,
            missed_amount: 0,
            missed_date: null,
          },
          event_key: `outbound_arrangement_broken:${arrangementId}`,
          origin_system: "fleet",
        });
      }
    }
  }

  return {
    // --- selectors ----------------------------------------------------------
    arrangementsForRental: (rentalId: string): PaymentArrangement[] =>
      s.paymentArrangements.filter((a) => a.rental_id === rentalId),
    activeArrangementForRental: (rentalId: string): PaymentArrangement | null =>
      s.paymentArrangements.find(
        (a) =>
          a.rental_id === rentalId &&
          a.status !== "cancelled" &&
          a.status !== "completed",
      ) ?? null,
    arrangementsForCustomer: (customerId: string): PaymentArrangement[] =>
      s.paymentArrangements.filter((a) => a.customer_id === customerId),
    installmentsForArrangement: installmentsFor,
    arrangementEventLog: (arrangementId: string): ArrangementEvent[] =>
      s.arrangementEvents
        .filter((e) => e.arrangement_id === arrangementId)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),

    // --- creation -----------------------------------------------------------
    createPaymentArrangement: (input: {
      customerId: string;
      rentalId?: string | null;
      invoiceId?: string | null;
      billingPeriodIds?: string[];
      arrangementAmount: number;
      originalOutstandingAmount: number;
      startDate: string;
      gracePeriodDays?: number;
      termsSummary: string;
      reason?: string | null;
      installments: { amount: number; due_date: string }[];
    }): { ok: boolean; error?: string; arrangementId?: string } => {
      if (input.arrangementAmount <= 0)
        return {
          ok: false,
          error: "Arrangement amount must be greater than zero.",
        };
      if (input.installments.length === 0)
        return { ok: false, error: "Add at least one installment." };
      // Block overlapping active arrangement against the same rental.
      if (input.rentalId) {
        const existing = s.paymentArrangements.find(
          (a) =>
            a.rental_id === input.rentalId &&
            a.status !== "cancelled" &&
            a.status !== "completed",
        );
        if (existing)
          return {
            ok: false,
            error:
              "An active payment arrangement already exists for this rental. Restructure or cancel it first.",
          };
      }
      // Installments must sum exactly to the arrangement amount.
      const sum =
        Math.round(
          input.installments.reduce((s2, i) => s2 + i.amount, 0) * 100,
        ) / 100;
      if (Math.round(sum * 100) !== Math.round(input.arrangementAmount * 100))
        return {
          ok: false,
          error: `Installments total ${sum.toFixed(2)} but the arrangement is ${input.arrangementAmount.toFixed(2)}.`,
        };
      const now = new Date().toISOString();
      const id = uid("pa");
      const arrangement: PaymentArrangement = {
        id,
        tenant_id: TENANT_ID,
        arrangement_number: nextArrangementNumber(s.paymentArrangements),
        customer_id: input.customerId,
        rental_id: input.rentalId ?? null,
        invoice_id: input.invoiceId ?? null,
        billing_period_ids: input.billingPeriodIds ?? [],
        original_outstanding_amount: input.originalOutstandingAmount,
        arrangement_amount: input.arrangementAmount,
        status: "active",
        start_date: input.startDate,
        grace_period_days: input.gracePeriodDays ?? 0,
        terms_summary: input.termsSummary,
        reason: input.reason ?? null,
        created_by: s.currentStaffId,
        created_at: now,
        updated_at: now,
        completed_at: null,
        broken_at: null,
        cancelled_at: null,
      };
      s.setPaymentArrangements((arrs) => [arrangement, ...arrs]);
      const newInstallments: PaymentArrangementInstallment[] =
        input.installments.map((ins, idx) => ({
          id: uid("ins"),
          tenant_id: TENANT_ID,
          arrangement_id: id,
          sequence: idx + 1,
          amount_due: ins.amount,
          due_date: ins.due_date,
          linked_payment_transaction_ids: [],
          linked_payments: [],
          paid_at: null,
          notes: null,
          created_at: now,
        }));
      s.setArrangementInstallments((all) => [...all, ...newInstallments]);
      logEvent(
        id,
        "created",
        `Payment arrangement created — ${input.termsSummary}`,
        { amount: input.arrangementAmount, notes: input.reason ?? null },
      );
      logAct(
        `Payment arrangement created · ${fmtMoney(input.arrangementAmount)} · ${arrangement.arrangement_number}`,
        "neutral",
      );
      // Build #21 — emit ARRANGEMENT_CREATED so Connect Pro can adjust reminders.
      // A promise is NOT a payment — this event carries no financial effect.
      const emitter = getIntegrationEmitter();
      if (emitter.enabled) {
        const firstIns = newInstallments[0];
        emitter.enqueueOutbound({
          event_type: "arrangement.created",
          entity_type: "rental",
          entity_id: input.rentalId ?? null,
          payload: {
            kind: "arrangement_created",
            customer_id: input.customerId,
            rental_id: input.rentalId ?? "",
            arrangement_id: id,
            total_arranged: input.arrangementAmount,
            collectible_remaining: input.arrangementAmount,
            next_promise_date: firstIns?.due_date ?? null,
            next_promise_amount: firstIns?.amount_due ?? null,
          },
          event_key: `outbound_arrangement_created:${id}`,
          origin_system: "fleet",
        });
      }
      return { ok: true, arrangementId: id };
    },

    // --- restructure --------------------------------------------------------
    /** Cancel remaining unpaid installments and create a revised schedule.
     *  Preserves the original arrangement + paid history; the arrangement
     *  record itself is updated in place with new terms (history retained in
     *  arrangementEvents). Actual prior payments remain untouched. */
    restructureArrangement: (
      arrangementId: string,
      input: {
        newInstallments: { amount: number; due_date: string }[];
        termsSummary: string;
        reason?: string | null;
      },
    ): { ok: boolean; error?: string } => {
      const a = s.paymentArrangements.find((x) => x.id === arrangementId);
      if (!a) return { ok: false, error: "Arrangement not found." };
      if (a.status === "cancelled" || a.status === "completed")
        return { ok: false, error: "This arrangement is no longer active." };
      const installments = installmentsFor(arrangementId);
      const alreadyPaid = arrangementPaidAmount(installments, s.transactions);
      const remaining = Math.max(0, a.arrangement_amount - alreadyPaid);
      const sum =
        Math.round(
          input.newInstallments.reduce((s2, i) => s2 + i.amount, 0) * 100,
        ) / 100;
      if (Math.round(sum * 100) !== Math.round(remaining * 100))
        return {
          ok: false,
          error: `New installments total ${sum.toFixed(2)} but the remaining promised amount is ${remaining.toFixed(2)}.`,
        };
      const now = new Date().toISOString();
      // Cancel unpaid installments (preserve paid ones).
      s.setArrangementInstallments((all) =>
        all.map((ins) => {
          if (ins.arrangement_id !== arrangementId) return ins;
          if (installmentPaidAmount(ins, s.transactions) >= ins.amount_due)
            return ins;
          // Mark cancelled by zeroing remaining? We keep the record but flag via
          // a notes prefix so history is preserved. (Status is derived, so we
          // can't "cancel" an installment directly — instead we replace it.)
          return {
            ...ins,
            notes: `[cancelled in restructure] ${ins.notes ?? ""}`,
          };
        }),
      );
      // Remove the cancelled (unpaid) installments and add the new schedule.
      s.setArrangementInstallments((all) => {
        const kept = all.filter(
          (ins) =>
            ins.arrangement_id !== arrangementId ||
            installmentPaidAmount(ins, s.transactions) >= ins.amount_due,
        );
        const seqBase = kept.filter(
          (ins) => ins.arrangement_id === arrangementId,
        ).length;
        const added: PaymentArrangementInstallment[] =
          input.newInstallments.map((ins, idx) => ({
            id: uid("ins"),
            tenant_id: TENANT_ID,
            arrangement_id: arrangementId,
            sequence: seqBase + idx + 1,
            amount_due: ins.amount,
            due_date: ins.due_date,
            linked_payment_transaction_ids: [],
            linked_payments: [],
            paid_at: null,
            notes: null,
            created_at: now,
          }));
        return [...kept, ...added];
      });
      s.setPaymentArrangements((arrs) =>
        arrs.map((x) =>
          x.id === arrangementId
            ? {
                ...x,
                terms_summary: input.termsSummary,
                updated_at: now,
              }
            : x,
        ),
      );
      logEvent(
        arrangementId,
        "restructured",
        `Arrangement restructured — ${input.termsSummary}`,
        { amount: remaining, notes: input.reason ?? null },
      );
      logAct(
        `Payment arrangement restructured · ${a.arrangement_number} · ${fmtMoney(remaining)} remaining`,
        "neutral",
      );
      return { ok: true };
    },

    // --- cancel -------------------------------------------------------------
    cancelArrangement: (arrangementId: string, reason: string): void => {
      const a = s.paymentArrangements.find((x) => x.id === arrangementId);
      if (!a) return;
      const now = new Date().toISOString();
      s.setPaymentArrangements((arrs) =>
        arrs.map((x) =>
          x.id === arrangementId
            ? { ...x, status: "cancelled", cancelled_at: now, updated_at: now }
            : x,
        ),
      );
      logEvent(
        arrangementId,
        "cancelled",
        `Arrangement cancelled — ${reason}`,
        {
          notes: reason,
        },
      );
      logAct(
        `Payment arrangement cancelled · ${a.arrangement_number} · ${reason}`,
        "neutral",
      );
    },

    // --- payment linkage ----------------------------------------------------
    /** Link an actual posted ledger payment to an arrangement's installments
     *  (oldest unpaid first). Called after postPayment succeeds. Allocates the
     *  payment amount across installments FIFO. Idempotent by transaction id.
     *  Accepts the txn directly so it works inside a postPayment call where
     *  s.transactions hasn't flushed the new entry yet. */
    linkPaymentToArrangement: (
      arrangementId: string,
      paymentTxnId: string,
      txn?: FinancialTransaction | null,
    ): void => {
      const a = s.paymentArrangements.find((x) => x.id === arrangementId);
      if (!a || a.status === "cancelled" || a.status === "completed") return;
      const t = txn ?? s.transactions.find((x) => x.id === paymentTxnId);
      if (!t || t.category !== "payment" || t.status !== "posted") return;
      // Idempotency: already linked somewhere?
      const alreadyLinked = s.arrangementInstallments.some((i) =>
        i.linked_payment_transaction_ids.includes(paymentTxnId),
      );
      if (alreadyLinked) return;

      // Compute the updated installments purely (so we can sync status with the
      // in-memory result before state flushes). Allocate FIFO across installments.
      const mergedTxns = txn
        ? [...s.transactions.filter((x) => x.id !== txn.id), txn]
        : s.transactions;
      let remaining = t.amount;
      const now = new Date().toISOString();
      const updatedInstallments = installmentsFor(arrangementId).map((ins) => {
        if (remaining <= 0) return ins;
        const paid = installmentPaidAmount(ins, mergedTxns);
        const owed = Math.max(0, ins.amount_due - paid);
        if (owed <= 0) return ins;
        const willSatisfy = Math.min(owed, remaining);
        remaining = Math.round((remaining - willSatisfy) * 100) / 100;
        const nowPaid = paid + willSatisfy >= ins.amount_due - 0.001;
        return {
          ...ins,
          linked_payment_transaction_ids: [
            ...ins.linked_payment_transaction_ids,
            paymentTxnId,
          ],
          linked_payments: [
            ...(ins.linked_payments ?? []),
            { transaction_id: paymentTxnId, amount: willSatisfy },
          ],
          paid_at: nowPaid ? now : ins.paid_at,
        };
      });
      s.setArrangementInstallments((all) =>
        all.map((ins) => {
          const upd = updatedInstallments.find((u) => u.id === ins.id);
          return upd ?? ins;
        }),
      );
      // Log linkage + newly-paid installments.
      logEvent(
        arrangementId,
        "payment_linked",
        `Payment linked — ${fmtMoney(t.amount)}`,
        { amount: t.amount, installmentId: null },
      );
      for (const ins of updatedInstallments) {
        const paid = installmentPaidAmount(ins, mergedTxns);
        if (paid >= ins.amount_due && !ins.paid_at) {
          logEvent(
            arrangementId,
            "installment_paid",
            `Installment ${ins.sequence} paid — ${fmtMoney(ins.amount_due)}`,
            { amount: ins.amount_due, installmentId: ins.id },
          );
        }
      }
      syncArrangementStatus(arrangementId, mergedTxns, updatedInstallments);
    },

    /** Recalculate all arrangement statuses (called after a payment reversal). */
    refreshArrangementStatuses: (): void => {
      for (const a of s.paymentArrangements) {
        if (a.status === "cancelled") continue;
        syncArrangementStatus(a.id);
      }
    },
  };
}
