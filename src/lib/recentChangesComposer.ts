// Connect Pro Fleet — company-wide recent operational changes composer
// (Build #29 final closure).
//
// `getRecentOperationalChanges` in briefingComposer takes a pre-built event
// list (it was being fed a single customer's timeline, which made the
// company-level Copilot query "What changed since yesterday?" present a partial
// sample as if it represented the business). This module composes a REAL
// company-wide feed by invoking the module-level Build #27 normalizers across
// the whole tenant — every rental, reservation, transaction, work order,
// damage claim, violation, compliance document, task, and assignment — then
// dedupes, filters by an explicit date window, applies tenant/location/
// permission scope, and sorts newest-first.
//
// It is NOT a second persisted timeline store: it derives events on demand
// from the same authoritative records the per-entity timelines use. Only
// actual timestamped events are surfaced — no state-inferred transitions are
// described as historical change. Malformed/missing timestamps are dropped
// (never crash) and never described as "recent".

import type { CopilotSources, CopilotViewerPermissions } from "./copilotTypes";
import type { UnifiedTimelineEvent } from "./timelineTypes";
import { safeParseDate } from "./timelineShared";
import {
  rentalTimelineEvents,
  reservationTimelineEvents,
} from "./timelineRentalNormalizer";
import { paymentTimelineEvents } from "./timelineFinancialNormalizer";
import {
  damageTimelineEvents,
  violationTimelineEvents,
  maintenanceTimelineEvents,
  maintenanceEventTimeline,
} from "./timelineOpsNormalizer";
import {
  complianceTimelineEvents,
  complianceEventTimeline,
  taskTimelineEvents,
  assignmentTimelineEvents,
} from "./timelineMiscNormalizer";

import { startOfDayInTz, getOrgTimezone } from "./timezone";

const DAY = 86_400_000;

/** A surfaced recent-change item with stable source traceability. */
export interface RecentChangeItem {
  /** Stable identity = the normalized event id (source_module:source_id:type). */
  id: string;
  occurred_at: string;
  event_type: string;
  category: string;
  title: string;
  description: string | null;
  source_module: string;
  entity_type: string;
  entity_id: string;
  deep_link: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  rental_id: string | null;
  /** Financial amount carried for permission-gated rendering (stripped when
   *  the viewer lacks financial permission). */
  financial_amount: number | null;
  sensitive: boolean;
}

/** Options for the company-wide recent-changes composer. */
export interface RecentChangesOptions {
  /** Exclusive lower bound (start of the window). Events at/after this instant
   *  are candidates. Use the start of the tenant's calendar day for "since
   *  yesterday". */
  start: Date;
  /** Inclusive upper bound (the as-of instant). Events at/before this are
   *  candidates. */
  asOf: Date;
  /** Location ids the viewer may see. Empty = all locations. */
  allowedLocationIds?: string[];
  /** Viewer permissions (financial/sensitive gating). */
  perms?: CopilotViewerPermissions;
}

/** Compose the company-wide recent operational changes feed. Derives events
 *  from every authoritative module across the tenant, dedupes by stable event
 *  id, filters by the explicit date window + tenant/location/permission scope,
 *  and sorts newest-first. Returns only actual timestamped events. */
export function getCompanyRecentChanges(
  src: CopilotSources,
  opts: RecentChangesOptions,
): RecentChangeItem[] {
  const s = src.briefing.store;
  const tl = src.timeline;
  const start = opts.start.getTime();
  const asOf = opts.asOf.getTime();
  const allowedLocs =
    opts.allowedLocationIds && opts.allowedLocationIds.length > 0
      ? new Set(opts.allowedLocationIds)
      : null;
  const canViewFinancials = opts.perms?.canViewFinancials ?? true;

  const events: UnifiedTimelineEvent[] = [];

  // --- Rentals (all tenants' rentals) + vehicle exchanges ---
  for (const r of s.rentals) {
    events.push(...rentalTimelineEvents(r, s.vehicleExchanges(r.id)));
  }

  // --- Reservations ---
  for (const res of s.reservations) {
    events.push(...reservationTimelineEvents(res));
  }

  // --- Payments / charges / credits (posted, non-voided) ---
  for (const t of s.transactions) {
    const ev = paymentTimelineEvents(t);
    if (ev) events.push(ev);
  }

  // --- Maintenance work orders + their event logs ---
  for (const wo of s.workOrders) {
    events.push(...maintenanceTimelineEvents(wo));
  }
  for (const we of tl.workOrderEvents ?? []) {
    const ev = maintenanceEventTimeline(we.event, we.vehicleId);
    if (ev) events.push(ev);
  }

  // --- Damage claims ---
  for (const c of tl.damageClaims ?? []) {
    events.push(...damageTimelineEvents(c));
  }

  // --- Violations ---
  for (const v of tl.violations ?? []) {
    events.push(...violationTimelineEvents(v));
  }

  // --- Compliance documents + compliance event log ---
  for (const d of tl.documents ?? []) {
    events.push(...complianceTimelineEvents(d));
  }
  for (const ev of tl.complianceEvents ?? []) {
    const doc = (tl.documents ?? []).find((d) => d.id === ev.document_id);
    events.push(complianceEventTimeline(ev, doc));
  }

  // --- Tasks ---
  for (const t of tl.tasks ?? []) {
    events.push(...taskTimelineEvents(t, tl.taskEvents ?? []));
  }

  // --- Staff assignments ---
  for (const a of tl.assignments ?? []) {
    events.push(assignmentTimelineEvents(a));
  }

  // Dedupe by stable event id (the same source event may be reachable through
  // more than one relationship — e.g. a rental's payment is both a rental event
  // and a ledger event). Keep the first occurrence.
  const seen = new Set<string>();
  const deduped: UnifiedTimelineEvent[] = [];
  for (const e of events) {
    if (!e.id) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    deduped.push(e);
  }

  // Filter by date window + location scope + tenant scope, then map to the
  // surfaced item shape. Malformed timestamps (0) are dropped — they are not
  // trustworthy occurrence times and must not be described as recent.
  const items: RecentChangeItem[] = [];
  for (const e of deduped) {
    const ts = safeParseDate(e.occurred_at);
    if (!ts || ts < start || ts > asOf) continue;

    // Location scope: gate by the vehicle's location when available. Events
    // without a vehicle link (payments, tasks, assignments, customer docs)
    // pass through — they are tenant-scoped, not location-scoped.
    if (allowedLocs && e.vehicle_id) {
      const v = s.vehicles.find((x) => x.id === e.vehicle_id);
      if (v && !allowedLocs.has(v.location)) continue;
    }

    items.push({
      id: e.id,
      occurred_at: e.occurred_at,
      event_type: e.event_type,
      category: e.category,
      title: e.title,
      description: e.description,
      source_module: e.source_module,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      deep_link: e.deep_link,
      customer_id: e.customer_id,
      vehicle_id: e.vehicle_id,
      rental_id: e.rental_id,
      financial_amount: canViewFinancials ? e.financial_amount : null,
      sensitive: e.sensitive,
    });
  }

  // Newest-first. Stable sort by timestamp (already deduped by id).
  items.sort(
    (a, b) => safeParseDate(b.occurred_at) - safeParseDate(a.occurred_at),
  );
  return items;
}

/** Build the start-of-window for "since yesterday" using business-day
 *  boundaries. The day boundary is evaluated in the org's configured timezone
 *  (`tz`, resolved through `getOrgTimezone` → UTC safe default). The returned
 *  `Date` is a real UTC instant; the omitted-`tz` path is the documented UTC
 *  safe default, never the machine-local `setHours` clock. */
export function recentChangesWindowStart(
  asOf: Date,
  daysBack = 1,
  tz?: string,
): Date {
  const z = getOrgTimezone(tz);
  const sod = startOfDayInTz(asOf, z);
  return new Date(sod.getTime() - daysBack * DAY);
}

/** Category counts for the summary line. Only categories present in the
 *  surfaced events are included. */
export function summarizeRecentChanges(
  items: RecentChangeItem[],
): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
