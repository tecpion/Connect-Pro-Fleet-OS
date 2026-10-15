// Connect Pro Fleet — maintenance work order store (Build #13).
// Composes the lifecycle + aux methods into the MaintenanceMethods interface.
// Split across maintenanceShared / maintenanceLifecycle / maintenanceAux to
// stay under the line limit. The public API matches MaintenanceMethods.

import type { StoreState } from "./storeState";
import type { CreateNotificationInput } from "./notificationContext";
import type { MaintenanceWorkOrder } from "../maintenanceTypes";
import { buildMaintenanceShared } from "./maintenanceShared";
import { buildWorkOrderLifecycle } from "./maintenanceLifecycle";
import { buildMaintenanceAux } from "./maintenanceAux";

export function buildMaintenanceMethods(
  s: StoreState,
  deps: {
    notify: (input: CreateNotificationInput) => string | null;
    resolveSystemTasks?: (
      sourceEvent: string,
      entityType: string | null,
      entityId: string | null,
      reason: string,
    ) => number;
    syncWorkOrderExpense?: (
      workOrderId: string,
      completedWo?: MaintenanceWorkOrder,
    ) => string | null;
  },
) {
  const shared = buildMaintenanceShared(s);
  const lifecycle = buildWorkOrderLifecycle(s, deps, shared);
  const aux = buildMaintenanceAux(s, shared);

  return {
    // --- selectors ----------------------------------------------------------
    workOrderById: (id: string) => s.workOrders.find((w) => w.id === id),
    workOrderEvents: (workOrderId: string) =>
      s.workOrderEvents
        .filter((e) => e.work_order_id === workOrderId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    workOrderReceipts: (workOrderId: string) =>
      s.maintenanceReceipts
        .filter((r) => r.work_order_id === workOrderId && !r.voided_at)
        .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)),
    allWorkOrderReceipts: (workOrderId: string) =>
      s.maintenanceReceipts
        .filter((r) => r.work_order_id === workOrderId)
        .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)),
    vehicleWorkOrders: (vehicleId: string) =>
      s.workOrders.filter((w) => w.vehicle_id === vehicleId),

    // --- lifecycle ----------------------------------------------------------
    createWorkOrder: lifecycle.createWorkOrder,
    updateWorkOrder: lifecycle.updateWorkOrder,
    transitionWorkOrder: lifecycle.transitionWorkOrder,
    assignWorkOrder: lifecycle.assignWorkOrder,
    setWorkOrderVendor: lifecycle.setWorkOrderVendor,
    startWorkOrder: lifecycle.startWorkOrder,
    completeWorkOrder: lifecycle.completeWorkOrder,
    reopenWorkOrder: lifecycle.reopenWorkOrder,
    cancelWorkOrder: lifecycle.cancelWorkOrder,
    startDowntime: lifecycle.startDowntime,
    markVehicleReady: lifecycle.markVehicleReady,

    // --- cost / next service / receipts / vendors / notes -------------------
    updateWorkOrderCost: aux.updateWorkOrderCost,
    setNextService: aux.setNextService,
    addReceipt: aux.addReceipt,
    voidReceipt: aux.voidReceipt,
    addVendor: aux.addVendor,
    updateVendor: aux.updateVendor,
    deactivateVendor: aux.deactivateVendor,
    vendorById: (id: string) => s.maintenanceVendors.find((v) => v.id === id),
    addWorkOrderNote: aux.addWorkOrderNote,
  };
}
