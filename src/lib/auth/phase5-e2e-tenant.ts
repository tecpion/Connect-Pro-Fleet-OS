// Phase 5 E2E — cross-tenant isolation across the Phase 5 tables and the
// private document buckets. Extracted so the main E2E runner stays focused.
// Mirrors the Phase 4 split. Test-harness only — no product/domain logic.
//
// Probes real tables with a valid forged Org A row. Updates must return no
// rows, and we re-read as A to rule out a silent unauthorized mutation.
// Service role is NEVER substituted for the authenticated Org A / Org B
// isolation assertions.

import {
  expenseTransactionToRow,
  importedTransactionToRow,
  investorToRow,
  investorSettlementToRow,
  investorVehicleToRow,
} from "@/lib/supabase/phase5Mappers";
import { verifyPhase5PrivateDocument } from "./phase5-e2e-isolation";
import type { Phase5Step } from "./phase5-e2e.server";
import { step, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface TenantIsolationResult {
  steps: Phase5Step[];
}

export async function runTenantIsolation(
  runtime: Phase5Runtime,
): Promise<TenantIsolationResult> {
  const steps: Phase5Step[] = [];
  const { a, b, fixtures: f, orgA } = runtime;
  // Probe real tables with a valid forged Org A row. Updates must return no
  // rows, and we re-read as A to rule out a silent unauthorized mutation.
  for (const [label, table, row, patch] of [
    [
      "expenses",
      "expense_transactions",
      expenseTransactionToRow(f.expense),
      { description: "TENANT BREACH" },
    ],
    [
      "banking",
      "imported_transactions",
      importedTransactionToRow(f.bank),
      { description: "TENANT BREACH" },
    ],
    [
      "investor_jv",
      "investors",
      investorToRow(f.investor),
      { name: "TENANT BREACH" },
    ],
    [
      "settlements",
      "investor_settlements",
      investorSettlementToRow(f.settlement),
      { investor_amount: 99999 },
    ],
    [
      "investor_pairings",
      "investor_vehicles",
      investorVehicleToRow(f.pairing),
      { percentage: 99 },
    ],
  ] as const) {
    await step(steps, `org_b_cannot_read_${label}`, async () => {
      const r = await b
        .from(table)
        .select("*")
        .eq("organization_id", orgA!)
        .eq("id", row.id);
      return !r.error && r.data?.length === 0;
    });
    await step(steps, `org_b_cannot_update_${label}`, async () => {
      const before = await a.from(table).select("*").eq("id", row.id).single();
      if (before.error) throw before.error;
      const r = await b
        .from(table)
        .update(patch)
        .eq("organization_id", orgA!)
        .eq("id", row.id)
        .select();
      const after = await a.from(table).select("*").eq("id", row.id).single();
      return (
        !after.error &&
        (r.error?.code === "42501" || (!r.error && r.data?.length === 0)) &&
        JSON.stringify(before.data) === JSON.stringify(after.data)
      );
    });
    await step(steps, `org_b_cannot_insert_${label}`, async () => {
      const forged = { ...row, id: crypto.randomUUID() };
      // Fresh natural keys avoid accepting a duplicate-key error as RLS proof.
      if ("expense_number" in forged)
        forged.expense_number = crypto.randomUUID();
      if ("import_fingerprint" in forged) {
        forged.import_fingerprint = crypto.randomUUID();
        forged.external_transaction_id = crypto.randomUUID();
      }
      if ("period_start" in forged) {
        forged.period_start = "2098-01-01";
        forged.period_end = "2098-01-02";
      }
      const r = await b
        .from(table)
        .insert(forged as Record<string, unknown>)
        .select();
      const read = await a.from(table).select("id").eq("id", forged.id);
      return (
        r.error?.code === "42501" && !read.error && read.data?.length === 0
      );
    });
  }
  for (const [kind, bucket] of [
    ["receipt", "expense-receipts"],
    ["payout", "rental-agreements"],
  ] as const) {
    const path =
      kind === "receipt"
        ? `${orgA}/expenses/${f.expense.id}/receipt.pdf`
        : `${orgA}/settlements/${f.settlement.id}/payout.pdf`;
    runtime.documents.push({ bucket, path });
    await step(steps, `private_${kind}_document_isolation`, () =>
      verifyPhase5PrivateDocument(a, b, bucket, path),
    );
  }
  return { steps };
}
