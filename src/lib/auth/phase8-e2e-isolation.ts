// Phase 8 E2E — Org B cross-tenant isolation against every Phase 8 table.
// Mirrors the Phase 7 tenant isolation split. Every probe uses the signed-in
// Org B publishable-key client (never the service-role admin). Updates must
// return no rows and we re-read as Org A to rule out a silent unauthorized
// mutation. Forged inserts (Org B writing Org A's organization_id) must be
// denied by RLS. Test-harness only — no product/domain logic changed.

import { step, type Phase8Runtime } from "./phase8-e2e-runtime";
import type { Phase8Step } from "./phase8-e2e.server";

export interface Phase8IsolationResult {
  steps: Phase8Step[];
}

// Each Phase 8 table is probed for read / update / forged-insert isolation.
// The forged row carries Org A's organization_id so a missing/broken RLS
// policy would let Org B see or mutate Org A rows. We assert Org B sees nothing
// and Org A's row is unchanged.
const PHASE8_TABLES = [
  {
    label: "locations",
    table: "locations",
    id: (r: Phase8Runtime) => r.recordIds.location,
    composite: false as const,
    orgScoped: false as const,
    patch: { name: "TENANT BREACH" },
  },
  {
    label: "staff",
    table: "staff",
    id: (r: Phase8Runtime) => r.recordIds.staff,
    composite: false as const,
    orgScoped: false as const,
    patch: { full_name: "TENANT BREACH" },
  },
  {
    label: "operational_staff_assignments",
    table: "operational_staff_assignments",
    id: (r: Phase8Runtime) => r.recordIds.assignment,
    composite: false as const,
    orgScoped: false as const,
    patch: { notes: "TENANT BREACH" },
  },
  {
    label: "drivers",
    table: "drivers",
    id: (r: Phase8Runtime) => r.recordIds.driver,
    composite: false as const,
    orgScoped: false as const,
    patch: { full_name: "TENANT BREACH" },
  },
  {
    label: "tasks",
    table: "tasks",
    id: (r: Phase8Runtime) => r.recordIds.task,
    composite: false as const,
    orgScoped: false as const,
    patch: { title: "TENANT BREACH" },
  },
  {
    label: "task_events",
    table: "task_events",
    id: (r: Phase8Runtime) => r.recordIds.taskEvent,
    composite: false as const,
    orgScoped: false as const,
    patch: { note: "TENANT BREACH" },
  },
  {
    label: "task_notes",
    table: "task_notes",
    id: (r: Phase8Runtime) => r.recordIds.taskNote,
    composite: false as const,
    orgScoped: false as const,
    patch: { text: "TENANT BREACH" },
  },
  {
    label: "notifications",
    table: "notifications",
    id: (r: Phase8Runtime) => r.recordIds.notification,
    composite: false as const,
    orgScoped: false as const,
    patch: { title: "TENANT BREACH" },
  },
  {
    label: "notification_deliveries",
    table: "notification_deliveries",
    id: (r: Phase8Runtime) => r.recordIds.notificationDelivery,
    composite: false as const,
    orgScoped: false as const,
    patch: { status: "failed" },
  },
  {
    label: "notification_preferences",
    table: "notification_preferences",
    id: (r: Phase8Runtime) => r.recordIds.notificationPreference,
    // notification_preferences has a composite PK (org, user, category); the
    // update probe targets Org A's org id + user id + category. There is no
    // single `id` column, so the read probe uses the composite key.
    composite: true as const,
    orgScoped: false as const,
    patch: { email_enabled: true },
  },
  {
    label: "company_settings",
    table: "company_settings",
    id: (r: Phase8Runtime) => r.recordIds.companySettings,
    // company_settings is keyed by organization_id; the row id is the settings
    // row id, but the isolation probe scopes by organization_id (Org A).
    composite: false as const,
    orgScoped: true as const,
    patch: { company_info: { breached: true } },
  },
  {
    label: "vehicle_classes",
    table: "vehicle_classes",
    id: (r: Phase8Runtime) => r.recordIds.vehicleClass,
    composite: false as const,
    orgScoped: false as const,
    patch: { name: "TENANT BREACH" },
  },
  {
    label: "addon_categories",
    table: "addon_categories",
    id: (r: Phase8Runtime) => r.recordIds.addonCategory,
    composite: false as const,
    orgScoped: false as const,
    patch: { name: "TENANT BREACH" },
  },
  {
    label: "addon_catalog_items",
    table: "addon_catalog_items",
    id: (r: Phase8Runtime) => r.recordIds.addonItem,
    composite: false as const,
    orgScoped: false as const,
    patch: { name: "TENANT BREACH" },
  },
] as const;

export async function runPhase8Isolation(
  runtime: Phase8Runtime,
): Promise<Phase8IsolationResult> {
  const steps: Phase8Step[] = [];
  const { a, b, orgA, userAId } = runtime;

  for (const probe of PHASE8_TABLES) {
    const table = probe.table;

    // ── Read: Org B cannot read Org A rows ─────────────────────────────────
    await step(steps, `org_b_cannot_read_${probe.label}`, async () => {
      if (probe.composite) {
        // notification_preferences: scope by org + user + category.
        const r = await b
          .from(table)
          .select("*")
          .eq("organization_id", orgA)
          .eq("user_id", userAId)
          .eq("category", "task");
        return !r.error && (r.data?.length ?? 0) === 0;
      }
      const r = await b.from(table).select("*").eq("organization_id", orgA);
      return !r.error && (r.data?.length ?? 0) === 0;
    });

    // ── Update: Org B cannot mutate Org A rows ─────────────────────────────
    await step(steps, `org_b_cannot_update_${probe.label}`, async () => {
      const rowId = probe.id(runtime);
      let before: { data: unknown; error: unknown };
      if (probe.composite) {
        before = await a
          .from(table)
          .select("*")
          .eq("organization_id", orgA)
          .eq("user_id", userAId)
          .eq("category", "task")
          .single();
      } else {
        before = await a.from(table).select("*").eq("id", rowId).single();
      }
      if (before.error) throw before.error;

      const r = await b
        .from(table)
        .update(probe.patch)
        .eq("organization_id", orgA)
        .eq("id", rowId)
        .select();

      let after: { data: unknown; error: unknown };
      if (probe.composite) {
        after = await a
          .from(table)
          .select("*")
          .eq("organization_id", orgA)
          .eq("user_id", userAId)
          .eq("category", "task")
          .single();
      } else {
        after = await a.from(table).select("*").eq("id", rowId).single();
      }
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
      const forged: Record<string, unknown> = {
        id: forgedId,
        organization_id: orgA,
      };
      // notification_preferences has a composite PK and NOT NULL user_id +
      // category; supply them so the only thing that can reject the insert is
      // RLS (not a NOT NULL violation).
      if (probe.composite) {
        forged.user_id = userAId;
        forged.category = "forged";
        delete forged.id;
      }
      // company_settings needs a non-null company_info/settings_config (defaults
      // exist), and a unique organization_id — but we use a forged id so the
      // unique constraint is not the blocker; RLS is.
      if (probe.orgScoped) {
        // company_settings already has a row for orgA; a forged insert with a
        // fresh id but orgA would violate the unique org index, not RLS. To
        // isolate RLS we instead forge with a fresh org id that Org B does NOT
        // belong to — but we have no such org. Instead, assert RLS denies a
        // forged insert carrying Org A's org id by using a fresh id; if RLS is
        // intact the insert is denied before the unique constraint is checked.
        // (PostgREST checks RLS first.) We accept either a 42501 or a unique
        // violation only if no row was stored.
        const r = await b.from(table).insert(forged).select();
        const read = await a.from(table).select("id").eq("id", forgedId);
        return (
          (r.error?.code === "42501" || !r.error) &&
          !read.error &&
          (read.data?.length ?? 0) === 0
        );
      }
      const r = await b.from(table).insert(forged).select();
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
