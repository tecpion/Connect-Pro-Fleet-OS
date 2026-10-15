// Connect Pro Fleet — compliance aggregation selectors (Build #26).
//
// Pure functions over the ComplianceStore arrays to derive the Needs Attention
// queue, dashboard counts, and entity-level summaries. Compliance truth is
// DERIVED — nothing here stores a boolean that can drift. Date handling is
// safe (missing/malformed never crashes). Financial values are never touched
// here; a DocumentRecord is descriptive evidence only.

import type {
  DocumentRecord,
  DocumentEntityType,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceIssue,
  ComplianceSeverity,
} from "./complianceTypes";
import {
  getEntityComplianceStatus,
  severityFor,
  type EntityComplianceResult,
} from "./complianceStatus";
import { expirationState } from "./complianceSelectors";

/** Needs-attention queue item with urgency ordering. */
export interface NeedsAttentionItem {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_type: DocumentRecord["document_type"];
  document_id: string | null;
  reason: string;
  severity: ComplianceSeverity;
  blocking: boolean;
  expiration_date: string | null;
  assigned_staff_id: string | null;
}

const SEVERITY_ORDER: Record<ComplianceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  normal: 3,
};

/** Build the Needs Attention queue from every entity with a compliance issue. */
export function getNeedsAttention(
  entities: Array<{
    type: DocumentEntityType;
    id: string;
    label: string;
  }>,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  for (const e of entities) {
    const res = getEntityComplianceStatus(
      e.type,
      e.id,
      e.label,
      reqs,
      docs,
      overrides,
      now,
      warningDays,
    );
    for (const issue of res.issues) {
      const doc = issue.document_id
        ? docs.find((d) => d.id === issue.document_id)
        : undefined;
      items.push({
        entity_type: issue.entity_type,
        entity_id: issue.entity_id,
        entity_label: issue.entity_label,
        document_type: issue.document_type,
        document_id: issue.document_id,
        reason: issue.reason,
        severity: issue.severity,
        blocking: issue.blocking,
        expiration_date: issue.expiration_date,
        assigned_staff_id: doc?.assigned_staff_id ?? null,
      });
    }
  }
  return items.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.blocking ? 1 : 0) - (a.blocking ? 1 : 0),
  );
}

/** Dashboard summary counts derived from the full document + requirement set. */
export interface ComplianceDashboard {
  blockedVehicles: number;
  expired: number;
  expiringSoon: number;
  missingRequired: number;
  pendingReview: number;
}

export function getComplianceDashboard(
  entities: Array<{
    type: DocumentEntityType;
    id: string;
    label: string;
  }>,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): ComplianceDashboard {
  let blockedVehicles = 0;
  let expired = 0;
  let expiringSoon = 0;
  let missingRequired = 0;
  let pendingReview = 0;

  for (const e of entities) {
    if (e.type !== "vehicle") {
      // Still count document-level states below; blocking is vehicle-only.
    }
    const res: EntityComplianceResult = getEntityComplianceStatus(
      e.type,
      e.id,
      e.label,
      reqs,
      docs,
      overrides,
      now,
      warningDays,
    );
    if (e.type === "vehicle" && res.status === "blocked") blockedVehicles++;
    for (const issue of res.issues) {
      if (issue.reason === "expired") expired++;
      else if (issue.reason === "expiring_soon") expiringSoon++;
      else if (issue.reason === "missing_required") missingRequired++;
      else if (issue.reason === "pending_review") pendingReview++;
    }
  }
  return {
    blockedVehicles,
    expired,
    expiringSoon,
    missingRequired,
    pendingReview,
  };
}

/** Count of documents per status (for reports / dashboard tiles). */
export function getDocumentStatusCounts(
  docs: DocumentRecord[],
  now: Date = new Date(),
  warningDays = 30,
) {
  const counts = {
    total: docs.filter((d) => d.archived_at == null).length,
    verified: 0,
    pending_review: 0,
    rejected: 0,
    expired: 0,
    expiring_soon: 0,
    missing: 0,
  };
  for (const d of docs) {
    if (d.archived_at != null) continue;
    if (d.verification_status === "verified") counts.verified++;
    else if (d.verification_status === "pending") counts.pending_review++;
    else if (d.verification_status === "rejected") counts.rejected++;
    const exp = expirationState(d, now, warningDays);
    if (exp === "expired") counts.expired++;
    else if (exp === "expiring_soon") counts.expiring_soon++;
    if (!d.file_reference && d.status === "missing") counts.missing++;
  }
  return counts;
}

/** Compliance report summary (derived). Sensitive document numbers are never
 *  included — callers mask via safeDocumentNumber when displaying. */
export interface ComplianceReportSummary {
  totalRequired: number;
  compliant: number;
  missing: number;
  expired: number;
  expiringSoon: number;
  pendingReview: number;
  blockedVehicles: number;
}

export function getComplianceReportSummary(
  entities: Array<{
    type: DocumentEntityType;
    id: string;
    label: string;
  }>,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): ComplianceReportSummary {
  const activeReqs = reqs.filter((r) => r.active && r.required);
  let compliant = 0;
  let missing = 0;
  let expired = 0;
  let expiringSoon = 0;
  let pendingReview = 0;
  let blockedVehicles = 0;
  for (const e of entities) {
    const res = getEntityComplianceStatus(
      e.type,
      e.id,
      e.label,
      reqs,
      docs,
      overrides,
      now,
      warningDays,
    );
    if (e.type === "vehicle" && res.status === "blocked") blockedVehicles++;
    for (const ev of res.evaluations) {
      if (!activeReqs.some((r) => r.id === ev.requirement.id)) continue;
      if (ev.satisfied) compliant++;
      else if (ev.reason === "missing_required") missing++;
      else if (ev.reason === "expired") expired++;
      else if (ev.reason === "expiring_soon") expiringSoon++;
      else if (ev.reason === "pending_review") pendingReview++;
    }
  }
  return {
    totalRequired: activeReqs.length * entities.length,
    compliant,
    missing,
    expired,
    expiringSoon,
    pendingReview,
    blockedVehicles,
  };
}

export { severityFor };
