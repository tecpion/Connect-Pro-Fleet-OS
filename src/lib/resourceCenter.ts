// Connect Pro Fleet — Resource Center domain types.
// Replaces the former automated verification API integrations (Checkr/Axle/
// Bonzah) with a manual "Resource Center": operators curate resource links
// grouped into categories, and per-reservation verification status is tracked
// against those categories. Nothing is required by default — different
// operators use different subsets of checks.

export interface ResourceCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
  // When true, a reservation cannot move to "confirmed" until this category's
  // verification status is "passed". Defaulted off — nothing is mandatory
  // out of the box. Different operators use different subsets of checks.
  is_required?: boolean;
}

export interface ResourceLink {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  url: string;
  description: string;
  is_active: boolean;
  display_order: number;
}

export type ReservationVerificationStatus =
  "not_started" | "in_progress" | "passed" | "failed";

export interface ReservationVerification {
  id: string;
  reservation_id: string;
  category_id: string;
  tenant_id: string;
  status: ReservationVerificationStatus;
  required: boolean;
  verified_by: string | null; // staff id
  verified_at: string | null;
  notes: string | null;
}
