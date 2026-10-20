// Phase 7 E2E — provisioning + base fixture setup (authenticated Org A client).
// Mirrors the Phase 5 provisioning split. Service role is confined to auth-user
// creation + the provision_account RPC; every fixture insert uses the signed-in
// Org A publishable-key client so RLS is the real gate. Test-harness only.

import type { Phase7Client } from "./phase7-e2e-runtime";
import {
  buildCustomerRow,
  buildVehicleRow,
  buildRentalRow,
  type Phase4Context,
} from "./phase4-e2e-builders";
import {
  SupabaseRentalRepository,
  SupabaseLedgerRepository,
  SupabaseDepositRepository,
  SupabaseBookingRequestRepository,
  SupabaseInspectionRepository,
} from "@/lib/supabase/repositoryAdapters";
import { SupabaseMaintenanceRepository } from "@/lib/supabase/maintenanceAdapters";
import type { Phase7Step } from "./phase7-e2e.server";
import { step, requireOk, type Phase7Runtime } from "./phase7-e2e-runtime";

export interface ProvisionResult {
  steps: Phase7Step[];
  runtime: Phase7Runtime;
}

export async function provisionAndSetup(
  admin: Phase7Client,
  a: Phase7Client,
  b: Phase7Client,
): Promise<ProvisionResult> {
  const steps: Phase7Step[] = [];
  const users: string[] = [];
  const orgs: string[] = [];
  const stamp = crypto.randomUUID();
  const password = `Phase7!${crypto.randomUUID()}`;
  const emailA = `e2e7-a-${stamp}@phase7.test`;
  const emailB = `e2e7-b-${stamp}@phase7.test`;

  async function provision(email: string) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error(created.error?.message ?? "No auth user");
    const userId = created.data.user.id;
    users.push(userId);
    const result = await admin.rpc("provision_account", {
      p_user_id: userId,
      p_email: email,
      p_org_name: `Phase7 ${stamp} ${users.length}`,
      p_first_name: "Phase7",
      p_last_name: "E2E",
    });
    if (result.error) throw result.error;
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row?.organization_id)
      throw new Error("Provision did not return organization");
    orgs.push(row.organization_id);
    return { userId, orgId: row.organization_id as string };
  }

  const pa = await provision(emailA);
  const orgA = pa.orgId;
  const pb = await provision(emailB);
  const orgB = pb.orgId;

  requireOk(
    await step(steps, "authenticated_org_a_and_b", async () => {
      const sa = await a.auth.signInWithPassword({ email: emailA, password });
      const sb = await b.auth.signInWithPassword({ email: emailB, password });
      return (
        !sa.error &&
        !sb.error &&
        sa.data.user?.id === pa.userId &&
        sb.data.user?.id === pb.userId
      );
    }),
  );

  const ctx: Phase4Context = {
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

  requireOk(
    await step(steps, "authenticated_fixture_setup", async () => {
      for (const [table, row] of [
        ["customers", buildCustomerRow(ctx)],
        ["vehicles", buildVehicleRow(ctx)],
        ["rentals", buildRentalRow(ctx)],
      ] as const) {
        const r = await a.from(table).insert(row);
        if (r.error) throw r.error;
      }
      return true;
    }),
  );

  const rentals = new SupabaseRentalRepository(a as never);
  const ledger = new SupabaseLedgerRepository(a as never);
  const deposits = new SupabaseDepositRepository(a as never);
  const bookingRequests = new SupabaseBookingRequestRepository(a as never);
  const inspections = new SupabaseInspectionRepository(a as never);
  const maintenance = new SupabaseMaintenanceRepository(a as never);

  const runtime: Phase7Runtime = {
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
    rentals,
    ledger,
    deposits,
    bookingRequests,
    inspections,
    maintenance,
    recordIds: {},
    phase7: {} as never,
    users,
    orgs,
  };

  return { steps, runtime };
}

/**
 * Provision a single auth user + organization account and sign the
 * publishable client in as that user. Used by the split setup-org-a /
 * setup-org-b stages so each stage performs only 3 Cloud round-trips
 * (createUser + provision_account + signIn). Test-harness only.
 */
export async function provisionOneOrg(
  admin: Phase7Client,
  client: Phase7Client,
  email: string,
  password: string,
  orgName: string,
  authLabel: string,
): Promise<{ userId: string; orgId: string; steps: Phase7Step[] }> {
  const steps: Phase7Step[] = [];

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(created.error?.message ?? "No auth user");
  const userId = created.data.user.id;

  const result = await admin.rpc("provision_account", {
    p_user_id: userId,
    p_email: email,
    p_org_name: orgName,
    p_first_name: "Phase7",
    p_last_name: "E2E",
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.organization_id)
    throw new Error("Provision did not return organization");
  const orgId = row.organization_id as string;

  requireOk(
    await step(steps, authLabel, async () => {
      const sa = await client.auth.signInWithPassword({ email, password });
      return !sa.error && sa.data.user?.id === userId;
    }),
  );

  return { userId, orgId, steps };
}

/**
 * Insert the Phase 1/2 FK-chain base fixtures (customer → vehicle → rental) as
 * the signed-in Org A client so RLS is the real gate. Used by the split
 * setup-base stage. Test-harness only.
 */
export async function createBaseFixtures(
  a: Phase7Client,
  ctx: Phase4Context,
): Promise<{ steps: Phase7Step[] }> {
  const steps: Phase7Step[] = [];
  requireOk(
    await step(steps, "authenticated_fixture_setup", async () => {
      for (const [table, row] of [
        ["customers", buildCustomerRow(ctx)],
        ["vehicles", buildVehicleRow(ctx)],
        ["rentals", buildRentalRow(ctx)],
      ] as const) {
        const r = await a.from(table).insert(row);
        if (r.error) throw r.error;
      }
      return true;
    }),
  );
  return { steps };
}
