// Connect Pro Fleet — email provider abstraction (Build #12).
//
// Provider-neutral interface for sending internal staff operational emails.
// Domain events call the Notification service; the Notification service handles
// delivery. Email logic is NOT hardwired into taskStore, rentalStore, etc.
//
// Email must be REAL, not simulated. If no production provider credentials are
// available in the current environment, the integration abstraction is built
// correctly and exposes configuration/error state — it never silently fakes a
// successful send. A delivery is recorded as SENT only after the provider
// returns success; a failure is recorded as FAILED with a clear reason.
//
// Customer marketing/reminder emails are OUT OF SCOPE — those belong to Connect
// Pro. This is internal staff operational email only.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  ok: boolean;
  provider: string;
  providerMessageId?: string;
  failureReason?: string;
}

export interface EmailProvider {
  readonly name: string;
  /** Whether the provider is configured and ready to send. When false, emails
   *  are SKIPPED (not faked as sent). */
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * No-op / fallback provider used when no real email provider credentials are
 * available in the current environment. It is honest: it reports NOT
 * configured, and `send` always fails with a clear reason so the delivery
 * record is marked FAILED (never a fake SENT). In-app notifications still work.
 *
 * In production, swap this for a real provider (e.g. Resend, Postmark, SES)
 * that reads credentials from server-side env and returns a real provider
 * message id on success.
 */
export const nullEmailProvider: EmailProvider = {
  name: "none",
  isConfigured: () => false,
  async send(_message: EmailMessage): Promise<EmailSendResult> {
    return {
      ok: false,
      provider: "none",
      failureReason:
        "No email provider is configured. Set up an email integration in Settings to send staff notifications.",
    };
  },
};

/** The active email provider. In a real deployment this would be injected from
 *  server-side config. For now it's the honest null provider. */
let activeProvider: EmailProvider = nullEmailProvider;

export function setEmailProvider(provider: EmailProvider): void {
  activeProvider = provider;
}

export function getEmailProvider(): EmailProvider {
  return activeProvider;
}

/** Build a clean HTML + plain-text operational email. Operational, not
 *  promotional: title, concise message, linked entity/context, primary CTA,
 *  company name, and the reason the user received the email. */
export function buildEmailContent(input: {
  companyName: string;
  title: string;
  message: string;
  entityLabel?: string | null;
  actionLabel?: string;
  actionUrl?: string | null;
  reason: string;
}): { subject: string; html: string; text: string } {
  const subject = input.title;
  const cta = input.actionUrl
    ? `<a href="${input.actionUrl}" style="display:inline-block;background:#2251EA;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">${input.actionLabel ?? "Open"}</a>`
    : "";
  const entityRow = input.entityLabel
    ? `<tr><td style="padding:4px 0;color:#5a6472;">Related to</td><td style="padding:4px 0;font-weight:600;">${input.entityLabel}</td></tr>`
    : "";
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F2F4F3;font-family:Inter,Arial,sans-serif;color:#1B2430;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#1B2430;padding:18px 24px;">
          <span style="color:#ffffff;font-weight:700;font-size:15px;font-family:'Space Grotesk',Arial,sans-serif;">${escapeHtml(input.companyName)}</span>
          <span style="color:#9aa3b2;font-size:12px;margin-left:8px;">via Connect Pro Fleet</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:18px;font-family:'Space Grotesk',Arial,sans-serif;">${escapeHtml(input.title)}</h1>
          <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.5;">${escapeHtml(input.message)}</p>
          <table cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:18px;">${entityRow}</table>
          ${cta}
          <p style="margin:18px 0 0;color:#9aa3b2;font-size:12px;">You received this email because: ${escapeHtml(input.reason)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    input.title,
    "",
    input.message,
    input.entityLabel ? `\nRelated to: ${input.entityLabel}` : "",
    input.actionUrl
      ? `\n${input.actionLabel ?? "Open"}: ${input.actionUrl}`
      : "",
    `\n— ${input.companyName} via Connect Pro Fleet`,
    `\nYou received this email because: ${input.reason}.`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
