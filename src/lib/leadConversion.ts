// Connect Pro Fleet — Phase 10B Lead → BookingRequest conversion foundation.
//
// STAFF-DRIVEN, not automatic webhook behavior. A Lead becomes a Booking
// Request only when staff decide the contact has rental intent. The conversion:
//   - preserves the Lead (never deletes it)
//   - creates ONE BookingRequest using the Lead's standard contact data
//   - carries relevant intake/custom fields ONLY where BookingRequest has a
//     legitimate destination field (dates, vehicle, notes)
//   - never fabricates missing rental dates or vehicle preferences
//   - links the resulting BookingRequest back to the Lead
//   - sets Lead status to "converted" + converted_booking_request_id
//   - is idempotent: repeated conversion attempts return the existing
//     BookingRequest id without creating a duplicate
//
// Required contact fields for conversion: first_name + last_name + (phone OR
// email). Rental-specific fields (requested dates, vehicle, duration) are NOT
// required — BookingRequest allows them null; staff complete them during
// review. An incomplete Lead (missing contact identity) remains a Lead.
//
// The conversion does NOT create a Customer. Customer creation stays tied to
// the existing Reservation lifecycle, as before.

import type { Lead } from "./leadTypes";
import type { RentalDurationType } from "./bookingRequestTypes";

/** The input shape for the booking store's createBookingRequest action. */
export interface LeadConversionInput {
  lead: Lead;
  /** Existing customers for the booking store's match resolution. */
  customers: import("./types").Customer[];
  actor_id: string;
  /** Optional location_id staff may supply (not fabricated from the Lead). */
  location_id?: string | null;
}

/** Result of a conversion attempt. */
export interface LeadConversionResult {
  ok: boolean;
  booking_request_id: string | null;
  lead_id: string;
  reason?: string;
  missing_fields?: string[];
  /** Whether this attempt was a no-op idempotent replay. */
  replay: boolean;
}

/** The contact fields a Lead must have to be convertible. */
export const LEAD_CONVERSION_REQUIRED_CONTACT_FIELDS: (keyof Lead)[] = [
  "first_name",
  "last_name",
];

/** Return the contact fields missing for conversion (empty = convertible). */
export function getMissingConversionFields(lead: Lead): string[] {
  const missing: string[] = [];
  if (!lead.first_name?.trim()) missing.push("first_name");
  if (!lead.last_name?.trim()) missing.push("last_name");
  // Contact identity: phone OR email must be present.
  if (!lead.phone?.trim() && !lead.email?.trim()) {
    missing.push("phone_or_email");
  }
  return missing;
}

/**
 * Pull a rental-intake field from the Lead's intake_data if present, else
 * null. Never fabricates a value.
 */
function intake<T extends string | null>(
  data: Record<string, unknown>,
  key: string,
): T {
  const v = data[key];
  if (typeof v === "string" && v.trim()) return v as T;
  return null as T;
}

/**
 * Map a Lead to the createBookingRequest input, carrying standard contact
 * data + intake fields ONLY where BookingRequest has a destination. Never
 * invents rental dates or vehicle preferences.
 */
export function leadToBookingRequestInput(
  lead: Lead,
  opts: { customers: import("./types").Customer[]; actor_id: string },
): {
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
  source: Lead["source"];
  location_id: string | null;
  driver_license_document_reference: string | null;
  customers: import("./types").Customer[];
  actor_id: string;
} {
  const d = lead.intake_data ?? {};
  return {
    first_name: lead.first_name,
    last_name: lead.last_name,
    phone: lead.phone,
    email: lead.email,
    // Carried from intake ONLY if the Lead captured them — never fabricated.
    requested_vehicle_id: intake(d, "requested_vehicle_id"),
    requested_vehicle_class_id: intake(d, "requested_vehicle_class_id"),
    requested_start_date: intake(d, "requested_start_date"),
    requested_end_date: intake(d, "requested_end_date"),
    rental_duration_type: (intake(d, "rental_duration_type") as RentalDurationType | null),
    notes: lead.notes?.trim() ? lead.notes : null,
    // Source of truth for lead origin: CRM owns CRM-origin lead/contact fields.
    source: lead.source,
    location_id: null, // not fabricated from a raw Lead
    driver_license_document_reference: null,
    customers: opts.customers,
    actor_id: opts.actor_id,
  };
}

/**
 * Decide whether a Lead may be converted now, and describe what's missing.
 * Returns ok:false when required contact identity is absent.
 */
export function canConvertLead(lead: Lead): {
  ok: boolean;
  missing_fields: string[];
} {
  const missing = getMissingConversionFields(lead);
  return { ok: missing.length === 0, missing_fields: missing };
}