// Connect Pro Fleet — Vehicle Performance deposit metrics.
//
// Derives deposit metrics from authoritative RentalDeposit records. Held
// deposits are NOT revenue. Only applied/forfeited amounts that settle a real
// charge affect economics. Pure function, no React.

import type { RentalDeposit } from "./depositTypes";
import type { DateRange } from "./profitabilityHelpers";
import { inRange, round2 } from "./profitabilityHelpers";

export interface DepositMetrics {
  held: number;
  applied: number;
  refunded: number;
  forfeited: number;
  netRetained: number;
}

export function computeDepositMetrics(
  deposits: RentalDeposit[],
  vehicleId: string,
  range: DateRange,
): DepositMetrics {
  const vehicleDeposits = deposits.filter(
    (d) =>
      d.vehicle_id === vehicleId &&
      inRange(d.created_at.slice(0, 10), range.start, range.end),
  );
  let held = 0;
  let applied = 0;
  let refunded = 0;
  let forfeited = 0;
  for (const d of vehicleDeposits) {
    held += Math.max(
      0,
      d.collected_amount -
        d.applied_amount -
        d.refunded_amount -
        d.forfeited_amount,
    );
    applied += d.applied_amount;
    refunded += d.refunded_amount;
    forfeited += d.forfeited_amount;
  }
  return {
    held: round2(held),
    applied: round2(applied),
    refunded: round2(refunded),
    forfeited: round2(forfeited),
    netRetained: round2(forfeited),
  };
}
