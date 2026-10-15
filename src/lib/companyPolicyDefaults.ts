// Connect Pro Fleet — Company policy defaults + presets (Build #23).

import type {
  CompanyPolicies,
  CompanyPolicyPreset,
  CompliancePolicyConfig,
  CustomerVerificationConfig,
  DepositPolicyConfig,
  DriverRequirementsPolicy,
  ExtensionPolicyConfig,
  FuelPolicyConfig,
  InsurancePolicyConfig,
  LateFeePolicy,
  MileagePolicyConfig,
  PaymentMethodConfig,
  PaymentMethodName,
  PaymentPolicy,
  PresetKey,
  RentalModelPolicy,
  ReservationPolicy,
  ReturnPolicy,
  CancellationPolicyConfig,
  BusinessHealthSettings,
  VerificationServicesConfig,
} from "./companyPolicyTypes";
export type { PresetKey } from "./companyPolicyTypes";
import { TENANT_ID } from "./store/ids";

export const ALL_PAYMENT_METHODS: PaymentMethodName[] = [
  "cash",
  "zelle",
  "cash_app",
  "apple_pay",
  "venmo",
  "ach",
  "bank_transfer",
  "check",
  "debit_card",
  "credit_card",
  "paypal",
  "other",
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodName, string> = {
  cash: "Cash",
  zelle: "Zelle",
  cash_app: "Cash App",
  apple_pay: "Apple Pay",
  venmo: "Venmo",
  ach: "ACH",
  bank_transfer: "Bank Transfer",
  check: "Check",
  debit_card: "Debit Card",
  credit_card: "Credit Card",
  paypal: "PayPal",
  other: "Other",
};

function closedDay() {
  return { open: false, open_time: null, close_time: null };
}
function openDay(open = "09:00", close = "18:00") {
  return { open: true, open_time: open, close_time: close };
}

export function defaultBusinessHours() {
  return {
    monday: openDay(),
    tuesday: openDay(),
    wednesday: openDay(),
    thursday: openDay(),
    friday: openDay(),
    saturday: openDay("10:00", "16:00"),
    sunday: closedDay(),
  };
}

export function defaultRentalModel(): RentalModelPolicy {
  return {
    enabled_cadences: ["weekly", "daily"],
    default_cadence: "weekly",
    minimum_duration_days: null,
    maximum_duration_days: null,
    allow_open_ended: true,
  };
}

export function defaultPaymentPolicy(): PaymentPolicy {
  return {
    default_billing_cadence: "weekly",
    payment_cutoff_time: "14:00",
    grace_period_minutes: 0,
  };
}

export function defaultLateFeePolicy(): LateFeePolicy {
  return {
    enabled: true,
    type: "fixed",
    fixed_amount: 50,
    percentage: 0,
    mode: "automatic",
    frequency: "once_per_period",
  };
}

export function defaultPaymentMethods(): PaymentMethodConfig[] {
  const enabled: PaymentMethodName[] = [
    "cash",
    "zelle",
    "cash_app",
    "credit_card",
    "debit_card",
    "ach",
  ];
  return ALL_PAYMENT_METHODS.map((m) => ({
    method: m,
    enabled: enabled.includes(m),
    instructions: null,
  }));
}

export function defaultDepositPolicyConfig(): DepositPolicyConfig {
  return {
    requirement: "required",
    default_amount: 300,
    refund_timing: "manual_review",
    refund_business_days: 3,
    allow_application_for: [
      "unpaid_balance",
      "late_fees",
      "damage",
      "fuel",
      "cleaning",
      "tolls_tickets",
      "other",
    ],
  };
}

export function defaultExtensionPolicy(): ExtensionPolicyConfig {
  return {
    mode: "approval_required",
    payment_requirement: "partial_balance",
    notice_hours: 24,
  };
}

export function defaultReturnPolicy(): ReturnPolicy {
  return {
    return_cutoff_time: "14:00",
    grace_period_minutes: 0,
    late_return_fee_type: "manual",
    late_return_fee_amount: 0,
    enforcement: "pending",
  };
}

export function defaultRenewalPolicy() {
  return { mode: "manual_extension" as const };
}

export function defaultMileagePolicy(): MileagePolicyConfig {
  return { type: "unlimited", allowance: 0, overage_rate: 0 };
}

export function defaultFuelPolicy(): FuelPolicyConfig {
  return { type: "same_level", charge_type: "manual", charge_amount: 0 };
}

export function defaultDriverRequirements(): DriverRequirementsPolicy {
  return {
    minimum_age: 21,
    license_required: true,
    license_verification_required: true,
    license_must_exceed_rental_end: true,
    allow_manual_override: false,
    additional_drivers: "approval_required",
  };
}

export function defaultInsurancePolicy(): InsurancePolicyConfig {
  return {
    type: "company_included",
    own_insurance_discount: false,
    own_insurance_discount_amount: 0,
    verification_required: true,
  };
}

export function defaultReservationPolicy(): ReservationPolicy {
  return {
    mode: "request_approval",
    min_lead_time_hours: null,
    max_advance_booking_days: null,
    hold_hours: 24,
  };
}

export function defaultCancellationPolicy(): CancellationPolicyConfig {
  return { type: "free", fee_amount: 0, free_cutoff_hours: 24 };
}

/** Build #26 — default documents & compliance policy. */
export function defaultCompliancePolicy(): CompliancePolicyConfig {
  return {
    default_warning_days: 30,
    require_signed_agreement_before_checkout: true,
    require_customer_dl: true,
    require_customer_insurance: false,
    require_vehicle_registration: true,
    require_vehicle_insurance: true,
    require_vehicle_inspection: false,
    auto_create_review_task: false,
    default_compliance_owner_id: null,
  };
}

/** Build #33 — default Business Health settings (mirrors DEFAULT_HEALTH_CONFIG
 *  from executiveTypes so the persisted config matches the v1 formula). */
export function defaultBusinessHealthSettings(): BusinessHealthSettings {
  return {
    utilization_target_pct: 80,
    idle_attention_threshold_days: 3,
    weights: {
      collections: 30,
      utilization: 25,
      availability: 15,
      compliance: 15,
      operations: 15,
    },
  };
}

/** Customer Verification default — Basic. Existing tenants that did not
 *  configure verification remain on the prior behaviour-neutral default; the
 *  change is presentation/behaviour only (no records are deleted). New tenants
 *  get Basic by default so verification is available but never silently blocks. */
export function defaultCustomerVerification(): CustomerVerificationConfig {
  return { mode: "basic" };
}

/** V1 Customer Verification Services — all paid services Off by default.
 *  Document collection defaults to optional (DL optional, insurance not
 *  required). Nothing is mandatory by default. Auto-run is manual-only. */
export function defaultVerificationServices(): VerificationServicesConfig {
  return {
    services: {
      modes: {
        identity: "off",
        drivers_license: "off",
        insurance: "off",
        mvr: "off",
        background: "off",
      },
      auto_run: "manual_only",
    },
    documents: {
      drivers_license: "optional",
      insurance: "not_required",
    },
  };
}

export function defaultCompanyPolicies(): CompanyPolicies {
  const now = new Date().toISOString();
  return {
    id: "pol_default",
    tenant_id: TENANT_ID,
    business_hours: defaultBusinessHours(),
    rental_model: defaultRentalModel(),
    payment: defaultPaymentPolicy(),
    late_fee: defaultLateFeePolicy(),
    payment_methods: defaultPaymentMethods(),
    deposit: defaultDepositPolicyConfig(),
    extension: defaultExtensionPolicy(),
    returns: defaultReturnPolicy(),
    renewal: defaultRenewalPolicy(),
    mileage: defaultMileagePolicy(),
    fuel: defaultFuelPolicy(),
    driver_requirements: defaultDriverRequirements(),
    insurance: defaultInsurancePolicy(),
    reservations: defaultReservationPolicy(),
    cancellations: defaultCancellationPolicy(),
    compliance: defaultCompliancePolicy(),
    business_health: defaultBusinessHealthSettings(),
    customer_verification: defaultCustomerVerification(),
    verification_services: defaultVerificationServices(),
    created_at: now,
    updated_at: now,
  };
}

export const COMPANY_POLICY_PRESETS: CompanyPolicyPreset[] = [
  {
    key: "weekly_private",
    label: "Weekly Private Rental",
    description:
      "Weekly billing, 2 PM cutoff, $300 deposit, unlimited mileage, auto late fee configurable.",
    patch: {
      rental_model: {
        enabled_cadences: ["weekly"],
        default_cadence: "weekly",
        minimum_duration_days: 7,
        maximum_duration_days: null,
        allow_open_ended: true,
      },
      payment: {
        default_billing_cadence: "weekly",
        payment_cutoff_time: "14:00",
        grace_period_minutes: 0,
      },
      deposit: { ...defaultDepositPolicyConfig(), default_amount: 300 },
      mileage: defaultMileagePolicy(),
    },
  },
  {
    key: "daily_rental",
    label: "Daily Rental",
    description:
      "Daily rate, daily/multi-day billing, standard deposit, scheduled return.",
    patch: {
      rental_model: {
        enabled_cadences: ["daily", "multi_day"],
        default_cadence: "daily",
        minimum_duration_days: 1,
        maximum_duration_days: null,
        allow_open_ended: false,
      },
      payment: {
        default_billing_cadence: "daily",
        payment_cutoff_time: "14:00",
        grace_period_minutes: 0,
      },
      deposit: { ...defaultDepositPolicyConfig(), default_amount: 300 },
    },
  },
  {
    key: "long_term",
    label: "Long-Term Rental",
    description:
      "Weekly/monthly billing, open-ended capability, recurring BillingPeriods.",
    patch: {
      rental_model: {
        enabled_cadences: ["weekly", "biweekly", "monthly", "long_term"],
        default_cadence: "monthly",
        minimum_duration_days: 30,
        maximum_duration_days: null,
        allow_open_ended: true,
      },
      payment: {
        default_billing_cadence: "monthly",
        payment_cutoff_time: "14:00",
        grace_period_minutes: 1440,
      },
    },
  },
];

export function getPreset(key: PresetKey): CompanyPolicyPreset | undefined {
  return COMPANY_POLICY_PRESETS.find((p) => p.key === key);
}
