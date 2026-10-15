// Connect Pro Fleet — domain types. Mirrors the Supabase schema so the mock
// store can be swapped for a real supabase-js client without touching components.

import type { VehicleFile } from "./vehicleFileTypes";
export type { VehicleFile };

export type VehicleStatus =
  "available" | "rented" | "maintenance" | "out_of_service";

export type ReservationStatus =
  | "pending_verification"
  | "manual_review"
  | "pending_insurance_addon"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled"
  | "blocked_license";

export type ReservationSource =
  "ghl_webhook" | "manual" | "marketplace" | "website" | "referral" | "api";
export type DepositStatus = "held" | "released" | "forfeited";
export type InspectionType = "checkout" | "checkin";
export type AddonType =
  | "extra_driver"
  | "delivery"
  | "prepaid_fuel"
  | "child_seat"
  | "gps_unit"
  | "insurance_waiver";
export type StaffRole =
  | "owner"
  | "admin"
  | "manager"
  | "customer_service"
  | "fleet_manager"
  | "maintenance"
  | "accounting"
  | "staff"
  | "agent"
  | "custom";

// Display roles surfaced in the Users & Permissions UI. `custom` covers any
// company-created role (the role id is stored on the Staff record's `role`
// field, which may reference a Role.id for custom roles).
export type DisplayRole = "owner" | "manager" | "user" | "partner" | "custom";

export type UserStatus = "active" | "invited" | "inactive" | "suspended";

export type ThemePreference = "light" | "dark" | "system";

export type AssignmentType = "checkout" | "checkin" | "delivery";
export type DriverVerificationStatus = "pending" | "verified" | "failed";
export type AgreementStatus = "active" | "expired" | "revoked";

export type VehicleType = "car" | "suv" | "van" | "truck";

// ---------------------------------------------------------------------------
// Phase 2 — Customer management
// ---------------------------------------------------------------------------

export type CustomerStatus =
  | "good_standing"
  | "active_renter"
  | "previous_renter"
  | "watchlist"
  | "do_not_rent"
  | "vip"
  | "pending_verification";

export type CustomerSource =
  "connect_pro" | "website" | "marketplace" | "staff" | "referral" | "api";

export interface Customer {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  customer_status: CustomerStatus;
  customer_source: CustomerSource;
  notes: string;
  drivers_license_number: string | null;
  drivers_license_state: string | null;
  drivers_license_expiry: string | null;
  drivers_license_front_url: string | null;
  drivers_license_back_url: string | null;
  insurance_company: string | null;
  insurance_policy_number: string | null;
  insurance_expiry: string | null;
  insurance_document_url: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 2 — Rental agreements
// ---------------------------------------------------------------------------

export type RentalStatus =
  | "draft"
  | "ready_for_checkout"
  | "active"
  | "payment_due"
  | "late"
  | "overdue"
  | "return_pending"
  | "completed"
  | "cancelled";

export type RateType = "daily" | "weekly" | "custom";

export interface RentalAgreement {
  id: string;
  tenant_id: string;
  reservation_id: string | null;
  customer_id: string;
  vehicle_id: string;
  agreement_number: string;
  status: RentalStatus;
  checkout_date: string | null;
  checkout_time: string | null;
  scheduled_return_date: string;
  scheduled_return_time: string | null;
  actual_return_date: string | null;
  actual_return_time: string | null;
  rate_type: RateType;
  rate_amount: number;
  subtotal: number;
  tax: number;
  fees: number;
  discount: number;
  deposit_amount: number;
  amount_paid: number;
  balance_due: number;
  mileage_out: number | null;
  mileage_in: number | null;
  fuel_out: number | null;
  fuel_in: number | null;
  // Weekly rental engine (preserved for backward compatibility; the universal
  // billing engine in billing.ts now drives recurring billing, with these
  // fields kept as transitional/derived values for existing screens).
  weekly_payment_day: string | null; // e.g. "Monday"
  next_payment_due: string | null; // ISO date
  payment_cutoff_time: string | null; // "17:00"
  grace_period: number; // hours
  late_fee: number;
  late_fee_applied: boolean;
  weeks_rented: number;
  billing_config?: import("./billingTypes").RentalBillingConfig | null;
  // Build #23 — frozen company policy snapshot at checkout so later company
  // policy changes never retroactively alter an active or historical rental.
  policy_snapshot?: import("./companyPolicyTypes").RentalPolicySnapshot | null;
  // Build #5 — frozen pricing snapshot at checkout so later Settings/Class
  // changes never alter active or historical rentals.
  pricing_snapshot?: ReservationPricingSnapshot | null;
  // Build #19 — marks rentals imported from a previous system so they never
  // pretend to have been created through Fleet checkout. Native rentals
  // default to "native".
  rental_origin?: import("./migrationTypes").RentalOrigin;
  // Build #19 — migration cutover metadata for imported legacy rentals. The
  // billing engine anchors future periods from `next_payment_due`, not the
  // original rental start date.
  migration_cutover_at?: string | null;
  imported_legacy_rental?: boolean;
  external_agreement_id?: string | null;
  // Build #52 — Rental Risk & Defense Record. Agreement renewal chain: a
  // renewal creates a NEW RentalAgreement linked to the prior. The prior is
  // NEVER overwritten. These fields preserve the chain.
  prior_agreement_id?: string | null;
  renewed_from_agreement_id?: string | null;
  // Informational only — NEVER used to infer legal consequences from term
  // length (≤30 days vs >30 days).
  agreement_term_days?: number | null;
  // Build #52 — frozen entity-relationship snapshot at checkout (titled owner,
  // operating entity, insurance entity). Current vehicle ownership may later
  // change without altering this snapshot.
  entity_snapshot?: import("./defenseTypes").EntityRelationshipSnapshot | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type RentalEventType =
  | "created"
  | "checkout"
  | "signed"
  | "payment"
  | "extended"
  | "exchanged"
  | "late_fee"
  | "maintenance"
  | "contacted"
  | "return_inspection"
  | "closed"
  | "gate_override";

export interface RentalEvent {
  id: string;
  rental_id: string;
  type: RentalEventType;
  label: string;
  at: string;
  tone: "available" | "maintenance" | "out" | "rented" | "neutral";
  staff_id: string | null;
}

// ---------------------------------------------------------------------------
// Phase 2 — Locations (multi-location support)
// ---------------------------------------------------------------------------

export interface Location {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  is_default?: boolean;
}

// Vehicle file (existing) — see vehicleFileTypes.ts; re-exported at top.

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  status: VehicleStatus;
  location: string; // yard / branch where the vehicle is based
  vehicle_type: VehicleType;
  // Vehicle Class reference (Settings > Vehicle Classes & Pricing). When set,
  // the class's rates/deposit/minimum seed the vehicle's values but can be
  // overridden per vehicle.
  vehicle_class_id?: string | null;
  // True when staff has set custom pricing on this vehicle (overrides class).
  pricing_override?: boolean;
  // Optional per-vehicle minimum rental override (days). null = inherit class.
  min_rental_days_override?: number | null;
  // True when staff has set a custom deposit on this vehicle.
  deposit_override?: boolean;
  // Pricing — daily and/or weekly rental rate (effective rate; sourced from
  // the class when pricing_override is false, or custom when true).
  daily_rate: number;
  weekly_rate: number;
  // Security deposit collected at handoff (0 if not applicable)
  deposit_amount: number;
  // Photos of the vehicle (multiple, any angle)
  images: VehicleFile[];
  // Supporting documents — registration, insurance, title, etc.
  documents: VehicleFile[];
  purchase_date: string;
  purchase_price: number;
  current_mileage: number;
  insurance_policy_number: string;
  insurance_expiry: string;
  registration_expiry: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  // Build #6 — vehicle ownership (asset fact). WHO owns the vehicle, separate
  // from HOW they're compensated (that lives on the InvestorVehicle pairing).
  // Optional so existing records migrate cleanly (defaulting to company_owned).
  ownership_type?: import("./ownershipTypes").VehicleOwnershipType | null;
  owner_entity_id?: string | null; // -> Investor.id when external/partner
  owner_display_name?: string | null; // snapshot/fallback label
  ownership_notes?: string | null;
  ownership_effective_date?: string | null;
  // Build #52 — distinct entity relationships (titled owner lives above; these
  // are separate operating / insurance / acquisition entities). Reuses the
  // existing ownership architecture; does not assume entities are legally
  // interchangeable.
  operating_entity_id?: string | null;
  operating_entity_display_name?: string | null;
  insurance_entity_id?: string | null;
  insurance_entity_display_name?: string | null;
  acquisition_entity_id?: string | null;
  acquisition_entity_display_name?: string | null;
}

// A single component of a recommended rate (e.g. "1 week @ $350" or "3 days @ $50").
export interface RateComponent {
  type: "weekly" | "daily";
  quantity: number;
  rate: number;
  total: number;
}

// Pricing snapshot captured at reservation time so historical reservations
// never change when a Vehicle Class default is edited later. The reservation's
// total_price remains the FINAL agreed base rental amount (recommended unless
// overridden). recommended_total + override metadata preserve the audit trail.
export interface ReservationPricingSnapshot {
  vehicle_class_id: string | null;
  vehicle_class_name: string | null;
  daily_rate: number;
  weekly_rate: number;
  minimum_rental_duration: number;
  duration_days: number;
  recommended_total: number;
  recommended_rate_type: "daily" | "weekly" | "mixed" | "none";
  components: RateComponent[];
  // Override metadata — present only when staff set a custom price.
  override_amount?: number | null; // difference between recommended and final
  override_reason?: string | null;
  override_by?: string | null; // staff id
  override_at?: string | null; // ISO timestamp
}

export interface Reservation {
  id: string;
  vehicle_id: string;
  // Optional link to a Customer record (Phase 2). Renter fields below remain
  // the source of truth for legacy/inbound reservations without a customer.
  customer_id?: string | null;
  renter_name: string;
  renter_email: string;
  renter_phone: string;
  start_date: string;
  end_date: string;
  status: ReservationStatus;
  source: ReservationSource;
  ghl_opportunity_id: string | null;
  total_price: number;
  deposit_amount: number;
  deposit_status: DepositStatus;
  // Amount the customer has paid so far (deposits + rental + add-ons collected).
  // Distinct from total_price, which is the full amount owed.
  amount_paid: number;
  // When converted to a rental agreement, the id of that agreement.
  converted_to_rental_id?: string | null;
  // Pricing snapshot captured at booking (Build #2). Preserves the rates,
  // recommendation, and any override so historical pricing is stable even if
  // the Vehicle Class defaults change later.
  pricing_snapshot?: ReservationPricingSnapshot | null;
  // Audit trail — when the record was created and by whom.
  created_at: string;
  created_by: string | null; // staff id (null for inbound webhooks/marketplace)
  created_by_name: string; // resolved name + role label, e.g. "Ava Reyes · Owner"
  tenant_id: string;
}

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  service_type: string;
  scheduled_date: string;
  completed_date: string | null;
  cost: number;
  mileage_at_service: number;
  next_service_mileage_estimate: number;
  // Optional date-based next-service trigger (estimated). Used alongside or
  // instead of next_service_mileage_estimate — whichever comes first.
  next_service_date_estimate?: string | null;
  notes: string;
  tenant_id: string;
}

// Inspection / Driver / Addon types extracted into inspectionTypes.ts to keep
// this file focused. Re-exported here for import compatibility.
export type { DamageFlag, Inspection, Driver, Addon } from "./inspectionTypes";

export interface Staff {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  permission_overrides: Record<string, unknown> | null;
  created_at: string;
  // Phase 2 — Users & Permissions expansion
  phone?: string | null;
  display_role?: DisplayRole;
  role_id?: string | null; // references a Role.id for custom roles
  location_ids?: string[]; // empty = all locations
  status?: UserStatus;
  last_activity_at?: string | null;
  theme?: ThemePreference; // per-user appearance preference
  // Per-user brand accent color (hex). When set, the ThemeProvider remaps the
  // primary/ring/nav-active CSS tokens so the whole workspace adopts it.
  brand_color?: string | null;
  // Build #24 — structured operational responsibilities (work routing only).
  // Responsibilities NEVER grant permissions; access is controlled solely by
  // the staff member's role + permission_overrides. Responsibilities only help
  // organize and suggest work assignments.
  responsibilities?: string[] | null;
}

export interface StaffAssignment {
  id: string;
  reservation_id: string;
  staff_id: string;
  assignment_type: AssignmentType;
  assigned_at: string;
  tenant_id: string;
}

export interface MasterAgreement {
  id: string;
  driver_id: string;
  tenant_id: string;
  signature_url: string;
  signed_at: string;
  terms_version: string;
  expires_at: string;
  status: AgreementStatus;
  rate_at_signing: number;
  vehicle_id_at_signing: string;
}

export interface AgreementInstance {
  id: string;
  master_agreement_id: string;
  reservation_id: string;
  period_start: string;
  period_end: string;
  vehicle_id: string;
  mileage_start: number;
  mileage_end: number | null;
  rate: number;
  pdf_url: string;
  generated_at: string;
  tenant_id: string;
}

export interface Tenant {
  id: string;
  business_name: string;
  ghl_location_id: string;
  api_key_hash: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase 2 — Financial transaction ledger (source of truth for rental finances)
// ---------------------------------------------------------------------------
// Extracted into chargeTypes.ts and re-exported here for import compatibility.
// Adds incident_charge and violation_charge so incidents and traffic violations
// bill through the shared ledger rather than a separate system.
export type {
  TransactionDirection,
  ChargeType,
  PaymentType,
  AdjustmentType,
  RefundType,
  TransactionType,
  PaymentMethod,
  TransactionStatus,
  FinancialTransaction,
} from "./chargeTypes";

// Invoices & Receipts (invoiceTypes.ts) + Universal billing (billingTypes.ts).
// Re-exported here for import compatibility. Ledger stays source of truth;
// invoices/receipts/billing-periods are presentation/schedule layers on top.
export type {
  InvoiceStatus,
  InvoiceLineItem,
  Invoice,
  ReceiptStatus,
  Receipt,
} from "./invoiceTypes";
export type {
  BillingFrequency,
  BillingPeriodStatus,
  BillingPeriodSource,
  BillingPeriod,
  CustomScheduleInstallment,
  RentalBillingConfig,
} from "./billingTypes";
export {
  BILLING_FREQUENCY_LABELS,
  BILLING_FREQUENCY_SHORT,
} from "./billingTypes";

// ---------------------------------------------------------------------------
// Settings — extracted into settingsTypes.ts. Re-exported here for import
// compatibility.
// ---------------------------------------------------------------------------
export type {
  CompanyInfo,
  PermissionDef,
  Role,
  AddonPricingType,
  AddonCatalogItem,
  AddonCategory,
  VehicleClass,
  PricingPlan,
  DepositPolicy,
  AgreementTemplateStatus,
  AgreementTemplate,
  AgreementRules,
  SettingsAuditEntry,
} from "./settingsTypes";
