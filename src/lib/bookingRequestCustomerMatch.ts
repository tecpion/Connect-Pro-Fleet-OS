// Connect Pro Fleet — Booking Request customer matching (deterministic).
//
// Before creating a duplicate customer, attempt a deterministic match using
// email, phone, and an existing CRM contact reference. If one clear match
// exists, link the request to the existing Customer. If ambiguous (multiple
// candidates), require staff review — never silently merge customer records.
//
// Pure + deterministic. No store mutation. Used by the booking store on intake
// and by the UI to show the match verdict.

import type { Customer } from "./types";
import type { CustomerMatchResolution } from "./bookingRequestTypes";

/** Normalize a phone to digits-only for loose matching. */
export function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Normalize an email to a lowercase trimmed string. */
export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Resolve a deterministic customer match for a booking request's lead identity.
 *
 * Matching rules (in priority order):
 *   1. CRM contact reference (crm_contact_id) — if a Customer with that
 *      external reference exists, it is the authoritative match.
 *   2. Email — exact (normalized) email match.
 *   3. Phone — exact (normalized) phone match.
 *
 * A "clear" match requires EXACTLY ONE candidate across all matched keys.
 * If multiple distinct candidates match, the result is "ambiguous" and staff
 * must review. If none match, "none" (a new customer would be created on
 * conversion).
 *
 * This NEVER merges customer records and NEVER picks one of several.
 */
export function resolveCustomerMatch(args: {
  customers: Customer[];
  email: string;
  phone: string;
  crm_contact_id: string | null;
}): CustomerMatchResolution {
  const { customers, email, phone, crm_contact_id } = args;
  const emailN = normalizeEmail(email);
  const phoneN = normalizePhone(phone);

  const candidates = new Set<string>();

  if (crm_contact_id) {
    // The customer store stores CRM contact references on the customer record's
    // notes/source; a dedicated external-ref registry is the future home. For
    // the frontend mock, match by the CRM contact id embedded in customer
    // notes (seed convention "crm_contact:CONTACT-123"). This is intentionally
    // defensive — a real backend resolves via the external-entity registry.
    for (const c of customers) {
      if (c.notes && c.notes.includes(`crm_contact:${crm_contact_id}`)) {
        candidates.add(c.id);
      }
    }
  }

  if (emailN) {
    for (const c of customers) {
      if (normalizeEmail(c.email) === emailN) candidates.add(c.id);
    }
  }

  if (phoneN) {
    for (const c of customers) {
      if (normalizePhone(c.phone) === phoneN) candidates.add(c.id);
    }
  }

  if (candidates.size === 0) return { kind: "none" };
  if (candidates.size === 1) {
    return { kind: "matched", customer_id: [...candidates][0] };
  }
  return { kind: "ambiguous", candidate_ids: [...candidates] };
}
