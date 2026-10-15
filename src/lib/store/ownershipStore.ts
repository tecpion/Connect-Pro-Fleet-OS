// Connect Pro Fleet — vehicle ownership domain methods (Build #6).
//
// Ownership is an asset fact (on the Vehicle). Changing it is a domain event
// that logs an OwnershipChangeRecord so history is never silently overwritten.
// The InvestorVehicle pairing holds the compensation arrangement separately.

import type { Vehicle } from "../types";
import type {
  VehicleOwnershipType,
  OwnershipChangeRecord,
} from "../ownershipTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export function buildOwnershipMethods(s: StoreState) {
  return {
    // Set/transfer a vehicle's ownership. Logs the change (old → new) with
    // staff attribution and a reason, so finalized settlements/history remain
    // auditable even when ownership changes.
    setVehicleOwnership: (
      vehicleId: string,
      input: {
        ownership_type: VehicleOwnershipType;
        owner_entity_id?: string | null;
        owner_display_name?: string | null;
        ownership_notes?: string | null;
        effective_date?: string | null;
        reason?: string | null;
      },
      staffId?: string,
    ) => {
      const vehicle = s.vehicles.find((v) => v.id === vehicleId);
      if (!vehicle) return;
      const oldType =
        (vehicle.ownership_type as VehicleOwnershipType | undefined) ?? null;
      const oldOwner = vehicle.owner_entity_id ?? null;
      const newType = input.ownership_type;
      const newOwner =
        input.owner_entity_id ??
        (newType === "company_owned" ? null : oldOwner);
      const effective =
        input.effective_date ?? new Date().toISOString().slice(0, 10);

      s.setVehicles((vs) =>
        vs.map((v) =>
          v.id === vehicleId
            ? ({
                ...v,
                ownership_type: newType,
                owner_entity_id: newOwner,
                owner_display_name: input.owner_display_name ?? null,
                ownership_notes: input.ownership_notes ?? null,
                ownership_effective_date: effective,
                updated_at: new Date().toISOString(),
              } as Vehicle)
            : v,
        ),
      );

      // Log the change history (only when something actually changed).
      if (oldType !== newType || oldOwner !== newOwner) {
        const record: OwnershipChangeRecord = {
          id: uid("own"),
          tenant_id: TENANT_ID,
          vehicle_id: vehicleId,
          investor_id: newOwner,
          old_ownership_type: oldType,
          new_ownership_type: newType,
          old_owner_entity_id: oldOwner,
          new_owner_entity_id: newOwner,
          effective_date: effective,
          reason: input.reason ?? null,
          changed_by: staffId ?? s.currentStaffId,
          changed_at: new Date().toISOString(),
        };
        s.setOwnershipChanges((ocs) => [record, ...ocs]);
        s.setActivity((a) =>
          [
            {
              id: uid("act"),
              at: new Date().toISOString(),
              label: `Vehicle ownership ${oldType ? "changed" : "assigned"} — ${vehicle.make} ${vehicle.model}`,
              tone: "neutral" as const,
            },
            ...a,
          ].slice(0, 30),
        );
      }
    },

    // History of ownership changes for a vehicle (most recent first).
    vehicleOwnershipHistory: (vehicleId: string): OwnershipChangeRecord[] =>
      s.ownershipChanges
        .filter((o) => o.vehicle_id === vehicleId)
        .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1)),
  };
}
