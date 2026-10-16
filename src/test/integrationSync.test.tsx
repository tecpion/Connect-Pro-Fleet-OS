// Connect Pro Fleet — Build #21 sync integration tests (part 2).
// Review queue, delivery failure/retry/dead-letter, financial non-duplication,
// inbound reversal, partial/multi-period. Reuses the harness from part 1.

import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import {
  useHooks,
  addRentalAct,
  chargeAndEnable,
} from "./integrationDomain.test";

describe("Build #21 — review queue", () => {
  it("routes an unmatched payment (no customer/rental) to review", () => {
    const r = useHooks();
    let ack: any;
    act(() => r.current.integ.enableIntegration());
    act(() => {
      ack = r.current.integ.processInboundPayment({
        external_event_id: "evt_u",
        external_payment_id: "pay_u",
        amount: 300,
        tender_method: "cash",
      });
    });
    expect(ack.status).toBe("needs_review");
    expect(r.current.integ.openReviews().length).toBe(1);
    // No NEW payment posted for this event (seeded payments may exist).
    const newPayments = r.current.store.transactions.filter(
      (t) =>
        t.category === "payment" &&
        t.metadata &&
        (t.metadata as any).payment_source === "connect_pro",
    );
    expect(newPayments.length).toBe(0);
  });

  it("manual review resolution posts the payment once", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_rev", 400));
    act(() => chargeAndEnable(r, "r_rev", 400));
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_r",
        external_payment_id: "pay_r",
        amount: 400,
        tender_method: "cash",
      });
    });
    const review = r.current.integ.openReviews()[0];
    act(() =>
      r.current.integ.resolveReview(review.id, "matched", {
        rentalId: "r_rev",
      }),
    );
    expect(r.current.store.rentalFinancials("r_rev").balance).toBe(0);
    expect(r.current.integ.openReviews().length).toBe(0);
  });

  it("ignore resolution posts no payment", () => {
    const r = useHooks();
    act(() => r.current.integ.enableIntegration());
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_i",
        external_payment_id: "pay_i",
        amount: 300,
        tender_method: "cash",
      });
    });
    const review = r.current.integ.openReviews()[0];
    act(() => r.current.integ.ignoreReview(review.id, "Not our customer"));
    expect(r.current.integ.openReviews().length).toBe(0);
    const newPayments = r.current.store.transactions.filter(
      (t) =>
        t.category === "payment" &&
        t.metadata &&
        (t.metadata as any).payment_source === "connect_pro",
    );
    expect(newPayments.length).toBe(0);
  });
});

describe("Build #21 — delivery failure + retry", () => {
  it("transport failure marks the event failed without rolling back Fleet state", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_fail", 400));
    act(() => {
      chargeAndEnable(r, "r_fail", 400);
      r.current.integ._transport.simulateFailure(1);
    });
    act(() => r.current.store.recordRentalPayment("r_fail", 400, "zelle"));
    expect(r.current.store.rentalFinancials("r_fail").balance).toBe(0);
    const outbound = r.current.integ.events.filter(
      (e) => e.direction === "outbound",
    );
    expect(outbound.some((e) => e.status === "failed")).toBe(true);
  });

  it("retry can succeed a failed event", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_retry", 400));
    act(() => {
      chargeAndEnable(r, "r_retry", 400);
      r.current.integ._transport.simulateFailure(1);
    });
    act(() => r.current.store.recordRentalPayment("r_retry", 400, "zelle"));
    const failed = r.current.integ.events.find((e) => e.status === "failed");
    expect(failed).toBeTruthy();
    act(() => r.current.integ.retryEvent(failed!.id));
    const retried = r.current.integ.events.find((e) => e.id === failed!.id);
    expect(retried?.status).toBe("succeeded");
  });

  it("dead-letters after max attempts", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_dl", 400));
    act(() => {
      chargeAndEnable(r, "r_dl", 400);
      r.current.integ._transport.simulateFailure(100);
    });
    act(() => r.current.store.recordRentalPayment("r_dl", 400, "zelle"));
    // The initial enqueue marks events failed (attempt 1). Retry repeatedly
    // until they exceed MAX_ATTEMPTS and become dead_letter.
    const failed = r.current.integ.events.filter((e) => e.status === "failed");
    act(() => {
      for (const e of failed) {
        for (let i = 0; i < 6; i++) r.current.integ.retryEvent(e.id);
      }
    });
    const dead = r.current.integ.events.filter(
      (e) => e.status === "dead_letter",
    );
    expect(dead.length).toBeGreaterThan(0);
  });
});

describe("Build #21 — financial non-duplication", () => {
  it("inbound payment does not create revenue — it settles an obligation", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_rev2", 400));
    act(() => {
      chargeAndEnable(r, "r_rev2", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_rev2",
        external_id: "cp_r_rev2",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_r2",
        external_payment_id: "pay_r2",
        rental_external_id: "cp_r_rev2",
        amount: 400,
        tender_method: "zelle",
      });
    });
    const payments = r.current.store.transactions.filter(
      (t) => t.rental_id === "r_rev2" && t.category === "payment",
    );
    expect(payments).toHaveLength(1);
  });

  it("collections count the synced payment exactly once", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_coll", 400));
    act(() => {
      chargeAndEnable(r, "r_coll", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_coll",
        external_id: "cp_r_coll",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_c",
        external_payment_id: "pay_c",
        rental_external_id: "cp_r_coll",
        amount: 400,
        tender_method: "zelle",
      });
    });
    const payments = r.current.store.transactions.filter(
      (t) =>
        t.rental_id === "r_coll" &&
        t.category === "payment" &&
        t.status === "posted",
    );
    const totalPaid = payments.reduce((s, t) => s + t.amount, 0);
    expect(totalPaid).toBe(400);
  });
});

describe("Build #21 — inbound reversal", () => {
  it("reverses a mapped payment once and is idempotent", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_rev3", 400));
    act(() => {
      chargeAndEnable(r, "r_rev3", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_rev3",
        external_id: "cp_r_rev3",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_r3",
        external_payment_id: "pay_r3",
        rental_external_id: "cp_r_rev3",
        amount: 400,
        tender_method: "zelle",
      });
    });
    const paymentTxn = r.current.store.transactions.find(
      (t) => t.rental_id === "r_rev3" && t.category === "payment",
    );
    act(() => {
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "payment",
        internal_id: paymentTxn!.id,
        external_id: "pay_r3",
      });
    });
    let ack1: any;
    let ack2: any;
    act(() => {
      ack1 = r.current.integ.processInboundReversal({
        external_event_id: "rev_1",
        external_payment_id: "pay_r3",
        amount: 400,
        reason: "dispute",
      });
      ack2 = r.current.integ.processInboundReversal({
        external_event_id: "rev_1",
        external_payment_id: "pay_r3",
        amount: 400,
        reason: "dispute",
      });
    });
    expect(ack1.status).toBe("accepted");
    expect(ack2.status).toBe("duplicate");
    expect(r.current.store.rentalFinancials("r_rev3").balance).toBe(400);
  });

  it("unmapped reversal routes to review", () => {
    const r = useHooks();
    let ack: any;
    act(() => r.current.integ.enableIntegration());
    act(() => {
      ack = r.current.integ.processInboundReversal({
        external_event_id: "rev_u",
        external_payment_id: "pay_unknown",
        amount: 400,
      });
    });
    expect(ack.status).toBe("needs_review");
    expect(r.current.integ.openReviews().length).toBe(1);
  });
});

describe("Build #21 — partial + multi-period", () => {
  it("partial payment updates balance and emits paid-in-full=false", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_part", 400));
    act(() => {
      chargeAndEnable(r, "r_part", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_part",
        external_id: "cp_r_part",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_p",
        external_payment_id: "pay_p",
        rental_external_id: "cp_r_part",
        amount: 150,
        tender_method: "cash",
      });
    });
    expect(r.current.store.rentalFinancials("r_part").balance).toBe(250);
    const bal = r.current.integ.events.find(
      (e) => e.event_type === "balance.changed",
    );
    expect(
      bal?.payload.kind === "balance_changed" && bal.payload.is_paid_in_full,
    ).toBe(false);
  });

  it("full payment emits paid-in-full=true", () => {
    const r = useHooks();
    act(() => addRentalAct(r, "r_full", 400));
    act(() => {
      chargeAndEnable(r, "r_full", 400);
      r.current.integ.mapExternalId({
        system: "connect_pro",
        entity_type: "rental",
        internal_id: "r_full",
        external_id: "cp_r_full",
      });
    });
    act(() => {
      r.current.integ.processInboundPayment({
        external_event_id: "evt_f",
        external_payment_id: "pay_f",
        rental_external_id: "cp_r_full",
        amount: 400,
        tender_method: "cash",
      });
    });
    const bal = r.current.integ.events.find(
      (e) => e.event_type === "balance.changed",
    );
    expect(
      bal?.payload.kind === "balance_changed" && bal.payload.is_paid_in_full,
    ).toBe(true);
  });
});
