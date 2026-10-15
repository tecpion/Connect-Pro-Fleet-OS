// Connect Pro Fleet — Defense sources hook.
//
// Assembles the DefenseSources bundle (the authoritative records the Defense
// Record / Release Gate / Documentation Readiness / Documentation Package
// selectors operate on) from the existing store + cross-module providers.
//
// This is a DERIVED bundle — it never duplicates source-of-truth. It composes
// the same records the pages use. The defense selectors are pure functions
// that take this bundle, keeping them testable without a global store.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useIncidents } from "@/lib/incidentsStore";
import { useDefense } from "@/lib/store/defenseStore";
import type { DefenseSources } from "@/lib/defenseTypes";

/** Assemble DefenseSources from the live store + providers. */
export function useDefenseSources(): DefenseSources {
  const store = useStore();
  const dc = useDamageClaims();
  const comp = useCompliance();
  const incidents = useIncidents();
  const defense = useDefense();

  return useMemo<DefenseSources>(
    () => ({
      rentals: store.rentals,
      rentalEvents: store.rentalEvents,
      customers: store.customers,
      vehicles: store.vehicles,
      inspections: store.inspections,
      drivers: store.drivers,
      workOrders: store.workOrders,
      documents: comp.documents,
      requirements: comp.requirements,
      overrides: comp.overrides,
      incidents: incidents.incidents,
      rentalDrivers: defense.rentalDrivers,
      releaseSnapshots: defense.releaseSnapshots,
      vehicleExchanges: store.rentals.flatMap((r) =>
        store.vehicleExchanges(r.id),
      ),
      ownershipChanges: store.ownershipChanges,
      damageClaims: dc.damageClaims,
      tasks: store.tasks,
      staff: store.staff,
    }),
    [
      store.rentals,
      store.rentalEvents,
      store.customers,
      store.vehicles,
      store.inspections,
      store.drivers,
      store.workOrders,
      store.vehicleExchanges,
      store.ownershipChanges,
      store.tasks,
      store.staff,
      comp.documents,
      comp.requirements,
      comp.overrides,
      incidents.incidents,
      dc.damageClaims,
      defense.rentalDrivers,
      defense.releaseSnapshots,
    ],
  );
}

/** A pure builder for DefenseSources from explicit inputs — used by tests that
 *  construct the bundle without React providers. */
export function buildDefenseSources(input: {
  rentals: DefenseSources["rentals"];
  rentalEvents: DefenseSources["rentalEvents"];
  customers: DefenseSources["customers"];
  vehicles: DefenseSources["vehicles"];
  inspections: DefenseSources["inspections"];
  drivers: DefenseSources["drivers"];
  workOrders: DefenseSources["workOrders"];
  documents: DefenseSources["documents"];
  requirements: DefenseSources["requirements"];
  overrides: DefenseSources["overrides"];
  incidents: DefenseSources["incidents"];
  rentalDrivers: DefenseSources["rentalDrivers"];
  releaseSnapshots: DefenseSources["releaseSnapshots"];
  vehicleExchanges: DefenseSources["vehicleExchanges"];
  ownershipChanges: DefenseSources["ownershipChanges"];
  damageClaims: DefenseSources["damageClaims"];
  tasks: DefenseSources["tasks"];
  staff: DefenseSources["staff"];
}): DefenseSources {
  return { ...input };
}
