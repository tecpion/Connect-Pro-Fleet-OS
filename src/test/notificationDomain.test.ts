// Connect Pro Fleet — Build #12 notification domain selector tests.
//
// Pure functions over Notification[] / NotificationDelivery[] /
// NotificationPreference[]. Verifies derived unread/archived, dedupe keys,
// badge capping, relative time, preference resolution, and delivery status.

import { describe, it, expect } from "vitest";
import {
  findExistingNotification,
  getNotificationsForUser,
  getUnreadCount,
  isUnread,
  isArchived,
  notificationDedupeKey,
  unreadBadge,
  relativeTime,
  resolvePreference,
  deliveryStatus,
  hasDeliveryForOccurrence,
} from "@/lib/notificationSelectors";
import type {
  Notification,
  NotificationDelivery,
  NotificationPreference,
} from "@/lib/notificationTypes";

function makeN(over: Partial<Notification> = {}): Notification {
  return {
    id: "ntf_1",
    tenant_id: "tnt_connectpro",
    recipient_user_id: "stf_1",
    notification_type: "task.assigned",
    category: "task",
    priority: "normal",
    title: "T",
    message: "M",
    entity_type: null,
    entity_id: null,
    entity_label: null,
    action_url: null,
    source_event: "task.assigned",
    source_event_id: "tsk_1",
    dedupe_key: "ntf:stf_1:task.assigned:tsk_1:1",
    actor_user_id: null,
    read_at: null,
    archived_at: null,
    created_at: "2026-08-30T10:00:00Z",
    expires_at: null,
    metadata: null,
    ...over,
  };
}

describe("notification derived state", () => {
  it("unread is derived from read_at", () => {
    expect(isUnread(makeN({ read_at: null }))).toBe(true);
    expect(isUnread(makeN({ read_at: "2026-08-30T11:00:00Z" }))).toBe(false);
  });
  it("archived is derived from archived_at", () => {
    expect(isArchived(makeN({ archived_at: null }))).toBe(false);
    expect(isArchived(makeN({ archived_at: "2026-08-30T11:00:00Z" }))).toBe(
      true,
    );
  });
});

describe("user isolation", () => {
  const ns = [
    makeN({ id: "ntf_a", recipient_user_id: "stf_1" }),
    makeN({ id: "ntf_b", recipient_user_id: "stf_2" }),
  ];
  it("getNotificationsForUser returns only the user's notifications", () => {
    expect(getNotificationsForUser(ns, "stf_1")).toHaveLength(1);
    expect(getNotificationsForUser(ns, "stf_2")).toHaveLength(1);
  });
  it("getUnreadCount is user-scoped", () => {
    expect(getUnreadCount(ns, "stf_1")).toBe(1);
    expect(getUnreadCount(ns, "stf_2")).toBe(1);
  });
});

describe("dedupe key", () => {
  it("same recipient+type+source+occurrence produces the same key", () => {
    const a = notificationDedupeKey("stf_1", "task.assigned", "tsk_1", "1");
    const b = notificationDedupeKey("stf_1", "task.assigned", "tsk_1", "1");
    expect(a).toBe(b);
  });
  it("different occurrence produces a different key", () => {
    const a = notificationDedupeKey("stf_1", "task.assigned", "tsk_1", "1");
    const b = notificationDedupeKey("stf_1", "task.assigned", "tsk_1", "2");
    expect(a).not.toBe(b);
  });
  it("findExistingNotification finds an active match", () => {
    const n = makeN();
    expect(findExistingNotification([n], n.dedupe_key!)).toBe(n);
  });
  it("findExistingNotification ignores archived", () => {
    const n = makeN({ archived_at: "2026-08-30T11:00:00Z" });
    expect(findExistingNotification([n], n.dedupe_key!)).toBeUndefined();
  });
});

describe("unread badge", () => {
  it("0 -> null", () => {
    expect(unreadBadge(0)).toBeNull();
  });
  it("1-99 -> number", () => {
    expect(unreadBadge(5)).toBe("5");
    expect(unreadBadge(99)).toBe("99");
  });
  it("99+ -> capped", () => {
    expect(unreadBadge(100)).toBe("99+");
    expect(unreadBadge(9999)).toBe("99+");
  });
});

describe("relative time", () => {
  const now = new Date("2026-08-30T12:00:00Z");
  it("Just now", () => {
    expect(relativeTime("2026-08-30T11:59:30Z", now)).toBe("Just now");
  });
  it("minutes ago", () => {
    expect(relativeTime("2026-08-30T11:55:00Z", now)).toBe("5m ago");
  });
  it("hours ago", () => {
    expect(relativeTime("2026-08-30T10:00:00Z", now)).toBe("2h ago");
  });
  it("Yesterday", () => {
    expect(relativeTime("2026-08-29T10:00:00Z", now)).toBe("Yesterday");
  });
  it("date for older", () => {
    expect(relativeTime("2026-08-20T10:00:00Z", now)).toBe("Aug 20");
  });
});

describe("preference resolution", () => {
  const prefs: NotificationPreference[] = [
    {
      tenant_id: "tnt_connectpro",
      user_id: "stf_1",
      category: "task",
      in_app_enabled: false,
      email_enabled: false,
      connect_pro_enabled: false,
      updated_at: "2026-08-30T10:00:00Z",
    },
  ];
  it("uses explicit preference when present", () => {
    const r = resolvePreference(prefs, "stf_1", "task", {
      in_app: true,
      email: true,
    });
    expect(r.in_app).toBe(false);
    expect(r.email).toBe(false);
  });
  it("falls back to defaults when no preference", () => {
    const r = resolvePreference(prefs, "stf_1", "deposit", {
      in_app: true,
      email: true,
    });
    expect(r.in_app).toBe(true);
    expect(r.email).toBe(true);
  });
});

describe("delivery status", () => {
  const deliveries: NotificationDelivery[] = [
    {
      id: "ndv_1",
      tenant_id: "tnt_connectpro",
      notification_id: "ntf_1",
      recipient_user_id: "stf_1",
      channel: "email",
      destination: "a@b.com",
      status: "failed",
      provider: "none",
      provider_message_id: null,
      attempt_count: 1,
      last_attempt_at: "2026-08-30T10:00:00Z",
      sent_at: null,
      failed_at: "2026-08-30T10:00:00Z",
      failure_reason: "no provider",
      created_at: "2026-08-30T10:00:00Z",
    },
    {
      id: "ndv_2",
      tenant_id: "tnt_connectpro",
      notification_id: "ntf_1",
      recipient_user_id: "stf_1",
      channel: "email",
      destination: "a@b.com",
      status: "sent",
      provider: "resend",
      provider_message_id: "msg_1",
      attempt_count: 1,
      last_attempt_at: "2026-08-30T11:00:00Z",
      sent_at: "2026-08-30T11:00:00Z",
      failed_at: null,
      failure_reason: null,
      created_at: "2026-08-30T11:00:00Z",
    },
  ];
  it("returns the latest delivery status for a channel", () => {
    expect(deliveryStatus(deliveries, "ntf_1", "email")).toBe("sent");
  });
  it("returns none when no delivery exists", () => {
    expect(deliveryStatus(deliveries, "ntf_1", "in_app")).toBe("none");
  });
  it("hasDeliveryForOccurrence detects prior sent/skipped/pending", () => {
    expect(hasDeliveryForOccurrence(deliveries, "ntf_1", "email")).toBe(true);
  });
});
