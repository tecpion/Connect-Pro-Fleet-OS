// Connect Pro Fleet — typed Database row types: auth/tenancy (Build #22).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string | null;
  timezone: string;
  currency: string;
  status: "active" | "suspended" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string; // = auth.users.id
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  phone: string | null;
  avatar_path: string | null;
  status: "active" | "suspended" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  organization_id: string | null;
  name: string;
  code: string;
  is_system: boolean;
  created_at: string;
}

export interface PermissionRow {
  id: string;
  code: string;
  label: string;
  module: string;
}

export interface RolePermissionRow {
  role_id: string;
  permission_code: string;
}

export interface OrganizationMembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string | null;
  status: "active" | "invited" | "suspended";
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role_id: string | null;
  token_hash: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  organization_id: string;
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
  customer_status: string;
  customer_source: string;
  notes: string;
  drivers_license_number: string | null;
  drivers_license_state: string | null;
  drivers_license_expiry: string | null;
  drivers_license_front_path: string | null;
  drivers_license_back_path: string | null;
  insurance_company: string | null;
  insurance_policy_number: string | null;
  insurance_expiry: string | null;
  insurance_document_path: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleRow {
  id: string;
  organization_id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  status: string;
  location: string;
  vehicle_type: string;
  vehicle_class_id: string | null;
  pricing_override: boolean | null;
  min_rental_days_override: number | null;
  deposit_override: boolean | null;
  daily_rate: number;
  weekly_rate: number;
  deposit_amount: number;
  purchase_date: string;
  purchase_price: number;
  current_mileage: number;
  insurance_policy_number: string;
  insurance_expiry: string;
  registration_expiry: string;
  ownership_type: string | null;
  owner_entity_id: string | null;
  owner_display_name: string | null;
  ownership_notes: string | null;
  ownership_effective_date: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleClassRow {
  id: string;
  organization_id: string;
  name: string;
  vehicle_type: string;
  daily_rate: number;
  weekly_rate: number;
  deposit_amount: number;
  minimum_rental_duration: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocationRow {
  id: string;
  organization_id: string;
  name: string;
  address: string;
  phone: string;
  timezone: string;
  is_default: boolean;
}

export interface ReservationRow {
  id: string;
  organization_id: string;
  vehicle_id: string;
  customer_id: string | null;
  renter_name: string;
  renter_email: string;
  renter_phone: string;
  start_date: string;
  end_date: string;
  status: string;
  source: string;
  ghl_opportunity_id: string | null;
  total_price: number;
  deposit_amount: number;
  deposit_status: string;
  amount_paid: number;
  converted_to_rental_id: string | null;
  pricing_snapshot: Json | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string;
}

export interface RentalRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  customer_id: string;
  vehicle_id: string;
  agreement_number: string;
  status: string;
  checkout_date: string | null;
  checkout_time: string | null;
  scheduled_return_date: string;
  scheduled_return_time: string | null;
  actual_return_date: string | null;
  actual_return_time: string | null;
  rate_type: string;
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
  weekly_payment_day: string | null;
  next_payment_due: string | null;
  payment_cutoff_time: string | null;
  grace_period: number;
  late_fee: number;
  late_fee_applied: boolean;
  weeks_rented: number;
  billing_config: Json | null;
  pricing_snapshot: Json | null;
  rental_origin: string | null;
  migration_cutover_at: string | null;
  imported_legacy_rental: boolean | null;
  external_agreement_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalVehicleExchangeRow {
  id: string;
  organization_id: string;
  rental_id: string;
  old_vehicle_id: string;
  new_vehicle_id: string;
  effective_date: string;
  old_mileage_in: number;
  new_mileage_out: number;
  reason: string;
  rate_change: Json | null;
  created_at: string;
}

export interface BillingPeriodRow {
  id: string;
  organization_id: string;
  rental_id: string;
  period_start: string;
  period_end: string;
  due_at: string;
  due_time: string | null;
  amount: number;
  base_amount: number;
  fee_amount: number;
  tax_amount: number;
  status: string;
  source: string;
  external_invoice_id: string | null;
  metadata: Json | null;
  created_at: string;
}

// ── Phase 2: rental lifecycle rows ───────────────────────────────

export interface BookingRequestRow {
  id: string;
  organization_id: string;
  location_id: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  requested_vehicle_id: string | null;
  requested_vehicle_class_id: string | null;
  requested_start_date: string | null;
  requested_end_date: string | null;
  rental_duration_type: string;
  notes: string | null;
  driver_license_document_reference: string | null;
  driver_license_status: string;
  verification_status: string;
  source: string;
  crm_contact_id: string | null;
  crm_opportunity_id: string | null;
  crm_pipeline_stage: string | null;
  external_request_id: string | null;
  lead_source: string | null;
  submitted_at: string;
  form_answers: Json | null;
  status: string;
  assigned_to: string | null;
  customer_match: Json | null;
  converted_reservation_id: string | null;
  declined: Json | null;
  waitlist: Json | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingOutboundEventRow {
  id: string;
  organization_id: string;
  event_type: string;
  booking_request_id: string | null;
  crm_opportunity_id: string | null;
  crm_contact_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  payload: Json | null;
  delivery_state: string;
  created_at: string;
}

export interface InspectionRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  vehicle_id: string;
  inspection_type: string;
  photos: Json;
  odometer_reading: number;
  fuel_level: number;
  damage_notes: string;
  damage_detected: boolean;
  damage_ai_confidence: number;
  damage_ai_flagged_regions: Json;
  inspector_signature_path: string | null;
  timestamp: string;
}

export interface AgreementTemplateRow {
  id: string;
  organization_id: string;
  name: string;
  agreement_type: string;
  description: string;
  file_path: string | null;
  file_name: string | null;
  version: number;
  effective_date: string | null;
  status: string;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MasterAgreementRow {
  id: string;
  organization_id: string;
  driver_id: string | null;
  signature_path: string;
  signed_at: string;
  terms_version: string;
  expires_at: string | null;
  status: string;
  rate_at_signing: number;
  vehicle_id_at_signing: string | null;
}

export interface AgreementInstanceRow {
  id: string;
  organization_id: string;
  master_agreement_id: string | null;
  reservation_id: string | null;
  period_start: string | null;
  period_end: string | null;
  vehicle_id: string | null;
  mileage_start: number;
  mileage_end: number | null;
  rate: number;
  pdf_path: string | null;
  generated_at: string;
}
