import { it, expect } from "vitest";
import {
  investorSettlementToRow,
  rowToInvestorSettlement,
} from "@/lib/supabase/phase5Mappers";
import { phase5Fixtures } from "@/lib/auth/phase5-e2e-fixtures";
import { SupabaseInvestorRepository } from "@/lib/supabase/phase5Adapters";
import { recordingDb } from "./phase5TestSupport";
it("Phase 5 payout updates only the distribution, never the expense or rental ledger", async () => {
  const { settlement } = phase5Fixtures("org-a", "vehicle-a");
  const row = {
    ...investorSettlementToRow(settlement),
    status: "paid",
    paid_at: "2026-08-31T00:00:00Z",
    created_at: settlement.created_at,
  };
  const transport = recordingDb([row]);
  const paid = await new SupabaseInvestorRepository(
    transport.db,
  ).updateSettlementStatus("org-a", settlement.id, "paid", row.paid_at);
  expect(paid.payout_status).toBe("paid");
  expect(paid.investor_payout_amount).toBe(540);
  expect(new Set(transport.calls.map((c) => c.table))).toEqual(
    new Set(["investor_settlements"]),
  );
  expect(rowToInvestorSettlement(row).operating_costs).toBe(100);
});
