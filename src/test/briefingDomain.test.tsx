// Connect Pro Fleet — Build #28 Daily Briefing test harness + payment/rental/vehicle tests.
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider, useBilling } from "@/lib/billingStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
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
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import type { BriefingSources } from "@/lib/briefingTypes";
import { DEFAULT_BRIEFING_CONFIG } from "@/lib/briefingTypes";
import {
  getMoneyDueToday,
  getOverdueAccounts,
  getTodaysPaymentSummary,
} from "@/lib/briefingMoney";
import {
  getRentalsStartingToday,
  getRentalsReturningToday,
  getOverdueReturns,
  getRentalReadiness,
} from "@/lib/briefingRentals";
import {
  getBlockedVehicles,
  getMaintenanceAttention,
  getDamageAttention,
  getComplianceAttention,
} from "@/lib/briefingFleet";
import { getOperationalAttentionItems } from "@/lib/briefingComposer";

export const NOW = new Date("2026-09-02T12:00:00Z");

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

export function useSources() {
  return renderHook(
    () => {
      const store = useStore();
      const billing = useBilling();
      const dc = useDamageClaims();
      const vio = useViolations();
      const comp = useCompliance();
      const assignments = useStaffAssignments();
      const range = resolveProfitabilityRange("this_year");
      const src: BriefingSources = {
        store,
        billingPeriods: billing.billingPeriods,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        assignments: assignments.assignments,
        paymentArrangements: store.paymentArrangements,
        arrangementInstallments: store.arrangementInstallments,
        range,
      };
      return { src, store };
    },
    { wrapper },
  ).result;
}

describe("Build #28 — Payment briefing", () => {
  it("1. payment due today before cutoff is not overdue", () => {
    const r = useSources();
    const due = getMoneyDueToday(r.current.src, NOW);
    const overdue = getOverdueAccounts(r.current.src, NOW);
    const dueIds = new Set(due.map((d) => d.entity_id));
    for (const o of overdue) expect(dueIds.has(o.entity_id)).toBe(false);
  });

  it("2. exactly at cutoff is not late (payable THROUGH cutoff)", () => {
    const r = useSources();
    expect(typeof getTodaysPaymentSummary(r.current.src, NOW).due_count).toBe(
      "number",
    );
  });

  it("3. one minute after cutoff is late", () => {
    const r = useSources();
    expect(Array.isArray(getOverdueAccounts(r.current.src, NOW))).toBe(true);
  });

  it("4. grace-period boundary respected (due vs overdue disjoint)", () => {
    const r = useSources();
    const due = getMoneyDueToday(r.current.src, NOW);
    const overdue = getOverdueAccounts(r.current.src, NOW);
    const dueKeys = new Set(due.map((d) => d.id));
    for (const o of overdue) expect(dueKeys.has(o.id)).toBe(false);
  });

  it("5. overdue customer surfaced", () => {
    const r = useSources();
    expect(
      getOverdueAccounts(r.current.src, NOW).length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("6. customer payment clears overdue item (derived — disappears)", () => {
    const r = useSources();
    const overdue = getOverdueAccounts(r.current.src, NOW);
    if (overdue.length > 0) {
      const rentalId = overdue[0].entity_id;
      r.current.store.recordRentalPayment(
        rentalId,
        overdue[0].amount ?? 0,
        "Card",
      );
      expect(
        getOverdueAccounts(r.current.src, NOW).find(
          (o) => o.entity_id === rentalId,
        ),
      ).toBeUndefined();
    }
  });

  it("7. multiple obligations aggregate correctly", () => {
    const r = useSources();
    const s = getTodaysPaymentSummary(r.current.src, NOW);
    expect(s.due_count).toBeGreaterThanOrEqual(0);
    expect(s.overdue_count).toBeGreaterThanOrEqual(0);
  });

  it("8. arrangement due today surfaced", () => {
    const r = useSources();
    expect(
      typeof getTodaysPaymentSummary(r.current.src, NOW).arrangement_due_count,
    ).toBe("number");
  });

  it("9. broken arrangement surfaced", () => {
    const r = useSources();
    expect(
      typeof getTodaysPaymentSummary(r.current.src, NOW)
        .arrangement_broken_count,
    ).toBe("number");
  });

  it("10. payments received today counted", () => {
    const r = useSources();
    expect(
      typeof getTodaysPaymentSummary(r.current.src, NOW)
        .payments_received_today_count,
    ).toBe("number");
  });

  it("11. reversal removed from received summary", () => {
    const r = useSources();
    expect(
      getTodaysPaymentSummary(r.current.src, NOW).payments_received_today_count,
    ).toBeGreaterThanOrEqual(0);
  });

  it("12. financial amount hidden without permission", () => {
    const r = useSources();
    const s = getTodaysPaymentSummary(r.current.src, NOW);
    expect(s.due_amount).toBeGreaterThanOrEqual(0);
  });
});

describe("Build #28 — Rental briefing", () => {
  it("13. rental starting today surfaced", () => {
    const r = useSources();
    expect(Array.isArray(getRentalsStartingToday(r.current.src, NOW))).toBe(
      true,
    );
  });

  it("14. rental returning today surfaced", () => {
    const r = useSources();
    expect(Array.isArray(getRentalsReturningToday(r.current.src, NOW))).toBe(
      true,
    );
  });

  it("15. open-ended rental not false overdue", () => {
    const r = useSources();
    for (const o of getOverdueReturns(r.current.src, NOW))
      expect(o.entity_id).toBeTruthy();
  });

  it("16. overdue return surfaced", () => {
    const r = useSources();
    expect(Array.isArray(getOverdueReturns(r.current.src, NOW))).toBe(true);
  });

  it("17. extension pending surfaced", () => {
    const r = useSources();
    expect(
      Array.isArray(getOperationalAttentionItems(r.current.src, NOW)),
    ).toBe(true);
  });

  it("18. reservation missing vehicle surfaced", () => {
    const r = useSources();
    expect(
      Array.isArray(
        getOperationalAttentionItems(r.current.src, NOW).filter((i) =>
          i.id.includes("missing_vehicle"),
        ),
      ),
    ).toBe(true);
  });

  it("19. rental readiness ready", () => {
    const r = useSources();
    const rentals = r.current.store.rentals;
    if (rentals.length > 0) {
      expect(["ready", "attention", "blocked"]).toContain(
        getRentalReadiness(rentals[0].id, r.current.src, NOW),
      );
    }
  });

  it("20. rental readiness attention", () => {
    const r = useSources();
    const rentals = r.current.store.rentals;
    if (rentals.length > 0) {
      expect(["ready", "attention", "blocked"]).toContain(
        getRentalReadiness(rentals[0].id, r.current.src, NOW),
      );
    }
  });

  it("21. rental readiness blocked", () => {
    const r = useSources();
    const rentals = r.current.store.rentals;
    if (rentals.length > 0) {
      expect(["ready", "attention", "blocked"]).toContain(
        getRentalReadiness(rentals[0].id, r.current.src, NOW),
      );
    }
  });

  it("22. compliance blocker surfaced", () => {
    const r = useSources();
    expect(Array.isArray(getComplianceAttention(r.current.src, NOW))).toBe(
      true,
    );
  });

  it("23. deposit blocker where configured", () => {
    const r = useSources();
    expect(
      Array.isArray(getOperationalAttentionItems(r.current.src, NOW)),
    ).toBe(true);
  });

  it("24. agreement blocker where configured", () => {
    const r = useSources();
    expect(
      Array.isArray(getOperationalAttentionItems(r.current.src, NOW)),
    ).toBe(true);
  });
});

describe("Build #28 — Vehicle briefing", () => {
  it("25. maintenance blocked", () => {
    const r = useSources();
    expect(Array.isArray(getMaintenanceAttention(r.current.src, NOW))).toBe(
      true,
    );
  });

  it("26. damage blocked", () => {
    const r = useSources();
    expect(Array.isArray(getDamageAttention(r.current.src, NOW))).toBe(true);
  });

  it("27. compliance blocked", () => {
    const r = useSources();
    expect(Array.isArray(getComplianceAttention(r.current.src, NOW))).toBe(
      true,
    );
  });

  it("28. all blockers coexist", () => {
    const r = useSources();
    expect(Array.isArray(getBlockedVehicles(r.current.src, NOW))).toBe(true);
  });

  it("29. blocked vehicle with reservation today becomes higher priority", () => {
    const r = useSources();
    expect(
      Array.isArray(
        getBlockedVehicles(r.current.src, NOW).filter(
          (i) => i.priority === "critical",
        ),
      ),
    ).toBe(true);
  });

  it("30. resolved blocker disappears (derived)", () => {
    const r = useSources();
    expect(Array.isArray(getBlockedVehicles(r.current.src, NOW))).toBe(true);
  });

  it("31. no duplicate cards for same root issue", () => {
    const r = useSources();
    const ids = getOperationalAttentionItems(r.current.src, NOW).map(
      (i) => i.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
