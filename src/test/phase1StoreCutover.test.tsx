// Phase 1 — store cutover + preserved business rules tests.
//
// NEW tests for the migrated project (original suite was lost in migration).
// Verifies that the store methods still enforce the frozen V1 business rules
// AND that Cloud persistence is wired (fire-and-forget) without breaking the
// synchronous useStore() contract.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the Cloud sync layer so we can assert it is called without needing a
// live backend. The store must still work in memory mode (no Cloud config).
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

// Mock the client so getBackendMode returns "memory" in tests.
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => null,
  getBackendMode: () => "memory",
  hasSupabaseConfig: () => false,
}));

import { useStore } from "@/lib/store/useStore";
import { StoreProvider } from "@/lib/store/StoreProvider";
import { AuthProvider } from "@/lib/supabase/authContext";
import {
  persistCustomerInsert,
  persistVehicleInsert,
  persistReservationInsert,
  persistCustomerUpdate,
} from "@/lib/supabase/storeSync";
import type { Customer, Vehicle, Reservation } from "@/lib/types";

// AuthProvider needs a React tree; in memory mode it provides a demo session.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <StoreProvider>{children}</StoreProvider>
  </AuthProvider>
);

function useTestStore() {
  return renderHook(() => useStore(), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("customer store — Cloud persistence wired", () => {
  it("addCustomer persists to Cloud (fire-and-forget) and updates local state", () => {
    const { result } = useTestStore();
    const c: Customer = {
      id: "cust_new",
      tenant_id: "tnt_connectpro",
      first_name: "Test",
      last_name: "User",
      phone: "555-0000",
      email: "test@x.example",
      date_of_birth: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      customer_status: "good_standing",
      customer_source: "staff",
      notes: "",
      drivers_license_number: null,
      drivers_license_state: null,
      drivers_license_expiry: null,
      drivers_license_front_url: null,
      drivers_license_back_url: null,
      insurance_company: null,
      insurance_policy_number: null,
      insurance_expiry: null,
      insurance_document_url: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as Customer;
    act(() => {
      result.current.addCustomer(c);
    });
    expect(result.current.customers.some((x) => x.id === "cust_new")).toBe(true);
    expect(persistCustomerInsert).toHaveBeenCalledWith(c);
  });

  it("updateCustomer persists the patch to Cloud", () => {
    const { result } = useTestStore();
    const existing = result.current.customers[0];
    act(() => {
      result.current.updateCustomer(existing.id, { notes: "updated note" });
    });
    expect(persistCustomerUpdate).toHaveBeenCalledWith(
      existing.tenant_id,
      existing.id,
      { notes: "updated note" },
    );
  });
});

describe("vehicle store — Cloud persistence wired", () => {
  it("addVehicle persists to Cloud", () => {
    const { result } = useTestStore();
    const v: Vehicle = {
      id: "veh_new",
      tenant_id: "tnt_connectpro",
      vin: "VINNEW",
      make: "Test",
      model: "Car",
      year: 2024,
      license_plate: "TST-001",
      status: "available",
      location: "lot-1",
      vehicle_type: "sedan",
      vehicle_class_id: null,
      pricing_override: false,
      min_rental_days_override: null,
      deposit_override: false,
      daily_rate: 80,
      weekly_rate: 480,
      deposit_amount: 500,
      images: [],
      documents: [],
      purchase_date: null,
      purchase_price: 0,
      current_mileage: 0,
      insurance_policy_number: null,
      insurance_expiry: null,
      registration_expiry: null,
      ownership_type: "owned",
      owner_entity_id: null,
      owner_display_name: null,
      ownership_notes: null,
      ownership_effective_date: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as Vehicle;
    act(() => {
      result.current.addVehicle(v);
    });
    expect(result.current.vehicles.some((x) => x.id === "veh_new")).toBe(true);
    expect(persistVehicleInsert).toHaveBeenCalledWith(v);
  });
});

describe("reservation store — Cloud persistence wired + business rules", () => {
  it("addReservation persists to Cloud", () => {
    const { result } = useTestStore();
    const r: Reservation = {
      id: "rsv_new",
      tenant_id: "tnt_connectpro",
      vehicle_id: "veh_1",
      customer_id: "cust_1",
      renter_name: "Test Renter",
      renter_email: "r@x.example",
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
    } as Reservation;
    act(() => {
      result.current.addReservation(r);
    });
    expect(
      result.current.reservations.some((x) => x.id === "rsv_new"),
    ).toBe(true);
    expect(persistReservationInsert).toHaveBeenCalledWith(r);
  });

  it("recordPayment clamps amount_paid at total_price (frozen rule)", () => {
    const { result } = useTestStore();
    const r: Reservation = {
      id: "rsv_pay",
      tenant_id: "tnt_connectpro",
      vehicle_id: "veh_1",
      customer_id: "cust_1",
      renter_name: "Pay Test",
      renter_email: "",
      renter_phone: "",
      start_date: "2026-11-01",
      end_date: "2026-11-05",
      status: "pending_verification",
      source: "manual",
      ghl_opportunity_id: null,
      total_price: 300,
      deposit_amount: 150,
      deposit_status: "held",
      amount_paid: 250,
      converted_to_rental_id: null,
      pricing_snapshot: null,
      created_at: "2026-01-01T00:00:00Z",
      created_by: null,
      created_by_name: "System",
    } as Reservation;
    act(() => {
      result.current.addReservation(r);
    });
    // Pay 100 more — should clamp at 300 (total_price), not 350.
    act(() => {
      result.current.recordPayment("rsv_pay", 100);
    });
    const updated = result.current.reservations.find((x) => x.id === "rsv_pay");
    expect(updated?.amount_paid).toBe(300);
  });
});

describe("staff store — last-active-Owner guard preserved (frozen rule)", () => {
  it("refuses to deactivate the last active Owner", () => {
    const { result } = useTestStore();
    // The guard identifies the system Owner via roles (is_system && name
    // === "Owner"), then maps staff to that role via role_id/role.
    const ownerRole = result.current.roles.find(
      (r) => r.is_system && r.name.toLowerCase() === "owner",
    );
    expect(ownerRole).toBeTruthy();
    const owner = result.current.staff.find(
      (s) =>
        (s.role_id && s.role_id === ownerRole!.id) ||
        s.role === ownerRole!.name.toLowerCase(),
    );
    expect(owner).toBeTruthy();
    const before = result.current.staff.find((s) => s.id === owner!.id);
    act(() => {
      result.current.updateStaff(owner!.id, { status: "suspended" });
    });
    const after = result.current.staff.find((s) => s.id === owner!.id);
    // Guard should have refused — status unchanged.
    expect(after?.status).toBe(before?.status);
  });
});
