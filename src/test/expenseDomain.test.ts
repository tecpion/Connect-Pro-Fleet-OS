// Connect Pro Fleet — Accounting Expense Ledger domain tests (Build #14).
// Pure selector tests: numbering, net totals, reversals, double-count
// prevention (maintenance vs direct), splits, cash, reimbursements, petty
// cash balance, missing receipts, search, payment-method grouping.

import { describe, it, expect } from "vitest";
import type {
  ExpenseTransaction,
  ExpenseLineItem,
  ExpenseCategory,
  ExpenseReceipt,
  ExpenseReimbursement,
  CashAccount,
  CashEntry,
} from "../lib/expenseTypes";
import {
  nextExpenseNumber,
  effectiveAmount,
  isReversal,
  netExpenseTotal,
  getVehicleExpenses,
  getCompanyOverheadExpenses,
  getExpensesByCategory,
  getExpensesByPaymentMethod,
  getExpensesByVendor,
  getCashExpenses,
  getExpensesMissingReceipts,
  getOutstandingReimbursementTotal,
  getMonthlyExpenses,
  getVehicleDirectExpenseTotal,
  getVehicleMaintenanceExpenseTotal,
  getCashAccountBalance,
  searchExpenses,
  validateLineItems,
  isLikelyDuplicate,
  lineItemsFor,
  reimbursementFor,
} from "../lib/expenseSelectors";
import {
  normalizePaymentMethod,
  toLegacyPaymentMethod,
  tenderLabel,
} from "../lib/paymentMethodTypes";

const TENANT = "tnt_1";

function exp(over: Partial<ExpenseTransaction>): ExpenseTransaction {
  return {
    id: "exp_1",
    tenant_id: TENANT,
    expense_number: "EXP-2026-000001",
    transaction_date: "2026-08-01",
    entered_at: "2026-08-01T09:00:00Z",
    entered_by_user_id: null,
    description: "Test expense",
    memo: null,
    amount: 100,
    currency: "USD",
    expense_category_id: null,
    vendor_id: null,
    payment_method: "credit_card",
    payment_source: null,
    processor: null,
    paid_by_type: "company",
    paid_by_user_id: null,
    reimbursement_status: "not_required",
    location_id: null,
    vehicle_id: null,
    rental_id: null,
    maintenance_work_order_id: null,
    receipt_status: "missing",
    receipt_required: false,
    no_receipt_reason: null,
    status: "posted",
    reversal_of: null,
    source: "manual",
    dedupe_key: null,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...over,
  };
}

describe("expense numbering", () => {
  it("generates the next EXP-YYYY-000000 number", () => {
    expect(nextExpenseNumber([])).toMatch(/^EXP-\d{4}-000001$/);
    expect(
      nextExpenseNumber([exp({ expense_number: "EXP-2026-000005" })]),
    ).toMatch(/000006$/);
  });
});

describe("expense totals + reversals", () => {
  it("netExpenseTotal sums posted originals and subtracts reversals", () => {
    const list = [
      exp({ id: "a", amount: 200 }),
      exp({ id: "b", amount: 50, reversal_of: "a" }),
      exp({ id: "c", amount: 30, status: "voided" }),
    ];
    expect(netExpenseTotal(list)).toBe(200 - 50);
  });
  it("effectiveAmount is 0 for voided, full for posted", () => {
    expect(effectiveAmount(exp({ status: "voided" }))).toBe(0);
    expect(effectiveAmount(exp({ status: "posted", amount: 75 }))).toBe(75);
  });
  it("isReversal detects reversal_of", () => {
    expect(isReversal(exp({ reversal_of: "x" }))).toBe(true);
    expect(isReversal(exp({ reversal_of: null }))).toBe(false);
  });
});

describe("double-count prevention", () => {
  it("getVehicleDirectExpenseTotal excludes maintenance-sourced expenses", () => {
    const list = [
      exp({ id: "d1", vehicle_id: "veh_1", amount: 100, source: "manual" }),
      exp({
        id: "d2",
        vehicle_id: "veh_1",
        amount: 500,
        source: "maintenance_work_order",
        maintenance_work_order_id: "wo_1",
      }),
    ];
    expect(getVehicleDirectExpenseTotal(list, [], "veh_1")).toBe(100);
  });
  it("getVehicleMaintenanceExpenseTotal counts only WO-sourced for the vehicle", () => {
    const woVehicle = (woId: string) =>
      woId === "wo_1" ? "veh_1" : woId === "wo_2" ? "veh_2" : null;
    const list = [
      exp({
        id: "m1",
        amount: 500,
        source: "maintenance_work_order",
        maintenance_work_order_id: "wo_1",
      }),
      exp({
        id: "m2",
        amount: 300,
        source: "maintenance_work_order",
        maintenance_work_order_id: "wo_2",
      }),
    ];
    expect(getVehicleMaintenanceExpenseTotal(list, woVehicle, "veh_1")).toBe(
      500,
    );
    expect(getVehicleMaintenanceExpenseTotal(list, woVehicle, "veh_2")).toBe(
      300,
    );
  });
  it("a repair is counted once across direct + maintenance paths", () => {
    const list = [
      exp({
        id: "x",
        vehicle_id: "veh_1",
        amount: 500,
        source: "maintenance_work_order",
        maintenance_work_order_id: "wo_1",
      }),
    ];
    const woVehicle = () => "veh_1";
    const direct = getVehicleDirectExpenseTotal(list, [], "veh_1");
    const maint = getVehicleMaintenanceExpenseTotal(list, woVehicle, "veh_1");
    expect(direct).toBe(0);
    expect(maint).toBe(500);
    expect(direct + maint).toBe(500);
  });
});

describe("splits", () => {
  it("validateLineItems checks sum equals expense amount", () => {
    const items: ExpenseLineItem[] = [
      {
        id: "l1",
        expense_id: "e1",
        description: "a",
        category_id: null,
        amount: 250,
        vehicle_id: "v1",
        work_order_id: null,
        notes: null,
      },
      {
        id: "l2",
        expense_id: "e1",
        description: "b",
        category_id: null,
        amount: 150,
        vehicle_id: "v2",
        work_order_id: null,
        notes: null,
      },
      {
        id: "l3",
        expense_id: "e1",
        description: "c",
        category_id: null,
        amount: 100,
        vehicle_id: null,
        work_order_id: null,
        notes: null,
      },
    ];
    expect(validateLineItems(items, 500)).toBe(true);
    expect(validateLineItems(items, 499)).toBe(false);
  });
  it("getVehicleExpenses includes line-item-allocated vehicles", () => {
    const list = [exp({ id: "e1", vehicle_id: null, amount: 500 })];
    const items: ExpenseLineItem[] = [
      {
        id: "l1",
        expense_id: "e1",
        description: "a",
        category_id: null,
        amount: 250,
        vehicle_id: "veh_1",
        work_order_id: null,
        notes: null,
      },
    ];
    expect(getVehicleExpenses(list, items, "veh_1")).toHaveLength(1);
  });
});

describe("cash + overhead", () => {
  it("getCashExpenses filters cash payment method", () => {
    const list = [
      exp({ id: "c1", payment_method: "cash" }),
      exp({ id: "c2", payment_method: "credit_card" }),
    ];
    expect(getCashExpenses(list)).toHaveLength(1);
  });
  it("getCompanyOverheadExpenses excludes vehicle + WO expenses", () => {
    const list = [
      exp({ id: "o1", vehicle_id: null, maintenance_work_order_id: null }),
      exp({ id: "o2", vehicle_id: "veh_1" }),
      exp({ id: "o3", maintenance_work_order_id: "wo_1" }),
    ];
    expect(getCompanyOverheadExpenses(list)).toHaveLength(1);
  });
});

describe("reimbursements", () => {
  it("getOutstandingReimbursementTotal sums owed + approved", () => {
    const rmbs: ExpenseReimbursement[] = [
      {
        id: "r1",
        tenant_id: TENANT,
        expense_id: "e1",
        payee_type: "employee",
        payee_user_id: null,
        amount: 42,
        status: "owed",
        requested_at: null,
        approved_at: null,
        paid_at: null,
        payment_method: null,
        notes: null,
        created_at: "",
      },
      {
        id: "r2",
        tenant_id: TENANT,
        expense_id: "e2",
        payee_type: "employee",
        payee_user_id: null,
        amount: 50,
        status: "approved",
        requested_at: null,
        approved_at: null,
        paid_at: null,
        payment_method: null,
        notes: null,
        created_at: "",
      },
      {
        id: "r3",
        tenant_id: TENANT,
        expense_id: "e3",
        payee_type: "employee",
        payee_user_id: null,
        amount: 30,
        status: "paid",
        requested_at: null,
        approved_at: null,
        paid_at: null,
        payment_method: null,
        notes: null,
        created_at: "",
      },
    ];
    expect(getOutstandingReimbursementTotal(rmbs)).toBe(92);
  });
  it("reimbursementFor returns the latest reimbursement for an expense", () => {
    const rmbs: ExpenseReimbursement[] = [
      {
        id: "r1",
        tenant_id: TENANT,
        expense_id: "e1",
        payee_type: "employee",
        payee_user_id: null,
        amount: 42,
        status: "owed",
        requested_at: null,
        approved_at: null,
        paid_at: null,
        payment_method: null,
        notes: null,
        created_at: "2026-01-01",
      },
      {
        id: "r2",
        tenant_id: TENANT,
        expense_id: "e1",
        payee_type: "employee",
        payee_user_id: null,
        amount: 42,
        status: "paid",
        requested_at: null,
        approved_at: null,
        paid_at: null,
        payment_method: null,
        notes: null,
        created_at: "2026-01-02",
      },
    ];
    expect(reimbursementFor(rmbs, "e1")?.status).toBe("paid");
  });
});

describe("petty cash", () => {
  it("getCashAccountBalance computes opening + in - out", () => {
    const acct: CashAccount = {
      id: "c1",
      tenant_id: TENANT,
      name: "Petty",
      location_id: null,
      opening_balance: 300,
      active: true,
      created_at: "",
    };
    const entries: CashEntry[] = [
      {
        id: "ce1",
        tenant_id: TENANT,
        cash_account_id: "c1",
        entry_type: "cash_out",
        amount: 28,
        expense_id: "e1",
        description: "",
        entered_by_user_id: null,
        created_at: "",
      },
      {
        id: "ce2",
        tenant_id: TENANT,
        cash_account_id: "c1",
        entry_type: "cash_in",
        amount: 100,
        expense_id: null,
        description: "",
        entered_by_user_id: null,
        created_at: "",
      },
    ];
    expect(getCashAccountBalance(acct, entries)).toBe(300 - 28 + 100);
  });
});

describe("missing receipts", () => {
  it("flags posted expenses requiring a receipt with none attached", () => {
    const list = [
      exp({ id: "m1", receipt_required: true, receipt_status: "missing" }),
      exp({ id: "m2", receipt_required: false, receipt_status: "missing" }),
    ];
    const receipts: ExpenseReceipt[] = [];
    expect(getExpensesMissingReceipts(list, receipts)).toHaveLength(1);
  });
  it("excludes expenses with an active receipt", () => {
    const list = [
      exp({ id: "m1", receipt_required: true, receipt_status: "missing" }),
    ];
    const receipts: ExpenseReceipt[] = [
      {
        id: "r1",
        tenant_id: TENANT,
        expense_id: "m1",
        file_name: "x.pdf",
        file_url: "",
        mime_type: null,
        uploaded_by: null,
        uploaded_at: "",
        note: null,
        voided_at: null,
      },
    ];
    expect(getExpensesMissingReceipts(list, receipts)).toHaveLength(0);
  });
});

describe("monthly + grouping", () => {
  it("getMonthlyExpenses uses transaction_date", () => {
    const list = [
      exp({ id: "a", transaction_date: "2026-08-15", amount: 100 }),
      exp({ id: "b", transaction_date: "2026-07-15", amount: 200 }),
    ];
    expect(getMonthlyExpenses(list, "2026-08")).toBe(100);
  });
  it("getExpensesByCategory groups net amounts", () => {
    const cats: ExpenseCategory[] = [
      {
        id: "c1",
        tenant_id: TENANT,
        name: "Fuel",
        type: "vehicle_direct",
        parent_category_id: null,
        active: true,
        created_at: "",
      },
    ];
    const list = [
      exp({ id: "a", expense_category_id: "c1", amount: 100 }),
      exp({ id: "b", expense_category_id: "c1", amount: 30, reversal_of: "a" }),
    ];
    const grouped = getExpensesByCategory(list, cats);
    expect(grouped[0].total).toBe(70);
  });
  it("getExpensesByPaymentMethod groups by tender", () => {
    const list = [
      exp({ id: "a", payment_method: "cash", amount: 50 }),
      exp({ id: "b", payment_method: "cash", amount: 50 }),
      exp({ id: "c", payment_method: "credit_card", amount: 100 }),
    ];
    const grouped = getExpensesByPaymentMethod(list);
    const cash = grouped.find((g) => g.method === "cash");
    expect(cash?.total).toBe(100);
    expect(cash?.count).toBe(2);
  });
});

describe("duplicate detection", () => {
  it("isLikelyDuplicate warns on same amount/date/vendor/vehicle", () => {
    const existing = [
      exp({
        id: "a",
        amount: 50,
        transaction_date: "2026-08-01",
        vendor_id: "v1",
        vehicle_id: "veh_1",
        maintenance_work_order_id: null,
      }),
    ];
    expect(
      isLikelyDuplicate(existing, {
        amount: 50,
        transaction_date: "2026-08-01",
        vendor_id: "v1",
        vehicle_id: "veh_1",
        maintenance_work_order_id: null,
      }),
    ).toBe(true);
    expect(
      isLikelyDuplicate(
        existing,
        {
          amount: 50,
          transaction_date: "2026-08-01",
          vendor_id: "v1",
          vehicle_id: "veh_1",
          maintenance_work_order_id: null,
        },
        "a",
      ),
    ).toBe(false);
  });
});

describe("payment method standardization", () => {
  it("normalizePaymentMethod maps legacy card to credit_card", () => {
    expect(normalizePaymentMethod("card")).toBe("credit_card");
    expect(normalizePaymentMethod("cashapp")).toBe("cash_app");
    expect(normalizePaymentMethod("external")).toBe("bank_transfer");
    expect(normalizePaymentMethod("ach")).toBe("ach");
  });
  it("toLegacyPaymentMethod maps canonical back to rental ledger values", () => {
    expect(toLegacyPaymentMethod("credit_card")).toBe("card");
    expect(toLegacyPaymentMethod("cash_app")).toBe("cashapp");
    expect(toLegacyPaymentMethod("venmo")).toBe("external");
    expect(toLegacyPaymentMethod("cash")).toBe("cash");
  });
  it("tenderLabel resolves a human label for any value", () => {
    expect(tenderLabel("card")).toBe("Credit Card");
    expect(tenderLabel("cashapp")).toBe("Cash App");
    expect(tenderLabel(null)).toBe("Other");
  });
});

describe("search", () => {
  it("searchExpenses matches number + description + vendor", () => {
    const list = [
      exp({ id: "a", expense_number: "EXP-2026-000001", description: "Fuel" }),
      exp({ id: "b", expense_number: "EXP-2026-000002", description: "Rent" }),
    ];
    const vendorName = () => "AutoZone";
    const vehicleLabel = () => "—";
    expect(searchExpenses(list, vendorName, vehicleLabel, "fuel")).toHaveLength(
      1,
    );
    expect(
      searchExpenses(list, vendorName, vehicleLabel, "autozone"),
    ).toHaveLength(2);
  });
});
