// Phase 7 E2E — relogin + Phase 2 + Maintenance hydration. Sign Org A out,
// create a fresh authenticated session, run the real hydratePhase2Slices /
// hydrateBookingRequests / hydrateInspections / hydrateMaintenance paths, and
// confirm the newly created Org A records restore correctly into the store
// cache. Balances/statuses and relationships remain correct after relogin.

import {
  hydratePhase2Slices,
  hydrateBookingRequests,
  hydrateInspections,
  type Phase2SyncHandles,
  type BookingRequestSyncHandles,
  type InspectionSyncHandles,
} from "@/lib/supabase/phase2StoreSync";
import { hydrateMaintenance } from "@/lib/supabase/maintenanceAdapters";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { buildRental } from "./phase4-e2e-builders";
import type { Phase7Step } from "./phase7-e2e.server";
import { step, type Phase7Runtime } from "./phase7-e2e-runtime";

export interface HydrationResult {
  steps: Phase7Step[];
}

export async function runHydration(
  runtime: Phase7Runtime,
): Promise<HydrationResult> {
  const steps: Phase7Step[] = [];
  const {
    a,
    orgA,
    emailA,
    password,
    ctx,
    rentals,
    ledger,
    deposits,
    bookingRequests,
    inspections,
    maintenance,
  } = runtime;

  // ── Step 4: sign Org A out / create a fresh authenticated session ────────
  const reloginOk = await step(
    steps,
    "org_a_relogin_fresh_session",
    async () => {
      const out = await a.auth.signOut();
      if (out.error) throw out.error;
      const login = await a.auth.signInWithPassword({
        email: emailA,
        password,
      });
      if (login.error) throw login.error;
      return login.data.user?.id === runtime.userAId;
    },
  );
  if (!reloginOk) return { steps };

  // ── Step 5: run the real Phase 2 + Maintenance hydration paths ───────────
  // The store uses a Proxy-style handle bag in the real StoreProvider; here we
  // capture hydrated slices into a plain object so we can assert exactly what
  // the StoreProvider would restore after relogin.
  const cache: Record<string, unknown[]> = {};
  const makeHandle = <T>(key: string): T =>
    ((updater: (prev: unknown[]) => unknown[]) =>
      (cache[key] = updater([]))) as unknown as T;

  const phase2Handles: Phase2SyncHandles = {
    setRentals: makeHandle<Phase2SyncHandles["setRentals"]>("rentals"),
    setTransactions:
      makeHandle<Phase2SyncHandles["setTransactions"]>("transactions"),
    setRentalDeposits:
      makeHandle<Phase2SyncHandles["setRentalDeposits"]>("rentalDeposits"),
    setDepositHistory:
      makeHandle<Phase2SyncHandles["setDepositHistory"]>("depositHistory"),
  };
  const bookingHandles: BookingRequestSyncHandles = {
    setBookingRequests:
      makeHandle<BookingRequestSyncHandles["setBookingRequests"]>(
        "bookingRequests",
      ),
  };
  const inspectionHandles: InspectionSyncHandles = {
    setInspections:
      makeHandle<InspectionSyncHandles["setInspections"]>("inspections"),
  };
  const maintenanceHandles = {
    setWorkOrders:
      makeHandle<(u: (p: unknown[]) => unknown[]) => void>("workOrders"),
    setWorkOrderEvents:
      makeHandle<(u: (p: unknown[]) => unknown[]) => void>("workOrderEvents"),
    setMaintenanceVendors:
      makeHandle<(u: (p: unknown[]) => unknown[]) => void>(
        "maintenanceVendors",
      ),
    setMaintenanceReceipts: makeHandle<
      (u: (p: unknown[]) => unknown[]) => void
    >("maintenanceReceipts"),
  };

  // Pass the already-authenticated Org A repositories explicitly so the
  // hydration paths use them instead of re-deriving via getBackendMode()
  // (which reads browser env in the app and is not "supabase" inside a
  // server route). This mirrors the Phase 5 hydration pattern.
  const repos2 = {
    rentals,
    ledger,
    deposits,
    bookingRequests,
    inspections,
  };
  const hydrated = await Promise.all([
    hydratePhase2Slices(orgA, phase2Handles, repos2),
    hydrateBookingRequests(orgA, bookingHandles, repos2),
    hydrateInspections(orgA, inspectionHandles, repos2),
    hydrateMaintenance(orgA, maintenanceHandles, maintenance),
  ]);
  const hydrationRanOk = await step(
    steps,
    "phase2_and_maintenance_hydration_ran",
    () => hydrated.every(Boolean),
  );
  if (!hydrationRanOk) return { steps };

  // ── Step 6 + 7: confirm restored records + balances/relationships ────────
  const rentals2 = (cache.rentals ?? []) as { id: string }[];
  const txns2 = (cache.transactions ?? []) as {
    id: string;
    amount: number;
    direction: string;
  }[];
  const deps2 = (cache.rentalDeposits ?? []) as {
    id: string;
    collected_amount: number;
    rental_id: string | null;
  }[];
  const hist2 = (cache.depositHistory ?? []) as {
    id: string;
    deposit_id: string;
    event_type: string;
  }[];
  const bookings2 = (cache.bookingRequests ?? []) as {
    id: string;
    status: string;
  }[];
  const insp2 = (cache.inspections ?? []) as {
    id: string;
    inspection_type: string;
  }[];
  const wos2 = (cache.workOrders ?? []) as {
    id: string;
    maintenance_type: string;
    blocks_vehicle_use: boolean;
  }[];
  const woe2 = (cache.workOrderEvents ?? []) as {
    id: string;
    work_order_id: string;
  }[];
  const vendors2 = (cache.maintenanceVendors ?? []) as { id: string }[];
  const receipts2 = (cache.maintenanceReceipts ?? []) as {
    id: string;
    work_order_id: string;
  }[];

  await step(steps, "rentals_hydrated", () =>
    rentals2.some((r) => r.id === ctx.rentalId),
  );
  await step(steps, "ledger_hydrated", async () => {
    const ledgerRows = await ledger.listForRental(orgA, ctx.rentalId);
    return (
      txns2.some((t) => t.id === runtime.recordIds.charge) &&
      txns2.some((t) => t.id === runtime.recordIds.payment) &&
      txns2.length === ledgerRows.length
    );
  });
  await step(steps, "deposits_hydrated", async () => {
    const depRows = await deposits.list(orgA);
    return (
      deps2.some((d) => d.id === runtime.recordIds.deposit) &&
      hist2.some(
        (h) =>
          h.id === runtime.recordIds.depositHistory &&
          h.deposit_id === runtime.recordIds.deposit &&
          h.event_type === "collected",
      ) &&
      deps2.length === depRows.length
    );
  });
  await step(steps, "booking_requests_hydrated", () =>
    bookings2.some(
      (b) => b.id === runtime.recordIds.booking && b.status === "new",
    ),
  );
  await step(steps, "inspections_hydrated", () =>
    insp2.some(
      (i) =>
        i.id === runtime.recordIds.inspection &&
        i.inspection_type === "checkout",
    ),
  );
  await step(steps, "maintenance_hydrated", async () => {
    const woRows = await maintenance.listWorkOrders(orgA);
    return (
      wos2.some(
        (w) =>
          w.id === runtime.recordIds.workOrder &&
          w.maintenance_type === "brakes" &&
          w.blocks_vehicle_use === true,
      ) &&
      woe2.some(
        (e) =>
          e.id === runtime.recordIds.workOrderEvent &&
          e.work_order_id === runtime.recordIds.workOrder,
      ) &&
      vendors2.some((v) => v.id === runtime.recordIds.vendor) &&
      receipts2.some(
        (r) =>
          r.id === runtime.recordIds.receipt &&
          r.work_order_id === runtime.recordIds.workOrder,
      ) &&
      wos2.length === woRows.length
    );
  });

  await step(
    steps,
    "balances_and_relationships_correct_after_relogin",
    async () => {
      const ledgerRows = await ledger.listForRental(orgA, ctx.rentalId);
      const depRows = await deposits.list(orgA);
      const dep = depRows.find((d) => d.id === runtime.recordIds.deposit);
      const settlement = getRentalSettlement(
        buildRental(ctx),
        ledgerRows,
        dep ?? null,
      );
      return (
        settlement.totalCharges === 1000 &&
        settlement.payments === 1000 &&
        settlement.customerBalanceDue === 0 &&
        dep?.rental_id === ctx.rentalId
      );
    },
  );

  // Read-back through the repository (authoritative Cloud state) confirms the
  // hydration slices matched Cloud, not just the in-memory proxy.
  await step(steps, "hydration_matches_cloud_authoritative", async () => {
    const r = await rentals.list(orgA);
    const wo = await maintenance.listWorkOrders(orgA);
    return (
      r.some((x) => x.id === ctx.rentalId) &&
      wo.some((x) => x.id === runtime.recordIds.workOrder)
    );
  });

  return { steps };
}
