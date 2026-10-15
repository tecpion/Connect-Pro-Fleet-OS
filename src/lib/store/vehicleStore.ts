// Connect Pro Fleet — vehicle domain methods (Build #5).
//
// Phase 1: addVehicle/updateVehicle persist through the Cloud repository
// (optimistic local write + async Cloud persist). In memory mode the persist
// calls are no-ops, preserving the seeded demo behavior.

import type { Vehicle } from "../types";
import type { StoreState } from "./storeState";
import {
  persistVehicleInsert,
  persistVehicleUpdate,
} from "../supabase/storeSync";

export function buildVehicleMethods(s: StoreState) {
  return {
    updateVehicle: (id: string, patch: Partial<Vehicle>) => {
      const now = new Date().toISOString();
      s.setVehicles((vs) =>
        vs.map((v) =>
          v.id === id ? { ...v, ...patch, updated_at: now } : v,
        ),
      );
      const existing = s.vehicles.find((v) => v.id === id);
      if (existing) {
        persistVehicleUpdate(existing.tenant_id, id, patch);
      }
    },
    addVehicle: (v: Vehicle) => {
      s.setVehicles((vs) => [v, ...vs]);
      persistVehicleInsert(v);
    },
  };
}
