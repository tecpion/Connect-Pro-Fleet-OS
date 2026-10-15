// Connect Pro Fleet — Vehicle Vault timeline normalizer (Build #45).
//
// Transforms VaultDocument records + their VaultEvent audit log into
// UnifiedTimelineEvent entries for the vehicle timeline (spec §37, §38). Pure
// functions — no store access. Generated records (Cash Expense Record, Bill of
// Sale) surface as document events; uploaded files surface as upload events.
// Signed/voided/amended events come from the VaultEvent audit log.

import type { VaultDocument, VaultEvent } from "./vaultTypes";
import type { UnifiedTimelineEvent } from "./timelineTypes";
import { timelineId } from "./timelineShared";

/** Build timeline events for a single vault document: a created/uploaded/
 *  generated event plus any audit-log events (signed, voided, amended). */
export function vaultDocTimelineEvents(
  doc: VaultDocument,
  auditEvents: VaultEvent[],
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  const base = {
    entity_type: "vehicle" as const,
    entity_id: doc.vehicle_id,
    related_entity_type: null as string | null,
    related_entity_id: null as string | null,
    source_module: "vault",
    actor_id: doc.created_by,
    actor_name: null,
    financial_amount: doc.amount ?? doc.purchase_price ?? null,
    financial_direction:
      doc.amount != null || doc.purchase_price != null
        ? ("out" as const)
        : null,
    severity: "info" as const,
    status: doc.status,
    deep_link: `/vehicles/${doc.vehicle_id}`,
    sensitive: false,
    customer_id: null,
    vehicle_id: doc.vehicle_id,
    rental_id: null,
    metadata: {
      document_number: doc.document_number,
      category: doc.category,
    },
  };

  // Primary creation event (uploaded or generated).
  const createdLabel =
    doc.source === "generated"
      ? doc.kind === "cash_expense_record"
        ? "Cash Expense Record generated"
        : doc.kind === "bill_of_sale"
          ? "Bill of Sale generated"
          : doc.kind === "purchase_record"
            ? "Purchase Record generated"
            : "Document generated"
      : "Document uploaded";
  events.push({
    ...base,
    id: timelineId("vault", doc.id, "created"),
    occurred_at: doc.created_at,
    event_type:
      doc.source === "generated" ? "vault_generated" : "vault_uploaded",
    category: "document",
    title: `${createdLabel} — ${doc.document_number}`,
    description: doc.title,
  });

  // Audit-log events (signed, voided, amended, replaced).
  for (const ae of auditEvents) {
    if (
      ae.type === "created" ||
      ae.type === "uploaded" ||
      ae.type === "generated"
    )
      continue; // already covered by the primary event
    events.push({
      ...base,
      id: timelineId("vault", doc.id, ae.type),
      occurred_at: ae.at,
      event_type: `vault_${ae.type}`,
      category: "document",
      title: `${doc.document_number} — ${ae.label}`,
      description: null,
      actor_id: ae.actor_id,
    });
  }

  return events;
}

/** All vault timeline events for a vehicle (across all its documents). */
export function vehicleVaultTimeline(
  vehicleId: string,
  docs: VaultDocument[],
  auditEvents: VaultEvent[],
): UnifiedTimelineEvent[] {
  const events: UnifiedTimelineEvent[] = [];
  for (const doc of docs) {
    if (doc.vehicle_id !== vehicleId) continue;
    const docEvents = auditEvents.filter((e) => e.document_id === doc.id);
    events.push(...vaultDocTimelineEvents(doc, docEvents));
  }
  return events;
}
