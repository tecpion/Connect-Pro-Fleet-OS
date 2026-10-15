// Connect Pro Fleet — vehicle domain methods (Build #5).

import type { Vehicle } from "../types";
import type { StoreState } from "./storeState";

export function buildVehicleMethods(s: StoreState) {
  return {
    updateVehicle: (id: string, patch: Partial<Vehicle>) =>
      s.setVehicles((vs) =>
        vs.map((v) =>
          v.id === id
            ? { ...v, ...patch, updated_at: new Date().toISOString() }
            : v,
        ),
      ),
    addVehicle: (v: Vehicle) => s.setVehicles((vs) => [v, ...vs]),
  };
}
