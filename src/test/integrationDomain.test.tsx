// Connect Pro Fleet — Build #21 sync integration tests (part 1).
// External-id registry, outbound events, inbound payment idempotency, loop
// prevention. Uses the real StoreProvider + IntegrationProvider. addRental
// happens in its own act() so the store flushes before charge/payment actions.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore, TENANT_ID } from "@/lib/store";
import { IntegrationProvider, useIntegration } from "@/lib/integrationStore";
import type { ReactNode } from "react";
import type { RentalAgreement } from "@/lib/types";

export function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <IntegrationProvider>{children}</IntegrationProvider>
    </StoreProvider>
  );
}

export function useHooks() {
  return renderHook(() => ({ store: useStore(), integ: useIntegration() }), {
    wrapper,
  }).result;
}

export function makeRental(id: string, balance = 400): RentalAgreement {
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
    subtotal: 400,
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
    late_fee: 0,
    late_fee_applied: false,
    next_payment_due: null,
    billing_config: null,
    pricing_snapshot: null,
    created_by: "stf_1",
    created_at: "2026-08-20T09:00:00Z",
    updated_at: "2026-08-20T09:00:00Z",
  } as RentalAgreement;
}

/** Add a rental in its own act so the store flushes. */
export function addRentalAct(
  r: ReturnType<typeof useHooks>,
  id: string,
  balance = 400,
  overrides: Partial<RentalAgreement> = {},
) {
  r.current.store.addRental({ ...makeRental(id, balance), ...overrides });
}

/** Enable integration + post a matching charge so the rental has a real ledger
 *  obligation. Call in a SEPARATE act after addRentalAct. */
export function chargeAndEnable(
  r: ReturnType<typeof useHooks>,
  id: string,
  balance = 400,
) {
  r.current.integ.enableIntegration();
  r.current.store.postCharge(id, { type: "rental_charge", amount: balance });
}

describe("Build #21 — external id registry", () => {
  it("maps a Fleet customer to a Connect Pro customer", () => {
    const r = useHooks();
    act(() => {
      r.current.integ.enableIntegration();
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "customer",
        internal_id: "cus_3",
        external_id: "cp_cus_3",
      });
    });
    expect(
      r.current.integ.resolveInternalId({
        system: "connect_pro",
        entity_type: "customer",
        external_id: "cp_cus_3",
      }),
    ).toBe("cus_3");
    expect(
      r.current.integ.resolveExternalId({
        entity_type: "customer",
        internal_id: "cus_3",
      }),
    ).toBe("cp_cus_3");
  });

  it("blocks duplicate mapping within the same tenant+system+entity+external", () => {
    const r = useHooks();
    act(() => {
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r1",
        external_id: "cp_r1",
      });
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r2",
        external_id: "cp_r1",
      });
    });
    expect(
      r.current.integ.resolveInternalId({
        system: "connect_pro",
        entity_type: "rental",
        external_id: "cp_r1",
      }),
    ).toBe("r2");
    expect(
      r.current.integ.externalRefs.filter((x) => x.external_id === "cp_r1"),
    ).toHaveLength(1);
  });

  it("allows the same external id across different entity types", () => {
    const r = useHooks();
    act(() => {
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "customer",
        internal_id: "cus_3",
        external_id: "shared_id",
      });
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r1",
        external_id: "shared_id",
      });
    });
    expect(
      r.current.integ.externalRefs.filter((x) => x.external_id === "shared_id"),
    ).toHaveLength(2);
  });
});

describe("Build #21 — outbound events", () => {
  it("emits PAYMENT_RECEIVED + BALANCE_CHANGED when a Fleet payment is posted", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_out_1", 400));
    act(() => chargeAndEnable(r, "r_out_1", 400));
    act(() => r.current.store.recordRentalPayment("r_out_1", 200, "zelle"));
    const events = r.current.integ.events;
    expect(events.some((e) => e.event_type === "payment.received")).toBe(true);
    expect(events.some((e) => e.event_type === "balance.changed")).toBe(true);
    const bal = events.find((e) => e.event_type === "balance.changed");
    expect(
      bal?.payload.kind === "balance_changed" && bal.payload.new_balance,
    ).toBe(200);
  });

  it("does not emit when integration is disabled", () => {
    const r = useHooks();
    act(() => r.current.store.addRental(makeRental("r_out_2", 400)));
    act(() =>
      r.current.store.postCharge("r_out_2", {
        type: "rental_charge",
        amount: 400,
      }),
    );
    act(() => r.current.store.recordRentalPayment("r_out_2", 200, "cash"));
    expect(r.current.integ.events.length).toBe(0);
  });

  it("emits LATE_FEE_APPLIED once when a late fee is applied", () => {
    const r = useHooks();
    act(() =>
      addRentalAct(r, "r_late", 400, {
        late_fee: 50,
        late_fee_applied: false,
        status: "late",
      }),
    );
    act(() => chargeAndEnable(r, "r_late", 400));
    act(() => r.current.store.applyLateFee("r_late"));
    expect(
      r.current.integ.events.filter((e) => e.event_type === "late_fee.applied"),
    ).toHaveLength(1);
  });

  it("emits RENTAL_STARTED on checkout", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_start", 0, { status: "ready_for_checkout" }));
    act(() => r.current.integ.enableIntegration());
    act(() =>
      r.current.store.startCheckout("r_start", {
        mileageOut: 100,
        fuelOut: 100,
        signed: true,
      }),
    );
    expect(
      r.current.integ.events.some((e) => e.event_type === "rental.started"),
    ).toBe(true);
  });
});

describe("Build #21 — inbound payment idempotency", () => {
  it("posts a Connect Pro manual payment once via the authoritative ledger", () => {
    const r = useHooks();
    let ack: any;
    act(() => addRentalAct(r, "r_in_1", 400));
    act(() => {
      chargeAndEnable(r, "r_in_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_in_1",
        external_id: "cp_r_in_1",
      });
    });
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_1",
        external_payment_id: "pay_1",
        rental_external_id: "cp_r_in_1",
        amount: 400,
        tender_method: "zelle",
        processor: "manual",
        payment_source: "connect_pro",
      });
    });
    expect(ack.status).toBe("accepted");
    expect(r.current.store.rentalFinancials("r_in_1").balance).toBe(0);
    const inbound = r.current.integ.events.filter(
      (e) => e.direction === "inbound",
    );
    expect(inbound).toHaveLength(1);
  });

  it("duplicate webhook posts the payment only once", () => {
    const r = useHooks();
    let ack2: any;
    act(() => addRentalAct(r, "r_in_2", 400));
    act(() => {
      chargeAndEnable(r, "r_in_2", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_in_2",
        external_id: "cp_r_in_2",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_2",
        external_payment_id: "pay_2",
        rental_external_id: "cp_r_in_2",
        amount: 400,
        tender_method: "zelle",
      });
      ack2 = r.current.integ.processInboundPayment({
        external_event_id: "evt_2",
        external_payment_id: "pay_2",
        rental_external_id: "cp_r_in_2",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack2.status).toBe("duplicate");
    expect(r.current.store.rentalFinancials("r_in_2").balance).toBe(0);
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.rental_id === "r_in_2" &&
        t.category === "payment" &&
        t.status === "posted",
    );
    expect(payments).toHaveLength(1);
  });

  it("two legitimate same-day payments with different ids both post", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_in_3", 800));
    act(() => {
      chargeAndEnable(r, "r_in_3", 800);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_in_3",
        external_id: "cp_r_in_3",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_3a",
        external_payment_id: "pay_3a",
        rental_external_id: "cp_r_in_3",
        amount: 400,
        tender_method: "cash",
      });
      r.current.integ.processInboundPayment({
        external_event_id: "evt_3b",
        external_payment_id: "pay_3b",
        rental_external_id: "cp_r_in_3",
        amount: 400,
        tender_method: "cash",
      });
    });
    expect(r.current.store.rentalFinancials("r_in_3").balance).toBe(0);
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.rental_id === "r_in_3" &&
        t.category === "payment" &&
        t.status === "posted",
    );
    expect(payments).toHaveLength(2);
  });

  it("loop prevention: Fleet-origin payment echo does not duplicate", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_loop", 400));
    act(() => chargeAndEnable(r, "r_loop", 400));
    act(() => r.current.store.recordRentalPayment("r_loop", 400, "zelle"));
    const before = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_loop" && t.category === "payment",
    ).length;
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "echo_evt",
        external_payment_id: "echo_pay",
        rental_external_id: null,
        amount: 400,
        tender_method: "zelle",
        payment_source: "connect_pro",
      });
    });
    const after = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_loop" && t.category === "payment",
    ).length;
    expect(after).toBe(before);
    expect(r.current.integ.openReviews().length).toBeGreaterThan(0);
  });
});
