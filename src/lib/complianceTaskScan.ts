// Connect Pro Fleet — compliance → task/notification scan (Build #26).
//
// Pure pass that bridges the DERIVED compliance state to the existing Build #11
// Task system and Build #12 Notification system. It does NOT own a separate
// compliance-task engine — it reuses ensureSystemTask / resolveSystemTasksForEntity
// and notify() so dedupe keys, audit events, and suppression are centralized.
//
// Idempotency contract:
//   - Each (entity + document_type + reason) maps to ONE stable TaskSourceEvent +
//     occurrence key, so a repeated scan never creates a duplicate open task.
//   - When an issue clears (document uploaded+verified, override added, …) the
//     matching open system task is resolved (marked completed by SYSTEM) — never
//     re-created.
//   - Notifications use the same occurrence key so the same condition never
//     notifies twice per window. Runtime task-coverage suppression (Build #12)
//     avoids a duplicate direct notification when the task assignment already
//     alerted the responsible person.
//
// Gating: task generation is gated by the company CompliancePolicyConfig flag
// `auto_create_review_task`. When false, NO compliance review task is created
// (and the matching compliance notification is suppressed by task-coverage only
// if a task existed — which it won't, so the notification still fires once).
// Notifications are NOT gated by that flag: expiring/expired/blocking awareness
// is always surfaced to managers (internal only; no customer SMS/email).

import type {
  DocumentRecord,
  DocumentEntityType,
  DocumentType,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceIssue,
  ComplianceIssueReason,
} from "./complianceTypes";
import { getEntityComplianceStatus } from "./complianceStatus";
import type { TaskSourceEvent } from "./taskTypes";
import type { Task } from "./taskTypes";
import type { NotificationType } from "./notificationTypes";
import { isTaskActive } from "./taskSelectors";

/** An entity to evaluate (vehicle / customer / rental / company). */
export interface ComplianceScanEntity {
  type: DocumentEntityType;
  id: string;
  label: string;
}

/** Maps a compliance issue reason to the TaskSourceEvent that covers it. */
export function taskSourceForReason(
  reason: ComplianceIssueReason,
): TaskSourceEvent {
  switch (reason) {
    case "missing_required":
      return "compliance.missing_required";
    case "expired":
      return "compliance.expired";
    case "expiring_soon":
      return "compliance.expiring_soon";
    case "rejected":
      return "compliance.rejected";
    case "pending_review":
      return "compliance.pending_review";
    case "failed_inspection":
      return "compliance.expired";
    case "file_missing":
      return "compliance.missing_required";
  }
}

/** Maps a compliance issue to the awareness NotificationType. A BLOCKING issue
 *  always surfaces as `compliance.blocking` (urgent) regardless of underlying
 *  reason — the operational block is the actionable signal. Non-blocking
 *  expired/expiring issues use their own awareness type. */
export function notificationTypeForIssue(
  issue: ComplianceIssue,
): NotificationType {
  if (issue.blocking) return "compliance.blocking";
  switch (issue.reason) {
    case "expired":
    case "failed_inspection":
      return "compliance.expired";
    case "expiring_soon":
      return "compliance.expiring_soon";
    default:
      return "compliance.blocking";
  }
}

/** Maps a compliance issue reason to the awareness NotificationType (non-blocking
 *  semantics). Kept for backwards-compatible callers; prefer
 *  notificationTypeForIssue which respects the blocking flag. */
export function notificationTypeForReason(
  reason: ComplianceIssueReason,
): NotificationType {
  switch (reason) {
    case "expired":
    case "failed_inspection":
      return "compliance.expired";
    case "expiring_soon":
      return "compliance.expiring_soon";
    default:
      return "compliance.blocking";
  }
}

/** Stable occurrence key for a compliance issue. The occurrence captures the
 *  expiration date (or "1" when none) so a renewed document with a new
 *  expiration is a genuinely new occurrence — but the same unresolved issue
 *  re-evaluated 10 times yields the same key (no duplicate task). */
export function complianceOccurrence(issue: ComplianceIssue): string {
  return issue.expiration_date ?? "1";
}

/** The set of TaskSourceEvents this scan owns (used to resolve stale tasks). */
export const COMPLIANCE_TASK_EVENTS: TaskSourceEvent[] = [
  "compliance.missing_required",
  "compliance.expired",
  "compliance.expiring_soon",
  "compliance.rejected",
  "compliance.pending_review",
];

export interface ComplianceTaskDeps {
  /** Ensure a system task exists (idempotent by dedupe key). */
  ensureSystemTask: (input: {
    sourceEvent: TaskSourceEvent;
    entityType: import("./taskTypes").TaskEntityType;
    entityId: string;
    entityLabel: string;
    title: string;
    description?: string | null;
    category: import("./taskTypes").TaskCategory;
    priority?: import("./taskTypes").TaskPriority;
    occurrence?: string;
    assignedToUserId?: string | null;
    dueDate?: string | null;
  }) => { created: boolean; taskId: string };
  /** Resolve (complete) open system tasks for an entity + source event. */
  resolveSystemTasksForEntity: (
    sourceEvent: string,
    entityType: string | null,
    entityId: string | null,
    reason: string,
  ) => number;
  /** All current tasks (to detect which compliance issues are already open). */
  tasks: Task[];
}

export interface ComplianceNotifyDeps {
  notify: (input: {
    recipientUserId: string;
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    entityLabel?: string | null;
    actionUrl?: string | null;
    sourceEventId?: string | null;
    occurrence?: string;
    actorUserId?: string | null;
    priority?: import("./notificationTypes").NotificationPriority;
    metadata?: Record<string, unknown> | null;
  }) => string | null;
  /** Manager staff ids (owner/manager) — compliance notifications are internal
   *  awareness only and target managers (no customer SMS/email). */
  managerUserIds: string[];
  /** Optional default compliance owner (from company policy). When set, the
   *  task is assigned to this person and they receive the awareness alert. */
  defaultComplianceOwnerId: string | null;
}

/** Derive the current set of compliance issues across the given entities. */
export function deriveComplianceIssues(
  entities: ComplianceScanEntity[],
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): Array<{ entity: ComplianceScanEntity; issue: ComplianceIssue }> {
  const out: Array<{ entity: ComplianceScanEntity; issue: ComplianceIssue }> =
    [];
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
      out.push({ entity: e, issue });
    }
  }
  return out;
}

/** Title for a compliance review task. */
function taskTitle(issue: ComplianceIssue, entityLabel: string): string {
  const docLabel = issue.document_type.replace(/_/g, " ");
  switch (issue.reason) {
    case "missing_required":
      return `Upload ${docLabel} — ${entityLabel}`;
    case "expired":
    case "failed_inspection":
      return `Renew ${docLabel} — ${entityLabel}`;
    case "expiring_soon":
      return `Review expiring ${docLabel} — ${entityLabel}`;
    case "rejected":
      return `Replace rejected ${docLabel} — ${entityLabel}`;
    case "pending_review":
      return `Review ${docLabel} — ${entityLabel}`;
    case "file_missing":
      return `Upload ${docLabel} file — ${entityLabel}`;
  }
}

function taskDescription(issue: ComplianceIssue): string {
  const docLabel = issue.document_type.replace(/_/g, " ");
  if (issue.expiration_date) {
    return `${docLabel} — ${issue.reason.replace(/_/g, " ")}. Expires ${issue.expiration_date}.`;
  }
  return `${docLabel} — ${issue.reason.replace(/_/g, " ")}.`;
}

/** Map a compliance entity type to a TaskEntityType. Company documents have no
 *  matching TaskEntityType (they're not operational rental-blocking records), so
 *  they return null and are skipped for task generation (notifications still
 *  fire). */
function taskEntityType(
  t: DocumentEntityType,
): import("./taskTypes").TaskEntityType | null {
  switch (t) {
    case "vehicle":
      return "vehicle";
    case "customer":
      return "customer";
    case "rental":
      return "rental";
    default:
      return null;
  }
}

function taskPriority(
  issue: ComplianceIssue,
): import("./taskTypes").TaskPriority {
  if (issue.blocking) return "urgent";
  switch (issue.severity) {
    case "critical":
      return "high";
    case "high":
      return "high";
    case "medium":
      return "normal";
    default:
      return "normal";
  }
}

/** Run the compliance → task pass. Creates one task per open issue (idempotent)
 *  and resolves tasks whose underlying issue has cleared. Returns counts.
 *
 *  Gated by `autoCreateReviewTask`: when false, no tasks are created or
 *  resolved by this pass (the flag is the single switch for task generation). */
export function generateComplianceTasksPass(
  entities: ComplianceScanEntity[],
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  deps: ComplianceTaskDeps,
  opts: {
    autoCreateReviewTask: boolean;
    now?: Date;
    warningDays?: number;
    defaultComplianceOwnerId?: string | null;
  },
): { created: number; resolved: number } {
  if (!opts.autoCreateReviewTask) return { created: 0, resolved: 0 };
  const now = opts.now ?? new Date();
  const warningDays = opts.warningDays ?? 30;
  const defaultOwner = opts.defaultComplianceOwnerId ?? null;

  const issues = deriveComplianceIssues(
    entities,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );

  // Build the set of (entityId + sourceEvent + occurrence) that are CURRENTLY
  // open issues, so we can resolve tasks whose issue cleared.
  const openKeys = new Set(
    issues.map((i) =>
      key(
        i.entity.id,
        taskSourceForReason(i.issue.reason),
        complianceOccurrence(i.issue),
      ),
    ),
  );

  let created = 0;
  let resolved = 0;

  // Ensure a task for each open issue. Company documents have no matching
  // TaskEntityType and are skipped (notifications still surface them).
  for (const { entity, issue } of issues) {
    const sourceEvent = taskSourceForReason(issue.reason);
    const occurrence = complianceOccurrence(issue);
    const entityType = taskEntityType(entity.type);
    if (entityType == null) continue;
    const res = deps.ensureSystemTask({
      sourceEvent,
      entityType,
      entityId: entity.id,
      entityLabel: entity.label,
      title: taskTitle(issue, entity.label),
      description: taskDescription(issue),
      category: "document",
      priority: taskPriority(issue),
      occurrence,
      assignedToUserId: defaultOwner,
    });
    if (res.created) created++;
  }

  // Resolve stale compliance tasks: any active compliance system task whose
  // (entityId + sourceEvent + occurrence) is no longer an open issue.
  for (const t of deps.tasks) {
    if (t.source_type !== "system") continue;
    if (!isTaskActive(t)) continue;
    if (!COMPLIANCE_TASK_EVENTS.includes(t.source_event as TaskSourceEvent))
      continue;
    const occ = t.dedupe_key
      ? (t.dedupe_key.split(":").slice(-1)[0] ?? "1")
      : "1";
    const entityId = t.entity_id;
    const sourceEvent = t.source_event;
    const entityType = t.entity_type;
    if (!entityId || !sourceEvent || !entityType) continue;
    const k = key(entityId, sourceEvent, occ);
    if (!openKeys.has(k)) {
      resolved += deps.resolveSystemTasksForEntity(
        sourceEvent,
        entityType,
        entityId,
        "Compliance issue resolved",
      );
    }
  }

  return { created, resolved };
}

/** Run the compliance → notification pass. Surfaces expiring-soon / expired /
 *  blocking awareness to managers (and the default compliance owner when set).
 *  Idempotent via the notification dedupe key (recipient + type + occurrence).
 *  Runtime task-coverage suppression avoids a duplicate when the task
 *  assignment already alerted the same person. */
export function generateComplianceNotificationsPass(
  entities: ComplianceScanEntity[],
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  deps: ComplianceNotifyDeps,
  opts: { now?: Date; warningDays?: number } = {},
): { created: number } {
  const now = opts.now ?? new Date();
  const warningDays = opts.warningDays ?? 30;
  let created = 0;

  const issues = deriveComplianceIssues(
    entities,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );

  const recipients = new Set<string>(deps.managerUserIds);
  if (deps.defaultComplianceOwnerId) {
    recipients.add(deps.defaultComplianceOwnerId);
  }
  if (recipients.size === 0) return { created: 0 };

  for (const { entity, issue } of issues) {
    const type = notificationTypeForIssue(issue);
    const occurrence = complianceOccurrence(issue);
    const docLabel = issue.document_type.replace(/_/g, " ");
    const priority: import("./notificationTypes").NotificationPriority =
      issue.blocking
        ? "urgent"
        : issue.reason === "expired"
          ? "high"
          : "normal";
    const title = issue.blocking
      ? `Compliance block: ${docLabel} — ${entity.label}`
      : issue.reason === "expired"
        ? `Compliance expired: ${docLabel} — ${entity.label}`
        : `Compliance expiring soon: ${docLabel} — ${entity.label}`;
    const message = issue.expiration_date
      ? `${docLabel} for ${entity.label} — ${issue.reason.replace(/_/g, " ")}. Expires ${issue.expiration_date}.`
      : `${docLabel} for ${entity.label} — ${issue.reason.replace(/_/g, " ")}.`;

    for (const r of recipients) {
      const id = deps.notify({
        recipientUserId: r,
        type,
        title,
        message,
        entityType: entity.type,
        entityId: entity.id,
        entityLabel: entity.label,
        actionUrl: `/compliance?entity=${entity.id}`,
        sourceEventId: entity.id,
        occurrence,
        actorUserId: null,
        priority,
        metadata: {
          document_type: issue.document_type,
          reason: issue.reason,
          blocking: issue.blocking,
        },
      });
      if (id) created++;
    }
  }

  return { created };
}

function key(
  entityId: string,
  sourceEvent: string,
  occurrence: string,
): string {
  return `${entityId}:${sourceEvent}:${occurrence}`;
}
