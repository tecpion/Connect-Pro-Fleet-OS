// Connect Pro Fleet — vehicle possession resolver (Build #25).
//
// resolveVehiclePossessionAt(vehicleId, occurredAt) identifies which rental
// had possession of a vehicle at a given date/time. It is EXCHANGE-AWARE:
// if Rental A started with Vehicle X then exchanged to Vehicle Y, a
// violation on Vehicle X after the exchange is NOT attributed to Rental A.
//
// It uses effective vehicle possession intervals derived from:
//   - rental checkout_date/time → actual_return_date/time (or scheduled return)
//   - vehicle exchange history (old vehicle released at exchange_at, new
//     vehicle acquired at exchange_at)
//   - imported legacy rentals (imported_legacy_rental flag)
//
// It uses occurred_at (the violation time), NOT received_at. Camera tickets
// and parking tickets arrive later but the violation time is what matters.
//
// Returns a structured result so the UI can show confidence and route
// no-match / conflict cases to Needs Review. It SUGGESTS — it never
// auto-charges.

import type { RentalAgreement } from "./types";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";

export type PossessionMatchStatus =
  | "exact_match"
  | "no_match"
  | "multiple_match"
  | "before_rental"
  | "after_return";

export const POSSESSION_STATUS_LABELS: Record<PossessionMatchStatus, string> = {
  exact_match: "Exact Match",
  no_match: "No Match",
  multiple_match: "Multiple Match / Conflict",
  before_rental: "Before Rental",
  after_return: "After Return",
};

export interface PossessionInterval {
  rentalId: string;
  customerId: string;
  vehicleId: string;
  start: string; // ISO
  end: string | null; // ISO or null = open-ended (still active)
  /** True when `end` is the rental's actual/scheduled return (possession ended
   *  because the customer returned the vehicle). False when the interval was
   *  truncated by a vehicle exchange — in that case a later violation on this
   *  vehicle is a genuine no-match, not "after return". */
  endIsReturn: boolean;
}

export interface PossessionResult {
  status: PossessionMatchStatus;
  /** Matched rental (exact_match) or first conflicting rental (multiple). */
  rental: RentalAgreement | null;
  customerId: string | null;
  /** The possession interval that matched (or the first conflicting one). */
  interval: PossessionInterval | null;
  /** All conflicting intervals when status === multiple_match. */
  conflicts: PossessionInterval[];
}

/** Parse a rental's checkout datetime. Returns null if not checked out. */
function checkoutAt(r: RentalAgreement): string | null {
  if (!r.checkout_date) return null;
  const time = r.checkout_time ?? "00:00";
  return new Date(`${r.checkout_date}T${time}:00`).toISOString();
}

/** Parse a rental's return datetime. actual_return preferred; falls back to
 *  scheduled_return. Returns null if open-ended / not returned. */
function returnAt(r: RentalAgreement): string | null {
  if (r.actual_return_date) {
    const time = r.actual_return_time ?? "23:59";
    return new Date(`${r.actual_return_date}T${time}:59`).toISOString();
  }
  // For active rentals, the return is open-ended (null). For completed
  // rentals without actual_return, use scheduled return.
  if (r.status === "completed" && r.scheduled_return_date) {
    const time = r.scheduled_return_time ?? "23:59";
    return new Date(`${r.scheduled_return_date}T${time}:59`).toISOString();
  }
  return null;
}

/** Build the effective possession intervals for a vehicle across all rentals,
 *  accounting for exchanges. A rental that started with this vehicle but
 *  exchanged away only possessed it up to the exchange time. A rental that
 *  exchanged INTO this vehicle possessed it from the exchange time onward. */
export function buildPossessionIntervals(
  vehicleId: string,
  rentals: RentalAgreement[],
  exchanges: RentalVehicleExchange[],
): PossessionInterval[] {
  const intervals: PossessionInterval[] = [];

  for (const r of rentals) {
    const start = checkoutAt(r);
    if (!start) continue; // not checked out → no possession interval

    // Exchanges affecting this rental + this vehicle.
    const rentalExchanges = exchanges
      .filter((x) => x.rental_id === r.id)
      .sort((a, b) => (a.exchange_at < b.exchange_at ? -1 : 1));

    // Determine the interval during which THIS rental possessed THIS vehicle.
    if (r.vehicle_id === vehicleId) {
      // Currently on this vehicle. Possession started either at checkout
      // (if no exchange brought it in) or at the last exchange that brought
      // this vehicle in.
      let possessionStart = start;
      for (const ex of rentalExchanges) {
        if (ex.new_vehicle_id === vehicleId) {
          possessionStart = ex.exchange_at; // acquired via this exchange
        }
        if (ex.old_vehicle_id === vehicleId) {
          // Exchanged away from this vehicle — possession ended here.
          intervals.push({
            rentalId: r.id,
            customerId: r.customer_id,
            vehicleId,
            start: possessionStart,
            end: ex.exchange_at,
            endIsReturn: false,
          });
          possessionStart = null as unknown as string; // mark done
          break;
        }
      }
      if (possessionStart !== (null as unknown as string)) {
        intervals.push({
          rentalId: r.id,
          customerId: r.customer_id,
          vehicleId,
          start: possessionStart,
          end: returnAt(r),
          endIsReturn: true,
        });
      }
    } else {
      // Rental currently on a different vehicle, but may have started with
      // this vehicle and exchanged away.
      let possessionStart: string | null = null;
      for (const ex of rentalExchanges) {
        if (ex.old_vehicle_id === vehicleId) {
          // Possessed from checkout (or prior acquire) until this exchange.
          const acquiredByPriorExchange = rentalExchanges
            .filter(
              (x) =>
                x.exchange_at < ex.exchange_at &&
                x.new_vehicle_id === vehicleId,
            )
            .pop();
          possessionStart = acquiredByPriorExchange?.exchange_at ?? start;
          intervals.push({
            rentalId: r.id,
            customerId: r.customer_id,
            vehicleId,
            start: possessionStart,
            end: ex.exchange_at,
            endIsReturn: false,
          });
          possessionStart = null;
          break;
        }
      }
    }
  }

  return intervals;
}

/** Resolve which rental possessed a vehicle at occurredAt. */
export function resolveVehiclePossessionAt(
  vehicleId: string,
  occurredAt: string,
  rentals: RentalAgreement[],
  exchanges: RentalVehicleExchange[],
): PossessionResult {
  const ts = new Date(occurredAt).getTime();
  if (isNaN(ts)) {
    return {
      status: "no_match",
      rental: null,
      customerId: null,
      interval: null,
      conflicts: [],
    };
  }

  const intervals = buildPossessionIntervals(vehicleId, rentals, exchanges);
  const matches: { interval: PossessionInterval; rental: RentalAgreement }[] =
    [];

  for (const iv of intervals) {
    const startTs = new Date(iv.start).getTime();
    const endTs = iv.end ? new Date(iv.end).getTime() : Infinity;
    if (ts >= startTs && ts <= endTs) {
      const rental = rentals.find((r) => r.id === iv.rentalId);
      if (rental) matches.push({ interval: iv, rental });
    }
  }

  if (matches.length === 0) {
    // Distinguish before/after for better UX when a single rental exists.
    const single = intervals.find((i) => i.vehicleId === vehicleId);
    if (single) {
      const startTs = new Date(single.start).getTime();
      if (ts < startTs) {
        const rental = rentals.find((r) => r.id === single.rentalId);
        return {
          status: "before_rental",
          rental: rental ?? null,
          customerId: rental?.customer_id ?? single.customerId,
          interval: single,
          conflicts: [],
        };
      }
      if (
        single.end &&
        single.endIsReturn &&
        ts > new Date(single.end).getTime()
      ) {
        const rental = rentals.find((r) => r.id === single.rentalId);
        return {
          status: "after_return",
          rental: rental ?? null,
          customerId: rental?.customer_id ?? single.customerId,
          interval: single,
          conflicts: [],
        };
      }
    }
    return {
      status: "no_match",
      rental: null,
      customerId: null,
      interval: null,
      conflicts: [],
    };
  }

  if (matches.length === 1) {
    const m = matches[0];
    return {
      status: "exact_match",
      rental: m.rental,
      customerId: m.rental.customer_id,
      interval: m.interval,
      conflicts: [],
    };
  }

  // Multiple conflicting possession intervals (malformed/imported data).
  return {
    status: "multiple_match",
    rental: matches[0].rental,
    customerId: matches[0].rental.customer_id,
    interval: matches[0].interval,
    conflicts: matches.map((m) => m.interval),
  };
}
