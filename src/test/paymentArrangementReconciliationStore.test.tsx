// Connect Pro Fleet — Build #10 cleanup reconciliation store tests.
//
// Integration tests through the real StoreProvider verifying that a security
// deposit application (a non-payment balance reduction) reduces the actual
// outstanding and the arrangement's collectible remaining WITHOUT being linked
// as a customer payment or inflating "paid toward arrangement".

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore, TENANT_ID } from "@/lib/store";
import type { ReactNode } from "react";
import type { RentalAgreement } from "@/lib/types";
import { reconcileArrangement } from "@/lib/paymentArrangements";
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

describe("Build #10 cleanup — deposit application reconciliation", () => {
  it("deposit application reduces actual outstanding but is not a LinkedPayment", () => {
    const r = useStoreHook();
    addRental(r, "rnt_dep_recon", 600);
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_dep_recon",
        arrangementAmount: 600,
        originalOutstandingAmount: 600,
        startDate: "2026-08-20",
        termsSummary: "1 x $600",
        installments: [{ amount: 600, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    // Post a charge so there's an obligation to apply a deposit against, then
    // create + collect a deposit and apply it.
    act(() => {
      r.current.postCharge("rnt_dep_recon", {
        type: "damage_charge",
        amount: 200,
      });
    });
    // Create a deposit record + collect + apply.
    act(() => {
      r.current.ensureDepositForReservation({
        reservationId: "res_dep_recon",
        customerId: "cus_3",
        vehicleId: "veh_1",
        requiredAmount: 300,
        source: "manual",
      });
    });
    const deposit = r.current.depositForCustomer("cus_3")[0];
    expect(deposit).toBeTruthy();
    act(() => {
      r.current.collectDeposit(
        deposit!.id,
        { amount: 300, method: "card" },
        "k1",
      );
    });
    act(() => {
      r.current.applyDeposit(deposit!.id, { amount: 200 }, "k2");
    });
    // The deposit application reduced the actual outstanding.
    const outstanding = r.current.rentalFinancials("rnt_dep_recon").balance;
    expect(outstanding).toBeLessThan(600);
    // But the arrangement's paid amount is still 0 (no customer payment linked).
    const installments = r.current.installmentsForArrangement(arrangementId);
    expect(installments[0].linked_payment_transaction_ids.length).toBe(0);
    // Collectible remaining is capped at the new outstanding.
    const rec = reconcileArrangement(
      r.current.paymentArrangements.find((a) => a.id === arrangementId)!,
      installments,
      r.current.transactions,
      outstanding,
    );
    expect(rec.paidAmount).toBe(0);
    expect(rec.collectibleRemaining).toBeLessThan(600);
    expect(rec.resolvedByCredits).toBeGreaterThan(0);
  });

  it("financial selectors remain promise-free after arrangement creation", () => {
    const r = useStoreHook();
    addRental(r, "rnt_promise_free", 500);
    const before = getOutstandingForRange(r.current.transactions);
    act(() => {
      r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_promise_free",
        arrangementAmount: 500,
        originalOutstandingAmount: 500,
        startDate: "2026-08-20",
        termsSummary: "1 x $500",
        installments: [{ amount: 500, due_date: "2026-08-20" }],
      });
    });
    const after = getOutstandingForRange(r.current.transactions);
    expect(after).toBe(before);
  });

  it("new charge after arrangement does not auto-expand arrangement amount", () => {
    const r = useStoreHook();
    addRental(r, "rnt_no_expand", 600);
    let arrangementId = "";
    act(() => {
      const res = r.current.createPaymentArrangement({
        customerId: "cus_3",
        rentalId: "rnt_no_expand",
        arrangementAmount: 200,
        originalOutstandingAmount: 200,
        startDate: "2026-08-20",
        termsSummary: "1 x $200",
        installments: [{ amount: 200, due_date: "2026-08-20" }],
      });
      arrangementId = res.arrangementId!;
    });
    act(() => {
      r.current.postCharge("rnt_no_expand", {
        type: "cleaning_fee",
        amount: 350,
      });
    });
    const a = r.current.paymentArrangements.find((x) => x.id === arrangementId);
    expect(a!.arrangement_amount).toBe(200);
    // Additional balance outside arrangement is distinct.
    const outstanding = r.current.rentalFinancials("rnt_no_expand").balance;
    const rec = reconcileArrangement(
      a!,
      r.current.installmentsForArrangement(arrangementId),
      r.current.transactions,
      outstanding,
    );
    expect(rec.additionalOutsideArrangement).toBeGreaterThan(0);
  });
});
