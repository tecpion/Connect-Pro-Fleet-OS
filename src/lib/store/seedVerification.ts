// Connect Pro Fleet — Verification mock seed data (V1).
//
// Realistic scenarios across existing seeded customers/rentals. Coherent with
// the canonical rentals so release-gate + Copilot + Action Center work. All
// records share the canonical org id (TENANT_ID) for tenant isolation.
//
// Scenarios covered (spec §26):
//  - customer with optional verification not run (cus_2, identity optional)
//  - customer manually required to run identity verification (cus_3, rnt_4)
//  - MVR clear (cus_8)
//  - MVR needs review (cus_4)
//  - insurance document on file but verification not run (cus_1)
//  - verification provider error (cus_5, identity)
//  - expired verification (cus_7, mvr)
//  - repeat customer with historical checks (cus_8 — two MVR runs)
//  - ready-for-checkout rental blocked by required check (rnt_4 / cus_3)
//  - optional background screening disabled (no record — company Off)
//  - manual usage charge created (cus_8 MVR)
//  - override scenario (cus_4 MVR needs review → approved override)
//
// Company policy (seed) is all-Off by default (defaultVerificationServices).
// The scenarios below that REQUIRE a service to be enabled assume the company
// policy is patched at the store level in tests / demo. The seed requests
// themselves are standalone records; the resolved selector reads policy at
// runtime. To make the demo coherent, the seed company policy is patched in
// seedVerificationPolicy() below to enable license verification (Required) and
// MVR / identity (Staff Decides) so the seeded requests surface meaningfully.

import type {
  VerificationRequest,
  VerificationResult,
  VerificationUsageCharge,
  VerificationRequirement,
  VerificationOverride,
  VerificationAuditEvent,
  VerificationServicesPolicy,
  VerificationDocumentPolicy,
} from "@/lib/verificationTypes";
import { TENANT_ID } from "./ids";

/** Seed company verification-services policy. NOT all-Off: license verification
 *  is Required (gates checkout), MVR + identity are Staff Decides, insurance +
 *  background are Off. This makes the seeded scenarios operationally visible
 *  while still demonstrating that Off services are hidden. */
export const seedVerificationPolicy: VerificationServicesPolicy = {
  modes: {
    identity: "staff_decides",
    drivers_license: "required",
    insurance: "off",
    mvr: "staff_decides",
    background: "off",
  },
  auto_run: "manual_only",
};

export const seedVerificationDocumentPolicy: VerificationDocumentPolicy = {
  drivers_license: "required",
  insurance: "optional",
};

const NOW = "2026-09-27T12:00:00Z";

function result(
  requestId: string,
  status: VerificationResult["result_status"],
  summary: string,
  flags: string[] = [],
  completedAt = NOW,
  mvr?: VerificationResult["mvr"],
): VerificationResult {
  return {
    verification_request_id: requestId,
    result_status: status,
    summary,
    flags,
    completed_at: completedAt,
    provider_reference: "mock_" + requestId,
    mvr: mvr ?? null,
  };
}

export const seedVerificationRequests: VerificationRequest[] = [
  // cus_1 (Hannah, rnt_1 active) — license verification completed/verified.
  {
    id: "vreq_1",
    organization_id: TENANT_ID,
    customer_id: "cus_1",
    booking_request_id: null,
    reservation_id: null,
    rental_id: "rnt_1",
    verification_type: "drivers_license",
    provider: "identity_license",
    status: "completed",
    requested_at: "2026-08-24T09:00:00Z",
    completed_at: "2026-08-24T09:10:00Z",
    requested_by: "stf_1",
    external_reference: "EXT-VQ-1001",
    expires_at: "2027-08-24T09:10:00Z",
    usage_charge_id: "vuc_1",
    result: result(
      "vreq_1",
      "verified",
      "License verified against state DMV record.",
      [],
    ),
    created_at: "2026-08-24T09:00:00Z",
    updated_at: "2026-08-24T09:10:00Z",
  },
  // cus_1 — insurance document on file but verification NOT run (no request).
  // (No record — demonstrates "document on file ≠ verified".)

  // cus_8 (Marcus, rnt_2 late) — MVR clear (repeat customer, historical).
  {
    id: "vreq_2",
    organization_id: TENANT_ID,
    customer_id: "cus_8",
    booking_request_id: null,
    reservation_id: null,
    rental_id: "rnt_2",
    verification_type: "mvr",
    provider: "mvr_provider",
    status: "completed",
    requested_at: "2026-09-20T10:00:00Z",
    completed_at: "2026-09-20T10:05:00Z",
    requested_by: "stf_1",
    external_reference: "EXT-VQ-2002",
    expires_at: "2027-09-20T10:05:00Z",
    usage_charge_id: "vuc_2",
    result: result(
      "vreq_2",
      "clear",
      "MVR clear — no major violations in 36 months.",
      [],
      "2026-09-20T10:05:00Z",
      {
        license_status: "valid",
        violation_count: 0,
        major_violations: 0,
        accidents_reported: 0,
        result_date: "2026-09-20",
      },
    ),
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:05:00Z",
  },
  // cus_8 — historical MVR (older run, repeat customer history preserved).
  {
    id: "vreq_3",
    organization_id: TENANT_ID,
    customer_id: "cus_8",
    booking_request_id: null,
    reservation_id: null,
    rental_id: null,
    verification_type: "mvr",
    provider: "mvr_provider",
    status: "completed",
    requested_at: "2026-01-15T09:30:00Z",
    completed_at: "2026-01-15T09:35:00Z",
    requested_by: "stf_1",
    external_reference: "EXT-VQ-2001",
    expires_at: "2027-01-15T09:35:00Z",
    usage_charge_id: "vuc_3",
    result: result(
      "vreq_3",
      "clear",
      "MVR clear at initial onboarding.",
      [],
      "2026-01-15T09:35:00Z",
      {
        license_status: "valid",
        violation_count: 0,
        major_violations: 0,
        accidents_reported: 0,
        result_date: "2026-01-15",
      },
    ),
    created_at: "2026-01-15T09:30:00Z",
    updated_at: "2026-01-15T09:35:00Z",
  },
  // cus_4 (Noah, watchlist) — MVR needs review (2 violations).
  {
    id: "vreq_4",
    organization_id: TENANT_ID,
    customer_id: "cus_4",
    booking_request_id: null,
    reservation_id: null,
    rental_id: null,
    verification_type: "mvr",
    provider: "mvr_provider",
    status: "needs_review",
    requested_at: "2026-09-01T14:00:00Z",
    completed_at: "2026-09-01T14:06:00Z",
    requested_by: "stf_1",
    external_reference: "EXT-VQ-3004",
    expires_at: "2027-09-01T14:06:00Z",
    usage_charge_id: "vuc_4",
    result: result(
      "vreq_4",
      "needs_review",
      "MVR shows 2 moving violations in 24 months — staff review required.",
      ["2_moving_violations"],
      "2026-09-01T14:06:00Z",
      {
        license_status: "valid",
        violation_count: 2,
        major_violations: 0,
        accidents_reported: 0,
        result_date: "2026-09-01",
      },
    ),
    created_at: "2026-09-01T14:00:00Z",
    updated_at: "2026-09-01T14:06:00Z",
  },
  // cus_5 (Sofia) — identity verification provider error.
  {
    id: "vreq_5",
    organization_id: TENANT_ID,
    customer_id: "cus_5",
    booking_request_id: null,
    reservation_id: null,
    rental_id: null,
    verification_type: "identity",
    provider: "full_provider",
    status: "provider_error",
    requested_at: "2026-09-25T11:00:00Z",
    completed_at: null,
    requested_by: "stf_1",
    external_reference: "EXT-VQ-4005",
    expires_at: null,
    usage_charge_id: null,
    result: null,
    created_at: "2026-09-25T11:00:00Z",
    updated_at: "2026-09-25T11:02:00Z",
  },
  // cus_7 (Ethan, previous renter) — expired MVR.
  {
    id: "vreq_6",
    organization_id: TENANT_ID,
    customer_id: "cus_7",
    booking_request_id: null,
    reservation_id: null,
    rental_id: null,
    verification_type: "mvr",
    provider: "mvr_provider",
    status: "expired",
    requested_at: "2025-06-01T09:00:00Z",
    completed_at: "2025-06-01T09:05:00Z",
    requested_by: "stf_1",
    external_reference: "EXT-VQ-5006",
    expires_at: "2026-06-01T09:05:00Z",
    usage_charge_id: "vuc_6",
    result: result(
      "vreq_6",
      "expired",
      "MVR result expired — rerun required if check is required.",
      [],
      "2025-06-01T09:05:00Z",
      {
        license_status: "valid",
        violation_count: 1,
        major_violations: 0,
        accidents_reported: 0,
        result_date: "2025-06-01",
      },
    ),
    created_at: "2025-06-01T09:00:00Z",
    updated_at: "2026-09-27T12:00:00Z",
  },
  // cus_3 (Priya, rnt_4 active) — required identity verification pending
  // (staff-required). This blocks rnt_4 checkout in the release gate.
  {
    id: "vreq_7",
    organization_id: TENANT_ID,
    customer_id: "cus_3",
    booking_request_id: null,
    reservation_id: null,
    rental_id: "rnt_4",
    verification_type: "identity",
    provider: "full_provider",
    status: "pending",
    requested_at: "2026-09-26T15:00:00Z",
    completed_at: null,
    requested_by: "stf_1",
    external_reference: "EXT-VQ-6007",
    expires_at: null,
    usage_charge_id: "vuc_7",
    result: null,
    created_at: "2026-09-26T15:00:00Z",
    updated_at: "2026-09-26T15:00:00Z",
  },
  // cus_3 (Priya, rnt_4) — license verification failed (required → blocks).
  {
    id: "vreq_8",
    organization_id: TENANT_ID,
    customer_id: "cus_3",
    booking_request_id: null,
    reservation_id: null,
    rental_id: "rnt_4",
    verification_type: "drivers_license",
    provider: "identity_license",
    status: "failed",
    requested_at: "2026-09-26T15:05:00Z",
    completed_at: "2026-09-26T15:12:00Z",
    requested_by: "stf_1",
    external_reference: "EXT-VQ-6008",
    expires_at: null,
    usage_charge_id: "vuc_8",
    result: result(
      "vreq_8",
      "failed",
      "License verification failed — document mismatch.",
      ["document_mismatch"],
    ),
    created_at: "2026-09-26T15:05:00Z",
    updated_at: "2026-09-26T15:12:00Z",
  },
];

export const seedVerificationUsageCharges: VerificationUsageCharge[] = [
  {
    id: "vuc_1",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_1",
    service_type: "drivers_license",
    provider: "identity_license",
    provider_cost_mock: 2,
    platform_price_mock: 4,
    currency: "USD",
    status: "charged",
    created_at: "2026-08-24T09:00:00Z",
  },
  {
    id: "vuc_2",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_2",
    service_type: "mvr",
    provider: "mvr_provider",
    provider_cost_mock: 5,
    platform_price_mock: 8,
    currency: "USD",
    status: "charged",
    created_at: "2026-09-20T10:00:00Z",
  },
  {
    id: "vuc_3",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_3",
    service_type: "mvr",
    provider: "mvr_provider",
    provider_cost_mock: 5,
    platform_price_mock: 8,
    currency: "USD",
    status: "charged",
    created_at: "2026-01-15T09:30:00Z",
  },
  {
    id: "vuc_4",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_4",
    service_type: "mvr",
    provider: "mvr_provider",
    provider_cost_mock: 5,
    platform_price_mock: 8,
    currency: "USD",
    status: "charged",
    created_at: "2026-09-01T14:00:00Z",
  },
  {
    id: "vuc_6",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_6",
    service_type: "mvr",
    provider: "mvr_provider",
    provider_cost_mock: 5,
    platform_price_mock: 8,
    currency: "USD",
    status: "charged",
    created_at: "2025-06-01T09:00:00Z",
  },
  {
    id: "vuc_7",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_7",
    service_type: "identity",
    provider: "full_provider",
    provider_cost_mock: 3,
    platform_price_mock: 5,
    currency: "USD",
    status: "authorized",
    created_at: "2026-09-26T15:00:00Z",
  },
  {
    id: "vuc_8",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_8",
    service_type: "drivers_license",
    provider: "identity_license",
    provider_cost_mock: 2,
    platform_price_mock: 4,
    currency: "USD",
    status: "charged",
    created_at: "2026-09-26T15:05:00Z",
  },
];

export const seedVerificationRequirements: VerificationRequirement[] = [
  // cus_3 / rnt_4 — staff required identity verification (company is Staff
  // Decides, so this makes it required for this rental).
  {
    id: "vreq_req_1",
    organization_id: TENANT_ID,
    verification_type: "identity",
    customer_id: "cus_3",
    booking_request_id: null,
    reservation_id: null,
    rental_id: "rnt_4",
    required_by_staff_id: "stf_1",
    required_at: "2026-09-26T14:55:00Z",
    reason: "New customer — identity verification required before checkout.",
    removed: false,
    removed_by_staff_id: null,
    removed_at: null,
  },
];

export const seedVerificationOverrides: VerificationOverride[] = [
  // cus_4 — MVR needs review, but staff approved checkout override (provider
  // result preserved as needs_review; override is an operational decision).
  {
    id: "vov_1",
    organization_id: TENANT_ID,
    verification_request_id: "vreq_4",
    decision: "approved",
    reason:
      "Violations are minor speeding; manager approves rental with documented review.",
    staff_id: "stf_1",
    created_at: "2026-09-02T10:00:00Z",
  },
];

export const seedVerificationAudit: VerificationAuditEvent[] = [
  {
    id: "vaud_1",
    organization_id: TENANT_ID,
    verification_type: "identity",
    customer_id: "cus_3",
    rental_id: "rnt_4",
    reservation_id: null,
    booking_request_id: null,
    event_type: "requirement_added",
    detail: "Identity verification required for rnt_4 checkout.",
    actor_id: "stf_1",
    created_at: "2026-09-26T14:55:00Z",
  },
  {
    id: "vaud_2",
    organization_id: TENANT_ID,
    verification_type: "identity",
    customer_id: "cus_3",
    rental_id: "rnt_4",
    reservation_id: null,
    booking_request_id: null,
    event_type: "check_requested",
    detail: "Identity check requested (provider: full_provider).",
    actor_id: "stf_1",
    created_at: "2026-09-26T15:00:00Z",
  },
  {
    id: "vaud_3",
    organization_id: TENANT_ID,
    verification_type: "drivers_license",
    customer_id: "cus_3",
    rental_id: "rnt_4",
    reservation_id: null,
    booking_request_id: null,
    event_type: "check_completed",
    detail: "License verification completed — failed (document mismatch).",
    actor_id: "stf_1",
    created_at: "2026-09-26T15:12:00Z",
  },
  {
    id: "vaud_4",
    organization_id: TENANT_ID,
    verification_type: "mvr",
    customer_id: "cus_4",
    rental_id: null,
    reservation_id: null,
    booking_request_id: null,
    event_type: "override",
    detail: "Checkout override approved — MVR needs review (result preserved).",
    actor_id: "stf_1",
    created_at: "2026-09-02T10:00:00Z",
  },
  {
    id: "vaud_5",
    organization_id: TENANT_ID,
    verification_type: "mvr",
    customer_id: "cus_8",
    rental_id: null,
    reservation_id: null,
    booking_request_id: null,
    event_type: "usage_charge_generated",
    detail: "Usage charge $8.00 generated for MVR check.",
    actor_id: "stf_1",
    created_at: "2026-09-20T10:00:00Z",
  },
];

export interface VerificationMockState {
  requests: VerificationRequest[];
  usageCharges: VerificationUsageCharge[];
  requirements: VerificationRequirement[];
  overrides: VerificationOverride[];
  audit: VerificationAuditEvent[];
}

export const mockVerificationState: VerificationMockState = {
  requests: seedVerificationRequests,
  usageCharges: seedVerificationUsageCharges,
  requirements: seedVerificationRequirements,
  overrides: seedVerificationOverrides,
  audit: seedVerificationAudit,
};
