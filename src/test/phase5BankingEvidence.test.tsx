import { it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/client", () => ({
  getBackendMode: () => "memory",
  getSupabase: () => null,
  hasSupabaseConfig: () => false,
}));
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
const wrapper = ({ children }: { children: ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);
it("Phase 5 bank debit/credit reconciliation links evidence without duplicating authoritative records", () => {
  const { result } = renderHook(() => useStore(), { wrapper });
  const expenses = result.current.expenses.length,
    payments = result.current.transactions.length;
  act(() => {
    result.current.importCsv({
      accountId: "fac_1",
      csvText:
        "Date,Description,Amount\n2026-08-24,Phase5 debit,-100\n2026-08-24,Phase5 credit,100",
      mapping: { Date: "date", Description: "description", Amount: "amount" },
      fileName: "phase5.csv",
    });
  });
  const bank = result.current.importedTransactions.filter((t) =>
    t.description.startsWith("Phase5"),
  );
  expect(bank).toHaveLength(2);
  expect(result.current.expenses).toHaveLength(expenses);
  expect(result.current.transactions).toHaveLength(payments);
  for (const t of bank) {
    const target =
      t.direction === "money_out"
        ? result.current.expenses[0]
        : result.current.transactions.find((t) => t.category === "payment")!;
    act(() => {
      result.current.confirmMatch({
        importedTransactionId: t.id,
        target_type:
          t.direction === "money_out" ? "expense" : "customer_payment",
        target_id: target.id,
        allocated_amount: 100,
      });
    });
  }
  expect(result.current.expenses).toHaveLength(expenses);
  expect(result.current.transactions).toHaveLength(payments);
  expect(
    result.current.reconciliationMatches.filter((m) =>
      bank.some((t) => t.id === m.imported_transaction_id),
    ),
  ).toHaveLength(2);
});
it("Phase 5 unmatched imports stay unmatched without creating payments", () => {
  const { result } = renderHook(() => useStore(), { wrapper });
  act(() => {
    result.current.importCsv({
      accountId: "fac_1",
      csvText:
        "Date,Description,Amount\n2026-08-24,Unidentifiable phase5,9137.12",
      mapping: { Date: "date", Description: "description", Amount: "amount" },
      fileName: "unknown.csv",
    });
  });
  expect(
    result.current.importedTransactions.find(
      (t) => t.description === "Unidentifiable phase5",
    )?.match_status,
  ).toBe("unmatched");
});
