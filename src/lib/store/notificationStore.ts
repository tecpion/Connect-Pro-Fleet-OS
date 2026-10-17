// Connect Pro Fleet — notification store methods (Build #12).
//
// The staff-awareness layer: create notifications (action-driven + scan-driven),
// mark read/unread, archive, manage per-user preferences, and deliver via
// in-app + email. Notifications never change domain state — they're
// informational delivery records. The SYSTEM actor is actor_user_id: null.
//
// Build #12 cleanup:
//  - Runtime task-coverage suppression lives IN notify(), not just the scan.
//    A direct domain notification for a covered event is suppressed when a
//    system task's assignment notification already alerted the same recipient.
//  - Channel preferences: a Notification is the in-app feed record ONLY when it
//    has an in-app delivery. An email-only notification (In-App off, Email on)
//    is created but has NO in-app delivery, so feed/unread selectors exclude it.
//  - Email retry/success-lock: a SENT email is never re-sent; a failed email
//    retry increments attempt_count, never a new Notification.

import type {
  Notification,
  NotificationCategory,
  NotificationDelivery,
  NotificationPreference,
  NotificationPriority,
  NotificationType,
} from "../notificationTypes";
import { NOTIFICATION_RULES } from "../notificationRules";
import {
  hasInAppDelivery,
  hasSentEmailDelivery,
  latestEmailDelivery,
  notificationDedupeKey,
  resolvePreference,
} from "../notificationSelectors";
import { isEventCoveredByTaskNotification } from "../notificationCoverage";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { generateNotificationsPass } from "./notificationScan";
import {
  actionLabelFor,
  deliverEmail,
  makeAddDelivery,
  retryEmailSend,
} from "./notificationEmailDelivery";

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
  /** Skip in-app creation (used when a task assignment already covers it). */
  skipInApp?: boolean;
  /** Force email even if preference says off (rare; not used by default). */
  forceEmail?: boolean;
  /** Bypass runtime task-coverage suppression. Internal/admin only. */
  bypassCoverageSuppression?: boolean;
}

export function buildNotificationMethods(s: StoreState) {
  const addDelivery = makeAddDelivery(s);

  function now() {
    return new Date().toISOString();
  }

  /** Create a notification for a single recipient (idempotent by dedupe key).
   *  Runtime suppression: if the rule's taskCoversEvent is true AND a system
   *  task's assignment notification already covered this recipient for this
   *  occurrence, the direct domain notification is suppressed. Applies to ALL
   *  callers — scan, domain stores, task store, lifecycle actions. */
  function notify(input: CreateNotificationInput): string | null {
    const rule = NOTIFICATION_RULES[input.type];
    if (!rule) return null;
    const occurrence = input.occurrence ?? "1";
    const dedupeKey = notificationDedupeKey(
      input.recipientUserId,
      input.type,
      input.sourceEventId ?? null,
      occurrence,
    );
    if (s.notificationKeys.current.has(dedupeKey)) return null;

    // Runtime task-coverage suppression (central, applies to every caller).
    if (
      rule.taskCoversEvent &&
      !input.bypassCoverageSuppression &&
      isEventCoveredByTaskNotification({
        notificationType: input.type,
        recipientUserId: input.recipientUserId,
        entityId: input.entityId ?? null,
        occurrence,
        tasks: s.tasks,
        notifications: s.notifications,
      })
    ) {
      return null;
    }

    const prefs = resolvePreference(
      s.notificationPreferences,
      input.recipientUserId,
      rule.category,
      { in_app: rule.defaultInApp, email: rule.defaultEmail },
    );

    const wantInApp = prefs.in_app && !input.skipInApp;
    const wantEmail = input.forceEmail || prefs.email;
    // Both channels off + non-urgent -> skip creation (mark key used).
    if (!wantInApp && !wantEmail && rule.priority !== "urgent") {
      s.notificationKeys.current.add(dedupeKey);
      return null;
    }

    s.notificationKeys.current.add(dedupeKey);
    const id = uid("ntf");
    const n: Notification = {
      id,
      tenant_id: TENANT_ID,
      recipient_user_id: input.recipientUserId,
      notification_type: input.type,
      category: rule.category,
      priority: input.priority ?? rule.priority,
      title: input.title,
      message: input.message,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      action_url: input.actionUrl ?? null,
      source_event: input.type,
      source_event_id: input.sourceEventId ?? null,
      dedupe_key: dedupeKey,
      actor_user_id: input.actorUserId ?? null,
      read_at: null,
      archived_at: null,
      created_at: now(),
      expires_at: null,
      metadata: input.metadata ?? null,
    };
    s.setNotifications((ns) => [n, ...ns]);

    // In-app delivery ONLY when enabled — email-only notifications have no
    // in-app delivery and never appear in the feed/unread count.
    if (wantInApp) {
      addDelivery({
        notificationId: id,
        recipientUserId: input.recipientUserId,
        channel: "in_app",
        destination: "in_app",
        status: "sent",
        provider: "in_app",
        providerMessageId: id,
      });
    }
    if (wantEmail) {
      void deliverEmail(s, n, rule.reason, addDelivery);
    }
    return id;
  }

  function feedIds(): Set<string> {
    return new Set(
      s.notificationDeliveries
        .filter((d) => d.channel === "in_app" && d.status === "sent")
        .map((d) => d.notification_id),
    );
  }

  return {
    notify,
    notifyMany: (
      input: Omit<CreateNotificationInput, "recipientUserId"> & {
        recipientUserIds: string[];
      },
    ): string[] => {
      const ids: string[] = [];
      for (const r of input.recipientUserIds) {
        const { recipientUserIds: _omit, ...rest } = input;
        void _omit;
        const id = notify({ ...rest, recipientUserId: r });
        if (id) ids.push(id);
      }
      return ids;
    },

    // --- read / archive (in-app feed only) ---------------------------------
    markRead: (notificationId: string): void => {
      if (!hasInAppDelivery(s.notificationDeliveries, notificationId)) return;
      s.setNotifications((ns) =>
        ns.map((n) =>
          n.id === notificationId && n.recipient_user_id === s.currentStaffId
            ? { ...n, read_at: now() }
            : n,
        ),
      );
    },
    markUnread: (notificationId: string): void => {
      if (!hasInAppDelivery(s.notificationDeliveries, notificationId)) return;
      s.setNotifications((ns) =>
        ns.map((n) =>
          n.id === notificationId && n.recipient_user_id === s.currentStaffId
            ? { ...n, read_at: null }
            : n,
        ),
      );
    },
    markAllRead: (): void => {
      const uid_ = s.currentStaffId;
      const ids = feedIds();
      s.setNotifications((ns) =>
        ns.map((n) =>
          n.recipient_user_id === uid_ && n.read_at === null && ids.has(n.id)
            ? { ...n, read_at: now() }
            : n,
        ),
      );
    },
    archiveNotification: (notificationId: string): void => {
      if (!hasInAppDelivery(s.notificationDeliveries, notificationId)) return;
      s.setNotifications((ns) =>
        ns.map((n) =>
          n.id === notificationId && n.recipient_user_id === s.currentStaffId
            ? { ...n, archived_at: now() }
            : n,
        ),
      );
    },
    openNotification: (notificationId: string): string | null => {
      const n = s.notifications.find((x) => x.id === notificationId);
      if (!n || n.recipient_user_id !== s.currentStaffId) return null;
      if (
        n.read_at === null &&
        hasInAppDelivery(s.notificationDeliveries, notificationId)
      ) {
        s.setNotifications((ns) =>
          ns.map((x) =>
            x.id === notificationId ? { ...x, read_at: now() } : x,
          ),
        );
      }
      return n.action_url;
    },

    // --- email retry (success-locked, increments attempt_count) -----------
    retryEmail: (notificationId: string): void => {
      if (
        hasSentEmailDelivery(s.notificationDeliveries, notificationId) ||
        s.sentEmailLocks.current.has(notificationId)
      )
        return;
      const n = s.notifications.find((x) => x.id === notificationId);
      if (!n) return;
      const prev = latestEmailDelivery(
        s.notificationDeliveries,
        notificationId,
      );
      const attemptCount = (prev?.attempt_count ?? 0) + 1;
      void retryEmailSend(s, n, attemptCount, addDelivery);
    },

    // --- preferences --------------------------------------------------------
    setPreference: (input: {
      userId: string;
      category: NotificationCategory;
      inApp?: boolean;
      email?: boolean;
    }): void => {
      if (input.userId !== s.currentStaffId) return;
      s.setNotificationPreferences((ps) => {
        const existing = ps.find(
          (p) => p.user_id === input.userId && p.category === input.category,
        );
        if (existing) {
          return ps.map((p) =>
            p === existing
              ? {
                  ...p,
                  in_app_enabled: input.inApp ?? p.in_app_enabled,
                  email_enabled: input.email ?? p.email_enabled,
                  updated_at: now(),
                }
              : p,
          );
        }
        const pref: NotificationPreference = {
          tenant_id: TENANT_ID,
          user_id: input.userId,
          category: input.category,
          in_app_enabled: input.inApp ?? true,
          email_enabled: input.email ?? true,
          connect_pro_enabled: false,
          updated_at: now(),
        };
        return [...ps, pref];
      });
    },

    // --- selectors (in-app feed only) --------------------------------------
    notificationsForUser: (userId: string): Notification[] => {
      const ids = feedIds();
      return s.notifications
        .filter((n) => n.recipient_user_id === userId && ids.has(n.id))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    unreadCount: (): number => {
      const ids = feedIds();
      return s.notifications.filter(
        (n) =>
          n.recipient_user_id === s.currentStaffId &&
          n.read_at === null &&
          n.archived_at === null &&
          ids.has(n.id),
      ).length;
    },
    deliveriesFor: (notificationId: string): NotificationDelivery[] =>
      s.notificationDeliveries
        .filter((d) => d.notification_id === notificationId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    preferencesForUser: (userId: string): NotificationPreference[] =>
      s.notificationPreferences.filter((p) => p.user_id === userId),

    generateNotifications: (): { created: number } =>
      generateNotificationsPass(s, notify),
  };
}

// Re-export so existing importers of actionLabelFor from this module still work.
export { actionLabelFor };
