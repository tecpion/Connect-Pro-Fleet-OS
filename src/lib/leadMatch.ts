// Connect Pro Fleet — Phase 10B Lead matching (conservative dedupe).
//
// Primary external identity remains: organization + provider + external CRM
// contact ID, authoritative via external_entity_references (Phase 10A). This
// module provides SECONDARY matching by normalized phone/email only, reusing
// the bookingRequestCustomerMatch normalization conventions.
//
// Rules:
//  - A "clear" secondary match requires EXACTLY ONE candidate across phone and
//    email. If multiple distinct Leads match, the result is "ambiguous" and
//    staff must review — never silently merge people.
//  - Phone/email are NEVER the primary CRM identity. They are a safeguard for
//    the case where no external_entity_reference exists yet.

import { normalizePhone, normalizeEmail } from "./bookingRequestCustomerMatch";
import type { Lead } from "./leadTypes";

export type LeadMatchResolution =
  | { kind: "matched"; lead_id: string }
  | { kind: "ambiguous"; candidate_ids: string[] }
  | { kind: "none" };

/**
 * Resolve a deterministic secondary match for a CRM contact's phone/email
 * against existing Leads. Used only when no external_entity_reference exists.
 * NEVER merges Lead records; ambiguous matches require staff review.
 */
export function resolveLeadMatchByPhoneOrEmail(args: {
  leads: Lead[];
  phone: string;
  email: string;
}): LeadMatchResolution {
  const { leads, phone, email } = args;
  const phoneN = normalizePhone(phone);
  const emailN = normalizeEmail(email);

  const candidates = new Set<string>();

  if (emailN) {
    for (const l of leads) {
      if (normalizeEmail(l.email) === emailN && l.email) candidates.add(l.id);
    }
  }
  if (phoneN) {
    for (const l of leads) {
      if (normalizePhone(l.phone) === phoneN && l.phone) candidates.add(l.id);
    }
  }

  if (candidates.size === 0) return { kind: "none" };
  if (candidates.size === 1) {
    return { kind: "matched", lead_id: [...candidates][0] };
  }
  return { kind: "ambiguous", candidate_ids: [...candidates] };
}