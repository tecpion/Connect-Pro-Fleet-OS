// Phase 7 E2E — best-effort teardown of all Phase 7 rows created during a run.
// Extracted so the main E2E runner stays focused; admin (service-role) only.
// Only the rows created by this E2E run are deleted. Mirrors the Phase 5 split.
// Teardown failures are visible; never claim a clean PASS after leaking fixtures.

import type { Phase7Step } from "./phase7-e2e.server";
import { step, errorDetail, type Phase7Runtime } from "./phase7-e2e-runtime";

export interface CleanupResult {
  steps: Phase7Step[];
}

export async function runCleanup(
  runtime: Phase7Runtime,
): Promise<CleanupResult> {
  const steps: Phase7Step[] = [];
  const { admin, orgA, orgB, users } = runtime;
  await step(steps, "cleanup", async () => {
    const failures: string[] = [];
    for (const org of [orgA, orgB]) {
      for (const table of [
        "maintenance_receipts",
        "maintenance_work_order_events",
        "maintenance_work_orders",
        "maintenance_vendors",
        "inspections",
        "booking_requests",
        "deposit_history_events",
        "security_deposits",
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
