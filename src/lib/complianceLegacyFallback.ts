// Connect Pro Fleet — legacy-field fallback synthesizer (Build #26).
//
// LEGACY FIELD TRANSITION STRATEGY (spec §82–84):
// Existing records carry convenience fields (vehicle.registration_expiry,
// vehicle.insurance_expiry, customer.drivers_license_expiry,
// customer.insurance_expiry). These remain valid quick-reference metadata.
// A structured DocumentRecord is the AUTHORITATIVE detailed compliance/document
// history once one exists.
//
// To avoid permanent dual-truth drift, the compliance evaluator works over a
// uniform DocumentRecord[] list. When a structured document does NOT exist for
// a required type, this synthesizer derives a *virtual* DocumentRecord from the
// legacy field so compliance can still evaluate the known expiration. The
// virtual record is clearly marked (status: "missing", file_reference: null,
// source: "migration") so it never masquerades as an uploaded file. Once a real
// structured document exists, getCurrentDocument() prefers it and the virtual
// record is ignored — no divergence.
//
// These virtual records are NOT persisted; they are derived on demand by the
// provider so the store's documents[] array stays the source of truth for real
// uploads, while legacy metadata participates in compliance evaluation.

import type { DocumentRecord, DocumentType } from "./complianceTypes";
import type { Vehicle, Customer } from "./types";
import { nowIso } from "./complianceMutationHelpers";
import { TENANT_ID } from "./store/ids";

const DAY = 86_400_000;

function isStaleLegacy(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t);
}

/** Build a virtual (legacy-derived) document record for a vehicle field. */
function virtualVehicleDoc(
  vehicle: Vehicle,
  documentType: DocumentType,
  expiration: string | null,
  documentNumber: string | null,
  issuer: string | null,
): DocumentRecord | null {
  if (!isStaleLegacy(expiration) && !documentNumber) return null;
  const now = nowIso();
  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`;
  return {
    id: `virt_veh_${vehicle.id}_${documentType}`,
    tenant_id: TENANT_ID,
    document_type: documentType,
    entity_type: "vehicle",
    entity_id: vehicle.id,
    entity_label: label,
    document_number: documentNumber,
    issuer,
    state_jurisdiction: null,
    effective_date: null,
    expiration_date: expiration,
    // "missing" + null file_reference = expiration known but no file uploaded.
    status: "missing",
    verification_status: "not_reviewed",
    file_reference: null,
    original_filename: null,
    mime_type: null,
    notes: "Derived from legacy vehicle metadata; no uploaded file.",
    source: "migration",
    uploaded_by: null,
    uploaded_at: null,
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
}

/** Build a virtual (legacy-derived) document record for a customer field. */
function virtualCustomerDoc(
  customer: Customer,
  documentType: DocumentType,
  expiration: string | null,
  documentNumber: string | null,
  issuer: string | null,
): DocumentRecord | null {
  if (!isStaleLegacy(expiration) && !documentNumber) return null;
  const now = nowIso();
  const label = `${customer.first_name} ${customer.last_name}`;
  return {
    id: `virt_cus_${customer.id}_${documentType}`,
    tenant_id: TENANT_ID,
    document_type: documentType,
    entity_type: "customer",
    entity_id: customer.id,
    entity_label: label,
    document_number: documentNumber,
    issuer,
    state_jurisdiction: customer.drivers_license_state ?? null,
    effective_date: null,
    expiration_date: expiration,
    status: "missing",
    verification_status: "not_reviewed",
    file_reference: null,
    original_filename: null,
    mime_type: null,
    notes: "Derived from legacy customer metadata; no uploaded file.",
    source: "migration",
    uploaded_by: null,
    uploaded_at: null,
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
}

/** Derive virtual documents for a vehicle from its legacy convenience fields. */
export function legacyVehicleDocuments(vehicle: Vehicle): DocumentRecord[] {
  const out: DocumentRecord[] = [];
  const reg = virtualVehicleDoc(
    vehicle,
    "registration",
    vehicle.registration_expiry ?? null,
    null,
    null,
  );
  if (reg) out.push(reg);
  const ins = virtualVehicleDoc(
    vehicle,
    "insurance",
    vehicle.insurance_expiry ?? null,
    vehicle.insurance_policy_number ?? null,
    null,
  );
  if (ins) out.push(ins);
  return out;
}

/** Derive virtual documents for a customer from legacy convenience fields. */
export function legacyCustomerDocuments(customer: Customer): DocumentRecord[] {
  const out: DocumentRecord[] = [];
  const dl = virtualCustomerDoc(
    customer,
    "driver_license",
    customer.drivers_license_expiry ?? null,
    customer.drivers_license_number ?? null,
    null,
  );
  if (dl) out.push(dl);
  const ins = virtualCustomerDoc(
    customer,
    "insurance_proof",
    customer.insurance_expiry ?? null,
    customer.insurance_policy_number ?? null,
    customer.insurance_company ?? null,
  );
  if (ins) out.push(ins);
  return out;
}

/** Merge real documents with legacy-derived virtual documents. Real structured
 *  documents always win: if a real (non-virtual) current document exists for an
 *  entity+type, the virtual record for that type is suppressed so there is no
 *  dual-truth drift. */
export function mergeLegacyDocuments(
  realDocs: DocumentRecord[],
  virtualDocs: DocumentRecord[],
): DocumentRecord[] {
  const realKeys = new Set(
    realDocs
      .filter((d) => !d.id.startsWith("virt_"))
      .map((d) => `${d.entity_type}:${d.entity_id}:${d.document_type}`),
  );
  const virtual = virtualDocs.filter(
    (v) => !realKeys.has(`${v.entity_type}:${v.entity_id}:${v.document_type}`),
  );
  return [...realDocs, ...virtual];
}

/** Days until an ISO date (null = no expiry). Exported for tests. */
export function daysUntil(
  iso: string | null,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - now.getTime()) / DAY);
}
