// Phase 5 E2E — provisioning + base fixture setup (authenticated Org A client).
// Extracted so the main E2E runner stays focused. Mirrors the Phase 4 split.
//
// Service role is confined to provisioning. Every assertion uses signed-in
// publishable-key clients. Test-harness only — no product/domain logic changed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { phase5Fixtures } from "./phase5-e2e-fixtures";
import {
  buildCustomerRow,
  buildVehicleRow,
  buildRentalRow,
  type Phase4Context,
} from "./phase4-e2e-builders";
import {
  SupabaseExpenseRepository,
  SupabaseBankingRepository,
  SupabaseInvestorRepository,
} from "@/lib/supabase/phase5Adapters";
import {
  SupabaseLedgerRepository,
  SupabaseDepositRepository,
  SupabaseVehicleRepository,
  SupabaseRentalRepository,
} from "@/lib/supabase/repositoryAdapters";
import type { Phase5Step } from "./phase5-e2e.server";
import { step, requireOk, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface ProvisionResult {
  steps: Phase5Step[];
  runtime: Phase5Runtime;
}

export async function provisionAndSetup(
  admin: SupabaseClient,
  a: SupabaseClient,
  b: SupabaseClient,
): Promise<ProvisionResult> {
  const steps: Phase5Step[] = [];
  const users: string[] = [];
  const orgs: string[] = [];
  const documents: { bucket: string; path: string }[] = [];
  const stamp = crypto.randomUUID();
  const password = `Phase5!${crypto.randomUUID()}`;
  const emailA = `e2e5-a-${stamp}@phase5.test`;
  const emailB = `e2e5-b-${stamp}@phase5.test`;

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
      p_org_name: `Phase5 ${stamp} ${users.length}`,
      p_first_name: "Phase5",
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

  const f = phase5Fixtures(orgA, ctx.vehId);
  f.expense.expense_category_id = crypto.randomUUID();
  const claimId = crypto.randomUUID();
  f.expense.metadata = { damage_claim_id: claimId };

  const recordIds: Record<string, string> = {
    expense: f.expense.id,
    bank: f.bank.id,
    investor: f.investor.id,
    pairing: f.pairing.id,
    settlement: f.settlement.id,
  };

  const expenses = new SupabaseExpenseRepository(a as never);
  const banking = new SupabaseBankingRepository(a as never);
  const investor = new SupabaseInvestorRepository(a as never);
  const ledger = new SupabaseLedgerRepository(a as never);
  const deposits = new SupabaseDepositRepository(a as never);
  const vehicles = new SupabaseVehicleRepository(a as never);
  const rentals = new SupabaseRentalRepository(a as never);

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
      await expenses.insertCategory({
        id: f.expense.expense_category_id!,
        tenant_id: orgA!,
        name: "Phase5 repairs",
        type: "vehicle_direct",
        parent_category_id: null,
        active: true,
        created_at: f.now,
      });
      await banking.insertAccount(f.account);
      await banking.insertBatch({
        id: f.bank.import_batch_id,
        tenant_id: orgA!,
        financial_account_id: f.account.id,
        source_file_name: "phase5.csv",
        source: "csv",
        imported_at: f.now,
        imported_by_user_id: pa.userId,
        row_count: 4,
        accepted_rows: 4,
        duplicate_rows: 0,
        error_rows: 0,
        errors: [],
        hash: stamp,
      });
      return true;
    }),
  );

  const runtime: Phase5Runtime = {
    a: a as never,
    b: b as never,
    admin: admin as never,
    orgA,
    orgB,
    userAId: pa.userId,
    userBId: pb.userId,
    emailA,
    password,
    stamp,
    ctx,
    fixtures: f,
    claimId,
    recordIds,
    documents,
    users,
    orgs,
    expenses,
    banking,
    investor,
    ledger,
    deposits,
    vehicles,
    rentals,
  };

  return { steps, runtime };
}
