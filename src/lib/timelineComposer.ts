// Connect Pro Fleet — unified timeline composer (Build #27).
//
// Composes module-specific normalizer output into a single sorted, filterable,
// paginated timeline for a customer or vehicle. Pure functions over a
// TimelineSources bundle — no store access, fully testable. Newest-first by
// default; malformed dates sort last (timestamp 0). Financial amounts are
// carried on events for permission-gated rendering; the permission filter
// (timelinePermissions.ts) strips them before display.

import type {
  UnifiedTimelineEvent,
  TimelineSortOrder,
  TimelineCategory,
} from "./timelineTypes";
import type {
  RentalAgreement,
  Reservation,
  Vehicle,
  Customer,
  Staff,
} from "./types";
import type { FinancialTransaction } from "./chargeTypes";
import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type { DocumentRecord, ComplianceEvent } from "./complianceTypes";
import type { VaultDocument, VaultEvent } from "./vaultTypes";
import type { Task, TaskEvent } from "./taskTypes";
import type { OperationalStaffAssignment } from "./staffTypes";
import type { CustomerNote } from "./customerNoteTypes";
import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
} from "./maintenanceTypes";
import type { FleetStore } from "./store/storeContext";
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
  noteTimelineEvents,
} from "./timelineMiscNormalizer";
import { safeParseDate } from "./timelineShared";
import { vehicleVaultTimeline } from "./timelineVaultNormalizer";

export interface TimelineSources {
  store: FleetStore;
  billingPeriods?: unknown[];
  damageClaims?: DamageClaim[];
  violations?: Violation[];
  documents?: DocumentRecord[];
  complianceEvents?: ComplianceEvent[];
  expenses?: unknown[];
  tasks?: Task[];
  taskEvents?: TaskEvent[];
  assignments?: OperationalStaffAssignment[];
  notes?: CustomerNote[];
  workOrderEvents?: { event: MaintenanceWorkOrderEvent; vehicleId: string }[];
  vaultDocs?: VaultDocument[];
  vaultEvents?: VaultEvent[];
}

/** Compose the unified timeline for a CUSTOMER. Pulls rentals, reservations,
 *  payments, damage, violations, compliance, tasks, assignments, and notes. */
export function getCustomerTimeline(
  customerId: string,
  src: TimelineSources,
): UnifiedTimelineEvent[] {
  const s = src.store;
  const events: UnifiedTimelineEvent[] = [];

  const custRentals = s.rentals.filter((r) => r.customer_id === customerId);
  for (const r of custRentals) {
    events.push(...rentalTimelineEvents(r, s.vehicleExchanges(r.id)));
  }

  const custRes = s.reservations.filter((r) => r.customer_id === customerId);
  for (const r of custRes) events.push(...reservationTimelineEvents(r));

  const custTxns = s.transactions.filter((t) => t.customer_id === customerId);
  for (const t of custTxns) {
    const ev = paymentTimelineEvents(t);
    if (ev) events.push(ev);
  }

  for (const c of src.damageClaims ?? []) {
    if (c.customer_id === customerId) events.push(...damageTimelineEvents(c));
  }

  for (const v of src.violations ?? []) {
    if (v.customer_id === customerId)
      events.push(...violationTimelineEvents(v));
  }

  for (const d of src.documents ?? []) {
    if (d.entity_type === "customer" && d.entity_id === customerId)
      events.push(...complianceTimelineEvents(d));
  }

  for (const t of src.tasks ?? []) {
    if (t.entity_type === "customer" && t.entity_id === customerId)
      events.push(...taskTimelineEvents(t, src.taskEvents ?? []));
  }

  for (const a of src.assignments ?? []) {
    if (a.entity_type === "customer" && a.entity_id === customerId)
      events.push(assignmentTimelineEvents(a));
  }

  for (const n of src.notes ?? []) {
    if (n.customer_id === customerId) events.push(noteTimelineEvents(n));
  }

  return sortTimeline(events, "newest");
}

/** Compose the unified timeline for a VEHICLE. Pulls rentals (via vehicle_id +
 *  exchange history), maintenance, damage, violations, compliance, expenses. */
export function getVehicleTimeline(
  vehicleId: string,
  src: TimelineSources,
): UnifiedTimelineEvent[] {
  const s = src.store;
  const events: UnifiedTimelineEvent[] = [];

  // Rentals where the vehicle was EVER assigned (current or via exchange).
  const custRentals = s.rentals.filter((r) => {
    if (r.vehicle_id === vehicleId) return true;
    return s
      .vehicleExchanges(r.id)
      .some(
        (ex) =>
          ex.old_vehicle_id === vehicleId || ex.new_vehicle_id === vehicleId,
      );
  });
  for (const r of custRentals) {
    events.push(...rentalTimelineEvents(r, s.vehicleExchanges(r.id)));
  }

  // Maintenance work orders + their event logs.
  for (const wo of s.workOrders) {
    if (wo.vehicle_id === vehicleId) {
      events.push(...maintenanceTimelineEvents(wo));
      for (const we of src.workOrderEvents ?? []) {
        if (we.event.work_order_id === wo.id) {
          const ev = maintenanceEventTimeline(we.event, vehicleId);
          if (ev) events.push(ev);
        }
      }
    }
  }

  for (const c of src.damageClaims ?? []) {
    if (c.vehicle_id === vehicleId) events.push(...damageTimelineEvents(c));
  }

  for (const v of src.violations ?? []) {
    if (v.vehicle_id === vehicleId) events.push(...violationTimelineEvents(v));
  }

  for (const d of src.documents ?? []) {
    if (d.entity_type === "vehicle" && d.entity_id === vehicleId)
      events.push(...complianceTimelineEvents(d));
  }

  for (const ev of src.complianceEvents ?? []) {
    const doc = (src.documents ?? []).find((d) => d.id === ev.document_id);
    if (doc && doc.entity_type === "vehicle" && doc.entity_id === vehicleId) {
      events.push(complianceEventTimeline(ev, doc));
    }
  }

  // Build #45 — Vehicle Document Vault events.
  if (src.vaultDocs) {
    events.push(
      ...vehicleVaultTimeline(vehicleId, src.vaultDocs, src.vaultEvents ?? []),
    );
  }

  return sortTimeline(events, "newest");
}

/** Sort timeline events. Newest-first by default; malformed dates (ts 0) last. */
export function sortTimeline(
  events: UnifiedTimelineEvent[],
  order: TimelineSortOrder = "newest",
): UnifiedTimelineEvent[] {
  const sorted = [...events].sort(
    (a, b) => safeParseDate(b.occurred_at) - safeParseDate(a.occurred_at),
  );
  return order === "oldest" ? sorted.reverse() : sorted;
}

/** Filter timeline by category. Empty/undefined filter = all. */
export function filterTimeline(
  events: UnifiedTimelineEvent[],
  categories: TimelineCategory[] | undefined,
): UnifiedTimelineEvent[] {
  if (!categories || categories.length === 0) return events;
  const set = new Set(categories);
  return events.filter((e) => set.has(e.category));
}

/** Paginate a timeline for long-history performance. */
export function paginateTimeline(
  events: UnifiedTimelineEvent[],
  page: number,
  pageSize: number,
): { items: UnifiedTimelineEvent[]; hasMore: boolean; total: number } {
  const total = events.length;
  const start = (page - 1) * pageSize;
  const items = events.slice(start, start + pageSize);
  return { items, hasMore: start + pageSize < total, total };
}
