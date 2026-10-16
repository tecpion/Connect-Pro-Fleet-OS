// Connect Pro Fleet — Build #10 payment arrangement store lifecycle tests.
//
// Exercises the arrangement store methods through the real StoreProvider:
// creation (full/partial, validation, overlap prevention), schedule generation,
// actual-payment linkage (partial, spanning, excess, idempotency), reversal,
// restructure, cancellation, broken/completed derivation, and the critical rule
// that a promise never changes financial truth (balance/revenue/collections).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore, TENANT_ID } from "@/lib/store";
import type { ReactNode } from "react";
import type { RentalAgreement } from "@/lib/types";
import {
  arrangementPaidAmount,
  installmentPaidAmount,
} from "@/lib/paymentArrangements";
import { getOutstandingForRange } from "@/lib/financialSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function makeRental(id: string, balance = 600): RentalAgreement {
  return {
    id,
    tenant_id: TENANT_ID,
    reservation_id: null,
    customer_id: "cus_3",
    vehicle_id: "veh_1",
    agreement_number: `AGR-TEST-${id}`,
    status: "active",
    checkout_date: "2026-08-20",
    checkout_time: "09:00",
    scheduled_return_date: "2026-09-20",
    scheduled_return_time: "17:00",
    actual_return_date: null,
    actual_return_time: null,
    rate_type: "weekly",
    rate_amount: 300,
    subtotal: 600,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 0,
    amount_paid: 0,
    balance_due: balance,
    mileage_out: 0,
    mileage_in: null,
    fuel_out: 100,
    fuel_in: null,
    weekly_payment_day: "Monday",
    next_payment_due: "2026-08-27",
    payment_cutoff_time: "17:00",
    grace_period: 12,
    late_fee: 25,
    late_fee_applied: false,
    weeks_rented: 1,
    billing_config: null,
    pricing_snapshot: null,
    created_by: null,
    created_at: "2026-08-20T09:00:00Z",
    updated_at: "2026-08-20T09:00:00Z",
  };
}

function addRental(
  r: ReturnType<typeof useStoreHook>,
  id: string,
  balance = 600,
) {
  act(() => {
    r.current.addRental(makeRental(id, balance));
  });
}

describe("Build #10 — arrangement creation", () => {
  it("creates an arrangement with installments summing to the amount", () => {
    const r = useStoreHook();
    addRental(r, "new_rnt_test");
    const before = r.current.paymentArrangements.length;
    act(() => {
      r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "new_rnt_test",
        arrangementAmount: 600,
        originalOutstandingAmount: 600,
        startDate: "2026-08-20",
        gracePeriodDays: 1,
        termsSummary: "2 weekly payments of $300",
        installments: [
          { amount: 300, due_date: "2026-08-20" },
          { amount: 300, due_date: "2026-08-27" },
        ],
      });
    });
    expect(r.current.paymentArrangements.length).toBe(before + 1);
    const a = r.current.paymentArrangements[0];
    expect(a.arrangement_number).toMatch(/^PA-\d{4}-\d{6}$/);
    const installments = r.current.installmentsForArrangement(a.id);
    expect(installments.length).toBe(2);
    expect(installments[0].amount_due).toBe(300);
  });

  it("accepts an arrangement with a matching installment schedule", () => {
    const r = useStoreHook();
    addRental(r, "rnt_balance_check");
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_balance_check",
        arrangementAmount: 500,
        originalOutstandingAmount: 500,
        startDate: "2026-08-20",
        termsSummary: "test",
        installments: [{ amount: 500, due_date: "2026-08-20" }],
      });
    });
    expect(res!.ok).toBe(true);
  });

  it("blocks overlapping active arrangements on the same rental", () => {
    const r = useStoreHook();
    addRental(r, "rnt_overlap");
    act(() => {
      r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_overlap",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "first",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
    });
    let second: { ok: boolean; error?: string } | undefined;
    act(() => {
      second = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_overlap",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "second",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
    });
    expect(second!.ok).toBe(false);
    expect(second!.error).toContain("already exists");
  });

  it("rejects installments that don't sum to the arrangement amount", () => {
    const r = useStoreHook();
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_sum_check",
        arrangementAmount: 600,
        originalOutstandingAmount: 600,
        startDate: "2026-08-20",
        termsSummary: "test",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
    });
    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("200");
  });

  it("creating an arrangement does NOT change the rental balance or revenue", () => {
    const r = useStoreHook();
    const rentalId = "rnt_no_change";
    const balanceBefore = getOutstandingForRange(r.current.transactions);
    act(() => {
      r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId,
        arrangementAmount: 500,
        originalOutstandingAmount: 500,
        startDate: "2026-08-20",
        termsSummary: "test",
        installments: [{ amount: 500, due_date: "2026-08-20" }],
      });
    });
    const balanceAfter = getOutstandingForRange(r.current.transactions);
    expect(balanceAfter).toBe(balanceBefore);
  });
});

describe("Build #10 — actual payment linkage", () => {
  it("links an actual payment to the oldest unpaid installment", () => {
    const r = useStoreHook();
    addRental(r, "rnt_link");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_link",
        arrangementAmount: 400,
        originalOutstandingAmount: 400,
        startDate: "2026-08-20",
        termsSummary: "2 x $200",
        installments: [
          { amount: 200, due_date: "2026-08-20" },
          { amount: 200, due_date: "2026-08-27" },
        ],
      });
      arrangementId = res.arrangementId!;
    });
    // Record an actual payment against the rental via the authoritative path.
    let balance = 0;
    act(() => {
      balance = r.current.recordRentalPayment("rnt_link", 200, "Card");
    });
    // The payment should have been auto-linked (postPayment links to active
    // arrangements on the rental).
    const installments = r.current.installmentsForArrangement(arrangementId);
    expect(installments[0].linked_payment_transaction_ids.length).toBe(1);
    const paid = arrangementPaidAmount(installments, r.current.transactions);
    expect(paid).toBe(200);
  });

  it("a payment spanning two installments allocates correctly", () => {
    const r = useStoreHook();
    addRental(r, "rnt_span");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_span",
        arrangementAmount: 400,
        originalOutstandingAmount: 400,
        startDate: "2026-08-20",
        termsSummary: "2 x $200",
        installments: [
          { amount: 200, due_date: "2026-08-20" },
          { amount: 200, due_date: "2026-08-27" },
        ],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.recordRentalPayment("rnt_span", 300, "Cash");
    });
    const installments = r.current.installmentsForArrangement(arrangementId);
    const paid = arrangementPaidAmount(installments, r.current.transactions);
    expect(paid).toBe(300);
    // First installment fully covered, second partially.
    expect(installmentPaidAmount(installments[0], r.current.transactions)).toBe(
      200,
    );
    expect(installmentPaidAmount(installments[1], r.current.transactions)).toBe(
      100,
    );
  });

  it("does not double-link the same payment transaction", () => {
    const r = useStoreHook();
    addRental(r, "rnt_dedupe");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_dedupe",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.recordRentalPayment("rnt_dedupe", 200, "Card");
    });
    const installments = r.current.installmentsForArrangement(arrangementId);
    const txnId = installments[0].linked_payment_transaction_ids[0];
    // Try to link the same txn again manually.
    act(() => {
      r.current.linkPaymentToArrangement(arrangementId, txnId);
    });
    expect(installments[0].linked_payment_transaction_ids.length).toBe(1);
  });

  it("payment greater than arrangement remaining still posts fully to ledger", () => {
    const r = useStoreHook();
    addRental(r, "rnt_excess");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_excess",
        arrangementAmount: 100,
        originalOutstandingAmount: 100,
        startDate: "2026-08-20",
        termsSummary: "1 x $100",
        installments: [{ amount: 100, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.recordRentalPayment("rnt_excess", 500, "Card");
    });
    const installments = r.current.installmentsForArrangement(arrangementId);
    const paid = arrangementPaidAmount(installments, r.current.transactions);
    // Arrangement only tracks up to its amount.
    expect(paid).toBe(100);
    // But the ledger received the full $500.
    const ledger = r.current.rentalLedger("rnt_excess");
    const payments = ledger.filter((t) => t.category === "payment");
    expect(payments.reduce((s, t) => s + t.amount, 0)).toBe(500);
  });
});

describe("Build #10 — reversal restores installment remaining", () => {
  it("a reversed payment restores the installment to unpaid", () => {
    const r = useStoreHook();
    addRental(r, "rnt_reverse");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_reverse",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.recordRentalPayment("rnt_reverse", 200, "Card");
    });
    const installments = r.current.installmentsForArrangement(arrangementId);
    const txnId = installments[0].linked_payment_transaction_ids[0];
    // Void the payment.
    act(() => {
      r.current.voidTransaction(txnId, "mistake");
    });
    const paid = arrangementPaidAmount(
      r.current.installmentsForArrangement(arrangementId),
      r.current.transactions,
    );
    expect(paid).toBe(0);
  });
});

describe("Build #10 — restructure + cancellation", () => {
  it("restructure preserves paid history and schedules the remaining", () => {
    const r = useStoreHook();
    addRental(r, "rnt_restructure");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_restructure",
        arrangementAmount: 400,
        originalOutstandingAmount: 400,
        startDate: "2026-08-20",
        termsSummary: "2 x $200",
        installments: [
          { amount: 200, due_date: "2026-08-20" },
          { amount: 200, due_date: "2026-08-27" },
        ],
      });
      arrangementId = res.arrangementId!;
    });
    // Pay the first installment.
    act(() => {
      r.current.recordRentalPayment("rnt_restructure", 200, "Card");
    });
    // Restructure the remaining $200 into 2 x $100.
    let res: { ok: boolean; error?: string } | undefined;
    act(() => {
      res = r.current.restructureArrangement(arrangementId, {
        newInstallments: [
          { amount: 100, due_date: "2026-09-03" },
          { amount: 100, due_date: "2026-09-10" },
        ],
        termsSummary: "restructured 2 x $100",
      });
    });
    expect(res!.ok).toBe(true);
    const installments = r.current.installmentsForArrangement(arrangementId);
    // Paid installment retained + 2 new installments.
    const paidCount = installments.filter(
      (i) => installmentPaidAmount(i, r.current.transactions) >= i.amount_due,
    ).length;
    expect(paidCount).toBe(1);
    expect(installments.length).toBe(3);
  });

  it("cancellation does not forgive debt or change the balance", () => {
    const r = useStoreHook();
    addRental(r, "rnt_cancel");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_cancel",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    const balanceBefore = getOutstandingForRange(r.current.transactions);
    act(() => {
      r.current.cancelArrangement(arrangementId, "customer dispute");
    });
    const a = r.current.paymentArrangements.find((x) => x.id === arrangementId);
    expect(a!.status).toBe("cancelled");
    const balanceAfter = getOutstandingForRange(r.current.transactions);
    expect(balanceAfter).toBe(balanceBefore);
  });
});

describe("Build #10 — completion + audit", () => {
  it("arrangement completes when all installments are paid", () => {
    const r = useStoreHook();
    addRental(r, "rnt_complete");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_complete",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.recordRentalPayment("rnt_complete", 200, "Card");
    });
    const a = r.current.paymentArrangements.find((x) => x.id === arrangementId);
    expect(a!.status).toBe("completed");
  });

  it("creation + payment generate arrangement timeline events", () => {
    const r = useStoreHook();
    addRental(r, "rnt_audit");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_audit",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.recordRentalPayment("rnt_audit", 200, "Card");
    });
    const events = r.current.arrangementEventLog(arrangementId);
    const types = events.map((e) => e.type);
    expect(types).toContain("created");
    expect(types).toContain("payment_linked");
  });
});

describe("Build #10 — new charges after arrangement", () => {
  it("a new charge does not auto-expand the arrangement amount", () => {
    const r = useStoreHook();
    addRental(r, "rnt_newcharge");
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_newcharge",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.postCharge("rnt_newcharge", {
        type: "cleaning_fee",
        amount: 150,
      });
    });
    const a = r.current.paymentArrangements.find((x) => x.id === arrangementId);
    expect(a!.arrangement_amount).toBe(200);
  });
});
