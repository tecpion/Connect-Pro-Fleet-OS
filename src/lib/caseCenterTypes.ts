// Connect Pro Fleet — Case Center domain types (Build #54).
//
// CASE CENTER is the active operational workspace where staff manages
// rental-related issues from review through resolution. It COORDINATES
// existing authoritative records — it is NOT a second financial ledger, NOT a
// second damage-claim system, NOT a second violation system, NOT a second
// deposit system.
//
// Core principle: STAFF DOES THE WORK ONCE. Authoritative records are
// created/updated in their normal modules (Incidents, Violations, DamageClaims,
// Deposits, Expenses, Customer Charges, Tasks, Vault). Case Center links to
// those records and derives its metrics from them. It never duplicates
// financial truth.
//
// RENTAL RECORD (formerly "Defense Record") is the automatically-assembled
// historical/evidence record for a rental — read-only, derived from the same
// authoritative records. Terminology note: prior working names (Resolution
// Center, Defense Record, Graves Record, Legal Defense Center) are replaced by
// "Case Center" and "Rental Record" in the customer-facing product.

// ---------------------------------------------------------------------------
// Case categories
// ---------------------------------------------------------------------------

export type CaseCategory =
  | "tolls_tickets"
  | "damage_claims"
  | "customer_violations"
  | "deposits_refunds"
  | "disputes"
  | "roadside_recovery"
  | "general";

export const CASE_CATEGORY_LABELS: Record<CaseCategory, string> = {
  tolls_tickets: "Tolls & Tickets",
  damage_claims: "Damage & Claims",
  customer_violations: "Customer Violations",
  deposits_refunds: "Deposits & Refunds",
  disputes: "Disputes",
  roadside_recovery: "Roadside & Recovery",
  general: "Other / General",
};

export const CASE_CATEGORY_TONE: Record<
  CaseCategory,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  tolls_tickets: "maintenance",
  damage_claims: "out",
  customer_violations: "rented",
  deposits_refunds: "available",
  disputes: "out",
  roadside_recovery: "maintenance",
  general: "neutral",
};

// ---------------------------------------------------------------------------
// Case status (concise shared model)
// ---------------------------------------------------------------------------

export type CaseStatus =
  | "new"
  | "needs_review"
  | "awaiting_documentation"
  | "awaiting_customer"
  | "action_required"
  | "recovery_pending"
  | "disputed"
  | "resolved"
  | "closed";

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  needs_review: "Needs Review",
  awaiting_documentation: "Awaiting Documentation",
  awaiting_customer: "Awaiting Customer",
  action_required: "Action Required",
  recovery_pending: "Recovery Pending",
  disputed: "Disputed",
  resolved: "Resolved",
  closed: "Closed",
};

export const CASE_STATUS_TONE: Record<
  CaseStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  new: "maintenance",
  needs_review: "maintenance",
  awaiting_documentation: "maintenance",
  awaiting_customer: "maintenance",
  action_required: "out",
  recovery_pending: "maintenance",
  disputed: "out",
  resolved: "available",
  closed: "neutral",
};

/** Open (non-terminal) case statuses. */
export const CASE_OPEN_STATUSES: CaseStatus[] = [
  "new",
  "needs_review",
  "awaiting_documentation",
  "awaiting_customer",
  "action_required",
  "recovery_pending",
  "disputed",
];

export type CasePriority = "low" | "normal" | "high" | "urgent";

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

// ---------------------------------------------------------------------------
// Responsibility status (OPERATIONAL designation — NOT a legal determination)
// ---------------------------------------------------------------------------

export type CaseResponsibility =
  | "unreviewed"
  | "customer"
  | "company"
  | "third_party"
  | "insurance"
  | "split"
  | "unknown";

export const CASE_RESPONSIBILITY_LABELS: Record<CaseResponsibility, string> = {
  unreviewed: "Unreviewed",
  customer: "Customer Responsible",
  company: "Company Responsible",
  third_party: "Third Party Responsible",
  insurance: "Insurance",
  split: "Split Responsibility",
  unknown: "Unknown",
};

export const CASE_RESPONSIBILITY_TONE: Record<
  CaseResponsibility,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  unreviewed: "maintenance",
  customer: "rented",
  company: "available",
  third_party: "neutral",
  insurance: "maintenance",
  split: "maintenance",
  unknown: "maintenance",
};

/** A responsibility determination. Operational only — never a legal liability
 *  conclusion. */
export interface CaseResponsibilityDetermination {
  determination: CaseResponsibility;
  reason: string | null;
  determined_by: string | null; // staff id
  determined_at: string | null;
}

// ---------------------------------------------------------------------------
// Case timeline event (append-only audit)
// ---------------------------------------------------------------------------

export type CaseEventType =
  | "created"
  | "status_changed"
  | "assigned"
  | "note_added"
  | "document_uploaded"
  | "customer_notified"
  | "customer_disputed"
  | "charge_created"
  | "payment_received"
  | "deposit_applied"
  | "refund_issued"
  | "claim_opened"
  | "insurance_claim_filed"
  | "task_completed"
  | "responsibility_determined"
  | "resolved"
  | "closed";

export const CASE_EVENT_LABELS: Record<CaseEventType, string> = {
  created: "Case opened",
  status_changed: "Status changed",
  assigned: "Assignment changed",
  note_added: "Note added",
  document_uploaded: "Document uploaded",
  customer_notified: "Customer notified",
  customer_disputed: "Customer disputed",
  charge_created: "Customer charge created",
  payment_received: "Payment received",
  deposit_applied: "Deposit applied",
  refund_issued: "Refund issued",
  claim_opened: "Damage claim opened",
  insurance_claim_filed: "Insurance claim filed",
  task_completed: "Task completed",
  responsibility_determined: "Responsibility determined",
  resolved: "Case resolved",
  closed: "Case closed",
};

export interface CaseEvent {
  id: string;
  tenant_id: string;
  case_id: string;
  type: CaseEventType;
  label: string;
  at: string;
  actor_id: string | null; // staff id, or null for SYSTEM
  meta: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Financial linkage (descriptive references — truth stays in ledgers)
// ---------------------------------------------------------------------------

/** Links to authoritative financial records. Case Center NEVER duplicates these
 *  — it references them so the financial summary can be DERIVED. */
export interface CaseFinancialLinks {
  /** Rental ledger customer-charge transaction ids (authoritative). */
  customer_charge_ids: string[];
  /** Payment transaction ids (authoritative). */
  payment_ids: string[];
  /** Deposit application ids (authoritative deposit ledger). */
  deposit_application_ids: string[];
  /** Refund transaction ids (authoritative). */
  refund_ids: string[];
  /** Expense transaction ids (authoritative expense ledger — e.g. authority
   *  payment, repair cost, tow). */
  expense_ids: string[];
  /** Insurance claim / recovery references. */
  insurance_claim_refs: string[];
}

// ---------------------------------------------------------------------------
// Evidence linkage (references to authoritative records — never duplicated)
// ---------------------------------------------------------------------------

/** Links to authoritative evidence records. Case Center references these; it
 *  does not copy them. "View Rental Record" / "Generate Documentation Package"
 *  assemble from these same sources. */
export interface CaseEvidenceLinks {
  rental_id: string | null;
  incident_id: string | null;
  violation_id: string | null;
  damage_claim_id: string | null;
  inspection_ids: string[];
  /** Vault document references. */
  vault_doc_refs: string[];
  /** Free-form uploaded evidence file refs (photos, notices, police reports). */
  uploaded_file_refs: string[];
}

// ---------------------------------------------------------------------------
// Toll / ticket detail (category-specific extension)
// ---------------------------------------------------------------------------

export type TollTicketType =
  | "toll"
  | "parking_ticket"
  | "traffic_citation"
  | "camera_violation"
  | "other_admin_violation";

export const TOLL_TICKET_TYPE_LABELS: Record<TollTicketType, string> = {
  toll: "Toll",
  parking_ticket: "Parking Ticket",
  traffic_citation: "Traffic Citation",
  camera_violation: "Camera Violation",
  other_admin_violation: "Other Administrative Violation",
};

/** Toll/ticket money flow — kept separate. The authoritative customer charge
 *  lives in the rental ledger (referenced via financial_links); the authority
 *  payment may become an Expense (referenced via financial_links). These fields
 *  are descriptive snapshots so the case can show the flow without duplicating
 *  the ledger. */
export interface TollTicketDetail {
  toll_type: TollTicketType;
  authority_provider: string | null;
  notice_number: string | null;
  plate: string | null;
  event_location: string | null;
  /** Authority cost (original amount). */
  authority_amount: number;
  /** Administrative fee charged to customer. */
  admin_fee: number;
  /** Late penalty. */
  late_penalty: number;
  due_date: string | null;
  /** Payment-to-authority status (descriptive; expense link is authoritative). */
  authority_payment_status: "not_paid" | "paid" | "pending";
  /** Customer charge status (descriptive; ledger link is authoritative). */
  customer_charge_status: "not_charged" | "charged" | "reversed" | "reimbursed";
  /** Dispute / nomination status. */
  dispute_status:
    | "not_disputed"
    | "customer_disputed"
    | "company_disputed_authority"
    | "under_review"
    | "won"
    | "lost";
  /** Possession match result. */
  possession_match: "matched" | "ambiguous" | "no_match" | "manual";
}

// ---------------------------------------------------------------------------
// Roadside / recovery detail
// ---------------------------------------------------------------------------

export type RoadsideType =
  | "tow"
  | "impound"
  | "roadside_assistance"
  | "lockout"
  | "jump_start"
  | "vehicle_recovery"
  | "repossession"
  | "breakdown";

export const ROADSIDE_TYPE_LABELS: Record<RoadsideType, string> = {
  tow: "Tow",
  impound: "Impound",
  roadside_assistance: "Roadside Assistance",
  lockout: "Lockout",
  jump_start: "Jump Start",
  vehicle_recovery: "Vehicle Recovery",
  repossession: "Repossession / Retrieval",
  breakdown: "Breakdown Assistance",
};

export interface RoadsideDetail {
  roadside_type: RoadsideType;
  vendor_id: string | null;
  vendor_name: string | null;
  location: string | null;
  /** Linked maintenance work order (if repair needed). */
  maintenance_work_order_id: string | null;
  recovery_status: "pending" | "in_progress" | "recovered" | "unrecovered";
}

// ---------------------------------------------------------------------------
// Dispute detail
// ---------------------------------------------------------------------------

export interface DisputeDetail {
  /** The original charge being disputed (descriptive ref). */
  original_charge_ref: string | null;
  original_amount: number;
  dispute_opened_at: string | null;
  renter_reason: string | null;
  /** Adjustment approved (0 = none; original preserved). */
  adjusted_amount: number | null;
  final_outcome:
    "pending" | "upheld" | "reversed" | "partially_reduced" | "withdrawn";
  staff_response: string | null;
}

// ---------------------------------------------------------------------------
// Case outcome (resolution)
// ---------------------------------------------------------------------------

export interface CaseOutcome {
  outcome: string | null;
  responsibility: CaseResponsibilityDetermination | null;
  amount_recovered: number;
  unrecovered_amount: number;
  final_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

// ---------------------------------------------------------------------------
// The Case record
// ---------------------------------------------------------------------------

export interface CaseRecord {
  id: string;
  tenant_id: string;
  case_number: string;
  category: CaseCategory;
  status: CaseStatus;
  priority: CasePriority;
  title: string;
  description: string | null;
  // Linked entities (authoritative — never duplicated)
  customer_id: string | null;
  vehicle_id: string | null;
  rental_id: string | null;
  event_date: string | null; // when the underlying event occurred
  // Assignment
  assigned_staff_id: string | null;
  location_id: string | null;
  due_date: string | null;
  // Responsibility (operational — NOT legal liability)
  responsibility: CaseResponsibilityDetermination;
  // Amount at issue (descriptive snapshot; financial truth in ledgers)
  amount_at_issue: number;
  // Category-specific detail
  toll_detail: TollTicketDetail | null;
  roadside_detail: RoadsideDetail | null;
  dispute_detail: DisputeDetail | null;
  // Linkages
  financial_links: CaseFinancialLinks;
  evidence_links: CaseEvidenceLinks;
  // Outcome
  outcome: CaseOutcome | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_at: string | null;
  closed_at: string | null;
}

// ---------------------------------------------------------------------------
// Sources bundle for Case Center selectors
// ---------------------------------------------------------------------------

/** The authoritative records the Case Center selectors operate on. Passed in
 *  from the store/providers — selectors stay pure + testable. Financial totals
 *  are DERIVED from these authoritative records, never seeded independently. */
export interface CaseCenterSources {
  cases: CaseRecord[];
  caseEvents: CaseEvent[];
  rentals: import("./types").RentalAgreement[];
  customers: import("./types").Customer[];
  vehicles: import("./types").Vehicle[];
  violations: import("./violationTypes").Violation[];
  incidents: (import("./incidents").Incident &
    Partial<import("./defenseTypes").IncidentDefenseFields>)[];
  damageClaims: import("./damageClaimTypes").DamageClaim[];
  deposits: import("./depositTypes").RentalDeposit[];
  expenses: import("./expenseTypes").ExpenseTransaction[];
  /** Customer-charge ledger transactions (authoritative). */
  customerCharges: import("./chargeTypes").FinancialTransaction[];
  payments: import("./chargeTypes").FinancialTransaction[];
  tasks: import("./taskTypes").Task[];
  staff: import("./types").Staff[];
  releaseSnapshots: import("./defenseTypes").RentalReleaseSnapshot[];
}
