// Connect Pro Fleet — Customer Portal domain types (Build #32).
//
// The Customer Portal is a READ-HEAVY customer projection + controlled request
// layer. Fleet remains authoritative: the portal NEVER recomputes balance,
// lateness, deposit, or rental status. It projects customer-safe view models
// from the existing billing selectors, ledger, deposit ledger, compliance
// documents, and rental lifecycle. Requests (extension/exchange/return) are
// records that staff review — submitting one NEVER mutates the rental.
//
// Cross-tenant safety: every portal selector requires a PortalSession (tenant
// + customer). A customer can never see another customer's data, internal
// staff notes, profitability, acquisition cost, investor/JV economics, banking
// data, or private support comments.

import type { RentalPolicySnapshot } from "./companyPolicyTypes";
import type { DepositStatus } from "./depositTypes";

// ---------------------------------------------------------------------------
// Portal session (development auth boundary)
// ---------------------------------------------------------------------------

export type PortalVerificationMode =
  "development" | "magic_link" | "sms_otp" | "email_otp";

/** A simulated authenticated customer context. Production auth (Build #22)
 *  maps an authenticated identity securely to a customer + tenant. This dev
 *  session NEVER stores a password and is explicitly labeled development_mode. */
export interface PortalSession {
  customer_id: string;
  tenant_id: string;
  active: boolean;
  authenticated_at: string;
  expires_at: string | null;
  verification_mode: PortalVerificationMode;
  development_mode: boolean;
}

// ---------------------------------------------------------------------------
// Customer-safe projection models
// ---------------------------------------------------------------------------

/** Customer-safe vehicle view. Excludes acquisition cost, profitability,
 *  investor/JV info, internal notes, and maintenance cost. */
export interface PortalVehicleView {
  id: string;
  year: number;
  make: string;
  model: string;
  license_plate_masked: string | null;
  vehicle_type: string;
  current_mileage: number | null;
  photo_url: string | null;
  location_name: string | null;
}

/** Customer-safe rental view. */
export interface PortalRentalView {
  id: string;
  agreement_number: string;
  status: string;
  status_label: string;
  vehicle: PortalVehicleView | null;
  checkout_date: string | null;
  checkout_time: string | null;
  scheduled_return_date: string | null;
  scheduled_return_time: string | null;
  is_open_ended: boolean;
  rate_type: string;
  rate_amount: number;
  billing_cadence: string | null;
  pickup_location_name: string | null;
  return_location_name: string | null;
  policy_snapshot: RentalPolicySnapshot | null;
}

/** A single customer-facing payment-history entry. Masks processor refs and
 *  card/bank account numbers; never exposes raw ledger transaction IDs. */
export interface PortalPaymentHistoryEntry {
  id: string;
  date: string;
  amount: number;
  rental_agreement_number: string | null;
  method_label: string;
  status: string;
  receipt_available: boolean;
}

/** A customer-facing billing schedule entry. */
export interface PortalBillingScheduleEntry {
  period_label: string;
  due_date: string;
  due_time: string | null;
  amount: number;
  status: string;
  status_label: string;
}

/** Customer-facing charge breakdown line (posted/authoritative only). */
export interface PortalChargeLine {
  description: string;
  category: string;
  amount: number;
  date: string | null;
}

/** Customer-facing billing projection. Balance/overdue come from the
 *  authoritative billing selectors — never recomputed. */
export interface PortalBillingView {
  current_balance: number;
  is_paid_up: boolean;
  next_payment_due_date: string | null;
  next_payment_due_time: string | null;
  next_payment_amount: number | null;
  is_overdue: boolean;
  overdue_amount: number;
  overdue_original_due_date: string | null;
  posted_late_fee: number;
  payment_history: PortalPaymentHistoryEntry[];
  billing_schedule: PortalBillingScheduleEntry[];
  charge_breakdown: PortalChargeLine[];
  total_charges: number;
  total_payments: number;
  total_credits: number;
  arrangement: {
    status: string | null;
    status_label: string | null;
    next_payment_due: string | null;
    next_payment_amount: number | null;
    is_broken: boolean;
  } | null;
  payment_processing_available: boolean;
}

/** Customer-facing deposit view. Deposits are NOT revenue. */
export interface PortalDepositView {
  id: string | null;
  required_amount: number;
  held_amount: number;
  applied_amount: number;
  refunded_amount: number;
  forfeited_amount: number;
  status: DepositStatus | "not_required" | "not_paid";
  status_label: string;
  history: PortalDepositHistoryEntry[];
  application_reason: string | null;
}

export interface PortalDepositHistoryEntry {
  event_type: string;
  label: string;
  amount: number;
  at: string;
}

/** Customer-facing document view. Sensitive numbers are masked. */
export interface PortalDocumentView {
  id: string;
  document_type: string;
  document_type_label: string;
  status: string;
  status_label: string;
  document_number_masked: string | null;
  issuer: string | null;
  expiration_date: string | null;
  file_reference: string | null;
  rejected_reason: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
}

/** Customer-facing agreement view. */
export interface PortalAgreementView {
  id: string;
  agreement_type: string;
  agreement_type_label: string;
  status: string;
  status_label: string;
  signed_date: string | null;
  version: string | null;
  file_reference: string | null;
  requires_signature: boolean;
}

/** Customer-facing policy summary (from frozen rental snapshot when active). */
export interface PortalPolicyView {
  source: "rental_snapshot" | "company_current" | "none";
  payment_cutoff_time: string | null;
  grace_period_minutes: number | null;
  late_fee_summary: string | null;
  deposit_summary: string | null;
  mileage_summary: string | null;
  fuel_summary: string | null;
  return_summary: string | null;
  extension_summary: string | null;
  billing_cadence: string | null;
}

// ---------------------------------------------------------------------------
// Customer portal requests
// ---------------------------------------------------------------------------

export type PortalRequestType =
  | "extension"
  | "exchange"
  | "return"
  | "document_help"
  | "billing_question"
  | "other";

export type PortalRequestStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "declined"
  | "completed"
  | "cancelled";

export type ExchangeReason =
  | "vehicle_issue"
  | "maintenance_concern"
  | "comfort_preference"
  | "accident_damage"
  | "other";

export interface PortalRequestTimelineEntry {
  id: string;
  at: string;
  event_type: string;
  label: string;
  actor: "customer" | "staff" | "system";
  actor_name: string | null;
}

export interface CustomerPortalRequest {
  id: string;
  request_number: string;
  tenant_id: string;
  customer_id: string;
  rental_id: string | null;
  request_type: PortalRequestType;
  status: PortalRequestStatus;
  subject: string;
  customer_note: string | null;
  staff_response: string | null;
  // Extension-specific
  current_scheduled_end: string | null;
  requested_new_end: string | null;
  estimated_extension_charge: number | null;
  // Exchange-specific
  exchange_reason: ExchangeReason | null;
  exchange_issue_description: string | null;
  exchange_preferred_timing: string | null;
  // Return-specific
  requested_return_date: string | null;
  requested_return_location: string | null;
  // Assignment
  assigned_staff_id: string | null;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_at: string | null;
  timeline: PortalRequestTimelineEntry[];
}

// ---------------------------------------------------------------------------
// Portal notices (derived)
// ---------------------------------------------------------------------------

export type PortalNoticePriority = "important" | "action_needed" | "update";

export interface PortalNotice {
  id: string;
  priority: PortalNoticePriority;
  title: string;
  detail: string | null;
  deep_link: string | null;
}

// ---------------------------------------------------------------------------
// Company contact
// ---------------------------------------------------------------------------

export interface PortalCompanyContact {
  name: string;
  phone: string | null;
  email: string | null;
  business_hours_summary: string | null;
  address: string | null;
  after_hours_contact: string | null;
}

// ---------------------------------------------------------------------------
// Customer profile
// ---------------------------------------------------------------------------

export interface PortalCustomerProfile {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

// ---------------------------------------------------------------------------
// Customer-safe timeline event
// ---------------------------------------------------------------------------

export interface PortalTimelineEvent {
  id: string;
  occurred_at: string;
  title: string;
  description: string | null;
  category: string;
  deep_link: string | null;
}

// ---------------------------------------------------------------------------
// Composed portal view
// ---------------------------------------------------------------------------

export interface CustomerPortalView {
  customer: PortalCustomerProfile;
  company_contact: PortalCompanyContact;
  active_rentals: PortalRentalView[];
  past_rentals: PortalRentalView[];
  selected_rental: PortalRentalView | null;
  billing: PortalBillingView;
  deposit: PortalDepositView;
  documents: PortalDocumentView[];
  agreements: PortalAgreementView[];
  requests: CustomerPortalRequest[];
  notices: PortalNotice[];
  timeline: PortalTimelineEvent[];
  policies: PortalPolicyView;
  has_no_active_rental: boolean;
  as_of: string;
}

// ---------------------------------------------------------------------------
// Status label mappings (customer-friendly plain language)
// ---------------------------------------------------------------------------

export const PORTAL_RENTAL_STATUS_LABELS: Record<string, string> = {
  draft: "Preparing",
  ready_for_checkout: "Ready for pickup",
  active: "Active",
  payment_due: "Payment due",
  late: "Late",
  overdue: "Past due",
  return_pending: "Return pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PORTAL_REQUEST_STATUS_LABELS: Record<PortalRequestStatus, string> =
  {
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    declined: "Declined",
    completed: "Completed",
    cancelled: "Cancelled",
  };

export const PORTAL_REQUEST_TYPE_LABELS: Record<PortalRequestType, string> = {
  extension: "Extension Request",
  exchange: "Vehicle Exchange Request",
  return: "Return Request",
  document_help: "Document Help",
  billing_question: "Billing Question",
  other: "Other Request",
};

export const PORTAL_EXCHANGE_REASON_LABELS: Record<ExchangeReason, string> = {
  vehicle_issue: "Vehicle issue",
  maintenance_concern: "Maintenance concern",
  comfort_preference: "Comfort / preference",
  accident_damage: "Accident / damage",
  other: "Other",
};

export const PORTAL_DOCUMENT_STATUS_LABELS: Record<string, string> = {
  missing: "Needed",
  uploaded: "Submitted",
  pending_review: "Under Review",
  verified: "Approved",
  rejected: "Rejected",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  archived: "Archived",
  not_required: "Not Required",
};

export const PORTAL_DEPOSIT_STATUS_LABELS: Record<string, string> = {
  required: "Not Paid",
  pending: "Pending",
  collected: "Held",
  held: "Held",
  partially_applied: "Partially Applied",
  fully_applied: "Applied",
  refund_pending: "Refund Pending",
  partially_refunded: "Partially Refunded",
  refunded: "Refunded",
  forfeited: "Forfeited",
  cancelled: "Cancelled",
  not_required: "Not Required",
  not_paid: "Not Paid",
};
