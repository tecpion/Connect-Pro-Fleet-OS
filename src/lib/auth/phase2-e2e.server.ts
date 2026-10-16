// Phase 2 E2E test runner — server-only orchestrator.
import { createClient } from "@supabase/supabase-js";
import {
  SupabaseCustomerRepository,
  SupabaseVehicleRepository,
  SupabaseReservationRepository,
  SupabaseBookingRequestRepository,
  SupabaseInspectionRepository,
  SupabaseDepositRepository,
} from "@/lib/supabase/repositoryAdapters";
import type { Customer, Vehicle, Reservation } from "@/lib/types";
import type { BookingRequest } from "@/lib/bookingRequestTypes";
import type { RentalDeposit, DepositHistoryEvent } from "@/lib/depositTypes";
import {
  buildCustomer,
  buildVehicle,
  buildBooking,
  buildReservation,
  buildDeposit,
  buildDepositHistory,
  buildInspection,
} from "./phase2-e2e-builders";
import { insertRental, insertLedgerTxn } from "./phase2-e2e-inserts";
import {
  type TestCtx,
  makeCtx,
  provisionOrg,
  checkIdempotency,
  cleanup,
} from "./phase2-e2e-helpers";

export interface E2EResult {
  passed: boolean;
  steps: { step: string; ok: boolean; detail?: string }[];
  orgA: string | null;
  orgB: string | null;
  records: Record<string, string>;
}

// DbClient and createClient are imported from phase2-e2e-helpers

interface RepoSet {
  customers: SupabaseCustomerRepository;
  vehicles: SupabaseVehicleRepository;
  reservations: SupabaseReservationRepository;
  bookings: SupabaseBookingRequestRepository;
  inspections: SupabaseInspectionRepository;
  deposits: SupabaseDepositRepository;
}

function makeRepos(c: DbClient): RepoSet {
  return {
    customers: new SupabaseCustomerRepository(c as never),
    vehicles: new SupabaseVehicleRepository(c as never),
    reservations: new SupabaseReservationRepository(c as never),
    bookings: new SupabaseBookingRequestRepository(c as never),
    inspections: new SupabaseInspectionRepository(c as never),
    deposits: new SupabaseDepositRepository(c as never),
  };
}

export async function runPhase2E2E(): Promise<E2EResult> {
  const stamp = Date.now();
  const emailA = `e2e-a-${stamp}@phase2.test`;
  const emailB = `e2e-b-${stamp}@phase2.test`;
  const pass = "Phase2E2E!2026";

  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
  if (!url || !serviceKey || !publishable) {
    return {
      passed: false,
      orgA: null,
      orgB: null,
      steps: [
        { step: "server_config", ok: false, detail: "Cloud env missing" },
      ],
      records: {},
    };
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ctx: TestCtx = makeCtx(stamp, admin);

  // 1-2. Provision Org A
  const { userId: userAId, orgId: orgA } = await provisionOrg(
    ctx,
    emailA,
    pass,
    "E2E Org Alpha",
    "1_create_auth_user_a",
    "2_provision_account_a",
  );
  // 3-4. Provision Org B
  const { userId: userBId, orgId: orgB } = await provisionOrg(
    ctx,
    emailB,
    pass,
    "E2E Org Beta",
    "3_create_auth_user_b",
    "4_provision_account_b",
  );

  if (!userAId || !userBId || !orgA || !orgB) {
    await cleanup(ctx);
    return { passed: false, steps: ctx.steps, orgA, orgB, records: {} };
  }

  // 5. Idempotency
  await checkIdempotency(ctx, userAId, emailA, orgA);

  // 6-7. Authenticated clients
  const clientA = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signInOkA = await clientA.auth
    .signInWithPassword({ email: emailA, password: pass })
    .then((r) => !r.error)
    .catch(() => false);
  const signInOkB = await clientB.auth
    .signInWithPassword({ email: emailB, password: pass })
    .then((r) => !r.error)
    .catch(() => false);
  ctx.steps.push({ step: "6_authenticated_client_a", ok: signInOkA });
  ctx.steps.push({ step: "7_authenticated_client_b", ok: signInOkB });

  if (!signInOkA || !signInOkB) {
    await cleanup(ctx);
    return { passed: false, steps: ctx.steps, orgA, orgB, records: {} };
  }

  const repoA = makeRepos(clientA);
  const repoB = makeRepos(clientB);

  // 8-9. Customer + vehicle
  const customerA = buildCustomer(orgA, stamp);
  const vehicleA = buildVehicle(orgA, stamp);
  try {
    const c = await repoA.customers.insert(customerA);
    ctx.createdRows.push({ table: "customers", id: customerA.id });
    ctx.steps.push({
      step: "8_orgA_create_customer",
      ok: c.id === customerA.id,
      detail: c.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "8_orgA_create_customer",
      ok: false,
      detail: String(e),
    });
  }
  try {
    const v = await repoA.vehicles.insert(vehicleA);
    ctx.createdRows.push({ table: "vehicles", id: vehicleA.id });
    ctx.steps.push({
      step: "9_orgA_create_vehicle",
      ok: v.id === vehicleA.id,
      detail: v.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "9_orgA_create_vehicle",
      ok: false,
      detail: String(e),
    });
  }

  // 10. Booking request
  const bookingA = buildBooking(orgA, vehicleA.id, stamp, customerA.id);
  try {
    const b = await repoA.bookings.insert(bookingA);
    ctx.createdRows.push({ table: "booking_requests", id: bookingA.id });
    ctx.steps.push({
      step: "10_orgA_create_booking_request",
      ok: b.id === bookingA.id,
      detail: b.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "10_orgA_create_booking_request",
      ok: false,
      detail: String(e),
    });
  }

  // 11. Reservation
  const reservationA = buildReservation(orgA, vehicleA.id, customerA.id, stamp);
  try {
    const r = await repoA.reservations.insert(reservationA);
    ctx.createdRows.push({ table: "reservations", id: reservationA.id });
    ctx.steps.push({
      step: "11_orgA_create_reservation",
      ok: r.id === reservationA.id,
      detail: r.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "11_orgA_create_reservation",
      ok: false,
      detail: String(e),
    });
  }

  // 12-13. Deposit + history
  const depositA = buildDeposit(
    orgA,
    reservationA.id,
    customerA.id,
    vehicleA.id,
  );
  try {
    const d = await repoA.deposits.insert(depositA);
    ctx.createdRows.push({ table: "security_deposits", id: depositA.id });
    ctx.steps.push({
      step: "12_orgA_create_deposit",
      ok: d.id === depositA.id,
      detail: d.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "12_orgA_create_deposit",
      ok: false,
      detail: String(e),
    });
  }
  const histEvent = buildDepositHistory(orgA, depositA.id, stamp);
  try {
    const h = await repoA.deposits.insertHistory(histEvent);
    ctx.createdRows.push({ table: "deposit_history_events", id: histEvent.id });
    ctx.steps.push({
      step: "13_orgA_deposit_history",
      ok: h.id === histEvent.id,
      detail: h.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "13_orgA_deposit_history",
      ok: false,
      detail: String(e),
    });
  }

  // 14. Inspection
  const inspectionA = buildInspection(orgA, reservationA.id, vehicleA.id);
  try {
    const i = await repoA.inspections.insert(inspectionA);
    ctx.createdRows.push({ table: "inspections", id: inspectionA.id });
    ctx.steps.push({
      step: "14_orgA_create_inspection",
      ok: i.id === inspectionA.id,
      detail: i.id,
    });
  } catch (e) {
    ctx.steps.push({
      step: "14_orgA_create_inspection",
      ok: false,
      detail: String(e),
    });
  }

  // 15-16. Rental
  const rentalId = crypto.randomUUID();
  try {
    const r = await repoA.reservations.update(orgA, reservationA.id, {
      converted_to_rental_id: rentalId,
      status: "active",
    });
    ctx.steps.push({
      step: "15_orgA_reservation_links_rental",
      ok: r.converted_to_rental_id === rentalId,
      detail: `linked=${r.converted_to_rental_id}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "15_orgA_reservation_links_rental",
      ok: false,
      detail: String(e),
    });
  }
  try {
    const rId = await insertRental(
      clientA,
      orgA,
      rentalId,
      reservationA.id,
      customerA.id,
      vehicleA.id,
      stamp,
    );
    if (rId) ctx.createdRows.push({ table: "rentals", id: rentalId });
    ctx.steps.push({
      step: "16_orgA_create_rental",
      ok: !!rId,
      detail: rId ?? "failed",
    });
  } catch (e) {
    ctx.steps.push({
      step: "16_orgA_create_rental",
      ok: false,
      detail: String(e),
    });
  }

  // 17-18. Charge + payment
  try {
    const cId = await insertLedgerTxn(
      clientA,
      orgA,
      rentalId,
      reservationA.id,
      customerA.id,
      vehicleA.id,
      "rental_charge",
      400,
    );
    if (cId)
      ctx.createdRows.push({ table: "rental_ledger_transactions", id: cId });
    ctx.steps.push({
      step: "17_orgA_record_charge",
      ok: !!cId,
      detail: cId ?? "failed",
    });
  } catch (e) {
    ctx.steps.push({
      step: "17_orgA_record_charge",
      ok: false,
      detail: String(e),
    });
  }
  try {
    const pId = await insertLedgerTxn(
      clientA,
      orgA,
      rentalId,
      reservationA.id,
      customerA.id,
      vehicleA.id,
      "rental_payment",
      200,
    );
    if (pId)
      ctx.createdRows.push({ table: "rental_ledger_transactions", id: pId });
    ctx.steps.push({
      step: "18_orgA_record_payment",
      ok: !!pId,
      detail: pId ?? "failed",
    });
  } catch (e) {
    ctx.steps.push({
      step: "18_orgA_record_payment",
      ok: false,
      detail: String(e),
    });
  }

  // 19. Production rows confirmed
  try {
    const checks = await Promise.all([
      admin.from("customers").select("id").eq("id", customerA.id).maybeSingle(),
      admin.from("vehicles").select("id").eq("id", vehicleA.id).maybeSingle(),
      admin
        .from("reservations")
        .select("id")
        .eq("id", reservationA.id)
        .maybeSingle(),
      admin.from("rentals").select("id").eq("id", rentalId).maybeSingle(),
      admin
        .from("booking_requests")
        .select("id")
        .eq("id", bookingA.id)
        .maybeSingle(),
      admin
        .from("security_deposits")
        .select("id")
        .eq("id", depositA.id)
        .maybeSingle(),
      admin
        .from("inspections")
        .select("id")
        .eq("id", inspectionA.id)
        .maybeSingle(),
    ]);
    const allOk = checks.every((c) => !!c.data);
    ctx.steps.push({
      step: "19_production_rows_confirmed",
      ok: allOk,
      detail: `all=${allOk}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "19_production_rows_confirmed",
      ok: false,
      detail: String(e),
    });
  }

  // 20. Org A reads own data
  try {
    const c = await repoA.customers.get(orgA, customerA.id);
    const v = await repoA.vehicles.get(orgA, vehicleA.id);
    const r = await repoA.reservations.get(orgA, reservationA.id);
    const b = await repoA.bookings.list(orgA);
    const d = await repoA.deposits.list(orgA);
    const i = await repoA.inspections.list(orgA);
    ctx.steps.push({
      step: "20_orgA_reads_own_data",
      ok:
        !!c &&
        !!v &&
        !!r &&
        b.some((x) => x.id === bookingA.id) &&
        d.some((x) => x.id === depositA.id) &&
        i.some((x) => x.id === inspectionA.id),
      detail: `c=${!!c} v=${!!v} r=${!!r} brq=${b.some((x) => x.id === bookingA.id)} dep=${d.some((x) => x.id === depositA.id)} insp=${i.some((x) => x.id === inspectionA.id)}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "20_orgA_reads_own_data",
      ok: false,
      detail: String(e),
    });
  }

  // 21. Cross-tenant read
  try {
    const c = await repoB.customers.get(orgA, customerA.id);
    const v = await repoB.vehicles.get(orgA, vehicleA.id);
    const r = await repoB.reservations.get(orgA, reservationA.id);
    const b = await repoB.bookings.list(orgA);
    ctx.steps.push({
      step: "21_orgB_cannot_read_orgA",
      ok: c === null && v === null && r === null && b.length === 0,
      detail: `c=${c ? "LEAK" : "blocked"} v=${v ? "LEAK" : "blocked"} r=${r ? "LEAK" : "blocked"} brq=${b.length > 0 ? "LEAK" : "blocked"}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "21_orgB_cannot_read_orgA",
      ok: false,
      detail: String(e),
    });
  }

  // 22. Cross-tenant update
  try {
    let affected = 0;
    try {
      const upd = await repoB.customers.update(orgA, customerA.id, {
        first_name: "HACKED",
      });
      if (upd) affected = 1;
    } catch {
      /* RLS */
    }
    ctx.steps.push({
      step: "22_orgB_cannot_update_orgA",
      ok: affected === 0,
      detail: `affected=${affected}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "22_orgB_cannot_update_orgA",
      ok: false,
      detail: String(e),
    });
  }

  // 23-25. Cross-tenant inserts
  try {
    let inserted = false;
    try {
      const crossCust: Customer = {
        ...customerA,
        id: crypto.randomUUID(),
        tenant_id: orgA,
        email: "cross@phase2.test",
      };
      const res = await repoB.customers.insert(crossCust);
      if (res) {
        inserted = true;
        ctx.createdRows.push({ table: "customers", id: res.id });
      }
    } catch {
      /* RLS */
    }
    ctx.steps.push({
      step: "23_orgB_cannot_insert_orgA_id",
      ok: !inserted,
      detail: `inserted=${inserted}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "23_orgB_cannot_insert_orgA_id",
      ok: false,
      detail: String(e),
    });
  }
  try {
    let inserted = false;
    try {
      const crossVeh: Vehicle = {
        ...vehicleA,
        id: crypto.randomUUID(),
        tenant_id: orgA,
        vin: `CROSS${stamp}`,
      };
      const res = await repoB.vehicles.insert(crossVeh);
      if (res) {
        inserted = true;
        ctx.createdRows.push({ table: "vehicles", id: res.id });
      }
    } catch {
      /* RLS */
    }
    ctx.steps.push({
      step: "24_orgB_cannot_insert_vehicle_orgA",
      ok: !inserted,
      detail: `inserted=${inserted}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "24_orgB_cannot_insert_vehicle_orgA",
      ok: false,
      detail: String(e),
    });
  }
  try {
    let inserted = false;
    try {
      const crossRsv: Reservation = {
        ...reservationA,
        id: crypto.randomUUID(),
        tenant_id: orgA,
      };
      const res = await repoB.reservations.insert(crossRsv);
      if (res) {
        inserted = true;
        ctx.createdRows.push({ table: "reservations", id: res.id });
      }
    } catch {
      /* RLS */
    }
    ctx.steps.push({
      step: "25_orgB_cannot_insert_reservation_orgA",
      ok: !inserted,
      detail: `inserted=${inserted}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "25_orgB_cannot_insert_reservation_orgA",
      ok: false,
      detail: String(e),
    });
  }

  // 26-28. Private storage
  const storagePath = `${orgA}/inspections/${inspectionA.id}/checkout-photo.txt`;
  try {
    const { error } = await clientA.storage
      .from("customer-documents")
      .upload(storagePath, "phase2 inspection evidence", {
        contentType: "text/plain",
        upsert: true,
      });
    if (!error)
      ctx.uploadedPaths.push({
        bucket: "customer-documents",
        path: storagePath,
      });
    ctx.steps.push({
      step: "26_orgA_upload_inspection_doc",
      ok: !error,
      detail: error ? error.message : "ok",
    });
  } catch (e) {
    ctx.steps.push({
      step: "26_orgA_upload_inspection_doc",
      ok: false,
      detail: String(e),
    });
  }
  try {
    const { data, error } = await clientA.storage
      .from("customer-documents")
      .createSignedUrl(storagePath, 60);
    ctx.steps.push({
      step: "27_orgA_download_own_doc",
      ok: !error && !!data?.signedUrl,
      detail: error ? error.message : "ok",
    });
  } catch (e) {
    ctx.steps.push({
      step: "27_orgA_download_own_doc",
      ok: false,
      detail: String(e),
    });
  }
  try {
    const { data, error } = await clientB.storage
      .from("customer-documents")
      .createSignedUrl(storagePath, 60);
    const denied = !!error || !data?.signedUrl;
    ctx.steps.push({
      step: "28_orgB_denied_cross_org_doc",
      ok: denied,
      detail: error
        ? `denied: ${error.message}`
        : data?.signedUrl
          ? "LEAK"
          : "no url",
    });
  } catch (e) {
    ctx.steps.push({
      step: "28_orgB_denied_cross_org_doc",
      ok: false,
      detail: String(e),
    });
  }

  // 29-30. Idempotency
  try {
    let dupInserted = false;
    try {
      const dupBooking: BookingRequest = {
        ...bookingA,
        id: crypto.randomUUID(),
      };
      const res = await repoA.bookings.insert(dupBooking);
      if (res) {
        dupInserted = true;
        ctx.createdRows.push({ table: "booking_requests", id: res.id });
      }
    } catch {
      /* unique index */
    }
    ctx.steps.push({
      step: "29_duplicate_booking_request_blocked",
      ok: !dupInserted,
      detail: `dup=${dupInserted}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "29_duplicate_booking_request_blocked",
      ok: false,
      detail: String(e),
    });
  }
  try {
    let dupInserted = false;
    try {
      const dupHist: DepositHistoryEvent = {
        ...histEvent,
        id: crypto.randomUUID(),
      };
      const res = await repoA.deposits.insertHistory(dupHist);
      if (res) {
        dupInserted = true;
        ctx.createdRows.push({ table: "deposit_history_events", id: res.id });
      }
    } catch {
      /* unique index */
    }
    ctx.steps.push({
      step: "30_duplicate_deposit_history_blocked",
      ok: !dupInserted,
      detail: `dup=${dupInserted}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "30_duplicate_deposit_history_blocked",
      ok: false,
      detail: String(e),
    });
  }

  // 31. Persistence after re-login
  try {
    const clientA2 = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const reSignIn = await clientA2.auth
      .signInWithPassword({ email: emailA, password: pass })
      .then((r) => !r.error)
      .catch(() => false);
    const repoA2 = makeRepos(clientA2);
    const c = await repoA2.customers.get(orgA, customerA.id);
    const v = await repoA2.vehicles.get(orgA, vehicleA.id);
    const r = await repoA2.reservations.get(orgA, reservationA.id);
    const b = await repoA2.bookings.list(orgA);
    const d = await repoA2.deposits.list(orgA);
    const i = await repoA2.inspections.list(orgA);
    const rnt = await clientA2
      .from("rentals")
      .select("id")
      .eq("id", rentalId)
      .maybeSingle();
    ctx.steps.push({
      step: "31_persistence_after_relogin",
      ok:
        reSignIn &&
        !!c &&
        !!v &&
        !!r &&
        b.some((x) => x.id === bookingA.id) &&
        d.some((x) => x.id === depositA.id) &&
        i.some((x) => x.id === inspectionA.id) &&
        !!rnt?.data,
      detail: `relogin=${reSignIn} c=${!!c} v=${!!v} r=${!!r} brq=${b.some((x) => x.id === bookingA.id)} dep=${d.some((x) => x.id === depositA.id)} insp=${i.some((x) => x.id === inspectionA.id)} rnt=${!!rnt?.data}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "31_persistence_after_relogin",
      ok: false,
      detail: String(e),
    });
  }

  // 32-33. Reservation business rules
  try {
    const existing = await repoA.reservations.list(orgA);
    const allScoped = existing.every((x) => x.tenant_id === orgA);
    const conflicts = existing.filter(
      (x) =>
        x.vehicle_id === vehicleA.id &&
        x.start_date <= "2026-11-05" &&
        x.end_date >= "2026-11-01",
    );
    ctx.steps.push({
      step: "32_reservation_org_scoped_list",
      ok: existing.some((x) => x.id === reservationA.id) && allScoped,
      detail: `count=${existing.length} all_orgA=${allScoped}`,
    });
    ctx.steps.push({
      step: "33_reservation_double_booking_detectable",
      ok: conflicts.length >= 1,
      detail: `conflicts=${conflicts.length}`,
    });
  } catch (e) {
    ctx.steps.push({
      step: "32_reservation_org_scoped_list",
      ok: false,
      detail: String(e),
    });
    ctx.steps.push({
      step: "33_reservation_double_booking_detectable",
      ok: false,
      detail: String(e),
    });
  }

  // Cleanup
  await cleanup(ctx);

  const passed = ctx.steps.every((s) => s.ok);
  return {
    passed,
    steps: ctx.steps,
    orgA,
    orgB,
    records: {
      customer: customerA.id,
      vehicle: vehicleA.id,
      bookingRequest: bookingA.id,
      reservation: reservationA.id,
      rental: rentalId,
      deposit: depositA.id,
      depositHistory: histEvent.id,
      inspection: inspectionA.id,
    },
  };
}
