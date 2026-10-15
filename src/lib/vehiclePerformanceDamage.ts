// Connect Pro Fleet — Vehicle Performance damage economics.
//
// Net company damage impact = repair cost - total recovery. A fully-recovered
// damage has zero net impact (never left as a permanent expense). Recovery
// sources are tracked separately (renter, insurance, third-party, other).
// Pure function, no React.

import type { FinancialTransaction } from "./chargeTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type { DamageClaim, DamageRecovery } from "./damageClaimTypes";
import type { DateRange } from "./profitabilityHelpers";
import { inRange, round2 } from "./profitabilityHelpers";
import { getDamageClaimEconomics } from "./damageClaimSelectors";

export interface DamageEconomicsView {
  repairCost: number;
  renterRecovery: number;
  insuranceRecovery: number;
  thirdPartyRecovery: number;
  otherRecovery: number;
  totalRecovery: number;
  netCompanyImpact: number;
}

export function computeDamageEconomics(
  transactions: FinancialTransaction[],
  expenses: ExpenseTransaction[],
  damageClaims: DamageClaim[],
  damageRecoveries: DamageRecovery[],
  vehicleId: string,
  range: DateRange,
): DamageEconomicsView {
  const claims = damageClaims.filter((c) => c.vehicle_id === vehicleId);
  let repairCost = 0;
  let renterRecovery = 0;
  let insuranceRecovery = 0;
  let thirdPartyRecovery = 0;
  let otherRecovery = 0;

  for (const c of claims) {
    if (!inRange(c.discovered_at.slice(0, 10), range.start, range.end))
      continue;
    const eco = getDamageClaimEconomics(c, {
      transactions,
      expenses,
      recoveries: damageRecoveries,
    });
    if (eco.actual_cost != null) repairCost += eco.actual_cost;
    renterRecovery += eco.customer_paid + eco.deposit_applied;
    insuranceRecovery += eco.insurance_recovered;
    thirdPartyRecovery += eco.third_party_recovered;
    otherRecovery += eco.other_recovered;
  }

  const totalRecovery = round2(
    renterRecovery + insuranceRecovery + thirdPartyRecovery + otherRecovery,
  );
  return {
    repairCost: round2(repairCost),
    renterRecovery: round2(renterRecovery),
    insuranceRecovery: round2(insuranceRecovery),
    thirdPartyRecovery: round2(thirdPartyRecovery),
    otherRecovery: round2(otherRecovery),
    totalRecovery,
    netCompanyImpact: round2(Math.max(0, repairCost - totalRecovery)),
  };
}
