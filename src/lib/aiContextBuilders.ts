// Connect Pro Fleet — AI operational context builders (Build #27).
//
// Pure functions returning STRUCTURED data so a future AI Ops Manager / Daily
// Briefing can answer questions WITHOUT scraping UI components. These do NOT
// call an LLM and do NOT generate prose answers. The context is permission-
// filtered: a viewer without financial permission does not receive balances;
// a viewer without documents.view_sensitive does not receive raw document
// numbers (masked only). Banking details are never exposed here regardless of
// match status — banking remains permission-gated.

import type { UnifiedTimelineEvent } from "./timelineTypes";
import type {
  Customer360Sources,
  Customer360Summary,
} from "./customer360Selectors";
import type {
  VehicleTwinSources,
  VehicleDigitalTwinSummary,
} from "./vehicleTwinSelectors";
import type { DateRange } from "./profitabilityHelpers";
import {
  getCustomer360Summary,
  getCustomerAttentionItems,
  getCustomerRelationshipStatus,
} from "./customer360Selectors";
import {
  getVehicleDigitalTwinSummary,
  getVehicleAttentionItems,
  getAvailableIdleVehicles,
} from "./vehicleTwinSelectors";
import { getCustomerTimeline, getVehicleTimeline } from "./timelineComposer";
import { safeDocumentNumber } from "./complianceSelectors";
import type { DocumentRecord } from "./complianceTypes";

export interface ViewerPermissions {
  canViewFinancials: boolean;
  canViewProfitability: boolean;
  canViewSensitiveDocs: boolean;
  canViewBanking: boolean;
}

/** Strip financial amounts from timeline events when the viewer lacks financial
 *  permission. The event title/category remain (e.g. "Payment recorded") but
 *  the dollar amount is removed so money never leaks through the timeline. */
export function filterTimelineForViewer(
  events: UnifiedTimelineEvent[],
  perms: ViewerPermissions,
): UnifiedTimelineEvent[] {
  if (perms.canViewFinancials) return events;
  return events.map((e) => ({
    ...e,
    financial_amount: null,
    financial_direction: null,
    metadata:
      e.metadata && !perms.canViewFinancials
        ? stripFinancialMetadata(e.metadata)
        : e.metadata,
  }));
}

function stripFinancialMetadata(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/amount|balance|cost|price|revenue|payment|charge/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Mask document numbers in timeline metadata when the viewer lacks
 *  documents.view_sensitive. Raw file references are removed entirely. */
export function filterSensitiveDocsForViewer(
  events: UnifiedTimelineEvent[],
  perms: ViewerPermissions,
): UnifiedTimelineEvent[] {
  if (perms.canViewSensitiveDocs) return events;
  return events.map((e) => {
    if (!e.sensitive) return e;
    const meta = e.metadata ? { ...e.metadata } : null;
    if (meta && "masked_number" in meta) {
      // Already masked by the normalizer — keep masked.
    }
    if (meta && "file_reference" in meta) {
      delete meta.file_reference;
    }
    return { ...e, metadata: meta };
  });
}

export interface CustomerOperationalContext {
  customerId: string;
  customerName: string;
  relationshipStatus: string;
  summary: Omit<
    Customer360Summary,
    "outstandingBalance" | "currentDepositHeld"
  > & {
    outstandingBalance: number | null;
    currentDepositHeld: number | null;
  };
  attentionItems: ReturnType<typeof getCustomerAttentionItems>;
  recentTimeline: UnifiedTimelineEvent[];
  documents: Array<{
    document_type: string;
    status: string;
    verification: string;
    document_number: string | null;
    expiration_date: string | null;
  }>;
}

/** Build a structured operational context for a customer. Permission-filtered:
 *  balances are null when the viewer lacks financial permission; document
 *  numbers are masked when the viewer lacks documents.view_sensitive. */
export function buildCustomerOperationalContext(
  customerId: string,
  src: Customer360Sources,
  perms: ViewerPermissions,
  now: Date = new Date(),
): CustomerOperationalContext {
  const s = src.store;
  const summary = getCustomer360Summary(customerId, src, now);
  const attention = getCustomerAttentionItems(customerId, src, now);
  const relationship = getCustomerRelationshipStatus(
    summary,
    s.reservations.some((r) => r.customer_id === customerId),
  );

  let timeline = getCustomerTimeline(customerId, src);
  timeline = filterTimelineForViewer(timeline, perms);
  timeline = filterSensitiveDocsForViewer(timeline, perms);
  const recentTimeline = timeline.slice(0, 20);

  const documents = (src.documents ?? [])
    .filter((d) => d.entity_type === "customer" && d.entity_id === customerId)
    .map((d: DocumentRecord) => ({
      document_type: d.document_type,
      status: d.status,
      verification: d.verification_status,
      document_number: safeDocumentNumber(d, perms.canViewSensitiveDocs),
      expiration_date: d.expiration_date,
    }));

  return {
    customerId,
    customerName: s.customerName(customerId),
    relationshipStatus: relationship,
    summary: {
      ...summary,
      outstandingBalance: perms.canViewFinancials
        ? summary.outstandingBalance
        : null,
      currentDepositHeld: perms.canViewFinancials
        ? summary.currentDepositHeld
        : null,
    },
    attentionItems: attention,
    recentTimeline,
    documents,
  };
}

export interface VehicleOperationalContext {
  vehicleId: string;
  vehicleLabel: string;
  summary: Omit<VehicleDigitalTwinSummary, never>;
  attentionItems: ReturnType<typeof getVehicleAttentionItems>;
  recentTimeline: UnifiedTimelineEvent[];
  idleVehicles: ReturnType<typeof getAvailableIdleVehicles>;
}

/** Build a structured operational context for a vehicle. Permission-filtered. */
export function buildVehicleOperationalContext(
  vehicleId: string,
  src: VehicleTwinSources,
  range: DateRange,
  perms: ViewerPermissions,
  now: Date = new Date(),
): VehicleOperationalContext {
  const s = src.store;
  const vehicle = s.vehicles.find((v) => v.id === vehicleId);
  const summary = getVehicleDigitalTwinSummary(vehicleId, src, range, now);
  const attention = getVehicleAttentionItems(vehicleId, src, range, now);

  let timeline = getVehicleTimeline(vehicleId, src);
  timeline = filterTimelineForViewer(timeline, perms);
  timeline = filterSensitiveDocsForViewer(timeline, perms);
  const recentTimeline = timeline.slice(0, 20);

  return {
    vehicleId,
    vehicleLabel: vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`
      : vehicleId,
    summary,
    attentionItems: attention,
    recentTimeline,
    idleVehicles: perms.canViewProfitability
      ? getAvailableIdleVehicles(src, range, now)
      : [],
  };
}
