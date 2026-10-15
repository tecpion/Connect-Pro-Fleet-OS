// Connect Pro Fleet — Damage Claims domain types (Build #17).
//
// A DamageClaim is the operational case for one damage incident and its
// recovery process: what happened, which rental/customer/vehicle is involved,
// who is responsible, what it cost, and how much was recovered. It COORDINATES
// existing systems — it is NOT a second financial ledger.
//
// Responsibility model (kept separate):
//   - Inspection        : evidence of vehicle condition (immutable source)
//   - DamageClaim       : operational case / recovery process
//   - Rental Ledger     : customer financial obligation (authoritative)
//   - Security Deposit  : held money + application/refund/forfeiture semantics
//   - Maintenance WO    : repair execution
//   - Expense Ledger    : actual business repair cost (authoritative)
//   - Profitability     : derived economic impact
//
// Financial non-duplication: DamageClaim fields are descriptive/derived. The
// authoritative financial truth remains the rental ledger (customer charge),
// deposit ledger (application/refund), expense ledger (repair cost), and
// claim recovery records (insurance/third-party). No mutable duplicate
// financial truth that can drift.

// ---------------------------------------------------------------------------
// Claim status (operational lifecycle)
// ---------------------------------------------------------------------------

export type DamageClaimStatus =
  | "open"
  | "under_review"
  | "customer_responsible"
  | "insurance_pending"
  | "repair_in_progress"
  | "recovery_pending"
  | "resolved"
  | "closed"
  | "cancelled";

export const DAMAGE_CLAIM_STATUS_LABELS: Record<DamageClaimStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  customer_responsible: "Customer Responsible",
  insurance_pending: "Insurance Pending",
  repair_in_progress: "Repair in Progress",
  recovery_pending: "Recovery Pending",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const DAMAGE_CLAIM_STATUS_TONE: Record<
  DamageClaimStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  open: "maintenance",
  under_review: "maintenance",
  customer_responsible: "rented",
  insurance_pending: "maintenance",
  repair_in_progress: "rented",
  recovery_pending: "maintenance",
  resolved: "available",
  closed: "neutral",
  cancelled: "neutral",
};

/** Active (non-terminal) claim statuses. */
export const DAMAGE_CLAIM_ACTIVE_STATUSES: DamageClaimStatus[] = [
  "open",
  "under_review",
  "customer_responsible",
  "insurance_pending",
  "repair_in_progress",
  "recovery_pending",
];

// ---------------------------------------------------------------------------
// Responsibility (separate from claim status)
// ---------------------------------------------------------------------------

export type ResponsibilityStatus =
  | "undetermined"
  | "customer"
  | "company"
  | "third_party"
  | "insurance"
  | "shared"
  | "not_chargeable";

export const RESPONSIBILITY_LABELS: Record<ResponsibilityStatus, string> = {
  undetermined: "Undetermined",
  customer: "Customer",
  company: "Company",
  third_party: "Third Party",
  insurance: "Insurance",
  shared: "Shared",
  not_chargeable: "Not Chargeable",
};

export type ResponsiblePartyType =
  | "customer"
  | "driver"
  | "company"
  | "employee"
  | "third_party"
  | "insurance"
  | "unknown";

export const RESPONSIBLE_PARTY_LABELS: Record<ResponsiblePartyType, string> = {
  customer: "Customer",
  driver: "Driver",
  company: "Company",
  employee: "Employee",
  third_party: "Third Party",
  insurance: "Insurance",
  unknown: "Unknown",
};

// ---------------------------------------------------------------------------
// Damage source / severity
// ---------------------------------------------------------------------------

export type DamageSource =
  | "checkout_inspection"
  | "checkin_inspection"
  | "mid_rental_report"
  | "accident"
  | "incident"
  | "staff_discovery"
  | "customer_reported"
  | "third_party"
  | "other";

export const DAMAGE_SOURCE_LABELS: Record<DamageSource, string> = {
  checkout_inspection: "Checkout Inspection",
  checkin_inspection: "Check-in Inspection",
  mid_rental_report: "Mid-Rental Report",
  accident: "Accident",
  incident: "Incident",
  staff_discovery: "Staff Discovery",
  customer_reported: "Customer Reported",
  third_party: "Third Party",
  other: "Other",
};

export type DamageSeverity = "minor" | "moderate" | "major" | "critical";

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  critical: "Critical",
};

export const DAMAGE_SEVERITY_TONE: Record<
  DamageSeverity,
  "available" | "maintenance" | "out" | "neutral"
> = {
  minor: "neutral",
  moderate: "maintenance",
  major: "maintenance",
  critical: "out",
};

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceType =
  | "photo"
  | "video"
  | "inspection_image"
  | "document"
  | "estimate"
  | "police_report"
  | "customer_message"
  | "other";

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  photo: "Photo",
  video: "Video",
  inspection_image: "Inspection Image",
  document: "Document",
  estimate: "Estimate",
  police_report: "Police Report",
  customer_message: "Customer Message",
  other: "Other",
};

export interface DamageEvidence {
  id: string;
  tenant_id: string;
  damage_claim_id: string;
  evidence_type: EvidenceType;
  file_url: string; // placeholder for future private storage
  inspection_photo_id: string | null; // reference to source inspection photo
  description: string | null;
  captured_at: string | null;
  uploaded_by_user_id: string | null;
  created_at: string;
  /** Voided evidence remains in history (never hard-deleted). */
  voided_at: string | null;
}

// ---------------------------------------------------------------------------
// Insurance claim
// ---------------------------------------------------------------------------

export type InsuranceClaimStatus =
  | "not_filed"
  | "filed"
  | "under_review"
  | "approved"
  | "partially_paid"
  | "paid"
  | "denied"
  | "closed";

export const INSURANCE_CLAIM_STATUS_LABELS: Record<
  InsuranceClaimStatus,
  string
> = {
  not_filed: "Not Filed",
  filed: "Filed",
  under_review: "Under Review",
  approved: "Approved",
  partially_paid: "Partially Paid",
  paid: "Paid",
  denied: "Denied",
  closed: "Closed",
};

export interface DamageInsuranceClaim {
  id: string;
  tenant_id: string;
  damage_claim_id: string;
  insurer_name: string | null;
  policy_reference: string | null;
  claim_reference: string | null;
  claim_status: InsuranceClaimStatus;
  deductible_amount: number | null;
  claimed_amount: number | null;
  approved_amount: number | null;
  paid_amount: number | null;
  filed_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  adjuster_name: string | null;
  adjuster_contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Recovery (customer payment / deposit application / insurance / third-party)
// ---------------------------------------------------------------------------

export type RecoveryType =
  | "customer_payment"
  | "security_deposit_application"
  | "insurance"
  | "third_party"
  | "other";

export const RECOVERY_TYPE_LABELS: Record<RecoveryType, string> = {
  customer_payment: "Customer Payment",
  security_deposit_application: "Security Deposit Application",
  insurance: "Insurance",
  third_party: "Third Party",
  other: "Other",
};

export interface DamageRecovery {
  id: string;
  tenant_id: string;
  damage_claim_id: string;
  recovery_type: RecoveryType;
  amount: number;
  date: string;
  source_reference: string | null;
  /** Linked authoritative ledger transaction (customer payment or deposit app). */
  ledger_transaction_id: string | null;
  deposit_transaction_id: string | null;
  insurance_claim_id: string | null;
  notes: string | null;
  created_at: string;
  /** Reversal preserves history (never hard-deleted). */
  reversed_at: string | null;
}

// ---------------------------------------------------------------------------
// Claim events (append-oriented audit trail)
// ---------------------------------------------------------------------------

export type DamageClaimEventType =
  | "created"
  | "status_changed"
  | "responsibility_changed"
  | "evidence_added"
  | "evidence_voided"
  | "estimate_updated"
  | "customer_charged"
  | "charge_reversed"
  | "deposit_applied"
  | "insurance_filed"
  | "insurance_recovery_recorded"
  | "work_order_linked"
  | "expense_linked"
  | "vehicle_blocked"
  | "vehicle_released"
  | "note_added"
  | "closed"
  | "cancelled"
  | "reopened";

export interface DamageClaimEvent {
  id: string;
  tenant_id: string;
  damage_claim_id: string;
  event_type: DamageClaimEventType;
  label: string;
  actor_user_id: string | null; // staff id, or null for SYSTEM
  actor_is_system: boolean;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// DamageClaim — the operational case record
// ---------------------------------------------------------------------------

export interface DamageClaim {
  id: string;
  tenant_id: string;
  claim_number: string; // DMG-2026-000001
  vehicle_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  customer_id: string | null;
  inspection_id: string | null;
  incident_id: string | null;
  claim_status: DamageClaimStatus;
  damage_source: DamageSource;
  discovered_at: string;
  discovered_by_user_id: string | null;
  damage_date: string | null;
  location_id: string | null;
  responsibility_status: ResponsibilityStatus;
  responsible_party_type: ResponsiblePartyType | null;
  customer_responsibility_percent: number | null; // 0..100
  description: string;
  severity: DamageSeverity;
  /** Explicit flag: does this claim take the vehicle out of service? */
  blocks_vehicle_use: boolean;
  /** Pre-existing / not-customer-chargeable marker. */
  pre_existing: boolean | "undetermined";
  estimated_repair_cost: number | null;
  approved_repair_cost: number | null;
  /** Set when a customer damage charge is posted (ledger transaction id). */
  customer_charge_transaction_id: string | null;
  maintenance_work_order_id: string | null;
  insurance_claim_id: string | null;
  external_reference: string | null;
  assigned_user_id: string | null;
  closed_at: string | null;
  closed_by_user_id: string | null;
  closure_reason: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Claim economics (derived — never stored as mutable truth)
// ---------------------------------------------------------------------------

export interface DamageClaimEconomics {
  estimated_cost: number | null;
  actual_cost: number | null;
  customer_charged: number;
  customer_paid: number;
  deposit_applied: number;
  insurance_recovered: number;
  third_party_recovered: number;
  other_recovered: number;
  total_recovered: number;
  unrecovered_cost: number | null; // null when actual cost unknown
  outstanding_customer_damage_balance: number;
  /** Actual cost - total recovery. Negative if over-recovered. null if actual unknown. */
  company_net_loss: number | null;
}
