// Connect Pro Fleet — Maintenance Work Order selectors (Build #13).
//
// Pure functions over work orders / vendors / receipts. Vehicle blocking is
// explicit (blocks_vehicle_use) and restoration checks for ANY remaining
// blocking active work order. Downtime duration uses end - start (or now - start
// for active downtime). Cost is derived from components when present. Overdue
// (past expected_ready) is DERIVED, never stored.

import type {
  MaintenanceWorkOrder,
  MaintenanceVendor,
  MaintenanceReceipt,
  WorkOrderStatus,
} from "./maintenanceTypes";
import { WORK_ORDER_ACTIVE_STATUSES } from "./maintenanceTypes";

const DAY = 86_400_000;

/** Next work order number in the WO-YYYY-000000 sequence (tenant-scoped). */
export function nextWorkOrderNumber(
  workOrders: MaintenanceWorkOrder[],
): string {
  const year = new Date().getFullYear();
  const max = workOrders
    .map((w) => {
      const m = w.work_order_number.match(/^WO-(\d{4})-(\d+)$/);
      return m && m[1] === String(year) ? Number(m[2]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `WO-${year}-${String(max + 1).padStart(6, "0")}`;
}

/** Is the work order in an active (non-terminal) status? */
export function isWorkOrderActive(wo: MaintenanceWorkOrder): boolean {
  return WORK_ORDER_ACTIVE_STATUSES.includes(wo.status);
}

/** Is the work order blocking AND active? Only these remove a vehicle from
 *  availability. A completed/cancelled blocking order no longer blocks. */
export function isWorkOrderBlocking(wo: MaintenanceWorkOrder): boolean {
  return wo.blocks_vehicle_use && isWorkOrderActive(wo);
}

/** Does the vehicle have any blocking active work order? Used to decide whether
 *  completing one order may restore the vehicle (only if none remain). */
export function vehicleHasBlockingMaintenance(
  workOrders: MaintenanceWorkOrder[],
  vehicleId: string,
): boolean {
  return workOrders.some(
    (w) => w.vehicle_id === vehicleId && isWorkOrderBlocking(w),
  );
}

/** All active work orders for a vehicle (any status that's not
 *  completed/cancelled). */
export function getVehicleWorkOrders(
  workOrders: MaintenanceWorkOrder[],
  vehicleId: string,
): MaintenanceWorkOrder[] {
  return workOrders.filter((w) => w.vehicle_id === vehicleId);
}

/** Open (active) work orders for a vehicle. */
export function getOpenVehicleWorkOrders(
  workOrders: MaintenanceWorkOrder[],
  vehicleId: string,
): MaintenanceWorkOrder[] {
  return workOrders.filter(
    (w) => w.vehicle_id === vehicleId && isWorkOrderActive(w),
  );
}

/** All work orders for a vendor. */
export function getWorkOrdersForVendor(
  workOrders: MaintenanceWorkOrder[],
  vendorId: string,
): MaintenanceWorkOrder[] {
  return workOrders.filter((w) => w.vendor_id === vendorId);
}

/** Work orders with active downtime (downtime started, not ended). */
export function getActiveDowntimeWorkOrders(
  workOrders: MaintenanceWorkOrder[],
): MaintenanceWorkOrder[] {
  return workOrders.filter(
    (w) => w.downtime_started_at !== null && w.downtime_ended_at === null,
  );
}

/** Downtime duration in ms. If ended: end - start. If active: now - start.
 *  Never negative. */
export function getDowntimeDuration(
  wo: MaintenanceWorkOrder,
  now: Date = new Date(),
): number {
  if (!wo.downtime_started_at) return 0;
  const start = new Date(wo.downtime_started_at).getTime();
  if (isNaN(start)) return 0;
  const end = wo.downtime_ended_at
    ? new Date(wo.downtime_ended_at).getTime()
    : now.getTime();
  if (isNaN(end)) return 0;
  return Math.max(0, end - start);
}

/** Format a downtime duration as "2d 4h" / "3h 15m" / "45m". */
export function formatDowntime(ms: number): string {
  if (ms <= 0) return "0m";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Derived actual cost from components (labor + parts + tax + other) when any
 *  component is present; falls back to the stored actual_cost. Returns null
 *  when cost is genuinely unknown (not entered). */
export function getWorkOrderCost(wo: MaintenanceWorkOrder): number | null {
  const hasComponents =
    wo.labor_cost !== null ||
    wo.parts_cost !== null ||
    wo.tax_cost !== null ||
    wo.other_cost !== null;
  if (hasComponents) {
    return (
      (wo.labor_cost ?? 0) +
      (wo.parts_cost ?? 0) +
      (wo.tax_cost ?? 0) +
      (wo.other_cost ?? 0)
    );
  }
  return wo.actual_cost;
}

/** Is the work order past its expected ready date (derived, never stored)? */
export function isWorkOrderPastExpectedReady(
  wo: MaintenanceWorkOrder,
  now: Date = new Date(),
): boolean {
  if (!isWorkOrderActive(wo)) return false;
  if (!wo.expected_ready_at) return false;
  const ready = new Date(wo.expected_ready_at).getTime();
  if (isNaN(ready)) return false;
  return now.getTime() > ready;
}

/** Valid status transitions. Prevents arbitrary UI from assigning any status. */
const VALID_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: [
    "scheduled",
    "in_progress",
    "waiting_for_parts",
    "waiting_for_approval",
    "completed",
    "cancelled",
  ],
  scheduled: [
    "in_progress",
    "waiting_for_parts",
    "waiting_for_approval",
    "cancelled",
  ],
  in_progress: [
    "waiting_for_parts",
    "waiting_for_approval",
    "completed",
    "cancelled",
  ],
  waiting_for_parts: ["in_progress", "waiting_for_approval", "cancelled"],
  waiting_for_approval: ["in_progress", "cancelled"],
  completed: [], // reopen handled by a separate action, not a transition
  cancelled: [],
};

export function canTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Total maintenance cost for a vehicle from completed work orders (actual
 *  cost where entered). Excludes cancelled/unknown-cost. */
export function getVehicleMaintenanceCost(
  workOrders: MaintenanceWorkOrder[],
  vehicleId: string,
): number {
  return workOrders
    .filter((w) => w.vehicle_id === vehicleId && w.status === "completed")
    .reduce((sum, w) => {
      const cost = getWorkOrderCost(w);
      return sum + (cost ?? 0);
    }, 0);
}

/** Maintenance cost for a month (YYYY-MM) from completed work orders. */
export function getMonthlyMaintenanceCost(
  workOrders: MaintenanceWorkOrder[],
  yearMonth: string,
): number {
  return workOrders
    .filter((w) => {
      if (w.status !== "completed" || !w.completed_at) return false;
      return w.completed_at.slice(0, 7) === yearMonth;
    })
    .reduce((sum, w) => sum + (getWorkOrderCost(w) ?? 0), 0);
}

/** Search work orders by number, vehicle, title, issue, or vendor name. */
export function searchWorkOrders(
  workOrders: MaintenanceWorkOrder[],
  vendors: MaintenanceVendor[],
  vehicles: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
  }[],
  query: string,
): MaintenanceWorkOrder[] {
  const q = query.trim().toLowerCase();
  if (!q) return workOrders;
  return workOrders.filter((w) => {
    if (w.work_order_number.toLowerCase().includes(q)) return true;
    if (w.title.toLowerCase().includes(q)) return true;
    if ((w.reported_issue ?? "").toLowerCase().includes(q)) return true;
    const v = vehicles.find((x) => x.id === w.vehicle_id);
    if (v) {
      const label = `${v.make} ${v.model} ${v.license_plate}`.toLowerCase();
      if (label.includes(q)) return true;
    }
    if (w.vendor_id) {
      const vendor = vendors.find((x) => x.id === w.vendor_id);
      if (vendor && vendor.name.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

/** Search vendors by name, contact, phone, or type. */
export function searchVendors(
  vendors: MaintenanceVendor[],
  query: string,
): MaintenanceVendor[] {
  const q = query.trim().toLowerCase();
  if (!q) return vendors;
  return vendors.filter((v) => {
    if (v.name.toLowerCase().includes(q)) return true;
    if ((v.contact_name ?? "").toLowerCase().includes(q)) return true;
    if ((v.phone ?? "").toLowerCase().includes(q)) return true;
    if ((v.vendor_type ?? "").toLowerCase().includes(q)) return true;
    return false;
  });
}

/** Receipts for a work order (excludes voided from the active list). */
export function getWorkOrderReceipts(
  receipts: MaintenanceReceipt[],
  workOrderId: string,
): MaintenanceReceipt[] {
  return receipts
    .filter((r) => r.work_order_id === workOrderId && !r.voided_at)
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

/** All receipts for a work order including voided (for history). */
export function getAllWorkOrderReceipts(
  receipts: MaintenanceReceipt[],
  workOrderId: string,
): MaintenanceReceipt[] {
  return receipts
    .filter((r) => r.work_order_id === workOrderId)
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

/** Future reservations for a vehicle that may be affected by maintenance
 *  downtime (start date >= today). Used for conflict warnings — never alters
 *  the reservations. */
export function getFutureReservationsForVehicle(
  reservations: { vehicle_id: string; start_date: string; status: string }[],
  vehicleId: string,
  now: Date = new Date(),
): { vehicle_id: string; start_date: string; status: string }[] {
  const today = now.toISOString().slice(0, 10);
  return reservations.filter(
    (r) =>
      r.vehicle_id === vehicleId &&
      r.start_date >= today &&
      r.status !== "cancelled" &&
      r.status !== "completed",
  );
}
