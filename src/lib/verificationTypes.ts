// Connect Pro Fleet — Customer Verification domain types (V1).
//
// Provider-agnostic verification domain model. Third-party paid verification
// services (identity, license, insurance, MVR, background) are OPTIONAL and
// company-controlled. Not every rental company uses them. Document collection
// (DL on file, insurance on file) is a SEPARATE concept from third-party paid
// verification — a document on file does NOT mean it has been verified.
//
// Principles:
//  - Verification is NEVER mandatory by default. The company owner chooses Off /
//    Staff Decides / Required per verification type. Staff may also require a
//    check per-customer / per-rental.
//  - Paid checks do NOT run automatically (V1 default = Manual). Running one
//    may incur a usage charge; staff confirm first.
//  - No proprietary Fleet risk score is created — only normalized provider
//    result statuses are surfaced.
//  - Records are organization-scoped (enforced in selectors now; backend RLS
//    later). Customer info is never copied into verification records
//    unnecessarily — rental/customer context is resolved through authoritative
//    records.
//  - Missing data remains missing (never rendered as zero/false).
//
// Developer-later: real provider APIs/credentials, live pricing, Stripe/billing,
// Supabase persistence, RLS, secure sensitive-data handling, retention rules.

// ───────────────────────── Verification types ─────────────────────────

export type VerificationType =
  "identity" | "drivers_license" | "insurance" | "mvr" | "background";

export const VERIFICATION_TYPE_LABELS: Record<VerificationType, string> = {
  identity: "Identity Verification",
  drivers_license: "Driver's License Verification",
  insurance: "Insurance Verification",
  mvr: "MVR / Driving Record",
  background: "Background Screening",
};

export const VERIFICATION_TYPE_SHORT: Record<VerificationType, string> = {
  identity: "Identity",
  drivers_license: "License",
  insurance: "Insurance",
  mvr: "MVR",
  background: "Background",
};

// ───────────────────────── Company policy (per type) ─────────────────────────

/** Off / Staff Decides / Required — the three-mode company policy applied to
 *  each verification type. Off hides the service from the normal workflow. */
export type VerificationPolicyMode = "off" | "staff_decides" | "required";

export const VERIFICATION_POLICY_MODE_LABELS: Record<
  VerificationPolicyMode,
  string
> = {
  off: "Off",
  staff_decides: "Staff Decides",
  required: "Required",
};

export const VERIFICATION_POLICY_MODE_DESCRIPTIONS: Record<
  VerificationPolicyMode,
  string
> = {
  off: "Do not require or surface this check during normal workflow.",
  staff_decides:
    "Staff can require/run the check for specific customers or rentals.",
  required: "The check is required for every applicable renter before release.",
};

/** Company-level policy for paid/third-party verification services. */
export interface VerificationServicesPolicy {
  /** Per-type mode. Absent = Off (service hidden). */
  modes: Partial<Record<VerificationType, VerificationPolicyMode>>;
  /** Auto-run trigger. V1 default = manual_only. */
  auto_run: VerificationAutoRunTrigger;
}

export type VerificationAutoRunTrigger =
  "manual_only" | "on_booking_request" | "on_reservation" | "before_checkout";

export const VERIFICATION_AUTORUN_LABELS: Record<
  VerificationAutoRunTrigger,
  string
> = {
  manual_only: "Manual Only",
  on_booking_request: "On Booking Request",
  on_reservation: "On Reservation Creation",
  before_checkout: "Before Checkout",
};

// ───────────────────────── Document collection (separate) ─────────────────────────

/** Document-collection policy for DL/Insurance. Distinct from paid verification. */
export type DocumentCollectionMode = "not_required" | "optional" | "required";

export const DOCUMENT_COLLECTION_LABELS: Record<
  DocumentCollectionMode,
  string
> = {
  not_required: "Not Required",
  optional: "Optional",
  required: "Required",
};

export interface VerificationDocumentPolicy {
  drivers_license: DocumentCollectionMode;
  insurance: DocumentCollectionMode;
}

// ───────────────────────── Per-customer/per-rental requirement ─────────────────────────

/** An operational requirement staff added for a specific customer / rental /
 *  booking request / reservation. Does NOT modify company global policy. */
export interface VerificationRequirement {
  id: string;
  organization_id: string;
  verification_type: VerificationType;
  /** Exactly one of these is set. */
  customer_id: string | null;
  booking_request_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  required_by_staff_id: string;
  required_at: string;
  reason: string | null;
  removed: boolean;
  removed_by_staff_id: string | null;
  removed_at: string | null;
}

// ───────────────────────── Verification request ─────────────────────────

export type VerificationRequestStatus =
  | "not_started"
  | "pending"
  | "completed"
  | "needs_review"
  | "failed"
  | "cancelled"
  | "expired"
  | "provider_error";

export const VERIFICATION_REQUEST_STATUS_LABELS: Record<
  VerificationRequestStatus,
  string
> = {
  not_started: "Not Started",
  pending: "Pending",
  completed: "Completed",
  needs_review: "Needs Review",
  failed: "Failed",
  cancelled: "Cancelled",
  expired: "Expired",
  provider_error: "Provider Error",
};

export interface VerificationRequest {
  id: string;
  organization_id: string;
  customer_id: string | null;
  booking_request_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  verification_type: VerificationType;
  provider: VerificationProviderId;
  status: VerificationRequestStatus;
  requested_at: string;
  completed_at: string | null;
  requested_by: string | null;
  external_reference: string | null;
  expires_at: string | null;
  usage_charge_id: string | null;
  result: VerificationResult | null;
  created_at: string;
  updated_at: string;
}

// ───────────────────────── Verification result ─────────────────────────

export type VerificationResultStatus =
  | "verified"
  | "clear"
  | "needs_review"
  | "failed"
  | "pending"
  | "expired"
  | "not_run";

export const VERIFICATION_RESULT_LABELS: Record<
  VerificationResultStatus,
  string
> = {
  verified: "Verified",
  clear: "Clear",
  needs_review: "Needs Review",
  failed: "Failed",
  pending: "Pending",
  expired: "Expired",
  not_run: "Not Run",
};

export interface VerificationResult {
  verification_request_id: string;
  result_status: VerificationResultStatus;
  summary: string | null;
  flags: string[];
  completed_at: string;
  provider_reference: string | null;
  /** Normalized MVR facts (only present for type === "mvr"). */
  mvr?: VerificationMvrFacts | null;
}

/** Normalized mock MVR facts — factual provider results, no risk score. */
export interface VerificationMvrFacts {
  license_status: string | null;
  violation_count: number | null;
  major_violations: number | null;
  accidents_reported: number | null;
  result_date: string | null;
}

// ───────────────────────── Usage charge (mock) ─────────────────────────

export type UsageChargeStatus =
  "estimated" | "authorized" | "charged" | "voided" | "failed";

export const USAGE_CHARGE_STATUS_LABELS: Record<UsageChargeStatus, string> = {
  estimated: "Estimated",
  authorized: "Authorized",
  charged: "Charged",
  voided: "Voided",
  failed: "Failed",
};

export interface VerificationUsageCharge {
  id: string;
  organization_id: string;
  verification_request_id: string;
  service_type: VerificationType;
  provider: VerificationProviderId;
  provider_cost_mock: number | null;
  platform_price_mock: number;
  currency: string;
  status: UsageChargeStatus;
  created_at: string;
}

// ───────────────────────── Override ─────────────────────────

/** Permission-controlled operational override. The provider result is
 *  PRESERVED (unchanged); the override is an operational decision recorded on
 *  top. Never silent — always audited. */
export interface VerificationOverride {
  id: string;
  organization_id: string;
  verification_request_id: string;
  decision: "approved" | "denied";
  reason: string;
  staff_id: string;
  created_at: string;
}

// ───────────────────────── Audit history (append-only) ─────────────────────────

export type VerificationAuditEventType =
  | "requirement_added"
  | "requirement_removed"
  | "check_requested"
  | "check_completed"
  | "provider_result"
  | "staff_review"
  | "override"
  | "usage_charge_generated";

export const VERIFICATION_AUDIT_LABELS: Record<
  VerificationAuditEventType,
  string
> = {
  requirement_added: "Requirement added",
  requirement_removed: "Requirement removed",
  check_requested: "Check requested",
  check_completed: "Check completed",
  provider_result: "Provider result",
  staff_review: "Staff review",
  override: "Override",
  usage_charge_generated: "Usage charge generated",
};

export interface VerificationAuditEvent {
  id: string;
  organization_id: string;
  verification_type: VerificationType;
  customer_id: string | null;
  rental_id: string | null;
  reservation_id: string | null;
  booking_request_id: string | null;
  event_type: VerificationAuditEventType;
  detail: string | null;
  actor_id: string | null;
  created_at: string;
}

// ───────────────────────── Provider adapter contract ─────────────────────────

/** Mock provider ids. These are NOT real vendors — generic profiles only. */
export type VerificationProviderId =
  | "full_provider"
  | "identity_license"
  | "mvr_provider"
  | "insurance_provider"
  | "custom";

export const VERIFICATION_PROVIDER_LABELS: Record<
  VerificationProviderId,
  string
> = {
  full_provider: "Full Verification Provider",
  identity_license: "Identity + License Provider",
  mvr_provider: "MVR Provider",
  insurance_provider: "Insurance Verification Provider",
  custom: "Custom / Other Provider",
};

/** Provider-neutral adapter. Capability flags let the UI hide unsupported
 *  services. Provider-specific translation belongs HERE only. */
export interface VerificationProviderAdapter {
  provider: VerificationProviderId;
  label: string;
  connected: boolean;
  supportsIdentity: boolean;
  supportsLicense: boolean;
  supportsInsurance: boolean;
  supportsMvr: boolean;
  supportsBackground: boolean;
  /** Mock estimated usage price per service type (no real pricing). */
  estimatePrice: (type: VerificationType) => number;
}

// ───────────────────────── Resolved requirement ─────────────────────────

/** The resolved requirement for a verification type for a given rental
 *  context. Derived from COMPANY POLICY + per-customer/per-rental
 *  requirements. This is the single authoritative selector — screens do not
 *  duplicate this logic. */
export interface ResolvedVerificationRequirement {
  verification_type: VerificationType;
  /** True when this check is required for this rental (company Required OR
   *  staff-required for this customer/rental). */
  required: boolean;
  /** Why it is required: "company_policy" | "staff_requirement" | null. */
  required_reason: "company_policy" | "staff_requirement" | null;
  /** Whether the service is enabled by company policy (not Off). */
  enabled: boolean;
  /** Company policy mode for this type. */
  company_mode: VerificationPolicyMode;
  /** The latest verification request for this type + context, if any. */
  latest_request: VerificationRequest | null;
  /** Whether an active override applies. */
  overridden: boolean;
}

export type VerificationReadiness =
  | "ready"
  | "optional_available"
  | "required_pending"
  | "needs_review"
  | "failed"
  | "expired";
