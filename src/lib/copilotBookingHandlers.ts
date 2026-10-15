// Connect Pro Fleet — Copilot booking-request handlers (Build #62).
//
// Each handler answers from the AUTHORITATIVE BookingRequest store (Build #60)
// — never a second source of truth. A Booking Request is intake only; it is
// NOT a confirmed Reservation. Financial amounts are not involved at the
// request level (no charge ledger), so these answers are counts + statuses +
// deep links, not money.
//
// The bundle is OPTIONAL on CopilotSources: when the BookingRequestProvider is
// not mounted (e.g. older Copilot tests), handlers return a graceful fallback.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import type {
  BookingRequest,
  BookingCopilotSources,
} from "./bookingRequestTypes";
import {
  BOOKING_REQUEST_STATUS_LABELS,
  BOOKING_REQUEST_SOURCE_LABELS,
  type BookingRequestStatus,
} from "./bookingRequestTypes";
import { baseAnswer, plural } from "./copilotShared";
import { fmtDateShort } from "./format";

function bookingSrc(src: CopilotSources): BookingCopilotSources | null {
  return src.booking ?? null;
}

function staffName(
  src: BookingCopilotSources,
  id: string | null,
): string | null {
  if (!id) return null;
  const s = src.staff.find((x) => x.id === id);
  return s ? s.full_name : null;
}

function customerName(r: BookingRequest): string {
  return `${r.first_name} ${r.last_name}`;
}

function vehicleLabel(src: BookingCopilotSources, r: BookingRequest): string {
  if (r.requested_vehicle_id) {
    const v = src.vehicles.find((x) => x.id === r.requested_vehicle_id);
    if (v) return `${v.make} ${v.model}`;
  }
  if (r.requested_vehicle_class_id) {
    const cls = src.vehicleClasses.find(
      (x) => x.id === r.requested_vehicle_class_id,
    );
    if (cls) return cls.name;
  }
  return "Any vehicle";
}

function requestedDates(r: BookingRequest): string {
  if (r.requested_start_date && r.requested_end_date) {
    return `${fmtDateShort(r.requested_start_date)} → ${fmtDateShort(
      r.requested_end_date,
    )}`;
  }
  if (r.requested_start_date)
    return `from ${fmtDateShort(r.requested_start_date)}`;
  return "Dates TBD";
}

function deepLink(r: BookingRequest): string {
  return `/rental-management?tab=booking&request=${r.id}`;
}

/** "How many new booking requests do I have?" */
export function answerBookingRequestsNew(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("booking_requests_new", asOf, perms, "derived");
  const bs = bookingSrc(src);
  if (!bs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Booking Request tracking is available in the full workspace. Open Rental Management → Booking Requests.",
    };
  }
  const fresh = bs.bookingRequests.filter((r) => r.status === "new");
  return {
    ...base,
    answer_type: "list",
    summary:
      fresh.length === 0
        ? "No new booking requests right now."
        : `You have ${fresh.length} ${plural(
            fresh.length,
            "new booking request",
          )} waiting for review.`,
    facts: [{ label: "New booking requests", value: fresh.length }],
    items: fresh.slice(0, 25).map((r) => ({
      id: r.id,
      title: customerName(r),
      subtitle: `${vehicleLabel(bs, r)} · ${requestedDates(r)}`,
      status: BOOKING_REQUEST_STATUS_LABELS[r.status],
      occurred_at: r.submitted_at,
      deep_link: deepLink(r),
    })),
    sources: fresh.slice(0, 10).map((r) => ({
      source_module: "booking_requests",
      entity_type: "booking_request",
      entity_id: r.id,
      label: customerName(r),
      deep_link: deepLink(r),
      occurred_at: r.submitted_at,
    })),
    suggested_actions: [
      {
        label: "Open Booking Requests",
        action_type: "view_booking_requests",
        deep_link: "/rental-management?tab=booking",
      },
    ],
    caveats: [
      "A booking request is intake — it is not a confirmed reservation until staff convert it.",
    ],
  };
}

/** "Which booking requests need follow-up?" */
export function answerBookingRequestsFollowUp(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("booking_requests_follow_up", asOf, perms, "derived");
  const bs = bookingSrc(src);
  if (!bs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Booking Request tracking is available in the full workspace. Open Rental Management → Booking Requests.",
    };
  }
  const items = bs.bookingRequests.filter(
    (r) => r.status === "needs_follow_up",
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No booking requests need follow-up right now."
        : `${items.length} ${plural(
            items.length,
            "booking request",
          )} ${plural(items.length, "needs", "need")} follow-up.`,
    facts: [{ label: "Requests needing follow-up", value: items.length }],
    items: items.slice(0, 25).map((r) => ({
      id: r.id,
      title: customerName(r),
      subtitle: `${vehicleLabel(bs, r)} · ${requestedDates(r)}`,
      status: BOOKING_REQUEST_STATUS_LABELS[r.status],
      occurred_at: r.submitted_at,
      deep_link: deepLink(r),
    })),
    sources: items.slice(0, 10).map((r) => ({
      source_module: "booking_requests",
      entity_type: "booking_request",
      entity_id: r.id,
      label: customerName(r),
      deep_link: deepLink(r),
      occurred_at: r.submitted_at,
    })),
    suggested_actions: [
      {
        label: "Open Booking Requests",
        action_type: "view_booking_requests",
        deep_link: "/rental-management?tab=booking",
      },
    ],
    caveats: [],
  };
}

/** "Do I have waitlisted customers? / Who is waiting for an SUV?" */
export function answerBookingRequestsWaitlisted(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    "booking_requests_waitlisted",
    asOf,
    perms,
    "derived",
  );
  const bs = bookingSrc(src);
  if (!bs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Booking Request tracking is available in the full workspace. Open Rental Management → Booking Requests.",
    };
  }
  const waitlisted = bs.bookingRequests.filter(
    (r) => r.status === "waitlisted",
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      waitlisted.length === 0
        ? "No waitlisted booking requests right now."
        : `${waitlisted.length} ${plural(
            waitlisted.length,
            "request",
          )} ${plural(waitlisted.length, "is", "are")} waitlisted.`,
    facts: [{ label: "Waitlisted requests", value: waitlisted.length }],
    items: waitlisted.slice(0, 25).map((r) => ({
      id: r.id,
      title: customerName(r),
      subtitle: `${vehicleLabel(bs, r)} · ${
        r.waitlist?.requested_dates ?? requestedDates(r)
      }`,
      status: BOOKING_REQUEST_STATUS_LABELS[r.status],
      occurred_at: r.submitted_at,
      deep_link: deepLink(r),
    })),
    sources: waitlisted.slice(0, 10).map((r) => ({
      source_module: "booking_requests",
      entity_type: "booking_request",
      entity_id: r.id,
      label: customerName(r),
      deep_link: deepLink(r),
      occurred_at: r.submitted_at,
    })),
    suggested_actions: [
      {
        label: "Open Booking Requests",
        action_type: "view_booking_requests",
        deep_link: "/rental-management?tab=booking",
      },
    ],
    caveats: [
      "Waitlisted requests do not create a reservation until staff convert them.",
    ],
  };
}

/** "Show me requests submitted today." */
export function answerBookingRequestsToday(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("booking_requests_today", asOf, perms, "derived");
  const bs = bookingSrc(src);
  if (!bs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Booking Request tracking is available in the full workspace. Open Rental Management → Booking Requests.",
    };
  }
  const todayIso = asOf.toISOString().slice(0, 10);
  const today = bs.bookingRequests.filter(
    (r) => r.submitted_at.slice(0, 10) === todayIso,
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      today.length === 0
        ? "No booking requests submitted today."
        : `${today.length} ${plural(
            today.length,
            "booking request",
          )} ${plural(today.length, "was", "were")} submitted today.`,
    facts: [{ label: "Submitted today", value: today.length }],
    items: today.slice(0, 25).map((r) => ({
      id: r.id,
      title: customerName(r),
      subtitle: `${vehicleLabel(bs, r)} · ${requestedDates(r)}`,
      status: BOOKING_REQUEST_STATUS_LABELS[r.status],
      occurred_at: r.submitted_at,
      deep_link: deepLink(r),
    })),
    sources: today.slice(0, 10).map((r) => ({
      source_module: "booking_requests",
      entity_type: "booking_request",
      entity_id: r.id,
      label: customerName(r),
      deep_link: deepLink(r),
      occurred_at: r.submitted_at,
    })),
    suggested_actions: [
      {
        label: "Open Booking Requests",
        action_type: "view_booking_requests",
        deep_link: "/rental-management?tab=booking",
      },
    ],
    caveats: [],
  };
}

/** "Tell me about Sarah's booking request." — entity-scoped (by name). */
export function answerBookingRequestSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  query: string,
): CopilotAnswer {
  const base = baseAnswer("booking_request_summary", asOf, perms, "derived");
  const bs = bookingSrc(src);
  if (!bs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Booking Request tracking is available in the full workspace. Open Rental Management → Booking Requests.",
    };
  }
  const q = query.toLowerCase();
  // Match by first name, last name, full name, or email fragment.
  const matches = bs.bookingRequests.filter((r) => {
    const full = customerName(r).toLowerCase();
    return (
      full.includes(q) ||
      r.first_name.toLowerCase().includes(q) ||
      r.last_name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q)
    );
  });
  if (matches.length === 0) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I couldn't find a booking request matching that name. Open Rental Management → Booking Requests to see all requests.",
    };
  }
  // If multiple match, surface the first as the summary but note the count.
  const r = matches[0];
  const status: BookingRequestStatus = r.status;
  const assigned = staffName(bs, r.assigned_to);
  const facts = [
    { label: "Customer", value: customerName(r) },
    { label: "Status", value: BOOKING_REQUEST_STATUS_LABELS[status] },
    { label: "Requested", value: vehicleLabel(bs, r) },
    { label: "Dates", value: requestedDates(r) },
    { label: "Source", value: BOOKING_REQUEST_SOURCE_LABELS[r.source] },
    {
      label: "Driver's license",
      value:
        r.driver_license_status === "not_provided"
          ? "Not provided"
          : r.driver_license_status === "expired"
            ? "Expired"
            : "Provided",
    },
    { label: "Assigned to", value: assigned ?? "Unassigned" },
  ];
  return {
    ...base,
    answer_type: "entity",
    summary: `Booking request for ${customerName(r)} — ${BOOKING_REQUEST_STATUS_LABELS[status]}. ${vehicleLabel(
      bs,
      r,
    )}, ${requestedDates(r)}. ${
      r.converted_reservation_id
        ? "Already converted to a reservation."
        : "Intake only — not yet a reservation."
    }`,
    facts,
    items: [
      {
        id: r.id,
        title: customerName(r),
        subtitle: `${vehicleLabel(bs, r)} · ${requestedDates(r)}`,
        status: BOOKING_REQUEST_STATUS_LABELS[status],
        occurred_at: r.submitted_at,
        deep_link: deepLink(r),
      },
    ],
    sources: [
      {
        source_module: "booking_requests",
        entity_type: "booking_request",
        entity_id: r.id,
        label: customerName(r),
        deep_link: deepLink(r),
        occurred_at: r.submitted_at,
      },
    ],
    suggested_actions: [
      {
        label: "Open request",
        action_type: "view_booking_request",
        deep_link: deepLink(r),
      },
    ],
    caveats: [
      "A booking request is intake — not a reservation until staff convert it.",
      ...(matches.length > 1
        ? [`${matches.length} requests matched that name; showing the first.`]
        : []),
    ],
  };
}
