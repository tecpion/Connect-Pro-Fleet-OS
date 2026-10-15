// Connect Pro Fleet — Executive Dashboard sources hook (Build #30 + #33).
//
// Assembles the cross-provider state the executive selectors need (main store +
// billing + damage + violations + compliance + investors + partnerships) and
// resolves the viewer's executive permissions. One hook so the page doesn't
// wire six providers independently (mirrors useEntitySources).
//
// Build #33: the Business Health config now comes from the persisted company
// policy store (companyPolicies.business_health) so Settings changes flow into
// the Executive Dashboard without a second source of truth.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useViolations } from "@/lib/violationStoreProvider";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useInvestors } from "@/lib/investorStore";
import { usePartnerships } from "@/lib/partnershipStore";
import { buildReportInputs } from "@/lib/reportInputs";
import { can } from "@/lib/permissions";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import type { ExecutiveDashboardSources } from "@/lib/executiveDashboardComposer";
import {
  type ExecutiveViewerPermissions,
  type HealthConfig,
  DEFAULT_HEALTH_CONFIG,
} from "@/lib/executiveTypes";
import { healthSettingsToConfig } from "@/pages/settings/BusinessHealthSection";

export function useExecutiveSources() {
  const store = useStore();
  const billing = useBilling();
  const dc = useDamageClaims();
  const vio = useViolations();
  const comp = useCompliance();
  const { investorVehicles } = useInvestors();
  const { expenseRules } = usePartnerships();

  const inputs = useMemo(
    () => buildReportInputs(store, investorVehicles, expenseRules),
    [store, investorVehicles, expenseRules],
  );

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canSeeMoney = can(roleObj, overrides, "dashboard.view_financials");
  const canSeeProfit = can(
    roleObj,
    overrides,
    "reports.view_company_profitability",
  );
  const canSeeSensitive = can(roleObj, overrides, "documents.view_sensitive");
  const canSeeBanking = can(roleObj, overrides, "banking.view");

  const { companyPolicies } = useCompanyPolicies();
  const healthConfig: HealthConfig = useMemo(
    () =>
      companyPolicies.business_health != null
        ? healthSettingsToConfig(companyPolicies.business_health)
        : DEFAULT_HEALTH_CONFIG,
    [companyPolicies.business_health],
  );

  const perms: ExecutiveViewerPermissions = useMemo(
    () => ({
      canViewFinancials: canSeeMoney,
      canViewProfitability: canSeeProfit,
      canViewSensitiveDocs: canSeeSensitive,
      canViewBanking: canSeeBanking,
      allowedLocationIds: [],
    }),
    [canSeeMoney, canSeeProfit, canSeeSensitive, canSeeBanking],
  );

  const sources: ExecutiveDashboardSources = useMemo(
    () => ({
      store,
      inputs,
      damageClaims: dc.damageClaims,
      damageRecoveries: dc.damageRecoveries,
      violations: vio.violations,
      expenses: store.expenses,
      billingPeriods: billing.billingPeriods,
      paymentArrangements: store.paymentArrangements,
      arrangementInstallments: store.arrangementInstallments,
      rentalDeposits: store.rentalDeposits,
      documents: comp.documents,
      requirements: comp.requirements,
      overrides: comp.overrides,
    }),
    [
      store,
      inputs,
      dc.damageClaims,
      dc.damageRecoveries,
      vio.violations,
      billing.billingPeriods,
      comp.documents,
      comp.requirements,
      comp.overrides,
    ],
  );

  return { sources, perms, inputs, healthConfig };
}
