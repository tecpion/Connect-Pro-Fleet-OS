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
it("Phase 5 duplicate CSV imports remain idempotent even with a different filename", () => {
  const { result } = renderHook(() => useStore(), { wrapper });
  const input = {
    accountId: "fac_1",
    csvText: "Date,Description,Amount\n2026-08-24,Phase5 duplicate,-43.29",
    mapping: {
      Date: "date" as const,
      Description: "description" as const,
      Amount: "amount" as const,
    },
    fileName: "first.csv",
  };
  act(() => {
    result.current.importCsv(input);
  });
  const count = result.current.importedTransactions.length;
  let duplicate = 0;
  act(() => {
    duplicate = result.current.importCsv({
      ...input,
      fileName: "retry.csv",
    }).duplicates;
  });
  expect(duplicate).toBe(1);
  expect(result.current.importedTransactions).toHaveLength(count);
});

import { importBatchToRow } from "@/lib/supabase/phase5Mappers";
it("Phase 5 import batch persists its stable id and required import type", () => {
  const row = importBatchToRow({
    id: "batch-a",
    tenant_id: "org-a",
    financial_account_id: "account-a",
    source_file_name: "import.csv",
    source: "csv",
    imported_at: "2026-08-01",
    imported_by_user_id: "user-a",
    row_count: 1,
    accepted_rows: 1,
    duplicate_rows: 0,
    error_rows: 0,
    errors: [],
    hash: "hash",
  });
  expect(row).toMatchObject({
    id: "batch-a",
    organization_id: "org-a",
    import_type: "banking",
    imported_by_user_id: "user-a",
  });
});
