// Connect Pro Fleet — Build #10 payment arrangement domain tests.
//
// Pure tests over the arrangement selectors + schedule generation. Verifies the
// core rule: a promise is NOT a payment — creating/linking never changes
// financial truth, only operational promise tracking.

import { describe, it, expect } from "vitest";
import type { FinancialTransaction } from "@/lib/types";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "@/lib/paymentArrangementTypes";
import {
  installmentPaidAmount,
  installmentStatus,
  arrangementPaidAmount,
  arrangementRemaining,
  getNextInstallment,
  isArrangementBroken,
  deriveArrangementStatus,
  generateSchedule,
  validateCustomSchedule,
  nextArrangementNumber,
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

function makeArrangement(amount = 600): PaymentArrangement {
  return {
    id: "pa_x",
    tenant_id: "tnt",
    arrangement_number: "PA-2026-000001",
    customer_id: "cus_x",
    rental_id: "rnt_x",
    invoice_id: null,
    billing_period_ids: [],
    original_outstanding_amount: 600,
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

describe("Build #10 — schedule generation", () => {
  it("generates installments that sum exactly to the amount", () => {
    const sched = generateSchedule(100, 3, "2026-08-20", "weekly");
    expect(sched.length).toBe(3);
    const sum = Math.round(sched.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    expect(sum).toBe(100);
    // Last absorbs the rounding remainder.
    expect(sched[0].amount).toBe(33.33);
    expect(sched[2].amount).toBe(33.34);
  });

  it("spaces weekly installments 7 days apart", () => {
    const sched = generateSchedule(300, 3, "2026-08-20", "weekly");
    expect(sched[0].due_date).toBe("2026-08-20");
    expect(sched[1].due_date).toBe("2026-08-27");
    expect(sched[2].due_date).toBe("2026-09-03");
  });

  it("spaces biweekly installments 14 days apart", () => {
    const sched = generateSchedule(300, 2, "2026-08-20", "biweekly");
    expect(sched[1].due_date).toBe("2026-09-03");
  });
});

describe("Build #10 — custom schedule validation", () => {
  it("rejects a schedule that doesn't sum to the arrangement amount", () => {
    const v = validateCustomSchedule(
      [
        { amount: 200, due_date: "2026-08-20" },
        { amount: 100, due_date: "2026-08-27" },
      ],
      600,
    );
    expect(v.ok).toBe(false);
    expect(v.error).toContain("300");
  });

  it("accepts a schedule that sums exactly", () => {
    const v = validateCustomSchedule(
      [
        { amount: 300, due_date: "2026-08-20" },
        { amount: 300, due_date: "2026-08-27" },
      ],
      600,
    );
    expect(v.ok).toBe(true);
  });

  it("rejects zero installments", () => {
    expect(validateCustomSchedule([], 600).ok).toBe(false);
  });
});

describe("Build #10 — installment status derivation", () => {
  it("is upcoming before the due date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const ins = makeInstallment("ins", 200, future.toISOString().slice(0, 10));
    expect(installmentStatus(ins, [])).toBe("upcoming");
  });

  it("is due today on the due date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ins = makeInstallment("ins", 200, today);
    expect(installmentStatus(ins, [])).toBe("due_today");
  });

  it("is late past the due date within grace", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const ins = makeInstallment("ins", 200, past.toISOString().slice(0, 10));
    expect(installmentStatus(ins, [], 1)).toBe("late");
  });

  it("is missed past the grace period", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const ins = makeInstallment("ins", 200, past.toISOString().slice(0, 10));
    expect(installmentStatus(ins, [], 1)).toBe("missed");
  });

  it("is paid when fully covered by linked payments", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ins = makeInstallment("ins", 200, today, [
      { txnId: "t1", allocated: 200 },
    ]);
    const txns = [makeTxn("t1", 200)];
    expect(installmentStatus(ins, txns)).toBe("paid");
  });

  it("is partially paid when partially covered", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ins = makeInstallment("ins", 200, today, [
      { txnId: "t1", allocated: 100 },
    ]);
    const txns = [makeTxn("t1", 100)];
    expect(installmentStatus(ins, txns)).toBe("partially_paid");
  });

  it("excludes deposit application transactions from installment paid amount", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ins = makeInstallment("ins", 200, today, [
      { txnId: "t1", allocated: 200 },
    ]);
    const txns = [
      makeTxn("t1", 200, {
        deposit_id: "dep_1",
        metadata: { deposit_kind: "application" },
      }),
    ];
    expect(installmentPaidAmount(ins, txns)).toBe(0);
  });
});

describe("Build #10 — arrangement balance derivation", () => {
  it("paid amount sums all linked non-reversed payments", () => {
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20", [
        { txnId: "t1", allocated: 300 },
      ]),
      makeInstallment("ins2", 300, "2026-08-27", [
        { txnId: "t2", allocated: 100 },
      ]),
    ];
    installments[1].sequence = 2;
    const txns = [makeTxn("t1", 300), makeTxn("t2", 100)];
    expect(arrangementPaidAmount(installments, txns)).toBe(400);
  });

  it("remaining = arrangement amount - paid", () => {
    const a = makeArrangement(600);
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20", [
        { txnId: "t1", allocated: 300 },
      ]),
      makeInstallment("ins2", 300, "2026-08-27", []),
    ];
    installments[1].sequence = 2;
    const txns = [makeTxn("t1", 300)];
    expect(arrangementRemaining(a, installments, txns)).toBe(300);
  });

  it("next installment is the oldest unpaid", () => {
    const installments = [
      makeInstallment("ins1", 300, "2026-08-20", [
        { txnId: "t1", allocated: 300 },
      ]),
      makeInstallment("ins2", 300, "2026-08-27", []),
    ];
    installments[1].sequence = 2;
    const txns = [makeTxn("t1", 300)];
    const next = getNextInstallment(installments, txns);
    expect(next?.id).toBe("ins2");
  });
});

describe("Build #10 — broken / completed status", () => {
  it("is broken when any installment is missed beyond grace", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const installments = [
      makeInstallment("ins1", 300, past.toISOString().slice(0, 10), []),
    ];
    expect(isArrangementBroken(installments, [], 1)).toBe(true);
  });

  it("is completed when fully paid", () => {
    const a = makeArrangement(600);
    const today = new Date().toISOString().slice(0, 10);
    const installments = [
      makeInstallment("ins1", 300, today, [{ txnId: "t1", allocated: 300 }]),
      makeInstallment("ins2", 300, today, [{ txnId: "t2", allocated: 300 }]),
    ];
    installments[1].sequence = 2;
    const txns = [makeTxn("t1", 300), makeTxn("t2", 300)];
    expect(deriveArrangementStatus(a, installments, txns)).toBe("completed");
  });

  it("stays active when installments are on track", () => {
    const a = makeArrangement(600);
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const installments = [
      makeInstallment("ins1", 300, future.toISOString().slice(0, 10), []),
    ];
    expect(deriveArrangementStatus(a, installments, [])).toBe("active");
  });

  it("stays cancelled once cancelled", () => {
    const a = makeArrangement();
    a.status = "cancelled";
    expect(deriveArrangementStatus(a, [], [])).toBe("cancelled");
  });
});

describe("Build #10 — promises due today + broken selectors", () => {
  it("finds installments due today across active arrangements", () => {
    const today = new Date().toISOString().slice(0, 10);
    const a = makeArrangement();
    const installments = [makeInstallment("ins1", 200, today)];
    const byArr = () => installments;
    const due = getPromisesDueToday([a], byArr, []);
    expect(due.length).toBe(1);
  });

  it("finds broken arrangements", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const a = makeArrangement();
    const installments = [
      makeInstallment("ins1", 200, past.toISOString().slice(0, 10), []),
    ];
    const byArr = () => installments;
    const broken = getBrokenArrangements([a], byArr, []);
    expect(broken.length).toBe(1);
  });
});

describe("Build #10 — arrangement numbering", () => {
  it("generates the next number for the current year", () => {
    const year = new Date().getFullYear();
    const existing: PaymentArrangement[] = [
      { ...makeArrangement(), arrangement_number: `PA-${year}-000005` },
    ];
    expect(nextArrangementNumber(existing)).toBe(`PA-${year}-000006`);
  });

  it("starts at 000001 when none exist for the year", () => {
    const year = new Date().getFullYear();
    expect(nextArrangementNumber([])).toBe(`PA-${year}-000001`);
  });
});
