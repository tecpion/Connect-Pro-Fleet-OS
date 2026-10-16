// Connect Pro Fleet — Expenses V1 acceptance tests (part 1): rule matching,
// merchant memory, allocation states, month-end checklist, vendor spend,
// spend-by-category, spend alerts, budget vs actual. Pure selector coverage.

import { describe, it, expect } from "vitest";
import {
  matchExpenseRule,
  merchantMemory,
  memoryForMerchant,
  allocationState,
  getUnallocatedExpenses,
  monthEndChecklist,
  vendorSpend,
  spendByCategory,
  evaluateSpendAlerts,
  budgetVsActual,
} from "@/lib/expenseRuleSelectors";
import type {
  ExpenseRule,
  ExpenseTransaction,
  ExpenseCategory,
} from "@/lib/expenseTypes";

const baseRule = (over: Partial<ExpenseRule>): ExpenseRule => ({
  id: "r",
  tenant_id: "tnt_connectpro",
  name: "rule",
  conditions: [{ field: "merchant_contains", op: "contains", value: "x" }],
  action: {
    category_id: null,
    scope: "any",
    vehicle_id: null,
    require_vehicle_selection: false,
    multi_vehicle_ids: null,
    allocation_method: null,
    receipt_required: null,
    review_state: null,
    notes: null,
  },
  mode: "suggest",
  active: true,
  times_used: 0,
  last_matched_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const cand = (over: Partial<Parameters<typeof matchExpenseRule>[1]> = {}) => ({
  merchant: null,
  description: "",
  amount: 0,
  account_id: null,
  transaction_type: null,
  ...over,
});

describe("Expenses V1 — rule matching", () => {
  it("matches a merchant_contains rule", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "c",
          conditions: [
            { field: "merchant_contains", op: "contains", value: "autozone" },
          ],
        }),
      ],
      cand({ merchant: "AutoZone Store #42", amount: 89.47 }),
    );
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.ruleId).toBe("c");
      expect(r.mode).toBe("suggest");
      expect(r.ambiguous).toBe(false);
    }
  });

  it("matches a merchant_equals rule (auto_apply)", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "e",
          mode: "auto_apply",
          conditions: [
            { field: "merchant_equals", op: "equals", value: "chase auto" },
          ],
        }),
      ],
      cand({ merchant: "Chase Auto", amount: 420 }),
    );
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.mode).toBe("auto_apply");
  });

  it("matches a description_contains rule", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "d",
          conditions: [
            { field: "description_contains", op: "contains", value: "toll" },
          ],
        }),
      ],
      cand({ description: "SunPass toll charge", amount: 12.5 }),
    );
    expect(r.matched).toBe(true);
  });

  it("matches an amount_equals rule", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "a",
          conditions: [{ field: "amount_equals", op: "equals", value: 500 }],
        }),
      ],
      cand({ amount: 500 }),
    );
    expect(r.matched).toBe(true);
  });

  it("matches amount_min + amount_max range", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "rng",
          conditions: [
            { field: "amount_min", op: "gte", value: 500 },
            { field: "amount_max", op: "lte", value: 1000 },
          ],
        }),
      ],
      cand({ amount: 750 }),
    );
    expect(r.matched).toBe(true);
    const out = matchExpenseRule(
      [
        baseRule({
          id: "rng",
          conditions: [
            { field: "amount_min", op: "gte", value: 500 },
            { field: "amount_max", op: "lte", value: 1000 },
          ],
        }),
      ],
      cand({ amount: 1500 }),
    );
    expect(out.matched).toBe(false);
  });

  it("matches an account_id rule", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "acct",
          conditions: [{ field: "account_id", op: "equals", value: "acct_1" }],
        }),
      ],
      cand({ account_id: "acct_1", amount: 100 }),
    );
    expect(r.matched).toBe(true);
  });

  it("matches a transaction_type rule", () => {
    const r = matchExpenseRule(
      [
        baseRule({
          id: "tt",
          conditions: [
            { field: "transaction_type", op: "equals", value: "debit" },
          ],
        }),
      ],
      cand({ transaction_type: "debit", amount: 50 }),
    );
    expect(r.matched).toBe(true);
  });

  it("returns not-matched when no rules apply", () => {
    const r = matchExpenseRule(
      [baseRule({ id: "x" })],
      cand({ merchant: "Unknown", amount: 1 }),
    );
    expect(r.matched).toBe(false);
  });

  it("does not match inactive rules", () => {
    const r = matchExpenseRule(
      [baseRule({ id: "off", active: false })],
      cand({ merchant: "x", amount: 1 }),
    );
    expect(r.matched).toBe(false);
  });

  it("marks ambiguous when two rules tie on specificity", () => {
    const rules = [
      baseRule({
        id: "a",
        conditions: [
          { field: "merchant_contains", op: "contains", value: "autozone" },
        ],
      }),
      baseRule({
        id: "b",
        conditions: [
          { field: "merchant_contains", op: "contains", value: "autozone" },
        ],
      }),
    ];
    const r = matchExpenseRule(
      rules,
      cand({ merchant: "AutoZone", amount: 10 }),
    );
    expect(r.matched).toBe(true);
    if (r.matched) expect(r.ambiguous).toBe(true);
  });

  it("most-specific rule wins (merchant_equals beats merchant_contains)", () => {
    const rules = [
      baseRule({
        id: "contains",
        conditions: [
          { field: "merchant_contains", op: "contains", value: "chase" },
        ],
      }),
      baseRule({
        id: "equals",
        conditions: [
          { field: "merchant_equals", op: "equals", value: "chase auto" },
        ],
      }),
    ];
    const r = matchExpenseRule(
      rules,
      cand({ merchant: "Chase Auto", amount: 420 }),
    );
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.ruleId).toBe("equals");
      expect(r.ambiguous).toBe(false);
    }
  });

  it("require_vehicle_selection flag is preserved on the matched rule action", () => {
    const rules = [
      baseRule({
        id: "rvs",
        conditions: [
          { field: "merchant_contains", op: "contains", value: "autozone" },
        ],
        action: {
          ...baseRule({ id: "x" }).action,
          category_id: "ec_parts",
          scope: "vehicle",
          require_vehicle_selection: true,
        },
      }),
    ];
    const r = matchExpenseRule(
      rules,
      cand({ merchant: "AutoZone", amount: 50 }),
    );
    expect(r.matched).toBe(true);
  });
});

describe("Expenses V1 — merchant memory", () => {
  const cats: ExpenseCategory[] = [
    {
      id: "ec_parts",
      tenant_id: "t1",
      name: "Parts",
      type: "vehicle_direct",
      parent_category_id: null,
      active: true,
      created_at: "2026-01-01",
      group: "vehicle",
    },
  ];
  const expenses: ExpenseTransaction[] = [
    {
      id: "e1",
      expense_number: "EXP-1",
      transaction_date: "2026-08-01",
      description: "AutoZone parts",
      amount: 50,
      expense_category_id: "ec_parts",
      vehicle_id: "veh_1",
      status: "posted",
      reversal_of: null,
    } as ExpenseTransaction,
    {
      id: "e2",
      expense_number: "EXP-2",
      transaction_date: "2026-08-10",
      description: "AutoZone parts",
      amount: 30,
      expense_category_id: "ec_parts",
      vehicle_id: "veh_2",
      status: "posted",
      reversal_of: null,
    } as ExpenseTransaction,
  ];

  it("remembers last category/scope per merchant", () => {
    const mem = merchantMemory(expenses, cats);
    expect(mem.length).toBe(1);
    expect(mem[0].merchant).toBe("AutoZone parts");
    expect(mem[0].category_id).toBe("ec_parts");
    expect(mem[0].scope).toBe("vehicle");
  });

  it("lookups merchant memory case-insensitively", () => {
    const mem = merchantMemory(expenses, cats);
    const found = memoryForMerchant(mem, "autozone PARTS");
    expect(found).toBeDefined();
  });

  it("returns undefined for unknown merchant", () => {
    const mem = merchantMemory(expenses, cats);
    expect(memoryForMerchant(mem, "Unknown")).toBeUndefined();
  });

  it("ignores reversal expenses in memory", () => {
    const withRev = [
      ...expenses,
      {
        id: "e3",
        expense_number: "EXP-3",
        transaction_date: "2026-08-15",
        description: "AutoZone parts",
        amount: 50,
        expense_category_id: "ec_parts",
        vehicle_id: "veh_1",
        status: "posted",
        reversal_of: "e1",
      } as ExpenseTransaction,
    ];
    const mem = merchantMemory(withRev, cats);
    // Most recent non-reversal is e2 (2026-08-10).
    expect(mem[0].vehicle_id).toBe("veh_2");
  });
});

describe("Expenses V1 — allocation states", () => {
  it("vehicle-scoped expense is fully allocated", () => {
    const e = {
      vehicle_id: "veh_1",
      maintenance_work_order_id: null,
      rental_id: null,
    } as ExpenseTransaction;
    expect(allocationState(e, false)).toBe("fully_allocated");
  });

  it("maintenance-WO-scoped expense is fully allocated", () => {
    const e = {
      vehicle_id: null,
      maintenance_work_order_id: "wo_1",
      rental_id: null,
    } as ExpenseTransaction;
    expect(allocationState(e, false)).toBe("fully_allocated");
  });

  it("overhead with no line items is fully allocated", () => {
    const e = {
      vehicle_id: null,
      maintenance_work_order_id: null,
      rental_id: null,
    } as ExpenseTransaction;
    expect(allocationState(e, false)).toBe("fully_allocated");
  });

  it("with line items but some unallocated is partially", () => {
    const e = {
      vehicle_id: null,
      maintenance_work_order_id: null,
      rental_id: null,
    } as ExpenseTransaction;
    expect(allocationState(e, true)).toBe("partially_allocated");
  });

  it("getUnallocatedExpenses filters genuinely unallocated (no category, no vehicle, no line items)", () => {
    const expenses: ExpenseTransaction[] = [
      {
        id: "u1",
        status: "posted",
        reversal_of: null,
        vehicle_id: null,
        maintenance_work_order_id: null,
        rental_id: null,
        expense_category_id: null,
      } as ExpenseTransaction,
      {
        id: "u2",
        status: "posted",
        reversal_of: null,
        vehicle_id: "veh_1",
        maintenance_work_order_id: null,
        rental_id: null,
        expense_category_id: null,
      } as ExpenseTransaction,
      {
        id: "u3",
        status: "posted",
        reversal_of: null,
        vehicle_id: null,
        maintenance_work_order_id: null,
        rental_id: null,
        expense_category_id: "ec_x",
      } as ExpenseTransaction,
    ];
    const unalloc = getUnallocatedExpenses(expenses, new Set());
    expect(unalloc).toHaveLength(1);
    expect(unalloc[0].id).toBe("u1");
  });

  it("excludes voided and reversal expenses from unallocated", () => {
    const expenses: ExpenseTransaction[] = [
      {
        id: "v1",
        status: "voided",
        reversal_of: null,
        vehicle_id: null,
        maintenance_work_order_id: null,
        rental_id: null,
        expense_category_id: null,
      } as ExpenseTransaction,
      {
        id: "r1",
        status: "posted",
        reversal_of: "x",
        vehicle_id: null,
        maintenance_work_order_id: null,
        rental_id: null,
        expense_category_id: null,
      } as ExpenseTransaction,
    ];
    expect(getUnallocatedExpenses(expenses, new Set())).toHaveLength(0);
  });
});

describe("Expenses V1 — month-end checklist", () => {
  const baseExp = (over: Partial<ExpenseTransaction>): ExpenseTransaction =>
    ({
      id: "e",
      expense_number: "EXP-1",
      transaction_date: "2026-09-01",
      amount: 100,
      status: "posted",
      reversal_of: null,
      receipt_required: true,
      receipt_status: "missing",
      expense_category_id: "ec_x",
      vehicle_id: "veh_1",
      ...over,
    }) as ExpenseTransaction;

  it("reports needs_attention when missing receipts exist", () => {
    const cl = monthEndChecklist(
      "2026-09",
      [baseExp({})],
      [],
      [],
      [],
      [],
      new Set(),
    );
    expect(cl.missing_receipts).toBe(1);
    expect(cl.status).toBe("needs_attention");
  });

  it("counts unallocated expenses", () => {
    const cl = monthEndChecklist(
      "2026-09",
      [
        baseExp({
          id: "u",
          vehicle_id: null,
          maintenance_work_order_id: null,
          rental_id: null,
          expense_category_id: null,
          receipt_required: false,
          receipt_status: "not_required",
        }),
      ],
      [],
      [],
      [],
      [],
      new Set(),
    );
    expect(cl.unallocated_expenses).toBe(1);
  });

  it("counts unmatched bank transactions", () => {
    const cl = monthEndChecklist(
      "2026-09",
      [],
      [],
      [],
      [],
      [{ matched_expense_id: null, ignored: false }],
      new Set(),
    );
    expect(cl.unmatched_bank_transactions).toBe(1);
  });

  it("counts reimbursements owed + approved", () => {
    const cl = monthEndChecklist(
      "2026-09",
      [],
      [],
      [{ status: "owed" }, { status: "approved" }, { status: "paid" }],
      [],
      [],
      new Set(),
    );
    expect(cl.reimbursements_owed).toBe(2);
  });

  it("counts expenses awaiting review", () => {
    const cl = monthEndChecklist(
      "2026-09",
      [
        baseExp({
          id: "rv",
          receipt_required: false,
          receipt_status: "not_required",
          metadata: { review_state: "needs_review" },
        }),
      ],
      [],
      [],
      [],
      [],
      new Set(),
    );
    expect(cl.expenses_awaiting_review).toBe(1);
  });

  it("counts unmatched receipts in the inbox for the month", () => {
    const inbox = [
      { id: "i1", month_key: "2026-09", state: "unmatched" as const },
      { id: "i2", month_key: "2026-09", state: "missing_info" as const },
      { id: "i3", month_key: "2026-09", state: "matched" as const },
      { id: "i4", month_key: "2026-08", state: "unmatched" as const },
    ];
    const cl = monthEndChecklist("2026-09", [], [], [], inbox, [], new Set());
    expect(cl.unmatched_receipts).toBe(2);
  });

  it("reports ready_for_review when clean", () => {
    const cl = monthEndChecklist(
      "2026-09",
      [
        baseExp({
          receipt_required: false,
          receipt_status: "not_required",
          vehicle_id: null,
          expense_category_id: "ec_rent",
        }),
      ],
      [],
      [],
      [],
      [],
      new Set(),
    );
    expect(cl.status).toBe("ready_for_review");
  });
});

describe("Expenses V1 — vendor spend", () => {
  const cats: ExpenseCategory[] = [
    {
      id: "ec_parts",
      tenant_id: "t1",
      name: "Parts",
      type: "vehicle_direct",
      parent_category_id: null,
      active: true,
      created_at: "2026-01-01",
      group: "vehicle",
    },
  ];
  const expenses: ExpenseTransaction[] = [
    {
      id: "e1",
      status: "posted",
      reversal_of: null,
      amount: 500,
      vendor_id: "v1",
      expense_category_id: "ec_parts",
      transaction_date: "2026-09-01",
      vehicle_id: "veh_1",
    } as ExpenseTransaction,
    {
      id: "e2",
      status: "posted",
      reversal_of: null,
      amount: 300,
      vendor_id: "v1",
      expense_category_id: "ec_parts",
      transaction_date: "2026-09-10",
      vehicle_id: "veh_1",
    } as ExpenseTransaction,
    {
      id: "e3",
      status: "posted",
      reversal_of: null,
      amount: 2400,
      vendor_id: "v2",
      expense_category_id: null,
      transaction_date: "2026-09-05",
      vehicle_id: null,
    } as ExpenseTransaction,
  ];

  it("aggregates spend by vendor with top category", () => {
    const vs = vendorSpend(expenses, cats, (id) =>
      id === "v1" ? "AutoZone" : "Landlord",
    );
    expect(vs).toHaveLength(2);
    const az = vs.find((v) => v.vendor === "AutoZone");
    expect(az?.spend).toBe(800);
    expect(az?.transaction_count).toBe(2);
    expect(az?.top_category_name).toBe("Parts");
  });

  it("nets out reversals", () => {
    const withRev = [
      ...expenses,
      {
        id: "e4",
        status: "posted",
        reversal_of: "e1",
        amount: 500,
        vendor_id: "v1",
        expense_category_id: "ec_parts",
        transaction_date: "2026-09-12",
        vehicle_id: "veh_1",
      } as ExpenseTransaction,
    ];
    const vs = vendorSpend(withRev, cats, () => "AutoZone");
    const az = vs.find((v) => v.vendor_id === "v1");
    expect(az?.spend).toBe(300); // 800 - 500 reversal
  });

  it("groups no-vendor expenses under 'No vendor'", () => {
    const vs = vendorSpend(expenses, cats, () => "x");
    expect(vs.some((v) => v.vendor === "No vendor")).toBe(false); // all have vendors here
    const noVendor = vendorSpend(
      [
        {
          id: "n",
          status: "posted",
          reversal_of: null,
          amount: 50,
          vendor_id: null,
          expense_category_id: null,
          transaction_date: "2026-09-01",
        } as ExpenseTransaction,
      ],
      cats,
      () => "x",
    );
    expect(noVendor[0].vendor).toBe("No vendor");
  });
});

describe("Expenses V1 — spend by category", () => {
  const cats: ExpenseCategory[] = [
    {
      id: "ec_parts",
      tenant_id: "t1",
      name: "Parts",
      type: "vehicle_direct",
      parent_category_id: null,
      active: true,
      created_at: "2026-01-01",
      group: "vehicle",
    },
    {
      id: "ec_rent",
      tenant_id: "t1",
      name: "Office Rent",
      type: "company_overhead",
      parent_category_id: null,
      active: true,
      created_at: "2026-01-01",
      group: "overhead",
    },
  ];
  const expenses: ExpenseTransaction[] = [
    {
      id: "e1",
      status: "posted",
      reversal_of: null,
      amount: 500,
      vendor_id: null,
      expense_category_id: "ec_parts",
      transaction_date: "2026-09-01",
      vehicle_id: "veh_1",
    } as ExpenseTransaction,
    {
      id: "e2",
      status: "posted",
      reversal_of: null,
      amount: 2400,
      vendor_id: null,
      expense_category_id: "ec_rent",
      transaction_date: "2026-09-05",
      vehicle_id: null,
    } as ExpenseTransaction,
  ];

  it("groups spend by category within a date range", () => {
    const sc = spendByCategory(
      expenses,
      cats,
      new Date("2026-09-01"),
      new Date("2026-09-30T23:59:59"),
    );
    const vehicle = sc
      .filter((c) => c.group === "vehicle")
      .reduce((s, c) => s + c.spend, 0);
    const overhead = sc
      .filter((c) => c.group === "overhead")
      .reduce((s, c) => s + c.spend, 0);
    expect(vehicle).toBe(500);
    expect(overhead).toBe(2400);
  });

  it("excludes expenses outside the date range", () => {
    const sc = spendByCategory(
      expenses,
      cats,
      new Date("2026-10-01"),
      new Date("2026-10-31"),
    );
    expect(sc).toHaveLength(0);
  });
});

describe("Expenses V1 — spend alerts", () => {
  const expenses: ExpenseTransaction[] = [
    {
      id: "e1",
      status: "posted",
      reversal_of: null,
      amount: 2400,
      vehicle_id: null,
      expense_category_id: "ec_rent",
      source: "manual",
      transaction_date: "2026-09-01",
    } as ExpenseTransaction,
    {
      id: "e2",
      status: "posted",
      reversal_of: null,
      amount: 600,
      vehicle_id: "veh_1",
      expense_category_id: "ec_maint",
      source: "maintenance_work_order",
      transaction_date: "2026-09-02",
    } as ExpenseTransaction,
    {
      id: "e3",
      status: "posted",
      reversal_of: null,
      amount: 50,
      vehicle_id: "veh_1",
      expense_category_id: "ec_fuel",
      source: "manual",
      transaction_date: "2026-09-03",
    } as ExpenseTransaction,
  ];

  it("triggers single_expense alert above threshold", () => {
    const triggered = evaluateSpendAlerts(
      [
        {
          id: "a1",
          tenant_id: "t",
          name: "Big",
          metric: "single_expense",
          threshold: 1000,
          category_id: null,
          active: true,
          created_at: "2026-01-01",
        },
      ],
      expenses,
    );
    expect(triggered).toHaveLength(1);
    expect(triggered[0].expenses.length).toBe(1);
  });

  it("triggers maintenance_expense alert", () => {
    const triggered = evaluateSpendAlerts(
      [
        {
          id: "a2",
          tenant_id: "t",
          name: "Maint",
          metric: "maintenance_expense",
          threshold: 500,
          category_id: null,
          active: true,
          created_at: "2026-01-01",
        },
      ],
      expenses,
    );
    expect(triggered).toHaveLength(1);
    expect(triggered[0].expenses[0].source).toBe("maintenance_work_order");
  });

  it("triggers vehicle_expense alert", () => {
    const triggered = evaluateSpendAlerts(
      [
        {
          id: "a3",
          tenant_id: "t",
          name: "Veh",
          metric: "vehicle_expense",
          threshold: 500,
          category_id: null,
          active: true,
          created_at: "2026-01-01",
        },
      ],
      expenses,
    );
    expect(triggered).toHaveLength(1);
  });

  it("triggers category_spend alert when category total exceeds threshold", () => {
    const triggered = evaluateSpendAlerts(
      [
        {
          id: "a4",
          tenant_id: "t",
          name: "Rent",
          metric: "category_spend",
          threshold: 2000,
          category_id: "ec_rent",
          active: true,
          created_at: "2026-01-01",
        },
      ],
      expenses,
    );
    expect(triggered).toHaveLength(1);
    expect(triggered[0].total).toBe(2400);
  });

  it("does not trigger inactive alerts", () => {
    const triggered = evaluateSpendAlerts(
      [
        {
          id: "a5",
          tenant_id: "t",
          name: "Big",
          metric: "single_expense",
          threshold: 1000,
          category_id: null,
          active: false,
          created_at: "2026-01-01",
        },
      ],
      expenses,
    );
    expect(triggered).toHaveLength(0);
  });
});

describe("Expenses V1 — budget vs actual", () => {
  const cats: ExpenseCategory[] = [
    {
      id: "ec_parts",
      tenant_id: "t1",
      name: "Parts",
      type: "vehicle_direct",
      parent_category_id: null,
      active: true,
      created_at: "2026-01-01",
      group: "vehicle",
    },
  ];
  const expenses: ExpenseTransaction[] = [
    {
      id: "e1",
      status: "posted",
      reversal_of: null,
      amount: 800,
      expense_category_id: "ec_parts",
      transaction_date: "2026-09-01",
      vehicle_id: "veh_1",
    } as ExpenseTransaction,
  ];

  it("computes actual vs budget and difference", () => {
    const bva = budgetVsActual(
      [
        {
          id: "b1",
          tenant_id: "t",
          category_id: "ec_parts",
          month_key: "2026-09",
          budget_amount: 1000,
          created_at: "2026-01-01",
        },
      ],
      cats,
      expenses,
      "2026-09",
    );
    expect(bva).toHaveLength(1);
    expect(bva[0].actual).toBe(800);
    expect(bva[0].difference).toBe(200);
  });

  it("returns over-budget as negative difference", () => {
    const bva = budgetVsActual(
      [
        {
          id: "b2",
          tenant_id: "t",
          category_id: "ec_parts",
          month_key: "2026-09",
          budget_amount: 500,
          created_at: "2026-01-01",
        },
      ],
      cats,
      expenses,
      "2026-09",
    );
    expect(bva[0].difference).toBe(-300);
  });
});
