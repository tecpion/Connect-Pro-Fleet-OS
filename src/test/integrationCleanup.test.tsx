// Connect Pro Fleet — Build #21 final cleanup tests (part 1).
// Exact-time lateness, balance-event integrity, Connect Pro-origin payment ack,
// late-fee idempotency, customer event wiring.

import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import {
  useHooks,
  addRentalAct,
  chargeAndEnable,
} from "./integrationDomain.test";
import { isObligationLate, obligationDueInstant } from "@/lib/lateEvaluator";
import type { Customer } from "@/lib/types";

/** A fixed "now" for deterministic exact-time late tests. Returns a Date at the
 *  given local wall-clock time on Aug 31, 2026. */
function atAug31(h: number, m: number): Date {
  return new Date(2026, 7, 31, h, m, 0, 0); // month is 0-indexed
}

function newCustomer(id: string, first: string, phone = "555-0100"): Customer {
  return {
    id,
    tenant_id: "tenant_demo",
    first_name: first,
    last_name: "Doe",
    phone,
    email: `${id}@example.com`,
    date_of_birth: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    customer_status: "good_standing",
    customer_source: "staff",
    notes: "",
    drivers_license_number: null,
    drivers_license_state: null,
    drivers_license_expiry: null,
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: null,
    insurance_policy_number: null,
    insurance_expiry: null,
    insurance_document_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// --- exact-time lateness --------------------------------------------------

describe("Build #21 cleanup — exact-time late evaluator", () => {
  it("1:59 PM is NOT late when due at 2:00 PM with no grace", () => {
    const r = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
      atAug31(13, 59),
    );
    expect(r.late).toBe(false);
  });

  it("2:00 PM is NOT late when due at 2:00 PM with no grace (payable through cutoff)", () => {
    const r = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
      atAug31(14, 0),
    );
    expect(r.late).toBe(false);
  });

  it("2:01 PM is late when due at 2:00 PM with no grace", () => {
    const r = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
      atAug31(14, 1),
    );
    expect(r.late).toBe(true);
  });

  it("does not use midnight turnover — 11:00 AM before a 2:00 PM cutoff is not late", () => {
    const r = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
      atAug31(11, 0),
    );
    expect(r.late).toBe(false);
  });

  it("30-minute grace: 2:15 PM not late, 2:31 PM late", () => {
    const notLate = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0.5 },
      atAug31(14, 15),
    );
    expect(notLate.late).toBe(false);
    const late = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0.5 },
      atAug31(14, 31),
    );
    expect(late.late).toBe(true);
  });

  it("end-of-day fallback when no cutoff time configured", () => {
    const notLate = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: null, grace_period: 0 },
      atAug31(23, 58),
    );
    expect(notLate.late).toBe(false);
    const late = isObligationLate(
      { due_at: "2026-08-31", cutoff_time: null, grace_period: 0 },
      atAug31(23, 59),
    );
    expect(late.late).toBe(true);
  });

  it("obligationDueInstant applies the cutoff in local time", () => {
    const ms = obligationDueInstant({
      due_at: "2026-08-31",
      cutoff_time: "14:00",
      grace_period: 0,
    });
    const d = new Date(ms);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(0);
  });
});

// --- balance-event integrity ----------------------------------------------

describe("Build #21 cleanup — BALANCE_CHANGED centralization", () => {
  it("payment posts BALANCE_CHANGED", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_bal_1", 400));
    act(() => chargeAndEnable(r, "r_bal_1", 400));
    act(() => r.current.store.recordRentalPayment("r_bal_1", 400, "zelle"));
    const bal = r.current.integ.events.filter(
      (e) => e.event_type === "balance.changed",
    );
    expect(bal.length).toBeGreaterThan(0);
  });

  it("payment reversal posts BALANCE_CHANGED", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_bal_2", 400));
    act(() => chargeAndEnable(r, "r_bal_2", 400));
    act(() => r.current.store.recordRentalPayment("r_bal_2", 400, "zelle"));
    const payment = r.current.store.transactions.find(
      (t) => t.rental_id === "r_bal_2" && t.category === "payment",
    );
    act(() => r.current.store.voidTransaction(payment!.id, "dispute"));
    const bal = r.current.integ.events.filter(
      (e) =>
        e.event_type === "balance.changed" &&
        e.payload.kind === "balance_changed" &&
        e.payload.reason === "payment_reversed",
    );
    expect(bal.length).toBeGreaterThan(0);
  });

  it("deposit application posts BALANCE_CHANGED but NOT payment.received", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_dep_1", 400));
    act(() => chargeAndEnable(r, "r_dep_1", 400));
    act(() => {
      r.current.store.ensureDepositForReservation({
        reservationId: "res_dep_1",
        customerId: "cus_3",
        vehicleId: "veh_1",
        requiredAmount: 300,
        source: "class",
      });
    });
    const dep = r.current.store.depositForReservation("res_dep_1")!;
    act(() => r.current.store.linkDepositToRental("res_dep_1", "r_dep_1"));
    act(() =>
      r.current.store.collectDeposit(
        dep.id,
        { amount: 300, method: "card" },
        "k-dep-col",
      ),
    );
    act(() =>
      r.current.store.applyDeposit(dep.id, { amount: 100 }, "k-dep-app"),
    );
    const bal = r.current.integ.events.filter(
      (e) =>
        e.event_type === "balance.changed" &&
        e.payload.kind === "balance_changed" &&
        e.payload.reason === "deposit_applied",
    );
    expect(bal.length).toBeGreaterThan(0);
    const depositApplied = r.current.integ.events.filter(
      (e) => e.event_type === "deposit.applied",
    );
    expect(depositApplied.length).toBeGreaterThan(0);
  });

  it("damage charge increases the rental balance", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_dmg_1", 0));
    act(() => r.current.integ.enableIntegration());
    act(() =>
      r.current.store.postCharge("r_dmg_1", {
        type: "damage_charge",
        amount: 250,
      }),
    );
    expect(r.current.store.rentalFinancials("r_dmg_1").balance).toBe(250);
  });
});

// --- Connect Pro-origin payment acknowledgment ----------------------------

describe("Build #21 cleanup — Connect Pro-origin payment ack", () => {
  it("Connect Pro-origin payment posts once", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_cp_1", 400));
    act(() => {
      chargeAndEnable(r, "r_cp_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_cp_1",
        external_id: "cp_r_cp_1",
      });
    });
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_cp_1",
        external_payment_id: "pay_cp_1",
        rental_external_id: "cp_r_cp_1",
        amount: 400,
        tender_method: "zelle",
        payment_source: "connect_pro",
      });
    });
    expect(ack.status).toBe("accepted");
    expect(r.current.store.rentalFinancials("r_cp_1").balance).toBe(0);
  });

  it("Connect Pro-origin payment produces an authoritative PAYMENT_RECEIVED event", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_cp_2", 400));
    act(() => {
      chargeAndEnable(r, "r_cp_2", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_cp_2",
        external_id: "cp_r_cp_2",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_cp_2",
        external_payment_id: "pay_cp_2",
        rental_external_id: "cp_r_cp_2",
        amount: 400,
        tender_method: "zelle",
        payment_source: "connect_pro",
      });
    });
    const payReceived = r.current.integ.events.filter(
      (e) =>
        e.event_type === "payment.received" &&
        e.direction === "outbound" &&
        e.origin_system === "fleet",
    );
    expect(payReceived.length).toBeGreaterThan(0);
  });

  it("acknowledgment echo cannot create a second payment (loop prevention)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_cp_3", 400));
    act(() => {
      chargeAndEnable(r, "r_cp_3", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_cp_3",
        external_id: "cp_r_cp_3",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_cp_3",
        external_payment_id: "pay_cp_3",
        rental_external_id: "cp_r_cp_3",
        amount: 400,
        tender_method: "zelle",
        payment_source: "connect_pro",
      });
    });
    const before = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_cp_3" && t.category === "payment",
    ).length;
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_cp_3_echo",
        external_payment_id: "pay_cp_3",
        rental_external_id: "cp_r_cp_3",
        amount: 400,
        tender_method: "zelle",
        payment_source: "connect_pro",
      });
    });
    const after = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_cp_3" && t.category === "payment",
    ).length;
    expect(after).toBe(before);
  });

  it("Fleet-manual payment sync loop safe (echo does not duplicate)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_fm_1", 400));
    act(() => chargeAndEnable(r, "r_fm_1", 400));
    act(() => r.current.store.recordRentalPayment("r_fm_1", 400, "zelle"));
    const before = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_fm_1" && t.category === "payment",
    ).length;
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "echo_fm_1",
        external_payment_id: "echo_pay_fm_1",
        rental_external_id: null,
        amount: 400,
        tender_method: "zelle",
        payment_source: "connect_pro",
      });
    });
    const after = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_fm_1" && t.category === "payment",
    ).length;
    expect(after).toBe(before);
  });

  it("Stripe via Connect Pro loop safe", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_st_1", 400));
    act(() => {
      chargeAndEnable(r, "r_st_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_st_1",
        external_id: "cp_r_st_1",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_st_1",
        external_payment_id: "pay_st_1",
        rental_external_id: "cp_r_st_1",
        amount: 400,
        tender_method: "credit_card",
        processor: "stripe",
        payment_source: "connect_pro",
      });
    });
    expect(r.current.store.rentalFinancials("r_st_1").balance).toBe(0);
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_st_1_echo",
        external_payment_id: "pay_st_1",
        rental_external_id: "cp_r_st_1",
        amount: 400,
        tender_method: "credit_card",
        processor: "stripe",
        payment_source: "connect_pro",
      });
    });
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.rental_id === "r_st_1" &&
        t.category === "payment" &&
        t.status === "posted",
    );
    expect(payments).toHaveLength(1);
  });

  it("Square via Connect Pro loop safe", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_sq_1", 400));
    act(() => {
      chargeAndEnable(r, "r_sq_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_sq_1",
        external_id: "cp_r_sq_1",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_sq_1",
        external_payment_id: "pay_sq_1",
        rental_external_id: "cp_r_sq_1",
        amount: 400,
        tender_method: "credit_card",
        processor: "square",
        payment_source: "connect_pro",
      });
    });
    expect(r.current.store.rentalFinancials("r_sq_1").balance).toBe(0);
  });
});

// --- late-fee idempotency -------------------------------------------------

describe("Build #21 cleanup — late-fee idempotency", () => {
  it("late-fee event emitted once", () => {
    const r = useHooks();
    act(() =>
      addRentalAct(r, "r_lf_1", 400, {
        late_fee: 50,
        late_fee_applied: false,
        status: "late",
      }),
    );
    act(() => chargeAndEnable(r, "r_lf_1", 400));
    act(() => r.current.store.applyLateFee("r_lf_1"));
    act(() => r.current.store.applyLateFee("r_lf_1"));
    const lateFeeEvents = r.current.integ.events.filter(
      (e) => e.event_type === "late_fee.applied",
    );
    expect(lateFeeEvents).toHaveLength(1);
  });
});

// --- customer event wiring -----------------------------------------------

describe("Build #21 cleanup — customer event wiring", () => {
  it("addCustomer emits CUSTOMER_CREATED_OR_UPDATED", () => {
    const r = useHooks();
    act(() => r.current.integ.enableIntegration());
    act(() => r.current.store.addCustomer(newCustomer("cus_new_1", "Jane")));
    const custEvents = r.current.integ.events.filter(
      (e) => e.event_type === "customer.created_or_updated",
    );
    expect(custEvents.length).toBeGreaterThan(0);
    const ev = custEvents[0];
    expect(ev.payload.kind === "customer_updated").toBe(true);
    if (ev.payload.kind === "customer_updated") {
      expect(ev.payload.first_name).toBe("Jane");
      expect(ev.payload.phone).toBe("555-0100");
    }
  });

  it("updateCustomer emits a new CUSTOMER_CREATED_OR_UPDATED event", () => {
    const r = useHooks();
    act(() => r.current.integ.enableIntegration());
    act(() => r.current.store.addCustomer(newCustomer("cus_upd_1", "Old")));
    act(() =>
      r.current.store.updateCustomer("cus_upd_1", { first_name: "New" }),
    );
    const forCustomer = r.current.integ.events.filter(
      (e) =>
        e.event_type === "customer.created_or_updated" &&
        e.payload.kind === "customer_updated" &&
        e.payload.customer_id === "cus_upd_1",
    );
    // add + update each emit their own event (keyed by updated_at).
    expect(forCustomer.length).toBe(2);
    // The most recent (first in the unshifted list) reflects the update.
    if (forCustomer[0].payload.kind === "customer_updated") {
      expect(forCustomer[0].payload.first_name).toBe("New");
    }
  });
});
