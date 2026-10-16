// Connect Pro Fleet — Build #13 maintenance work order store tests.
//
// Exercises the work order store through the real StoreProvider: creation,
// transitions, assignment, completion (idempotent), reopen, cancel, downtime,
// vehicle blocking/restoration, multi-work-order state, cost correction,
// receipts, vendors, and financial non-interference (work orders never change
// ledger/balance/revenue).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import type { ReactNode } from "react";
import {
  isWorkOrderActive,
  vehicleHasBlockingMaintenance,
} from "@/lib/maintenanceSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

describe("work order creation + lifecycle", () => {
  it("creates a work order with a readable number", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Oil change",
        maintenance_type: "oil_change",
        priority: "normal",
      });
    });
    const wo = r.current.workOrderById(id);
    expect(wo).toBeDefined();
    expect(wo!.work_order_number).toMatch(/^WO-\d{4}-\d{6}$/);
    expect(wo!.status).toBe("open");
    expect(wo!.source).toBe("manual");
  });

  it("scheduled work order starts as scheduled", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Oil change",
        maintenance_type: "oil_change",
        scheduled_start_at: "2026-09-10T09:00:00Z",
      });
    });
    expect(r.current.workOrderById(id)!.status).toBe("scheduled");
  });

  it("OPEN -> IN_PROGRESS -> COMPLETED", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
      });
    });
    act(() => r.current.startWorkOrder(id));
    expect(r.current.workOrderById(id)!.status).toBe("in_progress");
    act(() => r.current.completeWorkOrder({ id, work_performed: "Done" }));
    expect(r.current.workOrderById(id)!.status).toBe("completed");
    expect(r.current.workOrderById(id)!.completed_at).not.toBeNull();
  });

  it("completion is idempotent", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
      });
    });
    act(() => r.current.completeWorkOrder({ id, actual_cost: 200 }));
    const completedAt = r.current.workOrderById(id)!.completed_at;
    act(() => r.current.completeWorkOrder({ id, actual_cost: 999 }));
    expect(r.current.workOrderById(id)!.completed_at).toBe(completedAt);
    expect(r.current.workOrderById(id)!.actual_cost).toBe(200);
  });

  it("cancel requires reason and preserves history", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Dent",
        maintenance_type: "body",
      });
    });
    act(() => r.current.cancelWorkOrder(id, "Customer declined"));
    const wo = r.current.workOrderById(id)!;
    expect(wo.status).toBe("cancelled");
    expect(wo.cancellation_reason).toBe("Customer declined");
    expect(wo.cancelled_at).not.toBeNull();
  });

  it("reopen preserves completion history", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
      });
    });
    act(() => r.current.completeWorkOrder({ id }));
    act(() => r.current.reopenWorkOrder(id));
    expect(r.current.workOrderById(id)!.status).toBe("in_progress");
    const events = r.current.workOrderEvents(id);
    expect(events.some((e) => e.event_type === "completed")).toBe(true);
    expect(events.some((e) => e.event_type === "reopened")).toBe(true);
  });
});

describe("vehicle blocking + downtime", () => {
  it("nonblocking work order does not change vehicle status", () => {
    const r = useStoreHook();
    act(() => {
      r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Oil change",
        maintenance_type: "oil_change",
        blocks_vehicle_use: false,
      });
    });
    const v = r.current.vehicles.find((x) => x.id === "veh_1")!;
    expect(v.status).not.toBe("maintenance");
  });

  it("blocking work order takes vehicle out of service", () => {
    const r = useStoreHook();
    act(() => {
      r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Engine",
        maintenance_type: "engine",
        blocks_vehicle_use: true,
      });
    });
    const v = r.current.vehicles.find((x) => x.id === "veh_1")!;
    expect(v.status).toBe("maintenance");
  });

  it("completing last blocking order restores vehicle", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Engine",
        maintenance_type: "engine",
        blocks_vehicle_use: true,
      });
    });
    expect(r.current.vehicles.find((x) => x.id === "veh_1")!.status).toBe(
      "maintenance",
    );
    act(() => r.current.completeWorkOrder({ id }));
    expect(r.current.vehicles.find((x) => x.id === "veh_1")!.status).toBe(
      "available",
    );
  });

  it("completing one of multiple blocking orders does not restore vehicle", () => {
    const r = useStoreHook();
    let id1 = "",
      id2 = "";
    act(() => {
      id1 = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Engine",
        maintenance_type: "engine",
        blocks_vehicle_use: true,
      });
      id2 = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
        blocks_vehicle_use: true,
      });
    });
    act(() => r.current.completeWorkOrder({ id: id1 }));
    expect(r.current.vehicles.find((x) => x.id === "veh_1")!.status).toBe(
      "maintenance",
    );
  });

  it("startDowntime takes vehicle out of service", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Oil",
        maintenance_type: "oil_change",
        blocks_vehicle_use: false,
      });
    });
    act(() => r.current.startDowntime(id));
    expect(r.current.workOrderById(id)!.downtime_started_at).not.toBeNull();
    expect(r.current.vehicles.find((x) => x.id === "veh_1")!.status).toBe(
      "maintenance",
    );
  });

  it("markVehicleReady ends downtime and restores vehicle", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Oil",
        maintenance_type: "oil_change",
        blocks_vehicle_use: false,
      });
    });
    act(() => r.current.startDowntime(id));
    act(() => r.current.markVehicleReady(id));
    expect(r.current.workOrderById(id)!.downtime_ended_at).not.toBeNull();
    expect(r.current.vehicles.find((x) => x.id === "veh_1")!.status).toBe(
      "available",
    );
  });
});

describe("cost + receipts + vendors", () => {
  it("cost correction after completion is audited", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Tires",
        maintenance_type: "tires",
      });
    });
    act(() => r.current.completeWorkOrder({ id, actual_cost: 600 }));
    act(() =>
      r.current.updateWorkOrderCost({
        id,
        actual_cost: 612,
        note: "Final invoice",
      }),
    );
    expect(r.current.workOrderById(id)!.actual_cost).toBe(612);
    const events = r.current.workOrderEvents(id);
    expect(events.some((e) => e.event_type === "cost_updated")).toBe(true);
  });

  it("receipts can be added after completion", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Tires",
        maintenance_type: "tires",
      });
    });
    act(() => r.current.completeWorkOrder({ id }));
    let receiptId = "";
    act(() => {
      receiptId = r.current.addReceipt({
        work_order_id: id,
        file_name: "final-invoice.pdf",
        file_url: "/final.pdf",
      });
    });
    expect(r.current.workOrderReceipts(id)).toHaveLength(1);
    act(() => r.current.voidReceipt(receiptId));
    expect(r.current.workOrderReceipts(id)).toHaveLength(0);
    expect(r.current.allWorkOrderReceipts(id)).toHaveLength(1);
  });

  it("vendors can be created and deactivated", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.addVendor({
        name: "Test Shop",
        vendor_type: "repair_shop",
      });
    });
    expect(r.current.vendorById(id)!.name).toBe("Test Shop");
    expect(r.current.vendorById(id)!.active).toBe(true);
    act(() => r.current.deactivateVendor(id));
    expect(r.current.vendorById(id)!.active).toBe(false);
  });
});

describe("financial non-interference", () => {
  it("creating a work order changes no ledger balance", () => {
    const r = useStoreHook();
    const before = r.current.transactions.length;
    act(() => {
      r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Engine",
        maintenance_type: "engine",
        blocks_vehicle_use: true,
      });
    });
    expect(r.current.transactions.length).toBe(before);
  });

  it("completing a work order changes no ledger balance", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
      });
    });
    const before = r.current.transactions.length;
    act(() => r.current.completeWorkOrder({ id, actual_cost: 500 }));
    expect(r.current.transactions.length).toBe(before);
  });

  it("maintenance cost does not create rental ledger transaction", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Tires",
        maintenance_type: "tires",
      });
    });
    act(() => r.current.completeWorkOrder({ id, actual_cost: 612 }));
    // No transaction should reference this work order.
    const hasMaintenanceTxn = r.current.transactions.some(
      (t) => t.metadata?.work_order_id === id,
    );
    expect(hasMaintenanceTxn).toBe(false);
  });
});

describe("assignment + notifications", () => {
  it("assigning to another user creates an event", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
      });
    });
    act(() => r.current.assignWorkOrder(id, "stf_2"));
    const events = r.current.workOrderEvents(id);
    expect(events.some((e) => e.event_type === "assigned")).toBe(true);
  });

  it("self-assignment does not notify", () => {
    const r = useStoreHook();
    const before = r.current.notifications.length;
    let id = "";
    act(() => {
      id = r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Brakes",
        maintenance_type: "brakes",
        assigned_user_id: r.current.currentStaffId,
      });
    });
    expect(r.current.notifications.length).toBe(before);
  });
});

describe("legacy maintenance compatibility", () => {
  it("existing maintenance records remain visible", () => {
    const r = useStoreHook();
    expect(r.current.maintenance.length).toBeGreaterThan(0);
  });

  it("work orders coexist with legacy maintenance records", () => {
    const r = useStoreHook();
    act(() => {
      r.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "New work order",
        maintenance_type: "oil_change",
      });
    });
    expect(r.current.workOrders.length).toBeGreaterThan(0);
    expect(r.current.maintenance.length).toBeGreaterThan(0);
  });
});
