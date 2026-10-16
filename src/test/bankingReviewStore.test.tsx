// Connect Pro Fleet — Banking review store integration tests (Build #42).
//
// Exercises the match-first workflow through the real StoreProvider. Verifies:
//  - matching an existing expense creates NO duplicate expense
//  - create-expense-from-import creates exactly one + auto-matches
//  - transfers excluded from revenue/expense totals
//  - ignore retains the original record
//  - unmatch restores state without deleting the payment
//  - reviewed vs matched vs reconciled distinction
//  - imported activity changes zero rental ledger transactions
//  - tenant scoping
//  - KPI summary + statement attention composition

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import {
  getBankingKpiSummary,
  getMatchedTabRows,
  getStatementAttention,
} from "@/lib/bankingAttention";
import { netExpenseTotal } from "@/lib/expenseSelectors";
import { getTotalCollections } from "@/lib/collectionSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

const MAP = {
  Date: "date",
  Description: "description",
  Amount: "amount",
} as const;

describe("banking review — match-existing prevents duplicate", () => {
  it("confirming a match to an existing expense creates no new expense", () => {
    const r = useStoreHook();
    // Create a fresh unreconciled expense first.
    act(() => {
      r.current.importCsv({
        accountId: "fac_2",
        csvText: "Date,Description,Amount\n2026-09-01,FIRST AUTOZONE,-612.00",
        mapping: MAP,
        fileName: "first.csv",
      });
    });
    const firstTxn = r.current.importedTransactions.find(
      (t) => t.description === "FIRST AUTOZONE",
    );
    let firstExpenseId: string | null = null;
    act(() => {
      firstExpenseId = r.current.createExpenseFromImport({
        importedTransactionId: firstTxn!.id,
        description: "First AutoZone parts",
        expense_category_id: r.current.expenseCategories[0]?.id ?? null,
      });
    });
    expect(firstExpenseId).toBeTruthy();
    // Unmatch so the expense is available to match against.
    const firstMatches = r.current.matchesForImport(firstTxn!.id);
    if (firstMatches.length > 0) {
      act(() => r.current.unmatch(firstMatches[0].id));
    }

    // Import a second transaction with the same amount.
    act(() => {
      r.current.importCsv({
        accountId: "fac_2",
        csvText: "Date,Description,Amount\n2026-09-02,SECOND AUTOZONE,-612.00",
        mapping: MAP,
        fileName: "second.csv",
      });
    });
    const secondTxn = r.current.importedTransactions.find(
      (t) => t.description === "SECOND AUTOZONE",
    );
    const beforeExpenses = r.current.expenses.length;

    // Match the second import to the EXISTING expense (not create new).
    act(() => {
      r.current.confirmMatch({
        importedTransactionId: secondTxn!.id,
        target_type: "expense",
        target_id: firstExpenseId!,
        allocated_amount: 612,
      });
    });
    expect(r.current.expenses.length).toBe(beforeExpenses);
    const imp = r.current.importedTransactionById(secondTxn!.id);
    expect(imp!.match_status).toBe("matched");
  });
});

describe("banking review — create-new creates exactly one", () => {
  it("creates exactly one expense and auto-matches it", () => {
    const r = useStoreHook();
    const before = r.current.expenses.length;
    act(() => {
      r.current.importCsv({
        accountId: "fac_2",
        csvText: "Date,Description,Amount\n2026-09-05,NEW VENDOR TEST,-42.99",
        mapping: MAP,
        fileName: "create.csv",
      });
    });
    const txn = r.current.importedTransactions.find(
      (t) => t.description === "NEW VENDOR TEST",
    );
    let expenseId: string | null = null;
    act(() => {
      expenseId = r.current.createExpenseFromImport({
        importedTransactionId: txn!.id,
        description: "Test supplies",
        expense_category_id: r.current.expenseCategories[0]?.id ?? null,
      });
    });
    expect(expenseId).toBeTruthy();
    expect(r.current.expenses.length).toBe(before + 1);
    expect(r.current.importedTransactionById(txn!.id)!.match_status).toBe(
      "matched",
    );
  });
});

describe("banking review — transfer excluded from totals", () => {
  it("marking a transfer changes zero collections and zero expenses", () => {
    const r = useStoreHook();
    const beforeColl = getTotalCollections(r.current.transactions);
    const beforeExp = netExpenseTotal(r.current.expenses);
    act(() => {
      r.current.importCsv({
        accountId: "fac_1",
        csvText: "Date,Description,Amount\n2026-09-08,TO SAVINGS,-750.00",
        mapping: MAP,
        fileName: "transfer.csv",
      });
    });
    const txn = r.current.importedTransactions.find(
      (t) => t.description === "TO SAVINGS",
    );
    act(() => {
      r.current.markTransfer({
        importedTransactionId: txn!.id,
        counterpartAccountId: "fac_2",
      });
    });
    expect(getTotalCollections(r.current.transactions)).toBe(beforeColl);
    expect(netExpenseTotal(r.current.expenses)).toBe(beforeExp);
    expect(r.current.importedTransactionById(txn!.id)!.transfer_status).toBe(
      "transfer",
    );
  });
});

describe("banking review — ignore retains record", () => {
  it("ignored transaction is retained with ignored status", () => {
    const r = useStoreHook();
    act(() => {
      r.current.importCsv({
        accountId: "fac_1",
        csvText: "Date,Description,Amount\n2026-09-09,PERSONAL TXN,-25.00",
        mapping: MAP,
        fileName: "ignore.csv",
      });
    });
    const txn = r.current.importedTransactions.find(
      (t) => t.description === "PERSONAL TXN",
    );
    const beforeCount = r.current.importedTransactions.length;
    act(() => {
      r.current.ignoreTransaction(txn!.id, "personal");
    });
    expect(r.current.importedTransactions.length).toBe(beforeCount);
    expect(r.current.importedTransactionById(txn!.id)!.review_status).toBe(
      "ignored",
    );
  });
});

describe("banking review — unmatch preserves payment", () => {
  it("unmatch restores unmatched status without deleting the payment", () => {
    const r = useStoreHook();
    const matches = r.current.matchesForImport("itxn_1");
    expect(matches.length).toBeGreaterThan(0);
    expect(r.current.transactions.find((t) => t.id === "txn_2")).toBeDefined();
    act(() => {
      r.current.unmatch(matches[0].id, "correcting");
    });
    expect(r.current.importedTransactionById("itxn_1")!.match_status).toBe(
      "unmatched",
    );
    expect(r.current.transactions.find((t) => t.id === "txn_2")).toBeDefined();
  });
});

describe("banking review — reviewed vs matched vs reconciled", () => {
  it("matched-tab rows carry a distinct statement_reconciled flag", () => {
    const r = useStoreHook();
    const rows = getMatchedTabRows(
      r.current.importedTransactions,
      r.current.reconciliationMatches,
      r.current.statements,
      (id) => r.current.financialAccountById(id)?.name ?? null,
      () => null,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.statement_reconciled).toBe("boolean");
    }
  });
});

describe("banking review — KPI + statement attention composition", () => {
  it("KPI summary counts are non-negative", () => {
    const r = useStoreHook();
    const kpi = getBankingKpiSummary(
      r.current.importedTransactions,
      r.current.statements,
    );
    expect(kpi.needs_review).toBeGreaterThanOrEqual(0);
    expect(kpi.matched_count).toBeGreaterThanOrEqual(0);
    expect(kpi.ignored_count).toBeGreaterThanOrEqual(0);
    expect(kpi.transfer_count).toBeGreaterThanOrEqual(0);
    expect(kpi.statements_need_attention).toBeGreaterThanOrEqual(0);
  });

  it("statement attention items always have reasons", () => {
    const r = useStoreHook();
    const attention = getStatementAttention(
      r.current.statements,
      r.current.importedTransactions,
      (id) => r.current.financialAccountById(id)?.name ?? null,
    );
    for (const a of attention) {
      expect(a.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("banking review — financial non-interference + tenant scoping", () => {
  it("importing a statement changes zero rental ledger transactions", () => {
    const r = useStoreHook();
    const before = r.current.transactions.length;
    act(() => {
      r.current.importCsv({
        accountId: "fac_1",
        csvText: "Date,Description,Amount\n2026-09-10,TEST IMPORT,100.00",
        mapping: MAP,
        fileName: "noninterference.csv",
      });
    });
    expect(r.current.transactions.length).toBe(before);
  });

  it("all seeded banking records are tenant-scoped", () => {
    const r = useStoreHook();
    expect(r.current.importedTransactions.every((t) => t.tenant_id)).toBe(true);
    expect(r.current.reconciliationMatches.every((m) => m.tenant_id)).toBe(
      true,
    );
    expect(r.current.financialAccounts.every((a) => a.tenant_id)).toBe(true);
  });
});
