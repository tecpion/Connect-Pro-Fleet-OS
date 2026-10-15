// Connect Pro Fleet — Incident attention + source-link selectors.
//
// Pure functions over the existing Incident model (incidentsStore). Produces
// transparent attention reasons (never an opaque score) and derives a
// structured "source/context" label from linked records. Does NOT mutate the
// Incident domain or duplicate source data.

import type { Incident, IncidentStatus } from "./incidents";

export type AttentionLevel = "none" | "attention" | "critical";

export interface IncidentAttention {
  level: AttentionLevel;
  reasons: string[];
}

/** Transparent attention state for an incident. Explains WHY action is needed. */
export function incidentAttention(
  inc: Incident,
  now: Date = new Date(),
): IncidentAttention {
  const reasons: string[] = [];
  let critical = false;

  if (!inc.assigned_staff_id) reasons.push("Unassigned");
  if (inc.responsible_party === "unknown")
    reasons.push("Responsibility unresolved");
  if (
    inc.photos.length === 0 &&
    inc.status !== "resolved" &&
    inc.status !== "closed"
  )
    reasons.push("Missing documents/photos");

  // Customer response needed: in_review + renter responsibility + pending payment.
  if (
    inc.status === "in_review" &&
    inc.responsible_party === "renter" &&
    inc.payment_status === "pending"
  )
    reasons.push("Customer response needed");

  // Insurance pending.
  if (inc.payment_status === "insurance_claim" && inc.status !== "resolved")
    reasons.push("Insurance pending");

  // Vehicle down: accident/breakdown still open → operational impact.
  if (
    (inc.incident_type === "accident" || inc.incident_type === "breakdown") &&
    (inc.status === "open" || inc.status === "in_review")
  ) {
    reasons.push("Vehicle down");
    critical = true;
  }

  // Overdue follow-up: open/in_review older than 14 days.
  const occurred = new Date(inc.occurred_at).getTime();
  if (
    !isNaN(occurred) &&
    (inc.status === "open" || inc.status === "in_review") &&
    now.getTime() - occurred > 14 * 86_400_000
  ) {
    reasons.push("Overdue follow-up");
    critical = true;
  }

  // Serious unresolved damage: damage_dispute open with a charge pending.
  if (
    inc.incident_type === "damage_dispute" &&
    inc.status === "open" &&
    inc.payment_status === "pending" &&
    inc.payment_amount > 0
  ) {
    reasons.push("Serious unresolved damage");
    critical = true;
  }

  if (reasons.length === 0) return { level: "none", reasons: [] };
  return { level: critical ? "critical" : "attention", reasons };
}

// ---------------------------------------------------------------------------
// Source / context
// ---------------------------------------------------------------------------

export type IncidentSourceKind =
  | "check_in_inspection"
  | "check_out_inspection"
  | "rental"
  | "reservation"
  | "damage_claim"
  | "maintenance"
  | "customer"
  | "manual";

export interface IncidentSource {
  kind: IncidentSourceKind;
  label: string;
  /** Linked rental/reservation id if known. */
  rentalId: string | null;
}

/** Derive a structured source label. The incident record only carries a
 *  reservation_id; the kind is inferred from type/context. Callers may pass
 *  linked record hints to refine. Does not duplicate source data. */
export function incidentSource(
  inc: Incident,
  opts?: {
    linkedInspectionType?: "checkout" | "checkin" | null;
    linkedClaimId?: string | null;
    linkedWorkOrderId?: string | null;
  },
): IncidentSource {
  if (opts?.linkedInspectionType === "checkin")
    return {
      kind: "check_in_inspection",
      label: "Check-In Inspection",
      rentalId: inc.reservation_id,
    };
  if (opts?.linkedInspectionType === "checkout")
    return {
      kind: "check_out_inspection",
      label: "Checkout Inspection",
      rentalId: inc.reservation_id,
    };
  if (opts?.linkedClaimId)
    return {
      kind: "damage_claim",
      label: "Damage Claim",
      rentalId: inc.reservation_id,
    };
  if (opts?.linkedWorkOrderId)
    return {
      kind: "maintenance",
      label: "Maintenance Work Order",
      rentalId: inc.reservation_id,
    };
  if (inc.reservation_id)
    return {
      kind: "rental",
      label: "Linked Rental",
      rentalId: inc.reservation_id,
    };
  return { kind: "manual", label: "Manual entry", rentalId: null };
}

// ---------------------------------------------------------------------------
// Vehicle impact (operational)
// ---------------------------------------------------------------------------

export type VehicleImpact = "none" | "needs_review" | "out_of_service";

/** Infer vehicle operational impact from incident type + status. Does NOT
 *  change vehicle availability authority — only reflects a presentation state. */
export function incidentVehicleImpact(inc: Incident): VehicleImpact {
  if (inc.status === "resolved" || inc.status === "closed") return "none";
  if (inc.incident_type === "accident" || inc.incident_type === "breakdown")
    return "out_of_service";
  if (inc.incident_type === "damage_dispute" && inc.status === "open")
    return "needs_review";
  return "none";
}

// ---------------------------------------------------------------------------
// Workflow status presentation (preserves existing authority)
// ---------------------------------------------------------------------------

export const INCIDENT_STATUS_ORDER: IncidentStatus[] = [
  "open",
  "in_review",
  "resolved",
  "closed",
];

/** Map an incident to a user-facing primary state for the workspace. Preserves
 *  the authoritative status; only refines presentation. */
export function incidentPrimaryState(inc: Incident): {
  status: IncidentStatus;
  label: string;
} {
  return { status: inc.status, label: inc.status.replace(/_/g, " ") };
}
