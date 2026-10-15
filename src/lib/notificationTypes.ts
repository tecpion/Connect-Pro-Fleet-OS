// Connect Pro Fleet — Notifications domain types (Build #12).
//
// A Notification is an informational delivery record — it tells a staff member
// something happened or requires attention. It does NOT itself change domain
// state, create a payment, change ledger balances, complete a task, or change
// a rental status. Tasks answer "what human work must be done"; Notifications
// answer "who needs to know something happened".
//
// Two functional delivery channels: IN_APP and EMAIL. CONNECT_PRO_WEBHOOK is a
// future-ready channel kept INACTIVE until a real integration exists — it never
// claims SENT. SMS is NOT implemented in Fleet (future customer comms belong
// to Connect Pro).
//
// Overdue/unread/archived are DERIVED (read_at / archived_at), never stored as
// mutable status. Dedupe is by (tenant + recipient + notification_type +
// source_event_id/occurrence) so the same event never notifies twice.

export type NotificationChannel = "in_app" | "email" | "connect_pro_webhook";

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In-App",
  email: "Email",
  connect_pro_webhook: "Connect Pro",
};

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

export type NotificationPriority = "info" | "normal" | "high" | "urgent";

export const NOTIFICATION_PRIORITY_LABELS: Record<
  NotificationPriority,
  string
> = {
  info: "Info",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const NOTIFICATION_PRIORITY_TONE: Record<
  NotificationPriority,
  "available" | "maintenance" | "out" | "neutral"
> = {
  info: "neutral",
  normal: "neutral",
  high: "maintenance",
  urgent: "out",
};

export type NotificationCategory =
  | "task"
  | "payment"
  | "payment_arrangement"
  | "rental"
  | "reservation"
  | "vehicle"
  | "maintenance"
  | "document"
  | "deposit"
  | "verification"
  | "damage"
  | "incident"
  | "violation"
  | "system";

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  task: "Tasks",
  payment: "Payments",
  payment_arrangement: "Payments & Arrangements",
  rental: "Rentals & Returns",
  reservation: "Reservations",
  vehicle: "Vehicles",
  maintenance: "Vehicles & Maintenance",
  document: "Documents & Verification",
  deposit: "Deposits",
  verification: "Documents & Verification",
  damage: "Incidents & Damage",
  incident: "Incidents & Damage",
  violation: "Incidents & Damage",
  system: "System",
};

/** Structured notification types (never parsed from message text). */
export type NotificationType =
  | "task.assigned"
  | "task.reassigned"
  | "task.due_today"
  | "task.overdue"
  | "task.cancelled"
  | "payment_arrangement.broken"
  | "payment_arrangement.promise_due"
  | "rental.overdue"
  | "payment.received"
  | "deposit.refund_pending"
  | "deposit.refunded"
  | "maintenance.overdue"
  | "vehicle.registration_expiring"
  | "vehicle.insurance_expiring"
  | "verification.review_required"
  | "inspection.damage_flagged"
  | "incident.created"
  | "violation.created"
  | "system_task.unassigned"
  // Build #26 — compliance notifications (internal only; no customer SMS/email).
  | "compliance.expiring_soon"
  | "compliance.expired"
  | "compliance.blocking";

export interface Notification {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  notification_type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
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
  created_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface NotificationDelivery {
  id: string;
  tenant_id: string;
  notification_id: string;
  recipient_user_id: string;
  channel: NotificationChannel;
  destination: string;
  status: DeliveryStatus;
  provider: string | null;
  provider_message_id: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

/** Per-user notification preferences. Future Connect Pro field stays inactive
 *  until a real integration exists. */
export interface NotificationPreference {
  tenant_id: string;
  user_id: string;
  category: NotificationCategory;
  in_app_enabled: boolean;
  email_enabled: boolean;
  connect_pro_enabled: boolean; // future — inactive until integration exists
  updated_at: string;
}

/** A structured outbound operational event for future Connect Pro webhook
 *  delivery. Generated but NOT sent anywhere until a real integration exists. */
export interface OutboundEvent {
  event_id: string;
  tenant_id: string;
  event_type: string;
  occurred_at: string;
  entity_type: string | null;
  entity_id: string | null;
  customer_id: string | null;
  rental_id: string | null;
  responsible_user_id: string | null;
  metadata: Record<string, unknown> | null;
}
