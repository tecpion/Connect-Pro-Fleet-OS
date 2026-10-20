// Connect Pro Fleet — Booking Request store (CRM handoff foundation).
//
// Standalone React context (mirrors the caseCenterStore / defenseStore
// pattern) holding BookingRequest[] + BookingOutboundEvent[]. The store is the
// INTAKE + orchestration layer for CRM/website leads. It does NOT create a
// RentalAgreement — conversion builds ONE authoritative Reservation via the
// existing Fleet store's addReservation path and links back to it.
//
// Idempotency: inbound CRM events keyed by external_request_id. A repeated
// delivery updates (or is ignored) rather than creating a duplicate.
//
// Mock only: outbound CRM events are RECORDED, never delivered. No CRM
// credentials or secrets exist anywhere in the frontend.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FleetStore } from "./storeContext";
import type {
  BookingRequest,
  BookingOutboundEvent,
  BookingOutboundEventType,
  BookingCrmInboundEvent,
  BookingRequestStatus,
  CustomerMatchResolution,
  RentalDurationType,
} from "../bookingRequestTypes";
import { TENANT_ID } from "./ids";
import {
  persistBookingRequestInsert,
  persistBookingRequestUpdate,
  hydrateBookingRequests,
} from "../supabase/phase2StoreSync";
import { useAuth } from "../supabase/authContext";
import { resolveCustomerMatch } from "../bookingRequestCustomerMatch";
import {
  seedBookingRequests,
  seedBookingOutboundEvents,
} from "./seedBookingRequests";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export interface BookingIngestResult {
  booking_request_id: string;
  created: boolean;
  duplicate: boolean;
}

export interface ConvertToReservationInput {
  booking_request_id: string;
  /** The fully-formed Reservation created via the authoritative Fleet store.
   *  The booking store links back to it; it never builds the reservation. */
  reservation_id: string;
  actor_id: string;
}

export interface BookingRequestStore {
  bookingRequests: BookingRequest[];
  outboundEvents: BookingOutboundEvent[];

  bookingById: (id: string) => BookingRequest | null;
  nextRequestNumber: () => string;

  /** Idempotent CRM inbound ingestion. Returns the resulting request + whether
   *  it was newly created or a recognized duplicate (same external id). */
  ingestCrmEvent: (
    event: BookingCrmInboundEvent,
    customers: FleetStore["customers"],
  ) => BookingIngestResult;

  /** Manually create a booking request (staff-entered intake). */
  createBookingRequest: (input: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    requested_vehicle_id: string | null;
    requested_vehicle_class_id: string | null;
    requested_start_date: string | null;
    requested_end_date: string | null;
    rental_duration_type: RentalDurationType | null;
    notes: string | null;
    source: BookingRequest["source"];
    location_id: string | null;
    driver_license_document_reference: string | null;
    customers: FleetStore["customers"];
    actor_id: string;
  }) => string;

  setStatus: (
    id: string,
    status: BookingRequestStatus,
    actor_id: string,
  ) => void;
  assignStaff: (id: string, staff_id: string | null, actor_id: string) => void;
  putOnWaitlist: (
    id: string,
    input: {
      reason: string | null;
      preferred_class_id: string | null;
      preferred_vehicle_id: string | null;
      requested_dates: string | null;
      staff_notes: string | null;
    },
    actor_id: string,
  ) => void;
  decline: (id: string, reason: string, actor_id: string) => void;
  cancel: (id: string, reason: string, actor_id: string) => void;

  /** Convert an approved request to an authoritative Reservation. Links the
   *  request + records an outbound "converted" CRM event. Returns the
   *  reservation id (null if the request was not in an eligible status). */
  convertToReservation: (input: ConvertToReservationInput) => string | null;

  /** Update customer-match resolution (e.g. staff picks among ambiguous
   *  candidates). */
  resolveMatch: (id: string, resolution: CustomerMatchResolution) => void;
}

const BookingRequestContext = createContext<BookingRequestStore | null>(null);

function nowISO() {
  return new Date().toISOString();
}

function newOutbound(
  event_type: BookingOutboundEventType,
  booking_request_id: string | null,
  booking: BookingRequest | null,
  reservation_id: string | null,
  extra: Record<string, unknown> = {},
): BookingOutboundEvent {
  return {
    id: uid("boe"),
    organization_id: TENANT_ID,
    event_type,
    booking_request_id,
    crm_opportunity_id: booking?.crm_opportunity_id ?? null,
    crm_contact_id: booking?.crm_contact_id ?? null,
    reservation_id,
    rental_id: null,
    payload: extra,
    delivery_state: "recorded",
    created_at: nowISO(),
  };
}

// V1 baseline — "approved" removed. An eligible reviewed request converts
// directly to a Reservation (the moment of approval). No separate approve step.
const ELIGIBLE_CONVERT_STATUSES: BookingRequestStatus[] = [
  "new",
  "reviewing",
  "needs_follow_up",
];

export function BookingRequestProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] =
    useState<BookingRequest[]>(seedBookingRequests);
  const [outbound, setOutbound] = useState<BookingOutboundEvent[]>(
    seedBookingOutboundEvents,
  );
  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;

  // Phase 2: hydrate booking requests from Cloud on auth/org change. In
  // memory mode hydrateBookingRequests is a no-op and the seeded demo data
  // stays. The stale-closure `active` guard cancels async work after an org
  // switch so a slow org-A read never overwrites org-B's cache.
  useEffect(() => {
    if (!activeOrgId) return;
    let active = true;
    void hydrateBookingRequests(activeOrgId, {
      setBookingRequests: setRequests,
    })
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const store = useMemo<BookingRequestStore>(
    () => ({
      bookingRequests: requests,
      outboundEvents: outbound,

      bookingById: (id) => requests.find((r) => r.id === id) ?? null,
      nextRequestNumber: () =>
        `BRQ-${new Date().getFullYear()}-${String(requests.length + 1).padStart(
          4,
          "0",
        )}`,

      ingestCrmEvent: (event, customers) => {
        // Idempotency by external_request_id. If a request already exists with
        // the same external id, do NOT create a duplicate — update non-empty
        // fields and return duplicate:true.
        const existing = event.external_request_id
          ? requests.find(
              (r) => r.external_request_id === event.external_request_id,
            )
          : undefined;
        if (existing) {
          setRequests((rs) =>
            rs.map((r) =>
              r.id === existing.id
                ? {
                    ...r,
                    // Refresh CRM pipeline stage if the inbound carries a new one.
                    crm_pipeline_stage:
                      event.crm_pipeline_stage ?? r.crm_pipeline_stage,
                    updated_at: nowISO(),
                  }
                : r,
            ),
          );
          return {
            booking_request_id: existing.id,
            created: false,
            duplicate: true,
          };
        }
        const match = resolveCustomerMatch({
          customers,
          email: event.email,
          phone: event.phone,
          crm_contact_id: event.crm_contact_id,
        });
        const at = nowISO();
        const id = uid("brq");
        const created: BookingRequest = {
          id,
          organization_id: TENANT_ID,
          location_id: null,
          first_name: event.first_name,
          last_name: event.last_name,
          phone: event.phone,
          email: event.email,
          requested_vehicle_id: event.requested_vehicle_id,
          requested_vehicle_class_id: event.requested_vehicle_class_id,
          requested_start_date: event.requested_start_date,
          requested_end_date: event.requested_end_date,
          rental_duration_type: "unknown",
          notes: event.form_answers
            ? Object.entries(event.form_answers)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" | ")
            : null,
          driver_license_document_reference:
            event.driver_license_document_reference,
          driver_license_status: event.driver_license_document_reference
            ? "provided"
            : "not_provided",
          verification_status:
            match.kind === "ambiguous" ? "ambiguous" : "pending",
          source: event.crm_contact_id ? "connect_pro_crm" : "website",
          crm_contact_id: event.crm_contact_id,
          crm_opportunity_id: event.crm_opportunity_id,
          crm_pipeline_stage: event.crm_pipeline_stage,
          external_request_id: event.external_request_id,
          lead_source: event.lead_source,
          submitted_at: event.submitted_at,
          form_answers: event.form_answers,
          status: "new",
          assigned_to: null,
          customer_match: match,
          converted_reservation_id: null,
          declined: null,
          waitlist: null,
          created_at: at,
          updated_at: at,
          created_by: null,
        };
        setRequests((rs) => [created, ...rs]);
        persistBookingRequestInsert(created);
        return { booking_request_id: id, created: true, duplicate: false };
      },

      createBookingRequest: (input) => {
        const at = nowISO();
        const id = uid("brq");
        const match = resolveCustomerMatch({
          customers: input.customers,
          email: input.email,
          phone: input.phone,
          crm_contact_id: null,
        });
        const created: BookingRequest = {
          id,
          organization_id: TENANT_ID,
          location_id: input.location_id,
          first_name: input.first_name,
          last_name: input.last_name,
          phone: input.phone,
          email: input.email,
          requested_vehicle_id: input.requested_vehicle_id,
          requested_vehicle_class_id: input.requested_vehicle_class_id,
          requested_start_date: input.requested_start_date,
          requested_end_date: input.requested_end_date,
          rental_duration_type: input.rental_duration_type,
          notes: input.notes,
          driver_license_document_reference:
            input.driver_license_document_reference,
          driver_license_status: input.driver_license_document_reference
            ? "provided"
            : "not_provided",
          verification_status:
            match.kind === "ambiguous" ? "ambiguous" : "pending",
          source: input.source,
          crm_contact_id: null,
          crm_opportunity_id: null,
          crm_pipeline_stage: null,
          external_request_id: null,
          lead_source: input.source === "manual" ? "Manual entry" : null,
          submitted_at: at,
          form_answers: null,
          status: "new",
          assigned_to: null,
          customer_match: match,
          converted_reservation_id: null,
          declined: null,
          waitlist: null,
          created_at: at,
          updated_at: at,
          created_by: input.actor_id,
        };
        setRequests((rs) => [created, ...rs]);
        persistBookingRequestInsert(created);
        return id;
      },

      setStatus: (id, status, actor_id) => {
        const at = nowISO();
        const existing = requests.find((r) => r.id === id) ?? null;
        setRequests((rs) =>
          rs.map((r) => (r.id === id ? { ...r, status, updated_at: at } : r)),
        );
        if (existing) {
          const updated: BookingRequest = {
            ...existing,
            status,
            updated_at: at,
          };
          // Only "reviewing" emits an outbound CRM stage event. "approved" was
          // removed — conversion (booking_request.converted) is the approval
          // signal, emitted by convertToReservation.
          if (status === "reviewing") {
            setOutbound((os) => [
              newOutbound("booking_request.reviewing", id, updated, null, {
                actor_id,
              }),
              ...os,
            ]);
          }
          persistBookingRequestUpdate(updated.organization_id, id, {
            status,
            updated_at: at,
          });
        }
      },

      assignStaff: (id, staff_id, _actor_id) => {
        const at = nowISO();
        setRequests((rs) =>
          rs.map((r) =>
            r.id === id ? { ...r, assigned_to: staff_id, updated_at: at } : r,
          ),
        );
      },

      putOnWaitlist: (id, input, actor_id) => {
        const at = nowISO();
        let target: BookingRequest | null = null;
        setRequests((rs) =>
          rs.map((r) => {
            if (r.id !== id) return r;
            target = {
              ...r,
              status: "waitlisted",
              waitlist: {
                waitlisted_at: at,
                reason: input.reason,
                preferred_class_id: input.preferred_class_id,
                preferred_vehicle_id: input.preferred_vehicle_id,
                requested_dates: input.requested_dates,
                staff_notes: input.staff_notes,
              },
              updated_at: at,
            };
            return target;
          }),
        );
        if (target) {
          setOutbound((os) => [
            newOutbound("booking_request.waitlisted", id, target, null, {
              actor_id,
              reason: input.reason,
            }),
            ...os,
          ]);
        }
      },

      decline: (id, reason, actor_id) => {
        const at = nowISO();
        let target: BookingRequest | null = null;
        setRequests((rs) =>
          rs.map((r) => {
            if (r.id !== id) return r;
            target = {
              ...r,
              status: "declined",
              declined: {
                reason,
                declined_by: actor_id,
                declined_at: at,
              },
              updated_at: at,
            };
            return target;
          }),
        );
        if (target) {
          setOutbound((os) => [
            newOutbound("booking_request.declined", id, target, null, {
              actor_id,
              reason,
            }),
            ...os,
          ]);
        }
      },

      cancel: (id, reason, actor_id) => {
        const at = nowISO();
        setRequests((rs) =>
          rs.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "cancelled",
                  declined: {
                    reason,
                    declined_by: actor_id,
                    declined_at: at,
                  },
                  updated_at: at,
                }
              : r,
          ),
        );
      },

      convertToReservation: ({
        booking_request_id,
        reservation_id,
        actor_id,
      }) => {
        const target = requests.find((r) => r.id === booking_request_id);
        if (!target) return null;
        if (!ELIGIBLE_CONVERT_STATUSES.includes(target.status)) return null;
        const at = nowISO();
        setRequests((rs) =>
          rs.map((r) =>
            r.id === booking_request_id
              ? {
                  ...r,
                  status: "converted_to_reservation",
                  converted_reservation_id: reservation_id,
                  updated_at: at,
                }
              : r,
          ),
        );
        setOutbound((os) => [
          newOutbound(
            "booking_request.converted",
            booking_request_id,
            target,
            reservation_id,
            { actor_id },
          ),
          ...os,
        ]);
        return reservation_id;
      },

      resolveMatch: (id, resolution) => {
        const at = nowISO();
        setRequests((rs) =>
          rs.map((r) =>
            r.id === id
              ? {
                  ...r,
                  customer_match: resolution,
                  verification_status:
                    resolution.kind === "matched"
                      ? "verified"
                      : resolution.kind === "ambiguous"
                        ? "ambiguous"
                        : r.verification_status,
                  updated_at: at,
                }
              : r,
          ),
        );
      },
    }),
    [requests, outbound],
  );

  return (
    <BookingRequestContext.Provider value={store}>
      {children}
    </BookingRequestContext.Provider>
  );
}

export function useBookingRequests(): BookingRequestStore {
  const ctx = useContext(BookingRequestContext);
  if (!ctx)
    throw new Error(
      "useBookingRequests must be used within BookingRequestProvider",
    );
  return ctx;
}

/** Optional variant — returns null when the provider is not mounted (e.g. in
 *  older tests). Copilot/Action Center treat the bundle as optional and fall
 *  back gracefully when absent. Production (App.tsx) always mounts it. */
export function useBookingRequestsOptional(): BookingRequestStore | null {
  return useContext(BookingRequestContext);
}

export { uid, TENANT_ID };
