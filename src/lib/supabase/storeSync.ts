// Connect Pro Fleet — Cloud store hydration + persistence sync (Phase 1).
//
// Bridges the frozen in-memory StoreProvider to the Cloud repository layer
// WITHOUT changing the synchronous `useStore()` API that every component
// depends on. The store keeps its useState arrays as the UI cache; this
// module hydrates them from Cloud on auth/org change and persists mutations
// through the repository abstraction (UI → store method → repository → Cloud).
//
// In memory mode (no Cloud config) every function is a no-op so the existing
// seeded demo experience is unchanged.

import type { Customer, Vehicle, Reservation } from "../types";
import { getSupabase, getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type {
  CustomerRepository,
  VehicleRepository,
  ReservationRepository,
} from "./repository";

export interface StoreSyncHandles {
  setCustomers: (updater: (prev: Customer[]) => Customer[]) => void;
  setVehicles: (updater: (prev: Vehicle[]) => Vehicle[]) => void;
  setReservations: (updater: (prev: Reservation[]) => Reservation[]) => void;
}

export interface StoreSyncDeps {
  customers: Customer[];
  vehicles: Vehicle[];
  reservations: Reservation[];
}

function repos() {
  if (getBackendMode() !== "supabase") return null;
  return createRepositories();
}

/** Hydrate the three Phase 1 slices from Cloud into the store cache.
 *  Returns true when Cloud mode is active and hydration ran. */
export async function hydratePhase1Slices(
  orgId: string,
  handles: StoreSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r || !r.customers || !r.vehicles || !r.reservations) return false;
  const [customers, vehicles, reservations] = await Promise.all([
    r.customers.list(orgId),
    r.vehicles.list(orgId),
    r.reservations.list(orgId),
  ]);
  handles.setCustomers(() => customers);
  handles.setVehicles(() => vehicles);
  handles.setReservations(() => reservations);
  return true;
}

/** Persist a new customer to Cloud (fire-and-forget; local state already
 *  updated optimistically). No-op in memory mode. */
export function persistCustomerInsert(c: Customer): void {
  const r = repos();
  if (!r?.customers) return;
  void r.customers.insert(c).catch((e) => {
    console.error("[storeSync] customer insert failed", e);
  });
}

export function persistCustomerUpdate(
  orgId: string,
  id: string,
  patch: Partial<Customer>,
): void {
  const r = repos();
  if (!r?.customers) return;
  void r.customers.update(orgId, id, patch).catch((e) => {
    console.error("[storeSync] customer update failed", e);
  });
}

export function persistVehicleInsert(v: Vehicle): void {
  const r = repos();
  if (!r?.vehicles) return;
  void r.vehicles.insert(v).catch((e) => {
    console.error("[storeSync] vehicle insert failed", e);
  });
}

export function persistVehicleUpdate(
  orgId: string,
  id: string,
  patch: Partial<Vehicle>,
): void {
  const r = repos();
  if (!r?.vehicles) return;
  void r.vehicles.update(orgId, id, patch).catch((e) => {
    console.error("[storeSync] vehicle update failed", e);
  });
}

export function persistReservationInsert(rsv: Reservation): void {
  const r = repos();
  if (!r?.reservations) return;
  void r.reservations.insert(rsv).catch((e) => {
    console.error("[storeSync] reservation insert failed", e);
  });
}

export function persistReservationUpdate(
  orgId: string,
  id: string,
  patch: Partial<Reservation>,
): void {
  const r = repos();
  if (!r?.reservations) return;
  void r.reservations.update(orgId, id, patch).catch((e) => {
    console.error("[storeSync] reservation update failed", e);
  });
}

/** Resolve the active organization id from the auth session (memory demo
 *  returns the seeded tenant id). */
export function resolveOrgId(activeOrgId: string | null): string {
  if (activeOrgId) return activeOrgId;
  return "tnt_connectpro";
}

export type {
  CustomerRepository,
  VehicleRepository,
  ReservationRepository,
};
