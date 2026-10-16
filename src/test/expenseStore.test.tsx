// Connect Pro Fleet — Build #14 expense store integration tests.
//
// Exercises the expense store through the real StoreProvider: creation,
// numbering, split validation, reversal (no double-reverse), reimbursement
// (no second expense), petty cash link, maintenance work-order sync
// (idempotent, no double-count), financial non-interference (expenses never
// touch the rental ledger), and tenant isolation.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import {
  netExpenseTotal,
  getVehicleDirectExpenseTotal,
  getVehicleMaintenanceExpenseTotal,
  getOutstandingReimbursementTotal,
  getCashAccountBalance,
} from "@/lib/expenseSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

describe("expense creation + numbering", () => {
  it("creates an expense with a readable EXP number", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "Fuel top-off",
        amount: 45,
        transaction_date: "2026-08-20",
        payment_method: "credit_card",
        vehicle_id: "veh_1",
      });
    });
    const e = r.current.expenseById(id);
    expect(e).toBeDefined();
    expect(e!.expense_number).toMatch(/^EXP-\d{4}-\d{6}$/);
    expect(e!.status).toBe("posted");
    expect(e!.source).toBe("manual");
  });

  it("rapid creation gets unique numbers", () => {
    const r = useStoreHook();
    const ids: string[] = [];
    act(() => {
      ids.push(
        r.current.createExpense({
          description: "a",
          amount: 1,
          transaction_date: "2026-08-20",
          payment_method: "cash",
        }),
      );
      ids.push(
        r.current.createExpense({
          description: "b",
          amount: 2,
          transaction_date: "2026-08-20",
          payment_method: "cash",
        }),
      );
    });
    const e1 = r.current.expenseById(ids[0]);
    const e2 = r.current.expenseById(ids[1]);
    expect(e1!.expense_number).not.toBe(e2!.expense_number);
  });
});

describe("reversals", () => {
  it("reverseExpense creates a linked reversal and prevents double reversal", () => {
    const r = useStoreHook();
    let id = "";
    let revId: string | null = "";
    act(() => {
      id = r.current.createExpense({
        description: "Wrong charge",
        amount: 75,
        transaction_date: "2026-08-10",
        payment_method: "credit_card",
      });
    });
    act(() => {
      revId = r.current.reverseExpense(id, "Entered in error");
    });
    expect(revId).toBeTruthy();
    const rev = r.current.expenseById(revId!);
    expect(rev!.reversal_of).toBe(id);
    // Double reversal of the reversal is blocked.
    let second: string | null = "";
    act(() => {
      second = r.current.reverseExpense(revId!, "again");
    });
    expect(second).toBeNull();
  });

  it("net total nets out the reversal", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "x",
        amount: 100,
        transaction_date: "2026-08-10",
        payment_method: "credit_card",
      });
    });
    act(() => {
      r.current.reverseExpense(id, "reverse");
    });
    expect(
      netExpenseTotal(
        r.current.expenses.filter((e) => e.id === id || e.reversal_of === id),
      ),
    ).toBe(0);
  });
});

describe("reimbursements", () => {
  it("employee-paid expense creates a reimbursement owed (no second expense)", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "Fuel — employee paid",
        amount: 42,
        transaction_date: "2026-08-20",
        payment_method: "credit_card",
        paid_by_type: "employee",
        create_reimbursement: true,
      });
    });
    const rmb = r.current.expenseReimbursement(id);
    expect(rmb).toBeDefined();
    expect(rmb!.status).toBe("owed");
    expect(rmb!.amount).toBe(42);
    // Only ONE expense exists for this.
    expect(r.current.expenses.filter((e) => e.id === id)).toHaveLength(1);
  });

  it("marking reimbursement paid does not create a second expense", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "Fuel",
        amount: 42,
        transaction_date: "2026-08-20",
        payment_method: "credit_card",
        paid_by_type: "employee",
        create_reimbursement: true,
      });
    });
    const rmbId = r.current.expenseReimbursement(id)!.id;
    const before = r.current.expenses.length;
    act(() => {
      r.current.markReimbursementPaid(rmbId, "ach");
    });
    expect(r.current.expenses.length).toBe(before);
    const rmb = r.current.expenseReimbursement(id);
    expect(rmb!.status).toBe("paid");
    // The test's reimbursement is no longer outstanding (seeded reimbursements
    // may still be owed — we only assert this expense's reimbursement cleared).
    expect(
      getOutstandingReimbursementTotal(
        r.current.expenseReimbursements.filter((x) => x.expense_id === id),
      ),
    ).toBe(0);
  });
});

describe("petty cash", () => {
  it("cash expense with cash_account_id links a cash_out entry", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "Plug kit",
        amount: 28,
        transaction_date: "2026-08-12",
        payment_method: "cash",
        cash_account_id: "cash_1",
      });
    });
    const entries = r.current.cashAccountEntries("cash_1");
    const linked = entries.find((e) => e.expense_id === id);
    expect(linked).toBeDefined();
    expect(linked!.entry_type).toBe("cash_out");
    // The expense is counted once — the cash entry does not duplicate it.
    expect(r.current.expenses.filter((e) => e.id === id)).toHaveLength(1);
  });

  it("petty cash balance reflects cash_out", () => {
    const r = useStoreHook();
    const acct = r.current.cashAccountById("cash_1")!;
    const before = getCashAccountBalance(acct, r.current.cashEntries);
    act(() => {
      r.current.createExpense({
        description: "Supplies",
        amount: 20,
        transaction_date: "2026-08-20",
        payment_method: "cash",
        cash_account_id: "cash_1",
      });
    });
    const after = getCashAccountBalance(acct, r.current.cashEntries);
    expect(after).toBe(before - 20);
  });
});

describe("maintenance work-order expense sync (no double-count)", () => {
  it("completing a work order generates exactly one linked expense", () => {
    const r = useStoreHook();
    let woId = "";
    act(() => {
      woId = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brake repair",
        maintenance_type: "brakes",
        blocks_vehicle_use: true,
      });
      r.current.startWorkOrder(woId);
    });
    const before = r.current.expenses.length;
    act(() => {
      r.current.completeWorkOrder({
        id: woId,
        work_performed: "Replaced pads",
        actual_cost: 450,
        labor_cost: 150,
        parts_cost: 280,
        tax_cost: 20,
      });
    });
    expect(r.current.expenses.length).toBe(before + 1);
    const woExpense = r.current.expenses.find(
      (e) => e.maintenance_work_order_id === woId,
    );
    expect(woExpense).toBeDefined();
    expect(woExpense!.source).toBe("maintenance_work_order");
    expect(woExpense!.amount).toBe(450);
    expect(woExpense!.dedupe_key).toBe(`wo:${woId}`);
  });

  it("re-running sync is idempotent (no duplicate expense)", () => {
    const r = useStoreHook();
    let woId = "";
    act(() => {
      woId = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Oil change",
        maintenance_type: "oil_change",
      });
      r.current.startWorkOrder(woId);
      r.current.completeWorkOrder({ id: woId, actual_cost: 89 });
    });
    const before = r.current.expenses.filter(
      (e) => e.maintenance_work_order_id === woId,
    ).length;
    act(() => {
      r.current.syncWorkOrderExpense(woId);
    });
    const after = r.current.expenses.filter(
      (e) => e.maintenance_work_order_id === woId,
    ).length;
    expect(after).toBe(before);
  });

  it("maintenance cost is counted once across direct + maintenance paths", () => {
    const r = useStoreHook();
    let woId = "";
    // Use a vehicle with NO seeded direct expenses (veh_5) so the direct path
    // is a clean 0 baseline — isolating the maintenance-WO double-count guard.
    // (veh_2 now carries seeded tow/detailing direct expenses for Case Center,
    // which would mask the assertion.)
    const VEHICLE = "veh_5";
    act(() => {
      woId = r.current.createWorkOrder({
        vehicle_id: VEHICLE,
        title: "Tires",
        maintenance_type: "tires",
      });
    });
    act(() => {
      r.current.startWorkOrder(woId);
    });
    act(() => {
      r.current.completeWorkOrder({ id: woId, actual_cost: 600 });
    });
    const woVehicle = (id: string | null) =>
      r.current.workOrders.find((w) => w.id === id)?.vehicle_id ?? null;
    const direct = getVehicleDirectExpenseTotal(
      r.current.expenses,
      r.current.expenseLineItems,
      VEHICLE,
    );
    const maint = getVehicleMaintenanceExpenseTotal(
      r.current.expenses,
      woVehicle,
      VEHICLE,
    );
    // The WO expense is NOT counted in direct (excluded by source).
    expect(direct).toBe(0);
    expect(maint).toBe(600);
    expect(direct + maint).toBe(600);
  });
});

describe("financial non-interference", () => {
  it("creating an expense changes zero rental ledger transactions", () => {
    const r = useStoreHook();
    const before = r.current.transactions.length;
    act(() => {
      r.current.createExpense({
        description: "Office rent",
        amount: 2400,
        transaction_date: "2026-08-01",
        payment_method: "ach",
      });
    });
    expect(r.current.transactions.length).toBe(before);
  });

  it("reversing an expense changes zero rental ledger transactions", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "x",
        amount: 50,
        transaction_date: "2026-08-01",
        payment_method: "cash",
      });
    });
    const before = r.current.transactions.length;
    act(() => {
      r.current.reverseExpense(id, "wrong");
    });
    expect(r.current.transactions.length).toBe(before);
  });

  it("reimbursement payment changes zero rental ledger transactions", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createExpense({
        description: "x",
        amount: 42,
        transaction_date: "2026-08-01",
        payment_method: "credit_card",
        paid_by_type: "employee",
        create_reimbursement: true,
      });
    });
    const rmbId = r.current.expenseReimbursement(id)!.id;
    const before = r.current.transactions.length;
    act(() => {
      r.current.markReimbursementPaid(rmbId, "ach");
    });
    expect(r.current.transactions.length).toBe(before);
  });
});

describe("tenant isolation", () => {
  it("all seeded expenses are tenant-scoped", () => {
    const r = useStoreHook();
    expect(r.current.expenses.every((e) => e.tenant_id)).toBe(true);
    expect(r.current.expenseCategories.every((c) => c.tenant_id)).toBe(true);
    expect(r.current.cashAccounts.every((c) => c.tenant_id)).toBe(true);
  });
});
