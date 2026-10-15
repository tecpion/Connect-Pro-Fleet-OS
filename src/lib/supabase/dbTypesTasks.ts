// Connect Pro Fleet — typed Database row types: tasks + notifications (Build #22).

import type { Json } from "./dbTypesCore";

export interface TaskRow {
  id: string;
  organization_id: string;
  task_number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source_type: string;
  source_event: string | null;
  dedupe_key: string | null;
  assigned_to_user_id: string | null;
  assigned_by_user_id: string | null;
  created_by_user_id: string | null;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  location_id: string | null;
  category: string;
  tags: Json | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEventRow {
  id: string;
  organization_id: string;
  task_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_is_system: boolean;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
}

export interface TaskNoteRow {
  id: string;
  organization_id: string;
  task_id: string;
  author_user_id: string;
  text: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  notification_type: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  action_url: string | null;
  source_event: string;
  source_event_id: string | null;
  dedupe_key: string | null;
  actor_user_id: string | null;
  read_at: string | null;
  archived_at: string | null;
  expires_at: string | null;
  metadata: Json | null;
  created_at: string;
}

export interface NotificationDeliveryRow {
  id: string;
  organization_id: string;
  notification_id: string;
  recipient_user_id: string;
  channel: string;
  destination: string | null;
  status: string;
  provider: string | null;
  provider_message_id: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface NotificationPreferenceRow {
  organization_id: string;
  user_id: string;
  category: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  connect_pro_enabled: boolean;
  updated_at: string;
}
