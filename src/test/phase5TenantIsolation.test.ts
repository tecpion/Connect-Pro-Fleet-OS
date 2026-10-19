import { it, expect } from "vitest";
import {
  SupabaseExpenseRepository,
  SupabaseBankingRepository,
  SupabaseInvestorRepository,
} from "@/lib/supabase/phase5Adapters";
import { recordingDb } from "./phase5TestSupport";
// These are client scoping/error contracts. They deliberately do not claim to
// prove server RLS; the live authenticated two-org runner owns that proof.
it.each(["expenses", "banking", "investors", "settlements"])(
  "Phase 5 %s reads are explicitly org scoped",
  async (kind) => {
    const t = recordingDb();
    if (kind === "expenses")
      await new SupabaseExpenseRepository(t.db).listTransactions("org-a");
    if (kind === "banking")
      await new SupabaseBankingRepository(t.db).listImportedTransactions(
        "org-a",
      );
    if (kind === "investors")
      await new SupabaseInvestorRepository(t.db).listInvestors("org-a");
    if (kind === "settlements")
      await new SupabaseInvestorRepository(t.db).listSettlements("org-a");
    expect(t.calls).toContainEqual(
      expect.objectContaining({
        method: "eq",
        args: ["organization_id", "org-a"],
      }),
    );
  },
);
it("Phase 5 adapters propagate permission failures instead of reporting successful writes", async () => {
  const t = recordingDb([], {
    code: "42501",
    message: "new row violates row-level security policy",
  });
  await expect(
    new SupabaseExpenseRepository(t.db).updateTransaction(
      "org-a",
      "expense-a",
      { amount: 999 },
    ),
  ).rejects.toThrow();
  await expect(
    new SupabaseInvestorRepository(t.db).updateSettlementStatus(
      "org-a",
      "settlement-a",
      "paid",
    ),
  ).rejects.toThrow();
});
