// Connect Pro Fleet — Maintenance Work Order domain tests (Build #13).
// Pure selector tests: status transitions, vehicle blocking, multi-work-order
// restoration, downtime, cost math, search, receipts, idempotency checks.

import { describe, it, expect } from "vitest";
import type {
  MaintenanceWorkOrder,
  MaintenanceVendor,
  MaintenanceReceipt,
} from "../lib/maintenanceTypes";
import {
  nextWorkOrderNumber,
  isWorkOrderActive,
  isWorkOrderBlocking,
  vehicleHasBlockingMaintenance,
  getVehicleWorkOrders,
  getOpenVehicleWorkOrders,
  getWorkOrdersForVendor,
  getActiveDowntimeWorkOrders,
  getDowntimeDuration,
  formatDowntime,
  getWorkOrderCost,
  isWorkOrderPastExpectedReady,
  canTransition,
  getVehicleMaintenanceCost,
  getMonthlyMaintenanceCost,
  searchWorkOrders,
  searchVendors,
  getWorkOrderReceipts,
  getAllWorkOrderReceipts,
  getFutureReservationsForVehicle,
} from "../lib/maintenanceSelectors";

const TENANT = "tnt_1";

function wo(over: Partial<MaintenanceWorkOrder>): MaintenanceWorkOrder {
  return {
    id: "wo_1",
    tenant_id: TENANT,
    work_order_number: "WO-2026-000001",
    vehicle_id: "veh_1",
    location_id: null,
    status: "open",
    priority: "normal",
    maintenance_type: "oil_change",
    source: "manual",
    title: "Test",
    description: null,
    reported_issue: null,
    diagnosis: null,
    work_performed: null,
    vendor_id: null,
    assigned_user_id: null,
    opened_by_user_id: "stf_1",
    opened_at: "2026-08-01T10:00:00Z",
    scheduled_start_at: null,
    actual_start_at: null,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    expected_ready_at: null,
    actual_ready_at: null,
    odometer_in: null,
    odometer_out: null,
    fuel_level_in: null,
    notes: null,
    internal_notes: null,
    estimated_cost: null,
    actual_cost: null,
    labor_cost: null,
    parts_cost: null,
    tax_cost: null,
    other_cost: null,
    blocks_vehicle_use: false,
    downtime_started_at: null,
    downtime_ended_at: null,
    next_service_due_date: null,
    next_service_due_odometer: null,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00:00Z",
    ...over,
  };
}

describe("work order numbering", () => {
  it("generates next WO number in sequence", () => {
    const existing: MaintenanceWorkOrder[] = [
      wo({ work_order_number: "WO-2026-000001" }),
      wo({ work_order_number: "WO-2026-000002" }),
    ];
    expect(nextWorkOrderNumber(existing)).toMatch(/^WO-2026-000003$/);
  });

  it("starts at 000001 when no existing work orders", () => {
    expect(nextWorkOrderNumber([])).toMatch(/^WO-\d{4}-000001$/);
  });
});

describe("work order active/blocking", () => {
  it("active statuses are open/scheduled/in_progress/waiting", () => {
    expect(isWorkOrderActive(wo({ status: "open" }))).toBe(true);
    expect(isWorkOrderActive(wo({ status: "scheduled" }))).toBe(true);
    expect(isWorkOrderActive(wo({ status: "in_progress" }))).toBe(true);
    expect(isWorkOrderActive(wo({ status: "waiting_for_parts" }))).toBe(true);
    expect(isWorkOrderActive(wo({ status: "completed" }))).toBe(false);
    expect(isWorkOrderActive(wo({ status: "cancelled" }))).toBe(false);
  });

  it("blocking requires blocks_vehicle_use AND active", () => {
    expect(
      isWorkOrderBlocking(wo({ blocks_vehicle_use: true, status: "open" })),
    ).toBe(true);
    expect(
      isWorkOrderBlocking(
        wo({ blocks_vehicle_use: true, status: "completed" }),
      ),
    ).toBe(false);
    expect(
      isWorkOrderBlocking(wo({ blocks_vehicle_use: false, status: "open" })),
    ).toBe(false);
  });

  it("nonblocking work order does not remove vehicle from availability", () => {
    const orders = [wo({ blocks_vehicle_use: false, status: "open" })];
    expect(vehicleHasBlockingMaintenance(orders, "veh_1")).toBe(false);
  });

  it("blocking work order removes vehicle from availability", () => {
    const orders = [wo({ blocks_vehicle_use: true, status: "in_progress" })];
    expect(vehicleHasBlockingMaintenance(orders, "veh_1")).toBe(true);
  });

  it("completing one of multiple blocking orders does not restore vehicle", () => {
    const orders = [
      wo({ id: "wo_1", blocks_vehicle_use: true, status: "completed" }),
      wo({ id: "wo_2", blocks_vehicle_use: true, status: "in_progress" }),
    ];
    expect(vehicleHasBlockingMaintenance(orders, "veh_1")).toBe(true);
  });

  it("completing last blocking order may restore vehicle", () => {
    const orders = [
      wo({ id: "wo_1", blocks_vehicle_use: true, status: "completed" }),
      wo({ id: "wo_2", blocks_vehicle_use: true, status: "completed" }),
    ];
    expect(vehicleHasBlockingMaintenance(orders, "veh_1")).toBe(false);
  });
});

describe("status transitions", () => {
  it("valid transitions are allowed", () => {
    expect(canTransition("open", "scheduled")).toBe(true);
    expect(canTransition("open", "in_progress")).toBe(true);
    expect(canTransition("open", "completed")).toBe(true);
    expect(canTransition("open", "cancelled")).toBe(true);
    expect(canTransition("in_progress", "waiting_for_parts")).toBe(true);
    expect(canTransition("waiting_for_parts", "in_progress")).toBe(true);
  });

  it("invalid transitions are rejected", () => {
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("cancelled", "open")).toBe(false);
    expect(canTransition("open", "open")).toBe(false);
  });
});

describe("downtime", () => {
  it("duration is end - start when ended", () => {
    const w = wo({
      downtime_started_at: "2026-08-01T10:00:00Z",
      downtime_ended_at: "2026-08-01T14:00:00Z",
    });
    expect(getDowntimeDuration(w)).toBe(4 * 3600_000);
  });

  it("duration is now - start when active", () => {
    const w = wo({
      downtime_started_at: "2026-08-01T10:00:00Z",
      downtime_ended_at: null,
    });
    const now = new Date("2026-08-01T12:00:00Z");
    expect(getDowntimeDuration(w, now)).toBe(2 * 3600_000);
  });

  it("no downtime returns 0", () => {
    expect(getDowntimeDuration(wo({}))).toBe(0);
  });

  it("formatDowntime renders days/hours/minutes", () => {
    expect(formatDowntime(45 * 60_000)).toBe("45m");
    expect(formatDowntime(3 * 3600_000)).toBe("3h 0m");
    expect(formatDowntime(2 * 86_400_000 + 4 * 3600_000)).toBe("2d 4h");
  });

  it("getActiveDowntimeWorkOrders finds active downtime", () => {
    const orders = [
      wo({
        id: "wo_1",
        downtime_started_at: "2026-08-01T10:00:00Z",
        downtime_ended_at: null,
      }),
      wo({
        id: "wo_2",
        downtime_started_at: "2026-08-01T10:00:00Z",
        downtime_ended_at: "2026-08-01T12:00:00Z",
      }),
    ];
    const active = getActiveDowntimeWorkOrders(orders);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("wo_1");
  });
});

describe("cost", () => {
  it("derived cost from components when present", () => {
    expect(
      getWorkOrderCost(
        wo({ labor_cost: 100, parts_cost: 200, tax_cost: 10, other_cost: 5 }),
      ),
    ).toBe(315);
  });

  it("falls back to actual_cost when no components", () => {
    expect(getWorkOrderCost(wo({ actual_cost: 450 }))).toBe(450);
  });

  it("returns null when cost unknown", () => {
    expect(getWorkOrderCost(wo({}))).toBe(null);
  });

  it("vehicle maintenance cost sums completed work orders", () => {
    const orders = [
      wo({
        id: "wo_1",
        vehicle_id: "veh_1",
        status: "completed",
        actual_cost: 200,
      }),
      wo({
        id: "wo_2",
        vehicle_id: "veh_1",
        status: "completed",
        labor_cost: 50,
        parts_cost: 50,
      }),
      wo({
        id: "wo_3",
        vehicle_id: "veh_1",
        status: "in_progress",
        actual_cost: 100,
      }),
    ];
    expect(getVehicleMaintenanceCost(orders, "veh_1")).toBe(300);
  });

  it("monthly maintenance cost filters by completed_at month", () => {
    const orders = [
      wo({
        id: "wo_1",
        status: "completed",
        completed_at: "2026-08-15T10:00:00Z",
        actual_cost: 200,
      }),
      wo({
        id: "wo_2",
        status: "completed",
        completed_at: "2026-07-15T10:00:00Z",
        actual_cost: 100,
      }),
    ];
    expect(getMonthlyMaintenanceCost(orders, "2026-08")).toBe(200);
  });
});

describe("past expected ready", () => {
  it("active order past expected ready is flagged", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      isWorkOrderPastExpectedReady(
        wo({ expected_ready_at: past, status: "in_progress" }),
      ),
    ).toBe(true);
  });

  it("completed order is never past ready", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      isWorkOrderPastExpectedReady(
        wo({ expected_ready_at: past, status: "completed" }),
      ),
    ).toBe(false);
  });

  it("order with no expected ready is not past", () => {
    expect(isWorkOrderPastExpectedReady(wo({ expected_ready_at: null }))).toBe(
      false,
    );
  });
});

describe("search", () => {
  const vehicles = [
    { id: "veh_1", make: "Toyota", model: "Camry", license_plate: "FL-ABC123" },
  ];
  const vendors: MaintenanceVendor[] = [
    {
      id: "vnv_1",
      tenant_id: TENANT,
      name: "Miami Auto",
      contact_name: null,
      phone: null,
      email: null,
      address: null,
      city: null,
      state: null,
      postal: null,
      vendor_type: "repair_shop",
      notes: null,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];

  it("searches by work order number", () => {
    const orders = [wo({ work_order_number: "WO-2026-000123" })];
    expect(searchWorkOrders(orders, vendors, vehicles, "000123")).toHaveLength(
      1,
    );
  });

  it("searches by vehicle", () => {
    const orders = [wo({ vehicle_id: "veh_1" })];
    expect(searchWorkOrders(orders, vendors, vehicles, "camry")).toHaveLength(
      1,
    );
    expect(searchWorkOrders(orders, vendors, vehicles, "honda")).toHaveLength(
      0,
    );
  });

  it("searches by vendor name", () => {
    const orders = [wo({ vendor_id: "vnv_1" })];
    expect(searchWorkOrders(orders, vendors, vehicles, "miami")).toHaveLength(
      1,
    );
  });

  it("searches vendors by name/contact/phone/type", () => {
    expect(searchVendors(vendors, "miami")).toHaveLength(1);
    expect(searchVendors(vendors, "repair")).toHaveLength(1);
    expect(searchVendors(vendors, "nonexistent")).toHaveLength(0);
  });
});

describe("receipts", () => {
  const receipts: MaintenanceReceipt[] = [
    {
      id: "mrc_1",
      tenant_id: TENANT,
      work_order_id: "wo_1",
      file_name: "invoice.pdf",
      file_url: "/inv.pdf",
      mime_type: "application/pdf",
      receipt_type: "invoice",
      amount: 100,
      vendor_id: null,
      uploaded_by: "stf_1",
      uploaded_at: "2026-08-01T10:00:00Z",
      note: null,
      voided_at: null,
    },
    {
      id: "mrc_2",
      tenant_id: TENANT,
      work_order_id: "wo_1",
      file_name: "voided.pdf",
      file_url: "/v.pdf",
      mime_type: null,
      receipt_type: "receipt",
      amount: 50,
      vendor_id: null,
      uploaded_by: "stf_1",
      uploaded_at: "2026-08-01T11:00:00Z",
      note: null,
      voided_at: "2026-08-02T10:00:00Z",
    },
  ];

  it("active receipts exclude voided", () => {
    expect(getWorkOrderReceipts(receipts, "wo_1")).toHaveLength(1);
    expect(getWorkOrderReceipts(receipts, "wo_1")[0].file_name).toBe(
      "invoice.pdf",
    );
  });

  it("all receipts include voided", () => {
    expect(getAllWorkOrderReceipts(receipts, "wo_1")).toHaveLength(2);
  });
});

describe("vehicle work orders", () => {
  it("getVehicleWorkOrders returns all for a vehicle", () => {
    const orders = [
      wo({ id: "wo_1", vehicle_id: "veh_1" }),
      wo({ id: "wo_2", vehicle_id: "veh_2" }),
    ];
    expect(getVehicleWorkOrders(orders, "veh_1")).toHaveLength(1);
  });

  it("getOpenVehicleWorkOrders returns only active", () => {
    const orders = [
      wo({ id: "wo_1", vehicle_id: "veh_1", status: "open" }),
      wo({ id: "wo_2", vehicle_id: "veh_1", status: "completed" }),
    ];
    expect(getOpenVehicleWorkOrders(orders, "veh_1")).toHaveLength(1);
  });

  it("getWorkOrdersForVendor filters by vendor", () => {
    const orders = [
      wo({ id: "wo_1", vendor_id: "vnv_1" }),
      wo({ id: "wo_2", vendor_id: "vnv_2" }),
    ];
    expect(getWorkOrdersForVendor(orders, "vnv_1")).toHaveLength(1);
  });
});

describe("future reservations", () => {
  it("returns future non-cancelled reservations for a vehicle", () => {
    const today = new Date();
    const future = new Date(today.getTime() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const reservations = [
      { vehicle_id: "veh_1", start_date: future, status: "confirmed" },
      { vehicle_id: "veh_1", start_date: "2026-01-01", status: "completed" },
      { vehicle_id: "veh_2", start_date: future, status: "confirmed" },
    ];
    const result = getFutureReservationsForVehicle(
      reservations,
      "veh_1",
      today,
    );
    expect(result).toHaveLength(1);
    expect(result[0].start_date).toBe(future);
  });
});
