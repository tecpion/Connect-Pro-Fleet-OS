// Connect Pro Fleet — work order lifecycle methods (Build #13).
// Create, transition (validated), assign, start, complete (idempotent), reopen,
// cancel, downtime. Split from the receipts/vendors methods to stay under the
// line limit. Vehicle blocking is explicit; restoration checks for remaining
// blocking orders. Completion is idempotent and resolves matching system tasks.

import type {
  MaintenanceWorkOrder,
  WorkOrderStatus,
  MaintenanceType,
  WorkOrderSource,
  WorkOrderPriority,
} from "../maintenanceTypes";
import {
  nextWorkOrderNumber,
  canTransition,
  isWorkOrderActive,
} from "../maintenanceSelectors";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import type { CreateNotificationInput } from "./notificationContext";
import type { MaintenanceShared } from "./maintenanceShared";

export function buildWorkOrderLifecycle(
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
  h: MaintenanceShared,
) {
  return {
    createWorkOrder: (input: {
      vehicle_id: string;
      title: string;
      maintenance_type: MaintenanceType;
      priority?: WorkOrderPriority;
      source?: WorkOrderSource;
      description?: string | null;
      reported_issue?: string | null;
      vendor_id?: string | null;
      assigned_user_id?: string | null;
      location_id?: string | null;
      scheduled_start_at?: string | null;
      expected_ready_at?: string | null;
      estimated_cost?: number | null;
      blocks_vehicle_use?: boolean;
      notes?: string | null;
    }): string => {
      const now = new Date().toISOString();
      const id = uid("wo");
      const wo: MaintenanceWorkOrder = {
        id,
        tenant_id: TENANT_ID,
        work_order_number: nextWorkOrderNumber(s.workOrders),
        vehicle_id: input.vehicle_id,
        location_id: input.location_id ?? null,
        status: input.scheduled_start_at ? "scheduled" : "open",
        priority: input.priority ?? "normal",
        maintenance_type: input.maintenance_type,
        source: input.source ?? "manual",
        title: input.title,
        description: input.description ?? null,
        reported_issue: input.reported_issue ?? null,
        diagnosis: null,
        work_performed: null,
        vendor_id: input.vendor_id ?? null,
        assigned_user_id: input.assigned_user_id ?? null,
        opened_by_user_id: s.currentStaffId,
        opened_at: now,
        scheduled_start_at: input.scheduled_start_at ?? null,
        actual_start_at: null,
        completed_at: null,
        cancelled_at: null,
        cancellation_reason: null,
        expected_ready_at: input.expected_ready_at ?? null,
        actual_ready_at: null,
        odometer_in: null,
        odometer_out: null,
        fuel_level_in: null,
        notes: input.notes ?? null,
        internal_notes: null,
        estimated_cost: input.estimated_cost ?? null,
        actual_cost: null,
        labor_cost: null,
        parts_cost: null,
        tax_cost: null,
        other_cost: null,
        blocks_vehicle_use: input.blocks_vehicle_use ?? false,
        downtime_started_at: null,
        downtime_ended_at: null,
        next_service_due_date: null,
        next_service_due_odometer: null,
        created_at: now,
        updated_at: now,
      };
      s.setWorkOrders((ws) => [wo, ...ws]);
      h.logEvent(id, "created", "Work order created");
      if (input.assigned_user_id)
        h.logEvent(
          id,
          "assigned",
          `Assigned to ${h.staffName(input.assigned_user_id)}`,
        );
      h.logAct(`Work order created — ${input.title} (${wo.work_order_number})`);
      if (wo.blocks_vehicle_use) {
        h.setVehicleStatus(input.vehicle_id, "maintenance");
        h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
      }
      if (
        input.assigned_user_id &&
        input.assigned_user_id !== s.currentStaffId
      ) {
        deps.notify({
          recipientUserId: input.assigned_user_id,
          type: "task.assigned",
          title: `Maintenance assigned: ${input.title}`,
          message: `${h.staffName(s.currentStaffId)} assigned you a maintenance work order for ${h.vehicleLabel(input.vehicle_id)}.`,
          entityType: "maintenance_work_order",
          entityId: id,
          entityLabel: `${wo.work_order_number} · ${h.vehicleLabel(input.vehicle_id)}`,
          actionUrl: `/maintenance?wo=${id}`,
          sourceEventId: id,
          occurrence: "1",
          actorUserId: s.currentStaffId,
          metadata: { work_order_id: id },
        });
      }
      return id;
    },

    updateWorkOrder: (
      id: string,
      patch: Partial<
        Pick<
          MaintenanceWorkOrder,
          | "title"
          | "description"
          | "reported_issue"
          | "diagnosis"
          | "work_performed"
          | "priority"
          | "maintenance_type"
          | "location_id"
          | "scheduled_start_at"
          | "expected_ready_at"
          | "estimated_cost"
          | "notes"
          | "internal_notes"
          | "fuel_level_in"
          | "blocks_vehicle_use"
        >
      >,
    ) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo) return;
      const blockingChanged =
        patch.blocks_vehicle_use !== undefined &&
        patch.blocks_vehicle_use !== wo.blocks_vehicle_use;
      h.patchWO(id, patch);
      if (patch.priority && patch.priority !== wo.priority)
        h.logEvent(id, "status_changed", "Priority changed", {
          oldValue: wo.priority,
          newValue: patch.priority,
        });
      if (blockingChanged) {
        if (patch.blocks_vehicle_use && isWorkOrderActive(wo)) {
          h.setVehicleStatus(wo.vehicle_id, "maintenance");
          h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
        } else if (!patch.blocks_vehicle_use) {
          if (h.maybeRestoreVehicle(wo.vehicle_id, id))
            h.logEvent(id, "vehicle_restored", "Vehicle returned to service");
        }
      }
    },

    transitionWorkOrder: (id: string, to: WorkOrderStatus) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo || wo.status === to) return;
      if (!canTransition(wo.status, to)) return;
      const now = new Date().toISOString();
      const patch: Partial<MaintenanceWorkOrder> = { status: to };
      if (to === "in_progress" && !wo.actual_start_at)
        patch.actual_start_at = now;
      h.patchWO(id, patch);
      h.logEvent(id, "status_changed", `Status changed to ${to}`, {
        oldValue: wo.status,
        newValue: to,
      });
      if (to === "in_progress") h.logEvent(id, "started", "Work started");
    },

    assignWorkOrder: (id: string, userId: string | null) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo) return;
      const oldAssignee = wo.assigned_user_id
        ? h.staffName(wo.assigned_user_id)
        : "Unassigned";
      const newAssignee = userId ? h.staffName(userId) : "Unassigned";
      const isReassign = !!(userId && wo.assigned_user_id);
      h.patchWO(id, { assigned_user_id: userId });
      h.logEvent(
        id,
        isReassign ? "reassigned" : "assigned",
        isReassign
          ? `Reassigned from ${oldAssignee} to ${newAssignee}`
          : `Assigned to ${newAssignee}`,
        { oldValue: oldAssignee, newValue: newAssignee },
      );
      if (userId && userId !== s.currentStaffId) {
        deps.notify({
          recipientUserId: userId,
          type: isReassign ? "task.reassigned" : "task.assigned",
          title: `${isReassign ? "Maintenance reassigned" : "Maintenance assigned"}: ${wo.title}`,
          message: isReassign
            ? `${h.staffName(s.currentStaffId)} reassigned this work order to you.`
            : `${h.staffName(s.currentStaffId)} assigned this work order to you.`,
          entityType: "maintenance_work_order",
          entityId: id,
          entityLabel: `${wo.work_order_number} · ${h.vehicleLabel(wo.vehicle_id)}`,
          actionUrl: `/maintenance?wo=${id}`,
          sourceEventId: id,
          occurrence: isReassign ? `reassign-${Date.now()}` : "1",
          actorUserId: s.currentStaffId,
          metadata: { work_order_id: id },
        });
      }
    },

    setWorkOrderVendor: (id: string, vendorId: string | null) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo) return;
      const oldVendor = wo.vendor_id
        ? (s.maintenanceVendors.find((v) => v.id === wo.vendor_id)?.name ?? "—")
        : "None";
      const newVendor = vendorId
        ? (s.maintenanceVendors.find((v) => v.id === vendorId)?.name ?? "—")
        : "None";
      h.patchWO(id, { vendor_id: vendorId });
      h.logEvent(id, "vendor_changed", `Vendor changed`, {
        oldValue: oldVendor,
        newValue: newVendor,
      });
    },

    startWorkOrder: (id: string) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo) return;
      if (wo.status === "open" || wo.status === "scheduled") {
        const now = new Date().toISOString();
        h.patchWO(id, { status: "in_progress", actual_start_at: now });
        h.logEvent(id, "started", "Work started");
        h.logEvent(id, "status_changed", "Status changed to in_progress", {
          oldValue: wo.status,
          newValue: "in_progress",
        });
      }
    },

    completeWorkOrder: (input: {
      id: string;
      work_performed?: string | null;
      actual_cost?: number | null;
      labor_cost?: number | null;
      parts_cost?: number | null;
      tax_cost?: number | null;
      other_cost?: number | null;
      odometer_out?: number | null;
      next_service_due_date?: string | null;
      next_service_due_odometer?: number | null;
      note?: string | null;
    }) => {
      const wo = s.workOrders.find((w) => w.id === input.id);
      if (!wo || wo.status === "completed" || wo.status === "cancelled") return;
      const now = new Date().toISOString();
      const patch: Partial<MaintenanceWorkOrder> = {
        status: "completed",
        completed_at: now,
        work_performed: input.work_performed ?? wo.work_performed,
        odometer_out: input.odometer_out ?? wo.odometer_out,
      };
      if (input.labor_cost !== undefined) patch.labor_cost = input.labor_cost;
      if (input.parts_cost !== undefined) patch.parts_cost = input.parts_cost;
      if (input.tax_cost !== undefined) patch.tax_cost = input.tax_cost;
      if (input.other_cost !== undefined) patch.other_cost = input.other_cost;
      if (input.actual_cost !== undefined)
        patch.actual_cost = input.actual_cost;
      if (input.next_service_due_date !== undefined)
        patch.next_service_due_date = input.next_service_due_date;
      if (input.next_service_due_odometer !== undefined)
        patch.next_service_due_odometer = input.next_service_due_odometer;
      h.patchWO(input.id, patch);
      h.logEvent(input.id, "completed", "Work order completed");
      h.logEvent(input.id, "status_changed", "Status changed to completed", {
        oldValue: wo.status,
        newValue: "completed",
      });
      if (input.note)
        h.logEvent(input.id, "note_added", "Note added", { note: input.note });
      if (
        input.next_service_due_date ||
        input.next_service_due_odometer !== undefined
      )
        h.logEvent(input.id, "next_service_set", "Next service due updated");
      h.logAct(
        `Maintenance completed — ${wo.title} (${wo.work_order_number})`,
        "available",
      );
      if (input.odometer_out != null) {
        const v = s.vehicles.find((x) => x.id === wo.vehicle_id);
        if (v && input.odometer_out > v.current_mileage) {
          s.setVehicles((vs) =>
            vs.map((x) =>
              x.id === wo.vehicle_id
                ? {
                    ...x,
                    current_mileage: input.odometer_out!,
                    updated_at: now,
                  }
                : x,
            ),
          );
        }
      }
      if (wo.blocks_vehicle_use) {
        if (h.maybeRestoreVehicle(wo.vehicle_id, input.id))
          h.logEvent(
            input.id,
            "vehicle_restored",
            "Vehicle returned to service",
          );
      }
      // Resolve matching system maintenance-overdue task for this vehicle.
      deps.resolveSystemTasks?.(
        "maintenance.overdue",
        "vehicle",
        wo.vehicle_id,
        `Maintenance completed — ${wo.work_order_number}`,
      );
      // Build #14 — sync the completed work order's cost into the accounting
      // expense ledger (idempotent). Counted once here, not again as a generic
      // vehicle expense. Pass the merged completed WO so the sync doesn't read
      // stale s.workOrders state inside the same batched act().
      const completedWo: MaintenanceWorkOrder = { ...wo, ...patch };
      deps.syncWorkOrderExpense?.(input.id, completedWo);
    },

    reopenWorkOrder: (id: string) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo || wo.status !== "completed") return;
      h.patchWO(id, {
        status: "in_progress",
        completed_at: null,
        actual_ready_at: null,
      });
      h.logEvent(id, "reopened", "Work order reopened");
      h.logEvent(id, "status_changed", "Status changed to in_progress", {
        oldValue: "completed",
        newValue: "in_progress",
      });
      if (wo.blocks_vehicle_use) {
        h.setVehicleStatus(wo.vehicle_id, "maintenance");
        h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
      }
    },

    cancelWorkOrder: (id: string, reason: string) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo || wo.status === "completed" || wo.status === "cancelled") return;
      const now = new Date().toISOString();
      h.patchWO(id, {
        status: "cancelled",
        cancelled_at: now,
        cancellation_reason: reason,
      });
      h.logEvent(id, "cancelled", `Cancelled — ${reason}`, {
        newValue: reason,
      });
      h.logAct(
        `Maintenance cancelled — ${wo.title} (${wo.work_order_number})`,
        "neutral",
      );
      if (wo.blocks_vehicle_use) {
        if (h.maybeRestoreVehicle(wo.vehicle_id, id))
          h.logEvent(id, "vehicle_restored", "Vehicle returned to service");
      }
    },

    startDowntime: (id: string) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo || wo.downtime_started_at) return;
      const now = new Date().toISOString();
      h.patchWO(id, { downtime_started_at: now, blocks_vehicle_use: true });
      h.logEvent(id, "downtime_started", "Downtime started");
      h.setVehicleStatus(wo.vehicle_id, "maintenance");
      h.logEvent(id, "vehicle_blocked", "Vehicle taken out of service");
    },

    markVehicleReady: (id: string) => {
      const wo = s.workOrders.find((w) => w.id === id);
      if (!wo || !wo.downtime_started_at || wo.downtime_ended_at) return;
      const now = new Date().toISOString();
      h.patchWO(id, { downtime_ended_at: now, actual_ready_at: now });
      h.logEvent(id, "downtime_ended", "Vehicle marked ready");
      if (h.maybeRestoreVehicle(wo.vehicle_id, id))
        h.logEvent(id, "vehicle_restored", "Vehicle returned to service");
    },
  };
}
