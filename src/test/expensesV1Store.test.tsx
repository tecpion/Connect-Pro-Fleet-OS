// Connect Pro Fleet — Expenses V1 acceptance tests (part 2): store integration.
// Category management (add/edit/archive/reactivate/delete-safe), transaction
// rules (add/delete/record-applied without altering past txns), receipt inbox
// (capture/match/create-expense), reimbursements lifecycle, recurring
// templates, spend alerts, category budgets. Composes StoreProvider — no
// duplicate financial records.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  matchExpenseRule,
  allocationState,
  getUnallocatedExpenses,
} from "@/lib/expenseRuleSelectors";
import {
  isLikelyDuplicate,
  isReversal,
  netExpenseTotal,
} from "@/lib/expenseSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useHooks() {
  return renderHook(() => useStore(), { wrapper }).result;
}

describe("Expenses V1 — category management", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("adds a custom expense category", () => {
    act(() => {
      result.current.addExpenseCategory({
        id: "ec_test",
        tenant_id: "tnt_connectpro",
        name: "Test Category",
        type: "vehicle_direct",
        parent_category_id: null,
        active: true,
        created_at: new Date().toISOString(),
        group: "vehicle",
      });
    });
    expect(
      result.current.expenseCategories.find((c) => c.id === "ec_test"),
    ).toBeDefined();
  });

  it("edits an expense category", () => {
    act(() => {
      result.current.addExpenseCategory({
        id: "ec_edit",
        tenant_id: "tnt_connectpro",
        name: "Original",
        type: "vehicle_direct",
        parent_category_id: null,
        active: true,
        created_at: new Date().toISOString(),
        group: "vehicle",
      });
      result.current.updateExpenseCategory("ec_edit", {
        name: "Renamed",
        default_scope: "vehicle",
      });
    });
    const cat = result.current.expenseCategories.find(
      (c) => c.id === "ec_edit",
    );
    expect(cat?.name).toBe("Renamed");
    expect(cat?.default_scope).toBe("vehicle");
  });

  it("deletes an unused category", () => {
    act(() => {
      result.current.addExpenseCategory({
        id: "ec_unused",
        tenant_id: "tnt_connectpro",
        name: "Unused",
        type: "other",
        parent_category_id: null,
        active: true,
        created_at: new Date().toISOString(),
        group: "overhead",
      });
    });
    let ok = false;
    act(() => {
      ok = result.current.deleteExpenseCategoryIfUnused("ec_unused");
    });
    expect(ok).toBe(true);
    expect(
      result.current.expenseCategories.find((c) => c.id === "ec_unused"),
    ).toBeUndefined();
  });

  it("cannot delete a category already used by expenses", () => {
    // ec_parts is used by seeded expense exp_6.
    const ok = result.current.deleteExpenseCategoryIfUnused("ec_parts");
    expect(ok).toBe(false);
    expect(
      result.current.expenseCategories.find((c) => c.id === "ec_parts"),
    ).toBeDefined();
  });

  it("archives (deactivates) a used category", () => {
    act(() => {
      result.current.archiveExpenseCategory("ec_parts");
    });
    expect(
      result.current.expenseCategories.find((c) => c.id === "ec_parts")?.active,
    ).toBe(false);
  });

  it("reactivates an archived category", () => {
    act(() => {
      result.current.archiveExpenseCategory("ec_parts");
      result.current.reactivateExpenseCategory("ec_parts");
    });
    expect(
      result.current.expenseCategories.find((c) => c.id === "ec_parts")?.active,
    ).toBe(true);
  });

  it("supports parent-child category hierarchy", () => {
    act(() => {
      result.current.addExpenseCategory({
        id: "ec_parent",
        tenant_id: "tnt_connectpro",
        name: "Maintenance & Repairs",
        type: "maintenance",
        parent_category_id: null,
        active: true,
        created_at: new Date().toISOString(),
        group: "vehicle",
      });
      result.current.addExpenseCategory({
        id: "ec_child",
        tenant_id: "tnt_connectpro",
        name: "Brakes",
        type: "vehicle_direct",
        parent_category_id: "ec_parent",
        active: true,
        created_at: new Date().toISOString(),
        group: "vehicle",
      });
    });
    const child = result.current.expenseCategories.find(
      (c) => c.id === "ec_child",
    );
    expect(child?.parent_category_id).toBe("ec_parent");
  });
});

describe("Expenses V1 — transaction rules (store)", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("adds and deletes an expense rule without changing past transactions", () => {
    const before = result.current.expenses.length;
    act(() => {
      result.current.addExpenseRule({
        id: "rule_test",
        tenant_id: "tnt_connectpro",
        name: "Test rule",
        conditions: [
          { field: "merchant_contains", op: "contains", value: "test" },
        ],
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    expect(result.current.expenseRules.some((r) => r.id === "rule_test")).toBe(
      true,
    );
    act(() => {
      result.current.deleteExpenseRule("rule_test");
    });
    expect(result.current.expenseRules.some((r) => r.id === "rule_test")).toBe(
      false,
    );
    expect(result.current.expenses.length).toBe(before);
  });

  it("recordRuleApplied increments times_used without changing transactions", () => {
    act(() => {
      result.current.recordRuleApplied("rule_1");
    });
    const r = result.current.expenseRules.find((x) => x.id === "rule_1");
    expect(r?.times_used).toBe(1);
    expect(r?.last_matched_at).toBeTruthy();
  });

  it("disables and reactivates a rule", () => {
    act(() => {
      result.current.updateExpenseRule("rule_1", { active: false });
    });
    expect(
      result.current.expenseRules.find((r) => r.id === "rule_1")?.active,
    ).toBe(false);
    act(() => {
      result.current.updateExpenseRule("rule_1", { active: true });
    });
    expect(
      result.current.expenseRules.find((r) => r.id === "rule_1")?.active,
    ).toBe(true);
  });

  it("seeded AutoZone rule matches and requires vehicle selection", () => {
    const rules = result.current.expenseRules;
    const r = matchExpenseRule(rules, {
      merchant: "AutoZone #42",
      description: "",
      amount: 89,
      account_id: null,
      transaction_type: null,
    });
    expect(r.matched).toBe(true);
    if (r.matched) {
      const rule = rules.find((x) => x.id === r.ruleId);
      expect(rule?.action.require_vehicle_selection).toBe(true);
    }
  });

  it("seeded Chase Auto rule auto-applies to a specific vehicle", () => {
    const rules = result.current.expenseRules;
    const r = matchExpenseRule(rules, {
      merchant: "Chase Auto",
      description: "",
      amount: 420,
      account_id: null,
      transaction_type: null,
    });
    expect(r.matched).toBe(true);
    if (r.matched) {
      const rule = rules.find((x) => x.id === r.ruleId);
      expect(rule?.mode).toBe("auto_apply");
      expect(rule?.action.vehicle_id).toBe("veh_4");
    }
  });

  it("seeded Progressive rule is multi-vehicle equal split", () => {
    const rules = result.current.expenseRules;
    const r = matchExpenseRule(rules, {
      merchant: "Progressive",
      description: "",
      amount: 299,
      account_id: null,
      transaction_type: null,
    });
    expect(r.matched).toBe(true);
    if (r.matched) {
      const rule = rules.find((x) => x.id === r.ruleId);
      expect(rule?.action.multi_vehicle_ids?.length).toBeGreaterThan(1);
      expect(rule?.action.allocation_method).toBe("equal_split");
    }
  });
});

describe("Expenses V1 — receipt inbox", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("adds a receipt inbox item (unmatched state)", () => {
    act(() => {
      result.current.addReceiptInboxItem({
        file_name: "test.jpg",
        file_url: "/receipts/test.jpg",
        amount: 25,
        merchant: "Test Merchant",
      });
    });
    const item = result.current.receiptInbox.find(
      (i) => i.file_name === "test.jpg",
    );
    expect(item).toBeDefined();
    expect(item?.state).toBe("unmatched");
    expect(item?.matched_expense_id).toBeNull();
  });

  it("matches a receipt to an existing expense (single file, no duplicate)", () => {
    const before = result.current.expenseReceipts.length;
    act(() => {
      const id = result.current.addReceiptInboxItem({
        file_name: "match-test.jpg",
        file_url: "/receipts/match-test.jpg",
        amount: 50,
      });
      result.current.matchReceiptToExpense(id, "exp_1");
    });
    expect(result.current.expenseReceipts.length).toBe(before + 1);
    const item = result.current.receiptInbox.find(
      (i) => i.file_name === "match-test.jpg",
    );
    expect(item?.state).toBe("matched");
    expect(item?.matched_expense_id).toBe("exp_1");
    // The expense receipt_status should flip to attached.
    const exp = result.current.expenses.find((e) => e.id === "exp_1");
    expect(exp?.receipt_status).toBe("attached");
  });

  it("creates an expense from a receipt (links the file)", () => {
    act(() => {
      const id = result.current.addReceiptInboxItem({
        file_name: "create-test.jpg",
        file_url: "/receipts/create-test.jpg",
        amount: 75,
      });
      result.current.createExpenseFromReceipt(id, {
        description: "Test expense from receipt",
        amount: 75,
        transaction_date: "2026-09-05",
        expense_category_id: "ec_parts",
        payment_method: "credit_card",
      });
    });
    const item = result.current.receiptInbox.find(
      (i) => i.file_name === "create-test.jpg",
    );
    expect(item?.state).toBe("matched");
    expect(item?.matched_expense_id).toBeTruthy();
    // The created expense exists and has a receipt attached.
    const exp = result.current.expenses.find(
      (e) => e.id === item?.matched_expense_id,
    );
    expect(exp?.receipt_status).toBe("attached");
  });

  it("marks a receipt missing info / needs review", () => {
    act(() => {
      const id = result.current.addReceiptInboxItem({
        file_name: "flag-test.jpg",
        file_url: "/receipts/flag-test.jpg",
      });
      result.current.markReceiptInboxMissingInfo(id);
    });
    let item = result.current.receiptInbox.find(
      (i) => i.file_name === "flag-test.jpg",
    );
    expect(item?.state).toBe("missing_info");
    act(() => {
      result.current.markReceiptInboxNeedsReview(item!.id);
    });
    item = result.current.receiptInbox.find(
      (i) => i.file_name === "flag-test.jpg",
    );
    expect(item?.state).toBe("needs_review");
  });

  it("groups inbox items by month_key", () => {
    const months = new Set(result.current.receiptInbox.map((i) => i.month_key));
    expect(months.has("2026-09")).toBe(true);
    expect(months.has("2026-08")).toBe(true);
  });
});

describe("Expenses V1 — reimbursements", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("seeded reimbursement starts as owed", () => {
    const rmb = result.current.expenseReimbursements.find(
      (r) => r.id === "rmb_1",
    );
    expect(rmb?.status).toBe("owed");
  });

  it("approves an owed reimbursement", () => {
    act(() => {
      result.current.approveReimbursement("rmb_1");
    });
    expect(
      result.current.expenseReimbursements.find((r) => r.id === "rmb_1")
        ?.status,
    ).toBe("approved");
  });

  it("marks an approved reimbursement as paid", () => {
    act(() => {
      result.current.approveReimbursement("rmb_1");
      result.current.markReimbursementPaid("rmb_1", "ach");
    });
    const rmb = result.current.expenseReimbursements.find(
      (r) => r.id === "rmb_1",
    );
    expect(rmb?.status).toBe("paid");
    expect(rmb?.paid_at).toBeTruthy();
  });
});

describe("Expenses V1 — recurring expenses", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("seeds recurring templates including a vehicle car note", () => {
    const rec = result.current.recurringExpenses.find((r) => r.id === "rec_1");
    expect(rec?.name).toContain("Jeep Wrangler");
    expect(rec?.vehicle_id).toBe("veh_4");
    expect(rec?.category_id).toBe("ec_car_note");
  });

  it("generates a one-off expense from a recurring template", () => {
    const before = result.current.expenses.length;
    act(() => {
      result.current.generateRecurringExpense("rec_1");
    });
    expect(result.current.expenses.length).toBe(before + 1);
  });

  it("does not generate from an inactive template", () => {
    act(() => {
      result.current.updateRecurringExpense("rec_1", { active: false });
    });
    const before = result.current.expenses.length;
    act(() => {
      const id = result.current.generateRecurringExpense("rec_1");
      expect(id).toBeNull();
    });
    expect(result.current.expenses.length).toBe(before);
  });

  it("adds and deletes a recurring template", () => {
    act(() => {
      result.current.addRecurringExpense({
        id: "rec_test",
        tenant_id: "tnt_connectpro",
        name: "Test recurring",
        amount: 100,
        vendor_id: null,
        category_id: "ec_fuel",
        scope: "vehicle",
        vehicle_id: "veh_1",
        vehicle_ids: null,
        allocation_method: null,
        frequency: "monthly",
        start_date: "2026-01-01",
        end_date: null,
        receipt_required: false,
        auto_create: false,
        active: true,
        last_generated_at: null,
        created_at: new Date().toISOString(),
      });
    });
    expect(
      result.current.recurringExpenses.some((r) => r.id === "rec_test"),
    ).toBe(true);
    act(() => {
      result.current.deleteRecurringExpense("rec_test");
    });
    expect(
      result.current.recurringExpenses.some((r) => r.id === "rec_test"),
    ).toBe(false);
  });
});

describe("Expenses V1 — spend alerts + budgets", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("seeds spend alerts", () => {
    expect(result.current.spendAlerts.length).toBeGreaterThan(0);
    expect(
      result.current.spendAlerts.some((a) => a.metric === "single_expense"),
    ).toBe(true);
  });

  it("adds and deletes a spend alert", () => {
    act(() => {
      result.current.addSpendAlert({
        id: "sa_test",
        tenant_id: "tnt_connectpro",
        name: "Test alert",
        metric: "single_expense",
        threshold: 500,
        category_id: null,
        active: true,
        created_at: new Date().toISOString(),
      });
    });
    expect(result.current.spendAlerts.some((a) => a.id === "sa_test")).toBe(
      true,
    );
    act(() => {
      result.current.deleteSpendAlert("sa_test");
    });
    expect(result.current.spendAlerts.some((a) => a.id === "sa_test")).toBe(
      false,
    );
  });

  it("sets a category budget (upsert)", () => {
    act(() => {
      result.current.setCategoryBudget("ec_maint", "2026-09", 2500);
    });
    const b = result.current.categoryBudgets.find(
      (x) => x.category_id === "ec_maint" && x.month_key === "2026-09",
    );
    expect(b?.budget_amount).toBe(2500);
  });

  it("updates an existing category budget rather than duplicating", () => {
    act(() => {
      result.current.setCategoryBudget("ec_fuel", "2026-09", 900);
    });
    const fuel = result.current.categoryBudgets.filter(
      (x) => x.category_id === "ec_fuel" && x.month_key === "2026-09",
    );
    expect(fuel).toHaveLength(1);
    expect(fuel[0].budget_amount).toBe(900);
  });
});

describe("Expenses V1 — duplicate detection + Vehicle Performance compatibility", () => {
  let result: ReturnType<typeof useHooks>;
  beforeEach(() => {
    result = useHooks();
  });

  it("detects a likely duplicate expense (same amount/date/vendor/vehicle)", () => {
    const dup = isLikelyDuplicate(result.current.expenses, {
      amount: 612,
      transaction_date: "2026-07-15",
      vendor_id: "vnv_2",
      vehicle_id: "veh_4",
      maintenance_work_order_id: "wo_4",
    });
    expect(dup).toBe(true);
  });

  it("does not flag a unique expense as duplicate", () => {
    const dup = isLikelyDuplicate(result.current.expenses, {
      amount: 9999,
      transaction_date: "2026-12-31",
      vendor_id: null,
      vehicle_id: null,
      maintenance_work_order_id: null,
    });
    expect(dup).toBe(false);
  });

  it("Vehicle Performance compatibility: vehicle expenses flow through allocationState", () => {
    const vehExp = result.current.expenses.find((e) => e.id === "exp_1");
    expect(vehExp?.vehicle_id).toBe("veh_4");
    expect(allocationState(vehExp!, false)).toBe("fully_allocated");
  });

  it("reversal expenses net out in totals (no double count)", () => {
    const detail = result.current.expenses.filter(
      (e) => e.id === "exp_7" || e.id === "exp_8",
    );
    expect(netExpenseTotal(detail)).toBe(0); // 75 - 75
    expect(isReversal(detail[1])).toBe(true);
  });

  it("unallocated expenses are identifiable for Action Center", () => {
    const lineItemIds = new Set(
      result.current.expenseLineItems.map((l) => l.expense_id),
    );
    const unalloc = getUnallocatedExpenses(
      result.current.expenses,
      lineItemIds,
    );
    // Seeded expenses all have categories/vehicles, so unallocated is empty.
    expect(unalloc.every((e) => !e.vehicle_id && !e.expense_category_id)).toBe(
      true,
    );
  });
});
