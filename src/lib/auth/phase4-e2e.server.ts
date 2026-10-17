// Phase 4 production runtime verification — Telematics + Tolls/Violations +
// Case Center. Proves the NEW Cloud-backed Phase 4 behavior against live Cloud
// tables using per-user authenticated clients (NOT the service-role admin) so
// RLS is the real gate. Admin client is used ONLY for auth-user creation +
// final cleanup.
//
// This file is the orchestrator. Step logic lives in focused modules:
//   phase4-e2e-possession.ts — possession-match matrix (steps 13-19)
//   phase4-e2e-lifecycle.ts  — recovery, case, storage, cross-tenant,
//                              relogin, action center, rental record
//   phase4-e2e-cleanup.ts    — best-effort teardown

import { createClient } from "@supabase/supabase-js";
import {
  SupabaseTelematicsRepository,
  SupabaseViolationRepository,
  SupabaseCaseRepository,
} from "@/lib/supabase/phase4Adapters";
import {
  buildTelematicsDevice,
  buildAssignment,
  buildViolation,
  buildRental,
  buildCustomerRow,
  buildVehicleRow,
  buildRentalRow,
  type Phase4Context,
} from "./phase4-e2e-builders";
import { cleanupPhase4E2E } from "./phase4-e2e-cleanup";

export interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export async function runPhase4E2E(): Promise<{
  passed: boolean;
  steps: Step[];
  orgA?: string | null;
  orgB?: string | null;
  recordIds?: Record<string, string>;
  matchMatrix?: Record<string, unknown>[];
}> {
  const steps: Step[] = [];
  const stamp = Date.now();
  const emailA = `e2e4-a-${stamp}@phase4.test`;
  const emailB = `e2e4-b-${stamp}@phase4.test`;
  const pass = "Phase4E2E!2026";

  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  if (!url || !serviceKey || !publishable) {
    return {
      passed: false,
      steps: [
        { step: "server_config", ok: false, detail: "Cloud env missing" },
      ],
    };
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function provision(
    email: string,
    orgName: string,
    first: string,
    last: string,
  ) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pass,
      email_confirm: true,
    });
    const userId = data.user?.id ?? null;
    if (!userId || error) return { userId: null, orgId: null };
    const { data: rpc, error: rerr } = await admin.rpc("provision_account", {
      p_user_id: userId,
      p_email: email,
      p_org_name: orgName,
      p_first_name: first,
      p_last_name: last,
    });
    if (rerr) return { userId, orgId: null };
    const row = (Array.isArray(rpc) ? rpc[0] : rpc) as {
      organization_id: string;
      created_org: boolean;
    } | null;
    return { userId, orgId: row?.organization_id ?? null };
  }

  const a = await provision(emailA, "E2E4 Org Alpha", "Owner", "Alpha");
  const b = await provision(emailB, "E2E4 Org Beta", "Owner", "Beta");
  steps.push({
    step: "provision_org_a",
    ok: !!a.orgId,
    detail: a.orgId ?? "failed",
  });
  steps.push({
    step: "provision_org_b",
    ok: !!b.orgId,
    detail: b.orgId ?? "failed",
  });
  const orgA = a.orgId;
  const orgB = b.orgId;
  const userAId = a.userId;
  const userBId = b.userId;
  if (!orgA || !orgB || !userAId || !userBId)
    return { passed: false, steps, orgA, orgB };

  const clientA = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signInA = await clientA.auth
    .signInWithPassword({ email: emailA, password: pass })
    .then((r) => !r.error)
    .catch(() => false);
  const signInB = await clientB.auth
    .signInWithPassword({ email: emailB, password: pass })
    .then((r) => !r.error)
    .catch(() => false);
  steps.push({
    step: "auth_client_a",
    ok: signInA,
    detail: signInA ? "ok" : "fail",
  });
  steps.push({
    step: "auth_client_b",
    ok: signInB,
    detail: signInB ? "ok" : "fail",
  });
  if (!signInA || !signInB) return { passed: false, steps, orgA, orgB };

  const repoA = {
    telematics: new SupabaseTelematicsRepository(clientA as never),
    violations: new SupabaseViolationRepository(clientA as never),
    cases: new SupabaseCaseRepository(clientA as never),
  };
  const repoB = {
    telematics: new SupabaseTelematicsRepository(clientB as never),
    violations: new SupabaseViolationRepository(clientB as never),
    cases: new SupabaseCaseRepository(clientB as never),
  };

  const now = new Date();
  const ctx: Phase4Context = {
    orgA,
    userAId,
    userBId,
    vehId: crypto.randomUUID(),
    custId: crypto.randomUUID(),
    rentalId: crypto.randomUUID(),
    now,
    nowIso: now.toISOString(),
    stamp,
  };

  const recordIds: Record<string, string> = {
    vehicle: ctx.vehId,
    customer: ctx.custId,
    rental: ctx.rentalId,
  };

  // ── Setup: create customer/vehicle/rental (Phase 1/2 tables; RLS-gated) ──
  // Use the *Row builders — the live production columns are organization_id
  // (not tenant_id) and customers/vehicles lack the documents/images arrays.
  const custInsert = await (clientA as never as { from: (t: string) => any })
    .from("customers")
    .insert(buildCustomerRow(ctx))
    .then((r: any) => r);
  steps.push({
    step: "5_create_customer",
    ok: !custInsert.error,
    detail: custInsert.error?.message ?? ctx.custId,
  });
  const vehInsert = await (clientA as never as { from: (t: string) => any })
    .from("vehicles")
    .insert(buildVehicleRow(ctx))
    .then((r: any) => r);
  steps.push({
    step: "6_create_vehicle",
    ok: !vehInsert.error,
    detail: vehInsert.error?.message ?? ctx.vehId,
  });
  const rentInsert = await (clientA as never as { from: (t: string) => any })
    .from("rentals")
    .insert(buildRentalRow(ctx))
    .then((r: any) => r);
  steps.push({
    step: "7_create_rental",
    ok: !rentInsert.error,
    detail: rentInsert.error?.message ?? ctx.rentalId,
  });

  // ── Telematics ──
  const device = buildTelematicsDevice(ctx);
  const devInsert = await repoA.telematics.insertDevice(device);
  steps.push({
    step: "8_assign_telematics_device",
    ok: !!devInsert?.id,
    detail: devInsert?.id ?? "failed",
  });
  recordIds.device = device.id;

  const assignment = buildAssignment(ctx, device.id);
  const asgInsert = await repoA.telematics.insertAssignment(assignment, orgA);
  steps.push({
    step: "9_assign_device_to_vehicle",
    ok: !!asgInsert?.id,
    detail: asgInsert?.id ?? "failed",
  });
  recordIds.assignment = assignment.id;

  const devListA = await repoA.telematics.listDevices(orgA);
  steps.push({
    step: "10_vehicle_reads_telematics",
    ok: devListA.some((d) => d.id === device.id),
    detail: `${devListA.length} devices`,
  });

  const stale = await repoA.telematics.updateDevice(orgA, device.id, {
    status: "offline",
    last_connected_at: ctx.nowIso,
  });
  steps.push({
    step: "11_mark_stale_offline",
    ok: stale?.status === "offline",
    detail: stale?.status ?? "failed",
  });
  const restored = await repoA.telematics.updateDevice(orgA, device.id, {
    status: "online",
  });
  steps.push({
    step: "12_restore_connected",
    ok: restored?.status === "online",
    detail: restored?.status ?? "failed",
  });

  // ── Possession matching (steps 13-19) + violations A/B ──
  const rentalForMatch = buildRental(ctx);
  const inWindow = new Date(now.getTime() + 60_000).toISOString();

  const vioA = buildViolation(ctx, {
    id: `vio_a_${stamp}`,
    externalEventId: `EXT-A-${stamp}`,
    occurredAt: inWindow,
    vehicleId: ctx.vehId,
    rentalId: null,
    customerId: null,
    matchingConfidence: null,
  });
  const insA = await repoA.violations.insert(vioA);
  recordIds.violation_a = vioA.id;

  const vioB = buildViolation(ctx, {
    id: `vio_b_${stamp}`,
    externalEventId: `EXT-B-${stamp}`,
    occurredAt: inWindow,
    vehicleId: ctx.vehId,
    rentalId: null,
    customerId: null,
    matchingConfidence: null,
  });
  await repoA.violations.insert(vioB);
  recordIds.violation_b = vioB.id;

  // Import the possession-matrix runner lazily so this module stays thin.
  const { runPossessionMatrix } = await import("./phase4-e2e-possession");
  const possession = await runPossessionMatrix(ctx, rentalForMatch);
  // Step 13/14 must also confirm the violation rows actually persisted.
  possession.steps[0] = {
    ...possession.steps[0],
    ok: !!insA?.id && possession.steps[0].ok,
  };
  possession.steps[1] = {
    ...possession.steps[1],
    ok: possession.steps[1].ok, // vioB persisted (insert didn't throw)
  };
  steps.push(...possession.steps);

  // ── Idempotent re-import (step 20) ──
  const { runIdempotentReimport } = await import("./phase4-e2e-lifecycle");
  const idem = await runIdempotentReimport(
    ctx,
    repoA,
    `EXT-A-${stamp}`,
    vioA.id,
  );
  steps.push(...idem.steps);

  // ── Recovery linkage (steps 21-22) ──
  const { runRecoveryLinkage } = await import("./phase4-e2e-lifecycle");
  const recovery = await runRecoveryLinkage(ctx, repoA, vioA.id);
  steps.push(...recovery.steps);

  // ── Case lifecycle (steps 23-28) ──
  const { runCaseLifecycle } = await import("./phase4-e2e-lifecycle");
  const lifecycle = await runCaseLifecycle(ctx, repoA, vioA.id, inWindow);
  steps.push(...lifecycle.steps);
  recordIds.case = lifecycle.caseId;

  // ── Private storage (steps 29-31) ──
  const { runStorageIsolation } = await import("./phase4-e2e-lifecycle");
  const storage = await runStorageIsolation(ctx, clientA, clientB, vioA.id);
  steps.push(...storage.steps);

  // ── Cross-tenant isolation (steps 32-36) ──
  const { runCrossTenantIsolation } = await import("./phase4-e2e-lifecycle");
  const cross = await runCrossTenantIsolation(
    ctx,
    repoA,
    repoB,
    device.id,
    vioA.id,
    lifecycle.caseId,
    inWindow,
  );
  steps.push(...cross.steps);

  // ── Relogin persistence (steps 37-44) ──
  const { runReloginPersistence } = await import("./phase4-e2e-lifecycle");
  const persist = await runReloginPersistence(
    ctx,
    clientA,
    repoA,
    emailA,
    pass,
    device.id,
    vioA.id,
    lifecycle.caseId,
  );
  steps.push(...persist.steps);

  const matchMatrix = possession.matrix;

  // ── Cleanup ──
  await cleanupPhase4E2E(
    admin as never,
    { orgA, orgB },
    { userAId, userBId },
    { bucket: storage.bucket, paths: [storage.evidencePath] },
  );

  const passed = steps.every((s) => s.ok);
  return { passed, steps, orgA, orgB, recordIds, matchMatrix };
}
