// Phase 5 E2E — best-effort teardown of all rows created during a run.
// Extracted so the main E2E runner stays focused; admin (service-role) only.
// Only the rows created by this E2E run are deleted. Mirrors the Phase 4 split.
// Teardown failures are visible; never claim a clean PASS after leaking fixtures.

import type { Phase5Step } from "./phase5-e2e.server";
import { step, errorDetail, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface CleanupResult {
  steps: Phase5Step[];
}

export async function runCleanup(
  runtime: Phase5Runtime,
): Promise<CleanupResult> {
  const steps: Phase5Step[] = [];
  const { admin, a, b, orgA, orgB, documents, users } = runtime;
  await step(steps, "cleanup", async () => {
    const failures: string[] = [];
    for (const doc of documents) {
      const r = await admin.storage.from(doc.bucket).remove([doc.path]);
      if (r.error) failures.push(r.error.message);
    }
    for (const org of [orgA, orgB]) {
      for (const table of [
        "reconciliation_matches",
        "reconciliation_events",
        "account_transfers",
        "imported_transactions",
        "financial_statements",
        "import_batches",
        "financial_accounts",
        "expense_receipts",
        "expense_reimbursements",
        "expense_line_items",
        "expense_transactions",
        "expense_categories",
        "investor_settlements",
        "investor_vehicles",
        "investors",
        "rental_ledger_transactions",
        "security_deposits",
        "damage_recoveries",
        "damage_claims",
        "rentals",
        "vehicles",
        "customers",
        "organization_memberships",
      ]) {
        const r = await admin.from(table).delete().eq("organization_id", org);
        if (r.error) failures.push(`${table}: ${r.error.message}`);
      }
      const r = await admin.from("organizations").delete().eq("id", org);
      if (r.error) failures.push(r.error.message);
    }
    for (const id of users) {
      const r = await admin.auth.admin.deleteUser(id);
      if (r.error) failures.push(r.error.message);
    }
    await Promise.all([a.auth.signOut(), b.auth.signOut()]);
    if (failures.length) throw new Error(failures.join("; "));
    return true;
  });
  return { steps };
}

export { errorDetail };
