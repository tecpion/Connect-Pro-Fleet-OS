// Connect Pro Fleet — hook assembling timeline + 360 sources (Build #27).
//
// Gathers the cross-provider state the Customer 360 / Digital Twin selectors
// need (main store + billing + damage + violations + compliance + staff
// assignments + customer notes + work-order events). One hook so pages don't
// wire six providers each (mirrors useReportContext).

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useViolations } from "@/lib/violationStoreProvider";
import { useVault } from "@/lib/vaultStoreProvider";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useCustomerNotes } from "@/lib/customerNoteStore";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { buildReportInputs } from "@/lib/reportInputs";
import type { TimelineSources } from "@/lib/timelineComposer";
import type { Customer360Sources } from "@/lib/customer360Selectors";
import type { VehicleTwinSources } from "@/lib/vehicleTwinSelectors";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import { can } from "@/lib/permissions";

export function useEntitySources() {
  const store = useStore();
  const billing = useBilling();
  const dc = useDamageClaims();
  const vio = useViolations();
  const vault = useVault();
  const comp = useCompliance();
  const assignments = useStaffAssignments();
  const notes = useCustomerNotes();
  const { investorVehicles } = useInvestors();
  const { expenseRules } = usePartnerships();

  const inputs = useMemo(
    () => buildReportInputs(store, investorVehicles, expenseRules),
    [store, investorVehicles, expenseRules],
  );
  const range = useMemo(() => resolveProfitabilityRange("this_year"), []);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canSeeMoney = can(roleObj, overrides, "payments.view");
  const canSeeProfit = can(
    roleObj,
    overrides,
    "reports.view_vehicle_profitability",
  );
  const canSeeSensitive = can(roleObj, overrides, "documents.view_sensitive");
  const canSeeBanking = can(roleObj, overrides, "banking.view");

  const workOrderEvents = useMemo(
    () =>
      store.workOrders.flatMap((w) =>
        store.workOrderEvents(w.id).map((event) => ({
          event,
          vehicleId: w.vehicle_id,
        })),
      ),
    [store],
  );

  const timelineSources: TimelineSources = useMemo(
    () => ({
      store,
      billingPeriods: billing.billingPeriods,
      damageClaims: dc.damageClaims,
      violations: vio.violations,
      documents: comp.documents,
      expenses: store.expenses,
      tasks: store.tasks,
      taskEvents: store.taskEvents,
      assignments: assignments.assignments,
      notes: notes.notes,
      workOrderEvents,
      vaultDocs: vault.vaultDocs,
      vaultEvents: vault.vaultEvents,
    }),
    [
      store,
      billing.billingPeriods,
      dc.damageClaims,
      vio.violations,
      comp.documents,
      assignments.assignments,
      notes.notes,
      workOrderEvents,
      vault.vaultDocs,
      vault.vaultEvents,
    ],
  );

  const customer360Sources: Customer360Sources = useMemo(
    () => ({
      store,
      billingPeriods: billing.billingPeriods,
      damageClaims: dc.damageClaims,
      violations: vio.violations,
      documents: comp.documents,
      requirements: comp.requirements,
      overrides: comp.overrides,
      tasks: store.tasks,
      assignments: assignments.assignments,
    }),
    [
      store,
      billing.billingPeriods,
      dc.damageClaims,
      vio.violations,
      comp.documents,
      comp.requirements,
      comp.overrides,
      assignments.assignments,
    ],
  );

  const vehicleTwinSources: VehicleTwinSources = useMemo(
    () => ({
      store,
      billingPeriods: billing.billingPeriods,
      damageClaims: dc.damageClaims,
      violations: vio.violations,
      documents: comp.documents,
      requirements: comp.requirements,
      overrides: comp.overrides,
      expenses: store.expenses,
      tasks: store.tasks,
      assignments: assignments.assignments,
      investorVehicles,
      inputs,
      range,
    }),
    [
      store,
      billing.billingPeriods,
      dc.damageClaims,
      vio.violations,
      comp.documents,
      comp.requirements,
      comp.overrides,
      store.expenses,
      store.tasks,
      assignments.assignments,
      investorVehicles,
      inputs,
      range,
    ],
  );

  return {
    timelineSources,
    customer360Sources,
    vehicleTwinSources,
    canSeeMoney,
    canSeeProfit,
    canSeeSensitive,
    canSeeBanking,
  };
}
