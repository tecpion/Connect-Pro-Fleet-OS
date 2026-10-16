// Connect Pro Fleet — Build #30 Executive Dashboard test harness (NON-test module).
//
// Reusable harness helpers, fixtures, and source builders shared across the
// Executive Dashboard test files. NOT a `.test.tsx` file, so importing it never
// re-registers test cases. No `describe`/`it`/`expect` live here. Mirrors the
// Copilot test harness pattern: assembles ExecutiveDashboardSources from the
// real StoreProvider + cross-module providers so selectors run against genuine
// seeded data.

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider, useBilling } from "@/lib/billingStore";
import { InvestorProvider, useInvestors } from "@/lib/investorStore";
import { PartnershipProvider, usePartnerships } from "@/lib/partnershipStore";
import {
  DamageClaimProvider,
  useDamageClaims,
} from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider, useViolations } from "@/lib/violationStoreProvider";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import {
  StaffAssignmentProvider,
  useStaffAssignments,
} from "@/lib/staffAssignmentStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { buildReportInputs } from "@/lib/reportInputs";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import type { ExecutiveDashboardSources } from "@/lib/executiveDashboardComposer";
import type { ExecutiveViewerPermissions } from "@/lib/executiveTypes";
import type { ExecutiveRange } from "@/lib/executiveTypes";

/** Deterministic "now" pinned to the 2026 seed timeline. */
export const NOW = new Date("2026-09-02T12:00:00Z");

/** Full financial/profitability/sensitive/banking permissions. */
export const FULL_PERMS: ExecutiveViewerPermissions = {
  canViewFinancials: true,
  canViewProfitability: true,
  canViewSensitiveDocs: true,
  canViewBanking: true,
  allowedLocationIds: [],
};

/** No financial permission (counts only, amounts hidden). */
export const NO_FINANCE_PERMS: ExecutiveViewerPermissions = {
  canViewFinancials: false,
  canViewProfitability: false,
  canViewSensitiveDocs: false,
  canViewBanking: false,
  allowedLocationIds: [],
};

/** Provider wrapper used by the source hook + UI tests. */
export function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <InvestorProvider>
            <PartnershipProvider>
              <DamageClaimProvider>
                <StaffAssignmentProvider>
                  <ViolationPolicyProvider>
                    <ViolationProvider>
                      <ComplianceProvider>
                        <CustomerNotesProvider>
                          {children}
                        </CustomerNotesProvider>
                      </ComplianceProvider>
                    </ViolationProvider>
                  </ViolationPolicyProvider>
                </StaffAssignmentProvider>
              </DamageClaimProvider>
            </PartnershipProvider>
          </InvestorProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Assemble the ExecutiveDashboardSources bundle from the real providers. */
export function useExecutiveTestSources() {
  return renderHook(
    () => {
      const store = useStore();
      const billing = useBilling();
      const dc = useDamageClaims();
      const vio = useViolations();
      const comp = useCompliance();
      const { investorVehicles } = useInvestors();
      const { expenseRules } = usePartnerships();
      const inputs = buildReportInputs(store, investorVehicles, expenseRules);
      const sources: ExecutiveDashboardSources = {
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
      };
      return { sources, store, assignments: useStaffAssignments() };
    },
    { wrapper },
  ).result;
}

/** Build an ExecutiveRange for a preset (deterministic). */
export function execRange(
  preset: ExecutiveRange["preset"] = "this_month",
  now: Date = NOW,
): ExecutiveRange {
  const map: Record<ExecutiveRange["preset"], string> = {
    today: "today",
    this_week: "this_week",
    this_month: "this_month",
    last_30_days: "last_30_days",
    last_month: "last_month",
    custom: "this_month",
  };
  const r = resolveProfitabilityRange(
    map[preset] as
      "today" | "this_week" | "this_month" | "last_month" | "last_30_days",
    undefined,
    now,
  );
  return { preset, start: r.start, end: r.end, as_of: now };
}
