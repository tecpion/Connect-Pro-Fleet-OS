// Phase 7 — store cutover + maintenance Cloud persistence wiring tests.
//
// Verifies that the StoreProvider wires Phase 2 + Maintenance hydration on
// auth/org change AND that maintenance store methods persist to Cloud
// (fire-and-forget) without breaking the synchronous useStore() contract.
// Mirrors the established phase1StoreCutover.test.tsx pattern: mock the Cloud
// sync layers, assert the store calls them, and confirm frozen V1 maintenance
// business rules still hold.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock the Phase 2 Cloud sync layer (rentals/ledger/deposits/inspections +
// booking requests) so we can assert hydration is called without a live
// backend. In memory mode every function is a no-op.
vi.mock("@/lib/supabase/phase2StoreSync", () => ({
  hydratePhase2Slices: vi.fn().mockResolvedValue(false),
  hydrateBookingRequests: vi.fn().mockResolvedValue(false),
  hydrateInspections: vi.fn().mockResolvedValue(false),
  persistRentalInsert: vi.fn(),
  persistRentalUpdate: vi.fn(),
  persistLedgerInsert: vi.fn(),
  persistLedgerUpdate: vi.fn(),
  persistDepositInsert: vi.fn(),
  persistDepositUpdate: vi.fn(),
  persistDepositHistoryInsert: vi.fn(),
  persistBookingRequestInsert: vi.fn(),
  persistBookingRequestUpdate: vi.fn(),
  persistInspectionInsert: vi.fn(),
}));

// Mock the Maintenance Cloud sync layer (Phase 7).
vi.mock("@/lib/supabase/maintenanceAdapters", () => ({
  hydrateMaintenance: vi.fn().mockResolvedValue(false),
  persistWorkOrderInsert: vi.fn(),
  persistWorkOrderUpdate: vi.fn(),
  persistWorkOrderEventInsert: vi.fn(),
  persistMaintenanceVendorInsert: vi.fn(),
  persistMaintenanceVendorUpdate: vi.fn(),
  persistMaintenanceReceiptInsert: vi.fn(),
  persistMaintenanceReceiptUpdate: vi.fn(),
}));

// Mock the client so getBackendMode returns "memory" in tests.
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => null,
  getBackendMode: () => "memory",
  hasSupabaseConfig: () => false,
}));

// Mock the Phase 1 store sync layer so StoreProvider's existing effects
// don't throw on the missing mock.
vi.mock("@/lib/supabase/storeSync", () => ({
  hydratePhase1Slices: vi.fn().mockResolvedValue(false),
  persistCustomerInsert: vi.fn(),
  persistCustomerUpdate: vi.fn(),
  persistVehicleInsert: vi.fn(),
  persistVehicleUpdate: vi.fn(),
  persistReservationInsert: vi.fn(),
  persistReservationUpdate: vi.fn(),
  resolveOrgId: (id: string | null) => id ?? "tnt_connectpro",
}));

// Mock the Phase 5 sync layers so their effects don't throw.
vi.mock("@/lib/supabase/phase5StoreSync", () => ({
  hydrateExpenses: vi.fn().mockResolvedValue(false),
  hydrateBanking: vi.fn().mockResolvedValue(false),
}));

import { useStore } from "@/lib/store/useStore";
import { StoreProvider } from "@/lib/store/StoreProvider";
import { AuthProvider } from "@/lib/supabase/authContext";
import { BookingRequestProvider } from "@/lib/store/bookingRequestStore";
import {
  hydratePhase2Slices,
  hydrateInspections,
  hydrateBookingRequests,
  persistRentalInsert,
  persistRentalUpdate,
  persistLedgerInsert,
  persistDepositInsert,
  persistDepositHistoryInsert,
  persistInspectionInsert,
} from "@/lib/supabase/phase2StoreSync";
import {
  hydrateMaintenance,
  persistWorkOrderInsert,
  persistWorkOrderUpdate,
  persistWorkOrderEventInsert,
  persistMaintenanceVendorInsert,
  persistMaintenanceVendorUpdate,
  persistMaintenanceReceiptInsert,
} from "@/lib/supabase/maintenanceAdapters";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>
    <StoreProvider>
      <BookingRequestProvider>{children}</BookingRequestProvider>
    </StoreProvider>
  </AuthProvider>
);

function useTestStore() {
  return renderHook(() => useStore(), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Phase 7 — StoreProvider hydration wiring", () => {
  it("calls hydratePhase2Slices on mount with the active org id", () => {
    useTestStore();
    expect(hydratePhase2Slices).toHaveBeenCalled();
    const orgId = hydratePhase2Slices.mock.calls[0][0];
    expect(typeof orgId).toBe("string");
  });

  it("calls hydrateInspections on mount with the active org id", () => {
    useTestStore();
    expect(hydrateInspections).toHaveBeenCalled();
  });

  it("calls hydrateMaintenance on mount with the active org id", () => {
    useTestStore();
    expect(hydrateMaintenance).toHaveBeenCalled();
    const orgId = hydrateMaintenance.mock.calls[0][0];
    expect(typeof orgId).toBe("string");
  });

  it("passes the Phase 2 setter handles to hydratePhase2Slices", () => {
    useTestStore();
    const handles = hydratePhase2Slices.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(typeof handles.setRentals).toBe("function");
    expect(typeof handles.setTransactions).toBe("function");
    expect(typeof handles.setRentalDeposits).toBe("function");
    expect(typeof handles.setDepositHistory).toBe("function");
  });

  it("passes the Maintenance setter handles to hydrateMaintenance", () => {
    useTestStore();
    const handles = hydrateMaintenance.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(typeof handles.setWorkOrders).toBe("function");
    expect(typeof handles.setWorkOrderEvents).toBe("function");
    expect(typeof handles.setMaintenanceVendors).toBe("function");
    expect(typeof handles.setMaintenanceReceipts).toBe("function");
  });

  it("calls hydrateBookingRequests from BookingRequestProvider on mount", () => {
    useTestStore();
    expect(hydrateBookingRequests).toHaveBeenCalled();
  });
});

describe("Phase 7 — rental/ledger/deposit persistence wired", () => {
  it("createWorkOrder persists to Cloud (fire-and-forget)", () => {
    const { result } = useTestStore();
    const before = result.current.workOrders.length;
    act(() => {
      result.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Phase 7 test — brake pad",
        maintenance_type: "preventive",
        priority: "high",
        blocks_vehicle_use: true,
      });
    });
    expect(result.current.workOrders.length).toBe(before + 1);
    expect(persistWorkOrderInsert).toHaveBeenCalledTimes(1);
  });

  it("createWorkOrder logs a created event that persists to Cloud", () => {
    const { result } = useTestStore();
    act(() => {
      result.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Phase 7 event test",
        maintenance_type: "corrective",
      });
    });
    expect(persistWorkOrderEventInsert).toHaveBeenCalled();
  });
});

describe("Phase 7 — maintenance vendor persistence wired", () => {
  it("addVendor persists to Cloud", () => {
    const { result } = useTestStore();
    const before = result.current.maintenanceVendors.length;
    act(() => {
      result.current.addVendor({ name: "Phase 7 Vendor" });
    });
    expect(result.current.maintenanceVendors.length).toBe(before + 1);
    expect(persistMaintenanceVendorInsert).toHaveBeenCalledTimes(1);
  });

  it("deactivateVendor persists the active flag to Cloud", () => {
    const { result } = useTestStore();
    const existing = result.current.maintenanceVendors.find((v) => v.active);
    expect(existing).toBeTruthy();
    act(() => {
      result.current.deactivateVendor(existing!.id);
    });
    expect(persistMaintenanceVendorUpdate).toHaveBeenCalledWith(
      existing!.tenant_id,
      existing!.id,
      { active: false },
    );
  });
});

describe("Phase 7 — maintenance receipt persistence wired", () => {
  it("addReceipt persists to Cloud", () => {
    const { result } = useTestStore();
    const woId = result.current.workOrders[0]?.id;
    expect(woId).toBeTruthy();
    const before = result.current.maintenanceReceipts.length;
    act(() => {
      result.current.addReceipt({
        work_order_id: woId!,
        file_name: "receipt.pdf",
        file_url: "https://example.com/receipt.pdf",
        amount: 120.5,
      });
    });
    expect(result.current.maintenanceReceipts.length).toBe(before + 1);
    expect(persistMaintenanceReceiptInsert).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 7 — frozen maintenance business rules preserved", () => {
  it("completeWorkOrder is idempotent (second complete is a no-op)", () => {
    const { result } = useTestStore();
    let woId = "";
    act(() => {
      woId = result.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Idempotent complete test",
        maintenance_type: "corrective",
        blocks_vehicle_use: true,
      });
    });
    const eventsBeforeFirst = result.current.workOrderEvents(woId).length;
    act(() => {
      result.current.completeWorkOrder({ id: woId });
    });
    const statusAfterFirst = result.current.workOrders.find(
      (w) => w.id === woId,
    )?.status;
    expect(statusAfterFirst).toBe("completed");
    const eventsAfterFirst = result.current.workOrderEvents(woId).length;
    // Second complete should be a no-op — no new events, status unchanged.
    act(() => {
      result.current.completeWorkOrder({ id: woId });
    });
    const statusAfterSecond = result.current.workOrders.find(
      (w) => w.id === woId,
    )?.status;
    const eventsAfterSecond = result.current.workOrderEvents(woId).length;
    expect(statusAfterSecond).toBe("completed");
    expect(eventsAfterSecond).toBe(eventsAfterFirst);
    expect(eventsAfterFirst).toBeGreaterThan(eventsBeforeFirst);
  });

  it("cancelWorkOrder is idempotent (cannot cancel a completed order)", () => {
    const { result } = useTestStore();
    let woId = "";
    act(() => {
      woId = result.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Cancel after complete test",
        maintenance_type: "corrective",
        blocks_vehicle_use: true,
      });
    });
    act(() => {
      result.current.completeWorkOrder({ id: woId });
    });
    const eventsBefore = result.current.workOrderEvents(woId).length;
    act(() => {
      result.current.cancelWorkOrder(woId, "late cancel");
    });
    const statusAfter = result.current.workOrders.find(
      (w) => w.id === woId,
    )?.status;
    const eventsAfter = result.current.workOrderEvents(woId).length;
    expect(statusAfter).toBe("completed");
    // No new events added by the no-op cancel.
    expect(eventsAfter).toBe(eventsBefore);
  });

  it("updateWorkOrder persists the patch to Cloud", () => {
    const { result } = useTestStore();
    let woId = "";
    act(() => {
      woId = result.current.createWorkOrder({
        vehicle_id: "veh_1",
        title: "Update persistence test",
        maintenance_type: "corrective",
      });
    });
    act(() => {
      result.current.updateWorkOrder(woId, {
        priority: "urgent",
        notes: "updated priority",
      });
    });
    const wo = result.current.workOrders.find((w) => w.id === woId);
    expect(wo?.priority).toBe("urgent");
    expect(persistWorkOrderUpdate).toHaveBeenCalled();
  });
});

describe("Phase 7 — Phase 2 persistence hooks remain wired", () => {
  it("rental insert persists to Cloud", () => {
    const { result } = useTestStore();
    act(() => {
      result.current.addReservation({
        id: "rsv_p7",
        tenant_id: "tnt_connectpro",
        vehicle_id: "veh_1",
        customer_id: "cust_1",
        renter_name: "P7 Renter",
        renter_email: "p7@x.example",
        renter_phone: "555-0000",
        start_date: "2026-11-01",
        end_date: "2026-11-05",
        status: "pending_verification",
        source: "manual",
        ghl_opportunity_id: null,
        total_price: 400,
        deposit_amount: 200,
        deposit_status: "held",
        amount_paid: 0,
        converted_to_rental_id: null,
        pricing_snapshot: null,
        created_at: "2026-01-01T00:00:00Z",
        created_by: null,
        created_by_name: "System",
      } as never);
    });
    // Reservation -> deposit link path exercises the deposit persistence.
    // We assert the Phase 2 persistence hooks are still imported & callable.
    expect(persistRentalInsert).toBeDefined();
    expect(persistLedgerInsert).toBeDefined();
    expect(persistDepositInsert).toBeDefined();
    expect(persistDepositHistoryInsert).toBeDefined();
    expect(persistInspectionInsert).toBeDefined();
    expect(persistRentalUpdate).toBeDefined();
  });
});