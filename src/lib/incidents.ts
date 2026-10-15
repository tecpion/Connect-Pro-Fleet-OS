// Connect Pro Fleet — Incidents & Traffic Violations domain types.
// Tenant-scoped. Incidents cover accidents, theft, damage disputes, and
// breakdowns; traffic violations cover speeding, tolls, parking, and red-light
// tickets. Both can be billed to a renter through the shared financial ledger
// (incident_charge / violation_charge), never a separate system.

export type IncidentType =
  "accident" | "theft" | "damage_dispute" | "breakdown" | "other";

export type IncidentStatus = "open" | "in_review" | "resolved" | "closed";

export type ResponsibleParty = "renter" | "staff" | "third_party" | "unknown";

export type IncidentPaymentStatus =
  "pending" | "collected" | "waived" | "insurance_claim";

export interface Incident {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  reservation_id: string | null; // linked rental/reservation if known
  incident_type: IncidentType;
  description: string;
  occurred_at: string; // ISO date
  reported_at: string; // ISO date
  status: IncidentStatus;
  responsible_party: ResponsibleParty;
  payment_amount: number;
  payment_status: IncidentPaymentStatus;
  insurance_claim_number: string | null;
  assigned_staff_id: string | null;
  photos: string[]; // URLs (mock for now)
  created_at: string;
  // Build #52 — Rental Risk & Defense Record. Incident driver historical
  // authorization + evidence fields. The authorization status is captured AS
  // OF the incident date/time — later revocation does not alter the historical
  // fact. No legal conclusions are produced.
  incident_driver?: import("./defenseTypes").IncidentDriverFact | null;
  renter_statement?: string | null;
  police_report_url?: string | null;
  police_report_number?: string | null;
  injuries_reported?: "yes" | "no" | "unknown";
  vehicle_towed?: boolean;
  vehicle_condition_notes?: string | null;
  linked_damage_claim_id?: string | null;
  post_incident_inspection_id?: string | null;
  incident_location?: string | null;
}

export type ViolationType =
  "speeding" | "toll" | "parking" | "red_light" | "other";

export type ViolationStatus =
  "pending_match" | "pending_payment" | "billed" | "paid" | "disputed";

export type ViolationPaymentStatus = "pending" | "billed" | "paid" | "waived";

export interface TrafficViolation {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  reservation_id: string | null; // auto-matched against rental period, nullable
  violation_type: ViolationType;
  violation_date: string; // ISO date
  fine_amount: number;
  issuing_agency: string;
  status: ViolationStatus;
  renter_billed_amount: number;
  renter_payment_status: ViolationPaymentStatus;
  notice_document_url: string | null;
  matched_automatically: boolean;
  created_at: string;
}
