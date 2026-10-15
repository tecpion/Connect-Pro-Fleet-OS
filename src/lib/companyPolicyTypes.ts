// Connect Pro Fleet — Company Policies domain types (Build #23).
//
// Structured, machine-readable company policy configuration so Connect Pro
// Fleet can serve many different private/independent rental business models
// (daily, multi-day minimum, weekly, biweekly, monthly, long-term, open-ended,
// custom). NOT hard-coded around weekly rentals.
//
// These are CONFIGURATION values. They do NOT redefine financial truth — the
// ledger, billing engine, deposit ledger, and exact-time late evaluator
// (Build #21) remain authoritative. Company policies feed those engines.
//
// Policy data is structured (not free-form text) so a future Connect Pro AI /
// knowledge base can answer "What is our late fee?" / "Can this customer
// extend?" / "What is the minimum rental?".

// ---------------------------------------------------------------------------
// Business hours
// ---------------------------------------------------------------------------

export interface BusinessHoursDay {
  open: boolean;
  open_time: string | null; // "09:00"
  close_time: string | null; // "18:00"
}

export interface BusinessHours {
  monday: BusinessHoursDay;
  tuesday: BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday: BusinessHoursDay;
  friday: BusinessHoursDay;
  saturday: BusinessHoursDay;
  sunday: BusinessHoursDay;
}

export const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

// ---------------------------------------------------------------------------
// Rental model
// ---------------------------------------------------------------------------

/** A supported rental/billing cadence a company can enable. */
export type RentalCadence =
  | "daily"
  | "multi_day"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "long_term"
  | "custom";

export interface RentalModelPolicy {
  /** Cadences this company supports. Multiple may be enabled. */
  enabled_cadences: RentalCadence[];
  /** Default cadence applied to new rentals when none is chosen. */
  default_cadence: RentalCadence;
  /** Minimum rental duration in days (null = no minimum). Independent of
   *  billing cadence: a rental may have a 4-day minimum but daily pricing. */
  minimum_duration_days: number | null;
  /** Maximum rental duration in days (null = no maximum). */
  maximum_duration_days: number | null;
  /** Allow open-ended / long-term rentals with no fixed end date. */
  allow_open_ended: boolean;
}

// ---------------------------------------------------------------------------
// Billing & payment
// ---------------------------------------------------------------------------

export type BillingCadence =
  "daily" | "weekly" | "biweekly" | "monthly" | "custom";

export interface PaymentPolicy {
  /** Default recurring billing cadence for new rentals. Reuses the existing
   *  BillingPeriod architecture — does NOT create a second billing engine. */
  default_billing_cadence: BillingCadence;
  /** "HH:MM" payment due cutoff (e.g. "14:00"), or null for end-of-day. The
   *  authoritative exact-time late evaluator consumes this. */
  payment_cutoff_time: string | null;
  /** Grace window in MINUTES after the cutoff before an obligation is late. */
  grace_period_minutes: number;
}

// ---------------------------------------------------------------------------
// Late fees
// ---------------------------------------------------------------------------

export type LateFeeType = "fixed" | "percentage" | "none";
export type LateFeeMode = "automatic" | "manual";
export type LateFeeFrequency = "once_per_period" | "once_per_event";

export interface LateFeePolicy {
  enabled: boolean;
  type: LateFeeType;
  /** Fixed dollar amount (when type === "fixed"). */
  fixed_amount: number;
  /** Percentage of the outstanding balance (when type === "percentage"). */
  percentage: number;
  /** Automatic = Fleet applies; manual = staff approval. Fleet stays
   *  authoritative — Connect Pro never applies a second fee. */
  mode: LateFeeMode;
  frequency: LateFeeFrequency;
}

// ---------------------------------------------------------------------------
// Accepted payment methods
// ---------------------------------------------------------------------------

export type PaymentMethodName =
  | "cash"
  | "zelle"
  | "cash_app"
  | "apple_pay"
  | "venmo"
  | "ach"
  | "bank_transfer"
  | "check"
  | "debit_card"
  | "credit_card"
  | "paypal"
  | "other";

export interface PaymentMethodConfig {
  method: PaymentMethodName;
  enabled: boolean;
  /** Presentation instructions, e.g. "Send to payments@company.com". Never
   *  stores sensitive banking credentials. */
  instructions: string | null;
}

// ---------------------------------------------------------------------------
// Security deposits
// ---------------------------------------------------------------------------

export type DepositRequirement = "required" | "optional" | "not_required";
export type DepositRefundTiming =
  "immediate" | "business_days" | "manual_review";
export type DepositApplicationCategory =
  | "unpaid_balance"
  | "late_fees"
  | "damage"
  | "fuel"
  | "cleaning"
  | "tolls_tickets"
  | "other";

export interface DepositPolicyConfig {
  requirement: DepositRequirement;
  /** Company default deposit amount. Vehicle Class may override. */
  default_amount: number;
  refund_timing: DepositRefundTiming;
  /** Business days to refund (when timing === "business_days"). */
  refund_business_days: number;
  /** Categories a deposit may be applied toward. Does not bypass the deposit
   *  ledger semantics. */
  allow_application_for: DepositApplicationCategory[];
}

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

export type ExtensionPolicyMode =
  "allowed" | "approval_required" | "not_allowed";
export type ExtensionPaymentRequirement =
  "required_before" | "partial_balance" | "manager_override" | "none";

export interface ExtensionPolicyConfig {
  mode: ExtensionPolicyMode;
  payment_requirement: ExtensionPaymentRequirement;
  /** Customer should request extension this many hours before return (null = anytime). */
  notice_hours: number | null;
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export type LateReturnFeeType =
  "none" | "fixed" | "hourly" | "daily" | "manual";

export interface ReturnPolicy {
  /** Standard company return cutoff ("HH:MM"), SEPARATE from payment cutoff. */
  return_cutoff_time: string | null;
  /** Grace window in MINUTES for returns (independent of payment grace). */
  grace_period_minutes: number;
  late_return_fee_type: LateReturnFeeType;
  late_return_fee_amount: number;
  /** "enforced" = current financial architecture safely applies; "pending" =
   *  configuration stored now, enforcement deferred to a future build. */
  enforcement: "enforced" | "pending";
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------

export type RenewalMode =
  | "ends_automatically"
  | "manual_extension"
  | "auto_renew_if_paid"
  | "auto_renew_unless_notice";

export interface RenewalPolicy {
  mode: RenewalMode;
}

// ---------------------------------------------------------------------------
// Mileage
// ---------------------------------------------------------------------------

export type MileagePolicyType =
  | "unlimited"
  | "daily_allowance"
  | "weekly_allowance"
  | "total_allowance"
  | "custom";

export interface MileagePolicyConfig {
  type: MileagePolicyType;
  /** Allowance per day / week / total (miles). */
  allowance: number;
  /** $/mile overage charge when mileage is limited. */
  overage_rate: number;
}

// ---------------------------------------------------------------------------
// Fuel
// ---------------------------------------------------------------------------

export type FuelPolicyType =
  "same_level" | "full_to_full" | "prepaid" | "included" | "custom";
export type FuelChargeType = "flat" | "per_gallon" | "manual";

export interface FuelPolicyConfig {
  type: FuelPolicyType;
  charge_type: FuelChargeType;
  charge_amount: number;
}

// ---------------------------------------------------------------------------
// Driver requirements
// ---------------------------------------------------------------------------

export type AdditionalDriverPolicy =
  "allowed" | "not_allowed" | "fee_required" | "approval_required";

export interface DriverRequirementsPolicy {
  minimum_age: number;
  license_required: boolean;
  license_verification_required: boolean;
  license_must_exceed_rental_end: boolean;
  allow_manual_override: boolean;
  additional_drivers: AdditionalDriverPolicy;
}

// ---------------------------------------------------------------------------
// Insurance
// ---------------------------------------------------------------------------

export type InsurancePolicyType =
  | "company_included"
  | "customer_must_provide"
  | "customer_may_provide"
  | "third_party"
  | "custom";

export interface InsurancePolicyConfig {
  type: InsurancePolicyType;
  own_insurance_discount: boolean;
  own_insurance_discount_amount: number;
  verification_required: boolean;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

export type ReservationMode =
  "instant" | "request_approval" | "staff_created_only";

export interface ReservationPolicy {
  mode: ReservationMode;
  /** Minimum lead time in hours before pickup (null = same-day allowed). */
  min_lead_time_hours: number | null;
  /** Maximum advance booking period in days (null = no limit). */
  max_advance_booking_days: number | null;
  /** How long a pending reservation holds availability (hours). */
  hold_hours: number | null;
}

// ---------------------------------------------------------------------------
// Cancellations
// ---------------------------------------------------------------------------

export type CancellationPolicyType =
  "free" | "fee" | "deposit_forfeiture" | "no_refund_after_cutoff" | "custom";

export interface CancellationPolicyConfig {
  type: CancellationPolicyType;
  fee_amount: number;
  /** Free until this many hours before pickup (null = always free). */
  free_cutoff_hours: number | null;
}

// ---------------------------------------------------------------------------
// Vehicle class policy overrides
// ---------------------------------------------------------------------------

/** Optional per-class overrides. `null`/absent = inherit company default. */
export interface VehicleClassPolicyOverrides {
  deposit_amount?: number | null;
  mileage?: Partial<MileagePolicyConfig> | null;
  fuel?: Partial<FuelPolicyConfig> | null;
  minimum_duration_days?: number | null;
}

// ---------------------------------------------------------------------------
// Frozen rental policy snapshot
// ---------------------------------------------------------------------------

/** Policy terms frozen onto a rental at checkout so later company/class
 *  changes never retroactively alter an active or historical agreement. */
export interface RentalPolicySnapshot {
  payment_cutoff_time: string | null;
  grace_period_minutes: number;
  late_fee: {
    enabled: boolean;
    type: LateFeeType;
    fixed_amount: number;
    percentage: number;
    mode: LateFeeMode;
    frequency: LateFeeFrequency;
  };
  deposit: {
    requirement: DepositRequirement;
    amount: number;
    refund_timing: DepositRefundTiming;
  };
  mileage: MileagePolicyConfig;
  fuel: FuelPolicyConfig;
  returns: Pick<
    ReturnPolicy,
    | "return_cutoff_time"
    | "grace_period_minutes"
    | "late_return_fee_type"
    | "late_return_fee_amount"
  >;
  billing_cadence: BillingCadence;
  /** Source labels for auditability. */
  source: {
    deposit: "company" | "class" | "override";
    mileage: "company" | "class";
    fuel: "company" | "class";
  };
  /** When the snapshot was frozen. */
  frozen_at: string;
}

// ---------------------------------------------------------------------------
// Documents & Compliance policy (Build #26)
// ---------------------------------------------------------------------------

export interface CompliancePolicyConfig {
  /** Default expiring-soon warning window (days). */
  default_warning_days: number;
  /** Require a signed rental agreement before checkout. */
  require_signed_agreement_before_checkout: boolean;
  /** Require a valid customer driver license. */
  require_customer_dl: boolean;
  /** Require customer proof of insurance. */
  require_customer_insurance: boolean;
  /** Require vehicle registration. */
  require_vehicle_registration: boolean;
  /** Require vehicle insurance. */
  require_vehicle_insurance: boolean;
  /** Require vehicle inspection. */
  require_vehicle_inspection: boolean;
  /** Auto-create a review task when a compliance issue is detected. */
  auto_create_review_task: boolean;
  /** Default compliance owner staff id. */
  default_compliance_owner_id: string | null;
}

// ---------------------------------------------------------------------------
// Business Health configuration (Build #33 — persisted)
// ---------------------------------------------------------------------------

/** Business Health Score configuration persisted in company settings so it
 *  survives reloads and is shared across the Executive Dashboard + Settings.
 *  Mirrors HealthConfig from executiveTypes but lives here as the durable
 *  source of truth (the Settings UI previously held it in component-local
 *  state, which reset on every navigation). */
export interface BusinessHealthSettings {
  utilization_target_pct: number;
  idle_attention_threshold_days: number;
  weights: {
    collections: number;
    utilization: number;
    availability: number;
    compliance: number;
    operations: number;
  };
}

// ---------------------------------------------------------------------------
// Customer verification (tenant-configurable — Verification Optionalization)
// ---------------------------------------------------------------------------

/** A rental business may or may not use identity/driver verification. The
 *  tenant controls how (if at all) verification participates in customer
 *  readiness, navigation, KPIs, and checkout. */
export type CustomerVerificationMode = "off" | "basic" | "required";

export interface CustomerVerificationConfig {
  /** Off = hide verification workflows entirely; Basic = track verification
   *  + documents without blocking rentals; Required = use configured
   *  compliance requirements to gate readiness/checkout. */
  mode: CustomerVerificationMode;
}

// ---------------------------------------------------------------------------
// Customer Verification Services (V1) — optional paid third-party checks
// ---------------------------------------------------------------------------

/** Per-type paid verification services (identity / license / insurance / MVR /
 *  background). Each is Off / Staff Decides / Required. Never mandatory by
 *  default. Distinct from the document-collection policy + the legacy
 *  customer_verification mode. */
export interface VerificationServicesConfig {
  services: import("./verificationTypes").VerificationServicesPolicy;
  documents: import("./verificationTypes").VerificationDocumentPolicy;
}

// ---------------------------------------------------------------------------
// Company policies aggregate
// ---------------------------------------------------------------------------

export interface CompanyPolicies {
  id: string;
  tenant_id: string;
  business_hours: BusinessHours;
  rental_model: RentalModelPolicy;
  payment: PaymentPolicy;
  late_fee: LateFeePolicy;
  payment_methods: PaymentMethodConfig[];
  deposit: DepositPolicyConfig;
  extension: ExtensionPolicyConfig;
  returns: ReturnPolicy;
  renewal: RenewalPolicy;
  mileage: MileagePolicyConfig;
  fuel: FuelPolicyConfig;
  driver_requirements: DriverRequirementsPolicy;
  insurance: InsurancePolicyConfig;
  reservations: ReservationPolicy;
  cancellations: CancellationPolicyConfig;
  /** Build #26 — documents & compliance policy. Single source of truth for
   *  company compliance rules; structured document/requirement records remain
   *  the authoritative detailed state. */
  compliance: CompliancePolicyConfig;
  /** Build #33 — Business Health Score configuration (persisted). */
  business_health: BusinessHealthSettings;
  /** Customer Verification — tenant-configurable verification mode. */
  customer_verification: CustomerVerificationConfig;
  /** Customer Verification Services (V1) — optional paid third-party checks
   *  (identity / license / insurance / MVR / background), each Off / Staff
   *  Decides / Required, plus document-collection policy. Never mandatory by
   *  default. */
  verification_services: VerificationServicesConfig;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Setup presets
// ---------------------------------------------------------------------------

export type PresetKey = "weekly_private" | "daily_rental" | "long_term";

export interface CompanyPolicyPreset {
  key: PresetKey;
  label: string;
  description: string;
  patch: Partial<CompanyPolicies>;
}
