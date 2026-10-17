// Connect Pro Fleet — notification email delivery helpers (Build #12 cleanup).
//
// Extracted from notificationStore to keep files focused. Handles the actual
// provider send + delivery-record append for both initial delivery and retry.
// Success-locked: a SENT email is never re-sent. Retry increments
// attempt_count on a new delivery record, never a new Notification.

import type { Notification, NotificationDelivery } from "../notificationTypes";
import { NOTIFICATION_RULES } from "../notificationRules";
import { buildEmailContent, getEmailProvider } from "../notificationEmail";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export type AddDeliveryFn = (input: {
  notificationId: string;
  recipientUserId: string;
  channel: "in_app" | "email" | "connect_pro_webhook";
  destination: string;
  status: "pending" | "sent" | "failed" | "skipped";
  provider?: string | null;
  providerMessageId?: string | null;
  failureReason?: string | null;
  attemptCount?: number;
}) => void;

export function actionLabelFor(url: string | null): string {
  if (!url) return "Open";
  if (url.startsWith("/tasks")) return "Open Task";
  if (url.startsWith("/rentals")) return "Open Rental";
  if (url.startsWith("/payment-arrangements")) return "Open Arrangement";
  if (url.startsWith("/vehicles")) return "Open Vehicle";
  if (url.startsWith("/deposits")) return "Open Deposit";
  if (url.startsWith("/maintenance")) return "Open Maintenance";
  if (url.startsWith("/incidents")) return "Open Incident";
  return "Open";
}

export function makeAddDelivery(s: StoreState): AddDeliveryFn {
  return (input) => {
    const now = new Date().toISOString();
    const d: NotificationDelivery = {
      id: uid("ndv"),
      tenant_id: TENANT_ID,
      notification_id: input.notificationId,
      recipient_user_id: input.recipientUserId,
      channel: input.channel,
      destination: input.destination,
      status: input.status,
      provider: input.provider ?? null,
      provider_message_id: input.providerMessageId ?? null,
      attempt_count: input.attemptCount ?? 1,
      last_attempt_at: now,
      sent_at: input.status === "sent" ? now : null,
      failed_at: input.status === "failed" ? now : null,
      failure_reason: input.failureReason ?? null,
      created_at: now,
    };
    // Synchronous success-lock: record SENT email deliveries in a ref so the
    // success-lock check in retryEmail is not defeated by a stale-closure read
    // of s.notificationDeliveries inside a single batched act().
    if (input.channel === "email" && input.status === "sent") {
      s.sentEmailLocks.current.add(input.notificationId);
    }
    s.setNotificationDeliveries((ds) => [d, ...ds]);
  };
}

/** Send an email for a notification, appending a delivery record. Used for the
 *  initial delivery (attempt_count = 1). */
export async function deliverEmail(
  s: StoreState,
  n: Notification,
  reason: string,
  addDelivery: AddDeliveryFn,
): Promise<void> {
  const staff = s.staff.find((x) => x.id === n.recipient_user_id);
  if (!staff || !staff.email) {
    s.sentEmailLocks.current.delete(n.id);
    addDelivery({
      notificationId: n.id,
      recipientUserId: n.recipient_user_id,
      channel: "email",
      destination: staff?.email ?? "(no email)",
      status: "skipped",
      failureReason: "Recipient has no email address on file.",
    });
    return;
  }
  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    s.sentEmailLocks.current.delete(n.id);
    addDelivery({
      notificationId: n.id,
      recipientUserId: n.recipient_user_id,
      channel: "email",
      destination: staff.email,
      status: "skipped",
      provider: provider.name,
      failureReason: "No email provider configured.",
    });
    return;
  }
  const content = buildEmailContent({
    companyName: s.tenant.business_name,
    title: n.title,
    message: n.message,
    entityLabel: n.entity_label,
    actionLabel: actionLabelFor(n.action_url),
    actionUrl: n.action_url
      ? `https://fleet.connectpro.app${n.action_url}`
      : null,
    reason,
  });
  const result = await provider.send({
    to: staff.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
  if (!result.ok) {
    s.sentEmailLocks.current.delete(n.id);
  }
  addDelivery({
    notificationId: n.id,
    recipientUserId: n.recipient_user_id,
    channel: "email",
    destination: staff.email,
    status: result.ok ? "sent" : "failed",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    failureReason: result.failureReason ?? null,
  });
}

/** Send a retried email, recording the incremented attempt_count. */
export async function retryEmailSend(
  s: StoreState,
  n: Notification,
  attemptCount: number,
  addDelivery: AddDeliveryFn,
): Promise<void> {
  const staff = s.staff.find((x) => x.id === n.recipient_user_id);
  if (!staff || !staff.email) {
    addDelivery({
      notificationId: n.id,
      recipientUserId: n.recipient_user_id,
      channel: "email",
      destination: staff?.email ?? "(no email)",
      status: "skipped",
      failureReason: "Recipient has no email address on file.",
      attemptCount,
    });
    return;
  }
  const provider = getEmailProvider();
  if (!provider.isConfigured()) {
    addDelivery({
      notificationId: n.id,
      recipientUserId: n.recipient_user_id,
      channel: "email",
      destination: staff.email,
      status: "skipped",
      provider: provider.name,
      failureReason: "No email provider configured.",
      attemptCount,
    });
    return;
  }
  const reason =
    NOTIFICATION_RULES[n.notification_type]?.reason ??
    "an operational event occurred";
  const content = buildEmailContent({
    companyName: s.tenant.business_name,
    title: n.title,
    message: n.message,
    entityLabel: n.entity_label,
    actionLabel: actionLabelFor(n.action_url),
    actionUrl: n.action_url
      ? `https://fleet.connectpro.app${n.action_url}`
      : null,
    reason,
  });
  const result = await provider.send({
    to: staff.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
  addDelivery({
    notificationId: n.id,
    recipientUserId: n.recipient_user_id,
    channel: "email",
    destination: staff.email,
    status: result.ok ? "sent" : "failed",
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    failureReason: result.failureReason ?? null,
    attemptCount,
  });
}
