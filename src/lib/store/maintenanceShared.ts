// Connect Pro Fleet — maintenance store shared helpers (Build #13).
// Common utilities used across the work-order lifecycle methods: event
// logging, activity logging, work-order patching, staff/vehicle label
// resolution, and vehicle-status reconciliation. Split out to keep the
// implementation files under the line limit.

import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  WorkOrderEventType,
} from "../maintenanceTypes";
import { isWorkOrderActive } from "../maintenanceSelectors";
import {
  persistWorkOrderUpdate,
  persistWorkOrderEventInsert,
} from "../supabase/maintenanceAdapters";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export interface MaintenanceShared {
  logEvent: (
    workOrderId: string,
    type: WorkOrderEventType,
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
  patchWO: (id: string, patch: Partial<MaintenanceWorkOrder>) => void;
  staffName: (id: string | null) => string;
  vehicleLabel: (vehicleId: string) => string;
  setVehicleStatus: (
    vehicleId: string,
    status: "available" | "maintenance" | "out_of_service",
  ) => void;
  /** Restore a vehicle to available only if no other blocking active order
   *  remains. Re-reads current state to avoid stale reads. Returns true if
   *  the vehicle was restored. */
  maybeRestoreVehicle: (vehicleId: string, excludeId: string) => boolean;
}

export function buildMaintenanceShared(s: StoreState): MaintenanceShared {
  function logEvent(
    workOrderId: string,
    type: WorkOrderEventType,
    label: string,
    opts?: {
      actorId?: string | null;
      actorIsSystem?: boolean;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
    },
  ) {
    const ev: MaintenanceWorkOrderEvent = {
      id: uid("woe"),
      tenant_id: TENANT_ID,
      work_order_id: workOrderId,
      event_type: type,
      label,
      actor_user_id:
        opts?.actorId === undefined ? s.currentStaffId : opts.actorId,
      actor_is_system: opts?.actorIsSystem ?? false,
      old_value: opts?.oldValue ?? null,
      new_value: opts?.newValue ?? null,
      note: opts?.note ?? null,
      created_at: new Date().toISOString(),
    };
    s.setWorkOrderEvents((es) => [ev, ...es]);
    persistWorkOrderEventInsert(ev);
  }

  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "maintenance",
  ) {
    s.setActivity((a) =>
      [
        { id: uid("act"), at: new Date().toISOString(), label, tone },
        ...a,
      ].slice(0, 30),
    );
  }

  function patchWO(id: string, patch: Partial<MaintenanceWorkOrder>) {
    const existing = s.workOrders.find((w) => w.id === id);
    s.setWorkOrders((ws) =>
      ws.map((w) =>
        w.id === id
          ? { ...w, ...patch, updated_at: new Date().toISOString() }
          : w,
      ),
    );
    if (existing) persistWorkOrderUpdate(existing.tenant_id, id, patch);
  }

  function staffName(id: string | null): string {
    if (!id) return "System";
    const st = s.staff.find((x) => x.id === id);
    return st ? st.full_name : "—";
  }

  function vehicleLabel(vehicleId: string): string {
    const v = s.vehicles.find((x) => x.id === vehicleId);
    return v ? `${v.make} ${v.model} · ${v.license_plate}` : "vehicle";
  }

  function setVehicleStatus(
    vehicleId: string,
    status: "available" | "maintenance" | "out_of_service",
  ) {
    const v = s.vehicles.find((x) => x.id === vehicleId);
    if (!v || v.status === status) return;
    s.setVehicles((vs) =>
      vs.map((x) =>
        x.id === vehicleId
          ? { ...x, status, updated_at: new Date().toISOString() }
          : x,
      ),
    );
  }

  function maybeRestoreVehicle(vehicleId: string, excludeId: string): boolean {
    const stillBlocked = s.workOrders.some(
      (w) =>
        w.id !== excludeId &&
        w.vehicle_id === vehicleId &&
        w.blocks_vehicle_use &&
        isWorkOrderActive(w),
    );
    if (!stillBlocked) {
      setVehicleStatus(vehicleId, "available");
      return true;
    }
    return false;
  }

  return {
    logEvent,
    logAct,
    patchWO,
    staffName,
    vehicleLabel,
    setVehicleStatus,
    maybeRestoreVehicle,
  };
}
