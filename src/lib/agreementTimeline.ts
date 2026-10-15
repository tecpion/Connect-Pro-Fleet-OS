// Connect Pro Fleet — Agreement renewal chain builder (pure derived selector).
//
// Renewal creates a NEW RentalAgreement linked to the prior via
// `prior_agreement_id` / `renewed_from_agreement_id`. The prior agreement is
// NEVER overwritten. The chain preserves the full history of agreements for a
// rental vehicle + renter relationship.
//
// `agreement_term_days` is INFORMATIONAL ONLY — no legal conclusion is ever
// inferred from whether an agreement is ≤30 days or >30 days.

import type { RentalAgreement, RentalEvent, Vehicle } from "./types";
import type { RentalVehicleExchange } from "./store/storeContext";
import type { RentalDriver } from "./defenseTypes";
import type { AgreementChainNode } from "./defenseTypes";

/** Compute the informational term length in days (scheduled end - start).
 *  Returns null when dates are missing/invalid. NEVER used to infer legal
 *  consequences. */
export function agreementTermDays(
  start: string | null,
  scheduledEnd: string,
): number | null {
  if (!start) return null;
  const s = new Date(start);
  const e = new Date(scheduledEnd);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

/** Build the agreement renewal chain for a rental. The chain is ordered from
 *  the earliest agreement to the latest. Each node links to its prior and next
 *  agreement. Pure — operates on the passed-in authoritative records. */
export function buildAgreementTimeline(input: {
  rentalId: string;
  rentals: RentalAgreement[];
  rentalEvents: RentalEvent[];
  vehicles: Vehicle[];
  vehicleExchanges: RentalVehicleExchange[];
  rentalDrivers: RentalDriver[];
}): AgreementChainNode[] {
  const {
    rentalId,
    rentals,
    rentalEvents,
    vehicles,
    vehicleExchanges,
    rentalDrivers,
  } = input;

  // Find the starting rental.
  const start = rentals.find((r) => r.id === rentalId);
  if (!start) return [];

  // Walk the chain backwards via prior_agreement_id / renewed_from_agreement_id.
  const byId = new Map(rentals.map((r) => [r.id, r]));
  const chain: RentalAgreement[] = [];
  const visited = new Set<string>();
  let current: RentalAgreement | undefined = start;
  // Walk back to the root.
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    const priorId: string | null =
      current.prior_agreement_id ?? current.renewed_from_agreement_id ?? null;
    current = priorId ? (byId.get(priorId) ?? undefined) : undefined;
  }
  // Walk forward from the start to find renewals.
  const forward: RentalAgreement[] = [];
  let fwd: RentalAgreement | undefined = start;
  const fwdVisited = new Set<string>([start.id]);
  while (fwd) {
    const currentForward: RentalAgreement = fwd;
    const next: RentalAgreement | undefined = rentals.find(
      (r) =>
        !fwdVisited.has(r.id) &&
        (r.prior_agreement_id === currentForward.id ||
          r.renewed_from_agreement_id === currentForward.id),
    );
    if (next) {
      fwdVisited.add(next.id);
      forward.push(next);
      fwd = next;
    } else {
      break;
    }
  }
  // Merge: chain already has root..start; append forward.
  const fullChain = [...chain, ...forward];
  // Deduplicate (in case forward overlapped).
  const seen = new Set<string>();
  const deduped = fullChain.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Build nodes.
  return deduped.map((r, idx) => {
    const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
    const vehicleLabel = vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`
      : "Unknown vehicle";
    const priorId: string | null =
      r.prior_agreement_id ?? r.renewed_from_agreement_id ?? null;
    const nextId =
      deduped
        .slice(idx + 1)
        .find(
          (n) =>
            n.prior_agreement_id === r.id ||
            n.renewed_from_agreement_id === r.id,
        )?.id ?? null;

    // Signed status — a "signed" RentalEvent for this rental, OR a signed
    // checkout inspection does NOT count (agreement signature is separate).
    const signedEvent = rentalEvents.find(
      (e) => e.rental_id === r.id && e.type === "signed",
    );
    const signed = !!signedEvent;
    const signatureRef = signedEvent ? `event:${signedEvent.id}` : null;

    // Vehicle exchanges during this agreement's period.
    const exchanges = vehicleExchanges
      .filter((x) => x.rental_id === r.id)
      .map((x) => ({
        exchange_id: x.id,
        from_vehicle_id: x.old_vehicle_id,
        to_vehicle_id: x.new_vehicle_id,
        at: x.exchange_at,
        reason: x.reason,
      }));

    // Driver changes during this agreement's period (authorizations +
    // revocations). Based on the canonical rental drivers for this rental.
    const driverChanges = rentalDrivers
      .filter((d) => d.rental_id === r.id)
      .map((d) => ({
        rental_driver_id: d.id,
        full_name: d.full_name,
        role: d.role,
        action: (d.authorization_status === "revoked"
          ? "revoked"
          : "authorized") as "authorized" | "revoked",
        at:
          d.authorization_status === "revoked"
            ? (d.revoked_at ?? d.authorized_at)
            : d.authorized_at,
      }));

    return {
      agreement_id: r.id,
      agreement_number: r.agreement_number,
      prior_agreement_id: priorId,
      next_agreement_id: nextId,
      renewed_from_agreement_id: r.renewed_from_agreement_id ?? null,
      start_date: r.checkout_date ?? r.created_at,
      scheduled_end_date: r.scheduled_return_date,
      actual_return_date: r.actual_return_date,
      agreement_term_days: agreementTermDays(
        r.checkout_date,
        r.scheduled_return_date,
      ),
      vehicle_id: r.vehicle_id,
      vehicle_label: vehicleLabel,
      signed,
      signature_ref: signatureRef,
      signed_at: signedEvent?.at ?? null,
      renter_id: r.customer_id,
      renter_name: "", // resolved by caller via store.customerName
      pricing_snapshot_ref: r.pricing_snapshot ? `snapshot:${r.id}` : null,
      deposit_continuity: priorId ? "carried" : "new",
      vehicle_exchanges: exchanges,
      driver_changes: driverChanges,
    };
  });
}
