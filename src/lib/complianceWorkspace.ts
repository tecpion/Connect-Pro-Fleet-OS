// Connect Pro Fleet — Compliance Workspace presentation helpers.
//
// Pure functions that turn the DERIVED compliance state (requirements +
// documents + overrides) into the transparent operational model the spec
// asks for: human-readable countdowns, explicit blocker labels, an
// explainable priority model, the recommended next action, per-entity
// summaries, and filter primitives. Nothing here changes authoritative
// compliance truth — blocking is still driven by the booleans on
// ComplianceRequirement + the evaluator in complianceStatus.ts. This module
// only shapes that truth for display.

import type {
  DocumentRecord,
  DocumentEntityType,
  DocumentType,
  ComplianceRequirement,
  ComplianceIssue,
  ComplianceIssueReason,
  ComplianceSeverity,
} from "./complianceTypes";
import { documentTypeLabel } from "./complianceTypes";
import type { EntityComplianceResult } from "./complianceStatus";

const DAY = 86_400_000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

// ---------------------------------------------------------------------------
// Expiration countdown (tenant-neutral; uses provided `now`)
// ---------------------------------------------------------------------------

/** Human-readable countdown relative to `now`.
 *  "Expires in 30 days" / "Expires tomorrow" / "Expires today" /
 *  "Expired 3 days ago" / "—" (no expiry). */
export function expirationCountdown(
  expirationDate: string | null,
  now: Date = new Date(),
): string {
  const t = parse(expirationDate);
  if (t == null) return "—";
  const days = Math.round((t - now.getTime()) / DAY);
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days === -1) return "Expired 1 day ago";
  if (days > 1) return `Expires in ${days} days`;
  if (days < -1) return `Expired ${Math.abs(days)} days ago`;
  // days < 0 handled above; defensive
  return `Expired ${Math.abs(days)} days ago`;
}

// ---------------------------------------------------------------------------
// Blocking behavior — explicit operational impact label
// ---------------------------------------------------------------------------

export type BlockBehavior =
  | "blocks_assignment"
  | "blocks_checkout"
  | "blocks_start"
  | "blocks_completion"
  | "blocks_return"
  | "warning_only"
  | "none";

export const BLOCK_BEHAVIOR_LABELS: Record<BlockBehavior, string> = {
  blocks_assignment: "Blocks Vehicle Assignment",
  blocks_checkout: "Blocks Checkout",
  blocks_start: "Blocks Rental Start",
  blocks_completion: "Blocks Completion",
  blocks_return: "Blocks Return Completion",
  warning_only: "Warning Only",
  none: "—",
};

export const BLOCK_BEHAVIOR_OPTIONS: { value: BlockBehavior; label: string }[] =
  [
    { value: "blocks_assignment", label: "Blocks Vehicle Assignment" },
    { value: "blocks_checkout", label: "Blocks Checkout" },
    { value: "blocks_start", label: "Blocks Rental Start" },
    { value: "blocks_completion", label: "Blocks Completion" },
    { value: "blocks_return", label: "Blocks Return Completion" },
    { value: "warning_only", label: "Warning Only" },
  ];

/** The default block behavior for an entity type when a requirement blocks. */
export function defaultBlockBehavior(
  entityType: DocumentEntityType,
): BlockBehavior {
  switch (entityType) {
    case "vehicle":
      return "blocks_assignment";
    case "customer":
      return "blocks_checkout";
    case "rental":
      return "blocks_start";
    case "company":
      return "warning_only";
  }
}

/** Resolve the effective block behavior, falling back to the entity default. */
export function effectiveBlockBehavior(
  req: ComplianceRequirement,
): BlockBehavior {
  const b = (req as ComplianceRequirement & { block_behavior?: BlockBehavior })
    .block_behavior;
  if (b) return b;
  // A non-blocking requirement is warning-only at most.
  if (!req.blocks_operation_if_missing && !req.blocks_operation_if_expired)
    return "warning_only";
  return defaultBlockBehavior(req.entity_type);
}

/** Labelled impact for a compliance issue (e.g. "Blocks Checkout"). */
export function blockLabelFor(
  req: ComplianceRequirement | undefined,
  blocking: boolean,
): string {
  if (!blocking || !req) return BLOCK_BEHAVIOR_LABELS.warning_only;
  return BLOCK_BEHAVIOR_LABELS[effectiveBlockBehavior(req)];
}

// ---------------------------------------------------------------------------
// Priority model — explainable, no opaque score
// ---------------------------------------------------------------------------

export type CompliancePriority =
  "critical" | "high" | "medium" | "informational";

export const PRIORITY_LABELS: Record<CompliancePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  informational: "Informational",
};

/** Derive an explainable priority from a reason + blocking flag + days to
 *  expiration. Mapping:
 *    blocked (missing/expired) → Critical
 *    expired (not blocking) → High
 *    missing required (not blocking) → High
 *    rejected → High
 *    expiring within 7 days → Medium
 *    expiring within window → Medium
 *    pending review → Informational
 *  No score is ever stored. */
export function priorityFor(
  issue: {
    reason: ComplianceIssueReason;
    blocking: boolean;
    expiration_date?: string | null;
  },
  now: Date = new Date(),
): CompliancePriority {
  if (issue.blocking) return "critical";
  switch (issue.reason) {
    case "expired":
    case "missing_required":
    case "failed_inspection":
      return "high";
    case "rejected":
      return "high";
    case "expiring_soon": {
      const days = parse(issue.expiration_date ?? null);
      if (days == null) return "medium";
      const d = Math.round((days - now.getTime()) / DAY);
      return d <= 7 ? "medium" : "medium";
    }
    case "pending_review":
    case "file_missing":
      return "informational";
    default:
      return "informational";
  }
}

export function priorityTone(
  p: CompliancePriority,
): "out" | "maintenance" | "neutral" {
  if (p === "critical") return "out";
  if (p === "high") return "out";
  if (p === "medium") return "maintenance";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Next action — the recommended operational step
// ---------------------------------------------------------------------------

export type NextAction =
  | "upload"
  | "upload_replacement"
  | "review"
  | "request_document"
  | "resolve"
  | "override";

export const NEXT_ACTION_LABELS: Record<NextAction, string> = {
  upload: "Upload",
  upload_replacement: "Upload Replacement",
  review: "Review",
  request_document: "Request Document",
  resolve: "Resolve",
  override: "Override",
};

export function nextActionFor(
  issue: { reason: ComplianceIssueReason; blocking: boolean },
  canOverride = false,
): NextAction {
  switch (issue.reason) {
    case "missing_required":
    case "file_missing":
      return "upload";
    case "expired":
    case "failed_inspection":
      return "upload_replacement";
    case "rejected":
      return "upload_replacement";
    case "expiring_soon":
      return canOverride ? "override" : "resolve";
    case "pending_review":
      return "review";
    default:
      return "resolve";
  }
}

// ---------------------------------------------------------------------------
// Composite compliance item (Needs Attention row model)
// ---------------------------------------------------------------------------

export interface ComplianceItem {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  document_type: DocumentType;
  document_id: string | null;
  reason: ComplianceIssueReason;
  severity: ComplianceSeverity;
  blocking: boolean;
  block_label: string;
  priority: CompliancePriority;
  expiration_date: string | null;
  countdown: string;
  next_action: NextAction;
  assigned_staff_id: string | null;
  overridden: boolean;
  requirement_id: string | null;
}

/** Build a Needs-Attention row model from a ComplianceIssue + context. */
export function toComplianceItem(
  issue: ComplianceIssue,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: {
    entity_type: DocumentEntityType;
    entity_id: string;
    document_type: DocumentType;
    active: boolean;
  }[],
  now: Date = new Date(),
): ComplianceItem {
  const req = reqs.find(
    (r) =>
      r.active &&
      r.entity_type === issue.entity_type &&
      r.document_type === issue.document_type,
  );
  const overridden = overrides.some(
    (o) =>
      o.active &&
      o.entity_type === issue.entity_type &&
      o.entity_id === issue.entity_id &&
      o.document_type === issue.document_type,
  );
  return {
    entity_type: issue.entity_type,
    entity_id: issue.entity_id,
    entity_label: issue.entity_label,
    document_type: issue.document_type,
    document_id: issue.document_id,
    reason: issue.reason,
    severity: issue.severity,
    blocking: issue.blocking,
    block_label: blockLabelFor(req, issue.blocking),
    priority: priorityFor(issue, now),
    expiration_date: issue.expiration_date,
    countdown: expirationCountdown(issue.expiration_date, now),
    next_action: nextActionFor(issue, !!req),
    assigned_staff_id:
      docs.find((d) => d.id === issue.document_id)?.assigned_staff_id ?? null,
    overridden,
    requirement_id: req?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Per-entity compliance summary (no opaque health score)
// ---------------------------------------------------------------------------

export interface EntityComplianceSummary {
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  required: number;
  valid: number;
  expired: number;
  missing: number;
  expiring: number;
  status: EntityComplianceResult["status"];
  status_reasons: string[];
}

export function entityComplianceSummary(
  entityType: DocumentEntityType,
  entityId: string,
  entityLabel: string,
  result: EntityComplianceResult,
): EntityComplianceSummary {
  let required = 0;
  let valid = 0;
  let expired = 0;
  let missing = 0;
  let expiring = 0;
  for (const issue of result.issues) {
    if (issue.reason === "expired") expired++;
    else if (issue.reason === "missing_required") missing++;
    else if (issue.reason === "expiring_soon") expiring++;
  }
  // required = issues that are not satisfied + satisfied requirements.
  // We don't have evaluations on the trimmed EntityComplianceResult here, so
  // approximate required from issues + valid (no issues = valid). This keeps
  // the summary explainable without exposing the full evaluation set.
  required = result.issues.length;
  valid = Math.max(
    0,
    required -
      expired -
      missing -
      expiring -
      result.issues.filter(
        (i) => i.reason === "rejected" || i.reason === "pending_review",
      ).length,
  );
  return {
    entity_type: entityType,
    entity_id: entityId,
    entity_label: entityLabel,
    required,
    valid,
    expired,
    missing,
    expiring,
    status: result.status,
    status_reasons: result.blockingReasons,
  };
}

/** Short summary line, e.g. "3 required · 2 valid · 1 expired · Blocked". */
export function summaryLine(s: EntityComplianceSummary): string {
  const parts = [`${s.required} required`, `${s.valid} valid`];
  if (s.expired) parts.push(`${s.expired} expired`);
  if (s.missing) parts.push(`${s.missing} missing`);
  if (s.expiring) parts.push(`${s.expiring} expiring`);
  return `${parts.join(" · ")} · ${s.status.replace(/_/g, " ")}`;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type EntityTypeFilter =
  "all" | "vehicle" | "customer" | "rental" | "company";

export type StatusFilter =
  | "all"
  | "expired"
  | "expiring"
  | "missing"
  | "pending_review"
  | "rejected"
  | "blocked";

export type PriorityFilter = "all" | CompliancePriority;

export interface ComplianceFilters {
  entityType: EntityTypeFilter;
  status: StatusFilter;
  priority: PriorityFilter;
  blocking: "all" | "blocking" | "warning";
  assignedStaffId: "all" | "unassigned" | string;
  search: string;
}

export const DEFAULT_FILTERS: ComplianceFilters = {
  entityType: "all",
  status: "all",
  priority: "all",
  blocking: "all",
  assignedStaffId: "all",
  search: "",
};

export function applyComplianceFilters(
  items: ComplianceItem[],
  filters: ComplianceFilters,
): ComplianceItem[] {
  let out = items;
  if (filters.entityType !== "all")
    out = out.filter((i) => i.entity_type === filters.entityType);
  if (filters.status !== "all") {
    out = out.filter((i) => {
      switch (filters.status) {
        case "expired":
          return i.reason === "expired";
        case "expiring":
          return i.reason === "expiring_soon";
        case "missing":
          return i.reason === "missing_required" || i.reason === "file_missing";
        case "pending_review":
          return i.reason === "pending_review";
        case "rejected":
          return i.reason === "rejected";
        case "blocked":
          return i.blocking;
        default:
          return true;
      }
    });
  }
  if (filters.priority !== "all")
    out = out.filter((i) => i.priority === filters.priority);
  if (filters.blocking === "blocking") out = out.filter((i) => i.blocking);
  else if (filters.blocking === "warning") out = out.filter((i) => !i.blocking);
  if (filters.assignedStaffId === "unassigned")
    out = out.filter((i) => !i.assigned_staff_id);
  else if (filters.assignedStaffId !== "all")
    out = out.filter((i) => i.assigned_staff_id === filters.assignedStaffId);
  if (filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    out = out.filter(
      (i) =>
        i.entity_label?.toLowerCase().includes(q) ||
        documentTypeLabel(i.document_type).toLowerCase().includes(q) ||
        i.block_label.toLowerCase().includes(q),
    );
  }
  return out;
}

const PRIORITY_ORDER: Record<CompliancePriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  informational: 3,
};

/** Sort items by priority, then blocking, then soonest expiration. */
export function sortComplianceItems(items: ComplianceItem[]): ComplianceItem[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    if (!a.expiration_date && !b.expiration_date) return 0;
    if (!a.expiration_date) return 1;
    if (!b.expiration_date) return -1;
    return a.expiration_date < b.expiration_date ? -1 : 1;
  });
}
