// Phase 9D E2E — Org B cross-tenant isolation against every Phase 9 table.
// Mirrors the Phase 8 isolation split. Every probe uses the signed-in Org B
// publishable-key client (never the service-role admin). Updates must return no
// rows and we re-read as Org A to rule out a silent unauthorized mutation.
// Forged inserts (Org B writing Org A's organization_id) must be denied by RLS.
// Test-harness only — no product/domain logic changed.

import { step, type Phase9Runtime } from "./phase9-e2e-runtime";
import type { Phase9Step } from "./phase9-e2e.server";

export interface Phase9IsolationResult {
  steps: Phase9Step[];
}

// Each Phase 9 table is probed for read / update / forged-insert isolation.
// The forged row carries Org A's organization_id so a missing/broken RLS policy
// would let Org B see or mutate Org A rows. We assert Org B sees nothing and
// Org A's row is unchanged.
const PHASE9_TABLES = [
  {
    label: "rental_events",
    table: "rental_events",
    id: (r: Phase9Runtime) => r.recordIds.rentalEvent,
    patch: { label: "TENANT BREACH" },
  },
  {
    label: "invoices",
    table: "invoices",
    id: (r: Phase9Runtime) => r.recordIds.invoice,
    patch: { notes: "TENANT BREACH" },
  },
  {
    label: "receipts",
    table: "receipts",
    id: (r: Phase9Runtime) => r.recordIds.receipt,
    patch: { status: "voided" },
  },
  {
    label: "payment_arrangements",
    table: "payment_arrangements",
    id: (r: Phase9Runtime) => r.recordIds.arrangement,
    patch: { terms_summary: "TENANT BREACH" },
  },
  {
    label: "payment_arrangement_installments",
    table: "payment_arrangement_installments",
    id: (r: Phase9Runtime) => r.recordIds.installment,
    patch: { notes: "TENANT BREACH" },
  },
  {
    label: "payment_arrangement_events",
    table: "payment_arrangement_events",
    id: (r: Phase9Runtime) => r.recordIds.arrangementEvent,
    patch: { label: "TENANT BREACH" },
  },
  {
    label: "agreement_templates",
    table: "agreement_templates",
    id: (r: Phase9Runtime) => r.recordIds.template,
    patch: { name: "TENANT BREACH" },
  },
  {
    label: "master_agreements",
    table: "master_agreements",
    id: (r: Phase9Runtime) => r.recordIds.masterAgreement,
    patch: { terms_version: "TENANT BREACH" },
  },
  {
    label: "agreement_instances",
    table: "agreement_instances",
    id: (r: Phase9Runtime) => r.recordIds.agreementInstance,
    patch: { rate: 0 },
  },
  {
    label: "activity_log",
    table: "activity_log",
    id: (r: Phase9Runtime) => r.recordIds.activity,
    patch: { label: "TENANT BREACH" },
  },
] as const;

export async function runPhase9Isolation(
  runtime: Phase9Runtime,
): Promise<Phase9IsolationResult> {
  const steps: Phase9Step[] = [];
  const { a, b, orgA } = runtime;

  for (const probe of PHASE9_TABLES) {
    const table = probe.table;
    const rowId = probe.id(runtime);

    // ── Read: Org B cannot read Org A rows ─────────────────────────────────
    await step(steps, `org_b_cannot_read_${probe.label}`, async () => {
      const r = await b.from(table).select("*").eq("organization_id", orgA);
      return !r.error && (r.data?.length ?? 0) === 0;
    });

    // ── Update: Org B cannot mutate Org A rows ─────────────────────────────
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
        (r.error?.code === "42501" ||
          (!r.error && (r.data?.length ?? 0) === 0)) &&
        JSON.stringify(before.data) === JSON.stringify(after.data)
      );
    });

    // ── Forged insert: Org B cannot insert a row claiming Org A's org id ───
    await step(steps, `org_b_cannot_insert_${probe.label}`, async () => {
      const forgedId = crypto.randomUUID();
      const r = await b
        .from(table)
        .insert({ id: forgedId, organization_id: orgA })
        .select();
      const read = await a.from(table).select("id").eq("id", forgedId);
      return (
        r.error?.code === "42501" &&
        !read.error &&
        (read.data?.length ?? 0) === 0
      );
    });
  }

  return { steps };
}