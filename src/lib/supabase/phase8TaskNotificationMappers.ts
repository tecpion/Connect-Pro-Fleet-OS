// Connect Pro Fleet — Phase 8 row ↔ domain mappers: tasks + notifications.

import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
  DeliveryStatus,
} from "../notificationTypes";
import type {
  TaskRow,
  TaskEventRow,
  TaskNoteRow,
  NotificationRow,
  NotificationDeliveryRow,
  NotificationPreferenceRow,
} from "./dbTypesTasks";

// ---------------------------------------------------------------------------
// Tasks (+ events + notes)
// ---------------------------------------------------------------------------

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    task_number: r.task_number,
    title: r.title,
    description: r.description,
    status: r.status as Task["status"],
    priority: r.priority as Task["priority"],
    source_type: r.source_type as Task["source_type"],
    source_event: (r.source_event as Task["source_event"] | null) ?? null,
    assigned_to_user_id: r.assigned_to_user_id,
    assigned_by_user_id: r.assigned_by_user_id,
    created_by_user_id: r.created_by_user_id,
    due_date: r.due_date,
    due_time: r.due_time,
    completed_at: r.completed_at,
    completed_by_user_id: r.completed_by_user_id,
    cancelled_at: r.cancelled_at,
    cancelled_by_user_id: r.cancelled_by_user_id,
    cancellation_reason: r.cancellation_reason,
    entity_type: (r.entity_type as Task["entity_type"] | null) ?? null,
    entity_id: r.entity_id,
    entity_label: r.entity_label,
    location_id: r.location_id,
    category: r.category as Task["category"],
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    notes: r.notes,
    dedupe_key: r.dedupe_key,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function taskToRow(t: Task): Partial<TaskRow> {
  return {
    id: t.id,
    organization_id: t.tenant_id,
    task_number: t.task_number,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    source_type: t.source_type,
    source_event: t.source_event,
    dedupe_key: t.dedupe_key,
    assigned_to_user_id: t.assigned_to_user_id,
    assigned_by_user_id: t.assigned_by_user_id,
    created_by_user_id: t.created_by_user_id,
    due_date: t.due_date,
    due_time: t.due_time,
    completed_at: t.completed_at,
    completed_by_user_id: t.completed_by_user_id,
    cancelled_at: t.cancelled_at,
    cancelled_by_user_id: t.cancelled_by_user_id,
    cancellation_reason: t.cancellation_reason,
    entity_type: t.entity_type,
    entity_id: t.entity_id,
    entity_label: t.entity_label,
    location_id: t.location_id,
    category: t.category,
    tags: (t.tags ?? []) as TaskRow["tags"],
    notes: t.notes,
  };
}

export function taskPatchToRow(patch: Partial<Task>): Partial<TaskRow> {
  const row: Partial<TaskRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.task_number !== undefined) row.task_number = patch.task_number;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.source_type !== undefined) row.source_type = patch.source_type;
  if (patch.source_event !== undefined) row.source_event = patch.source_event;
  if (patch.assigned_to_user_id !== undefined)
    row.assigned_to_user_id = patch.assigned_to_user_id;
  if (patch.assigned_by_user_id !== undefined)
    row.assigned_by_user_id = patch.assigned_by_user_id;
  if (patch.created_by_user_id !== undefined)
    row.created_by_user_id = patch.created_by_user_id;
  if (patch.due_date !== undefined) row.due_date = patch.due_date;
  if (patch.due_time !== undefined) row.due_time = patch.due_time;
  if (patch.completed_at !== undefined) row.completed_at = patch.completed_at;
  if (patch.completed_by_user_id !== undefined)
    row.completed_by_user_id = patch.completed_by_user_id;
  if (patch.cancelled_at !== undefined) row.cancelled_at = patch.cancelled_at;
  if (patch.cancelled_by_user_id !== undefined)
    row.cancelled_by_user_id = patch.cancelled_by_user_id;
  if (patch.cancellation_reason !== undefined)
    row.cancellation_reason = patch.cancellation_reason;
  if (patch.entity_type !== undefined) row.entity_type = patch.entity_type;
  if (patch.entity_id !== undefined) row.entity_id = patch.entity_id;
  if (patch.entity_label !== undefined) row.entity_label = patch.entity_label;
  if (patch.location_id !== undefined) row.location_id = patch.location_id;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.tags !== undefined) row.tags = patch.tags as TaskRow["tags"];
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.dedupe_key !== undefined) row.dedupe_key = patch.dedupe_key;
  return row;
}

export function rowToTaskEvent(r: TaskEventRow): TaskEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    task_id: r.task_id,
    type: r.event_type as TaskEvent["type"],
    label: r.note ?? r.event_type,
    at: r.created_at,
    actor_id: r.actor_user_id,
    actor_is_system: r.actor_is_system,
    old_value: r.old_value,
    new_value: r.new_value,
  };
}

export function taskEventToRow(e: TaskEvent): Partial<TaskEventRow> {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    task_id: e.task_id,
    event_type: e.type,
    actor_user_id: e.actor_id,
    actor_is_system: e.actor_is_system,
    old_value: e.old_value ?? null,
    new_value: e.new_value ?? null,
    note: e.label,
  };
}

export function rowToTaskNote(r: TaskNoteRow): TaskNote {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    task_id: r.task_id,
    author_id: r.author_user_id,
    author_is_system: false,
    text: r.text,
    at: r.created_at,
  };
}

export function taskNoteToRow(n: TaskNote): Partial<TaskNoteRow> {
  return {
    id: n.id,
    organization_id: n.tenant_id,
    task_id: n.task_id,
    author_user_id: n.author_id ?? "",
    text: n.text,
  };
}

// ---------------------------------------------------------------------------
// Notifications (+ deliveries + preferences)
// ---------------------------------------------------------------------------

export function rowToNotification(r: NotificationRow): Notification {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    recipient_user_id: r.recipient_user_id,
    notification_type: r.notification_type as NotificationType,
    category: r.category as NotificationCategory,
    priority: r.priority as NotificationPriority,
    title: r.title,
    message: r.message,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    entity_label: r.entity_label,
    action_url: r.action_url,
    source_event: r.source_event,
    source_event_id: r.source_event_id,
    dedupe_key: r.dedupe_key,
    actor_user_id: r.actor_user_id,
    read_at: r.read_at,
    archived_at: r.archived_at,
    created_at: r.created_at,
    expires_at: r.expires_at,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  };
}

export function notificationToRow(n: Notification): Partial<NotificationRow> {
  return {
    id: n.id,
    organization_id: n.tenant_id,
    recipient_user_id: n.recipient_user_id,
    notification_type: n.notification_type,
    category: n.category,
    priority: n.priority,
    title: n.title,
    message: n.message,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    entity_label: n.entity_label,
    action_url: n.action_url,
    source_event: n.source_event,
    source_event_id: n.source_event_id,
    dedupe_key: n.dedupe_key,
    actor_user_id: n.actor_user_id,
    read_at: n.read_at,
    archived_at: n.archived_at,
    expires_at: n.expires_at,
    metadata: (n.metadata ?? null) as NotificationRow["metadata"],
  };
}

export function notificationPatchToRow(
  patch: Partial<Notification>,
): Partial<NotificationRow> {
  const row: Partial<NotificationRow> = {};
  if (patch.tenant_id !== undefined) row.organization_id = patch.tenant_id;
  if (patch.recipient_user_id !== undefined)
    row.recipient_user_id = patch.recipient_user_id;
  if (patch.notification_type !== undefined)
    row.notification_type = patch.notification_type;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.message !== undefined) row.message = patch.message;
  if (patch.entity_type !== undefined) row.entity_type = patch.entity_type;
  if (patch.entity_id !== undefined) row.entity_id = patch.entity_id;
  if (patch.entity_label !== undefined) row.entity_label = patch.entity_label;
  if (patch.action_url !== undefined) row.action_url = patch.action_url;
  if (patch.source_event !== undefined) row.source_event = patch.source_event;
  if (patch.source_event_id !== undefined)
    row.source_event_id = patch.source_event_id;
  if (patch.dedupe_key !== undefined) row.dedupe_key = patch.dedupe_key;
  if (patch.actor_user_id !== undefined)
    row.actor_user_id = patch.actor_user_id;
  if (patch.read_at !== undefined) row.read_at = patch.read_at;
  if (patch.archived_at !== undefined) row.archived_at = patch.archived_at;
  if (patch.expires_at !== undefined) row.expires_at = patch.expires_at;
  if (patch.metadata !== undefined)
    row.metadata = patch.metadata as NotificationRow["metadata"];
  return row;
}

export function rowToNotificationDelivery(
  r: NotificationDeliveryRow,
): NotificationDelivery {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    notification_id: r.notification_id,
    recipient_user_id: r.recipient_user_id,
    channel: r.channel as NotificationChannel,
    destination: r.destination ?? "",
    status: r.status as DeliveryStatus,
    provider: r.provider,
    provider_message_id: r.provider_message_id,
    attempt_count: r.attempt_count,
    last_attempt_at: r.last_attempt_at,
    sent_at: r.sent_at,
    failed_at: r.failed_at,
    failure_reason: r.failure_reason,
    created_at: r.created_at,
  };
}

export function notificationDeliveryToRow(
  d: NotificationDelivery,
): Partial<NotificationDeliveryRow> {
  return {
    id: d.id,
    organization_id: d.tenant_id,
    notification_id: d.notification_id,
    recipient_user_id: d.recipient_user_id,
    channel: d.channel,
    destination: d.destination,
    status: d.status,
    provider: d.provider,
    provider_message_id: d.provider_message_id,
    attempt_count: d.attempt_count,
    last_attempt_at: d.last_attempt_at,
    sent_at: d.sent_at,
    failed_at: d.failed_at,
    failure_reason: d.failure_reason,
  };
}

export function rowToNotificationPreference(
  r: NotificationPreferenceRow,
): NotificationPreference {
  return {
    tenant_id: r.organization_id,
    user_id: r.user_id,
    category: r.category as NotificationCategory,
    in_app_enabled: r.in_app_enabled,
    email_enabled: r.email_enabled,
    connect_pro_enabled: r.connect_pro_enabled,
    updated_at: r.updated_at,
  };
}

export function notificationPreferenceToRow(
  p: NotificationPreference,
): Partial<NotificationPreferenceRow> {
  return {
    organization_id: p.tenant_id,
    user_id: p.user_id,
    category: p.category,
    in_app_enabled: p.in_app_enabled,
    email_enabled: p.email_enabled,
    connect_pro_enabled: p.connect_pro_enabled,
    updated_at: p.updated_at,
  };
}
