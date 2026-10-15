// Connect Pro Fleet — compliance mutation helpers (Build #26).
// Pure-ish helpers for the standalone compliance provider. Each returns a
// function bound to the shared state setters so the provider stays focused.
// Document versioning preserves history: superseding archives the old record
// and links both directions. Upload ≠ verification: a new document starts at
// "uploaded"/"not_reviewed" and only becomes "verified" via verifyDocument.

import type {
  DocumentRecord,
  DocumentEntityType,
  DocumentType,
  ComplianceEvent,
  ComplianceEventType,
  DocumentSource,
} from "./complianceTypes";
import type {
  AddDocumentInput,
  VerifyDocumentInput,
  RejectDocumentInput,
} from "./complianceStoreInterface";

const SENSITIVE_DOC_TYPES: DocumentType[] = [
  "driver_license",
  "insurance_proof",
  "id_document",
  "additional_driver",
];

export function isSensitiveDoc(
  doc: Pick<DocumentRecord, "document_type">,
): boolean {
  return SENSITIVE_DOC_TYPES.includes(doc.document_type);
}

export function maskNumber(num: string | null | undefined): string | null {
  if (!num) return null;
  const s = String(num).replace(/\s+/g, "");
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildDocumentRecord(
  input: AddDocumentInput,
  tenantId: string,
  actor: string,
): DocumentRecord {
  const id = newId("doc");
  const now = nowIso();
  return {
    id,
    tenant_id: tenantId,
    document_type: input.document_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_label: input.entity_label,
    document_number: input.document_number ?? null,
    issuer: input.issuer ?? null,
    state_jurisdiction: input.state_jurisdiction ?? null,
    effective_date: input.effective_date ?? null,
    expiration_date: input.expiration_date ?? null,
    status: "uploaded",
    verification_status: "not_reviewed",
    file_reference: input.file_reference ?? null,
    original_filename: input.original_filename ?? null,
    mime_type: input.mime_type ?? null,
    notes: input.notes ?? null,
    source: (input.source ?? "manual") as DocumentSource,
    uploaded_by: actor,
    uploaded_at: now,
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: input.supersedes_document_id ?? null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: input.assigned_staff_id ?? null,
    created_by: actor,
    created_at: now,
    updated_at: now,
  };
}

export function makeEvent(
  documentId: string | null,
  type: ComplianceEventType,
  label: string,
  actor: string,
  tenantId: string,
  meta: Record<string, unknown> | null = null,
): ComplianceEvent {
  return {
    id: newId("ce"),
    tenant_id: tenantId,
    document_id: documentId,
    type,
    label,
    at: nowIso(),
    actor_id: actor,
    meta,
  };
}

/** Apply a supersede: archive old, link old→new and new→old. */
export function applySupersede(
  docs: DocumentRecord[],
  oldId: string,
  newId: string,
): DocumentRecord[] {
  const now = nowIso();
  return docs.map((d) => {
    if (d.id === oldId) {
      return { ...d, superseded_by_document_id: newId, archived_at: now };
    }
    if (d.id === newId) {
      return { ...d, supersedes_document_id: oldId };
    }
    return d;
  });
}

export function verifyDoc(
  docs: DocumentRecord[],
  id: string,
  input: VerifyDocumentInput | undefined,
  actor: string,
): DocumentRecord[] {
  const now = nowIso();
  return docs.map((d) =>
    d.id === id
      ? {
          ...d,
          verification_status: "verified",
          status: "verified",
          reviewed_by: input?.reviewed_by ?? actor,
          reviewed_at: now,
          updated_at: now,
        }
      : d,
  );
}

export function rejectDoc(
  docs: DocumentRecord[],
  id: string,
  input: RejectDocumentInput,
  actor: string,
): DocumentRecord[] {
  if (!input.reason?.trim()) {
    throw new Error("Rejection requires a reason.");
  }
  const now = nowIso();
  return docs.map((d) =>
    d.id === id
      ? {
          ...d,
          verification_status: "rejected",
          status: "rejected",
          rejected_reason: input.reason,
          reviewed_by: input.reviewed_by ?? actor,
          reviewed_at: now,
          updated_at: now,
        }
      : d,
  );
}
