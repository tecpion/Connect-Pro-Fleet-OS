// Connect Pro Fleet — Build #18 report context.
//
// Aggregates cross-provider state the report selectors need. Reports consume
// data from the main store PLUS the standalone providers (billing periods,
// damage claims, investor/partnership). Pages build this once and pass it to
// every report selector so selectors stay pure and never call hooks.

import type { FleetStore } from "./store";
import type { BillingPeriod } from "./billingTypes";
import type { DamageClaim, DamageRecovery } from "./damageClaimTypes";
import type { InvestorVehicle } from "./investorTypes";
import type { PartnershipExpenseRule } from "./partnershipTypes";
import type { ProfitabilityInputs } from "./profitabilitySelectors";
import type { ReportFilter } from "./reportInputs";

export interface ReportContext {
  store: FleetStore;
  billingPeriods: BillingPeriod[];
  damageClaims: DamageClaim[];
  damageRecoveries: DamageRecovery[];
  inputs: ProfitabilityInputs; // built from store + investorVehicles + expenseRules
}

export type { ReportFilter };
export type { InvestorVehicle, PartnershipExpenseRule };
