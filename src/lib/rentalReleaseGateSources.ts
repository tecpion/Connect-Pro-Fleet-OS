// Connect Pro Fleet — Release Gate source assembly (UI helper).
//
// THE single place that assembles the inputs for `evaluateRentalReleaseGate`
// from the live store + cross-module providers. Checkout, the Verification
// Readiness card, and any future caller read from here so gate-assembly logic
// is NOT duplicated across screens.
//
// Pure selector over the provided records — no store mutation. Callers pass in
// the live DefenseSources + verification store + company policy so the result
// reflects current state.

import type { RentalAgreement, Vehicle } from "./types";
import type { RentalDriver } from "./defenseTypes";
import type { DefenseSources } from "./defenseTypes";
import type { Inspection } from "./inspectionTypes";
import { evaluateRentalReleaseGate } from "./rentalReleaseGate";
import type { ReleaseGateResult } from "./defenseTypes";
import { resolveVerificationRequirements } from "./verificationSelectors";
import type { ResolvedVerificationRequirement } from "./verificationTypes";
import type {
  VerificationRequirement,
  VerificationRequest,
  VerificationOverride,
  VerificationServicesPolicy,
} from "./verificationTypes";

export interface ReleaseGateSourcesInput {
  rental: RentalAgreement;
  vehicle: Vehicle;
  /** DefenseSources bundle (vehicles, workOrders, documents, requirements,
   *  overrides, rentalDrivers, inspections). */
  defense: DefenseSources;
  /** Verification store records (may be empty when no provider mounted). */
  verification: {
    policies: VerificationServicesPolicy | null | undefined;
    requirements: VerificationRequirement[];
    requests: VerificationRequest[];
    overrides: VerificationOverride[];
  };
  /** Whether the rental agreement itself is signed. */
  agreementSigned: boolean;
  now?: Date;
}

/** Canonical drivers for a rental (primary + additional active). */
export function gateDriversForRental(
  rentalId: string,
  rentalDrivers: RentalDriver[],
): RentalDriver[] {
  return rentalDrivers.filter(
    (d) => d.rental_id === rentalId && d.authorization_status === "active",
  );
}

/** Resolve the checkout inspection for a rental (reservation- or vehicle-keyed). */
export function gateCheckoutInspection(
  rental: RentalAgreement,
  inspections: Inspection[],
): Inspection | null {
  return (
    inspections.find(
      (i) =>
        i.inspection_type === "checkout" &&
        (i.reservation_id === rental.reservation_id ||
          i.vehicle_id === rental.vehicle_id),
    ) ?? null
  );
}

/** Resolve verification requirements for a rental context (company policy +
 *  per-rental staff requirements). Returns [] when no verification provider is
 *  mounted — verification is optional by design and never globally required. */
export function resolveGateVerificationRequirements(
  rental: RentalAgreement,
  verification: ReleaseGateSourcesInput["verification"],
  now: Date,
): ResolvedVerificationRequirement[] {
  return resolveVerificationRequirements({
    policies: verification.policies,
    requirements: verification.requirements,
    requests: verification.requests,
    overrides: verification.overrides,
    ctx: {
      customer_id: rental.customer_id,
      rental_id: rental.id,
      reservation_id: rental.reservation_id,
    },
    now,
  });
}

/** Evaluate the authoritative release gate from assembled live sources. */
export function evaluateReleaseGateFromSources(
  input: ReleaseGateSourcesInput,
): ReleaseGateResult {
  const { rental, vehicle, defense, verification, agreementSigned, now } =
    input;
  const t = now ?? new Date();
  const drivers = gateDriversForRental(rental.id, defense.rentalDrivers);
  const checkoutInspection = gateCheckoutInspection(
    rental,
    defense.inspections,
  );
  const verificationRequirements = resolveGateVerificationRequirements(
    rental,
    verification,
    t,
  );
  return evaluateRentalReleaseGate({
    rental,
    vehicle,
    drivers,
    checkoutInspection,
    workOrders: defense.workOrders,
    requirements: defense.requirements,
    documents: defense.documents,
    overrides: defense.overrides,
    agreementSigned,
    verificationRequirements,
    now: t,
  });
}
