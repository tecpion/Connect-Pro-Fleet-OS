// Connect Pro Fleet — compliance/task/assignment/note timeline normalizers
// (Build #27).
//
// Compliance document events are marked sensitive so the UI can gate raw file
// access behind documents.view_sensitive. The raw document number is masked
// (••••1234) in metadata — never placed raw. Tasks reuse the existing TaskEvent
// log when present; otherwise a created/completed event is derived from the
// Task record. Assignments + notes are simple single-event normalizers.

import type { DocumentRecord, ComplianceEvent } from "./complianceTypes";
import type { Task, TaskEvent } from "./taskTypes";
import type { OperationalStaffAssignment } from "./staffTypes";
import type { CustomerNote } from "./customerNoteTypes";
import type { UnifiedTimelineEvent } from "./timelineTypes";
import { timelineId, maskForTimeline } from "./timelineShared";

/** Compliance document lifecycle events (uploaded, verified, rejected,
 *  superseded, archived). Sensitive: raw document number masked in metadata. */
export function complianceTimelineEvents(
  doc: DocumentRecord,
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: doc.entity_type,
    entity_id: doc.entity_id,
    related_entity_type: null as string | null,
    related_entity_id: null as string | null,
    source_module: "compliance",
    actor_id: doc.uploaded_by,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "info" as const,
    status: doc.verification_status,
    deep_link: "/compliance",
    sensitive: true,
    customer_id: doc.entity_type === "customer" ? doc.entity_id : null,
    vehicle_id: doc.entity_type === "vehicle" ? doc.entity_id : null,
    rental_id: doc.entity_type === "rental" ? doc.entity_id : null,
    metadata: {
      document_type: doc.document_type,
      masked_number: maskForTimeline(doc.document_number),
    },
  };

  if (doc.uploaded_at) {
    events.push({
      ...base,
      id: timelineId("compliance", doc.id, "uploaded"),
      occurred_at: doc.uploaded_at,
      event_type: "document_uploaded",
      category: "document",
      title: `${doc.document_type} uploaded`,
      description: doc.entity_label,
    });
  }

  if (doc.verification_status === "verified" && doc.reviewed_at) {
    events.push({
      ...base,
      id: timelineId("compliance", doc.id, "verified"),
      occurred_at: doc.reviewed_at,
      event_type: "document_verified",
      category: "document",
      title: `${doc.document_type} verified`,
      description: null,
      severity: "success",
    });
  }

  if (doc.verification_status === "rejected" && doc.reviewed_at) {
    events.push({
      ...base,
      id: timelineId("compliance", doc.id, "rejected"),
      occurred_at: doc.reviewed_at,
      event_type: "document_rejected",
      category: "document",
      title: `${doc.document_type} rejected`,
      description: doc.rejected_reason,
      severity: "warning",
    });
  }

  if (doc.superseded_by_document_id) {
    events.push({
      ...base,
      id: timelineId("compliance", doc.id, "superseded"),
      occurred_at: doc.updated_at,
      event_type: "document_superseded",
      category: "document",
      title: `${doc.document_type} superseded`,
      description: `Replaced by ${doc.superseded_by_document_id}`,
      severity: "info",
    });
  }

  if (doc.archived_at) {
    events.push({
      ...base,
      id: timelineId("compliance", doc.id, "archived"),
      occurred_at: doc.archived_at,
      event_type: "document_archived",
      category: "document",
      title: `${doc.document_type} archived`,
      description: null,
      severity: "info",
    });
  }

  return events;
}

/** Compliance event-log entries (override_added, note_added, etc.). */
export function complianceEventTimeline(
  ev: ComplianceEvent,
  doc: DocumentRecord | undefined,
): UnifiedTimelineEvent {
  return {
    id: timelineId("compliance_events", ev.id, ev.type),
    occurred_at: ev.at,
    event_type: `compliance_${ev.type}`,
    category: "compliance",
    title: ev.label,
    description: null,
    entity_type: doc?.entity_type ?? "company",
    entity_id: doc?.entity_id ?? ev.document_id ?? "",
    related_entity_type: null,
    related_entity_id: null,
    source_module: "compliance",
    actor_id: ev.actor_id,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "info",
    status: null,
    deep_link: "/compliance",
    metadata: ev.meta,
    sensitive: true,
    customer_id: doc?.entity_type === "customer" ? doc.entity_id : null,
    vehicle_id: doc?.entity_type === "vehicle" ? doc.entity_id : null,
    rental_id: doc?.entity_type === "rental" ? doc.entity_id : null,
  };
}

/** Task timeline events. Prefers the TaskEvent log; falls back to a
 *  created/completed event derived from the Task record. */
export function taskTimelineEvents(
  task: Task,
  taskEvents: TaskEvent[],
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const linked = taskEvents.filter((e) => e.task_id === task.id);
  const base = {
    entity_type: task.entity_type ?? "general",
    entity_id: task.entity_id ?? task.id,
    related_entity_type: null as string | null,
    related_entity_id: null as string | null,
    source_module: "tasks",
    actor_id: task.created_by_user_id,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "info" as const,
    status: task.status,
    deep_link: "/tasks",
    sensitive: false,
    customer_id: task.entity_type === "customer" ? task.entity_id : null,
    vehicle_id: task.entity_type === "vehicle" ? task.entity_id : null,
    rental_id: task.entity_type === "rental" ? task.entity_id : null,
    metadata: null,
  };

  if (linked.length > 0) {
    for (const ev of linked) {
      events.push({
        ...base,
        id: timelineId("task_events", ev.id, ev.type),
        occurred_at: ev.at,
        event_type: `task_${ev.type}`,
        category: "task",
        title: ev.label,
        description: null,
        actor_id: ev.actor_is_system ? null : ev.actor_id,
      });
    }
  } else {
    events.push({
      ...base,
      id: timelineId("tasks", task.id, "created"),
      occurred_at: task.created_at,
      event_type: "task_created",
      category: "task",
      title: task.title,
      description: task.description,
    });
    if (task.completed_at) {
      events.push({
        ...base,
        id: timelineId("tasks", task.id, "completed"),
        occurred_at: task.completed_at,
        event_type: "task_completed",
        category: "task",
        title: `Completed: ${task.title}`,
        description: null,
        severity: "success",
      });
    }
  }

  return events;
}

/** Staff assignment event. */
export function assignmentTimelineEvents(
  a: OperationalStaffAssignment,
): UnifiedTimelineEvent {
  return {
    id: timelineId("assignments", a.id, "assigned"),
    occurred_at: a.assigned_at,
    event_type: "staff_assigned",
    category: "assignment",
    title: `${a.assignment_type} assigned`,
    description: a.entity_label,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    related_entity_type: null,
    related_entity_id: null,
    source_module: "staff_assignments",
    actor_id: a.assigned_by,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: "info",
    status: a.status,
    deep_link: null,
    metadata: { staff_id: a.staff_id },
    sensitive: false,
    customer_id: a.entity_type === "customer" ? a.entity_id : null,
    vehicle_id: a.entity_type === "vehicle" ? a.entity_id : null,
    rental_id: a.entity_type === "rental" ? a.entity_id : null,
  };
}

/** Customer note event. Pinned notes are titled "Pinned note". */
export function noteTimelineEvents(note: CustomerNote): UnifiedTimelineEvent {
  return {
    id: timelineId("notes", note.id, "added"),
    occurred_at: note.created_at,
    event_type: "note_added",
    category: "note",
    title: note.pinned ? "Pinned note added" : "Note added",
    description: note.text,
    entity_type: "customer",
    entity_id: note.customer_id,
    related_entity_type: null,
    related_entity_id: null,
    source_module: "customer_notes",
    actor_id: note.created_by,
    actor_name: null,
    financial_amount: null,
    financial_direction: null,
    severity: note.pinned ? "info" : "info",
    status: null,
    deep_link: null,
    metadata: { note_type: note.type, pinned: note.pinned },
    sensitive: false,
    customer_id: note.customer_id,
    vehicle_id: null,
    rental_id: null,
  };
}
