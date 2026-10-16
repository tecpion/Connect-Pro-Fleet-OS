// Phase 3 production runtime verification — Compliance + Verification.
//
// Proves the NEW Cloud-backed compliance + verification behavior directly,
// against live Cloud tables, using per-user authenticated clients (NOT the
// service-role admin) so RLS is the real gate. The release gate is a pure
// function over domain objects; this E2E reads those objects back from Cloud
// via the SAME repository adapters the UI store hydrates from, then feeds them
// into evaluateRentalReleaseGate to prove the gate consumes Cloud-backed state.
//
// Admin client is used ONLY for auth-user creation + final cleanup.

import { createClient } from "@supabase/supabase-js";
import { SupabaseComplianceRepository, SupabaseVerificationRepository } from "@/lib/supabase/complianceVerificationAdapters";
import {
  buildVehicle,
  buildRental,
  buildDrivers,
  type Phase3Context,
} from "./phase3-e2e-builders";
import { runComplianceSteps, type Step, type GateInputs } from "./phase3-e2e-compliance";
import { runVerificationSteps, runHydrationSteps } from "./phase3-e2e-verification";
import { runStorageSteps } from "./phase3-e2e-storage";

export async function runPhase3E2E(): Promise<{
  passed: boolean;
  steps: Step[];
  orgA?: string | null;
  orgB?: string | null;
}> {
  const steps: Step[] = [];
  const stamp = Date.now();
  const emailA = `e2e3-a-${stamp}@phase3.test`;
  const emailB = `e2e3-b-${stamp}@phase3.test`;
  const pass = "Phase3E2E!2026";

  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  if (!url || !serviceKey || !publishable) {
    return { passed: false, steps: [{ step: "server_config", ok: false, detail: "Cloud env missing" }] };
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function provision(email: string, orgName: string, first: string, last: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
    const userId = data.user?.id ?? null;
    if (!userId || error) return { userId: null, orgId: null };
    const { data: rpc, error: rerr } = await admin.rpc("provision_account", {
      p_user_id: userId, p_email: email, p_org_name: orgName, p_first_name: first, p_last_name: last,
    });
    const row = (Array.isArray(rpc) ? rpc[0] : rpc) as { organization_id: string; created_org: boolean } | null;
    return { userId, orgId: row?.organization_id ?? null };
  }

  const a = await provision(emailA, "E2E3 Org Alpha", "Owner", "Alpha");
  const b = await provision(emailB, "E2E3 Org Beta", "Owner", "Beta");
  steps.push({ step: "provision_org_a", ok: !!a.orgId, detail: a.orgId ?? "failed" });
  steps.push({ step: "provision_org_b", ok: !!b.orgId, detail: b.orgId ?? "failed" });
  const orgA = a.orgId;
  const orgB = b.orgId;
  const userAId = a.userId;
  const userBId = b.userId;
  if (!orgA || !orgB || !userAId || !userBId) return { passed: false, steps, orgA, orgB };

  const clientA = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const clientB = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  const signInA = await clientA.auth.signInWithPassword({ email: emailA, password: pass }).then((r) => !r.error).catch(() => false);
  const signInB = await clientB.auth.signInWithPassword({ email: emailB, password: pass }).then((r) => !r.error).catch(() => false);
  steps.push({ step: "auth_client_a", ok: signInA, detail: signInA ? "ok" : "fail" });
  steps.push({ step: "auth_client_b", ok: signInB, detail: signInB ? "ok" : "fail" });
  if (!signInA || !signInB) return { passed: false, steps, orgA, orgB };

  const repoA = { compliance: new SupabaseComplianceRepository(clientA as never), verification: new SupabaseVerificationRepository(clientA as never) };
  const repoB = { compliance: new SupabaseComplianceRepository(clientB as never), verification: new SupabaseVerificationRepository(clientB as never) };

  // Fresh client simulates logout/login.
  const clientA2 = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  await clientA2.auth.signInWithPassword({ email: emailA, password: pass });
  const repoA2 = { compliance: new SupabaseComplianceRepository(clientA2 as never), verification: new SupabaseVerificationRepository(clientA2 as never) };

  const now = new Date();
  const ctx: Phase3Context = {
    orgA, userAId, userBId,
    vehId: crypto.randomUUID(), custId: crypto.randomUUID(), rentalId: crypto.randomUUID(),
    now, nowIso: now.toISOString(), stamp,
  };
  const inputs: GateInputs = { rental: buildRental(ctx), vehicle: buildVehicle(ctx), drivers: buildDrivers(ctx), now };

  const createdDocIds: string[] = [];
  const createdReqIds: string[] = [];
  const createdOverrideIds: string[] = [];
  const createdVReqIds: string[] = [];
  const createdVRequirementIds: string[] = [];
  const createdVOverrideIds: string[] = [];
  const storagePaths: string[] = [];

  try {
    const cSteps = await runComplianceSteps(ctx, repoA, repoA2, repoB, inputs, createdDocIds, createdReqIds, createdOverrideIds);
    const vSteps = await runVerificationSteps(ctx, repoA, repoA2, repoB, inputs, createdVReqIds, createdVRequirementIds, createdVOverrideIds);
    const sSteps = await runStorageSteps(ctx, clientA as never, clientB as never, storagePaths);
    const hSteps = await runHydrationSteps(ctx, repoA2, inputs);
    steps.push(...cSteps, ...vSteps, ...sSteps, ...hSteps);
  } finally {
    for (const id of createdDocIds) await admin.from("compliance_documents").delete().eq("id", id);
    for (const id of createdReqIds) await admin.from("compliance_requirements").delete().eq("id", id);
    for (const id of createdOverrideIds) await admin.from("compliance_overrides").delete().eq("id", id);
    for (const id of createdVReqIds) await admin.from("verification_requests").delete().eq("id", id);
    for (const id of createdVRequirementIds) await admin.from("verification_requirements").delete().eq("id", id);
    for (const id of createdVOverrideIds) await admin.from("verification_overrides").delete().eq("id", id);
    for (const p of storagePaths) {
      await admin.storage.from("vehicle-documents").remove([p]);
      await admin.storage.from("customer-documents").remove([p]);
    }
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  }

  const passed = steps.every((s) => s.ok);
  return { passed, steps, orgA, orgB };
}
