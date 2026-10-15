// Connect Pro Fleet — Notifications domain selectors (Build #12).
//
// Pure functions over Notification[] / NotificationDelivery[] /
// NotificationPreference[]. Unread/archived are DERIVED from read_at /
// archived_at — never stored as mutable status. All user-scoped selectors
// filter by recipient_user_id so a user only ever sees their own notifications
// (selectors enforce isolation, not just the UI).
//
// A Notification is the in-app feed record ONLY when it has an in-app delivery.
// An email-only notification (In-App preference off, Email on) must NOT appear
// in the in-app feed or unread count — it has no in-app delivery. Selectors
// that build the feed/unread count require an in-app delivery to exist.

import type {
  Notification,
  NotificationCategory,
  NotificationDelivery,
  NotificationPreference,
  NotificationPriority,
} from "./notificationTypes";

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isUnread(n: Notification): boolean {
  return n.read_at === null;
}

export function isArchived(n: Notification): boolean {
  return n.archived_at !== null;
}

export function isActive(n: Notification): boolean {
  return n.archived_at === null;
}

/** Next notification number in the NTF-YYYY-NNNNNN sequence (tenant-scoped). */
export function nextNotificationNumber(notifications: Notification[]): string {
  const year = new Date().getFullYear();
  const max = notifications
    .map((n) => {
      const m = (n.id ?? "").match(/^ntf_(\d+)$/);
      return m ? Number(m[1]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `NTF-${year}-${String(max + 1).padStart(6, "0")}`;
}

/** Build a stable dedupe key for a notification occurrence. Same event +
 *  recipient + occurrence must produce ONE notification. */
export function notificationDedupeKey(
  recipientUserId: string,
  notificationType: string,
  sourceEventId: string | null,
  occurrence: string,
): string {
  return `ntf:${recipientUserId}:${notificationType}:${sourceEventId ?? ""}:${occurrence}`;
}

/** Find an existing active (non-archived) notification with the same dedupe
 *  key — used to prevent duplicate notifications for the same event. */
export function findExistingNotification(
  notifications: Notification[],
  dedupeKey: string,
): Notification | undefined {
  return notifications.find(
    (n) => n.dedupe_key === dedupeKey && n.archived_at === null,
  );
}

export function getNotificationsForUser(
  notifications: Notification[],
  userId: string,
): Notification[] {
  return notifications
    .filter((n) => n.recipient_user_id === userId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function getUnreadNotificationsForUser(
  notifications: Notification[],
  userId: string,
): Notification[] {
  return getNotificationsForUser(notifications, userId).filter(isUnread);
}

export function getUnreadCount(
  notifications: Notification[],
  userId: string,
): number {
  return getUnreadNotificationsForUser(notifications, userId).length;
}

/** Display badge: 0 -> none, 1-99 -> number, 99+ -> "99+". */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

export function getRecentNotifications(
  notifications: Notification[],
  userId: string,
  limit = 8,
): Notification[] {
  return getNotificationsForUser(notifications, userId)
    .filter(isActive)
    .slice(0, limit);
}

export function getNotificationsByCategory(
  notifications: Notification[],
  userId: string,
  category: NotificationCategory,
): Notification[] {
  return getNotificationsForUser(notifications, userId).filter(
    (n) => n.category === category,
  );
}

/** Sort newest first (already the default, but explicit). */
export function sortNotifications(
  notifications: Notification[],
): Notification[] {
  return [...notifications].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
}

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  info: 3,
};

/** Operational sort: unread first, then priority, then newest. */
export function sortNotificationsOperational(
  notifications: Notification[],
): Notification[] {
  return [...notifications].sort((a, b) => {
    const aUnread = isUnread(a);
    const bUnread = isUnread(b);
    if (aUnread !== bUnread) return aUnread ? -1 : 1;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

/** Human-readable relative time: "Just now", "5m ago", "2h ago", "Yesterday",
 *  "Aug 26". Never raw timestamps. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (diff < 60_000) return "Just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Resolve a user's effective preference for a category, falling back to the
 *  default in-app/email flags when no explicit preference exists. */
export function resolvePreference(
  preferences: NotificationPreference[],
  userId: string,
  category: NotificationCategory,
  defaults: { in_app: boolean; email: boolean },
): { in_app: boolean; email: boolean } {
  const p = preferences.find(
    (x) => x.user_id === userId && x.category === category,
  );
  if (p) return { in_app: p.in_app_enabled, email: p.email_enabled };
  return { in_app: defaults.in_app, email: defaults.email };
}

/** Is a given notification type enabled for a user on a channel, given their
 *  preferences + the rule defaults? */
export function isNotificationEnabled(
  preferences: NotificationPreference[],
  userId: string,
  category: NotificationCategory,
  channel: "in_app" | "email",
  defaults: { in_app: boolean; email: boolean },
): boolean {
  const resolved = resolvePreference(preferences, userId, category, defaults);
  return channel === "in_app" ? resolved.in_app : resolved.email;
}

/** Delivery records for a notification. */
export function deliveriesFor(
  deliveries: NotificationDelivery[],
  notificationId: string,
): NotificationDelivery[] {
  return deliveries
    .filter((d) => d.notification_id === notificationId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** A notification's latest delivery status for a channel. */
export function deliveryStatus(
  deliveries: NotificationDelivery[],
  notificationId: string,
  channel: "in_app" | "email",
): "none" | "pending" | "sent" | "failed" | "skipped" {
  const d = deliveries
    .filter(
      (x) => x.notification_id === notificationId && x.channel === channel,
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  if (!d) return "none";
  return d.status;
}

/** Has a delivery already been attempted/sent for this occurrence? Used for
 *  email delivery dedupe so a re-scan never re-sends. */
export function hasDeliveryForOccurrence(
  deliveries: NotificationDelivery[],
  notificationId: string,
  channel: "in_app" | "email",
): boolean {
  return deliveries.some(
    (d) =>
      d.notification_id === notificationId &&
      d.channel === channel &&
      (d.status === "sent" || d.status === "pending" || d.status === "skipped"),
  );
}

/** Has a SENT in-app delivery been recorded for this notification? A
 *  notification only belongs in the in-app feed when it was actually delivered
 *  in-app. Email-only notifications (no in-app delivery) are excluded. */
export function hasInAppDelivery(
  deliveries: NotificationDelivery[],
  notificationId: string,
): boolean {
  return deliveries.some(
    (d) =>
      d.notification_id === notificationId &&
      d.channel === "in_app" &&
      d.status === "sent",
  );
}

/** Set of notification ids that have an in-app delivery (feed-eligible). */
export function inAppNotificationIds(
  deliveries: NotificationDelivery[],
): Set<string> {
  const ids = new Set<string>();
  for (const d of deliveries) {
    if (d.channel === "in_app" && d.status === "sent")
      ids.add(d.notification_id);
  }
  return ids;
}

/** The in-app feed for a user: only notifications with an in-app delivery.
 *  Email-only notifications are excluded so they don't pollute the feed or
 *  unread count. Newest first. */
export function getFeedForUser(
  notifications: Notification[],
  deliveries: NotificationDelivery[],
  userId: string,
): Notification[] {
  const feedIds = inAppNotificationIds(deliveries);
  return notifications
    .filter(
      (n) =>
        n.recipient_user_id === userId &&
        feedIds.has(n.id) &&
        n.archived_at === null,
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Unread count for the bell badge: only in-app-delivered, non-archived,
 *  unread notifications for the current user. Email-only events don't count. */
export function getFeedUnreadCount(
  notifications: Notification[],
  deliveries: NotificationDelivery[],
  userId: string,
): number {
  const feedIds = inAppNotificationIds(deliveries);
  return notifications.filter(
    (n) =>
      n.recipient_user_id === userId &&
      feedIds.has(n.id) &&
      n.read_at === null &&
      n.archived_at === null,
  ).length;
}

/** Recent in-app feed notifications for the bell panel (limit newest). */
export function getRecentFeedNotifications(
  notifications: Notification[],
  deliveries: NotificationDelivery[],
  userId: string,
  limit = 8,
): Notification[] {
  return getFeedForUser(notifications, deliveries, userId).slice(0, limit);
}

/** Has a SENT email delivery been recorded for this notification? Used for the
 *  success-lock so a retried email never re-sends after success. */
export function hasSentEmailDelivery(
  deliveries: NotificationDelivery[],
  notificationId: string,
): boolean {
  return deliveries.some(
    (d) =>
      d.notification_id === notificationId &&
      d.channel === "email" &&
      d.status === "sent",
  );
}

/** Latest email delivery for a notification (for retry/success-lock checks). */
export function latestEmailDelivery(
  deliveries: NotificationDelivery[],
  notificationId: string,
): NotificationDelivery | undefined {
  return deliveries
    .filter(
      (d) => d.notification_id === notificationId && d.channel === "email",
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}
