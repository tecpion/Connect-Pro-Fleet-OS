// Connect Pro Fleet — reservation domain methods (Build #5).
// A reservation owns rental intent, requested vehicle/class, quote, source,
// and verification state — NOT active possession.
//
// Phase 1: addReservation/updateReservation persist through the Cloud
// repository (optimistic local write + async Cloud persist). In memory mode
// the persist calls are no-ops, preserving the seeded demo behavior.
// recordPayment and other lifecycle helpers remain in-memory only (deposits/
// ledger are not migrated in Phase 1).

import type {
  Reservation,
  StaffAssignment,
  Addon,
  Driver,
  Inspection,
} from "../types";
import type { StoreState } from "./storeState";
import {
  persistReservationInsert,
  persistReservationUpdate,
} from "../supabase/storeSync";

export function buildReservationMethods(s: StoreState) {
  return {
    updateReservation: (id: string, patch: Partial<Reservation>) => {
      s.setReservations((rs) =>
        rs.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      const existing = s.reservations.find((r) => r.id === id);
      if (existing) {
        persistReservationUpdate(existing.tenant_id, id, patch);
      }
    },
    addReservation: (r: Reservation) => {
      s.setReservations((rs) => [r, ...rs]);
      persistReservationInsert(r);
    },
    recordPayment: (id: string, amount: number) =>
      s.setReservations((rs) =>
        rs.map((r) =>
          r.id === id
            ? {
                ...r,
                amount_paid: Math.max(
                  0,
                  Math.min(r.total_price, r.amount_paid + amount),
                ),
              }
            : r,
        ),
      ),
    addAssignment: (a: StaffAssignment) =>
      s.setAssignments((as) => [
        ...as.filter(
          (x) =>
            !(
              x.reservation_id === a.reservation_id &&
              x.assignment_type === a.assignment_type
            ),
        ),
        a,
      ]),
    addAddon: (a: Addon) => s.setAddons((as) => [...as, a]),
    removeAddon: (id: string) =>
      s.setAddons((as) => as.filter((a) => a.id !== id)),
    updateDriver: (id: string, patch: Partial<Driver>) =>
      s.setDrivers((ds) =>
        ds.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      ),
    addInspection: (i: Inspection) => s.setInspections((is) => [i, ...is]),
    addMaintenance: (m: import("../types").MaintenanceRecord) =>
      s.setMaintenance((ms) => [m, ...ms]),
    updateMaintenance: (
      id: string,
      patch: Partial<import("../types").MaintenanceRecord>,
    ) =>
      s.setMaintenance((ms) =>
        ms.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      ),
  };
}
