// Phase 3 E2E — frozen-shape domain object builders for the release gate.
// Split out so the main E2E runner stays focused on step orchestration.

import type { Vehicle, RentalAgreement } from "@/lib/types";
import type { RentalDriver } from "@/lib/defenseTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "@/lib/complianceTypes";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
} from "@/lib/verificationTypes";

export interface Phase3Context {
  orgA: string;
  userAId: string;
  userBId: string;
  vehId: string;
  custId: string;
  rentalId: string;
  now: Date;
  nowIso: string;
  stamp: number;
}

export function buildVehicle(ctx: Phase3Context): Vehicle {
  return {
    id: ctx.vehId,
    tenant_id: ctx.orgA,
    vin: `E2E3${ctx.stamp}`,
    make: "Jeep",
    model: "Wrangler",
    year: 2022,
    license_plate: "E2E3-A",
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
    current_mileage: 0,
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

export function buildRental(ctx: Phase3Context): RentalAgreement {
  return {
    id: ctx.rentalId,
    tenant_id: ctx.orgA,
    reservation_id: null,
    vehicle_id: ctx.vehId,
    customer_id: ctx.custId,
    renter_name: "Grace Liu",
    renter_email: "grace@e2e.test",
    renter_phone: "555-0100",
    start_date: "2026-11-01",
    end_date: "2026-11-05",
    status: "active",
    daily_rate: 75,
    weekly_rate: 450,
    deposit_amount: 500,
    deposit_status: "held",
    amount_paid: 0,
    balance_due: 0,
    pickup_odometer: 0,
    return_odometer: null,
    actual_return_date: null,
    notes: "",
    agreement_signed: true,
    agreement_signed_at: ctx.nowIso,
    agreement_signed_by: ctx.userAId,
    checkout_inspection_id: null,
    return_inspection_id: null,
    assigned_staff_id: ctx.userAId,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  } as unknown as RentalAgreement;
}

export function buildDrivers(ctx: Phase3Context): RentalDriver[] {
  return [
    {
      id: crypto.randomUUID(),
      rental_id: ctx.rentalId,
      customer_id: ctx.custId,
      full_name: "Grace Liu",
      role: "primary",
      license_number: "DL-123",
      license_state: "CA",
      license_expiry: "2030-01-01",
      verification_status: "verified",
      authorization_status: "active",
      created_at: ctx.nowIso,
      updated_at: ctx.nowIso,
    } as unknown as RentalDriver,
  ];
}

export function makeRequirement(
  ctx: Phase3Context,
  docType: string,
  opts: {
    required?: boolean;
    blocksMissing?: boolean;
    blocksExpired?: boolean;
    warningDays?: number;
    managerOverride?: boolean;
  } = {},
): ComplianceRequirement {
  return {
    id: crypto.randomUUID(),
    tenant_id: ctx.orgA,
    entity_type: "vehicle",
    document_type: docType as never,
    required: opts.required ?? true,
    blocks_operation_if_missing: opts.blocksMissing ?? true,
    blocks_operation_if_expired: opts.blocksExpired ?? true,
    requires_verification: false,
    warning_days: opts.warningDays ?? 30,
    active: true,
    block_behavior: null,
    manager_override_allowed: opts.managerOverride ?? true,
    source: "custom",
    applies_to: null,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}

export function makeDocument(
  ctx: Phase3Context,
  docType: string,
  status: string,
  expirationDate: string | null,
  verificationStatus = "verified",
): DocumentRecord {
  return {
    id: crypto.randomUUID(),
    tenant_id: ctx.orgA,
    document_type: docType as never,
    entity_type: "vehicle",
    entity_id: ctx.vehId,
    entity_label: "2022 Jeep Wrangler",
    document_number: null,
    issuer: null,
    state_jurisdiction: null,
    effective_date: null,
    expiration_date: expirationDate,
    status: status as never,
    verification_status: verificationStatus as never,
    file_reference: null,
    original_filename: null,
    mime_type: null,
    notes: null,
    source: "manual",
    uploaded_by: ctx.userAId,
    uploaded_at: ctx.nowIso,
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: ctx.userAId,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}

export function makeVerificationRequirement(
  ctx: Phase3Context,
  type: string,
): VerificationRequirement {
  return {
    id: crypto.randomUUID(),
    organization_id: ctx.orgA,
    verification_type: type as never,
    customer_id: ctx.custId,
    booking_request_id: null,
    reservation_id: null,
    rental_id: ctx.rentalId,
    required_by_staff_id: ctx.userAId,
    required_at: ctx.nowIso,
    reason: "Required for this rental",
    removed: false,
    removed_by_staff_id: null,
    removed_at: null,
  };
}

export function makeVerificationRequest(
  ctx: Phase3Context,
  type: string,
  status: string,
  resultStatus: string | null,
  summary: string,
): VerificationRequest {
  return {
    id: crypto.randomUUID(),
    organization_id: ctx.orgA,
    customer_id: ctx.custId,
    booking_request_id: null,
    reservation_id: null,
    rental_id: ctx.rentalId,
    verification_type: type as never,
    provider: "full_provider",
    status: status as never,
    requested_at: ctx.nowIso,
    completed_at: ctx.nowIso,
    requested_by: ctx.userAId,
    external_reference: null,
    expires_at: null,
    usage_charge_id: null,
    result: resultStatus
      ? {
          verification_request_id: "",
          result_status: resultStatus as never,
          summary,
          flags: [],
          completed_at: ctx.nowIso,
          provider_reference: null,
        }
      : null,
    created_at: ctx.nowIso,
    updated_at: ctx.nowIso,
  };
}

export function makeComplianceOverride(
  ctx: Phase3Context,
  docType: string,
  requirementId: string | null,
  reason: string,
  createdBy: string,
): ComplianceOverride {
  return {
    id: crypto.randomUUID(),
    tenant_id: ctx.orgA,
    entity_type: "vehicle",
    entity_id: ctx.vehId,
    document_type: docType as never,
    requirement_id: requirementId,
    reason,
    created_by: createdBy,
    created_at: ctx.nowIso,
    expires_at: null,
    active: true,
  };
}

export function makeVerificationOverride(
  ctx: Phase3Context,
  requestId: string,
  decision: "approved" | "denied",
  reason: string,
  staffId: string,
): VerificationOverride {
  return {
    id: crypto.randomUUID(),
    organization_id: ctx.orgA,
    verification_request_id: requestId,
    decision,
    reason,
    staff_id: staffId,
    created_at: ctx.nowIso,
  };
}
