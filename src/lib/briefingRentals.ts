// Connect Pro Fleet — Daily Briefing rental + reservation selectors (Build #28).
//
// DERIVED from the rental store + reservation store. Reuses the existing
// dashboard helpers (returnsToday, pickupsToday) where they already exist, and
// the rental-lifecycle status set. Open-ended rentals are NOT falsely flagged as
// overdue returns — an overdue return requires a scheduled_return_date in the
// past with an active/late/overdue status.
//
// Rental readiness composes vehicle availability + customer/vehicle compliance
// + deposit/agreement readiness using the existing company policy + compliance
// selectors. Only conditions ALREADY represented by actual company policies are
// enforced (no invented blockers). `asOf` is explicit + deterministic.

import type { BriefingItem, BriefingSources } from "./briefingTypes";
import { getComplianceBlock } from "./complianceAvailability";
import { getEntityComplianceStatus } from "./complianceStatus";
import { attentionKey } from "./briefingPriority";

const DAY = 86_400_000;
const ACTIVE_RENTAL_STATUSES = new Set([
  "active",
  "late",
  "overdue",
  "payment_due",
  "return_pending",
]);

function todayStr(asOf: Date): string {
  return asOf.toISOString().slice(0, 10);
}

/** Rentals starting today (confirmed reservations starting today + ready-for-
 *  checkout rentals checked out today). */
export function getRentalsStartingToday(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const today = todayStr(asOf);
  const items: BriefingItem[] = [];
  for (const r of s.reservations) {
    if (r.start_date !== today) continue;
    if (r.status !== "confirmed") continue;
    const vehicle = s.vehicles.find((v) => v.id === r.vehicle_id);
    const block = getComplianceBlock(
      r.vehicle_id,
      vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Vehicle",
      src.requirements ?? [],
      src.documents ?? [],
      src.overrides ?? [],
      asOf,
    );
    const readiness = getRentalReadiness(r.id, src, asOf);
    const priority =
      readiness === "blocked"
        ? "critical"
        : readiness === "attention"
          ? "high"
          : "medium";
    items.push({
      id: attentionKey("rental", "reservation", r.id, "starts_today"),
      category: "rental",
      priority,
      title: "Rental starting today",
      reason:
        readiness === "blocked"
          ? `Blocked — ${block.reasons.join("; ")}`
          : readiness === "attention"
            ? "Attention needed before pickup"
            : "Ready for pickup",
      entity_type: "reservation",
      entity_id: r.id,
      customer_id: r.customer_id,
      vehicle_id: r.vehicle_id,
      occurred_at: r.start_date,
      status: r.status,
      action_type: "open_reservation",
      action_label: "Open Reservation",
      deep_link: `/reservations/${r.id}`,
      source_module: "reservations",
      source_entity: "reservation",
      source_id: r.id,
      sensitive: false,
    });
  }
  return items;
}

/** Rentals returning today (scheduled return today, active/return_pending). */
export function getRentalsReturningToday(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const today = todayStr(asOf);
  return s.rentals
    .filter(
      (r) =>
        !r.actual_return_date &&
        r.scheduled_return_date === today &&
        ACTIVE_RENTAL_STATUSES.has(r.status),
    )
    .map((r) => ({
      id: attentionKey("rental", "rental", r.id, "returns_today"),
      category: "rental" as const,
      priority: "medium" as const,
      title: "Rental returning today",
      reason: `Scheduled return ${r.scheduled_return_date}${r.scheduled_return_time ? ` at ${r.scheduled_return_time}` : ""}`,
      entity_type: "rental",
      entity_id: r.id,
      customer_id: r.customer_id,
      vehicle_id: r.vehicle_id,
      occurred_at: r.scheduled_return_date,
      status: r.status,
      action_type: "view_rental",
      action_label: "View Rental",
      deep_link: `/rentals/${r.id}`,
      source_module: "rentals",
      source_entity: "rental",
      source_id: r.id,
      sensitive: false,
    }));
}

/** Overdue returns — past scheduled return, still active/late/overdue. Respects
 *  the rental model: an open-ended rental (no scheduled_return_date) is never
 *  flagged as an overdue return. */
export function getOverdueReturns(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const today = todayStr(asOf);
  const todayTs = new Date(today + "T00:00:00").getTime();
  return s.rentals
    .filter((r) => {
      if (!ACTIVE_RENTAL_STATUSES.has(r.status)) return false;
      if (!r.scheduled_return_date) return false; // open-ended never overdue
      const due = new Date(r.scheduled_return_date + "T00:00:00").getTime();
      if (isNaN(due)) return false;
      return due < todayTs;
    })
    .map((r) => {
      const due = new Date(r.scheduled_return_date + "T00:00:00").getTime();
      const ageDays = Math.max(1, Math.round((todayTs - due) / DAY));
      return {
        id: attentionKey("rental", "rental", r.id, "overdue_return"),
        category: "rental" as const,
        priority: (ageDays >= 3 ? "critical" : "high") as "critical" | "high",
        title: "Overdue return",
        reason: `Was due ${r.scheduled_return_date} · ${ageDays}d past scheduled return`,
        entity_type: "rental",
        entity_id: r.id,
        customer_id: r.customer_id,
        vehicle_id: r.vehicle_id,
        occurred_at: r.scheduled_return_date,
        age_days: ageDays,
        status: r.status,
        action_type: "view_rental",
        action_label: "View Rental",
        deep_link: `/rentals/${r.id}`,
        source_module: "rentals",
        source_entity: "rental",
        source_id: r.id,
        sensitive: false,
      };
    });
}

/** Extension attention — rentals nearing end where the rental model allows
 *  extensions (open-ended not forced). Surfaces return_pending rentals needing
 *  an extension/return decision. */
export function getExtensionAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const today = todayStr(asOf);
  const todayTs = new Date(today + "T00:00:00").getTime();
  return s.rentals
    .filter((r) => r.status === "return_pending" && r.scheduled_return_date)
    .map((r) => {
      const due = new Date(r.scheduled_return_date + "T00:00:00").getTime();
      const within =
        !isNaN(due) && due <= todayTs + 2 * DAY && due >= todayTs - DAY;
      if (!within) return null;
      return {
        id: attentionKey("rental", "rental", r.id, "extension_decision"),
        category: "rental" as const,
        priority: "high" as const,
        title: "Extension / return decision needed",
        reason: `Rental scheduled to return ${r.scheduled_return_date}`,
        entity_type: "rental",
        entity_id: r.id,
        customer_id: r.customer_id,
        vehicle_id: r.vehicle_id,
        occurred_at: r.scheduled_return_date,
        status: r.status,
        action_type: "view_rental",
        action_label: "View Rental",
        deep_link: `/rentals/${r.id}`,
        source_module: "rentals",
        source_entity: "rental",
        source_id: r.id,
        sensitive: false,
      } as BriefingItem;
    })
    .filter((x): x is BriefingItem => x !== null);
}

/** Reservation attention — confirmed reservations today missing a vehicle or
 *  blocked by compliance. */
export function getReservationAttention(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const today = todayStr(asOf);
  const items: BriefingItem[] = [];
  for (const r of s.reservations) {
    if (r.start_date !== today) continue;
    if (r.status !== "confirmed") continue;
    if (!r.vehicle_id) {
      items.push({
        id: attentionKey("reservation", "reservation", r.id, "missing_vehicle"),
        category: "rental",
        priority: "high",
        title: "Reservation today missing vehicle",
        reason: "Confirmed reservation starting today has no assigned vehicle",
        entity_type: "reservation",
        entity_id: r.id,
        customer_id: r.customer_id,
        occurred_at: r.start_date,
        status: r.status,
        action_type: "open_reservation",
        action_label: "Open Reservation",
        deep_link: `/reservations/${r.id}`,
        source_module: "reservations",
        source_entity: "reservation",
        source_id: r.id,
        sensitive: false,
      });
      continue;
    }
    const block = getComplianceBlock(
      r.vehicle_id,
      s.vehicles.find((v) => v.id === r.vehicle_id) ? "Vehicle" : "Vehicle",
      src.requirements ?? [],
      src.documents ?? [],
      src.overrides ?? [],
      asOf,
    );
    if (block.blocked) {
      items.push({
        id: attentionKey(
          "reservation",
          "reservation",
          r.id,
          "compliance_block",
        ),
        category: "compliance",
        priority: "critical",
        title: "Reservation vehicle compliance block",
        reason: `Vehicle blocked — ${block.reasons.join("; ")}`,
        entity_type: "reservation",
        entity_id: r.id,
        vehicle_id: r.vehicle_id,
        occurred_at: r.start_date,
        status: r.status,
        action_type: "open_reservation",
        action_label: "Open Reservation",
        deep_link: `/reservations/${r.id}`,
        source_module: "compliance",
        source_entity: "reservation",
        source_id: r.id,
        sensitive: false,
      });
    }
  }
  return items;
}

export type RentalReadiness = "ready" | "attention" | "blocked";

/** Rental readiness for a rental id: composes vehicle availability + customer +
 *  vehicle compliance blocks + deposit/agreement readiness using existing
 *  company policy + compliance selectors. Only enforces conditions already
 *  represented by actual company policies. */
export function getRentalReadiness(
  rentalId: string,
  src: BriefingSources,
  asOf: Date,
): RentalReadiness {
  const s = src.store;
  const r = s.rentals.find((x) => x.id === rentalId);
  const res = r?.reservation_id
    ? s.reservations.find((x) => x.id === r.reservation_id)
    : null;
  const vehicleId = r?.vehicle_id ?? res?.vehicle_id ?? null;
  const customerId = r?.customer_id ?? res?.customer_id ?? null;

  // Vehicle compliance block
  if (vehicleId) {
    const vBlock = getComplianceBlock(
      vehicleId,
      "Vehicle",
      src.requirements ?? [],
      src.documents ?? [],
      src.overrides ?? [],
      asOf,
    );
    if (vBlock.blocked) return "blocked";
  }
  // Customer compliance block (DL)
  if (customerId) {
    const cBlock = getEntityComplianceStatus(
      "customer",
      customerId,
      s.customerName(customerId),
      src.requirements ?? [],
      src.documents ?? [],
      src.overrides ?? [],
      asOf,
    );
    if (cBlock.status === "blocked") return "blocked";
  }
  // Deposit + agreement readiness (attention if not yet satisfied)
  if (r) {
    if (!r.checkout_date) {
      // Ready-for-checkout but not yet started — attention unless fully ready
      return "attention";
    }
  }
  if (res && res.status === "confirmed") {
    // Confirmed reservation not yet converted — attention (needs checkout)
    return "attention";
  }
  return "ready";
}
