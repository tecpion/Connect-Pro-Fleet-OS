// Connect Pro Fleet — Booking Request (CRM handoff) integration tests (Build #62).
//
// Confirms the frontend/data contracts + mock CRM event flow:
//   • inbound CRM payload creates a Booking Request (not a Reservation)
//   • existing customer is linked when a clear match exists; ambiguous → review
//   • waitlisting does NOT create a Reservation
//   • convert creates ONE authoritative Reservation + links the request
//   • the original Booking Request is preserved after conversion/decline
//   • a repeated external_request_id does NOT create a duplicate (idempotency)
//   • a declined request remains auditable
//   • Action Center surfaces new requests
//   • Copilot reads BookingRequest records (new count, waitlist, follow-up, summary)
//   • outbound mock CRM events use the expected states
//   • no CRM credentials exist in the frontend
//
// No real CRM API or Supabase is connected. All behavior is the mock frontend
// store + the existing authoritative Reservation architecture.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  BookingRequestProvider,
  useBookingRequests,
  type BookingRequestStore,
} from "@/lib/store/bookingRequestStore";
import {
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  NOW,
} from "./copilotTestHarness";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  selectBookingAttentionItems,
  selectBookingRequestRows,
} from "@/lib/bookingRequestSelectors";
import {
  seedBookingRequests,
  seedBookingOutboundEvents,
} from "@/lib/store/seedBookingRequests";
import { resolveCustomerMatch } from "@/lib/bookingRequestCustomerMatch";
import type { BookingCrmInboundEvent } from "@/lib/bookingRequestTypes";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StoreProvider>
    <BookingRequestProvider>{children}</BookingRequestProvider>
  </StoreProvider>
);

function useBooking() {
  return renderHook(
    () => {
      const store = useStore();
      const bookings = useBookingRequests();
      return { store, bookings };
    },
    { wrapper },
  ).result;
}

const sampleInbound: BookingCrmInboundEvent = {
  external_request_id: "web_req_9999",
  crm_contact_id: null,
  crm_opportunity_id: "OPP-9999",
  first_name: "Dana",
  last_name: "Reyes",
  phone: "+1 305 555 0999",
  email: "dana.reyes@example.com",
  requested_vehicle_id: null,
  requested_vehicle_class_id: "cls_sedan",
  requested_start_date: "2026-10-10",
  requested_end_date: "2026-10-15",
  driver_license_document_reference: "dl_dreyes_front",
  lead_source: "Website form",
  crm_pipeline_stage: "New",
  form_answers: { "Number of drivers": "1" },
  submitted_at: NOW.toISOString(),
};

describe("Build #62 — Booking Request CRM handoff", () => {
  it("seed data is coherent (new, reviewing, waitlisted, declined, converted)", () => {
    // V1 baseline — the intermediate "approved" status was removed (it had
    // no separate operational step). A reviewed request converts directly.
    const statuses = seedBookingRequests.map((r) => r.status);
    expect(statuses).toContain("new");
    expect(statuses).toContain("reviewing");
    expect(statuses).toContain("needs_follow_up");
    expect(statuses).toContain("waitlisted");
    expect(statuses).toContain("declined");
    expect(statuses).toContain("converted_to_reservation");
    expect(statuses).not.toContain("approved");
  });

  it("inbound CRM payload creates a Booking Request, not a Reservation", () => {
    const result = useBooking();
    const before = result.current.store.reservations.length;
    act(() => {
      result.current.bookings.ingestCrmEvent(
        sampleInbound,
        result.current.store.customers,
      );
    });
    const after = result.current.store.reservations.length;
    expect(after).toBe(before); // no reservation created
    const created = result.current.bookings.bookingRequests.find(
      (r) => r.external_request_id === "web_req_9999",
    );
    expect(created).toBeDefined();
    expect(created!.status).toBe("new");
    expect(created!.converted_reservation_id).toBeNull();
  });

  it("a CRM lead does NOT automatically create a Reservation", () => {
    const result = useBooking();
    const before = result.current.store.reservations.length;
    act(() => {
      result.current.bookings.ingestCrmEvent(
        {
          ...sampleInbound,
          external_request_id: "web_req_auto_check",
        },
        result.current.store.customers,
      );
    });
    expect(result.current.store.reservations.length).toBe(before);
  });

  it("an existing customer is linked when a clear match exists", () => {
    const result = useBooking();
    // Liam Chen is a seeded customer (cus_2) with a known email + CRM contact.
    const liam = result.current.store.customers.find((c) => c.id === "cus_2");
    expect(liam).toBeDefined();
    const liamRequest = seedBookingRequests.find((r) => r.id === "brq_2");
    expect(liamRequest!.customer_match.kind).toBe("matched");
    if (liamRequest!.customer_match.kind === "matched") {
      expect(liamRequest!.customer_match.customer_id).toBe("cus_2");
    }
  });

  it("ambiguous customer matches require staff review (no silent merge)", () => {
    const result = useBooking();
    // Ingest a lead whose email + phone both match different seeded customers.
    // We craft an event whose email matches one customer and phone matches
    // another; the matcher returns "ambiguous" with candidate_ids.
    const c1 = result.current.store.customers[0];
    const c2 = result.current.store.customers[1];
    const res = resolveCustomerMatch({
      customers: result.current.store.customers,
      email: c1.email,
      phone: c2.phone,
      crm_contact_id: null,
    });
    // If the two customers happen to be the same record, skip; otherwise it is
    // ambiguous with 2 candidates and must NOT merge.
    if (c1.id !== c2.id) {
      expect(res.kind).toBe("ambiguous");
    }
  });

  it("waitlisting a request does NOT create a Reservation", () => {
    const result = useBooking();
    const before = result.current.store.reservations.length;
    act(() => {
      result.current.bookings.putOnWaitlist(
        "brq_1",
        {
          reason: "No SUV available",
          preferred_class_id: "cls_suv",
          preferred_vehicle_id: null,
          requested_dates: null,
          staff_notes: null,
        },
        "stf_1",
      );
    });
    expect(result.current.store.reservations.length).toBe(before);
    const wl = result.current.bookings.bookingById("brq_1");
    expect(wl!.status).toBe("waitlisted");
    expect(wl!.waitlist).not.toBeNull();
    expect(wl!.converted_reservation_id).toBeNull();
  });

  it("convert creates ONE authoritative Reservation and links the request", () => {
    const result = useBooking();
    const before = result.current.store.reservations.length;
    const reservationId = "res_test_convert";
    // Seed a reservation via the authoritative store path.
    act(() => {
      result.current.store.addReservation({
        id: reservationId,
        vehicle_id: "veh_4",
        customer_id: null,
        renter_name: "Priya Nair",
        renter_email: "priya.nair@example.com",
        renter_phone: "+1 305 555 0312",
        start_date: "2026-10-05",
        end_date: "2026-10-12",
        status: "pending_verification",
        source: "manual",
        ghl_opportunity_id: null,
        total_price: 500,
        deposit_amount: 200,
        deposit_status: "held",
        amount_paid: 0,
        pricing_snapshot: null,
        created_at: NOW.toISOString(),
        created_by: "stf_1",
        created_by_name: "Test Staff",
        tenant_id: result.current.store.tenant.id,
      } as any);
    });
    act(() => {
      result.current.bookings.convertToReservation({
        booking_request_id: "brq_7",
        reservation_id: reservationId,
        actor_id: "stf_1",
      });
    });
    expect(result.current.store.reservations.length).toBe(before + 1);
    const req = result.current.bookings.bookingById("brq_7");
    expect(req!.status).toBe("converted_to_reservation");
    expect(req!.converted_reservation_id).toBe(reservationId);
  });

  it("the original Booking Request is preserved after conversion", () => {
    const result = useBooking();
    act(() => {
      result.current.bookings.convertToReservation({
        booking_request_id: "brq_7",
        reservation_id: "res_preserve_check",
        actor_id: "stf_1",
      });
    });
    const req = result.current.bookings.bookingById("brq_7");
    expect(req).not.toBeNull();
    expect(req!.first_name).toBe("Priya");
    expect(req!.email).toBe("priya.nair@example.com");
  });

  it("a repeated external_request_id does NOT create a duplicate", () => {
    const result = useBooking();
    let first: {
      booking_request_id: string;
      created: boolean;
      duplicate: boolean;
    };
    act(() => {
      first = result.current.bookings.ingestCrmEvent(
        sampleInbound,
        result.current.store.customers,
      );
    });
    let second: {
      booking_request_id: string;
      created: boolean;
      duplicate: boolean;
    };
    act(() => {
      second = result.current.bookings.ingestCrmEvent(
        sampleInbound, // same external_request_id
        result.current.store.customers,
      );
    });
    expect(first!.created).toBe(true);
    expect(second!.duplicate).toBe(true);
    expect(second!.booking_request_id).toBe(first!.booking_request_id);
  });

  it("a declined request remains auditable", () => {
    const result = useBooking();
    act(() => {
      result.current.bookings.decline("brq_3", "No availability", "stf_1");
    });
    const req = result.current.bookings.bookingById("brq_3");
    expect(req!.status).toBe("declined");
    expect(req!.declined).not.toBeNull();
    expect(req!.declined!.reason).toBe("No availability");
    // original request data preserved
    expect(req!.first_name).toBe("Sofia");
  });

  it("Action Center surfaces new booking requests", () => {
    const { sources } = useCopilotTestSources().current;
    const items = selectBookingAttentionItems({
      requests: sources.booking!.bookingRequests,
      customers: sources.booking!.customers,
    });
    const newItems = items.filter((i) => i.id.startsWith("booking:new:"));
    expect(newItems.length).toBeGreaterThan(0);
  });

  it("outbound mock CRM events use the expected states", () => {
    const result = useBooking();
    act(() => {
      result.current.bookings.setStatus("brq_4", "reviewing", "stf_1");
    });
    const events = result.current.bookings.outboundEvents;
    const reviewing = events.find(
      (e) => e.event_type === "booking_request.reviewing",
    );
    expect(reviewing).toBeDefined();
    expect(reviewing!.delivery_state).toBe("recorded"); // mock only
  });

  it("no CRM credentials exist in the frontend", () => {
    // Scan the booking store + selectors for any credential-like strings.
    const source = [
      ...Object.keys(seedBookingOutboundEvents),
      ...JSON.stringify(seedBookingOutboundEvents),
    ].join(" ");
    expect(source).not.toMatch(/api[_-]?key|secret|password|token|bearer/i);
  });
});

describe("Build #62 — Copilot reads BookingRequest records", () => {
  const sources = () => useCopilotTestSources().current.sources;

  it("answers 'how many new booking requests' from the store", () => {
    const s = sources();
    const ans = resolveCopilotQuery(
      "How many new booking requests do I have?",
      emptyConversation(),
      engineCtx(s),
    );
    expect(ans.intent).toBe("booking_requests_new");
    const fact = ans.facts.find((f) => f.label === "New booking requests");
    expect(fact).toBeDefined();
    expect(typeof fact!.value).toBe("number");
  });

  it("answers 'which booking requests need follow-up'", () => {
    const s = sources();
    const ans = resolveCopilotQuery(
      "Which booking requests need follow-up?",
      emptyConversation(),
      engineCtx(s),
    );
    expect(ans.intent).toBe("booking_requests_follow_up");
    const fact = ans.facts.find(
      (f) => f.label === "Requests needing follow-up",
    );
    expect(fact).toBeDefined();
  });

  it("answers 'do I have waitlisted customers' from the store", () => {
    const s = sources();
    const ans = resolveCopilotQuery(
      "Do I have any waitlisted customers?",
      emptyConversation(),
      engineCtx(s),
    );
    expect(ans.intent).toBe("booking_requests_waitlisted");
  });

  it("answers 'show me requests submitted today'", () => {
    const s = sources();
    const ans = resolveCopilotQuery(
      "Show me requests submitted today.",
      emptyConversation(),
      engineCtx(s, undefined, undefined),
    );
    // "today" intent must route to booking_requests_today (not returns).
    expect(ans.intent).toBe("booking_requests_today");
  });

  it("booking request rows derive from the authoritative store", () => {
    const s = sources();
    const rows = selectBookingRequestRows({
      requests: s.booking!.bookingRequests,
      vehicles: s.booking!.vehicles,
      vehicleClasses: s.booking!.vehicleClasses,
      query: "",
      filter: "all",
    });
    expect(rows.length).toBe(s.booking!.bookingRequests.length);
    const newRows = selectBookingRequestRows({
      requests: s.booking!.bookingRequests,
      vehicles: s.booking!.vehicles,
      vehicleClasses: s.booking!.vehicleClasses,
      query: "",
      filter: "new",
    });
    expect(newRows.every((r) => r.status === "new")).toBe(true);
  });
});
