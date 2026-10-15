// Connect Pro Fleet — ledger late-fee methods (Build #14 split).
// Extracted from ledgerStore.ts to keep each module focused. applyLateFee and
// waiveLateFee post ledger charges/credits and sync the rental's derived
// balance. The ledger remains the financial source of truth.

import { fmtMoney } from "../format";
import { rentalTransactions, summarize } from "../ledger";
import type { FinancialTransaction } from "../types";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { emitLateFeeApplied } from "./integrationEmission";

/** Synchronous idempotency registry for late-fee application. Reads of
 *  s.rentals.late_fee_applied / s.transactions inside a single batched act()
 *  are stale, so we track rentals that already have a posted late fee in a
 *  module-level ref that updates synchronously. Re-applying within the same
 *  render cycle never creates a second fee. */
const lateFeeAppliedRentals = new Set<string>();

export function buildLedgerLateFeeMethods(s: StoreState) {
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

  return {
    applyLateFee: (id: string) => {
      const rental = s.rentals.find((r) => r.id === id);
      if (!rental || rental.late_fee <= 0) return;
      // Idempotency against rapid/stale-state calls: the registry is updated
      // synchronously so repeated calls within one batched act() never create
      // a second fee (s.rentals.late_fee_applied is stale until React flushes).
      if (lateFeeAppliedRentals.has(id) || rental.late_fee_applied) return;
      lateFeeAppliedRentals.add(id);
      const now = new Date().toISOString();
      const txn: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: id,
        reservation_id: rental.reservation_id,
        customer_id: rental.customer_id,
        vehicle_id: rental.vehicle_id,
        invoice_id: null,
        deposit_id: null,
        transaction_type: "late_fee",
        category: "charge",
        description: "Late fee",
        amount: rental.late_fee,
        direction: "charge",
        payment_method: null,
        external_transaction_id: null,
        status: "posted",
        effective_date: now.slice(0, 10),
        created_at: now,
        created_by: s.currentStaffId,
        notes: null,
        related_transaction_id: null,
        billing_period: null,
        metadata: null,
      };
      s.setTransactions((ts) => [...ts, txn]);
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === id
            ? {
                ...r,
                late_fee_applied: true,
                status: r.status === "active" ? "late" : r.status,
                updated_at: now,
              }
            : r,
        ),
      );
      syncRentalFromLedger(id);
      s.setRentalEvents((es) => [
        {
          id: uid("rev"),
          rental_id: id,
          type: "late_fee",
          label: `Late fee applied — ${fmtMoney(rental.late_fee)}`,
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
            label: `Late fee applied — ${fmtMoney(rental.late_fee)} on ${rental.agreement_number}`,
            tone: "maintenance" as const,
          },
          ...a,
        ].slice(0, 30),
      );
      // Build #21 — Fleet is authoritative for late fees; emit once so Connect
      // Pro can notify the customer. Connect Pro must never add its own fee.
      emitLateFeeApplied(id, rental.customer_id, rental.late_fee, txn.id);
    },

    waiveLateFee: (id: string) => {
      const rental = s.rentals.find((r) => r.id === id);
      if (!rental || !rental.late_fee_applied || rental.late_fee <= 0) return;
      // Clear the idempotency registry so a late fee can be re-applied later
      // after a waiver (the obligation is open again).
      lateFeeAppliedRentals.delete(id);
      const now = new Date().toISOString();
      const txn: FinancialTransaction = {
        id: uid("txn"),
        tenant_id: TENANT_ID,
        rental_id: id,
        reservation_id: rental.reservation_id,
        customer_id: rental.customer_id,
        vehicle_id: rental.vehicle_id,
        invoice_id: null,
        deposit_id: null,
        transaction_type: "fee_waiver",
        category: "credit",
        description: "Late fee waived",
        amount: rental.late_fee,
        direction: "credit",
        payment_method: null,
        external_transaction_id: null,
        status: "posted",
        effective_date: now.slice(0, 10),
        created_at: now,
        created_by: s.currentStaffId,
        notes: "Waived by staff",
        related_transaction_id: null,
        billing_period: null,
        metadata: null,
      };
      s.setTransactions((ts) => [...ts, txn]);
      s.setRentals((rs) =>
        rs.map((r) =>
          r.id === id ? { ...r, late_fee_applied: false, updated_at: now } : r,
        ),
      );
      syncRentalFromLedger(id);
      s.setRentalEvents((es) => [
        {
          id: uid("rev"),
          rental_id: id,
          type: "late_fee",
          label: `Late fee waived — ${fmtMoney(rental.late_fee)}`,
          at: now,
          tone: "neutral",
          staff_id: s.currentStaffId,
        },
        ...es,
      ]);
    },
  };
}
