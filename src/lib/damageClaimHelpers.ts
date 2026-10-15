// Connect Pro Fleet — damage claim store helpers (Build #17).
// Non-hook pure-ish helpers for the standalone damage-claim provider. Each
// takes the main store + setters it needs. Coordinates with the main store for
// vehicle status, activity log, notifications, and system-task resolution.

import type {
  DamageClaim,
  DamageClaimEvent,
  DamageClaimEventType,
} from "./damageClaimTypes";
import { isClaimBlocking } from "./damageClaimSelectors";
import { vehicleHasBlockingMaintenance } from "./maintenanceSelectors";
import type { FleetStore } from "./store";
import { TENANT_ID } from "./store";
export { TENANT_ID };

export const uid = (p: string) =>
  `${p}_${Math.random().toString(36).slice(2, 8)}`;
export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export interface ClaimHelpers {
  logEvent: (
    claimId: string,
    type: DamageClaimEventType,
    label: string,
    opts?: {
      actorId?: string | null;
      actorIsSystem?: boolean;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
    },
  ) => void;
  logAct: (
    label: string,
    tone?: "neutral" | "available" | "maintenance" | "out",
  ) => void;
  patchClaim: (claimId: string, patch: Partial<DamageClaim>) => void;
  staffName: (id: string | null) => string;
  vehicleLabel: (vehicleId: string) => string;
  setVehicleStatus: (
    vehicleId: string,
    status: "available" | "maintenance" | "out_of_service",
  ) => void;
  maybeRestoreVehicle: (vehicleId: string, excludeClaimId: string) => boolean;
  store: FleetStore;
  fmtMoney: (n: number) => string;
}

export function makeClaimHelpers(
  store: FleetStore,
  claims: DamageClaim[],
  setClaims: React.Dispatch<React.SetStateAction<DamageClaim[]>>,
  setEvents: React.Dispatch<React.SetStateAction<DamageClaimEvent[]>>,
  claimsRef?: React.MutableRefObject<DamageClaim[]>,
): ClaimHelpers {
  function logEvent(
    claimId: string,
    type: DamageClaimEventType,
    label: string,
    opts?: {
      actorId?: string | null;
      actorIsSystem?: boolean;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
    },
  ) {
    setEvents((es) => [
      {
        id: uid("dce"),
        tenant_id: TENANT_ID,
        damage_claim_id: claimId,
        event_type: type,
        label,
        actor_user_id:
          opts?.actorId === undefined ? store.currentStaffId : opts.actorId,
        actor_is_system: opts?.actorIsSystem ?? false,
        old_value: opts?.oldValue ?? null,
        new_value: opts?.newValue ?? null,
        note: opts?.note ?? null,
        created_at: new Date().toISOString(),
      },
      ...es,
    ]);
  }

  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "maintenance",
  ) {
    store.logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label,
      tone,
    });
  }

  function patchClaim(claimId: string, patch: Partial<DamageClaim>) {
    const next = {
      ...patch,
      updated_at: new Date().toISOString(),
    } as Partial<DamageClaim>;
    setClaims((cs) =>
      cs.map((c) => (c.id === claimId ? { ...c, ...next } : c)),
    );
    // Synchronously update the ref so rapid actions within one batched act()
    // see the patched claim (e.g. a second chargeCustomer sees the now-set
    // customer_charge_transaction_id and is correctly blocked).
    if (claimsRef) {
      claimsRef.current = claimsRef.current.map((c) =>
        c.id === claimId ? { ...c, ...next } : c,
      );
    }
  }

  function staffName(id: string | null): string {
    if (!id) return "System";
    const st = store.staff.find((x) => x.id === id);
    return st ? st.full_name : "—";
  }

  function vehicleLabel(vehicleId: string): string {
    const v = store.vehicles.find((x) => x.id === vehicleId);
    return v ? `${v.make} ${v.model} · ${v.license_plate}` : "vehicle";
  }

  function setVehicleStatus(
    vehicleId: string,
    status: "available" | "maintenance" | "out_of_service",
  ) {
    const v = store.vehicles.find((x) => x.id === vehicleId);
    if (!v || v.status === status) return;
    store.updateVehicle(vehicleId, { status });
  }

  function maybeRestoreVehicle(
    vehicleId: string,
    excludeClaimId: string,
  ): boolean {
    const stillClaimBlocked = claims.some(
      (c) =>
        c.id !== excludeClaimId &&
        c.vehicle_id === vehicleId &&
        isClaimBlocking(c),
    );
    const stillWoBlocked = vehicleHasBlockingMaintenance(
      store.workOrders,
      vehicleId,
    );
    if (!stillClaimBlocked && !stillWoBlocked) {
      setVehicleStatus(vehicleId, "available");
      return true;
    }
    return false;
  }

  return {
    logEvent,
    logAct,
    patchClaim,
    staffName,
    vehicleLabel,
    setVehicleStatus,
    maybeRestoreVehicle,
    store,
    fmtMoney,
  };
}
