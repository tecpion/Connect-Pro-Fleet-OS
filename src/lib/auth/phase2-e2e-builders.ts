// Phase 2 E2E — domain object builders for test records.
import type { Customer, Vehicle, Reservation } from "@/lib/types";
import type { BookingRequest } from "@/lib/bookingRequestTypes";
import type { Inspection } from "@/lib/inspectionTypes";
import type { RentalDeposit, DepositHistoryEvent } from "@/lib/depositTypes";

export function buildCustomer(orgA: string, stamp: number): Customer {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    first_name: "Grace",
    last_name: "Liu",
    phone: "555-0100",
    email: `grace-${stamp}@phase2.test`,
    date_of_birth: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    customer_status: "good_standing",
    customer_source: "connect_pro",
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
    created_at: now,
    updated_at: now,
  };
}

export function buildVehicle(orgA: string, stamp: number): Vehicle {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    vin: `E2E2${stamp}`,
    make: "Jeep",
    model: "Wrangler",
    year: 2022,
    license_plate: "E2E-A",
    status: "available",
    location: "lot-1",
    vehicle_type: "suv",
    vehicle_class_id: null,
    pricing_override: false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: 75,
    weekly_rate: 450,
    deposit_amount: 500,
    images: [],
    documents: [],
    purchase_date: "",
    purchase_price: 0,
    current_mileage: 12000,
    insurance_policy_number: "",
    insurance_expiry: "",
    registration_expiry: "",
    ownership_type: "company_owned",
    owner_entity_id: null,
    owner_display_name: null,
    ownership_notes: null,
    ownership_effective_date: null,
    created_at: now,
    updated_at: now,
  };
}

export function buildBooking(
  orgA: string,
  vehId: string,
  stamp: number,
  custId: string,
): BookingRequest {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organization_id: orgA,
    location_id: null,
    first_name: "Grace",
    last_name: "Liu",
    phone: "555-0100",
    email: `grace-${stamp}@phase2.test`,
    requested_vehicle_id: vehId,
    requested_vehicle_class_id: null,
    requested_start_date: "2026-11-01",
    requested_end_date: "2026-11-05",
    rental_duration_type: "daily",
    notes: "Phase 2 E2E",
    driver_license_document_reference: null,
    driver_license_status: "not_provided",
    verification_status: "pending",
    source: "manual",
    crm_contact_id: null,
    crm_opportunity_id: null,
    crm_pipeline_stage: null,
    external_request_id: `ext-${stamp}`,
    lead_source: "Manual entry",
    submitted_at: now,
    form_answers: null,
    status: "new",
    assigned_to: null,
    customer_match: { kind: "none" },
    converted_reservation_id: null,
    declined: null,
    waitlist: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
}

export function buildReservation(
  orgA: string,
  vehId: string,
  custId: string,
  stamp: number,
): Reservation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    vehicle_id: vehId,
    customer_id: custId,
    renter_name: "Grace Liu",
    renter_email: `grace-${stamp}@phase2.test`,
    renter_phone: "555-0100",
    start_date: "2026-11-01",
    end_date: "2026-11-05",
    status: "confirmed",
    source: "manual",
    ghl_opportunity_id: null,
    total_price: 400,
    deposit_amount: 200,
    deposit_status: "held",
    amount_paid: 200,
    converted_to_rental_id: null,
    pricing_snapshot: null,
    created_at: now,
    created_by: null,
    created_by_name: "Owner Alpha",
  };
}

export function buildDeposit(
  orgA: string,
  rsvId: string,
  custId: string,
  vehId: string,
): RentalDeposit {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    reservation_id: rsvId,
    rental_id: null,
    customer_id: custId,
    vehicle_id: vehId,
    policy_id: null,
    required_amount: 200,
    collected_amount: 200,
    applied_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0,
    status: "held",
    currency: "USD",
    source_snapshot: { source: "company_default" },
    collected_at: now,
    refund_due_at: null,
    completed_at: null,
    notes: "Phase 2 E2E deposit",
    created_at: now,
    updated_at: now,
    created_by: null,
  };
}

export function buildDepositHistory(
  orgA: string,
  depId: string,
  stamp: number,
): DepositHistoryEvent {
  return {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    deposit_id: depId,
    event_type: "collected",
    amount: 200,
    payment_method: "card",
    transaction_id: null,
    reason: null,
    staff_id: null,
    at: new Date().toISOString(),
    request_key: `dhe-${stamp}`,
  };
}

export function buildInspection(
  orgA: string,
  rsvId: string,
  vehId: string,
): Inspection {
  return {
    id: crypto.randomUUID(),
    reservation_id: rsvId,
    vehicle_id: vehId,
    inspection_type: "checkout",
    photos: [],
    odometer_reading: 12000,
    fuel_level: 100,
    damage_notes: "No visible damage",
    damage_detected: false,
    damage_ai_confidence: 0,
    damage_ai_flagged_regions: [],
    inspector_signature_url: null,
    timestamp: new Date().toISOString(),
    tenant_id: orgA,
  };
}
