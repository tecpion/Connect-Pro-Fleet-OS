// Phase 9D E2E — provisioning. Reuses the Phase 7 provision_account + base
// fixture helpers (customer → vehicle → rental) so Phase 9 records that carry
// FKs (receipts → payment_transaction_id, agreement instances → reservation) have
// valid rows to point at. Service role is confined to auth-user creation +
// provision_account RPC; every fixture insert uses the signed-in Org A
// publishable-key client so RLS is the real gate. Test-harness only.

import type { Phase9Client } from "./phase9-e2e-runtime";
import { provisionOneOrg, createBaseFixtures } from "./phase7-e2e-provision";
import {
  SupabaseRentalEventsRepository,
  SupabaseInvoicesRepository,
  SupabaseReceiptsRepository,
  SupabasePaymentArrangementsRepository,
  SupabaseAgreementsRepository,
  SupabaseActivityAuditRepository,
} from "@/lib/supabase/phase9Adapters";
import { SupabaseLedgerRepository } from "@/lib/supabase/repositoryAdapters";
import { step, requireOk, type Phase9Runtime } from "./phase9-e2e-runtime";
import type { Phase9Step } from "./phase9-e2e.server";

export interface Phase9ProvisionResult {
  steps: Phase9Step[];
  runtime: Phase9Runtime;
}

export async function provisionAndSetupPhase9(
  admin: Phase9Client,
  a: Phase9Client,
  b: Phase9Client,
): Promise<Phase9ProvisionResult> {
  const steps: Phase9Step[] = [];
  const users: string[] = [];
  const orgs: string[] = [];
  const stamp = crypto.randomUUID();
  const password = `Phase9!${crypto.randomUUID()}`;
  const emailA = `e2e9-a-${stamp}@phase9.test`;
  const emailB = `e2e9-b-${stamp}@phase9.test`;

  async function provision(email: string, orgName: string) {
    const result = await provisionOneOrg(
      admin,
      a,
      email,
      password,
      orgName,
      "authenticated_org_a_phase9",
    );
    users.push(result.userId);
    orgs.push(result.orgId);
    steps.push(...result.steps);
    return result;
  }

  const pa = await provision(emailA, `Phase9 ${stamp} 1`);
  const orgA = pa.orgId;
  const pb = await provisionOneOrg(
    admin,
    b,
    emailB,
    password,
    `Phase9 ${stamp} 2`,
    "authenticated_org_b_phase9",
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

  requireOk((await createBaseFixtures(a, ctx)).steps.every((s) => s.ok));
  steps.push({ step: "phase9_base_fixtures", ok: true });

  const rentalEvents = new SupabaseRentalEventsRepository(a as never);
  const invoices = new SupabaseInvoicesRepository(a as never);
  const receipts = new SupabaseReceiptsRepository(a as never);
  const paymentArrangements = new SupabasePaymentArrangementsRepository(a as never);
  const agreements = new SupabaseAgreementsRepository(a as never);
  const activityAudit = new SupabaseActivityAuditRepository(a as never);
  const ledger = new SupabaseLedgerRepository(a as never);

  const runtime: Phase9Runtime = {
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
    rentalEvents,
    invoices,
    receipts,
    paymentArrangements,
    agreements,
    activityAudit,
    ledger,
    recordIds: {},
    phase9: {} as never,
    users,
    orgs,
  };

  return { steps, runtime };
}