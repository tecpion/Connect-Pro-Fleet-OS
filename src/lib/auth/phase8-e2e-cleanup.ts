// Phase 8 E2E — best-effort teardown of all Phase 8 rows created during a run.
// Extracted so the main E2E runner stays focused; admin (service-role) only.
// Only the rows created by this E2E run are deleted. Mirrors the Phase 7 split.
// Teardown failures are visible; never claim a clean PASS after leaking fixtures.

import type { Phase8Step } from "./phase8-e2e.server";
import { step, errorDetail, type Phase8Runtime } from "./phase8-e2e-runtime";

export interface Phase8CleanupResult {
  steps: Phase8Step[];
}

export async function runPhase8Cleanup(
  runtime: Phase8Runtime,
): Promise<Phase8CleanupResult> {
  const steps: Phase8Step[] = [];
  const { admin, orgA, orgB, users } = runtime;
  await step(steps, "cleanup", async () => {
    const failures: string[] = [];
    for (const org of [orgA, orgB]) {
      // Delete Phase 8 domain tables first (they may FK to base rows), then the
      // base fixtures, then the org + auth users. Order matters: child tables
      // before parent tables so FK constraints do not block teardown.
      for (const table of [
        "addon_catalog_items",
        "addon_categories",
        "vehicle_classes",
        "company_settings",
        "notification_preferences",
        "notification_deliveries",
        "notifications",
        "task_notes",
        "task_events",
        "tasks",
        "drivers",
        "operational_staff_assignments",
        "staff",
        "locations",
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
