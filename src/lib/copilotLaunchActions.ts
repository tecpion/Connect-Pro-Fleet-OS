// Connect Pro Fleet — Copilot Create Task + Draft Message actions (Build #33).
//
// The Copilot never mutates — it prepares bounded previews the user confirms.
// Create Task dedupes against existing open tasks via stable occurrence ids.
// Draft Messages use factual fields only, never auto-send, and each customer's
// draft is isolated (no cross-customer leakage).

import type {
  CopilotDraftMessage,
  CopilotSources,
  CopilotTaskPreviewItem,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { getComplianceAttention } from "./briefingFleet";
import { getOverdueAccounts } from "./briefingMoney";
import { formatMoney } from "./copilotShared";

/** Build a Create-Task preview from compliance attention items. The Copilot
 *  never mutates — it prepares a bounded preview the user confirms. Dedupes
 *  against existing open tasks via stable occurrence ids. */
export function buildCreateTaskPreview(
  src: CopilotSources,
  asOf: Date,
  existingOpenTaskOccurrenceIds: Set<string>,
): CopilotTaskPreviewItem[] {
  const compliance = getComplianceAttention(src.briefing, asOf);
  const previews: CopilotTaskPreviewItem[] = [];
  for (const c of compliance) {
    const occurrenceId = c.id; // stable attention_key
    if (existingOpenTaskOccurrenceIds.has(occurrenceId)) continue; // dedupe
    previews.push({
      occurrence_id: occurrenceId,
      title: c.title,
      description: c.reason ?? c.title,
      entity_type: c.entity_type,
      entity_id: c.entity_id,
      deep_link: c.deep_link,
    });
  }
  return previews.slice(0, 10); // bounded
}

/** Draft overdue payment reminders for all overdue customers. The Copilot
 *  drafts but never sends. Uses factual fields only. Each draft is isolated
 *  (no customer sees another's data). */
export function buildOverdueDraftMessages(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  companyName: string,
): CopilotDraftMessage[] {
  if (!perms.canViewFinancials) return [];
  const overdue = getOverdueAccounts(src.briefing, asOf);
  const drafts: CopilotDraftMessage[] = [];
  for (const o of overdue) {
    const custId = o.customer_id ?? o.entity_id;
    const customer = src.briefing.store.customers.find((c) => c.id === custId);
    const firstName = (customer?.first_name ?? o.title).split(" ")[0];
    const amount = o.amount ?? 0;
    const dueAt = o.due_at;
    const rentalNum = o.rental_id
      ? (src.briefing.store.rentals.find((r) => r.id === o.rental_id)
          ?.agreement_number ?? o.rental_id)
      : null;
    const body = `Hi ${firstName},\n\nThis is a friendly reminder that your payment of ${formatMoney(amount)}${
      dueAt ? ` was due ${new Date(dueAt).toLocaleDateString()}` : ""
    }${
      rentalNum ? ` for rental ${rentalNum}` : ""
    }. Please reach out to ${companyName} to bring your account current.\n\nThank you,\n${companyName}`;
    drafts.push({
      customer_id: custId,
      customer_name: o.title,
      subject: "Payment reminder",
      body,
      deep_link: `/customers/${custId}`,
    });
  }
  return drafts.slice(0, 10); // bounded
}
