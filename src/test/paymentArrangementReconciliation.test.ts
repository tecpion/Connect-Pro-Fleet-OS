// Connect Pro Fleet — Build #10 cleanup reconciliation domain tests.
//
// Tests the reconciliation selectors that distinguish the SCHEDULED promise
// remaining (historical) from the COLLECTIBLE remaining (what can still be
// collected against the current actual outstanding). Verifies that:
//   - a promise never changes financial truth
//   - deposit applications / credits reduce collectible remaining but are NOT
//     counted as customer payments
//   - fully credit-resolved debt stops surfacing as actionable
//   - new charges added after an arrangement don't auto-expand it

import { describe, it, expect } from "vitest";
import type { FinancialTransaction } from "@/lib/types";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "@/lib/paymentArrangementTypes";
import {
  reconcileArrangement,
  getArrangementCollectibleRemaining,
  getArrangementResolvedByCredits,
  isArrangementEffectivelyResolved,
  arrangementNeedsReconciliation,
  getAdditionalBalanceOutsideArrangement,
  getPromisesDueToday,
  getBrokenArrangements,
} from "@/lib/paymentArrangements";

function makeTxn(
  id: string,
  amount: number,
  opts: Partial<FinancialTransaction> = {},
): FinancialTransaction {
  return {
    id,
    tenant_id: "tnt",
    rental_id: "rnt_x",
    reservation_id: null,
    customer_id: "cus_x",
    vehicle_id: null,
    invoice_id: null,
    deposit_id: null,
    transaction_type: "card_payment",
    category: "payment",
    description: "Payment",
    amount,
    direction: "payment",
    payment_method: "card",
    external_transaction_id: null,
    status: "posted",
    effective_date: "2026-08-20",
    created_at: "2026-08-20T10:00:00Z",
    created_by: null,
    notes: null,
    related_transaction_id: null,
    billing_period: null,
    metadata: null,
    ...opts,
  };
}

function makeInstallment(
  id: string,
  amount: number,
  dueDate: string,
  linked: { txnId: string; allocated: number }[] = [],
): PaymentArrangementInstallment {
  return {
    id,
    tenant_id: "tnt",
    arrangement_id: "pa_x",
    sequence: 1,
    amount_due: amount,
    due_date: dueDate,
    linked_payment_transaction_ids: linked.map((l) => l.txnId),
    linked_payments: linked.map((l) => ({
      transaction_id: l.txnId,
      amount: l.allocated,
    })),
    paid_at: null,
    notes: null,
    created_at: "2026-08-20T10:00:00Z",
  };
}

function makeArrangement(amount = 600, outstanding = 600): PaymentArrangement {
  return {
    id: "pa_x",
    tenant_id: "tnt",
    arrangement_number: "PA-2026-000001",
    customer_id: "cus_x",
    rental_id: "rnt_x",
    invoice_id: null,
    billing_period_ids: [],
    original_outstanding_amount: outstanding,
    arrangement_amount: amount,
    status: "active",
    start_date: "2026-08-20",
    grace_period_days: 1,
    terms_summary: "test",
    reason: null,
    created_by: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    completed_at: null,
    broken_at: null,
    cancelled_at: null,
  };
}

describe("Build #10 cleanup — collectible remaining", () => {
  it("collectible remaining equals scheduled remaining when balance is unchanged", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20"),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    expect(getArrangementCollectibleRemaining(a, installments, [], 600)).toBe(
      600,
    );
  });

  it("deposit application reduces collectible remaining but not paid amount", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20"),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    // No linked payments, but the actual outstanding dropped to 400 (e.g. a
    // $200 deposit application reduced the debt).
    const rec = reconcileArrangement(a, installments, [], 400);
    expect(rec.paidAmount).toBe(0); // deposit application is NOT a payment
    expect(rec.scheduledRemaining).toBe(600); // historical schedule intact
    expect(rec.collectibleRemaining).toBe(400); // capped at current outstanding
    expect(rec.resolvedByCredits).toBe(200);
  });

  it("manual ledger credit reduces collectible remaining", () => {
    const a = makeArrangement(300, 300);
    const installments = [makeInstallment("ins1", 300, "2026-08-20")];
    // A $300 credit reduced the actual outstanding to 0.
    const rec = reconcileArrangement(a, installments, [], 0);
    expect(rec.collectibleRemaining).toBe(0);
    expect(rec.resolvedByCredits).toBe(300);
    expect(rec.paidAmount).toBe(0);
  });

  it("charge reversal reduces collectible remaining", () => {
    const a = makeArrangement(300, 300);
    const installments = [makeInstallment("ins1", 300, "2026-08-20")];
    // Charge reversed → outstanding 0.
    expect(getArrangementCollectibleRemaining(a, installments, [], 0)).toBe(0);
  });

  it("scheduled promise remaining remains historically intact after balance change", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20", [
        { txnId: "t1", allocated: 300 },
      ]),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    const txns = [makeTxn("t1", 300)];
    // Outstanding dropped to 100 via a credit.
    const rec = reconcileArrangement(a, installments, txns, 100);
    expect(rec.scheduledRemaining).toBe(300); // 600 - 300 paid
    expect(rec.paidAmount).toBe(300);
    expect(rec.collectibleRemaining).toBe(100);
  });
});

describe("Build #10 cleanup — effective resolution", () => {
  it("fully credit-resolved debt is effectively resolved", () => {
    const a = makeArrangement(300, 300);
    const installments = [makeInstallment("ins1", 300, "2026-08-20")];
    expect(isArrangementEffectivelyResolved(a, installments, [], 0)).toBe(true);
  });

  it("credit resolution does not inflate actual payment totals", () => {
    const a = makeArrangement(300, 300);
    const installments = [makeInstallment("ins1", 300, "2026-08-20")];
    const rec = reconcileArrangement(a, installments, [], 0);
    expect(rec.paidAmount).toBe(0);
    expect(rec.resolvedByCredits).toBe(300);
    expect(rec.effectivelyResolved).toBe(true);
  });

  it("not resolved when outstanding remains", () => {
    const a = makeArrangement(300, 300);
    const installments = [makeInstallment("ins1", 300, "2026-08-20")];
    expect(isArrangementEffectivelyResolved(a, installments, [], 300)).toBe(
      false,
    );
  });
});

describe("Build #10 cleanup — reconciliation flag", () => {
  it("needs reconciliation when scheduled exceeds collectible", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20"),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    expect(arrangementNeedsReconciliation(a, installments, [], 400)).toBe(true);
  });

  it("does not need reconciliation when balanced", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20"),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    expect(arrangementNeedsReconciliation(a, installments, [], 600)).toBe(
      false,
    );
  });
});

describe("Build #10 cleanup — new charges outside arrangement", () => {
  it("additional balance outside arrangement stays distinct", () => {
    const a = makeArrangement(600, 600);
    // Outstanding grew to 950 (a new $350 charge).
    expect(getAdditionalBalanceOutsideArrangement(a, 950)).toBe(350);
  });

  it("collectible remaining does not auto-expand with new charges", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20"),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    // Outstanding 950, but arrangement only covers the original 600.
    const rec = reconcileArrangement(a, installments, [], 950);
    expect(rec.collectibleRemaining).toBe(600);
    expect(rec.additionalOutsideArrangement).toBe(350);
  });
});

describe("Build #10 cleanup — resolved arrangements excluded from attention", () => {
  it("promises due today excludes fully resolved arrangements", () => {
    const today = new Date().toISOString().slice(0, 10);
    const a = makeArrangement(200, 200);
    const installments = [makeInstallment("ins1", 200, today)];
    const byArr = () => installments;
    // Debt fully resolved by credit (outstanding 0).
    const due = getPromisesDueToday([a], byArr, [], () => 0);
    expect(due.length).toBe(0);
  });

  it("broken arrangements excludes fully resolved arrangements", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const a = makeArrangement(200, 200);
    const installments = [
      makeInstallment("ins1", 200, past.toISOString().slice(0, 10)),
    ];
    const byArr = () => installments;
    // Without outstanding resolver → broken surfaces.
    expect(getBrokenArrangements([a], byArr, []).length).toBe(1);
    // With outstanding 0 (resolved) → excluded.
    expect(getBrokenArrangements([a], byArr, [], () => 0).length).toBe(0);
  });
});

describe("Build #10 cleanup — resolved by credits after payment", () => {
  it("linked actual payment after credit allocates correctly", () => {
    const a = makeArrangement(600, 600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20", [
        { txnId: "t1", allocated: 300 },
      ]),
      makeInstallment("ins2", 300, "2026-08-27"),
    ];
    installments[1].sequence = 2;
    const txns = [makeTxn("t1", 300)];
    // Outstanding dropped to 100 (a $200 credit applied after the $300 payment).
    const rec = reconcileArrangement(a, installments, txns, 100);
    expect(rec.paidAmount).toBe(300);
    expect(rec.scheduledRemaining).toBe(300);
    expect(rec.collectibleRemaining).toBe(100);
    expect(rec.resolvedByCredits).toBe(200);
  });
});
