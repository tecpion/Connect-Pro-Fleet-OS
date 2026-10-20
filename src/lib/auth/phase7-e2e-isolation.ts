// Phase 7 E2E — Org B cross-tenant isolation against the Phase 7 tables.
// Mirrors the Phase 5 tenant isolation split. Every probe uses the signed-in
// Org B publishable-key client (never the service-role admin). Updates must
// return no rows and we re-read as Org A to rule out a silent unauthorized
// mutation. Forged inserts (Org B writing Org A's organization_id) must be
// denied by RLS. Test-harness only — no product/domain logic changed.

import type { Phase7Step } from "./phase7-e2e.server";
import { step, type Phase7Runtime } from "./phase7-e2e-runtime";

export interface IsolationResult {
  steps: Phase7Step[];
}

// Each Phase 7 table is probed for read / update / forged-insert isolation.
// The forged row carries Org A's organization_id so a missing/broken RLS
// policy would let Org B see or mutate Org A rows. We assert Org B sees nothing
// and Org A's row is unchanged.
const PHASE7_TABLES = [
  {
    label: "rentals",
    table: "rentals",
    id: (r: Phase7Runtime) => r.ctx.rentalId,
    patch: { balance_due: 999 },
  },
  {
    label: "rental_ledger_transactions",
    table: "rental_ledger_transactions",
    id: (r: Phase7Runtime) => r.recordIds.charge,
    patch: { amount: 9999 },
  },
  {
    label: "security_deposits",
    table: "security_deposits",
    id: (r: Phase7Runtime) => r.recordIds.deposit,
    patch: { collected_amount: 9999 },
  },
  {
    label: "deposit_history_events",
    table: "deposit_history_events",
    id: (r: Phase7Runtime) => r.recordIds.depositHistory,
    patch: { amount: 9999 },
  },
  {
    label: "booking_requests",
    table: "booking_requests",
    id: (r: Phase7Runtime) => r.recordIds.booking,
    patch: { status: "declined" },
  },
  {
    label: "inspections",
    table: "inspections",
    id: (r: Phase7Runtime) => r.recordIds.inspection,
    patch: { odometer_reading: 999999 },
  },
  {
    label: "maintenance_work_orders",
    table: "maintenance_work_orders",
    id: (r: Phase7Runtime) => r.recordIds.workOrder,
    patch: { status: "cancelled" },
  },
  {
    label: "maintenance_work_order_events",
    table: "maintenance_work_order_events",
    id: (r: Phase7Runtime) => r.recordIds.workOrderEvent,
    patch: { event_type: "note_added" },
  },
  {
    label: "maintenance_vendors",
    table: "maintenance_vendors",
    id: (r: Phase7Runtime) => r.recordIds.vendor,
    patch: { name: "TENANT BREACH" },
  },
  {
    label: "maintenance_receipts",
    table: "maintenance_receipts",
    id: (r: Phase7Runtime) => r.recordIds.receipt,
    patch: { note: "TENANT BREACH" },
  },
] as const;

export async function runIsolation(
  runtime: Phase7Runtime,
): Promise<IsolationResult> {
  const steps: Phase7Step[] = [];
  const { a, b, orgA } = runtime;

  for (const probe of PHASE7_TABLES) {
    const table = probe.table;
    const rowId = probe.id(runtime);

    await step(steps, `org_b_cannot_read_${probe.label}`, async () => {
      const r = await b
        .from(table)
        .select("*")
        .eq("organization_id", orgA)
        .eq("id", rowId);
      return !r.error && r.data?.length === 0;
    });

    await step(steps, `org_b_cannot_update_${probe.label}`, async () => {
      const before = await a.from(table).select("*").eq("id", rowId).single();
      if (before.error) throw before.error;
      const r = await b
        .from(table)
        .update(probe.patch)
        .eq("organization_id", orgA)
        .eq("id", rowId)
        .select();
      const after = await a.from(table).select("*").eq("id", rowId).single();
      return (
        !after.error &&
        (r.error?.code === "42501" || (!r.error && r.data?.length === 0)) &&
        JSON.stringify(before.data) === JSON.stringify(after.data)
      );
    });

    await step(steps, `org_b_cannot_insert_${probe.label}`, async () => {
      // Forge a row claiming Org A's organization_id with a fresh id so RLS
      // (not a duplicate key) is what rejects it. We read back as Org A to
      // prove the forged row was never stored.
      const forgedId = crypto.randomUUID();
      const forged = {
        id: forgedId,
        organization_id: orgA,
      };
      const r = await b
        .from(table)
        .insert(forged as Record<string, unknown>)
        .select();
      const read = await a.from(table).select("id").eq("id", forgedId);
      return (
        r.error?.code === "42501" && !read.error && read.data?.length === 0
      );
    });
  }

  return { steps };
}
