// Connect Pro Fleet — compliance expiration + current-document selectors
// (Build #26). Pure functions over DocumentRecord[]. Date-based expiration
// uses safe parsing so missing/malformed dates never crash. Derived status
// (expiring_soon / expired) never overwrites the stored verification state.

import type {
  DocumentRecord,
  DocumentType,
  DocumentEntityType,
} from "./complianceTypes";

const DAY = 86_400_000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** Days until expiration (negative = already expired; null = no expiry). */
export function daysUntilExpiration(
  doc: DocumentRecord,
  now: Date = new Date(),
): number | null {
  const exp = parse(doc.expiration_date);
  if (exp == null) return null;
  return Math.round((exp - now.getTime()) / DAY);
}

export type ExpirationState = "none" | "valid" | "expiring_soon" | "expired";

/** A document's effective expiration status (derived, non-destructive). */
export function expirationState(
  doc: DocumentRecord,
  now: Date = new Date(),
  warningDays = 30,
): ExpirationState {
  const exp = parse(doc.expiration_date);
  if (exp == null) return "none";
  const diff = exp - now.getTime();
  if (diff < 0) return "expired";
  if (diff <= warningDays * DAY) return "expiring_soon";
  return "valid";
}

/** Expired documents (non-archived, with a past expiration date). */
export function getExpiredDocuments(
  docs: DocumentRecord[],
  now: Date = new Date(),
): DocumentRecord[] {
  return docs.filter(
    (d) => d.archived_at == null && expirationState(d, now) === "expired",
  );
}

/** Documents expiring within `withinDays` (not yet expired). */
export function getDocumentsExpiringWithin(
  docs: DocumentRecord[],
  now: Date = new Date(),
  withinDays = 30,
): DocumentRecord[] {
  return docs.filter((d) => {
    if (d.archived_at != null) return false;
    return expirationState(d, now, withinDays) === "expiring_soon";
  });
}

/** The current (non-archived, non-superseded) document for an entity+type.
 *  Prefers the latest verified record; falls back to the latest uploaded. */
export function getCurrentDocument(
  docs: DocumentRecord[],
  entityType: DocumentEntityType,
  entityId: string,
  documentType: DocumentType,
): DocumentRecord | undefined {
  const candidates = docs.filter(
    (d) =>
      d.entity_type === entityType &&
      d.entity_id === entityId &&
      d.document_type === documentType &&
      d.archived_at == null &&
      d.superseded_by_document_id == null,
  );
  if (candidates.length === 0) return undefined;
  const verified = candidates.filter(
    (d) => d.verification_status === "verified",
  );
  const pool = verified.length > 0 ? verified : candidates;
  return [...pool].sort((a, b) =>
    (b.uploaded_at ?? b.created_at).localeCompare(
      a.uploaded_at ?? a.created_at,
    ),
  )[0];
}

/** All documents for an entity+type (history), newest first. */
export function getDocumentHistory(
  docs: DocumentRecord[],
  entityType: DocumentEntityType,
  entityId: string,
  documentType: DocumentType,
): DocumentRecord[] {
  return docs
    .filter(
      (d) =>
        d.entity_type === entityType &&
        d.entity_id === entityId &&
        d.document_type === documentType,
    )
    .sort((a, b) =>
      (b.uploaded_at ?? b.created_at).localeCompare(
        a.uploaded_at ?? a.created_at,
      ),
    );
}

/** Mask a document number: ••••1234. */
export function maskDocumentNumber(num: string | null): string | null {
  if (!num) return null;
  const s = num.replace(/\s+/g, "");
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

/** Returns the document number only when the viewer is permitted; else masked. */
export function safeDocumentNumber(
  doc: DocumentRecord,
  canViewSensitive: boolean,
): string | null {
  if (!doc.document_number) return null;
  return canViewSensitive
    ? doc.document_number
    : maskDocumentNumber(doc.document_number);
}
