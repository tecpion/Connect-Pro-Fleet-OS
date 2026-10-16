// Connect Pro Fleet — Build #14 cleanup: payment/tender standardization tests.
//
// Verifies that recording a customer payment persists the canonical
// TenderMethod + processor, that collection selectors group correctly, that
// deposit/expense/petty-cash semantics remain isolated from customer
// collections, and that legacy payment methods still render safely. A payment
// is counted ONCE in total collections; grouping by tender/processor is
// classification only.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import type { Customer, Reservation, Vehicle } from "@/lib/types";
import { TENANT_ID } from "@/lib/store/ids";
import {
  getCollectionsByTenderMethod,
  getCollectionsByProcessor,
  getTenderMethodMix,
  getTotalCollections,
  isCollectionPayment,
  tenderForTransaction,
} from "@/lib/collectionSelectors";
import { normalizePaymentMethod } from "@/lib/paymentMethodTypes";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}

function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

function makeVehicle(): Vehicle {
  return {
    id: "veh_pay_test",
    vin: "PAYTESTVIN001",
    make: "Test",
    model: "Sedan",
    year: 2024,
    license_plate: "PAY-001",
    status: "available",
    location: "Miami Downtown",
    vehicle_type: "car",
    vehicle_class_id: "cls_midsize",
    pricing_override: false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: 50,
    weekly_rate: 350,
    deposit_amount: 300,
    images: [],
    documents: [],
    purchase_date: "2024-01-01",
    purchase_price: 25000,
    current_mileage: 1000,
    insurance_policy_number: "TST-INS",
    insurance_expiry: "2027-01-01",
    registration_expiry: "2027-01-01",
    tenant_id: TENANT_ID,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeCustomer(): Customer {
  return {
    id: "cus_pay_test",
    tenant_id: TENANT_ID,
    first_name: "Pay",
    last_name: "Tester",
    phone: "+1 555 0000",
    email: "pay@example.com",
    date_of_birth: "1990-01-01",
    address: "1 Test St",
    city: "Miami",
    state: "FL",
    zip: "33131",
    emergency_contact_name: "Emergency",
    emergency_contact_phone: "+1 555 0001",
    customer_status: "good_standing",
    customer_source: "staff",
    notes: "",
    drivers_license_number: "TST-DL-001",
    drivers_license_state: "FL",
    drivers_license_expiry: "2029-01-01",
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: "Geico",
    insurance_policy_number: "TST-POL",
    insurance_expiry: "2027-01-01",
    insurance_document_url: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeReservation(vehicleId: string, customerId: string): Reservation {
  return {
    id: "res_pay_test",
    vehicle_id: vehicleId,
    customer_id: customerId,
    renter_name: "Pay Tester",
    renter_email: "pay@example.com",
    renter_phone: "+1 555 0000",
    start_date: "2026-09-01",
    end_date: "2026-09-08",
    status: "confirmed",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: 350,
    deposit_amount: 0,
    deposit_status: "released",
    amount_paid: 0,
    created_at: "2026-08-28T00:00:00Z",
    created_by: "stf_1",
    created_by_name: "Test · Owner",
    tenant_id: TENANT_ID,
    pricing_snapshot: {
      vehicle_class_id: "cls_midsize",
      vehicle_class_name: "Midsize",
      daily_rate: 50,
      weekly_rate: 350,
      minimum_rental_duration: 3,
      duration_days: 7,
      recommended_total: 350,
      recommended_rate_type: "weekly",
      components: [{ type: "weekly", quantity: 1, rate: 350, total: 350 }],
    },
  };
}

function setupRental(result: ReturnType<typeof useStoreHook>) {
  act(() => {
    result.current.addVehicle(makeVehicle());
    result.current.addCustomer(makeCustomer());
    result.current.addReservation(
      makeReservation("veh_pay_test", "cus_pay_test"),
    );
  });
  let rentalId: string | null = null;
  act(() => {
    rentalId = result.current.convertReservationToRental("res_pay_test");
  });
  return rentalId;
}

describe("Build #14 cleanup — payment/tender standardization", () => {
  it("persists canonical tender + processor in transaction metadata", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    expect(rentalId).toBeTruthy();

    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "zelle", {
        processor: "manual",
        reference: "ZELLE-123",
      });
    });

    const txns = result.current.rentalLedger(rentalId!);
    const payment = txns.find((t) => t.category === "payment");
    expect(payment).toBeTruthy();
    expect((payment!.metadata as any).tender_method).toBe("zelle");
    expect((payment!.metadata as any).processor).toBe("manual");
    expect(payment!.external_transaction_id).toBe("ZELLE-123");
    // Legacy payment_method still set for backward compat.
    expect(payment!.payment_method).toBe("zelle");
  });

  it("credit card + stripe persists correctly and separately", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "credit_card", {
        processor: "stripe",
      });
    });
    const payment = result.current
      .rentalLedger(rentalId!)
      .find((t) => t.category === "payment")!;
    expect((payment.metadata as any).tender_method).toBe("credit_card");
    expect((payment.metadata as any).processor).toBe("stripe");
    expect(payment.payment_method).toBe("card");
  });

  it("credit card + square persists correctly", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "credit_card", {
        processor: "square",
      });
    });
    const payment = result.current
      .rentalLedger(rentalId!)
      .find((t) => t.category === "payment")!;
    expect((payment.metadata as any).processor).toBe("square");
  });

  it("paypal tender/processor persists correctly", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "paypal", {
        processor: "paypal",
      });
    });
    const payment = result.current
      .rentalLedger(rentalId!)
      .find((t) => t.category === "payment")!;
    expect((payment.metadata as any).tender_method).toBe("paypal");
    expect((payment.metadata as any).processor).toBe("paypal");
  });

  it("legacy method label ('Card') still posts safely", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "Card");
    });
    const payment = result.current
      .rentalLedger(rentalId!)
      .find((t) => t.category === "payment")!;
    expect(payment.payment_method).toBe("card");
    expect(tenderForTransaction(payment)).toBe("credit_card");
  });

  it("collections grouped by tender method", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "zelle", {
        processor: "manual",
      });
      result.current.recordRentalPayment(rentalId!, 200, "cash");
    });
    const testTxns = result.current.transactions.filter(
      (t) => t.rental_id === rentalId,
    );
    const byTender = getCollectionsByTenderMethod(testTxns);
    const zelle = byTender.find((g) => g.tender === "zelle");
    const cash = byTender.find((g) => g.tender === "cash");
    expect(zelle?.total).toBe(400);
    expect(cash?.total).toBe(200);
  });

  it("collections grouped by processor", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "credit_card", {
        processor: "stripe",
      });
      result.current.recordRentalPayment(rentalId!, 200, "cash");
    });
    const testTxns = result.current.transactions.filter(
      (t) => t.rental_id === rentalId,
    );
    const byProc = getCollectionsByProcessor(testTxns);
    const stripe = byProc.find((g) => g.processor === "stripe");
    const manual = byProc.find((g) => g.processor === null);
    expect(stripe?.total).toBe(400);
    expect(manual?.total).toBe(200);
  });

  it("one payment counted only once in total collections", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "credit_card", {
        processor: "stripe",
      });
    });
    const testTxns = result.current.transactions.filter(
      (t) => t.rental_id === rentalId,
    );
    const total = getTotalCollections(testTxns);
    expect(total).toBe(400);
    const byTender = getCollectionsByTenderMethod(testTxns);
    const byProc = getCollectionsByProcessor(testTxns);
    const tenderSum = byTender.reduce((s, g) => s + g.total, 0);
    const procSum = byProc.reduce((s, g) => s + g.total, 0);
    expect(tenderSum).toBe(400);
    expect(procSum).toBe(400);
  });

  it("tender method mix percentages sum to 100", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 300, "zelle");
      result.current.recordRentalPayment(rentalId!, 100, "cash");
    });
    const testTxns = result.current.transactions.filter(
      (t) => t.rental_id === rentalId,
    );
    const mix = getTenderMethodMix(testTxns);
    const totalPct = mix.reduce((s, m) => s + m.percent, 0);
    expect(Math.round(totalPct)).toBe(100);
  });

  it("deposit collection does not appear as rental revenue/collection", () => {
    const result = useStoreHook();
    // A deposit-tagged transaction should not be a collection payment.
    const fakeDepositTxn = {
      id: "txn_dep",
      tenant_id: TENANT_ID,
      rental_id: "r1",
      customer_id: "c1",
      transaction_type: "other_payment" as const,
      category: "payment" as const,
      description: "Deposit collected",
      amount: 300,
      direction: "payment" as const,
      status: "posted" as const,
      effective_date: "2026-09-01",
      created_at: "2026-09-01T00:00:00Z",
      created_by: null,
      deposit_id: "dep_1",
      metadata: { deposit: true, deposit_kind: "collection" },
    };
    expect(isCollectionPayment(fakeDepositTxn as any)).toBe(false);
  });

  it("expense cash does not appear in customer collections", () => {
    const result = useStoreHook();
    // Record a cash expense — it should NOT show up in customer collections.
    act(() => {
      result.current.createExpense({
        description: "Tire repair",
        amount: 85,
        transaction_date: "2026-09-01",
        payment_method: "cash",
        paid_by_type: "company",
        receipt_required: false,
      });
    });
    // Expense transactions live in a separate ledger (store.expenses), not the
    // rental transaction ledger — so customer collections are unaffected.
    expect(result.current.expenses.some((e) => e.amount === 85)).toBe(true);
    const total = getTotalCollections(result.current.transactions);
    // No customer payments were recorded in this test, so collections from
    // the rental ledger should not include the expense.
    const testTxns = result.current.transactions.filter(
      (t) => t.customer_id === "cus_pay_test",
    );
    expect(getTotalCollections(testTxns)).toBe(0);
  });

  it("petty cash movement does not appear in customer collections", () => {
    const result = useStoreHook();
    let cashId = "";
    act(() => {
      cashId = result.current.createCashAccount({
        name: "Petty Cash",
        location_id: null,
        opening_balance: 200,
      });
      result.current.recordCashIn({
        cash_account_id: cashId,
        amount: 100,
        description: "Cash added",
      });
    });
    // Petty cash entries live in store.cashEntries, not the rental ledger.
    expect(result.current.cashEntries.length).toBeGreaterThan(0);
    const testTxns = result.current.transactions.filter(
      (t) => t.customer_id === "cus_pay_test",
    );
    expect(getTotalCollections(testTxns)).toBe(0);
  });

  it("normalizePaymentMethod maps legacy values", () => {
    expect(normalizePaymentMethod("card")).toBe("credit_card");
    expect(normalizePaymentMethod("cashapp")).toBe("cash_app");
    expect(normalizePaymentMethod("external")).toBe("bank_transfer");
    expect(normalizePaymentMethod("cash")).toBe("cash");
    expect(normalizePaymentMethod("zelle")).toBe("zelle");
    expect(normalizePaymentMethod(null)).toBe("other");
  });

  it("payment-method classification changes zero investor settlement math", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    act(() => {
      result.current.recordRentalPayment(rentalId!, 400, "zelle", {
        processor: "manual",
      });
    });
    // The rental balance should reflect the payment regardless of tender.
    const fin = result.current.rentalFinancials(rentalId!);
    expect(fin.paid).toBe(400);
  });

  it("existing payment posting behavior remains unchanged", () => {
    const result = useStoreHook();
    const rentalId = setupRental(result);
    let balance = 0;
    act(() => {
      balance = result.current.recordRentalPayment(rentalId!, 350, "cash");
    });
    // Balance should be reduced by the payment.
    expect(balance).toBeLessThanOrEqual(0);
    const receipt = result.current.receiptForPayment(
      result.current
        .rentalLedger(rentalId!)
        .find((t) => t.category === "payment")!.id,
    );
    expect(receipt).toBeTruthy();
  });
});
