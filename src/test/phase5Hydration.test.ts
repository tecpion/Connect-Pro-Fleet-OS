import { it, expect, vi } from "vitest";
import {
  hydrateExpenses,
  hydrateBanking,
  hydrateInvestor,
  type Phase5Repositories,
  type ExpenseSyncHandles,
  type BankingSyncHandles,
  type InvestorSyncHandles,
} from "@/lib/supabase/phase5StoreSync";
import { setters } from "./phase5TestSupport";
import { phase5Fixtures } from "@/lib/auth/phase5-e2e-fixtures";
const f = phase5Fixtures("org-a", "vehicle-a");
function repositories(): Phase5Repositories {
  return {
    expenses: {
      listTransactions: vi.fn().mockResolvedValue([f.expense]),
      listCategories: vi.fn().mockResolvedValue([]),
      listReceipts: vi.fn().mockResolvedValue([{ expense_id: f.expense.id }]),
      listReimbursements: vi.fn().mockResolvedValue([{ amount: 100 }]),
      listLineItems: vi
        .fn()
        .mockResolvedValue([{ expense_id: f.expense.id, amount: 100 }]),
    },
    banking: Object.fromEntries(
      [
        "listAccounts",
        "listImportedTransactions",
        "listStatements",
        "listBatches",
        "listMatches",
        "listTransfers",
        "listReconEvents",
      ].map((name) => [
        name,
        vi
          .fn()
          .mockResolvedValue(
            name === "listImportedTransactions" ? [f.bank] : [],
          ),
      ]),
    ),
    investor: {
      listInvestors: vi.fn().mockResolvedValue([f.investor]),
      listPairings: vi.fn().mockResolvedValue([f.pairing]),
      listSettlements: vi.fn().mockResolvedValue([f.settlement]),
    },
  } as unknown as Phase5Repositories;
}
it("Phase 5 relogin hydration replaces stale state from all three authenticated repositories", async () => {
  const r = repositories(),
    { handles, state } = setters();
  expect(await hydrateExpenses("org-a", handles as ExpenseSyncHandles, r)).toBe(
    true,
  );
  expect(await hydrateBanking("org-a", handles as BankingSyncHandles, r)).toBe(
    true,
  );
  expect(
    await hydrateInvestor("org-a", handles as InvestorSyncHandles, r),
  ).toBe(true);
  expect(state.setExpenses).toEqual([f.expense]);
  expect(state.setExpenseLineItems).toHaveLength(1);
  expect(state.setExpenseReceipts).toHaveLength(1);
  expect(state.setImportedTransactions).toEqual([f.bank]);
  expect(state.setInvestorVehicles).toEqual([f.pairing]);
  expect(state.setSettlements).toEqual([f.settlement]);
  expect(r.expenses!.listLineItems).toHaveBeenCalledWith("org-a", f.expense.id);
  expect(state.setCashEntries).toEqual([]);
});
it("Phase 5 hydration failure cannot fabricate a successful Cloud cache", async () => {
  const r = repositories(),
    { handles, state } = setters();
  vi.mocked(r.expenses!.listTransactions).mockRejectedValue(
    new Error("not authenticated"),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      await hydrateExpenses("org-b", handles as ExpenseSyncHandles, r),
    ).toBe(false);
    expect(state).toEqual({});
  } finally {
    log.mockRestore();
  }
});

it("Phase 5 relogin restores matched and transfer evidence without creating a ledger record", async () => {
  const r = repositories(),
    { handles, state } = setters();
  const transfer = { ...f.bank, id: "transfer-evidence" };
  vi.mocked(r.banking!.listImportedTransactions).mockResolvedValue([
    f.bank,
    transfer,
  ]);
  vi.mocked(r.banking!.listMatches).mockResolvedValue([
    {
      imported_transaction_id: f.bank.id,
      allocated_amount: 100,
      voided_at: null,
    },
  ] as never);
  vi.mocked(r.banking!.listTransfers).mockResolvedValue([
    { imported_transaction_ids: [transfer.id] },
  ] as never);
  expect(await hydrateBanking("org-a", handles as BankingSyncHandles, r)).toBe(
    true,
  );
  expect(state.setImportedTransactions).toEqual([
    expect.objectContaining({
      id: f.bank.id,
      match_status: "matched",
      review_status: "reviewed",
    }),
    expect.objectContaining({
      id: transfer.id,
      transfer_status: "transfer",
      match_status: "unmatched",
    }),
  ]);
  expect(Object.keys(state)).not.toContain("setExpenses");
  expect(Object.keys(state)).not.toContain("setTransactions");
});
