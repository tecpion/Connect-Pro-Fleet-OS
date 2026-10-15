// Connect Pro Fleet — compliance requirement evaluation + entity status
// (Build #26). Compliance is DERIVED: requirement + document + verification
// determine status — we never store a boolean that can drift. Overrides
// satisfy a requirement operationally (no block) but the underlying issue
// still surfaces in Needs Attention at lower severity.

import type {
  DocumentRecord,
  DocumentType,
  DocumentEntityType,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceStatus,
  ComplianceIssue,
  ComplianceIssueReason,
  ComplianceSeverity,
} from "./complianceTypes";
import { expirationState } from "./complianceSelectors";

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

export function severityFor(reason: ComplianceIssueReason): ComplianceSeverity {
  switch (reason) {
    case "expired":
    case "missing_required":
    case "failed_inspection":
      return "critical";
    case "rejected":
      return "high";
    case "expiring_soon":
      return "medium";
    case "pending_review":
    case "file_missing":
      return "normal";
  }
}

/** Active requirements for an entity type (optionally a specific doc type). */
export function requirementsFor(
  reqs: ComplianceRequirement[],
  entityType: DocumentEntityType,
  documentType?: DocumentType,
): ComplianceRequirement[] {
  return reqs.filter(
    (r) =>
      r.active &&
      r.entity_type === entityType &&
      (documentType == null || r.document_type === documentType),
  );
}

/** An active override for an entity+document type (not expired). */
export function activeOverrideFor(
  overrides: ComplianceOverride[],
  entityType: DocumentEntityType,
  entityId: string,
  documentType: DocumentType,
  now: Date = new Date(),
): ComplianceOverride | undefined {
  return overrides.find(
    (o) =>
      o.active &&
      o.entity_type === entityType &&
      o.entity_id === entityId &&
      o.document_type === documentType &&
      (o.expires_at == null || parse(o.expires_at)! > now.getTime()),
  );
}

export interface RequirementEvaluation {
  requirement: ComplianceRequirement;
  document: DocumentRecord | undefined;
  satisfied: boolean;
  blocking: boolean;
  reason: ComplianceIssueReason | null;
  severity: ComplianceSeverity | null;
  overridden: boolean;
}

/** Evaluate a single requirement against the current document + overrides. */
export function evaluateRequirement(
  req: ComplianceRequirement,
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): RequirementEvaluation {
  const scoped = docs.filter(
    (d) =>
      d.entity_type === req.entity_type &&
      d.document_type === req.document_type,
  );
  const current = scoped
    .filter((d) => d.archived_at == null && d.superseded_by_document_id == null)
    .sort((a, b) =>
      (b.uploaded_at ?? b.created_at).localeCompare(
        a.uploaded_at ?? a.created_at,
      ),
    )[0];

  const override = overrides.find(
    (o) =>
      o.active &&
      o.entity_type === req.entity_type &&
      o.document_type === req.document_type &&
      (o.expires_at == null || parse(o.expires_at)! > now.getTime()),
  );

  let reason: ComplianceIssueReason | null = null;
  let satisfied = false;

  if (!current) {
    // An absent OPTIONAL document is not a compliance issue (spec §11). Only a
    // required document surfaces "missing_required".
    reason = req.required ? "missing_required" : null;
    if (!req.required) satisfied = true;
  } else if (current.verification_status === "rejected") {
    reason = "rejected";
  } else if (
    req.requires_verification &&
    current.verification_status !== "verified"
  ) {
    reason = "pending_review";
  } else {
    const exp = expirationState(current, now, warningDays);
    if (exp === "expired") reason = "expired";
    else if (exp === "expiring_soon") reason = "expiring_soon";
    else if (!current.file_reference && current.status === "missing")
      reason = "file_missing";
    else satisfied = true;
  }

  const overridden = !!override;
  const blocking =
    !overridden &&
    ((reason === "missing_required" && req.blocks_operation_if_missing) ||
      ((reason === "expired" || reason === "failed_inspection") &&
        req.blocks_operation_if_expired));

  return {
    requirement: req,
    document: current,
    satisfied: overridden || satisfied,
    blocking,
    reason: satisfied ? null : reason,
    severity: satisfied ? null : severityFor(reason ?? "missing_required"),
    overridden,
  };
}

export interface EntityComplianceResult {
  status: ComplianceStatus;
  issues: ComplianceIssue[];
  blockingReasons: string[];
  evaluations: RequirementEvaluation[];
}

/** Evaluate all requirements for a single entity. */
export function getEntityComplianceStatus(
  entityType: DocumentEntityType,
  entityId: string,
  entityLabel: string,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): EntityComplianceResult {
  const entityReqs = reqs.filter(
    (r) => r.active && r.entity_type === entityType,
  );
  const entityDocs = docs.filter(
    (d) => d.entity_type === entityType && d.entity_id === entityId,
  );
  const entityOverrides = overrides.filter(
    (o) => o.active && o.entity_type === entityType && o.entity_id === entityId,
  );

  const evaluations: RequirementEvaluation[] = [];
  const issues: ComplianceIssue[] = [];
  const blockingReasons: string[] = [];

  for (const req of entityReqs) {
    const ev = evaluateRequirement(
      req,
      entityDocs,
      entityOverrides,
      now,
      warningDays,
    );
    evaluations.push(ev);
    if (!ev.satisfied && ev.reason) {
      issues.push({
        entity_type: entityType,
        entity_id: entityId,
        entity_label: entityLabel,
        document_type: req.document_type,
        document_id: ev.document?.id ?? null,
        reason: ev.reason,
        severity: ev.severity ?? "normal",
        blocking: ev.blocking,
        expiration_date: ev.document?.expiration_date ?? null,
      });
      if (ev.blocking)
        blockingReasons.push(
          `${req.document_type} — ${ev.reason.replace(/_/g, " ")}`,
        );
    }
  }

  let status: ComplianceStatus = "compliant";
  if (blockingReasons.length > 0) status = "blocked";
  else if (
    issues.some((i) => i.severity === "critical" || i.severity === "high")
  )
    status = "non_compliant";
  else if (issues.length > 0) status = "attention_needed";

  return { status, issues, blockingReasons, evaluations };
}

export function getVehicleComplianceStatus(
  vehicleId: string,
  vehicleLabel: string,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now?: Date,
  warningDays?: number,
): EntityComplianceResult {
  return getEntityComplianceStatus(
    "vehicle",
    vehicleId,
    vehicleLabel,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );
}

/** Blocking compliance reasons for a vehicle (empty = not blocked). */
export function getVehicleComplianceBlockingReasons(
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  vehicleId: string,
  vehicleLabel = "Vehicle",
  now: Date = new Date(),
  warningDays = 30,
): string[] {
  return getEntityComplianceStatus(
    "vehicle",
    vehicleId,
    vehicleLabel,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  ).blockingReasons;
}

export function getCustomerComplianceStatus(
  customerId: string,
  customerLabel: string,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now?: Date,
  warningDays?: number,
): EntityComplianceResult {
  return getEntityComplianceStatus(
    "customer",
    customerId,
    customerLabel,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );
}

export function getRentalComplianceStatus(
  rentalId: string,
  rentalLabel: string,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now?: Date,
  warningDays?: number,
): EntityComplianceResult {
  return getEntityComplianceStatus(
    "rental",
    rentalId,
    rentalLabel,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );
}
