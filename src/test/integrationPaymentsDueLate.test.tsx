// Connect Pro Fleet — extracted: Payments Due ↔ billing engine late-state
// agreement (Build #21 final correctness, split from integrationFinalCorrectness
// to keep each file under the line limit).
//
// Verifies a billing period that is NOT yet late in the authoritative billing
// engine is also NOT classified as 'late' by getPaymentObligations (Payments
// Due). Uses the centralized exact-time evaluator (cutoff + grace) so the two
// layers can never disagree.

import { describe, it, expect } from "vitest";
import { getPaymentObligations } from "@/lib/billingSelectors";
import { makeRental, makePeriod, charge } from "./billingFixtures";

/** A fixed "now" on Aug 31, 2026 at the given wall-clock time. Anchored to UTC
 *  so the frozen V1 cutoff rule holds under any process TZ (the evaluator's
 *  omitted-tz path resolves to UTC, so `now` must share that zone). */
function atAug31(h: number, m: number): Date {
  return new Date(Date.UTC(2026, 7, 31, h, m, 0, 0));
}

describe("Build #21 final — Payments Due agrees with billing late state", () => {
  it("a period not yet late in the billing engine is not 'late' in Payments Due", () => {
    const rental = makeRental({
      id: "rnt_pd",
      payment_cutoff_time: "14:00",
      grace_period: 0,
      customer_id: "cus_pd",
    });
    const period = makePeriod({
      id: "bp_pd",
      rental_id: "rnt_pd",
      due_at: "2026-08-31",
      transaction_id: "txn_pd",
    });
    const txns = [charge("txn_pd", "rnt_pd", 400, "2026-08-31")];
    // 2:00 PM Aug 31 (not late). Pass the instant explicitly so the selector
    // uses the mocked wall-clock time instead of the real system clock (which
    // may be past 2 PM on Aug 31 in CI).
    const realNow = Date.now;
    const mocked = atAug31(14, 0);
    Date.now = () => mocked.getTime();
    try {
      expect(
        getPaymentObligations([rental], [period], txns, mocked)[0].bucket,
      ).not.toBe("late");
    } finally {
      Date.now = realNow;
    }
  });
});
