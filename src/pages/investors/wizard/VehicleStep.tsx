// Connect Pro Fleet — wizard step 3: vehicle + ownership (Build #7).

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { useInvestors } from "@/lib/investorStore";
import { hasOwnershipConflict } from "@/lib/partnership";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import type { VehicleOwnershipType } from "@/lib/ownershipTypes";
import type { Vehicle } from "@/lib/types";
import { StepShell, selectCls } from "./StepShell";

export interface VehicleState {
  vehicleId: string;
  ownershipType: VehicleOwnershipType;
  ownershipNotes: string;
  transferExisting: boolean;
}

export function initialVehicle(): VehicleState {
  return {
    vehicleId: "",
    ownershipType: "external_owner",
    ownershipNotes: "",
    transferExisting: false,
  };
}

const OWNERSHIP_OPTIONS: VehicleOwnershipType[] = [
  "company_owned",
  "external_owner",
  "business_partner_owned",
  "jointly_owned",
  "other",
];

export function VehicleStep({
  state,
  set,
  vehicles,
}: {
  state: VehicleState;
  set: (patch: Partial<VehicleState>) => void;
  vehicles: Vehicle[];
}) {
  const { investorVehicles } = useInvestors();
  const conflict = useMemo(
    () =>
      !!state.vehicleId &&
      hasOwnershipConflict(state.vehicleId, investorVehicles),
    [state.vehicleId, investorVehicles],
  );

  return (
    <StepShell
      heading="Which vehicle is this agreement for?"
      supporting="Ownership is asked separately — what they contributed does not decide who owns the vehicle."
    >
      <div>
        <Label>Vehicle</Label>
        <select
          value={state.vehicleId}
          onChange={(e) =>
            set({ vehicleId: e.target.value, transferExisting: false })
          }
          className={selectCls}
        >
          <option value="">— Select a vehicle —</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.year} {v.make} {v.model} · {v.license_plate}
            </option>
          ))}
        </select>
      </div>

      {state.vehicleId && (
        <div className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
          {(() => {
            const v = vehicles.find((x) => x.id === state.vehicleId);
            return v ? (
              <span>
                {v.year} {v.make} {v.model} ·{" "}
                <span className="capitalize">{v.status}</span>
              </span>
            ) : null;
          })()}
        </div>
      )}

      {conflict && (
        <div className="rounded-md border border-status-out/40 bg-status-out/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-status-out">
            <AlertTriangle size={13} /> This vehicle already has an active
            ownership relationship.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={state.transferExisting}
              onChange={(e) => set({ transferExisting: e.target.checked })}
              className="accent-primary"
            />
            Transfer ownership (deactivates the old relationship — history is
            preserved)
          </label>
        </div>
      )}

      <div>
        <Label>Who owns this vehicle?</Label>
        <select
          value={state.ownershipType}
          onChange={(e) =>
            set({ ownershipType: e.target.value as VehicleOwnershipType })
          }
          className={selectCls}
        >
          {OWNERSHIP_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {OWNERSHIP_TYPE_LABELS[o]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Answered separately from contribution. Cash can fund a company-owned
          vehicle.
        </p>
      </div>

      <div>
        <Label>Ownership notes (optional)</Label>
        <Input
          value={state.ownershipNotes}
          onChange={(e) => set({ ownershipNotes: e.target.value })}
          className="mt-1"
          placeholder={
            state.ownershipType === "jointly_owned"
              ? "e.g. Company and John Smith jointly own vehicle."
              : "Optional"
          }
        />
      </div>
    </StepShell>
  );
}

export function vehicleValid(s: VehicleState, conflict: boolean): boolean {
  if (!s.vehicleId) return false;
  if (conflict && !s.transferExisting) return false;
  return true;
}
