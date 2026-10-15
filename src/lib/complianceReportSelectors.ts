// Connect Pro Fleet — compliance reporting + legacy-field transition selectors
// (Build #26). Pure functions. Compliance truth is DERIVED from requirements +
// documents + verification — never a stored boolean. These selectors compose
// the lower-level complianceStatus evaluators into report/queue/dashboard
// shapes and bridge legacy convenience fields (vehicle.registration_expiry,
// customer.drivers_license_expiry, customer.insurance_expiry) into the
// compliance model WITHOUT fabricating uploaded files.
//
// Legacy-field transition rule (spec §83–84):
//   - Existing convenience field = backward-compat quick reference.
//   - DocumentRecord = authoritative detailed compliance once it exists.
//   - Selectors prefer structured current-document data; if no structured
//     document exists they fall back to legacy metadata. We never invent a
//     file merely because legacy expiration metadata exists.

import type { Vehicle, Customer } from "./types";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
  DocumentEntityType,
  DocumentType,
  ComplianceIssue,
  ComplianceStatus,
} from "./complianceTypes";
import {
  getEntityComplianceStatus,
  type EntityComplianceResult,
} from "./complianceStatus";
import { expirationState } from "./complianceSelectors";

const DAY = 86_400_000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** A synthetic document-shaped view derived from a legacy convenience field.
 *  Used ONLY when no structured DocumentRecord exists for that entity+type, so
 *  compliance can still evaluate a known expiration. file_reference is null —
 *  we never fabricate an upload. */
export interface LegacyDocFallback {
  document_type: DocumentType;
  expiration_date: string | null;
  file_reference: null;
  verification_status: "verified" | "not_reviewed";
  source: "legacy";
}

/** Legacy vehicle convenience fields → compliance doc fallbacks. */
export function legacyVehicleDocFallbacks(
  vehicle: Vehicle,
): LegacyDocFallback[] {
  const out: LegacyDocFallback[] = [];
  if (vehicle.registration_expiry) {
    out.push({
      document_type: "registration",
      expiration_date: vehicle.registration_expiry,
      file_reference: null,
      verification_status: "verified",
      source: "legacy",
    });
  }
  if (vehicle.insurance_expiry) {
    out.push({
      document_type: "insurance",
      expiration_date: vehicle.insurance_expiry,
      file_reference: null,
      verification_status: "verified",
      source: "legacy",
    });
  }
  return out;
}

/** Legacy customer convenience fields → compliance doc fallbacks. */
export function legacyCustomerDocFallbacks(
  customer: Customer,
): LegacyDocFallback[] {
  const out: LegacyDocFallback[] = [];
  if (customer.drivers_license_expiry) {
    out.push({
      document_type: "driver_license",
      expiration_date: customer.drivers_license_expiry,
      file_reference: null,
      verification_status: customer.drivers_license_number
        ? "verified"
        : "not_reviewed",
      source: "legacy",
    });
  }
  if (customer.insurance_expiry) {
    out.push({
      document_type: "insurance_proof",
      expiration_date: customer.insurance_expiry,
      file_reference: null,
      verification_status: customer.insurance_policy_number
        ? "verified"
        : "not_reviewed",
      source: "legacy",
    });
  }
  return out;
}

/** Merge structured documents with legacy fallbacks for a given entity+type.
 *  Structured current documents win; legacy fills gaps only. */
export function effectiveDocumentsFor(
  docs: DocumentRecord[],
  entityType: DocumentEntityType,
  entityId: string,
  fallbacks: LegacyDocFallback[],
): DocumentRecord[] {
  const structured = docs.filter(
    (d) =>
      d.entity_type === entityType &&
      d.entity_id === entityId &&
      d.archived_at == null &&
      d.superseded_by_document_id == null,
  );
  const result: DocumentRecord[] = [...structured];
  for (const fb of fallbacks) {
    const hasStructured = structured.some(
      (d) => d.document_type === fb.document_type,
    );
    if (!hasStructured) {
      // Synthesize a minimal DocumentRecord-shaped object for evaluation only.
      result.push({
        id: `legacy_${entityType}_${entityId}_${fb.document_type}`,
        tenant_id: "",
        document_type: fb.document_type,
        entity_type: entityType,
        entity_id: entityId,
        entity_label: "",
        document_number: null,
        issuer: null,
        state_jurisdiction: null,
        effective_date: null,
        expiration_date: fb.expiration_date,
        status: "uploaded",
        verification_status: fb.verification_status,
        file_reference: fb.file_reference,
        original_filename: null,
        mime_type: null,
        notes: null,
        source: "manual",
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
        created_at: "",
        updated_at: "",
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Vehicle compliance (with legacy fallback)
// ---------------------------------------------------------------------------

export function getVehicleComplianceStatusWithLegacy(
  vehicle: Vehicle,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): EntityComplianceResult {
  const fallbacks = legacyVehicleDocFallbacks(vehicle);
  const effective = effectiveDocumentsFor(
    docs,
    "vehicle",
    vehicle.id,
    fallbacks,
  );
  return getEntityComplianceStatus(
    "vehicle",
    vehicle.id,
    `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    reqs,
    effective,
    overrides,
    now,
    warningDays,
  );
}

export function getCustomerComplianceStatusWithLegacy(
  customer: Customer,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): EntityComplianceResult {
  const fallbacks = legacyCustomerDocFallbacks(customer);
  const effective = effectiveDocumentsFor(
    docs,
    "customer",
    customer.id,
    fallbacks,
  );
  return getEntityComplianceStatus(
    "customer",
    customer.id,
    `${customer.first_name} ${customer.last_name}`,
    reqs,
    effective,
    overrides,
    now,
    warningDays,
  );
}

/** Blocking reasons for a vehicle, composing compliance with legacy fallback. */
export function vehicleComplianceBlockingReasons(
  vehicle: Vehicle,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): string[] {
  return getVehicleComplianceStatusWithLegacy(
    vehicle,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  ).blockingReasons;
}

/** True when a compliance block prevents renting this vehicle. */
export function isVehicleComplianceBlocked(
  vehicle: Vehicle,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): boolean {
  return (
    vehicleComplianceBlockingReasons(
      vehicle,
      reqs,
      docs,
      overrides,
      now,
      warningDays,
    ).length > 0
  );
}

// ---------------------------------------------------------------------------
// Driver-license-through-rental-end check (spec §25)
// ---------------------------------------------------------------------------

/** Returns whether the customer's DL is valid through the rental end date.
 *  Uses structured document first, then legacy field. */
export function dlValidThroughRentalEnd(
  customer: Customer,
  rentalEndDate: string,
  docs: DocumentRecord[],
): {
  ok: boolean;
  expiration: string | null;
  source: "document" | "legacy" | "none";
} {
  const dlDoc = docs.find(
    (d) =>
      d.entity_type === "customer" &&
      d.entity_id === customer.id &&
      d.document_type === "driver_license" &&
      d.archived_at == null &&
      d.superseded_by_document_id == null,
  );
  const exp = dlDoc?.expiration_date ?? customer.drivers_license_expiry ?? null;
  if (!exp) return { ok: false, expiration: null, source: "none" };
  const expTime = parse(exp);
  const endTime = parse(rentalEndDate);
  if (expTime == null || endTime == null)
    return { ok: true, expiration: exp, source: dlDoc ? "document" : "legacy" };
  return {
    ok: expTime >= endTime,
    expiration: exp,
    source: dlDoc ? "document" : "legacy",
  };
}

// ---------------------------------------------------------------------------
// Needs Attention queue
// ---------------------------------------------------------------------------

export interface NeedsAttentionItem {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_type: DocumentType;
  reason: ComplianceIssue["reason"];
  severity: ComplianceIssue["severity"];
  blocking: boolean;
  expiration_date: string | null;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  normal: 3,
};

/** Flatten all entity compliance issues into a single urgency-ordered queue. */
export function getNeedsAttention(
  results: {
    entity_type: DocumentEntityType;
    entity_id: string;
    entity_label: string;
    result: EntityComplianceResult;
  }[],
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  for (const { entity_type, entity_id, entity_label, result } of results) {
    for (const issue of result.issues) {
      items.push({
        entity_type,
        entity_id,
        entity_label,
        document_type: issue.document_type,
        reason: issue.reason,
        severity: issue.severity,
        blocking: issue.blocking,
        expiration_date: issue.expiration_date,
      });
    }
  }
  return items.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

// ---------------------------------------------------------------------------
// Reporting selectors (spec §60-equivalent for compliance)
// ---------------------------------------------------------------------------

export interface ComplianceSummary {
  total_required: number;
  compliant: number;
  missing: number;
  expired: number;
  expiring_soon: number;
  pending_review: number;
  rejected: number;
  blocked_vehicles: number;
  open_issues: number;
}

export function getComplianceSummary(
  results: EntityComplianceResult[],
  allDocs: DocumentRecord[],
  now: Date = new Date(),
  warningDays = 30,
): ComplianceSummary {
  let total_required = 0;
  let compliant = 0;
  let missing = 0;
  let expired = 0;
  let expiring_soon = 0;
  let pending_review = 0;
  let rejected = 0;
  let blocked_vehicles = 0;
  let open_issues = 0;

  for (const r of results) {
    for (const ev of r.evaluations) {
      total_required++;
      if (ev.satisfied) compliant++;
      else if (ev.reason === "missing_required") missing++;
      else if (ev.reason === "expired") expired++;
      else if (ev.reason === "expiring_soon") expiring_soon++;
      else if (ev.reason === "pending_review") pending_review++;
      else if (ev.reason === "rejected") rejected++;
    }
    if (r.status === "blocked") blocked_vehicles++;
    open_issues += r.issues.length;
  }

  // Also count standalone expired/expiring documents not tied to a requirement.
  for (const d of allDocs) {
    if (d.archived_at != null || d.superseded_by_document_id != null) continue;
    const st = expirationState(d, now, warningDays);
    if (st === "expired") expired++;
    else if (st === "expiring_soon") expiring_soon++;
  }

  return {
    total_required,
    compliant,
    missing,
    expired,
    expiring_soon,
    pending_review,
    rejected,
    blocked_vehicles,
    open_issues,
  };
}

export function getExpiredDocumentsList(
  docs: DocumentRecord[],
  now: Date = new Date(),
): DocumentRecord[] {
  return docs.filter(
    (d) =>
      d.archived_at == null &&
      d.superseded_by_document_id == null &&
      expirationState(d, now) === "expired",
  );
}

export function getMissingRequiredIssues(
  results: { result: EntityComplianceResult }[],
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  for (const { result } of results) {
    for (const issue of result.issues) {
      if (issue.reason === "missing_required") {
        items.push({
          entity_type: issue.entity_type,
          entity_id: issue.entity_id,
          entity_label: issue.entity_label,
          document_type: issue.document_type,
          reason: issue.reason,
          severity: issue.severity,
          blocking: issue.blocking,
          expiration_date: issue.expiration_date,
        });
      }
    }
  }
  return items;
}

export function getBlockedVehicleCount(
  vehicleResults: EntityComplianceResult[],
): number {
  return vehicleResults.filter((r) => r.status === "blocked").length;
}

export function getComplianceStatusCounts(
  results: EntityComplianceResult[],
): Record<ComplianceStatus, number> {
  const counts: Record<ComplianceStatus, number> = {
    compliant: 0,
    attention_needed: 0,
    non_compliant: 0,
    blocked: 0,
    unknown: 0,
  };
  for (const r of results) counts[r.status]++;
  return counts;
}

/** Days until expiration (negative = expired), null = no expiry. */
export function daysUntilExpiration(
  expiration_date: string | null,
  now: Date = new Date(),
): number | null {
  const t = parse(expiration_date);
  if (t == null) return null;
  return Math.round((t - now.getTime()) / DAY);
}
