// Phase 4 E2E — frozen-shape domain object builders for telematics,
// tolls/violations, and cases. Split out so the E2E runner stays focused.
//
// IMPORTANT: all production table IDs are uuid. Builders use crypto.randomUUID()
// for every entity id so inserts into live Cloud tables don't fail uuid casts.

import type { Vehicle, RentalAgreement } from "@/lib/types";
import type {
  TelematicsDevice,
  TelematicsDeviceAssignment,
} from "@/lib/telematicsTypes";
import type { Violation, MatchingConfidence } from "@/lib/violationTypes";
import type { CaseRecord } from "@/lib/caseCenterTypes";

export interface Phase4Context {
  orgA: string;
  userAId: string;
  userBId: string;
  vehId: string; // uuid
  custId: string; // uuid
  rentalId: string; // uuid
  now: Date;
  nowIso: string;
  stamp: number;
}

function uuid(): string {
  // crypto.randomUUID is available in the Node server runtime.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-" + String(Date.now()).slice(-12);
}

export function buildVehicle(ctx: Phase4Context): Vehicle {
  return {
    id: ctx.vehId,
    tenant_id: ctx.orgA,
    vin: `E2E4${ctx.stamp}`,
    make: "Ford",
    model: "Transit",
    year: 2023,
    license_plate: "E2E4-A",
    status: "rented",
    location: "lot-1",
    vehicle_type: "van",
    vehicle_class_id: null,
    pricing_override: false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: 90,
    weekly_rate: 540,
    deposit_amount: 600,
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
    ownership_effective_date: "",
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}

export function buildRental(ctx: Phase4Context): RentalAgreement {
  const now = ctx.now;
  // Possession interval: [now-1d 00:00, now+2d 23:59]. Events inside this
  // window match; events before/after fall to before_rental/after_return.
  const checkoutDate = new Date(now.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const returnDate = new Date(now.getTime() + 2 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    id: ctx.rentalId,
    tenant_id: ctx.orgA,
    reservation_id: null,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    agreement_number: `AGR-${ctx.stamp}`,
    status: "active",
    checkout_date: checkoutDate,
    checkout_time: "00:00",
    scheduled_return_date: returnDate,
    scheduled_return_time: "23:59",
    actual_return_date: returnDate,
    actual_return_time: "23:59",
    rate_type: "daily",
    rate_amount: 90,
    subtotal: 270,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 600,
    amount_paid: 0,
    balance_due: 0,
    mileage_out: 12000,
    mileage_in: null,
    fuel_out: null,
    fuel_in: null,
    weekly_payment_day: null,
    next_payment_due: null,
    payment_cutoff_time: null,
    grace_period: 0,
    late_fee: 0,
    late_fee_applied: false,
    weeks_rented: 0,
    created_by: ctx.userAId,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  } as unknown as RentalAgreement;
}

export function buildCustomer(ctx: Phase4Context) {
  return {
    id: ctx.custId,
    tenant_id: ctx.orgA,
    first_name: "Hector",
    last_name: "Park",
    phone: "555-0200",
    email: `hector-${ctx.stamp}@e2e.test`,
    date_of_birth: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    drivers_license_number: "",
    drivers_license_state: "",
    notes: "",
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  } as never;
}

export function buildTelematicsDevice(ctx: Phase4Context): TelematicsDevice {
  return {
    id: uuid(),
    organization_id: ctx.orgA,
    provider: "custom",
    external_device_id: `EXT-${ctx.stamp}`,
    imei_or_serial: `IMEI-${ctx.stamp}`,
    vehicle_id: ctx.vehId,
    status: "online",
    installed_at: ctx.nowIso,
    last_connected_at: ctx.nowIso,
    battery_voltage: 12.4,
    metadata: null,
  };
}

export function buildAssignment(
  ctx: Phase4Context,
  deviceId: string,
): TelematicsDeviceAssignment {
  return {
    id: uuid(),
    device_id: deviceId,
    vehicle_id: ctx.vehId,
    started_at: ctx.nowIso,
    ended_at: null,
    reason: "install",
  };
}

export function buildViolation(
  ctx: Phase4Context,
  opts: {
    id: string;
    externalEventId: string;
    occurredAt: string;
    vehicleId: string;
    rentalId: string | null;
    customerId: string | null;
    matchingConfidence: MatchingConfidence | null;
  },
): Violation {
  return {
    id: uuid(),
    tenant_id: ctx.orgA,
    violation_number: `VIO-${ctx.stamp}-${opts.id.slice(-4)}`,
    violation_type: "toll",
    status: "new",
    vehicle_id: opts.vehicleId,
    rental_id: opts.rentalId,
    customer_id: opts.customerId,
    occurred_at: opts.occurredAt,
    received_at: ctx.nowIso,
    due_at: null,
    issuing_authority: "Turnpike Authority",
    citation_number: `CITE-${opts.externalEventId}`,
    plate_number_snapshot: "E2E4-A",
    state_jurisdiction: "CA",
    location_description: "Mile 42",
    description: "Toll evasion",
    base_amount: 25,
    penalties_amount: 0,
    admin_fee_amount: 0,
    total_amount: 25,
    responsibility: "unknown",
    responsibility_reason: null,
    responsibility_notes: null,
    responsibility_decided_by: null,
    responsibility_decided_at: null,
    dispute_status: "not_disputed",
    dispute_reason: null,
    dispute_opened_at: null,
    dispute_resolved_at: null,
    dispute_decision_note: null,
    reduced_amount: null,
    company_payment_status: "not_paid",
    customer_charge_status: "not_charged",
    reimbursement_status: "none",
    linked_expense_id: null,
    customer_charge_transaction_id: null,
    charge_idempotency_key: null,
    assigned_staff_id: null,
    notes: null,
    source: "toll_provider",
    created_by: ctx.userAId,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
    resolved_at: null,
    provider: "turnpike",
    external_event_id: opts.externalEventId,
    matching_confidence: opts.matchingConfidence,
    reviewed_by: null,
    reviewed_at: null,
  } as unknown as Violation;
}

export function buildCase(ctx: Phase4Context, violationId: string): CaseRecord {
  return {
    id: uuid(),
    tenant_id: ctx.orgA,
    case_number: `CASE-2026-${ctx.stamp}`,
    category: "tolls_tickets",
    status: "new",
    priority: "normal",
    title: "Toll evasion — Mile 42",
    description: `Linked to violation ${violationId}`,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    rental_id: ctx.rentalId,
    event_date: ctx.nowIso,
    assigned_staff_id: null,
    location_id: null,
    due_date: null,
    responsibility: {
      determination: "unreviewed",
      reason: null,
      determined_by: null,
      determined_at: null,
    },
    amount_at_issue: 25,
    toll_detail: null,
    roadside_detail: null,
    dispute_detail: null,
    financial_links: {
      customer_charge_ids: [],
      payment_ids: [],
      deposit_application_ids: [],
      refund_ids: [],
      expense_ids: [],
      insurance_claim_refs: [],
    },
    evidence_links: {
      rental_id: ctx.rentalId,
      incident_id: null,
      violation_id: violationId,
      damage_claim_id: null,
      inspection_ids: [],
      vault_doc_refs: [],
      uploaded_file_refs: [],
    },
    outcome: null,
    notes: null,
    created_by: ctx.userAId,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
    last_activity_at: ctx.nowIso,
    resolved_at: null,
    closed_at: null,
  };
}

export { uuid as phase4Uuid };

/**
 * Minimal DB-shaped rows (organization_id, NOT NULL columns only) used by the
 * Phase 4 E2E setup so the Phase 1/2 FK chain customer→vehicle→rental exists
 * before telematics/violation/case inserts run. The domain builders above
 * emit `tenant_id`/images/documents which the live Postgres columns do not
 * have, so these are the correct shapes for raw table inserts.
 */
export function buildCustomerRow(ctx: Phase4Context): Record<string, unknown> {
  return {
    id: ctx.custId,
    organization_id: ctx.orgA,
    first_name: "Hector",
    last_name: "Park",
    phone: "555-0200",
    email: `hector-${ctx.stamp}@e2e.test`,
    customer_status: "active",
    customer_source: "walk_in",
    notes: "",
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}

export function buildVehicleRow(ctx: Phase4Context): Record<string, unknown> {
  return {
    id: ctx.vehId,
    organization_id: ctx.orgA,
    vin: `E2E4${ctx.stamp}`,
    make: "Ford",
    model: "Transit",
    year: 2023,
    license_plate: "E2E4-A",
    status: "rented",
    location: "lot-1",
    vehicle_type: "van",
    daily_rate: 90,
    weekly_rate: 540,
    deposit_amount: 600,
    purchase_price: 0,
    current_mileage: 12000,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}

export function buildRentalRow(ctx: Phase4Context): Record<string, unknown> {
  const now = ctx.now;
  const checkoutDate = new Date(now.getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const returnDate = new Date(now.getTime() + 2 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    id: ctx.rentalId,
    organization_id: ctx.orgA,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    agreement_number: `AGR-${ctx.stamp}`,
    status: "active",
    checkout_date: checkoutDate,
    checkout_time: "00:00",
    scheduled_return_date: returnDate,
    scheduled_return_time: "23:59",
    actual_return_date: returnDate,
    actual_return_time: "23:59",
    rate_type: "daily",
    rate_amount: 90,
    subtotal: 270,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 600,
    amount_paid: 0,
    balance_due: 0,
    mileage_out: 12000,
    fuel_out: null,
    fuel_in: null,
    grace_period: 0,
    late_fee: 0,
    late_fee_applied: false,
    weeks_rented: 0,
    created_by: ctx.userAId,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}
