import { describe, expect, it } from "vitest";
import { SupabaseExpenseRepository } from "@/lib/supabase/phase5Adapters";
import {
  expenseTransactionToRow,
  expenseReceiptToRow,
} from "@/lib/supabase/phase5Mappers";
import { phase5Fixtures } from "@/lib/auth/phase5-e2e-fixtures";
import { recordingDb } from "./phase5TestSupport";
import { getCompanyProfitability } from "@/lib/profitabilitySelectors";
import { expense, inputs, txn } from "./profitabilityFixtures";

describe("Phase 5 expense persistence and recovery semantics", () => {
  it("writes and maps an authoritative expense without changing amount or organization", async () => {
    const f = phase5Fixtures("org-a", "vehicle-a");
    const row = expenseTransactionToRow(f.expense);
    const transport = recordingDb([row]);
    const saved = await new SupabaseExpenseRepository(
      transport.db,
    ).insertTransaction(f.expense);
    expect(saved).toMatchObject({
      id: f.expense.id,
      tenant_id: "org-a",
      amount: 100,
      status: "posted",
    });
    expect(
      transport.calls.find((c) => c.method === "insert")?.args[0],
    ).toMatchObject({ organization_id: "org-a", amount: 100 });
  });
  it("persists private receipt ownership and path, never a public URL", async () => {
    const receipt = {
      id: "receipt",
      tenant_id: "org-a",
      expense_id: "expense",
      file_name: "receipt.pdf",
      file_url: "org-a/expenses/expense/receipt.pdf",
      mime_type: "application/pdf",
      uploaded_by: null,
      uploaded_at: "2026-08-15T00:00:00Z",
      note: null,
      voided_at: null,
    };
    const row = expenseReceiptToRow(receipt);
    const transport = recordingDb([row]);
    expect(
      await new SupabaseExpenseRepository(transport.db).insertReceipt(receipt),
    ).toEqual(receipt);
    expect(row).toMatchObject({
      organization_id: "org-a",
      storage_path: receipt.file_url,
    });
  });
  it("a paid reimbursement adds neither revenue nor a second expense", () => {
    const base = inputs({
      transactions: [txn({ amount: 1000 })],
      expenses: [expense({ amount: 100 })],
    });
    const range = {
      start: new Date("2026-08-01"),
      end: new Date("2026-08-31"),
    };
    const before = getCompanyProfitability(base, range);
    const after = getCompanyProfitability(
      { ...base, expenseReimbursements: [{ status: "paid", amount: 100 }] },
      range,
    );
    expect(after.operating_revenue).toBe(1000);
    expect(after.operating_profit).toBe(before.operating_profit);
    expect(after.fleet_direct_expenses).toBe(100);
  });
});
