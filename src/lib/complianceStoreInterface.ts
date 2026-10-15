// Connect Pro Fleet — Compliance store interface (Build #26).
//
// The compliance module is a standalone tenant-scoped store (like Violations)
// because the main fleet store module is at its size ceiling. It owns the
// DocumentRecord / ComplianceRequirement / ComplianceOverride / ComplianceEvent
// state and the review/versioning/override mutations. Compliance is DERIVED:
// requirement + document + verification determine status — we never store a
// boolean that can drift. Company policy (CompliancePolicyConfig inside
// CompanyPolicies) is the single source of truth for which documents are
// required and the default warning window; this store reads it via
// useCompanyPolicies() and materializes it into ComplianceRequirement records.
//
// Sensitive document numbers (DL, policy #) are masked unless the viewer has
// documents.view_sensitive. File references are memory-mode only — production
// private storage is Build #22 (deferred).

import type {
  DocumentRecord,
  DocumentEntityType,
  DocumentType,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceEvent,
  ComplianceStatus,
  ComplianceIssue,
  DocumentSource,
} from "./complianceTypes";

export interface AddDocumentInput {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_type: DocumentType;
  document_number?: string | null;
  issuer?: string | null;
  state_jurisdiction?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  file_reference?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  notes?: string | null;
  source?: DocumentSource;
  assigned_staff_id?: string | null;
  /** When replacing an existing current doc, the old record's id. */
  supersedes_document_id?: string | null;
}

export interface VerifyDocumentInput {
  reviewed_by?: string | null;
  notes?: string | null;
}

export interface RejectDocumentInput {
  reason: string;
  reviewed_by?: string | null;
}

export interface AddOverrideInput {
  entity_type: DocumentEntityType;
  entity_id: string;
  document_type: DocumentType;
  requirement_id?: string | null;
  reason: string;
  expires_at?: string | null;
}

export interface AddRequirementInput {
  entity_type: DocumentEntityType;
  document_type: DocumentType;
  required: boolean;
  blocks_operation_if_missing: boolean;
  blocks_operation_if_expired: boolean;
  requires_verification: boolean;
  warning_days: number;
  applies_to?: string | null;
  block_behavior?: import("./complianceTypes").ComplianceBlockBehavior | null;
  manager_override_allowed?: boolean;
}

export interface EntityComplianceResult {
  status: ComplianceStatus;
  issues: ComplianceIssue[];
  blockingReasons: string[];
}

export interface ComplianceStore {
  // State
  documents: DocumentRecord[];
  requirements: ComplianceRequirement[];
  overrides: ComplianceOverride[];
  complianceEvents: ComplianceEvent[];

  // Lookups
  documentsForEntity: (
    entityType: DocumentEntityType,
    entityId: string,
  ) => DocumentRecord[];
  currentDocument: (
    entityType: DocumentEntityType,
    entityId: string,
    documentType: DocumentType,
  ) => DocumentRecord | undefined;
  documentHistory: (
    entityType: DocumentEntityType,
    entityId: string,
    documentType: DocumentType,
  ) => DocumentRecord[];
  eventsFor: (documentId: string | null) => ComplianceEvent[];

  // Compliance status (derived)
  entityComplianceStatus: (
    entityType: DocumentEntityType,
    entityId: string,
    entityLabel: string,
  ) => EntityComplianceResult;
  vehicleComplianceBlockingReasons: (vehicleId: string) => string[];
  complianceBlocksForVehicle: (vehicleId: string) => {
    blocked: boolean;
    reasons: string[];
  };

  // Mutations
  addDocument: (input: AddDocumentInput) => string;
  updateDocument: (id: string, patch: Partial<DocumentRecord>) => void;
  verifyDocument: (id: string, input?: VerifyDocumentInput) => void;
  rejectDocument: (id: string, input: RejectDocumentInput) => void;
  archiveDocument: (id: string) => void;
  restoreDocument: (id: string) => void;
  supersedeDocument: (oldId: string, newDoc: AddDocumentInput) => string;
  assignStaff: (documentId: string, staffId: string | null) => void;

  // Requirement management
  addRequirement: (input: AddRequirementInput) => string;
  updateRequirement: (
    id: string,
    patch: Partial<ComplianceRequirement>,
  ) => void;

  // Override
  addOverride: (input: AddOverrideInput) => string;
  revokeOverride: (id: string) => void;

  // Search / filters
  searchDocuments: (query: string) => DocumentRecord[];

  // Build #26 closure — task + notification integration (Build #11/#12 reuse).
  // Both passes are idempotent: repeated evaluation never creates duplicate
  // tasks or notifications, and resolved issues complete the matching task.
  generateComplianceTasks: () => { created: number; resolved: number };
  generateComplianceNotifications: () => { created: number };
}
