// Connect Pro Fleet — settings config methods (Build #5): vehicle classes,
// add-on catalog, deposit policies, agreement templates/rules.

import type {
  AddonCatalogItem,
  AddonCategory,
  AgreementRules,
  AgreementTemplate,
  DepositPolicy,
  VehicleClass,
} from "../types";
import { classDefaultsForVehicle as classDefaults } from "../vehicleClass";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";

export function buildSettingsConfigMethods(s: StoreState) {
  return {
    addVehicleClass: (c: VehicleClass) =>
      s.setVehicleClasses((cs) => [...cs, c]),
    updateVehicleClass: (id: string, patch: Partial<VehicleClass>) => {
      const now = new Date().toISOString();
      s.setVehicleClasses((cs) =>
        cs.map((c) => (c.id === id ? { ...c, ...patch, updated_at: now } : c)),
      );
      const src = s.vehicleClasses.find((c) => c.id === id);
      if (src) {
        const merged = { ...src, ...patch };
        s.setVehicles((vs) =>
          vs.map((v) => {
            if (v.vehicle_class_id !== id || v.pricing_override) return v;
            const d = classDefaults(merged, s.depositPolicies);
            return {
              ...v,
              daily_rate: d.daily_rate,
              weekly_rate: d.weekly_rate,
              deposit_amount: d.deposit_amount,
              updated_at: now,
            };
          }),
        );
      }
    },
    duplicateVehicleClass: (id: string): string | null => {
      const src = s.vehicleClasses.find((c) => c.id === id);
      if (!src) return null;
      const newId = uid("cls");
      const now = new Date().toISOString();
      s.setVehicleClasses((cs) => [
        ...cs,
        {
          ...src,
          id: newId,
          name: `${src.name} (Copy)`,
          display_order: cs.length + 1,
          created_at: now,
          updated_at: now,
        },
      ]);
      return newId;
    },
    assignVehicleClass: (vehicleId: string, classId: string | null) => {
      const now = new Date().toISOString();
      s.setVehicles((vs) =>
        vs.map((v) => {
          if (v.id !== vehicleId) return v;
          if (!classId)
            return { ...v, vehicle_class_id: null, updated_at: now };
          const cls = s.vehicleClasses.find((c) => c.id === classId);
          if (!cls || v.pricing_override)
            return { ...v, vehicle_class_id: classId, updated_at: now };
          const d = classDefaults(cls, s.depositPolicies);
          return {
            ...v,
            vehicle_class_id: classId,
            daily_rate: d.daily_rate,
            weekly_rate: d.weekly_rate,
            min_rental_days_override: null,
            deposit_amount: d.deposit_amount,
            deposit_override: false,
            updated_at: now,
          };
        }),
      );
    },

    addAddonCategory: (c: AddonCategory) =>
      s.setAddonCategories((cs) => [...cs, c]),
    updateAddonCategory: (id: string, patch: Partial<AddonCategory>) =>
      s.setAddonCategories((cs) =>
        cs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      ),
    addAddonCatalogItem: (a: AddonCatalogItem) =>
      s.setAddonCatalog((as) => [...as, a]),
    updateAddonCatalogItem: (id: string, patch: Partial<AddonCatalogItem>) =>
      s.setAddonCatalog((as) =>
        as.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      ),

    addDepositPolicy: (d: DepositPolicy) =>
      s.setDepositPolicies((ds) => [...ds, d]),
    updateDepositPolicy: (id: string, patch: Partial<DepositPolicy>) =>
      s.setDepositPolicies((ds) =>
        ds.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      ),
    setDefaultDepositPolicy: (id: string) =>
      s.setDepositPolicies((ds) =>
        ds.map((d) => ({ ...d, is_default: d.id === id })),
      ),

    addAgreementTemplate: (t: AgreementTemplate) =>
      s.setAgreementTemplates((ts) => [...ts, t]),
    updateAgreementTemplate: (id: string, patch: Partial<AgreementTemplate>) =>
      s.setAgreementTemplates((ts) =>
        ts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      ),
    uploadAgreementTemplateVersion: (
      id: string,
      file: { name: string; url: string },
    ): string => {
      const src = s.agreementTemplates.find((t) => t.id === id);
      const newId = uid("tpl");
      const now = new Date().toISOString();
      const today = now.slice(0, 10);
      s.setAgreementTemplates((ts) => [
        ...ts.map((t) =>
          t.id === id ? { ...t, status: "superseded" as const } : t,
        ),
        {
          id: newId,
          tenant_id: TENANT_ID,
          name: src?.name ?? "Agreement Template",
          agreement_type: src?.agreement_type ?? "standard",
          description: src?.description ?? "",
          file_url: file.url,
          file_name: file.name,
          version: (src?.version ?? 1) + 1,
          effective_date: today,
          status: "active",
          is_default: src?.is_default ?? false,
          created_at: now,
          created_by: s.currentStaffId,
        },
      ]);
      return newId;
    },
    setDefaultAgreementTemplate: (id: string) =>
      s.setAgreementTemplates((ts) =>
        ts.map((t) => ({ ...t, is_default: t.id === id })),
      ),
    updateAgreementRules: (patch: Partial<AgreementRules>) =>
      s.setAgreementRules((r) => ({ ...r, ...patch })),
  };
}
