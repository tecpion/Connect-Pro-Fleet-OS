// Connect Pro Fleet — Documents & Compliance domain types (Build #26).
//
// A DocumentRecord is structured EVIDENCE (registration, insurance, DL, rental
// agreement, inspection, title, …) attached to an entity (vehicle / customer /
// rental / company). Compliance is STRUCTURED OPERATIONAL STATE derived from
// requirements + documents + verification — NOT a second financial ledger and
// NOT a generic file dump. File upload alone is never "Verified".
//
// Compliance truth is DERIVED: Requirement + Document + Verification determine
// compliance. We never store "vehicle is compliant = true" and let it drift.
// Expiration is date-based and uses the Build #20 date-safety helpers so missing
// / malformed dates never crash. Sensitive fields (DL numbers, policy numbers)
// are masked unless the viewer has documents.view_sensitive.

// ---------------------------------------------------------------------------
// Entity types a document can attach to
// ---------------------------------------------------------------------------

export type DocumentEntityType = "company" | "vehicle" | "customer" | "rental";

export const DOCUMENT_ENTITY_LABELS: Record<DocumentEntityType, string> = {
  company: "Company",
  vehicle: "Vehicle",
  customer: "Customer",
  rental: "Rental",
};

// ---------------------------------------------------------------------------
// Document types — grouped by entity. Extensible: "other_*" covers future
// custom types without forcing a schema change.
// ---------------------------------------------------------------------------

export type VehicleDocumentType =
  | "registration"
  | "title"
  | "insurance"
  | "inspection"
  | "emissions"
  | "plate_tag"
  | "purchase_document"
  | "bill_of_sale"
  | "maintenance_cert"
  | "other_vehicle";

export type CustomerDocumentType =
  | "driver_license"
  | "insurance_proof"
  | "id_document"
  | "address_verification"
  | "additional_driver"
  | "other_customer";

export type RentalDocumentType =
  | "rental_agreement"
  | "extension_agreement"
  | "inspection_checkout"
  | "inspection_return"
  | "damage_acknowledgment"
  | "payment_agreement"
  | "policy_acknowledgment"
  | "other_rental";

export type CompanyDocumentType =
  | "business_license"
  | "insurance_policy"
  | "dealer_license"
  | "tax_document"
  | "other_company";

export type DocumentType =
  | VehicleDocumentType
  | CustomerDocumentType
  | RentalDocumentType
  | CompanyDocumentType;

export const VEHICLE_DOCUMENT_LABELS: Record<VehicleDocumentType, string> = {
  registration: "Registration",
  title: "Title",
  insurance: "Insurance",
  inspection: "Inspection",
  emissions: "Emissions",
  plate_tag: "Plate / Temporary Tag",
  purchase_document: "Purchase Document",
  bill_of_sale: "Bill of Sale",
  maintenance_cert: "Maintenance Certification",
  other_vehicle: "Other Vehicle Document",
};

export const CUSTOMER_DOCUMENT_LABELS: Record<CustomerDocumentType, string> = {
  driver_license: "Driver License",
  insurance_proof: "Insurance Proof",
  id_document: "ID / Identity Document",
  address_verification: "Address Verification",
  additional_driver: "Additional Driver Document",
  other_customer: "Other Customer Document",
};

export const RENTAL_DOCUMENT_LABELS: Record<RentalDocumentType, string> = {
  rental_agreement: "Rental Agreement",
  extension_agreement: "Extension Agreement",
  inspection_checkout: "Inspection / Check-Out",
  inspection_return: "Inspection / Return",
  damage_acknowledgment: "Damage Acknowledgment",
  payment_agreement: "Payment Agreement",
  policy_acknowledgment: "Policy Acknowledgment",
  other_rental: "Other Rental Document",
};

export const COMPANY_DOCUMENT_LABELS: Record<CompanyDocumentType, string> = {
  business_license: "Business License",
  insurance_policy: "Insurance Policy",
  dealer_license: "Dealer / Fleet License",
  tax_document: "Tax / Business Document",
  other_company: "Other Company Document",
};

export function documentTypeLabel(t: DocumentType): string {
  if (t in VEHICLE_DOCUMENT_LABELS)
    return VEHICLE_DOCUMENT_LABELS[t as VehicleDocumentType];
  if (t in CUSTOMER_DOCUMENT_LABELS)
    return CUSTOMER_DOCUMENT_LABELS[t as CustomerDocumentType];
  if (t in RENTAL_DOCUMENT_LABELS)
    return RENTAL_DOCUMENT_LABELS[t as RentalDocumentType];
  return COMPANY_DOCUMENT_LABELS[t as CompanyDocumentType] ?? t;
}

/** Which entity types a document type may attach to (for requirement presets). */
export function entityTypeForDocumentType(t: DocumentType): DocumentEntityType {
  if (t in VEHICLE_DOCUMENT_LABELS) return "vehicle";
  if (t in CUSTOMER_DOCUMENT_LABELS) return "customer";
  if (t in RENTAL_DOCUMENT_LABELS) return "rental";
  return "company";
}

// ---------------------------------------------------------------------------
// Document lifecycle status (stored) + verification status (separate)
// ---------------------------------------------------------------------------

export type DocumentStatus =
  | "missing"
  | "uploaded"
  | "pending_review"
  | "verified"
  | "rejected"
  | "expiring_soon"
  | "expired"
  | "archived"
  | "not_required";

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  missing: "Missing",
  uploaded: "Uploaded",
  pending_review: "Pending Review",
  verified: "Verified",
  rejected: "Rejected",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  archived: "Archived",
  not_required: "Not Required",
};

export const DOCUMENT_STATUS_TONE: Record<
  DocumentStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  missing: "out",
  uploaded: "neutral",
  pending_review: "maintenance",
  verified: "available",
  rejected: "out",
  expiring_soon: "maintenance",
  expired: "out",
  archived: "neutral",
  not_required: "neutral",
};

export type VerificationStatus =
  "not_reviewed" | "pending" | "verified" | "rejected";

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  not_reviewed: "Not Reviewed",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

export type DocumentSource =
  "manual" | "upload" | "migration" | "email" | "mail" | "other";

export const DOCUMENT_SOURCE_LABELS: Record<DocumentSource, string> = {
  manual: "Manual Entry",
  upload: "Upload",
  migration: "Migration Import",
  email: "Email",
  mail: "Mail / Paper",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Compliance requirement — company-configured rules
// ---------------------------------------------------------------------------

export type ComplianceBlockBehavior =
  | "blocks_assignment"
  | "blocks_checkout"
  | "blocks_start"
  | "blocks_completion"
  | "blocks_return"
  | "warning_only";

export interface ComplianceRequirement {
  id: string;
  tenant_id: string;
  entity_type: DocumentEntityType;
  document_type: DocumentType;
  required: boolean;
  blocks_operation_if_missing: boolean;
  blocks_operation_if_expired: boolean;
  requires_verification: boolean;
  warning_days: number;
  active: boolean;
  /** Optional explicit operational impact when this requirement blocks.
   *  When absent, the workspace derives a default per entity type. This is a
   *  display/presentation value only — actual blocking is still driven by
   *  blocks_operation_if_missing / blocks_operation_if_expired. */
  block_behavior?: ComplianceBlockBehavior | null;
  /** Manager override allowed for this requirement. */
  manager_override_allowed?: boolean;
  /** "policy" = derived from company CompliancePolicyConfig (single source of
   *  truth); "custom" = manually added company rule. */
  source: "policy" | "custom";
  applies_to: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Compliance override — authorized bypass with audit
// ---------------------------------------------------------------------------

export interface ComplianceOverride {
  id: string;
  tenant_id: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  document_type: DocumentType;
  requirement_id: string | null;
  reason: string;
  created_by: string | null; // staff id
  created_at: string;
  expires_at: string | null; // optional one-time scope
  active: boolean;
}

// ---------------------------------------------------------------------------
// Compliance status (derived)
// ---------------------------------------------------------------------------

export type ComplianceStatus =
  "compliant" | "attention_needed" | "non_compliant" | "blocked" | "unknown";

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  compliant: "Compliant",
  attention_needed: "Attention Needed",
  non_compliant: "Non-Compliant",
  blocked: "Blocked",
  unknown: "Unknown",
};

export const COMPLIANCE_STATUS_TONE: Record<
  ComplianceStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  compliant: "available",
  attention_needed: "maintenance",
  non_compliant: "out",
  blocked: "out",
  unknown: "neutral",
};

// ---------------------------------------------------------------------------
// Derived compliance issue (Needs Attention queue item)
// ---------------------------------------------------------------------------

export type ComplianceSeverity = "critical" | "high" | "medium" | "normal";

export const SEVERITY_LABELS: Record<ComplianceSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  normal: "Normal",
};

export type ComplianceIssueReason =
  | "missing_required"
  | "expired"
  | "expiring_soon"
  | "rejected"
  | "pending_review"
  | "failed_inspection"
  | "file_missing";

export const ISSUE_REASON_LABELS: Record<ComplianceIssueReason, string> = {
  missing_required: "Missing required document",
  expired: "Document expired",
  expiring_soon: "Document expiring soon",
  rejected: "Document rejected",
  pending_review: "Pending review",
  failed_inspection: "Failed inspection",
  file_missing: "File missing",
};

export interface ComplianceIssue {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_type: DocumentType;
  document_id: string | null;
  reason: ComplianceIssueReason;
  severity: ComplianceSeverity;
  blocking: boolean;
  expiration_date: string | null;
}

// ---------------------------------------------------------------------------
// Document record
// ---------------------------------------------------------------------------

export interface DocumentRecord {
  id: string;
  tenant_id: string;
  document_type: DocumentType;
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_number: string | null; // license #, policy #, title #
  issuer: string | null;
  state_jurisdiction: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  status: DocumentStatus;
  verification_status: VerificationStatus;
  file_reference: string | null; // memory-mode; private storage is Build #22
  original_filename: string | null;
  mime_type: string | null;
  notes: string | null;
  source: DocumentSource;
  uploaded_by: string | null; // staff id
  uploaded_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejected_reason: string | null;
  archived_at: string | null;
  supersedes_document_id: string | null;
  superseded_by_document_id: string | null;
  location_id: string | null;
  assigned_staff_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Timeline event (append-style, mirrors the violation event pattern)
// ---------------------------------------------------------------------------

export type ComplianceEventType =
  | "created"
  | "uploaded"
  | "verified"
  | "rejected"
  | "replacement_requested"
  | "superseded"
  | "archived"
  | "restored"
  | "assignment_changed"
  | "override_added"
  | "note_added";

export const COMPLIANCE_EVENT_LABELS: Record<ComplianceEventType, string> = {
  created: "Created",
  uploaded: "Uploaded",
  verified: "Verified",
  rejected: "Rejected",
  replacement_requested: "Replacement requested",
  superseded: "Superseded",
  archived: "Archived",
  restored: "Restored",
  assignment_changed: "Assignment changed",
  override_added: "Compliance override added",
  note_added: "Note added",
};

export interface ComplianceEvent {
  id: string;
  tenant_id: string;
  document_id: string | null;
  type: ComplianceEventType;
  label: string;
  at: string;
  actor_id: string | null;
  meta: Record<string, unknown> | null;
}
