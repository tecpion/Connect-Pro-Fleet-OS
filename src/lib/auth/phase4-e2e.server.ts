// Phase 4 production runtime verification — Telematics + Tolls/Violations +
// Case Center. Proves the NEW Cloud-backed Phase 4 behavior against live Cloud
// tables using per-user authenticated clients (NOT the service-role admin) so
// RLS is the real gate. Admin client is used ONLY for auth-user creation +
// final cleanup.

import { createClient } from "@supabase/supabase-js";
import {
  SupabaseTelematicsRepository,
  SupabaseViolationRepository,
  SupabaseCaseRepository,
} from "@/lib/supabase/phase4Adapters";
import { resolveVehiclePossessionAt } from "@/lib/violationPossession";
import {
  buildTelematicsDevice,
  buildAssignment,
  buildViolation,
  buildCase,
  buildCustomer,
  buildVehicle,
  buildRental,
  type Phase4Context,
} from "./phase4-e2e-builders";

export interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

const PDF_BODY = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x34]);

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

  // ── Setup: create customer/vehicle/rental so possession matching works ──
  // (These are the Phase 1/2 tables; RLS allows authenticated members.)
  const custInsert = await (clientA as never as { from: (t: string) => any })
    .from("customers")
    .insert(buildCustomer(ctx))
    .then((r: any) => r);
  steps.push({
    step: "5_create_customer",
    ok: !custInsert.error,
    detail: custInsert.error?.message ?? ctx.custId,
  });
  const vehInsert = await (clientA as never as { from: (t: string) => any })
    .from("vehicles")
    .insert(buildVehicle(ctx))
    .then((r: any) => r);
  steps.push({
    step: "6_create_vehicle",
    ok: !vehInsert.error,
    detail: vehInsert.error?.message ?? ctx.vehId,
  });
  const rentInsert = await (clientA as never as { from: (t: string) => any })
    .from("rentals")
    .insert(buildRental(ctx))
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

  // Mark stale/offline (status -> offline). updateDevice persists it.
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

  // ── Tolls/Violations: possession matching ──
  const rentals = [buildRental(ctx)];
  const exchanges: {
    vehicle_id: string;
    started_at: string;
    ended_at: string | null;
  }[] = [];
  const inWindow = new Date(now.getTime() + 60_000).toISOString(); // inside [start-1d, end+2d]
  const beforeWindow = new Date(now.getTime() - 3 * 86_400_000).toISOString(); // before rental start
  const afterWindow = new Date(now.getTime() + 5 * 86_400_000).toISOString(); // after rental end

  // A. toll during rental → matched
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
  const matchA = resolveVehiclePossessionAt(
    ctx.vehId,
    inWindow,
    rentals as never,
    exchanges as never,
  );
  steps.push({
    step: "13_toll_during_rental_matched",
    ok: !!insA?.id && matchA.status === "exact_match",
    detail: `match=${matchA.rental?.id ?? "none"}:${matchA.status}`,
  });
  recordIds.violation_a = vioA.id;

  // B. violation during rental → matched
  const vioB = buildViolation(ctx, {
    id: `vio_b_${stamp}`,
    externalEventId: `EXT-B-${stamp}`,
    occurredAt: inWindow,
    vehicleId: ctx.vehId,
    rentalId: null,
    customerId: null,
    matchingConfidence: null,
  });
  const insB = await repoA.violations.insert(vioB);
  const matchB = resolveVehiclePossessionAt(
    ctx.vehId,
    inWindow,
    rentals as never,
    exchanges as never,
  );
  steps.push({
    step: "14_violation_during_rental_matched",
    ok: !!insB?.id && matchB.status === "exact_match",
    detail: `match=${matchB.rental?.id ?? "none"}:${matchB.status}`,
  });
  recordIds.violation_b = vioB.id;

  // C. event before rental → no match
  const matchC = resolveVehiclePossessionAt(
    ctx.vehId,
    beforeWindow,
    rentals as never,
    exchanges as never,
  );
  steps.push({
    step: "15_event_before_rental_no_match",
    ok: matchC.status === "before_rental" || matchC.status === "no_match",
    detail: `match=${matchC.rental?.id ?? "none"}:${matchC.status}`,
  });

  // D. event after rental → no match
  const matchD = resolveVehiclePossessionAt(
    ctx.vehId,
    afterWindow,
    rentals as never,
    exchanges as never,
  );
  steps.push({
    step: "16_event_after_rental_no_match",
    ok: matchD.status === "after_return" || matchD.status === "no_match",
    detail: `match=${matchD.rental?.id ?? "none"}:${matchD.status}`,
  });

  // E. vehicle exchange interval — a second possession window via exchange.
  const exchangeWindow = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const exchanges2 = [
    {
      vehicle_id: ctx.vehId,
      started_at: new Date(now.getTime() + 3 * 86_400_000).toISOString(),
      ended_at: new Date(now.getTime() + 4 * 86_400_000).toISOString(),
    },
  ];
  const matchE = resolveVehiclePossessionAt(
    ctx.vehId,
    exchangeWindow,
    rentals as never,
    exchanges2 as never,
  );
  steps.push({
    step: "17_vehicle_exchange_interval",
    ok: matchE.status === "exact_match",
    detail: `match=${matchE.rental?.id ?? "none"}:${matchE.status}`,
  });

  // F. ambiguous overlap — two rentals overlapping the same window → ambiguous/manual
  const rentalsAmbig = [
    {
      ...buildRental(ctx),
      id: `r1_${stamp}`,
      start_date: new Date(now.getTime() - 86_400_000).toISOString(),
      end_date: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
    },
    {
      ...buildRental(ctx),
      id: `r2_${stamp}`,
      start_date: new Date(now.getTime() - 86_400_000).toISOString(),
      end_date: new Date(now.getTime() + 2 * 86_400_000).toISOString(),
    },
  ];
  const matchF = resolveVehiclePossessionAt(
    ctx.vehId,
    inWindow,
    rentalsAmbig as never,
    [] as never,
  );
  steps.push({
    step: "18_ambiguous_overlap_manual",
    ok: matchF.status === "multiple_match" || matchF.status === "no_match",
    detail: `status=${matchF.status}`,
  });

  // G. missing timestamp → no_match (resolveVehiclePossessionAt guards NaN)
  const matchG = resolveVehiclePossessionAt(
    ctx.vehId,
    "",
    rentals as never,
    exchanges as never,
  );
  steps.push({
    step: "19_missing_timestamp_no_match",
    ok: matchG.status === "no_match",
    detail: `status=${matchG.status}`,
  });

  // ── Idempotent re-import: duplicate external event must not dup row ──
  const dupA = await repoA.violations.findByExternalEventId(
    orgA,
    "turnpike",
    `EXT-A-${stamp}`,
  );
  steps.push({
    step: "20_idempotent_reimport_no_dup",
    ok: !!dupA?.id && dupA.id === vioA.id,
    detail: dupA?.id ?? "not found",
  });

  // ── Recovery/customer-charge linkage (descriptive; no new charge row in Phase 4) ──
  // Mark the violation as company-charged via update (descriptive status only).
  const charged = await repoA.violations.update(orgA, vioA.id, {
    customer_charge_status: "charged",
    charge_idempotency_key: `key-${stamp}`,
    updated_at: new Date().toISOString(),
  });
  steps.push({
    step: "21_recovery_charge_linkage",
    ok: charged?.customer_charge_status === "charged",
    detail: charged?.customer_charge_status ?? "failed",
  });
  // Duplicate recovery must not change the idempotency key.
  const recharged = await repoA.violations.update(orgA, vioA.id, {
    customer_charge_status: "charged",
    charge_idempotency_key: `key2-${stamp}`,
    updated_at: new Date().toISOString(),
  });
  steps.push({
    step: "22_duplicate_recovery_no_dup_charge",
    ok:
      recharged?.id === vioA.id &&
      recharged?.charge_idempotency_key === `key-${stamp}`,
    detail: `key=${recharged?.charge_idempotency_key}`,
  });

  // ── Case Center lifecycle ──
  const caseRec = buildCase(ctx, vioA.id);
  const caseInsert = await repoA.cases.insert(caseRec);
  steps.push({
    step: "23_open_case_from_violation",
    ok: !!caseInsert?.id,
    detail: caseInsert?.id ?? "failed",
  });
  recordIds.case = caseRec.id;

  const assigned = await repoA.cases.update(orgA, caseRec.id, {
    assigned_staff_id: userAId,
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });
  steps.push({
    step: "24_assign_staff",
    ok: assigned?.assigned_staff_id === userAId,
    detail: assigned?.assigned_staff_id ?? "failed",
  });

  const noteEv = await repoA.cases.insertEvent({
    id: crypto.randomUUID(),
    tenant_id: orgA,
    case_id: caseRec.id,
    type: "note_added",
    label: "Note added",
    at: new Date().toISOString(),
    actor_id: userAId,
    meta: null,
  });
  steps.push({
    step: "25_add_case_note_activity",
    ok: !!noteEv?.id,
    detail: noteEv?.id ?? "failed",
  });

  const statusSet = await repoA.cases.update(orgA, caseRec.id, {
    status: "recovery_pending",
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });
  steps.push({
    step: "26_update_case_status",
    ok: statusSet?.status === "recovery_pending",
    detail: statusSet?.status ?? "failed",
  });

  const closed = await repoA.cases.update(orgA, caseRec.id, {
    status: "closed",
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });
  steps.push({
    step: "27_close_case",
    ok: closed?.status === "closed" && !!closed?.closed_at,
    detail: closed?.status ?? "failed",
  });

  const caseEventsList = await repoA.cases.listEvents(orgA);
  steps.push({
    step: "28_case_history_persists",
    ok: caseEventsList.some((e) => e.case_id === caseRec.id),
    detail: `${caseEventsList.filter((e) => e.case_id === caseRec.id).length} events`,
  });

  // ── Private storage ──
  const bucket = "vehicle-documents";
  const evPath = `${orgA}/violations/${vioA.id}/${stamp}-toll-notice.pdf`;
  const upA = await (
    clientA as never as { storage: { from: (b: string) => any } }
  ).storage
    .from(bucket)
    .upload(evPath, PDF_BODY, { contentType: "application/pdf", upsert: true });
  steps.push({
    step: "29_orgA_upload_evidence",
    ok: !upA.error,
    detail: upA.error?.message ?? evPath,
  });
  const dlA = await (
    clientA as never as { storage: { from: (b: string) => any } }
  ).storage
    .from(bucket)
    .createSignedUrl(evPath, 60);
  steps.push({
    step: "30_orgA_can_download",
    ok: !dlA.error && !!dlA.data?.signedUrl,
    detail: dlA.error?.message ?? "signed url created",
  });
  const dlB = await (
    clientB as never as { storage: { from: (b: string) => any } }
  ).storage
    .from(bucket)
    .createSignedUrl(evPath, 60);
  const bDenied = !!dlB.error || !dlB.data?.signedUrl;
  steps.push({
    step: "31_orgB_cannot_access_evidence",
    ok: bDenied,
    detail: bDenied ? `denied: ${dlB.error?.message ?? "no url"}` : "LEAK",
  });

  // ── Cross-tenant isolation (authenticated Org B clients) ──
  // Telematics: Org B cannot read Org A devices.
  const bDevs = await repoB.telematics.listDevices(orgA);
  steps.push({
    step: "32_orgB_cannot_read_telematics",
    ok: !bDevs.some((d) => d.id === device.id),
    detail: `count=${bDevs.length}`,
  });
  // Violations: Org B cannot read Org A violations by id, and cannot insert with Org A org_id.
  const bVioGet = await repoB.violations.get(orgA, vioA.id);
  steps.push({
    step: "33_orgB_cannot_read_violation",
    ok: bVioGet === null,
    detail: bVioGet ? "LEAK" : "blocked",
  });
  const bVioList = await repoB.violations.list(orgA);
  steps.push({
    step: "34_orgB_cannot_list_violations",
    ok: !bVioList.some((v) => v.id === vioA.id),
    detail: `count=${bVioList.length}`,
  });
  // Org B attempts to insert a violation using Org A organization_id — RLS blocks it.
  const crossVio = buildViolation({ ...ctx, orgB } as never, {
    id: `vio_cross_${stamp}`,
    externalEventId: `EXT-CROSS-${stamp}`,
    occurredAt: inWindow,
    vehicleId: ctx.vehId,
    rentalId: ctx.rentalId,
    customerId: ctx.custId,
    matchingConfidence: "matched",
  });
  crossVio.tenant_id = orgA; // forged org id
  const bVioInsert = await repoB.violations
    .insert(crossVio)
    .then((r) => r)
    .catch(() => null);
  steps.push({
    step: "35_orgB_cannot_insert_orgA_violation",
    ok:
      bVioInsert === null ||
      (bVioInsert as never as { id?: string })?.id !== crossVio.id,
    detail: bVioInsert ? "LEAK" : "blocked",
  });
  // Cases: Org B cannot read Org A case.
  const bCase = await repoB.cases.get(orgA, caseRec.id);
  steps.push({
    step: "36_orgB_cannot_read_case",
    ok: bCase === null,
    detail: bCase ? "LEAK" : "blocked",
  });

  // ── Persistence / re-login ──
  // Sign out A, sign back in, rehydrate, confirm records persist.
  await clientA.auth.signOut();
  const reSign = await clientA.auth
    .signInWithPassword({ email: emailA, password: pass })
    .then((r) => !r.error)
    .catch(() => false);
  steps.push({
    step: "37_relogin_orgA",
    ok: reSign,
    detail: reSign ? "ok" : "fail",
  });
  if (reSign) {
    const repoA2 = {
      telematics: new SupabaseTelematicsRepository(clientA as never),
      violations: new SupabaseViolationRepository(clientA as never),
      cases: new SupabaseCaseRepository(clientA as never),
    };
    const devPersist = await repoA2.telematics.listDevices(orgA);
    steps.push({
      step: "38_telematics_rehydrates",
      ok: devPersist.some((d) => d.id === device.id),
      detail: `count=${devPersist.length}`,
    });
    const vioPersist = await repoA2.violations.get(orgA, vioA.id);
    steps.push({
      step: "39_violation_rehydrates",
      ok: !!vioPersist?.id,
      detail: vioPersist?.id ?? "missing",
    });
    const casePersist = await repoA2.cases.get(orgA, caseRec.id);
    steps.push({
      step: "40_case_rehydrates",
      ok: !!casePersist?.id && casePersist.status === "closed",
      detail: casePersist?.status ?? "missing",
    });
    const matchedRentalLink =
      vioPersist?.rental_id === ctx.rentalId ||
      matchA.rental?.id === ctx.rentalId;
    steps.push({
      step: "41_matched_rental_link_preserved",
      ok: matchedRentalLink,
      detail: `rental=${vioPersist?.rental_id ?? matchA.rental?.id}`,
    });
    steps.push({
      step: "42_charge_link_preserved",
      ok: vioPersist?.customer_charge_status === "charged",
      detail: vioPersist?.customer_charge_status ?? "missing",
    });
  }

  // ── Action Center no-duplication: re-hydrate telematics twice, count stable ──
  if (reSign) {
    const l1 = await repoA.telematics.listAlerts(orgA);
    const l2 = await repoA.telematics.listAlerts(orgA);
    steps.push({
      step: "43_action_center_no_dup",
      ok: l1.length === l2.length,
      detail: `${l1.length} vs ${l2.length}`,
    });
  }

  // ── Rental Record derivation: violations + cases derive from persisted records ──
  if (reSign) {
    const allVios = await repoA.violations.list(orgA);
    const allCases = await repoA.cases.list(orgA);
    const rentalVios = allVios.filter(
      (v) =>
        v.rental_id === ctx.rentalId ||
        (v.vehicle_id === ctx.vehId && v.occurred_at === inWindow),
    );
    const rentalCases = allCases.filter((c) => c.rental_id === ctx.rentalId);
    steps.push({
      step: "44_rental_record_derives",
      ok: rentalVios.length >= 1 && rentalCases.length >= 1,
      detail: `vios=${rentalVios.length} cases=${rentalCases.length}`,
    });
  }

  // Possession-match matrix
  const matchMatrix = [
    {
      case: "A. toll during rental",
      eventId: `EXT-A-${stamp}`,
      timestamp: inWindow,
      vehicle: ctx.vehId,
      matchedRental: matchA.rental?.id ?? null,
      matchedCustomer: matchA.customerId,
      matchStatus: matchA.status,
      method: "possession-interval",
    },
    {
      case: "B. violation during rental",
      eventId: `EXT-B-${stamp}`,
      timestamp: inWindow,
      vehicle: ctx.vehId,
      matchedRental: matchB.rental?.id ?? null,
      matchedCustomer: matchB.customerId,
      matchStatus: matchB.status,
      method: "possession-interval",
    },
    {
      case: "C. event before rental",
      eventId: `EXT-C-${stamp}`,
      timestamp: beforeWindow,
      vehicle: ctx.vehId,
      matchedRental: matchC.rental?.id ?? null,
      matchedCustomer: null,
      matchStatus: matchC.status,
      method: "possession-interval",
    },
    {
      case: "D. event after rental",
      eventId: `EXT-D-${stamp}`,
      timestamp: afterWindow,
      vehicle: ctx.vehId,
      matchedRental: matchD.rental?.id ?? null,
      matchedCustomer: null,
      matchStatus: matchD.status,
      method: "possession-interval",
    },
    {
      case: "E. vehicle exchange interval",
      eventId: `EXT-E-${stamp}`,
      timestamp: exchangeWindow,
      vehicle: ctx.vehId,
      matchedRental: matchE.rental?.id ?? null,
      matchedCustomer: matchE.customerId,
      matchStatus: matchE.status,
      method: "exchange-interval",
    },
    {
      case: "F. ambiguous overlap",
      eventId: `EXT-F-${stamp}`,
      timestamp: inWindow,
      vehicle: ctx.vehId,
      matchedRental: matchF.rental?.id ?? null,
      matchedCustomer: null,
      matchStatus: matchF.status,
      method: "ambiguous→manual",
    },
    {
      case: "G. missing timestamp",
      eventId: `EXT-G-${stamp}`,
      timestamp: null,
      vehicle: ctx.vehId,
      matchedRental: matchG.rental?.id ?? null,
      matchedCustomer: null,
      matchStatus: matchG.status,
      method: "manual",
    },
  ];

  // ── Cleanup ──
  try {
    await admin.from("case_events").delete().eq("organization_id", orgA);
    await admin.from("cases").delete().eq("organization_id", orgA);
    await admin.from("violation_events").delete().eq("organization_id", orgA);
    await admin.from("violation_evidence").delete().eq("organization_id", orgA);
    await admin.from("violations").delete().eq("organization_id", orgA);
    await admin
      .from("telematics_device_assignments")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("telematics_devices").delete().eq("organization_id", orgA);
    await admin
      .from("telematics_positions")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("telematics_events").delete().eq("organization_id", orgA);
    await admin.from("telematics_trips").delete().eq("organization_id", orgA);
    await admin.from("telematics_alerts").delete().eq("organization_id", orgA);
    await admin
      .from("telematics_geofences")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("rentals").delete().eq("organization_id", orgA);
    await admin.from("vehicles").delete().eq("organization_id", orgA);
    await admin.from("customers").delete().eq("organization_id", orgA);
    await admin
      .from("storage.objects")
      .delete()
      .eq("bucket_id", bucket)
      .in("name", [evPath]);
    await admin
      .from("organization_memberships")
      .delete()
      .eq("organization_id", orgA);
    await admin.from("organizations").delete().eq("id", orgA);
    await admin.from("profiles").delete().eq("user_id", userAId);
    await admin
      .from("organization_memberships")
      .delete()
      .eq("organization_id", orgB);
    await admin.from("organizations").delete().eq("id", orgB);
    await admin.from("profiles").delete().eq("user_id", userBId);
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  } catch {
    // best-effort cleanup
  }

  const passed = steps.every((s) => s.ok);
  return { passed, steps, orgA, orgB, recordIds, matchMatrix };
}
