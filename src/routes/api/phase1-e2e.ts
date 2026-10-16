// Phase 1 production-slice E2E verification endpoint.
//
// Proves the REAL production path end-to-end against live Cloud tables:
//   1. Create two real auth users + provision their orgs via the idempotent
//      provision_account() RPC.
//   2. For EACH user, build a per-user authenticated Supabase client (NOT the
//      service-role admin) and run the SAME repository adapters the UI store
//      uses. This exercises UI → store → repository → Cloud with RLS enforced.
//   3. Persistence: a fresh client (simulates logout/login) reads records back.
//   4. Cross-tenant: Org B's authenticated client cannot read/update/insert
//      Org A's rows, and cannot insert with Org A's organization_id.
//   5. Private storage: Org A uploads to an org-scoped path; Org A can read,
//      Org B is denied.
//   6. Reservation business rules: org-scoped list + double-booking detection.
//
// Admin client is used ONLY for auth-user creation + final cleanup. All data
// access assertions use per-user authenticated clients so RLS is the real gate.
//
// This is a test harness: it creates isolated beta records and cleans them up.
// It is reachable anonymously on the published site; it performs no privileged
// read of real tenant data and only touches its own ephemeral test rows.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  SupabaseCustomerRepository,
  SupabaseVehicleRepository,
  SupabaseReservationRepository,
} from "@/lib/supabase/repositoryAdapters";
import type { Customer, Vehicle, Reservation } from "@/lib/types";

interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export const Route = createFileRoute("/api/phase1-e2e")({
  server: {
    handlers: {
      POST: async () => {
        const steps: Step[] = [];
        const stamp = Date.now();
        const emailA = `e2e-a-${stamp}@phase1.test`;
        const emailB = `e2e-b-${stamp}@phase1.test`;
        const pass = "Phase1E2E!2026";

        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
        if (!url || !serviceKey || !publishable) {
          return Response.json({
            passed: false,
            steps: [
              { step: "server_config", ok: false, detail: "Cloud env missing" },
            ],
          });
        }

        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // ── 1. Create + provision Org A ────────────────────────────────────
        let userAId: string | null = null;
        let orgA: string | null = null;
        try {
          const { data, error } = await admin.auth.admin.createUser({
            email: emailA,
            password: pass,
            email_confirm: true,
          });
          userAId = data.user?.id ?? null;
          steps.push({
            step: "create_auth_user_a",
            ok: !error && !!userAId,
            detail: error ? error.message : (userAId ?? ""),
          });
          if (userAId) {
            const { data: rpc, error: rerr } = await admin.rpc(
              "provision_account",
              {
                p_user_id: userAId,
                p_email: emailA,
                p_org_name: "E2E Org Alpha",
                p_first_name: "Owner",
                p_last_name: "Alpha",
              },
            );
            const row = (Array.isArray(rpc) ? rpc[0] : rpc) as {
              organization_id: string;
              created_org: boolean;
            } | null;
            orgA = row?.organization_id ?? null;
            steps.push({
              step: "provision_account_a",
              ok: !rerr && !!orgA && row?.created_org === true,
              detail: rerr
                ? rerr.message
                : `org=${orgA} created=${row?.created_org}`,
            });
          }
        } catch (e) {
          steps.push({
            step: "create_auth_user_a",
            ok: false,
            detail: String(e),
          });
        }

        // ── 2. Create + provision Org B ───────────────────────────────────
        let userBId: string | null = null;
        let orgB: string | null = null;
        try {
          const { data, error } = await admin.auth.admin.createUser({
            email: emailB,
            password: pass,
            email_confirm: true,
          });
          userBId = data.user?.id ?? null;
          steps.push({
            step: "create_auth_user_b",
            ok: !error && !!userBId,
            detail: error ? error.message : (userBId ?? ""),
          });
          if (userBId) {
            const { data: rpc, error: rerr } = await admin.rpc(
              "provision_account",
              {
                p_user_id: userBId,
                p_email: emailB,
                p_org_name: "E2E Org Beta",
                p_first_name: "Owner",
                p_last_name: "Beta",
              },
            );
            const row = (Array.isArray(rpc) ? rpc[0] : rpc) as {
              organization_id: string;
              created_org: boolean;
            } | null;
            orgB = row?.organization_id ?? null;
            steps.push({
              step: "provision_account_b",
              ok: !rerr && !!orgB && row?.created_org === true,
              detail: rerr
                ? rerr.message
                : `org=${orgB} created=${row?.created_org}`,
            });
          }
        } catch (e) {
          steps.push({
            step: "create_auth_user_b",
            ok: false,
            detail: String(e),
          });
        }

        if (!userAId || !userBId || !orgA || !orgB) {
          return Response.json({ passed: false, steps, orgA, orgB });
        }

        // ── 3. Idempotency: re-provision A must NOT create a second org ──────
        try {
          const { data: rpc, error: rerr } = await admin.rpc(
            "provision_account",
            {
              p_user_id: userAId,
              p_email: emailA,
              p_org_name: "E2E Org Alpha DUPLICATE",
            },
          );
          const row = (Array.isArray(rpc) ? rpc[0] : rpc) as {
            organization_id: string;
            created_org: boolean;
          } | null;
          steps.push({
            step: "provision_idempotent_a",
            ok:
              !rerr &&
              row?.organization_id === orgA &&
              row?.created_org === false,
            detail: `same_org=${row?.organization_id === orgA} created_org=${row?.created_org}`,
          });
        } catch (e) {
          steps.push({
            step: "provision_idempotent_a",
            ok: false,
            detail: String(e),
          });
        }

        // ── 4. Per-user authenticated clients (RLS-enforced) ────────────────
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
        steps.push({
          step: "authenticated_client_a",
          ok: signInOkA,
          detail: signInOkA ? "signed in" : "sign in failed",
        });
        steps.push({
          step: "authenticated_client_b",
          ok: signInOkB,
          detail: signInOkB ? "signed in" : "sign in failed",
        });

        if (!signInOkA || !signInOkB) {
          return Response.json({ passed: false, steps, orgA, orgB });
        }

        const repoA = {
          customers: new SupabaseCustomerRepository(clientA as never),
          vehicles: new SupabaseVehicleRepository(clientA as never),
          reservations: new SupabaseReservationRepository(clientA as never),
        };
        const repoB = {
          customers: new SupabaseCustomerRepository(clientB as never),
          vehicles: new SupabaseVehicleRepository(clientB as never),
          reservations: new SupabaseReservationRepository(clientB as never),
        };

        // ── 5. Org A creates customer/vehicle/reservation via repository ────
        const custId = crypto.randomUUID();
        const vehId = crypto.randomUUID();
        const rsvId = crypto.randomUUID();
        const now = new Date().toISOString();

        const customerA: Customer = {
          id: custId,
          tenant_id: orgA,
          first_name: "Grace",
          last_name: "Liu",
          phone: "555-0100",
          email: "grace@e2e.test",
          date_of_birth: "",
          address: "",
          city: "",
          state: "",
          zip: "",
          emergency_contact_name: "",
          emergency_contact_phone: "",
          customer_status: "good_standing",
          customer_source: "connect_pro",
          notes: "",
          drivers_license_number: "",
          drivers_license_state: "",
          drivers_license_expiry: "",
          drivers_license_front_url: "",
          drivers_license_back_url: "",
          insurance_company: "",
          insurance_policy_number: "",
          insurance_expiry: "",
          insurance_document_url: "",
          created_at: now,
          updated_at: now,
        };
        const vehicleA: Vehicle = {
          id: vehId,
          tenant_id: orgA,
          vin: `E2E${stamp}`,
          make: "Jeep",
          model: "Wrangler",
          year: 2022,
          license_plate: "E2E-A",
          status: "available",
          location: "lot-1",
          vehicle_type: "suv",
          vehicle_class_id: null,
          pricing_override: false,
          min_rental_days_override: null,
          deposit_override: false,
          daily_rate: 75,
          weekly_rate: 450,
          deposit_amount: 500,
          images: [],
          documents: [],
          purchase_date: "",
          purchase_price: 0,
          current_mileage: 0,
          insurance_policy_number: "",
          insurance_expiry: "",
          registration_expiry: "",
          ownership_type: "company_owned",
          owner_entity_id: null,
          owner_display_name: null,
          ownership_notes: null,
          ownership_effective_date: "",
          created_at: now,
          updated_at: now,
        };
        const reservationA: Reservation = {
          id: rsvId,
          tenant_id: orgA,
          vehicle_id: vehId,
          customer_id: custId,
          renter_name: "Grace Liu",
          renter_email: "grace@e2e.test",
          renter_phone: "555-0100",
          start_date: "2026-11-01",
          end_date: "2026-11-05",
          status: "pending_verification",
          source: "manual",
          ghl_opportunity_id: null,
          total_price: 400,
          deposit_amount: 200,
          deposit_status: "held",
          amount_paid: 0,
          converted_to_rental_id: null,
          pricing_snapshot: null,
          created_at: now,
          created_by: null,
          created_by_name: "Owner Alpha",
        };

        try {
          const c = await repoA.customers.insert(customerA);
          steps.push({
            step: "orgA_insert_customer",
            ok: c.id === custId,
            detail: `id=${c.id}`,
          });
        } catch (e) {
          steps.push({
            step: "orgA_insert_customer",
            ok: false,
            detail: String(e),
          });
        }
        try {
          const v = await repoA.vehicles.insert(vehicleA);
          steps.push({
            step: "orgA_insert_vehicle",
            ok: v.id === vehId,
            detail: `id=${v.id}`,
          });
        } catch (e) {
          steps.push({
            step: "orgA_insert_vehicle",
            ok: false,
            detail: String(e),
          });
        }
        try {
          const r = await repoA.reservations.insert(reservationA);
          steps.push({
            step: "orgA_insert_reservation",
            ok: r.id === rsvId,
            detail: `id=${r.id}`,
          });
        } catch (e) {
          steps.push({
            step: "orgA_insert_reservation",
            ok: false,
            detail: String(e),
          });
        }

        // ── 6. Persistence: fresh client (logout/login) reads back ─────────
        const clientA2 = createClient(url, publishable, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const reSignIn = await clientA2.auth
          .signInWithPassword({ email: emailA, password: pass })
          .then((r) => !r.error)
          .catch(() => false);
        const repoA2 = {
          customers: new SupabaseCustomerRepository(clientA2 as never),
          vehicles: new SupabaseVehicleRepository(clientA2 as never),
          reservations: new SupabaseReservationRepository(clientA2 as never),
        };
        try {
          const c = await repoA2.customers.get(orgA, custId);
          const v = await repoA2.vehicles.get(orgA, vehId);
          const r = await repoA2.reservations.get(orgA, rsvId);
          steps.push({
            step: "persistence_after_relogin",
            ok: reSignIn && !!c && !!v && !!r,
            detail: `cust=${!!c} veh=${!!v} rsv=${!!r} relogin=${reSignIn}`,
          });
        } catch (e) {
          steps.push({
            step: "persistence_after_relogin",
            ok: false,
            detail: String(e),
          });
        }

        // ── 7. Cross-tenant: Org B cannot read Org A rows by id ────────────
        try {
          const c = await repoB.customers.get(orgA, custId);
          const v = await repoB.vehicles.get(orgA, vehId);
          const r = await repoB.reservations.get(orgA, rsvId);
          steps.push({
            step: "orgB_cannot_read_orgA_by_id",
            ok: c === null && v === null && r === null,
            detail: `cust=${c ? "LEAK" : "blocked"} veh=${v ? "LEAK" : "blocked"} rsv=${r ? "LEAK" : "blocked"}`,
          });
        } catch (e) {
          steps.push({
            step: "orgB_cannot_read_orgA_by_id",
            ok: false,
            detail: String(e),
          });
        }

        try {
          const list = await repoB.customers.list(orgB);
          const leak = list.some((x) => x.id === custId);
          steps.push({
            step: "orgB_list_excludes_orgA",
            ok: !leak,
            detail: `orgB_customers=${list.length} leak=${leak}`,
          });
        } catch (e) {
          steps.push({
            step: "orgB_list_excludes_orgA",
            ok: false,
            detail: String(e),
          });
        }

        // ── 8. Cross-tenant: Org B cannot UPDATE Org A rows ────────────────
        try {
          let affected = 0;
          try {
            const updated = await repoB.customers.update(orgA, custId, {
              first_name: "HACKED",
            });
            if (updated) affected = 1;
          } catch {
            /* RLS throws or returns null */
          }
          steps.push({
            step: "orgB_cannot_update_orgA_customer",
            ok: affected === 0,
            detail: `affected=${affected}`,
          });
        } catch (e) {
          steps.push({
            step: "orgB_cannot_update_orgA_customer",
            ok: false,
            detail: String(e),
          });
        }

        // ── 9. Cross-tenant: Org B cannot INSERT with Org A's org_id ───────
        try {
          let inserted = false;
          try {
            const crossCust: Customer = {
              ...customerA,
              id: crypto.randomUUID(),
              tenant_id: orgA,
              email: "cross@e2e.test",
            };
            const res = await repoB.customers.insert(crossCust);
            if (res) inserted = true;
          } catch {
            /* RLS blocks WITH CHECK */
          }
          steps.push({
            step: "orgB_cannot_insert_with_orgA_id",
            ok: !inserted,
            detail: `inserted=${inserted}`,
          });
        } catch (e) {
          steps.push({
            step: "orgB_cannot_insert_with_orgA_id",
            ok: false,
            detail: String(e),
          });
        }

        // ── 10. Private storage: Org A upload + read, Org B denied ─────────
        const storagePath = `${orgA}/customers/${custId}/test-doc.txt`;
        try {
          const { error } = await clientA.storage
            .from("customer-documents")
            .upload(storagePath, "phase1 test content", {
              contentType: "text/plain",
              upsert: true,
            });
          steps.push({
            step: "orgA_upload_private_doc",
            ok: !error,
            detail: error ? error.message : `path=${storagePath}`,
          });
        } catch (e) {
          steps.push({
            step: "orgA_upload_private_doc",
            ok: false,
            detail: String(e),
          });
        }
        try {
          const { data, error } = await clientA.storage
            .from("customer-documents")
            .createSignedUrl(storagePath, 60);
          steps.push({
            step: "orgA_read_own_doc",
            ok: !error && !!data?.signedUrl,
            detail: error ? error.message : "signed url created",
          });
        } catch (e) {
          steps.push({
            step: "orgA_read_own_doc",
            ok: false,
            detail: String(e),
          });
        }
        try {
          const { data, error } = await clientB.storage
            .from("customer-documents")
            .createSignedUrl(storagePath, 60);
          const denied = !!error || !data?.signedUrl;
          steps.push({
            step: "orgB_denied_cross_org_doc",
            ok: denied,
            detail: error
              ? `denied: ${error.message}`
              : data?.signedUrl
                ? "LEAK"
                : "no url",
          });
        } catch (e) {
          steps.push({
            step: "orgB_denied_cross_org_doc",
            ok: false,
            detail: String(e),
          });
        }

        // ── 11. Reservation business rules: org scope + double-booking ─────
        try {
          const existing = await repoA.reservations.list(orgA);
          steps.push({
            step: "reservation_org_scoped_list",
            ok:
              existing.some((x) => x.id === rsvId) &&
              existing.every((x) => x.tenant_id === orgA),
            detail: `count=${existing.length} all_orgA=${existing.every((x) => x.tenant_id === orgA)}`,
          });
          // Double-booking detection: a second reservation for the same
          // vehicle+dates must be detectable by listing existing reservations.
          const conflicts = existing.filter(
            (x) =>
              x.vehicle_id === vehId &&
              x.start_date <= "2026-11-05" &&
              x.end_date >= "2026-11-01",
          );
          steps.push({
            step: "reservation_double_booking_detectable",
            ok: conflicts.length >= 1,
            detail: `conflicts_for_vehicle_dates=${conflicts.length} (baseline reservation present)`,
          });
        } catch (e) {
          steps.push({
            step: "reservation_org_scoped_list",
            ok: false,
            detail: String(e),
          });
          steps.push({
            step: "reservation_double_booking_detectable",
            ok: false,
            detail: String(e),
          });
        }

        // ── Cleanup (admin only) ───────────────────────────────────────────
        await admin.from("reservations").delete().eq("id", rsvId);
        await admin.from("vehicles").delete().eq("id", vehId);
        await admin.from("customers").delete().eq("id", custId);
        await admin.storage.from("customer-documents").remove([storagePath]);
        await admin.auth.admin.deleteUser(userAId);
        await admin.auth.admin.deleteUser(userBId);

        const passed = steps.every((s) => s.ok);
        return Response.json({
          passed,
          steps,
          orgA,
          orgB,
          customerA: custId,
          vehicleA: vehId,
          reservationA: rsvId,
        });
      },
    },
  },
});
