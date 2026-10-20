// Connect Pro Fleet — deposit store methods (Build #8 / cleanup).
//
// The operational security-deposit lifecycle: create/resolve a deposit for a
// reservation/rental, collect (full/partial), apply to charges, refund
// (full/partial), forfeit, override the requirement. Every money movement is
// coordinated with the ledger (via depositLedger) and recorded as an immutable
// DepositHistoryEvent. The ledger remains the financial source of truth; the
// RentalDeposit record is the operational lifecycle + derived state.
//
// Build #8 cleanup — financial integrity:
//   - syncDeposit uses a functional setState (prev => ...) so sequential
//     actions within one render cycle always read authoritative latest state
//     (no stale-counter bug).
//   - Each ledger transaction carries metadata.deposit_kind so revenue/
//     obligation selectors treat collection (held, not revenue), application
//     (reduces obligation), refund (held), and forfeiture (recognized
//     revenue) correctly — no blanket deposit_id exclusion.
//   - Forfeiture posts ONE recognized-revenue charge (deposit_kind:
//     "forfeiture") rather than a generic manual_adjustment charge, so it
//     counts toward billed revenue exactly once and is never double-counted.
//
// Idempotency: collection/application/refund/forfeiture accept a requestKey
// so a repeated submit never double-moves money. Reversal/cancel live in
// depositReversalStore.ts.

import { fmtMoney } from "../format";
import { rentalTransactions, summarize } from "../ledger";
import type { PaymentMethod } from "../types";
import type {
  DepositHistoryEvent,
  ForfeitureReason,
  RentalDeposit,
} from "../depositTypes";
import {
  deriveDepositStatus,
  getDepositHeldBalance,
  getDepositRefundDue,
} from "../deposit";
import { TENANT_ID, uid } from "./ids";
import { postDepositTransaction } from "./depositLedger";
import type { StoreState } from "./storeState";
import { resolveSystemTasks } from "./taskResolution";
import { emitDepositApplied } from "./depositIntegrationEmission";
import { buildDepositOverrideMethods } from "./depositOverrideStore";
import {
  persistDepositInsert,
  persistDepositUpdate,
  persistDepositHistoryInsert,
} from "../supabase/phase2StoreSync";

export function buildDepositMethods(s: StoreState) {
  function logEvent(e: Omit<DepositHistoryEvent, "id" | "tenant_id">) {
    const event: DepositHistoryEvent = {
      ...e,
      id: uid("dhe"),
      tenant_id: TENANT_ID,
    };
    s.setDepositHistory((hs) => [event, ...hs]);
    persistDepositHistoryInsert(event);
  }
  // Idempotency: has a money-moving event with this requestKey already fired?
  // Uses the synchronous ref registry so rapid sequential calls within one
  // batched act() see the key as used immediately (s.depositHistory is stale
  // until React flushes).
  function keyUsed(requestKey: string): boolean {
    if (s.depositKeys.current.has(requestKey)) return true;
    s.depositKeys.current.add(requestKey);
    return false;
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

  function addRentalEvent(
    rentalId: string,
    label: string,
    tone: "available" | "maintenance" | "out" | "rented" | "neutral",
  ) {
    s.setRentalEvents((es) => [
      {
        id: uid("rev"),
        rental_id: rentalId,
        type: "payment",
        label,
        at: new Date().toISOString(),
        tone,
        staff_id: s.currentStaffId,
      },
      ...es,
    ]);
  }

  /**
   * Functional deposit update: derives the next record from the PREVIOUS state
   * (not a stale snapshot read before the call), so rapid sequential actions
   * within one render cycle always accumulate correctly. Recomputes status
   * from the authoritative amounts.
   */
  function syncDeposit(
    depositId: string,
    patch: (prev: RentalDeposit) => Partial<RentalDeposit>,
  ) {
    const existing = s.rentalDeposits.find((d) => d.id === depositId);
    s.setRentalDeposits((ds) =>
      ds.map((d) => {
        if (d.id !== depositId) return d;
        const next = {
          ...d,
          ...patch(d),
          updated_at: new Date().toISOString(),
        };
        next.status = deriveDepositStatus(next);
        return next;
      }),
    );
    if (existing) {
      const merged: Partial<RentalDeposit> = patch(existing);
      persistDepositUpdate(existing.tenant_id, depositId, merged);
    }
  }

  const postTxn = postDepositTransaction.bind(null, s);

  return {
    depositForReservation: (reservationId: string) =>
      s.rentalDeposits.find((d) => d.reservation_id === reservationId) ?? null,
    depositForRental: (rentalId: string) =>
      s.rentalDeposits.find((d) => d.rental_id === rentalId) ?? null,
    depositForCustomer: (customerId: string) =>
      s.rentalDeposits.filter((d) => d.customer_id === customerId),

    // Snapshots the required amount so a later policy change never alters it.
    ensureDepositForReservation: (input: {
      reservationId: string;
      customerId: string;
      vehicleId: string | null;
      requiredAmount: number;
      policyId?: string | null;
      source: "vehicle_override" | "class" | "company_default" | "manual";
      policyName?: string | null;
      className?: string | null;
    }): RentalDeposit => {
      const existing = s.rentalDeposits.find(
        (d) => d.reservation_id === input.reservationId,
      );
      if (existing) return existing;
      const now = new Date().toISOString();
      const deposit: RentalDeposit = {
        id: uid("dep"),
        tenant_id: TENANT_ID,
        reservation_id: input.reservationId,
        rental_id: null,
        customer_id: input.customerId,
        vehicle_id: input.vehicleId,
        policy_id: input.policyId ?? null,
        required_amount: input.requiredAmount,
        collected_amount: 0,
        applied_amount: 0,
        refunded_amount: 0,
        forfeited_amount: 0,
        status: input.requiredAmount > 0 ? "required" : "cancelled",
        currency: "USD",
        source_snapshot: {
          source: input.source,
          policy_name: input.policyName ?? null,
          class_name: input.className ?? null,
        },
        collected_at: null,
        refund_due_at: null,
        completed_at: null,
        notes: null,
        created_at: now,
        updated_at: now,
        created_by: s.currentStaffId,
      };
      s.setRentalDeposits((ds) => [deposit, ...ds]);
      persistDepositInsert(deposit);
      if (input.requiredAmount > 0) {
        logEvent({
          deposit_id: deposit.id,
          event_type: "required",
          amount: input.requiredAmount,
          staff_id: s.currentStaffId,
          at: now,
        });
      }
      return deposit;
    },

    linkDepositToRental: (reservationId: string, rentalId: string) => {
      s.setRentalDeposits((ds) =>
        ds.map((d) =>
          d.reservation_id === reservationId && !d.rental_id
            ? {
                ...d,
                rental_id: rentalId,
                updated_at: new Date().toISOString(),
              }
            : d,
        ),
      );
    },

    collectDeposit: (
      depositId: string,
      input: {
        amount: number;
        method: PaymentMethod;
        reference?: string;
        notes?: string;
      },
      requestKey: string,
    ): { ok: boolean; error?: string } => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return { ok: false, error: "Deposit not found." };
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      if (keyUsed(requestKey)) return { ok: true };
      const now = new Date().toISOString();
      const txnId = postTxn({
        depositId,
        rentalId: deposit.rental_id,
        reservationId: deposit.reservation_id,
        customerId: deposit.customer_id,
        vehicleId: deposit.vehicle_id,
        transactionType: "other_payment",
        category: "payment",
        description: `Security deposit collected — ${fmtMoney(input.amount)} (${input.method})`,
        amount: input.amount,
        direction: "payment",
        paymentMethod: input.method,
        notes: input.notes ?? null,
        depositKind: "collection",
      });
      syncDeposit(depositId, (prev) => ({
        collected_amount: prev.collected_amount + input.amount,
        collected_at: prev.collected_at ?? now,
      }));
      logEvent({
        deposit_id: depositId,
        event_type: "collected",
        amount: input.amount,
        payment_method: input.method,
        transaction_id: txnId,
        staff_id: s.currentStaffId,
        at: now,
        request_key: requestKey,
      });
      logAct(
        `Security deposit collected — ${fmtMoney(input.amount)} (${input.method})`,
        "available",
      );
      return { ok: true };
    },

    applyDeposit: (
      depositId: string,
      input: { amount: number; notes?: string },
      requestKey: string,
    ): { ok: boolean; error?: string } => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return { ok: false, error: "Deposit not found." };
      const held = getDepositHeldBalance(deposit);
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      if (input.amount > held)
        return { ok: false, error: `Only ${fmtMoney(held)} is held.` };
      if (keyUsed(requestKey)) return { ok: true };
      const now = new Date().toISOString();
      // Application is a credit that reduces the customer's outstanding
      // obligation (acts like a payment against existing charges). It is NOT
      // new revenue — the underlying charge already exists.
      const txnId = postTxn({
        depositId,
        rentalId: deposit.rental_id,
        reservationId: deposit.reservation_id,
        customerId: deposit.customer_id,
        vehicleId: deposit.vehicle_id,
        transactionType: "manual_adjustment",
        category: "credit",
        description: `Deposit applied to charges — ${fmtMoney(input.amount)}`,
        amount: input.amount,
        direction: "credit",
        notes: input.notes ?? null,
        depositKind: "application",
      });
      syncDeposit(depositId, (prev) => ({
        applied_amount: prev.applied_amount + input.amount,
      }));
      logEvent({
        deposit_id: depositId,
        event_type: "applied",
        amount: input.amount,
        transaction_id: txnId,
        staff_id: s.currentStaffId,
        at: now,
        reason: input.notes ?? null,
        request_key: requestKey,
      });
      logAct(
        `Deposit applied to charges — ${fmtMoney(input.amount)}`,
        "maintenance",
      );
      if (deposit.rental_id)
        addRentalEvent(
          deposit.rental_id,
          `Deposit applied to charges — ${fmtMoney(input.amount)}`,
          "maintenance",
        );
      // Build #21 — emit DEPOSIT_APPLIED + BALANCE_CHANGED (not payment.received).
      const newBal = deposit.rental_id
        ? summarize(rentalTransactions(s.transactions, deposit.rental_id))
            .balance
        : 0;
      emitDepositApplied(
        deposit,
        txnId,
        input.amount,
        getDepositHeldBalance(
          s.rentalDeposits.find((d) => d.id === depositId)!,
        ),
        newBal,
      );
      return { ok: true };
    },

    refundDeposit: (
      depositId: string,
      input: { amount: number; method: PaymentMethod; notes?: string },
      requestKey: string,
    ): { ok: boolean; error?: string } => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return { ok: false, error: "Deposit not found." };
      const refundDue = getDepositRefundDue(deposit);
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      if (input.amount > refundDue)
        return {
          ok: false,
          error: `Only ${fmtMoney(refundDue)} is refundable.`,
        };
      if (keyUsed(requestKey)) return { ok: true };
      const now = new Date().toISOString();
      const txnId = postTxn({
        depositId,
        rentalId: deposit.rental_id,
        reservationId: deposit.reservation_id,
        customerId: deposit.customer_id,
        vehicleId: deposit.vehicle_id,
        transactionType: "refund",
        category: "refund",
        description: `Deposit refunded — ${fmtMoney(input.amount)} (${input.method})`,
        amount: input.amount,
        direction: "refund",
        paymentMethod: input.method,
        notes: input.notes ?? null,
        depositKind: "refund",
      });
      syncDeposit(depositId, (prev) => {
        const newRefunded = prev.refunded_amount + input.amount;
        const updated: Partial<RentalDeposit> = {
          refunded_amount: newRefunded,
          refund_due_at: null,
        };
        if (
          getDepositRefundDue({ ...prev, refunded_amount: newRefunded }) === 0
        )
          updated.completed_at = now;
        return updated;
      });
      logEvent({
        deposit_id: depositId,
        event_type: "refunded",
        amount: input.amount,
        payment_method: input.method,
        transaction_id: txnId,
        staff_id: s.currentStaffId,
        at: now,
        request_key: requestKey,
      });
      logAct(
        `Deposit refunded — ${fmtMoney(input.amount)} (${input.method})`,
        "neutral",
      );
      if (deposit.rental_id)
        addRentalEvent(
          deposit.rental_id,
          `Deposit refunded — ${fmtMoney(input.amount)}`,
          "neutral",
        );
      // Build #11 — resolve the "process deposit refund" system task when the
      // refundable balance is fully cleared.
      const after = getDepositRefundDue({
        ...deposit,
        refunded_amount: deposit.refunded_amount + input.amount,
      });
      if (after <= 0)
        resolveSystemTasks(
          s,
          "deposit.refund_pending",
          "deposit",
          depositId,
          "deposit refunded",
        );
      return { ok: true };
    },

    markRefundPending: (depositId: string) => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return;
      const refundDue = getDepositRefundDue(deposit);
      if (refundDue <= 0) return;
      const now = new Date().toISOString();
      syncDeposit(depositId, () => ({ refund_due_at: now }));
      logEvent({
        deposit_id: depositId,
        event_type: "refund_pending",
        amount: refundDue,
        staff_id: s.currentStaffId,
        at: now,
      });
    },

    forfeitDeposit: (
      depositId: string,
      input: { amount: number; reason: ForfeitureReason; notes?: string },
      requestKey: string,
    ): { ok: boolean; error?: string } => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return { ok: false, error: "Deposit not found." };
      const held = getDepositHeldBalance(deposit);
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      if (input.amount > held)
        return {
          ok: false,
          error: `Only ${fmtMoney(held)} is held to forfeit.`,
        };
      if (keyUsed(requestKey)) return { ok: true };
      const now = new Date().toISOString();
      // Forfeiture is recognized revenue — a single charge tagged
      // deposit_kind: "forfeiture". It counts toward billed revenue exactly
      // once and is never double-counted (no second generic charge).
      const txnId = postTxn({
        depositId,
        rentalId: deposit.rental_id,
        reservationId: deposit.reservation_id,
        customerId: deposit.customer_id,
        vehicleId: deposit.vehicle_id,
        transactionType: "miscellaneous_charge",
        category: "charge",
        description: `Deposit forfeited — ${fmtMoney(input.amount)} (${input.reason})`,
        amount: input.amount,
        direction: "charge",
        notes: input.notes ?? input.reason,
        depositKind: "forfeiture",
      });
      syncDeposit(depositId, (prev) => ({
        forfeited_amount: prev.forfeited_amount + input.amount,
      }));
      logEvent({
        deposit_id: depositId,
        event_type: "forfeited",
        amount: input.amount,
        transaction_id: txnId,
        staff_id: s.currentStaffId,
        at: now,
        reason: input.reason,
        request_key: requestKey,
      });
      logAct(
        `Deposit forfeited — ${fmtMoney(input.amount)} (${input.reason})`,
        "out",
      );
      if (deposit.rental_id)
        addRentalEvent(
          deposit.rental_id,
          `Deposit forfeited — ${fmtMoney(input.amount)}`,
          "out",
        );
      return { ok: true };
    },

    ...buildDepositOverrideMethods(s, syncDeposit, logEvent, logAct),
  };
}
