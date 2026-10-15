// Connect Pro Fleet — NotificationMethods interface (Build #12).
// Extracted from storeContext to keep it under the line limit.

import type {
  Notification,
  NotificationCategory,
  NotificationDelivery,
  NotificationPreference,
  NotificationType,
  NotificationPriority,
} from "../notificationTypes";

export interface CreateNotificationInput {
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
  priority?: NotificationPriority;
  metadata?: Record<string, unknown> | null;
  skipInApp?: boolean;
  forceEmail?: boolean;
  /** Bypass runtime task-coverage suppression. Internal/admin only — ordinary
   *  domain stores must never set this. */
  bypassCoverageSuppression?: boolean;
}

export interface NotificationMethods {
  notify: (input: CreateNotificationInput) => string | null;
  notifyMany: (
    input: Omit<CreateNotificationInput, "recipientUserId"> & {
      recipientUserIds: string[];
    },
  ) => string[];
  markRead: (notificationId: string) => void;
  markUnread: (notificationId: string) => void;
  markAllRead: () => void;
  archiveNotification: (notificationId: string) => void;
  openNotification: (notificationId: string) => string | null;
  /** Retry a failed email delivery. Success-locked; increments attempt_count.
   *  Never creates a new Notification. */
  retryEmail: (notificationId: string) => void;
  setPreference: (input: {
    userId: string;
    category: NotificationCategory;
    inApp?: boolean;
    email?: boolean;
  }) => void;
  notificationsForUser: (userId: string) => Notification[];
  unreadCount: () => number;
  deliveriesFor: (notificationId: string) => NotificationDelivery[];
  preferencesForUser: (userId: string) => NotificationPreference[];
  generateNotifications: () => { created: number };
}
