// Connect Pro Fleet — compliance task/notification scan wiring (Build #26).
//
// Extracted from complianceStoreProvider to keep that file under the line
// limit. Exposes a hook that returns the two idempotent scan methods bound to
// the live store + company policy. Both reuse the Build #11 Task system and
// Build #12 Notification system — there is no separate compliance-task engine.

import { useCallback } from "react";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type { ComplianceStore } from "./complianceStoreInterface";
import type { CompliancePolicyConfig } from "./companyPolicyTypes";
import type { FleetStore } from "./store/storeContext";
import {
  generateComplianceTasksPass,
  generateComplianceNotificationsPass,
  type ComplianceScanEntity,
} from "./complianceTaskScan";

/** Build the entity list to evaluate from the live store. */
export function buildScanEntities(store: FleetStore): ComplianceScanEntity[] {
  const ents: ComplianceScanEntity[] = [];
  for (const v of store.vehicles)
    ents.push({
      type: "vehicle",
      id: v.id,
      label: `${v.make} ${v.model} (${v.license_plate})`,
    });
  for (const c of store.customers)
    ents.push({
      type: "customer",
      id: c.id,
      label: `${c.first_name} ${c.last_name}`,
    });
  for (const r of store.rentals)
    ents.push({ type: "rental", id: r.id, label: r.agreement_number });
  ents.push({
    type: "company",
    id: store.tenant.id,
    label: store.tenant.business_name,
  });
  return ents;
}

export interface UseComplianceScanInput {
  store: FleetStore;
  cfg: CompliancePolicyConfig;
  requirements: ComplianceRequirement[];
  mergedDocuments: DocumentRecord[];
  overrides: ComplianceOverride[];
}

export function useComplianceScan(
  input: UseComplianceScanInput,
): Pick<
  ComplianceStore,
  "generateComplianceTasks" | "generateComplianceNotifications"
> {
  const { store, cfg, requirements, mergedDocuments, overrides } = input;

  const generateComplianceTasks = useCallback((): {
    created: number;
    resolved: number;
  } => {
    if (!cfg.auto_create_review_task) return { created: 0, resolved: 0 };
    return generateComplianceTasksPass(
      buildScanEntities(store),
      requirements,
      mergedDocuments,
      overrides,
      {
        ensureSystemTask: store.ensureSystemTask,
        resolveSystemTasksForEntity: store.resolveSystemTasksForEntity,
        tasks: store.tasks,
      },
      {
        autoCreateReviewTask: cfg.auto_create_review_task,
        defaultComplianceOwnerId: cfg.default_compliance_owner_id,
      },
    );
  }, [
    cfg.auto_create_review_task,
    cfg.default_compliance_owner_id,
    store,
    requirements,
    mergedDocuments,
    overrides,
  ]);

  const generateComplianceNotifications = useCallback((): {
    created: number;
  } => {
    const managerUserIds = store.staff
      .filter((s) => s.role === "owner" || s.role === "manager")
      .map((s) => s.id);
    return generateComplianceNotificationsPass(
      buildScanEntities(store),
      requirements,
      mergedDocuments,
      overrides,
      {
        notify: store.notify,
        managerUserIds,
        defaultComplianceOwnerId: cfg.default_compliance_owner_id,
      },
    );
  }, [
    store,
    requirements,
    mergedDocuments,
    overrides,
    cfg.default_compliance_owner_id,
  ]);

  return { generateComplianceTasks, generateComplianceNotifications };
}
