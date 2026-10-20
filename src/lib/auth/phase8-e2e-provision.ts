// Phase 8 E2E — provisioning. Reuses the Phase 7 provision_account + base
// fixture helpers (customer → vehicle → rental) so Phase 8 records that carry
// FKs (drivers → reservations) have a valid reservation to point at.
// Service role is confined to auth-user creation + provision_account RPC; every
// fixture insert uses the signed-in Org A publishable-key client so RLS is the
// real gate. Test-harness only.

import type { Phase8Client } from "./phase8-e2e-runtime";
import {
  provisionOneOrg,
  createBaseFixtures,
} from "./phase7-e2e-provision";
import {
  SupabaseLocationsRepository,
  SupabaseStaffAssignmentsRepository,
} from "@/lib/supabase/phase8OperationalAdapters";
import {
  SupabaseTasksRepository,
  SupabaseNotificationsRepository,
  SupabaseCompanySettingsRepository,
  SupabaseVehicleClassesRepository,
  SupabaseAddonsRepository,
} from "@/lib/supabase/phase8ConfigAdapters";
import type { Phase8Step } from "./phase8-e2e.server";
import { step, requireOk, type Phase8Runtime } from "./phase8-e2e-runtime";

export interface Phase8ProvisionResult {
  steps: Phase8Step[];
  runtime: Phase8Runtime;
}

export async function provisionAndSetupPhase8(
  admin: Phase8Client,
  a: Phase8Client,
  b: Phase8Client,
): Promise<Phase8ProvisionResult> {
  const steps: Phase8Step[] = [];
  const users: string[] = [];
  const orgs: string[] = [];
  const stamp = crypto.randomUUID();
  const password = `Phase8!${crypto.randomUUID()}`;
  const emailA = `e2e8-a-${stamp}@phase8.test`;
  const emailB = `e2e8-b-${stamp}@phase8.test`;

  async function provision(email: string, orgName: string) {
    const result = await provisionOneOrg(
      admin,
      a,
      email,
      password,
      orgName,
      "authenticated_org_a_phase8",
    );
    users.push(result.userId);
    orgs.push(result.orgId);
    steps.push(...result.steps);
    return result;
  }

  const pa = await provision(emailA, `Phase8 ${stamp} 1`);
  const orgA = pa.orgId;
  // Org B uses its own client so its session is independent.
  const pb = await provisionOneOrg(
    admin,
    b,
    emailB,
    password,
    `Phase8 ${stamp} 2`,
    "authenticated_org_b_phase8",
  );
  const orgB = pb.orgId;
  users.push(pb.userId);
  orgs.push(pb.orgId);

  const ctx = {
    orgA,
    userAId: pa.userId,
    userBId: pb.userId,
    vehId: crypto.randomUUID(),
    custId: crypto.randomUUID(),
    rentalId: crypto.randomUUID(),
    now: new Date(),
    nowIso: new Date().toISOString(),
    stamp: Date.now(),
  };
  const now = ctx.nowIso;
  const date = now.slice(0, 10);

  // Base fixtures (customer/vehicle/rental) so drivers can reference a
  // reservation. Inserted as the signed-in Org A client (RLS gate).
  requireOk(
    (await createBaseFixtures(a, ctx)).steps.every((s) => s.ok),
  );
  steps.push({ step: "phase8_base_fixtures", ok: true });

  const locations = new SupabaseLocationsRepository(a as never);
  const staffAssignments = new SupabaseStaffAssignmentsRepository(a as never);
  const tasks = new SupabaseTasksRepository(a as never);
  const notifications = new SupabaseNotificationsRepository(a as never);
  const companySettings = new SupabaseCompanySettingsRepository(a as never);
  const vehicleClasses = new SupabaseVehicleClassesRepository(a as never);
  const addons = new SupabaseAddonsRepository(a as never);

  const runtime: Phase8Runtime = {
    a: a as never,
    b: b as never,
    admin: admin as never,
    orgA,
    orgB,
    userAId: pa.userId,
    userBId: pb.userId,
    emailA,
    emailB,
    password,
    stamp,
    ctx,
    now,
    date,
    locations,
    staffAssignments,
    tasks,
    notifications,
    companySettings,
    vehicleClasses,
    addons,
    recordIds: {},
    phase8: {} as never,
    users,
    orgs,
  };

  return { steps, runtime };
}
