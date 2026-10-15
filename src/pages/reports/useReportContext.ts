// Connect Pro Fleet — Build #18 report context hook.
//
// Assembles the ReportContext (main store + billing periods + damage claims +
// profitability inputs) from the various providers so report pages call one
// hook instead of wiring four providers each.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { buildReportInputs } from "@/lib/reportInputs";
import type { ReportContext } from "@/lib/reportContext";

export function useReportContext(): ReportContext {
  const store = useStore();
  const billing = useBilling();
  const dc = useDamageClaims();
  const { investorVehicles } = useInvestors();
  const { expenseRules } = usePartnerships();

  return useMemo(
    () => ({
      store,
      billingPeriods: billing.billingPeriods,
      damageClaims: dc.damageClaims,
      damageRecoveries: dc.damageRecoveries,
      inputs: buildReportInputs(store, investorVehicles, expenseRules),
    }),
    [
      store,
      billing.billingPeriods,
      dc.damageClaims,
      dc.damageRecoveries,
      investorVehicles,
      expenseRules,
    ],
  );
}

export { useInvestors, usePartnerships };
