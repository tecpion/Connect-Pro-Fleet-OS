import { it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/client", () => ({
  getBackendMode: () => "memory",
  getSupabase: () => null,
  hasSupabaseConfig: () => false,
}));
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import { netExpenseTotal } from "@/lib/expenseSelectors";
const wrapper = ({ children }: { children: ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);
it("Phase 5 transfer keeps rental ledger and expense P&L unchanged", () => {
  const { result } = renderHook(() => useStore(), { wrapper });
  act(() => {
    result.current.importCsv({
      accountId: "fac_1",
      csvText: "Date,Description,Amount\n2026-08-24,Phase5 transfer,-42.17",
      mapping: { Date: "date", Description: "description", Amount: "amount" },
      fileName: "transfer.csv",
    });
  });
  const t = result.current.importedTransactions.find(
    (t) => t.description === "Phase5 transfer",
  )!;
  const ledger = JSON.stringify(result.current.transactions),
    expenses = netExpenseTotal(result.current.expenses);
  act(() => {
    result.current.markTransfer({
      importedTransactionId: t.id,
      counterpartAccountId: "fac_2",
    });
  });
  expect(result.current.importedTransactionById(t.id)?.transfer_status).toBe(
    "transfer",
  );
  expect(JSON.stringify(result.current.transactions)).toBe(ledger);
  expect(netExpenseTotal(result.current.expenses)).toBe(expenses);
});
