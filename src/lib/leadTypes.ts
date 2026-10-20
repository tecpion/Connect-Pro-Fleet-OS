// Connect Pro Fleet — Lead domain types (Phase 10B).
//
// A Lead is a person/contact who exists in CRM and MAY become a rental
// customer, but has NOT yet become a Booking Request or an operational
// Customer. Leads are kept OUT of Customer reporting / 360 / collections /
// ledger / active-rental reporting until staff qualify one into a Booking
// Request (the existing Fleet intake record).
//
// Lifecycle (frozen V1):
//   HighLevel Contact -> Fleet Lead -> staff qualification ->
//   Booking Request -> Reservation -> Rental
//
// The Lead carries no rental-operational fields. External CRM identity is
// authoritative via external_entity_references (Phase 10A); the Lead does not
// duplicate a crm_contact_id column (no dual competing identity sources).

/** V1 Lead lifecycle statuses. Kept simple — not a sales pipeline engine. */
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "waitlisted"
  | "disqualified"
  | "converted";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  waitlisted: "Waitlisted",
  disqualified: "Disqualified",
  converted: "Converted",
};

/** Ordered V1 lifecycle for UI/segmentation. */
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "waitlisted",
  "disqualified",
  "converted",
];

/** Where the Lead originated. Mirrors BookingRequestSource vocabulary. */
export type LeadSource = "connect_pro_crm" | "website" | "manual" | "other";

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  connect_pro_crm: "Connect Pro CRM",
  website: "Website",
  manual: "Manual",
  other: "Other",
};

/**
 * A pre-rental CRM contact. No rental-operational fields live here — no active
 * rental, balance, deposit, payment state, vehicle assignment, maintenance, or
 * inspections. Those belong to Customer/Reservation/Rental later in the
 * lifecycle. Arbitrary CRM custom/intake answers are preserved in
 * `intake_data` (informational at this stage; never authoritative operational
 * rental data).
 */
export interface Lead {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  tags: string[];
  /** Optional CRM pipeline/opportunity metadata (informational). */
  crm_opportunity_id: string | null;
  crm_pipeline_stage: string | null;
  /** Free-form source label (e.g. "Facebook Lead Form"). */
  lead_source: string | null;
  /** Arbitrary CRM custom/intake fields (e.g. desired pickup date, rental
   *  type, vehicle preference, rideshare platform, employer, notes). */
  intake_data: Record<string, unknown>;
  notes: string;
  /** Set when staff convert this Lead into a Booking Request (Phase 10B). */
  converted_booking_request_id: string | null;
  converted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Statuses from which a Lead may be converted into a Booking Request. */
export const CONVERTIBLE_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "waitlisted",
];
