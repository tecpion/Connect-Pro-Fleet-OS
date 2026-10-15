// Connect Pro Fleet — Tolls / Tickets / Violations domain types (Build #25).
//
// A Violation is OPERATIONAL EVIDENCE of a vehicle-based violation (toll,
// parking ticket, camera ticket, moving violation, citation, tow/impound,
// admin fee). It records what happened, when, which vehicle, who had the
// vehicle at that time, who is responsible, and the recovery status.
//
// FINANCIAL TRUTH STAYS IN THE EXISTING LEDGERS:
//   - Rental Ledger  : customer charge (violation_charge) + customer payments
//   - Expense Ledger : company-paid cost (linked ExpenseTransaction)
//   - Banking        : imported statement evidence only
// The Violation record is descriptive/derived — it never creates a second
// financial ledger. Customer charge is idempotent (one ledger charge per
// violation). Company payment links/creates an Expense (expense ledger truth).
// Recovery/exposure is DERIVED from those authoritative records.
//
// Possession attribution uses occurred_at (not received_at) and is
// exchange-aware: a violation on a vehicle after it was exchanged off a
// rental is NOT attributed to that rental.

import type { TenderMethod, PaymentProcessor } from "./paymentMethodTypes";

// ---------------------------------------------------------------------------
// Violation types
// ---------------------------------------------------------------------------

export type ViolationType =
  | "toll"
  | "parking_ticket"
  | "red_light_camera"
  | "speed_camera"
  | "moving_violation"
  | "registration_citation"
  | "insurance_citation"
  | "tow_impound"
  | "admin_fee"
  | "other";

export const VIOLATION_TYPE_LABELS: Record<ViolationType, string> = {
  toll: "Toll",
  parking_ticket: "Parking Ticket",
  red_light_camera: "Red-Light Camera",
  speed_camera: "Speed Camera",
  moving_violation: "Moving Violation",
  registration_citation: "Registration / Plate Citation",
  insurance_citation: "Insurance Citation",
  tow_impound: "Tow / Impound",
  admin_fee: "Administrative Fee",
  other: "Other",
};

export const ALL_VIOLATION_TYPES = Object.keys(
  VIOLATION_TYPE_LABELS,
) as ViolationType[];

// ---------------------------------------------------------------------------
// Operational + financial status (kept separate to avoid one confusing field)
// ---------------------------------------------------------------------------

export type ViolationStatus =
  | "new"
  | "needs_review"
  | "assigned"
  | "awaiting_customer"
  | "disputed"
  | "due_soon"
  | "overdue"
  | "paid_by_company"
  | "customer_charged"
  | "partially_recovered"
  | "resolved"
  | "cancelled";

export const VIOLATION_STATUS_LABELS: Record<ViolationStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  assigned: "Assigned",
  awaiting_customer: "Awaiting Customer",
  disputed: "Disputed",
  due_soon: "Due Soon",
  overdue: "Overdue",
  paid_by_company: "Paid by Company",
  customer_charged: "Customer Charged",
  partially_recovered: "Partially Recovered",
  resolved: "Resolved",
  cancelled: "Cancelled / Void",
};

export const VIOLATION_STATUS_TONE: Record<
  ViolationStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  new: "maintenance",
  needs_review: "maintenance",
  assigned: "rented",
  awaiting_customer: "maintenance",
  disputed: "out",
  due_soon: "maintenance",
  overdue: "out",
  paid_by_company: "rented",
  customer_charged: "rented",
  partially_recovered: "maintenance",
  resolved: "available",
  cancelled: "neutral",
};

/** Statuses that represent open/active work (not resolved/cancelled). */
export const VIOLATION_OPEN_STATUSES: ViolationStatus[] = [
  "new",
  "needs_review",
  "assigned",
  "awaiting_customer",
  "disputed",
  "due_soon",
  "overdue",
  "paid_by_company",
  "customer_charged",
  "partially_recovered",
];

// ---------------------------------------------------------------------------
// Responsibility
// ---------------------------------------------------------------------------

export type ViolationResponsibility =
  "customer" | "company" | "shared" | "unknown" | "third_party";

export const RESPONSIBILITY_LABELS: Record<ViolationResponsibility, string> = {
  customer: "Customer",
  company: "Company",
  shared: "Shared",
  unknown: "Needs Review",
  third_party: "Third Party",
};

export const RESPONSIBILITY_TONE: Record<
  ViolationResponsibility,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  customer: "rented",
  company: "available",
  shared: "maintenance",
  unknown: "maintenance",
  third_party: "neutral",
};

export type ResponsibilityReason =
  | "renter_possessed_vehicle"
  | "predates_rental"
  | "after_return"
  | "registration_issue"
  | "company_insurance_issue"
  | "company_compliance_issue"
  | "driver_specific_citation"
  | "disputed_possession"
  | "unidentified_driver"
  | "shared_responsibility"
  | "manual_determination";

// ---------------------------------------------------------------------------
// Matching confidence (V1 Tolls & Violations Automation) — provider-agnostic
// ---------------------------------------------------------------------------

/** Possession-match result stored on a violation. The string values align with
 *  the spec's resolveViolationPossession results. */
export type MatchingConfidence =
  "matched" | "ambiguous" | "company_possession" | "unmatched";

export const MATCHING_CONFIDENCE_LABELS: Record<MatchingConfidence, string> = {
  matched: "Matched",
  ambiguous: "Ambiguous",
  company_possession: "Company Possession",
  unmatched: "Unmatched",
};

export const RESPONSIBILITY_REASON_LABELS: Record<
  ResponsibilityReason,
  string
> = {
  renter_possessed_vehicle: "Renter possessed vehicle at violation time",
  predates_rental: "Violation predates rental",
  after_return: "Violation occurred after return",
  registration_issue: "Registration issue",
  company_insurance_issue: "Company insurance lapse",
  company_compliance_issue: "Company maintenance / compliance issue",
  driver_specific_citation: "Driver-specific citation",
  disputed_possession: "Disputed possession",
  unidentified_driver: "Unidentified driver",
  shared_responsibility: "Shared responsibility",
  manual_determination: "Manual determination",
};

// ---------------------------------------------------------------------------
// Dispute
// ---------------------------------------------------------------------------

export type DisputeStatus =
  | "not_disputed"
  | "customer_disputed"
  | "company_disputed_authority"
  | "under_review"
  | "won_dismissed"
  | "lost_upheld"
  | "partially_reduced";

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  not_disputed: "Not Disputed",
  customer_disputed: "Customer Disputed",
  company_disputed_authority: "Disputed with Authority",
  under_review: "Under Review",
  won_dismissed: "Won / Dismissed",
  lost_upheld: "Lost / Upheld",
  partially_reduced: "Partially Reduced",
};

// ---------------------------------------------------------------------------
// Company payment / customer charge / reimbursement status
// ---------------------------------------------------------------------------

export type CompanyPaymentStatus =
  "not_paid" | "paid" | "reimbursed" | "partial_reimbursement";

export const COMPANY_PAYMENT_LABELS: Record<CompanyPaymentStatus, string> = {
  not_paid: "Not Paid",
  paid: "Paid by Company",
  reimbursed: "Reimbursed",
  partial_reimbursement: "Partially Reimbursed",
};

export type CustomerChargeStatus =
  "not_charged" | "charged" | "reversed" | "partially_recovered";

export const CUSTOMER_CHARGE_LABELS: Record<CustomerChargeStatus, string> = {
  not_charged: "Not Charged",
  charged: "Charged",
  reversed: "Reversed",
  partially_recovered: "Partially Recovered",
};

export type ReimbursementStatus = "none" | "full" | "partial" | "pending";

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export type ViolationSource =
  | "manual"
  | "csv_import"
  | "toll_provider"
  | "municipality"
  | "mail_notice"
  | "email"
  | "banking_review"
  | "api"
  | "other";

export const VIOLATION_SOURCE_LABELS: Record<ViolationSource, string> = {
  manual: "Manual Entry",
  csv_import: "CSV Import",
  toll_provider: "Toll Provider",
  municipality: "Municipality",
  mail_notice: "Mail / Paper Notice",
  email: "Email",
  banking_review: "Banking Review",
  api: "Future API",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type ViolationEvidenceType =
  | "citation_image"
  | "toll_statement"
  | "municipal_notice"
  | "vehicle_photo"
  | "renter_agreement"
  | "dispute_correspondence"
  | "proof_of_payment"
  | "other";

export const EVIDENCE_TYPE_LABELS: Record<ViolationEvidenceType, string> = {
  citation_image: "Citation Image",
  toll_statement: "Toll Statement",
  municipal_notice: "Municipal Notice",
  vehicle_photo: "Vehicle Photo",
  renter_agreement: "Renter Agreement",
  dispute_correspondence: "Dispute Correspondence",
  proof_of_payment: "Proof of Payment",
  other: "Other",
};

export interface ViolationEvidence {
  id: string;
  tenant_id: string;
  violation_id: string;
  type: ViolationEvidenceType;
  /** File reference / URL (memory-mode; private storage is Build #22). */
  file_ref: string | null;
  source: string | null;
  description: string | null;
  uploaded_by: string | null; // staff id
  uploaded_at: string;
}

// ---------------------------------------------------------------------------
// Timeline event (append-style)
// ---------------------------------------------------------------------------

export type ViolationEventType =
  | "created"
  | "possession_suggested"
  | "responsibility_assigned"
  | "responsibility_overridden"
  | "customer_charged"
  | "charge_reversed"
  | "company_expense_linked"
  | "company_expense_created"
  | "dispute_opened"
  | "dispute_resolved"
  | "amount_reduced"
  | "payment_recorded"
  | "assignment_changed"
  | "status_changed"
  | "resolved"
  | "note_added";

export const VIOLATION_EVENT_LABELS: Record<ViolationEventType, string> = {
  created: "Created",
  possession_suggested: "Possession match suggested",
  responsibility_assigned: "Responsibility assigned",
  responsibility_overridden: "Responsibility overridden",
  customer_charged: "Customer charged",
  charge_reversed: "Charge reversed",
  company_expense_linked: "Company expense linked",
  company_expense_created: "Company expense created",
  dispute_opened: "Dispute opened",
  dispute_resolved: "Dispute resolved",
  amount_reduced: "Amount reduced",
  payment_recorded: "Payment recorded",
  assignment_changed: "Assignment changed",
  status_changed: "Status changed",
  resolved: "Resolved",
  note_added: "Note added",
};

export interface ViolationEvent {
  id: string;
  tenant_id: string;
  violation_id: string;
  type: ViolationEventType;
  label: string;
  at: string;
  actor_id: string | null; // staff id, or null for SYSTEM
  meta: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Violation record
// ---------------------------------------------------------------------------

export interface Violation {
  id: string;
  tenant_id: string;
  violation_number: string;
  violation_type: ViolationType;
  status: ViolationStatus;
  vehicle_id: string;
  rental_id: string | null;
  customer_id: string | null;
  occurred_at: string; // ISO datetime — used for possession attribution
  received_at: string | null;
  due_at: string | null;
  issuing_authority: string | null;
  citation_number: string | null;
  /** Snapshot of plate at notice time (historical, plate may change later). */
  plate_number_snapshot: string | null;
  state_jurisdiction: string | null;
  location_description: string | null;
  description: string | null;
  // Amount model — kept separate. Total is derived.
  base_amount: number;
  penalties_amount: number;
  admin_fee_amount: number;
  total_amount: number;
  // Responsibility
  responsibility: ViolationResponsibility;
  responsibility_reason: ResponsibilityReason | null;
  responsibility_notes: string | null;
  responsibility_decided_by: string | null; // staff id
  responsibility_decided_at: string | null;
  // Dispute
  dispute_status: DisputeStatus;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  dispute_resolved_at: string | null;
  dispute_decision_note: string | null;
  // If authority reduced the amount, the final assessed amount (original
  // preserved in total_amount). Null = no reduction.
  reduced_amount: number | null;
  // Financial links (descriptive; truth in ledgers)
  company_payment_status: CompanyPaymentStatus;
  customer_charge_status: CustomerChargeStatus;
  reimbursement_status: ReimbursementStatus;
  linked_expense_id: string | null;
  customer_charge_transaction_id: string | null;
  /** Idempotency key for customer charge (stable violation link). */
  charge_idempotency_key: string | null;
  // Assignment
  assigned_staff_id: string | null;
  notes: string | null;
  source: ViolationSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // --- V1 Tolls & Violations Automation: provider-agnostic inbound provenance ---
  /** External provider id (e.g. "mock_toll_provider"). Null for manual entries. */
  provider: string | null;
  /** Provider's stable external event id — used for idempotent ingestion. Null
   *  for manual entries. */
  external_event_id: string | null;
  /** Matching confidence from possession resolution
   *  (matched | ambiguous | company_possession | unmatched). Null pre-V1 records. */
  matching_confidence: MatchingConfidence | null;
  /** Staff who reviewed the inbound match. Null until reviewed. */
  reviewed_by: string | null;
  /** When the inbound match was reviewed. Null until reviewed. */
  reviewed_at: string | null;
}

// Re-export tender types for convenience in the store API.
export type { TenderMethod, PaymentProcessor };
