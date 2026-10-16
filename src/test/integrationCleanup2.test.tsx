// Connect Pro Fleet — Build #21 final cleanup tests (part 2).
// Review resolution + ACK outcomes, cross-tenant safety, conflict handling,
// delivery failure, rapid-action / stale-state idempotency.

import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import {
  useHooks,
  addRentalAct,
  chargeAndEnable,
} from "./integrationDomain.test";

// --- review resolution + ACK outcomes ------------------------------------

describe("Build #21 cleanup — review resolution + ACK outcomes", () => {
  it("ignore resolution does not require a money-post action (posts nothing)", () => {
    const r = useHooks();
    act(() => r.current.integ.enableIntegration());
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_ig_1",
        external_payment_id: "pay_ig_1",
        amount: 300,
        tender_method: "cash",
      });
    });
    const review = r.current.integ.openReviews()[0];
    act(() => r.current.integ.ignoreReview(review.id, "not ours"));
    expect(r.current.integ.openReviews().length).toBe(0);
    const newPayments = r.current.store.transactions.filter(
      (t) =>
        t.category === "payment" &&
        (t.metadata as { payment_source?: string } | null)?.payment_source ===
          "connect_pro",
    );
    expect(newPayments.length).toBe(0);
  });

  it("duplicate resolution returns ok ACK and posts nothing", () => {
    const r = useHooks();
    act(() => r.current.integ.enableIntegration());
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_dup_1",
        external_payment_id: "pay_dup_1",
        amount: 300,
        tender_method: "cash",
      });
    });
    const review = r.current.integ.openReviews()[0];
    let res: any;
    act(() => {
      res = r.current.integ.resolveReview(review.id, "duplicate", {});
    });
    expect(res.ok).toBe(true);
    expect(r.current.integ.openReviews().length).toBe(0);
  });

  it("accepted / duplicate / needs_review / rejected ACK outcomes exist", () => {
    const r = useHooks();
    // accepted
    act(() => addRentalAct(r, "r_ack_1", 400));
    act(() => {
      chargeAndEnable(r, "r_ack_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_ack_1",
        external_id: "cp_r_ack_1",
      });
    });
    let accepted: any;
    act(() => {
      accepted = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_1",
        external_payment_id: "pay_ack_1",
        rental_external_id: "cp_r_ack_1",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(accepted.status).toBe("accepted");

    // duplicate
    let dup: any;
    act(() => {
      dup = r.current.integ.processInboundPayment({
        external_event_id: "evt_ack_1",
        external_payment_id: "pay_ack_1",
        rental_external_id: "cp_r_ack_1",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(dup.status).toBe("duplicate");

    // needs_review (no customer/rental)
    let needsReview: any;
    act(() => {
      needsReview = r.current.integ.processInboundPayment({
        external_event_id: "evt_nr_1",
        external_payment_id: "pay_nr_1",
        amount: 300,
        tender_method: "cash",
      });
    });
    expect(needsReview.status).toBe("needs_review");

    // rejected (invalid amount)
    let rejected: any;
    act(() => {
      rejected = r.current.integ.processInboundPayment({
        external_event_id: "evt_rej_1",
        external_payment_id: "pay_rej_1",
        amount: 0,
        tender_method: "cash",
      });
    });
    expect(rejected.status).toBe("rejected");
  });
});

// --- cross-tenant + conflict safety -------------------------------------

describe("Build #21 cleanup — cross-tenant + conflict safety", () => {
  it("cross-tenant external payment cannot post into another tenant's rental", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_ct_1", 400));
    act(() => chargeAndEnable(r, "r_ct_1", 400));
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_ct_1",
        external_payment_id: "pay_ct_1",
        rental_external_id: "cp_other_tenant_rental",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("needs_review");
    expect(r.current.store.rentalFinancials("r_ct_1").balance).toBe(400);
  });

  it("same external payment id with a different amount is a CONFLICT (no money moves)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_cf_1", 400));
    act(() => {
      chargeAndEnable(r, "r_cf_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_cf_1",
        external_id: "cp_r_cf_1",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_cf_1",
        external_payment_id: "pay_cf_1",
        rental_external_id: "cp_r_cf_1",
        amount: 350,
        tender_method: "zelle",
      });
    });
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_cf_1b",
        external_payment_id: "pay_cf_1",
        rental_external_id: "cp_r_cf_1",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("conflict");
    // The first $350 payment stands; the conflicting $400 event posted nothing.
    expect(r.current.store.rentalFinancials("r_cf_1").balance).toBe(50);
    // A conflict review item was created.
    const conflicts = r.current.integ
      .openReviews()
      .filter((rv) => rv.review_type === "conflict");
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it("identical duplicate returns duplicate acknowledgment (no review needed)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_id_1", 400));
    act(() => {
      chargeAndEnable(r, "r_id_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_id_1",
        external_id: "cp_r_id_1",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_id_1",
        external_payment_id: "pay_id_1",
        rental_external_id: "cp_r_id_1",
        amount: 400,
        tender_method: "zelle",
      });
    });
    let ack: any;
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_id_1",
        external_payment_id: "pay_id_1",
        rental_external_id: "cp_r_id_1",
        amount: 400,
        tender_method: "zelle",
      });
    });
    expect(ack.status).toBe("duplicate");
    expect(r.current.integ.openReviews().length).toBe(0);
  });
});

// --- delivery failure + retry -------------------------------------------

describe("Build #21 cleanup — delivery failure safety", () => {
  it("delivery failure leaves the payment intact", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_df_1", 400));
    act(() => {
      chargeAndEnable(r, "r_df_1", 400);
      r.current.integ._transport.simulateFailure(100);
    });
    act(() => r.current.store.recordRentalPayment("r_df_1", 400, "zelle"));
    expect(r.current.store.rentalFinancials("r_df_1").balance).toBe(0);
    const failed = r.current.integ.events.filter((e) => e.status === "failed");
    expect(failed.length).toBeGreaterThan(0);
  });

  it("successful retry sends the same event identity (no duplicate event)", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_rt_1", 400));
    act(() => {
      chargeAndEnable(r, "r_rt_1", 400);
      r.current.integ._transport.simulateFailure(1);
    });
    act(() => r.current.store.recordRentalPayment("r_rt_1", 400, "zelle"));
    const failed = r.current.integ.events.find((e) => e.status === "failed");
    expect(failed).toBeTruthy();
    const keyBefore = failed!.event_key;
    act(() => r.current.integ.retryEvent(failed!.id));
    const retried = r.current.integ.events.find((e) => e.id === failed!.id);
    expect(retried?.status).toBe("succeeded");
    expect(retried!.event_key).toBe(keyBefore);
    const sameKey = r.current.integ.events.filter(
      (e) => e.event_key === keyBefore,
    );
    expect(sameKey).toHaveLength(1);
  });
});

// --- rapid-action / stale-state -----------------------------------------

describe("Build #21 cleanup — rapid-action / stale-state", () => {
  it("rapid duplicate inbound payment posts only one payment", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_rapid_1", 400));
    act(() => {
      chargeAndEnable(r, "r_rapid_1", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_rapid_1",
        external_id: "cp_r_rapid_1",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_rapid_1",
        external_payment_id: "pay_rapid_1",
        rental_external_id: "cp_r_rapid_1",
        amount: 400,
        tender_method: "zelle",
      });
      r.current.integ.processInboundPayment({
        external_event_id: "evt_rapid_1",
        external_payment_id: "pay_rapid_1",
        rental_external_id: "cp_r_rapid_1",
        amount: 400,
        tender_method: "zelle",
      });
      r.current.integ.processInboundPayment({
        external_event_id: "evt_rapid_1",
        external_payment_id: "pay_rapid_1",
        rental_external_id: "cp_r_rapid_1",
        amount: 400,
        tender_method: "zelle",
      });
    });
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.rental_id === "r_rapid_1" &&
        t.category === "payment" &&
        t.status === "posted",
    );
    expect(payments).toHaveLength(1);
  });

  it("rapid duplicate late-fee application creates one fee + one event", () => {
    const r = useHooks();
    act(() =>
      addRentalAct(r, "r_rapid_2", 400, {
        late_fee: 50,
        late_fee_applied: false,
        status: "late",
      }),
    );
    act(() => chargeAndEnable(r, "r_rapid_2", 400));
    act(() => {
      r.current.store.applyLateFee("r_rapid_2");
      r.current.store.applyLateFee("r_rapid_2");
      r.current.store.applyLateFee("r_rapid_2");
    });
    const lateFees = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_rapid_2" && t.transaction_type === "late_fee",
    );
    expect(lateFees).toHaveLength(1);
    const events = r.current.integ.events.filter(
      (e) => e.event_type === "late_fee.applied",
    );
    expect(events).toHaveLength(1);
  });
});
