// Connect Pro Fleet — Booking Request domain types (CRM handoff foundation).
//
// A BookingRequest is a lightweight INTAKE record from a lead/website form or
// Connect Pro CRM. It is NOT a confirmed Reservation. Staff review each
// request and convert it to an authoritative Reservation only when approved.
//
// Responsibilities (per the founder spec):
//   CONNECT PRO CRM → lead capture, opportunity pipeline, nurture.
//   FLEET OS → Booking Request intake → review → approval → Reservation.
//
// BookingRequest never duplicates Customer/Reservation records. It references
// an existing Customer when a deterministic match exists, and links to the
// real Reservation id once converted. The authoritative reservation + billing
// + verification + deposit logic lives unchanged in the existing domain.

// V1 baseline — the intermediate "approved" status has been removed. It served
// no separate operational step (no Approve action existed): staff review a
// request and convert it directly to a Reservation once it is eligible. The
// authoritative Reservation is the moment of approval. Removing "approved"
// keeps the workflow simplest: new → reviewing → (converted_to_reservation |
// waitlisted | declined | cancelled).
export type BookingRequestStatus =
  | "new"
  | "reviewing"
  | "needs_follow_up"
  | "waitlisted"
  | "converted_to_reservation"
  | "declined"
  | "cancelled";

export const BOOKING_REQUEST_STATUS_LABELS: Record<
  BookingRequestStatus,
  string
> = {
  new: "New",
  reviewing: "Reviewing",
  needs_follow_up: "Needs Follow-Up",
  waitlisted: "Waitlisted",
  converted_to_reservation: "Converted",
  declined: "Declined",
  cancelled: "Cancelled",
};

export type BookingRequestSource =
  "website" | "connect_pro_crm" | "manual" | "other";

export const BOOKING_REQUEST_SOURCE_LABELS: Record<
  BookingRequestSource,
  string
> = {
  website: "Website",
  connect_pro_crm: "Connect Pro CRM",
  manual: "Manual",
  other: "Other",
};

/** Driver's-license / verification state for the lead. */
export type BookingDriverLicenseStatus =
  "not_provided" | "provided" | "expired" | "unverified";

export type BookingVerificationStatus =
  "not_required" | "pending" | "verified" | "failed" | "ambiguous";

export type RentalDurationType = "daily" | "weekly" | "monthly" | "unknown";

/** The deterministic customer-match resolution for a request. */
export type CustomerMatchResolution =
  | { kind: "matched"; customer_id: string }
  | { kind: "ambiguous"; candidate_ids: string[] }
  | { kind: "none" };

/** Optional waitlist metadata (set when a request is waitlisted). */
export interface BookingWaitlistEntry {
  waitlisted_at: string;
  reason: string | null;
  preferred_class_id: string | null;
  preferred_vehicle_id: string | null;
  requested_dates: string | null;
  staff_notes: string | null;
}

/** Optional decline/cancel audit. Preserved — never deleted. */
export interface BookingDeclineRecord {
  reason: string;
  declined_by: string | null;
  declined_at: string;
}

export interface BookingRequest {
  id: string;
  organization_id: string;
  location_id: string | null;

  // --- Customer / lead ---
  first_name: string;
  last_name: string;
  phone: string;
  email: string;

  // --- Request ---
  requested_vehicle_id: string | null;
  requested_vehicle_class_id: string | null;
  requested_start_date: string | null;
  requested_end_date: string | null;
  rental_duration_type: RentalDurationType | null;
  notes: string | null;

  // --- Driver / documents ---
  driver_license_document_reference: string | null;
  driver_license_status: BookingDriverLicenseStatus;
  verification_status: BookingVerificationStatus;

  // --- Source (CRM handoff) ---
  source: BookingRequestSource;
  crm_contact_id: string | null;
  crm_opportunity_id: string | null;
  crm_pipeline_stage: string | null;
  external_request_id: string | null;
  lead_source: string | null;
  submitted_at: string;
  /** Free-form form answers from the website/CRM (descriptive only). */
  form_answers: Record<string, string> | null;

  // --- Status + audit ---
  status: BookingRequestStatus;
  assigned_to: string | null;
  customer_match: CustomerMatchResolution;
  converted_reservation_id: string | null;
  declined: BookingDeclineRecord | null;
  waitlist: BookingWaitlistEntry | null;

  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/** Outbound CRM event contract (mock only — no live calls).
 *  Fleet emits these to tell Connect Pro to move the Opportunity. Recorded in
 *  the booking store's outbound log; a future developer wires real delivery. */
export type BookingOutboundEventType =
  | "booking_request.reviewing"
  | "booking_request.waitlisted"
  | "booking_request.declined"
  | "booking_request.converted"
  | "rental.started"
  | "rental.completed";

export const BOOKING_OUTBOUND_EVENT_LABELS: Record<
  BookingOutboundEventType,
  string
> = {
  "booking_request.reviewing": "Reviewing",
  "booking_request.waitlisted": "Waitlisted",
  "booking_request.declined": "Declined",
  "booking_request.converted": "Converted to Reservation",
  "rental.started": "Rental Started",
  "rental.completed": "Rental Completed",
};

export interface BookingOutboundEvent {
  id: string;
  organization_id: string;
  event_type: BookingOutboundEventType;
  booking_request_id: string | null;
  crm_opportunity_id: string | null;
  crm_contact_id: string | null;
  reservation_id: string | null;
  rental_id: string | null;
  payload: Record<string, unknown>;
  /** mock delivery state — "recorded" only (no live transport). */
  delivery_state: "recorded";
  created_at: string;
}

/** A mock inbound CRM event ("booking_request.created") used to drive the
 *  frontend/demo data flow. The real webhook is a developer-later concern. */
export interface BookingCrmInboundEvent {
  external_request_id: string;
  crm_contact_id: string | null;
  crm_opportunity_id: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  requested_vehicle_id: string | null;
  requested_vehicle_class_id: string | null;
  requested_start_date: string | null;
  requested_end_date: string | null;
  driver_license_document_reference: string | null;
  lead_source: string | null;
  crm_pipeline_stage: string | null;
  form_answers: Record<string, string> | null;
  submitted_at: string;
}

export interface BookingAttentionItem {
  id: string;
  booking_request_id: string;
  reason: string;
  priority: "high" | "medium";
  deep_link: string;
}

/** Build #62 — Copilot sources bundle for the booking-request handlers.
 *  Derived from the authoritative BookingRequest store + the existing
 *  customers/vehicles/classes — never a second source of truth. Optional on
 *  CopilotSources so non-booking tests omit it; booking handlers return a
 *  graceful fallback when absent. */
export interface BookingCopilotSources {
  bookingRequests: BookingRequest[];
  outboundEvents: BookingOutboundEvent[];
  customers: import("./types").Customer[];
  vehicles: import("./types").Vehicle[];
  vehicleClasses: import("./types").VehicleClass[];
  staff: { id: string; full_name: string }[];
}
