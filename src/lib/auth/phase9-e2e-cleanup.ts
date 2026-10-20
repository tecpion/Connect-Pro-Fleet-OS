// Phase 9D E2E — best-effort teardown of all Phase 9 rows created during a run.
// Extracted so the main E2E runner stays focused; admin (service-role) only.
// Only the rows created by this E2E run are deleted. Teardown failures are
// visible; never claim a clean PASS after leaking fixtures.

import type { Phase9Step } from "./phase9-e2e.server";
import { step, errorDetail, type Phase9Runtime } from "./phase9-e2e-runtime";

export interface Phase9CleanupResult {
  steps: Phase9Step[];
}

export async function runPhase9Cleanup(
  runtime: Phase9Runtime,
): Promise<Phase9CleanupResult> {
  const steps: Phase9Step[] = [];
  const { admin, orgA, orgB, users } = runtime;
  await step(steps, "cleanup", async () => {
    const failures: string[] = [];
    for (const org of [orgA, orgB]) {
      // Delete Phase 9 domain tables first (they may FK to base rows), then the
      // base fixtures, then the org + auth users. Order matters: child tables
      // before parent tables so FK constraints do not block teardown.
      for (const table of [
        "activity_log",
        "agreement_instances",
        "master_agreements",
        "agreement_templates",
        "payment_arrangement_events",
        "payment_arrangement_installments",
        "payment_arrangements",
        "receipts",
        "invoices",
        "rental_events",
        "rental_ledger_transactions",
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
    if (failures.length) throw new Error(failures.join("; "));
    return true;
  });
  return { steps };
}

export { errorDetail };