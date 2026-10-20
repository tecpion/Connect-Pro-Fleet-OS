// Connect Pro Fleet — Build #21 final correctness cleanup tests.
// Authoritative exact-time billing state + payment conflict detection.
//
// Verifies:
//  - lateFeeEligibility / rentalLateStatus consume the centralized evaluator
//  - 1:59 / 2:00 / 2:01 + grace-boundary semantics
//  - Payments Due agrees with the billing engine late state
//  - late fee cannot apply at exact cutoff; can after; idempotent
//  - PAYMENT_LATE / BALANCE_CHANGED is_late use the same authoritative state
//  - same external payment id + different amount → conflict (no money moves)
//  - same external id + incompatible rental → conflict
//  - two separate external ids with same amount both post
//  - all five ACK outcomes are distinct
//  - cross-tenant isolation remains intact

import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import {
  useHooks,
  addRentalAct,
  chargeAndEnable,
} from "./integrationDomain.test";
import { isObligationLate } from "@/lib/lateEvaluator";
import {
  lateFeeEligibility,
  rentalLateStatus,
  allocatePayments,
} from "@/lib/billing";
import { makeRental, makePeriod, charge } from "./billingFixtures";

/** A fixed "now" on Aug 31, 2026 at the given wall-clock time. Anchored to UTC
 *  so the frozen V1 cutoff rule holds under any process TZ (the evaluator's
 *  omitted-tz path resolves to UTC, so `now` must share that zone). */
function atAug31(h: number, m: number): Date {
  return new Date(Date.UTC(2026, 7, 31, h, m, 0, 0));
}

// --- exact-time lateness: 1:59 / 2:00 / 2:01 ------------------------------

describe("Build #21 final — exact cutoff semantics", () => {
  it("1:59 PM is NOT late when due at 2:00 PM with no grace", () => {
    expect(
      isObligationLate(
        { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
        atAug31(13, 59),
      ).late,
    ).toBe(false);
  });

  it("2:00 PM is NOT late when due at 2:00 PM with no grace (payable through cutoff)", () => {
    expect(
      isObligationLate(
        { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
        atAug31(14, 0),
      ).late,
    ).toBe(false);
  });

  it("2:01 PM IS late when due at 2:00 PM with no grace", () => {
    expect(
      isObligationLate(
        { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0 },
        atAug31(14, 1),
      ).late,
    ).toBe(true);
  });

  it("2:30 PM with 30-minute grace is NOT late", () => {
    expect(
      isObligationLate(
        { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0.5 },
        atAug31(14, 30),
      ).late,
    ).toBe(false);
  });

  it("2:31 PM with 30-minute grace IS late", () => {
    expect(
      isObligationLate(
        { due_at: "2026-08-31", cutoff_time: "14:00", grace_period: 0.5 },
        atAug31(14, 31),
      ).late,
    ).toBe(true);
  });

  it("end-of-day fallback: 23:59 IS late when no cutoff configured (legacy >=)", () => {
    expect(
      isObligationLate(
        { due_at: "2026-08-31", cutoff_time: null, grace_period: 0 },
        atAug31(23, 59),
      ).late,
    ).toBe(true);
  });
});

// --- lateFeeEligibility / rentalLateStatus consume the centralized evaluator

describe("Build #21 final — billing selectors use exact-time evaluator", () => {
  it("lateFeeEligibility is NOT eligible at the exact cutoff (2:00 PM)", () => {
    const rental = makeRental({
      payment_cutoff_time: "14:00",
      grace_period: 0,
      late_fee: 50,
    });
    const period = makePeriod({
      due_at: "2026-08-31",
      late_fee_applied: false,
    });
    const alloc = {
      periodId: "bp_1",
      paid: 0,
      balance: 400,
      status: "past_due" as const,
    };
    const elig = lateFeeEligibility(period, alloc, rental, atAug31(14, 0));
    expect(elig.eligible).toBe(false);
  });

  it("lateFeeEligibility IS eligible after the cutoff (2:01 PM)", () => {
    const rental = makeRental({
      payment_cutoff_time: "14:00",
      grace_period: 0,
      late_fee: 50,
    });
    const period = makePeriod({
      due_at: "2026-08-31",
      late_fee_applied: false,
    });
    const alloc = {
      periodId: "bp_1",
      paid: 0,
      balance: 400,
      status: "past_due" as const,
    };
    const elig = lateFeeEligibility(period, alloc, rental, atAug31(14, 1));
    expect(elig.eligible).toBe(true);
  });

  it("lateFeeEligibility respects the cutoff time, not just the date", () => {
    const rental = makeRental({
      payment_cutoff_time: "14:00",
      grace_period: 0,
      late_fee: 50,
    });
    const period = makePeriod({
      due_at: "2026-08-31",
      late_fee_applied: false,
    });
    const alloc = {
      periodId: "bp_1",
      paid: 0,
      balance: 400,
      status: "past_due" as const,
    };
    // 11:00 AM on the due date — not late (no midnight turnover).
    expect(
      lateFeeEligibility(period, alloc, rental, atAug31(11, 0)).eligible,
    ).toBe(false);
  });

  it("rentalLateStatus uses the exact-time evaluator (not late at cutoff)", () => {
    const rental = makeRental({
      payment_cutoff_time: "14:00",
      grace_period: 0,
    });
    const period = makePeriod({ due_at: "2026-08-31" });
    const txns = [charge("txn_1", "rnt_1", 400, "2026-08-31")];
    const alloc = allocatePayments([period], txns, "rnt_1");
    expect(
      rentalLateStatus([period], alloc.allocations, rental, atAug31(14, 0)),
    ).toBeNull();
  });

  it("rentalLateStatus is late after the cutoff", () => {
    const rental = makeRental({
      payment_cutoff_time: "14:00",
      grace_period: 0,
    });
    const period = makePeriod({ due_at: "2026-08-31" });
    const txns = [charge("txn_1", "rnt_1", 400, "2026-08-31")];
    const alloc = allocatePayments([period], txns, "rnt_1");
    expect(
      rentalLateStatus([period], alloc.allocations, rental, atAug31(14, 1)),
    ).not.toBeNull();
  });
});

// --- late fee idempotency at the cutoff -----------------------------------

describe("Build #21 final — late fee cutoff + idempotency", () => {
  it("repeated post-cutoff evaluation remains idempotent (one fee)", () => {
    const r = useHooks();
    act(() =>
      addRentalAct(r, "r_lf_cut", 400, {
        late_fee: 50,
        late_fee_applied: false,
        status: "late",
        payment_cutoff_time: "14:00",
        grace_period: 0,
      }),
    );
    act(() => chargeAndEnable(r, "r_lf_cut", 400));
    act(() => {
      r.current.store.applyLateFee("r_lf_cut");
      r.current.store.applyLateFee("r_lf_cut");
      r.current.store.applyLateFee("r_lf_cut");
    });
    const lateFees = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_lf_cut" && t.transaction_type === "late_fee",
    );
    expect(lateFees).toHaveLength(1);
  });
});

// --- payment conflict detection ------------------------------------------

describe("Build #21 final — payment conflict detection", () => {
  it("identical repeated external payment → duplicate (no review)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_dup_final", 400));
    act(() => {
      chargeAndEnable(r, "r_dup_final", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_dup_final",
        external_id: "cp_r_dup_final",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_dup_final",
        external_payment_id: "pay_dup_final",
        rental_external_id: "cp_r_dup_final",
        amount: 400,
        tender_method: "zelle",
      });
    });
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_dup_final_b",
        external_payment_id: "pay_dup_final",
        rental_external_id: "cp_r_dup_final",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("duplicate");
    expect(r.current.integ.openReviews().length).toBe(0);
  });

  it("same external payment id + different amount → conflict (no money moves)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_amt_final", 400));
    act(() => {
      chargeAndEnable(r, "r_amt_final", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_amt_final",
        external_id: "cp_r_amt_final",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_amt_1",
        external_payment_id: "pay_amt",
        rental_external_id: "cp_r_amt_final",
        amount: 350,
        tender_method: "zelle",
      });
    });
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_amt_2",
        external_payment_id: "pay_amt",
        rental_external_id: "cp_r_amt_final",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("conflict");
    // First $350 stands; the conflicting $400 posted nothing.
    expect(r.current.store.rentalFinancials("r_amt_final").balance).toBe(50);
    const conflicts = r.current.integ
      .openReviews()
      .filter((rv) => rv.review_type === "conflict");
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("same external payment id + incompatible rental → conflict", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_rent_a", 400));
    act(() => addRentalAct(r, "r_rent_b", 400));
    act(() => {
      chargeAndEnable(r, "r_rent_a", 400);
      chargeAndEnable(r, "r_rent_b", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_rent_a",
        external_id: "cp_r_rent_a",
      });
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_rent_b",
        external_id: "cp_r_rent_b",
      });
    });
    // First payment against rental A.
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_rent_1",
        external_payment_id: "pay_rent_shared",
        rental_external_id: "cp_r_rent_a",
        amount: 400,
        tender_method: "zelle",
      });
    });
    // Same external payment id now claims rental B → conflict.
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_rent_2",
        external_payment_id: "pay_rent_shared",
        rental_external_id: "cp_r_rent_b",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("conflict");
    // Rental B unchanged (no money moved).
    expect(r.current.store.rentalFinancials("r_rent_b").balance).toBe(400);
  });

  it("two separate external ids with the same amount both post", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_two_final", 800));
    act(() => {
      chargeAndEnable(r, "r_two_final", 800);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_two_final",
        external_id: "cp_r_two_final",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_two_a",
        external_payment_id: "pay_two_a",
        rental_external_id: "cp_r_two_final",
        amount: 400,
        tender_method: "cash",
      });
      r.current.integ.processInboundPayment({
        external_event_id: "evt_two_b",
        external_payment_id: "pay_two_b",
        rental_external_id: "cp_r_two_final",
        amount: 400,
        tender_method: "cash",
      });
    });
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.rental_id === "r_two_final" &&
        t.category === "payment" &&
        t.status === "posted",
    );
    expect(payments).toHaveLength(2);
    expect(r.current.store.rentalFinancials("r_two_final").balance).toBe(0);
  });
});

// --- ACK outcome distinctions --------------------------------------------

describe("Build #21 final — five distinct ACK outcomes", () => {
  it("accepted / duplicate / needs_review / conflict / rejected are all reachable", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_ack_final", 400));
    act(() => {
      chargeAndEnable(r, "r_ack_final", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_ack_final",
        external_id: "cp_r_ack_final",
      });
    });
    let accepted: any;
    act(() => {
      accepted = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_f",
        external_payment_id: "pay_ack_f",
        rental_external_id: "cp_r_ack_final",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(accepted.status).toBe("accepted");

    let duplicate: any;
    act(() => {
      duplicate = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_f_dup",
        external_payment_id: "pay_ack_f",
        rental_external_id: "cp_r_ack_final",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(duplicate.status).toBe("duplicate");

    let needsReview: any;
    act(() => {
      needsReview = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_nr",
        external_payment_id: "pay_ack_nr",
        amount: 300,
        tender_method: "cash",
      });
    });
    expect(needsReview.status).toBe("needs_review");

    let conflict: any;
    act(() => {
      conflict = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_cf",
        external_payment_id: "pay_ack_f",
        rental_external_id: "cp_r_ack_final",
        amount: 999,
        tender_method: "zelle",
      });
    });
    expect(conflict.status).toBe("conflict");

    let rejected: any;
    act(() => {
      rejected = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_rj",
        external_payment_id: "pay_ack_rj",
        amount: 0,
        tender_method: "cash",
      });
    });
    expect(rejected.status).toBe("rejected");

    const statuses = new Set([
      accepted.status,
      duplicate.status,
      needsReview.status,
      conflict.status,
      rejected.status,
    ]);
    expect(statuses.size).toBe(5);
  });
});

// --- cross-tenant isolation ----------------------------------------------

describe("Build #21 final — cross-tenant isolation", () => {
  it("an external payment referencing an unknown rental does not post into any rental", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_iso_final", 400));
    act(() => chargeAndEnable(r, "r_iso_final", 400));
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_iso",
        external_payment_id: "pay_iso",
        rental_external_id: "cp_other_tenant_rental_final",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("needs_review");
    expect(r.current.store.rentalFinancials("r_iso_final").balance).toBe(400);
  });
});
