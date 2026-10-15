// Connect Pro Fleet — Booking Request selectors (pure, presentation shapes).
//
// Derives Booking Request list rows + Action Center attention items from the
// authoritative BookingRequest[] + the existing customers/vehicles/classes.
// No new source of truth; no mutation.

import type {
  BookingRequest,
  BookingAttentionItem,
} from "./bookingRequestTypes";
import type { Customer, Vehicle, VehicleClass } from "./types";
import { normalizeEmail, normalizePhone } from "./bookingRequestCustomerMatch";

export interface BookingRequestRow {
  id: string;
  request_number: string;
  customer_name: string;
  phone: string;
  email: string;
  vehicle_label: string;
  class_label: string;
  requested_dates: string;
  source: BookingRequest["source"];
  status: BookingRequest["status"];
  driver_license_status: BookingRequest["driver_license_status"];
  verification_status: BookingRequest["verification_status"];
  assigned_to: string | null;
  submitted_at: string;
  customer_id: string | null;
  converted_reservation_id: string | null;
}

function vehicleLabel(
  v: Vehicle | undefined,
  classes: VehicleClass[],
): { vehicle: string; classLabel: string } {
  if (v) {
    const cls = classes.find((c) => c.id === v.vehicle_class_id);
    return {
      vehicle: `${v.make} ${v.model}`,
      classLabel: cls?.name ?? "—",
    };
  }
  return { vehicle: "—", classLabel: "—" };
}

export function selectBookingRequestRows(args: {
  requests: BookingRequest[];
  vehicles: Vehicle[];
  vehicleClasses: VehicleClass[];
  query: string;
  filter: string;
}): BookingRequestRow[] {
  const { requests, vehicles, vehicleClasses, query, filter } = args;
  const q = query.trim().toLowerCase();
  return requests
    .filter((r) => {
      if (filter === "all") return true;
      return r.status === filter;
    })
    .filter((r) => {
      if (!q) return true;
      const v = vehicles.find((x) => x.id === r.requested_vehicle_id);
      const cls = vehicleClasses.find(
        (c) => c.id === r.requested_vehicle_class_id,
      );
      const text = [
        r.id,
        r.first_name,
        r.last_name,
        r.phone,
        r.email,
        v ? `${v.make} ${v.model}` : "",
        cls?.name ?? "",
        r.status,
        r.source,
      ].join(" ");
      return text.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
    .map((r) => {
      const v = vehicles.find((x) => x.id === r.requested_vehicle_id);
      const cls = vehicleClasses.find(
        (c) => c.id === r.requested_vehicle_class_id,
      );
      const vl = vehicleLabel(v, vehicleClasses);
      const dates =
        r.requested_start_date && r.requested_end_date
          ? `${r.requested_start_date} → ${r.requested_end_date}`
          : r.requested_start_date
            ? `from ${r.requested_start_date}`
            : "Dates TBD";
      return {
        id: r.id,
        request_number: r.id.replace("brq_", "BRQ-").toUpperCase(),
        customer_name: `${r.first_name} ${r.last_name}`,
        phone: r.phone,
        email: r.email,
        vehicle_label: vl.vehicle,
        class_label: cls?.name ?? vl.classLabel,
        requested_dates: dates,
        source: r.source,
        status: r.status,
        driver_license_status: r.driver_license_status,
        verification_status: r.verification_status,
        assigned_to: r.assigned_to,
        submitted_at: r.submitted_at,
        customer_id:
          r.customer_match.kind === "matched"
            ? r.customer_match.customer_id
            : null,
        converted_reservation_id: r.converted_reservation_id,
      };
    });
}

/** Action Center attention items derived from booking requests.
 *  - New requests (high — never reviewed)
 *  - Missing driver's license (high)
 *  - Needs follow-up (medium)
 *  - Waitlisted (medium — surface when vehicle becomes available)
 *  No second task queue; this composes the same briefing-style attention model. */
export function selectBookingAttentionItems(args: {
  requests: BookingRequest[];
  customers: Customer[];
}): BookingAttentionItem[] {
  const { requests, customers } = args;
  const items: BookingAttentionItem[] = [];
  for (const r of requests) {
    if (
      r.status === "converted_to_reservation" ||
      r.status === "declined" ||
      r.status === "cancelled"
    )
      continue;
    if (r.status === "new") {
      items.push({
        id: `booking:new:${r.id}`,
        booking_request_id: r.id,
        reason: `New booking request from ${r.first_name} ${r.last_name}`,
        priority: "high",
        deep_link: `/rental-management?tab=booking&request=${r.id}`,
      });
    }
    if (
      r.driver_license_status === "not_provided" &&
      r.status !== "waitlisted"
    ) {
      items.push({
        id: `booking:missing_license:${r.id}`,
        booking_request_id: r.id,
        reason: `Missing driver's license — ${r.first_name} ${r.last_name}`,
        priority: "high",
        deep_link: `/rental-management?tab=booking&request=${r.id}`,
      });
    }
    if (r.status === "needs_follow_up") {
      items.push({
        id: `booking:follow_up:${r.id}`,
        booking_request_id: r.id,
        reason: `Booking request needs follow-up — ${r.first_name} ${r.last_name}`,
        priority: "medium",
        deep_link: `/rental-management?tab=booking&request=${r.id}`,
      });
    }
    if (r.status === "waitlisted") {
      items.push({
        id: `booking:waitlisted:${r.id}`,
        booking_request_id: r.id,
        reason: `Waitlisted request — ${r.first_name} ${r.last_name} (${
          r.waitlist?.requested_dates ?? "dates pending"
        })`,
        priority: "medium",
        deep_link: `/rental-management?tab=booking&request=${r.id}`,
      });
    }
  }
  // Touch customers to keep the signature honest (future: name enrichment).
  void customers;
  return items;
}

export { normalizeEmail, normalizePhone };
