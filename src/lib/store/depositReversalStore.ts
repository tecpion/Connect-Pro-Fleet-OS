// Connect Pro Fleet — deposit reversal + cancel + migration methods (Build #8/#19).
//
// Split from depositStore.ts to keep files focused. Handles reversal of a
// prior deposit money movement, cancellation of a deposit obligation, and
// migration of a pre-existing held deposit from a previous system.
//
// Reversals are immutable: the original ledger transaction is voided and a
// linked reversal transaction is posted (carrying metadata.reversal_of so the
// obligation impact mirrors the original with the opposite sign). The deposit
// amounts are restored via functional setState (no stale read). History is
// never deleted — a "reversed" event is appended.

import { fmtMoney } from "../format";
import type { FinancialTransaction, PaymentMethod } from "../types";
import type { DepositHistoryEvent, RentalDeposit } from "../depositTypes";
import { deriveDepositStatus } from "../deposit";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { postDepositTransaction } from "./depositLedger";

export function buildDepositReversalMethods(s: StoreState) {
  function logEvent(e: Omit<DepositHistoryEvent, "id" | "tenant_id">) {
    s.setDepositHistory((hs) => [
      { ...e, id: uid("dhe"), tenant_id: TENANT_ID },
      ...hs,
    ]);
  }

  function logAct(label: string) {
    s.setActivity((a) =>
      [
        {
          id: uid("act"),
          at: new Date().toISOString(),
          label,
          tone: "neutral" as const,
        },
        ...a,
      ].slice(0, 30),
    );
  }

  function syncDeposit(
    depositId: string,
    patch: (prev: RentalDeposit) => Partial<RentalDeposit>,
  ) {
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
  }

  return {
    reverseDepositAction: (historyEventId: string, reason: string) => {
      const evt = s.depositHistory.find((e) => e.id === historyEventId);
      if (!evt) return;
      const deposit = s.rentalDeposits.find((d) => d.id === evt.deposit_id);
      if (!deposit) return;
      const now = new Date().toISOString();

      const kindFor: Record<
        string,
        "collection" | "application" | "refund" | "forfeiture" | null
      > = {
        collected: "collection",
        applied: "application",
        refunded: "refund",
        forfeited: "forfeiture",
      };
      const origKind = kindFor[evt.event_type] ?? null;
      if (!origKind) return;

      // Restore the deposit amounts functionally (no stale read).
      if (evt.event_type === "collected") {
        syncDeposit(deposit.id, (prev) => ({
          collected_amount: Math.max(0, prev.collected_amount - evt.amount),
        }));
      } else if (evt.event_type === "applied") {
        syncDeposit(deposit.id, (prev) => ({
          applied_amount: Math.max(0, prev.applied_amount - evt.amount),
        }));
      } else if (evt.event_type === "refunded") {
        syncDeposit(deposit.id, (prev) => ({
          refunded_amount: Math.max(0, prev.refunded_amount - evt.amount),
        }));
      } else if (evt.event_type === "forfeited") {
        syncDeposit(deposit.id, (prev) => ({
          forfeited_amount: Math.max(0, prev.forfeited_amount - evt.amount),
        }));
      }

      // Post a linked reversal that mirrors the original's obligation impact
      // with the OPPOSITE sign. The original stays POSTED (immutable history);
      // the reversal cancels it in the obligation math. This preserves audit
      // history without double-counting (Pattern C).
      if (evt.transaction_id) {
        const orig = s.transactions.find((t) => t.id === evt.transaction_id);
        if (orig && orig.status === "posted") {
          // The reversal carries the OPPOSITE category/direction so its signed
          // obligation amount is the negation of the original's.
          const oppositeCategory: FinancialTransaction["category"] =
            orig.category === "charge"
              ? "credit"
              : orig.category === "payment"
                ? "refund"
                : orig.category === "credit"
                  ? "charge"
                  : "payment";
          const oppositeDirection: FinancialTransaction["direction"] =
            orig.direction === "charge"
              ? "credit"
              : orig.direction === "payment"
                ? "refund"
                : orig.direction === "credit"
                  ? "charge"
                  : "payment";
          const reversal: FinancialTransaction = {
            id: uid("txn"),
            tenant_id: TENANT_ID,
            rental_id: orig.rental_id,
            reservation_id: orig.reservation_id,
            customer_id: orig.customer_id,
            vehicle_id: orig.vehicle_id,
            invoice_id: null,
            deposit_id: orig.deposit_id,
            transaction_type: orig.transaction_type,
            category: oppositeCategory,
            description: `Reversal — ${orig.description}`,
            amount: orig.amount,
            direction: oppositeDirection,
            payment_method: orig.payment_method,
            external_transaction_id: null,
            status: "posted",
            effective_date: now.slice(0, 10),
            created_at: now,
            created_by: s.currentStaffId,
            notes: reason,
            related_transaction_id: orig.id,
            billing_period: null,
            metadata: {
              reversal: true,
              deposit: true,
              deposit_kind: "reversal",
              reversal_of: origKind,
            },
          };
          s.setTransactions((ts) => [...ts, reversal]);
        }
      }
      logEvent({
        deposit_id: deposit.id,
        event_type: "reversed",
        amount: evt.amount,
        staff_id: s.currentStaffId,
        at: now,
        reason,
      });
      logAct(`Deposit action reversed — ${fmtMoney(evt.amount)}`);
    },

    cancelDeposit: (depositId: string, reason?: string) => {
      const deposit = s.rentalDeposits.find((d) => d.id === depositId);
      if (!deposit) return;
      const now = new Date().toISOString();
      syncDeposit(depositId, () => ({ completed_at: now }));
      if (
        deposit.collected_amount === 0 &&
        deposit.applied_amount === 0 &&
        deposit.refunded_amount === 0 &&
        deposit.forfeited_amount === 0
      ) {
        s.setRentalDeposits((ds) =>
          ds.map((d) =>
            d.id === depositId
              ? { ...d, status: "cancelled", updated_at: now }
              : d,
          ),
        );
      }
      logEvent({
        deposit_id: depositId,
        event_type: "cancelled",
        amount: 0,
        staff_id: s.currentStaffId,
        at: now,
        reason: reason ?? null,
      });
    },

    migrateHeldDeposit: (input: {
      rental_id: string;
      customer_id: string;
      vehicle_id: string | null;
      amount: number;
      method: PaymentMethod;
      notes?: string | null;
    }): string => {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      const depositId = uid("dep");
      const deposit: RentalDeposit = {
        id: depositId,
        tenant_id: TENANT_ID,
        reservation_id: null,
        rental_id: input.rental_id,
        customer_id: input.customer_id,
        vehicle_id: input.vehicle_id,
        policy_id: null,
        required_amount: input.amount,
        collected_amount: input.amount,
        applied_amount: 0,
        refunded_amount: 0,
        forfeited_amount: 0,
        status: "held",
        currency: "USD",
        source_snapshot: {
          source: "manual",
          policy_name: null,
          class_name: null,
        },
        collected_at: today,
        refund_due_at: null,
        completed_at: null,
        notes: input.notes ?? "Migrated held deposit (pre-Fleet)",
        created_at: now,
        updated_at: now,
        created_by: s.currentStaffId,
      };
      s.setRentalDeposits((ds) => [deposit, ...ds]);
      const txnId = postDepositTransaction(s, {
        depositId,
        rentalId: input.rental_id,
        reservationId: null,
        customerId: input.customer_id,
        vehicleId: input.vehicle_id,
        transactionType: "other_payment",
        category: "payment",
        description: `Migrated security deposit held — ${fmtMoney(input.amount)}`,
        amount: input.amount,
        direction: "payment",
        paymentMethod: input.method,
        notes: input.notes ?? "Migrated held deposit (pre-Fleet)",
        depositKind: "collection",
      });
      // Tag the transaction as a migration entry so it's excluded from
      // current-period collections/revenue selectors.
      s.setTransactions((ts) =>
        ts.map((t) =>
          t.id === txnId
            ? { ...t, metadata: { ...(t.metadata ?? {}), migration: true } }
            : t,
        ),
      );
      logEvent({
        deposit_id: depositId,
        event_type: "collected",
        amount: input.amount,
        payment_method: input.method,
        transaction_id: txnId,
        staff_id: s.currentStaffId,
        at: now,
        request_key: `mig_${depositId}`,
      });
      return depositId;
    },
  };
}
