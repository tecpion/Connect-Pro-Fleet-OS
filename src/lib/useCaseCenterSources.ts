// Connect Pro Fleet — Case Center sources hook (Build #54).
//
// Assembles the CaseCenterSources bundle (the authoritative records the Case
// Center selectors operate on) from the existing store + cross-module
// providers. This is a DERIVED bundle — it never duplicates source-of-truth.
// Financial totals are computed from the linked ledger transactions.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useIncidents } from "@/lib/incidentsStore";
import { useDefense } from "@/lib/store/defenseStore";
import { useCaseCenter } from "@/lib/store/caseCenterStore";
import { useViolations } from "@/lib/violationStoreProvider";
import type { CaseCenterSources } from "@/lib/caseCenterTypes";

/** Assemble CaseCenterSources from the live store + providers. */
export function useCaseCenterSources(): CaseCenterSources {
  const store = useStore();
  const dc = useDamageClaims();
  const incidents = useIncidents();
  const defense = useDefense();
  const cc = useCaseCenter();
  const vio = useViolations();

  return useMemo<CaseCenterSources>(
    () => ({
      cases: cc.cases,
      caseEvents: cc.caseEvents,
      rentals: store.rentals,
      customers: store.customers,
      vehicles: store.vehicles,
      violations: vio.violations,
      incidents: incidents.incidents,
      damageClaims: dc.damageClaims,
      deposits: store.rentalDeposits,
      expenses: store.expenses,
      customerCharges: store.transactions,
      payments: store.transactions,
      tasks: store.tasks,
      staff: store.staff,
      releaseSnapshots: defense.releaseSnapshots,
    }),
    [
      cc.cases,
      cc.caseEvents,
      store.rentals,
      store.customers,
      store.vehicles,
      vio.violations,
      incidents.incidents,
      dc.damageClaims,
      store.rentalDeposits,
      store.expenses,
      store.transactions,
      store.tasks,
      store.staff,
      defense.releaseSnapshots,
    ],
  );
}
