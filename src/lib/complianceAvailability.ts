// Connect Pro Fleet — compliance-aware vehicle availability (Build #26).
//
// Composes compliance blocking into the existing reservation-pricing
// availability logic WITHOUT rebuilding the reservation engine. A vehicle with
// a BLOCKING compliance issue (expired required registration, missing required
// insurance, failed required inspection) is unavailable for new
// rentals/reservations. A non-blocking warning (expiring soon) leaves the
// vehicle available. Compliance blocks coexist with maintenance and damage
// blocks — they never overwrite one another.

import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import { getEntityComplianceStatus } from "./complianceStatus";
import type { Vehicle } from "./types";

export interface ComplianceBlockResult {
  blocked: boolean;
  reasons: string[];
}

/** Whether a vehicle is compliance-blocked for new rentals/reservations. */
export function getComplianceBlock(
  vehicleId: string,
  vehicleLabel: string,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): ComplianceBlockResult {
  const res = getEntityComplianceStatus(
    "vehicle",
    vehicleId,
    vehicleLabel,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );
  if (res.status !== "blocked" || res.blockingReasons.length === 0)
    return { blocked: false, reasons: [] };
  return { blocked: true, reasons: res.blockingReasons };
}

/** Compose compliance into an existing availability reason. If the date-range
 *  availability check passes, a blocking compliance issue still blocks. */
export function withCompliance(
  base: { ok: boolean; reason: string },
  vehicle: Vehicle,
  block: ComplianceBlockResult,
): { ok: boolean; reason: string } {
  if (!base.ok) return base;
  if (block.blocked)
    return {
      ok: false,
      reason: `Compliance — ${block.reasons.join("; ")}`,
    };
  return base;
}

/** A vehicle is blocked if it has any blocking compliance issue AND would
 *  otherwise be available (status-based). This is the single source for the
 *  "Unavailable — Compliance" badge on Vehicle Detail. */
export function isComplianceUnavailable(
  vehicle: Vehicle,
  reqs: ComplianceRequirement[],
  docs: DocumentRecord[],
  overrides: ComplianceOverride[],
  now: Date = new Date(),
  warningDays = 30,
): ComplianceBlockResult {
  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return getComplianceBlock(
    vehicle.id,
    label,
    reqs,
    docs,
    overrides,
    now,
    warningDays,
  );
}
