// Phase 1 — repository mapper round-trip tests.
//
// These are NEW tests written for the migrated project (the original
// pre-SSR test suite was lost during the React→TanStack migration and could
// not be recovered from disk or git history). They verify the row↔domain
// mappers that the Cloud repository adapters depend on, so persistence
// preserves every domain field.

import { describe, it, expect } from "vitest";
import {
  rowToCustomer,
  customerToRow,
  rowToVehicle,
  vehicleToRow,
  rowToReservation,
  reservationToRow,
} from "@/lib/supabase/repositoryMappers";
import type { Customer, Vehicle, Reservation } from "@/lib/types";
import type {
  CustomerRow,
  VehicleRow,
  ReservationRow,
} from "@/lib/supabase/database.types";

describe("customer mappers", () => {
  it("round-trips a customer through row → domain → row preserving all fields", () => {
    const row = {
      id: "cust-1",
      organization_id: "org-1",
      first_name: "Grace",
      last_name: "Liu",
      phone: "555-1234",
      email: "grace@test.example",
      date_of_birth: "1990-01-01",
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      emergency_contact_name: "Bob Liu",
      emergency_contact_phone: "555-9999",
      customer_status: "good_standing",
      customer_source: "staff",
      notes: "VIP customer",
      drivers_license_number: "DL123",
      drivers_license_state: "TX",
      drivers_license_expiry: "2030-01-01",
      drivers_license_front_path: "path/front.jpg",
      drivers_license_back_path: "path/back.jpg",
      insurance_company: "Geico",
      insurance_policy_number: "POL-1",
      insurance_expiry: "2030-06-01",
      insurance_document_path: "path/ins.pdf",
      external_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    };
    const domain = rowToCustomer(row as unknown as CustomerRow);
    expect(domain.id).toBe("cust-1");
    expect(domain.tenant_id).toBe("org-1");
    expect(domain.drivers_license_front_url).toBe("path/front.jpg");
    expect(domain.drivers_license_back_url).toBe("path/back.jpg");
    expect(domain.insurance_document_url).toBe("path/ins.pdf");

    const backToRow = customerToRow(domain);
    expect(backToRow.organization_id).toBe("org-1");
    expect(backToRow.first_name).toBe("Grace");
    expect(backToRow.drivers_license_front_path).toBe("path/front.jpg");
    expect(backToRow.drivers_license_back_path).toBe("path/back.jpg");
    expect(backToRow.insurance_document_path).toBe("path/ins.pdf");
  });

  it("maps tenant_id ↔ organization_id bidirectionally", () => {
    const c: Customer = {
      id: "c1",
      tenant_id: "org-99",
      first_name: "A",
      last_name: "B",
      phone: "",
      email: "",
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
    const row = customerToRow(c);
    expect(row.organization_id).toBe("org-99");
    const roundTripped = rowToCustomer({
      ...row,
      created_at: c.created_at,
      updated_at: c.updated_at,
    } as any);
    expect(roundTripped.tenant_id).toBe("org-99");
  });
});

describe("vehicle mappers", () => {
  it("normalizes numeric money columns from string to number", () => {
    const row = {
      id: "veh-1",
      organization_id: "org-1",
      vin: "VIN1",
      make: "Jeep",
      model: "Wrangler",
      year: 2022,
      license_plate: "ABC-123",
      status: "available",
      location: "lot-1",
      vehicle_type: "suv",
      vehicle_class_id: "class-1",
      pricing_override: true,
      min_rental_days_override: 3,
      deposit_override: false,
      daily_rate: "75.50",
      weekly_rate: "450.00",
      deposit_amount: "500.00",
      purchase_date: "2022-01-01",
      purchase_price: "35000.00",
      current_mileage: 12000,
      insurance_policy_number: "POL",
      insurance_expiry: "2030-01-01",
      registration_expiry: "2027-01-01",
      ownership_type: "owned",
      owner_entity_id: null,
      owner_display_name: null,
      ownership_notes: null,
      ownership_effective_date: null,
      external_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const v = rowToVehicle(row as unknown as VehicleRow);
    expect(v.daily_rate).toBe(75.5);
    expect(v.weekly_rate).toBe(450);
    expect(v.deposit_amount).toBe(500);
    expect(v.purchase_price).toBe(35000);
    expect(v.tenant_id).toBe("org-1");
  });

  it("round-trips vehicle domain → row preserving org scoping", () => {
    const v: Vehicle = {
      id: "v1",
      tenant_id: "org-55",
      vin: "V",
      make: "Tesla",
      model: "3",
      year: 2023,
      license_plate: "X",
      status: "available",
      location: "L1",
      vehicle_type: "sedan",
      vehicle_class_id: null,
      pricing_override: false,
      min_rental_days_override: null,
      deposit_override: false,
      daily_rate: 100,
      weekly_rate: 600,
      deposit_amount: 1000,
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
    } as unknown as Vehicle;
    const row = vehicleToRow(v);
    expect(row.organization_id).toBe("org-55");
    expect(row.daily_rate).toBe(100);
  });
});

describe("reservation mappers", () => {
  it("round-trips a reservation preserving money + org scope", () => {
    const row = {
      id: "rsv-1",
      organization_id: "org-1",
      vehicle_id: "veh-1",
      customer_id: "cust-1",
      renter_name: "Grace Liu",
      renter_email: "grace@test.example",
      renter_phone: "555-1234",
      start_date: "2026-11-01",
      end_date: "2026-11-05",
      status: "pending_verification",
      source: "manual",
      ghl_opportunity_id: null,
      total_price: "400.00",
      deposit_amount: "200.00",
      deposit_status: "held",
      amount_paid: "0.00",
      converted_to_rental_id: null,
      pricing_snapshot: null,
      created_at: "2026-01-01T00:00:00Z",
      created_by: null,
      created_by_name: "System",
    };
    const r = rowToReservation(row as unknown as ReservationRow);
    expect(r.total_price).toBe(400);
    expect(r.deposit_amount).toBe(200);
    expect(r.amount_paid).toBe(0);
    expect(r.tenant_id).toBe("org-1");
    expect(r.status).toBe("pending_verification");

    const backToRow = reservationToRow(r);
    expect(backToRow.organization_id).toBe("org-1");
    expect(backToRow.total_price).toBe(400);
    expect(backToRow.customer_id).toBe("cust-1");
  });
});
