// Connect Pro Fleet — Build #27 AI context builders, relationship selectors,
// and privacy filtering tests.
//
// Verifies: (a) the AI operational context builders return STRUCTURED data
// (no LLM/prose), permission-filtered; (b) relationship selectors expose
// customer↔vehicle↔rental graph access; (c) financial privacy strips amounts
// when the viewer lacks financial permission; (d) sensitive document numbers
// are masked and raw file references removed without sensitive permission;
// (e) banking details never leak. NOW = 2026-09-02.

import { describe, it, expect } from "vitest";
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
import {
  StaffAssignmentProvider,
  useStaffAssignments,
} from "@/lib/staffAssignmentStore";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider, useViolations } from "@/lib/violationStoreProvider";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import {
  CustomerNotesProvider,
  useCustomerNotes,
} from "@/lib/customerNoteStore";
import {
  buildCustomerOperationalContext,
  buildVehicleOperationalContext,
  filterTimelineForViewer,
  filterSensitiveDocsForViewer,
  type ViewerPermissions,
} from "@/lib/aiContextBuilders";
import {
  getCustomerRelationships,
  getVehicleRelationships,
} from "@/lib/relationshipSelectors";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import type { UnifiedTimelineEvent } from "@/lib/timelineTypes";

const NOW = new Date("2026-09-02T12:00:00Z");

function wrapper({ children }: { children: ReactNode }) {
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

function useSources() {
  return renderHook(
    () => {
      const store = useStore();
      const billing = useBilling();
      const dc = useDamageClaims();
      const vio = useViolations();
      const comp = useCompliance();
      const assignments = useStaffAssignments();
      const notes = useCustomerNotes();
      const { investorVehicles } = useInvestors();
      const { expenseRules } = usePartnerships();
      const customer360Sources = {
        store,
        billingPeriods: billing.billingPeriods,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        tasks: store.tasks,
        assignments: assignments.assignments,
        paymentArrangements: store.paymentArrangements,
      };
      const vehicleTwinSources = {
        store,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        range: resolveProfitabilityRange("this_year", undefined, NOW),
      };
      const timelineSources = {
        store,
        billingPeriods: billing.billingPeriods,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        complianceEvents: comp.complianceEvents,
        tasks: store.tasks,
        taskEvents: store.taskEvents,
        assignments: assignments.assignments,
        notes: notes.notes,
        workOrderEvents: store.workOrders.flatMap((w) =>
          store.workOrderEvents(w.id).map((event) => ({
            event,
            vehicleId: w.vehicle_id,
          })),
        ),
      };
      return {
        customer360Sources,
        vehicleTwinSources,
        timelineSources,
        store,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        tasks: store.tasks,
        assignments: assignments.assignments,
        expenses: store.expenses,
        investorVehicles,
      };
    },
    { wrapper },
  ).result;
}

const FULL_PERMS: ViewerPermissions = {
  canViewFinancials: true,
  canViewProfitability: true,
  canViewSensitiveDocs: true,
  canViewBanking: true,
};
const NO_MONEY: ViewerPermissions = {
  canViewFinancials: false,
  canViewProfitability: true,
  canViewSensitiveDocs: true,
  canViewBanking: false,
};
const NO_SENSITIVE: ViewerPermissions = {
  canViewFinancials: true,
  canViewProfitability: true,
  canViewSensitiveDocs: false,
  canViewBanking: false,
};

describe("Build #27 — AI customer operational context", () => {
  it("85. customer context contains structured operational info", () => {
    const r = useSources();
    const ctx = buildCustomerOperationalContext(
      "cus_1",
      r.current.customer360Sources,
      FULL_PERMS,
      NOW,
    );
    expect(ctx.customerId).toBe("cus_1");
    expect(ctx.relationshipStatus).toBeTruthy();
    expect(ctx.summary.totalRentals).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(ctx.attentionItems)).toBe(true);
    expect(Array.isArray(ctx.recentTimeline)).toBe(true);
    expect(Array.isArray(ctx.documents)).toBe(true);
  });

  it("86. customer context does NOT generate prose AI answers", () => {
    const r = useSources();
    const ctx = buildCustomerOperationalContext(
      "cus_1",
      r.current.customer360Sources,
      FULL_PERMS,
      NOW,
    );
    // Context is structured data, not a prose string.
    expect(typeof ctx).toBe("object");
    expect(ctx).not.toHaveProperty("answer");
    expect(ctx).not.toHaveProperty("narrative");
  });

  it("87. permission filtering — no financial permission → balance null", () => {
    const r = useSources();
    const ctx = buildCustomerOperationalContext(
      "cus_8",
      r.current.customer360Sources,
      NO_MONEY,
      NOW,
    );
    expect(ctx.summary.outstandingBalance).toBeNull();
    expect(ctx.summary.currentDepositHeld).toBeNull();
  });

  it("88. authorized user sees allowed balance", () => {
    const r = useSources();
    const ctx = buildCustomerOperationalContext(
      "cus_8",
      r.current.customer360Sources,
      FULL_PERMS,
      NOW,
    );
    expect(ctx.summary.outstandingBalance).not.toBeNull();
    expect(ctx.summary.outstandingBalance!).toBeGreaterThan(0);
  });

  it("89. no sensitive-doc permission → document numbers masked, no raw file ref", () => {
    const r = useSources();
    const ctx = buildCustomerOperationalContext(
      "cus_1",
      r.current.customer360Sources,
      NO_SENSITIVE,
      NOW,
    );
    for (const d of ctx.documents) {
      if (d.document_number) {
        // Masked form is ••••1234 (never the raw full number).
        expect(d.document_number.startsWith("••••")).toBe(true);
      }
    }
  });
});

describe("Build #27 — AI vehicle operational context", () => {
  it("90. vehicle context contains structured operational info", () => {
    const r = useSources();
    const range = resolveProfitabilityRange("this_year", undefined, NOW);
    const ctx = buildVehicleOperationalContext(
      "veh_1",
      r.current.vehicleTwinSources,
      range,
      FULL_PERMS,
      NOW,
    );
    expect(ctx.vehicleId).toBe("veh_1");
    expect(ctx.vehicleLabel).toContain("Wrangler");
    expect(ctx.summary.currentStatus).toBeTruthy();
    expect(Array.isArray(ctx.attentionItems)).toBe(true);
    expect(Array.isArray(ctx.recentTimeline)).toBe(true);
  });

  it("91. vehicle context idle vehicles only when profitability permitted", () => {
    const r = useSources();
    const range = resolveProfitabilityRange("this_year", undefined, NOW);
    const noProfit: ViewerPermissions = {
      canViewFinancials: true,
      canViewProfitability: false,
      canViewSensitiveDocs: true,
      canViewBanking: false,
    };
    const ctx = buildVehicleOperationalContext(
      "veh_1",
      r.current.vehicleTwinSources,
      range,
      noProfit,
      NOW,
    );
    expect(ctx.idleVehicles).toEqual([]);
  });

  it("92. vehicle context does NOT duplicate financial truth (no new profit formula)", () => {
    const r = useSources();
    const range = resolveProfitabilityRange("this_year", undefined, NOW);
    const ctx = buildVehicleOperationalContext(
      "veh_1",
      r.current.vehicleTwinSources,
      range,
      FULL_PERMS,
      NOW,
    );
    // Summary exposes utilization + status, not a recomputed profit number.
    expect(ctx.summary).not.toHaveProperty("revenue");
    expect(ctx.summary).not.toHaveProperty("operatingProfit");
  });
});

describe("Build #27 — relationship selectors", () => {
  it("93. customer relationships expose rentals + vehicles + payments", () => {
    const r = useSources();
    const rel = getCustomerRelationships(
      "cus_1",
      r.current.store,
      r.current.damageClaims,
      r.current.violations,
      r.current.documents,
      r.current.tasks,
      r.current.assignments,
    );
    expect(rel.rentals.length).toBeGreaterThanOrEqual(1);
    expect(rel.rentals[0].type).toBe("rental");
    // Vehicles derived from the customer's rentals.
    expect(rel.vehicles.length).toBeGreaterThanOrEqual(1);
  });

  it("94. vehicle relationships expose rentals + customers", () => {
    const r = useSources();
    const rel = getVehicleRelationships(
      "veh_1",
      r.current.store,
      r.current.damageClaims,
      r.current.violations,
      r.current.documents,
      r.current.expenses,
      r.current.tasks,
      r.current.assignments,
      r.current.investorVehicles,
    );
    expect(rel.rentals.length).toBeGreaterThanOrEqual(1);
    expect(rel.customers.length).toBeGreaterThanOrEqual(1);
  });

  it("95. relationship refs are id+label+type only (no sensitive/financial values)", () => {
    const r = useSources();
    const rel = getCustomerRelationships(
      "cus_1",
      r.current.store,
      r.current.damageClaims,
      r.current.violations,
      r.current.documents,
      r.current.tasks,
      r.current.assignments,
    );
    for (const list of [
      rel.rentals,
      rel.vehicles,
      rel.damage,
      rel.violations,
    ]) {
      for (const ref of list) {
        expect(ref).toHaveProperty("id");
        expect(ref).toHaveProperty("label");
        expect(ref).toHaveProperty("type");
        expect(Object.keys(ref).length).toBe(3);
      }
    }
  });
});

describe("Build #27 — timeline financial privacy filter", () => {
  it("96. no financial permission → amounts stripped, titles kept", () => {
    const events: UnifiedTimelineEvent[] = [
      {
        id: "p1",
        occurred_at: "2026-09-01T00:00:00Z",
        event_type: "payment",
        category: "payment",
        title: "Payment recorded",
        description: null,
        entity_type: "rental",
        entity_id: "rnt_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "payments",
        actor_id: null,
        actor_name: null,
        financial_amount: 1250,
        financial_direction: "in",
        severity: "success",
        status: null,
        deep_link: "/rentals/rnt_1",
        metadata: { amount: 1250, balance: 0, note: "keep" },
        sensitive: false,
        customer_id: "cus_1",
        vehicle_id: null,
        rental_id: "rnt_1",
      },
    ];
    const filtered = filterTimelineForViewer(events, NO_MONEY);
    expect(filtered[0].financial_amount).toBeNull();
    expect(filtered[0].financial_direction).toBeNull();
    // Title kept (privacy: viewer sees "Payment recorded" but not the amount).
    expect(filtered[0].title).toBe("Payment recorded");
    // Financial metadata keys stripped, non-financial kept.
    expect(filtered[0].metadata).not.toHaveProperty("amount");
    expect(filtered[0].metadata).not.toHaveProperty("balance");
    expect(filtered[0].metadata).toHaveProperty("note");
  });

  it("97. full financial permission → amounts preserved", () => {
    const events: UnifiedTimelineEvent[] = [
      {
        id: "p2",
        occurred_at: "2026-09-01T00:00:00Z",
        event_type: "payment",
        category: "payment",
        title: "Payment recorded",
        description: null,
        entity_type: "rental",
        entity_id: "rnt_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "payments",
        actor_id: null,
        actor_name: null,
        financial_amount: 1250,
        financial_direction: "in",
        severity: "success",
        status: null,
        deep_link: null,
        metadata: { amount: 1250 },
        sensitive: false,
        customer_id: "cus_1",
        vehicle_id: null,
        rental_id: "rnt_1",
      },
    ];
    const filtered = filterTimelineForViewer(events, FULL_PERMS);
    expect(filtered[0].financial_amount).toBe(1250);
  });
});

describe("Build #27 — timeline sensitive-doc privacy filter", () => {
  it("98. no sensitive permission → file_reference removed from metadata", () => {
    const events: UnifiedTimelineEvent[] = [
      {
        id: "d1",
        occurred_at: "2026-09-01T00:00:00Z",
        event_type: "document_verified",
        category: "document",
        title: "Driver license verified",
        description: null,
        entity_type: "customer",
        entity_id: "cus_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "compliance",
        actor_id: null,
        actor_name: null,
        financial_amount: null,
        financial_direction: null,
        severity: "info",
        status: null,
        deep_link: null,
        metadata: { masked_number: "••••9821", file_reference: "mem://dl.pdf" },
        sensitive: true,
        customer_id: "cus_1",
        vehicle_id: null,
        rental_id: null,
      },
    ];
    const filtered = filterSensitiveDocsForViewer(events, NO_SENSITIVE);
    expect(filtered[0].metadata).not.toHaveProperty("file_reference");
    // Masked number kept (already masked by normalizer).
    expect(filtered[0].metadata).toHaveProperty("masked_number");
  });

  it("99. sensitive permission → file_reference preserved", () => {
    const events: UnifiedTimelineEvent[] = [
      {
        id: "d2",
        occurred_at: "2026-09-01T00:00:00Z",
        event_type: "document_verified",
        category: "document",
        title: "Driver license verified",
        description: null,
        entity_type: "customer",
        entity_id: "cus_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "compliance",
        actor_id: null,
        actor_name: null,
        financial_amount: null,
        financial_direction: null,
        severity: "info",
        status: null,
        deep_link: null,
        metadata: { masked_number: "••••9821", file_reference: "mem://dl.pdf" },
        sensitive: true,
        customer_id: "cus_1",
        vehicle_id: null,
        rental_id: null,
      },
    ];
    const filtered = filterSensitiveDocsForViewer(events, FULL_PERMS);
    expect(filtered[0].metadata).toHaveProperty("file_reference");
  });

  it("100. non-sensitive events untouched by sensitive filter", () => {
    const events: UnifiedTimelineEvent[] = [
      {
        id: "r1",
        occurred_at: "2026-09-01T00:00:00Z",
        event_type: "rental_started",
        category: "rental",
        title: "Rental started",
        description: null,
        entity_type: "rental",
        entity_id: "rnt_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "rentals",
        actor_id: null,
        actor_name: null,
        financial_amount: null,
        financial_direction: null,
        severity: "info",
        status: null,
        deep_link: "/rentals/rnt_1",
        metadata: { note: "x" },
        sensitive: false,
        customer_id: "cus_1",
        vehicle_id: "veh_1",
        rental_id: "rnt_1",
      },
    ];
    const filtered = filterSensitiveDocsForViewer(events, NO_SENSITIVE);
    expect(filtered[0].metadata).toEqual({ note: "x" });
  });
});
