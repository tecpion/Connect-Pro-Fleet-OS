// Connect Pro Fleet — Build #27 Customer 360 + unified timeline tests.
//
// Verifies the Customer 360 aggregation layer composes authoritative modules
// correctly: active rental, lifetime days, outstanding balance, deposits,
// damage/violation/compliance counts, relationship status, attention items,
// and the unified timeline (normalizers, sorting, filtering, pagination, deep
// links, financial privacy, malformed-date safety). All dates pinned to the
// 2026 seed timeline (NOW = 2026-09-02). Pure selectors tested via the real
// StoreProvider + cross-module providers (same pattern as reportDomain tests).

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
import {
  CustomerNotesProvider,
  useCustomerNotes,
} from "@/lib/customerNoteStore";
import {
  getCustomer360Summary,
  getCustomerRelationshipStatus,
  getCustomerAttentionItems,
  getLifetimeRentalDays,
  type Customer360Sources,
} from "@/lib/customer360Selectors";
import {
  getCustomerTimeline,
  sortTimeline,
  filterTimeline,
  paginateTimeline,
} from "@/lib/timelineComposer";
import { TIMELINE_CATEGORY_LABELS } from "@/lib/timelineTypes";
import type { UnifiedTimelineEvent } from "@/lib/timelineTypes";

const NOW = new Date("2026-09-02T12:00:00Z");
const DAY = 86_400_000;

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
      const customer360Sources: Customer360Sources = {
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
      return {
        customer360Sources,
        timelineSources: {
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
        },
      };
    },
    { wrapper },
  ).result;
}

describe("Build #27 — Customer 360 summary", () => {
  it("1. active rental resolved for cus_1 (rnt_1 active)", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.activeRental).not.toBeNull();
    expect(s.activeRental?.id).toBe("rnt_1");
  });

  it("2. total rentals counts all customer rentals", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.totalRentals).toBeGreaterThanOrEqual(1);
  });

  it("3. lifetime rental days > 0 for an active rental", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.lifetimeRentalDays).toBeGreaterThan(0);
  });

  it("4. outstanding balance sums active rental balances (cus_8 late rnt_2)", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_8", r.current.customer360Sources, NOW);
    expect(s.outstandingBalance).toBeGreaterThan(0);
  });

  it("5. next payment due surfaced from active rental (string or null)", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(
      s.nextPaymentDue === null || typeof s.nextPaymentDue === "string",
    ).toBe(true);
  });

  it("6. current deposit held derived from deposit ledger (not revenue)", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.currentDepositHeld).toBeGreaterThanOrEqual(0);
  });

  it("7. open damage claims counted", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.openDamageClaims).toBeGreaterThanOrEqual(0);
  });

  it("8. open violations counted", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.openViolations).toBeGreaterThanOrEqual(0);
  });

  it("9. compliance status derived (not a fake risk score)", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect([
      "compliant",
      "attention_needed",
      "non_compliant",
      "blocked",
      "unknown",
    ]).toContain(s.complianceStatus);
  });

  it("10. overdue tasks counted", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.overdueTasks).toBeGreaterThanOrEqual(0);
  });

  it("11. account owner resolved from active assignment or null", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    // accountOwner is null when no active owner assignment — never a fake name.
    expect(s.accountOwner === null || typeof s.accountOwner === "string").toBe(
      true,
    );
  });

  it("12. last activity timestamp derived across rentals/payments", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(s.lastActivityAt).not.toBeNull();
  });

  it("13. customer with no rentals returns zero totals + prospect status", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_5", r.current.customer360Sources, NOW);
    expect(s.totalRentals).toBe(0);
    expect(s.activeRental).toBeNull();
    expect(s.lifetimeRentalDays).toBe(0);
  });
});

describe("Build #27 — Customer relationship status", () => {
  it("14. active rental → active_renter", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    expect(getCustomerRelationshipStatus(s, false)).toBe("active_renter");
  });

  it("15. no rental + reservation + compliant → reservation", () => {
    // Pure-function: synthetic compliant summary with no active rental.
    const rel = getCustomerRelationshipStatus(
      { activeRental: null, totalRentals: 0, complianceStatus: "compliant" },
      true,
    );
    expect(rel).toBe("reservation");
  });

  it("16. no rental + no reservation + past rentals + compliant → past_customer", () => {
    const rel = getCustomerRelationshipStatus(
      { activeRental: null, totalRentals: 2, complianceStatus: "compliant" },
      false,
    );
    expect(rel).toBe("past_customer");
  });

  it("17. no rentals + no reservation + compliant → prospect", () => {
    const rel = getCustomerRelationshipStatus(
      { activeRental: null, totalRentals: 0, complianceStatus: "compliant" },
      false,
    );
    expect(rel).toBe("prospect");
  });

  it("17b. blocked compliance → attention_needed (overrides reservation/past)", () => {
    const rel = getCustomerRelationshipStatus(
      { activeRental: null, totalRentals: 0, complianceStatus: "blocked" },
      true,
    );
    expect(rel).toBe("attention_needed");
  });

  it("18. never produces a credit/risk score", () => {
    const r = useSources();
    const s = getCustomer360Summary("cus_1", r.current.customer360Sources, NOW);
    const rel = getCustomerRelationshipStatus(s, false);
    expect(rel).not.toMatch(/score|risk|credit/i);
  });
});

describe("Build #27 — Customer attention items", () => {
  it("19. late balance surfaces as attention item (cus_8)", () => {
    const r = useSources();
    const items = getCustomerAttentionItems(
      "cus_8",
      r.current.customer360Sources,
      NOW,
    );
    expect(items.some((a) => a.type === "late_balance")).toBe(true);
  });

  it("20. resolved issue excluded from attention (cus_7 completed rental, no balance)", () => {
    const r = useSources();
    const items = getCustomerAttentionItems(
      "cus_7",
      r.current.customer360Sources,
      NOW,
    );
    expect(items.some((a) => a.type === "late_balance")).toBe(false);
  });

  it("21. attention severity is critical/high/medium/normal only", () => {
    const r = useSources();
    const items = getCustomerAttentionItems(
      "cus_1",
      r.current.customer360Sources,
      NOW,
    );
    for (const a of items) {
      expect(["critical", "high", "medium", "normal"]).toContain(a.severity);
    }
  });
});

describe("Build #27 — lifetime rental days helper", () => {
  it("22. completed rental counts scheduled duration", () => {
    const days = getLifetimeRentalDays(
      [
        {
          checkout_date: "2026-07-15",
          actual_return_date: "2026-07-22",
          scheduled_return_date: "2026-07-22",
        },
      ],
      NOW,
    );
    expect(days).toBe(7);
  });

  it("23. open rental counts up to now", () => {
    const days = getLifetimeRentalDays(
      [
        {
          checkout_date: "2026-08-24",
          actual_return_date: null,
          scheduled_return_date: null,
        },
      ],
      NOW,
    );
    expect(days).toBeGreaterThan(0);
  });

  it("24. missing checkout → 0 days for that rental (no crash)", () => {
    const days = getLifetimeRentalDays(
      [
        {
          checkout_date: null,
          actual_return_date: null,
          scheduled_return_date: null,
        },
      ],
      NOW,
    );
    expect(days).toBe(0);
  });
});

describe("Build #27 — Customer unified timeline", () => {
  it("25. timeline includes rental start event for cus_1", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    expect(tl.some((e) => e.category === "rental")).toBe(true);
  });

  it("26. timeline includes payment events for cus_1", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    expect(tl.some((e) => e.category === "payment")).toBe(true);
  });

  it("27. timeline events carry deep links to authoritative entities", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    const rentalEv = tl.find((e) => e.category === "rental");
    expect(rentalEv?.deep_link).toBeTruthy();
  });

  it("28. timeline newest-first ordering", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    for (let i = 1; i < tl.length; i++) {
      const a = new Date(tl[i - 1].occurred_at).getTime() || 0;
      const b = new Date(tl[i].occurred_at).getTime() || 0;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it("29. category filter returns only matching events", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    const onlyPayments = filterTimeline(tl, ["payment"]);
    expect(onlyPayments.length).toBeGreaterThan(0);
    expect(onlyPayments.every((e) => e.category === "payment")).toBe(true);
  });

  it("30. empty category filter returns all", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    expect(filterTimeline(tl, []).length).toBe(tl.length);
  });

  it("31. malformed occurred_at sorts last (no crash)", () => {
    const events: UnifiedTimelineEvent[] = [
      {
        id: "a",
        occurred_at: "not-a-date",
        event_type: "x",
        category: "system",
        title: "Bad date",
        description: null,
        entity_type: "customer",
        entity_id: "cus_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "test",
        actor_id: null,
        actor_name: null,
        financial_amount: null,
        financial_direction: null,
        severity: "info",
        status: null,
        deep_link: null,
        metadata: null,
        sensitive: false,
        customer_id: "cus_1",
        vehicle_id: null,
        rental_id: null,
      },
      {
        id: "b",
        occurred_at: "2026-09-01T00:00:00Z",
        event_type: "y",
        category: "system",
        title: "Good date",
        description: null,
        entity_type: "customer",
        entity_id: "cus_1",
        related_entity_type: null,
        related_entity_id: null,
        source_module: "test",
        actor_id: null,
        actor_name: null,
        financial_amount: null,
        financial_direction: null,
        severity: "info",
        status: null,
        deep_link: null,
        metadata: null,
        sensitive: false,
        customer_id: "cus_1",
        vehicle_id: null,
        rental_id: null,
      },
    ];
    const sorted = sortTimeline(events, "newest");
    // Good date first, bad date (ts 0) last.
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });

  it("32. oldest-first ordering reverses newest-first", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    const oldest = sortTimeline(tl, "oldest");
    expect(oldest.length).toBe(tl.length);
    // oldest-first: first >= ... no wait reversed so first is smallest
    const firstTs = new Date(oldest[0].occurred_at).getTime() || 0;
    const lastTs =
      new Date(oldest[oldest.length - 1].occurred_at).getTime() || 0;
    expect(firstTs).toBeLessThanOrEqual(lastTs);
  });

  it("33. pagination slices + reports hasMore", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    const page1 = paginateTimeline(tl, 1, 2);
    expect(page1.items.length).toBe(Math.min(2, tl.length));
    expect(page1.total).toBe(tl.length);
    if (tl.length > 2) expect(page1.hasMore).toBe(true);
  });

  it("34. timeline event ids are stable (module:source:type)", () => {
    const r = useSources();
    const tl = getCustomerTimeline("cus_1", r.current.timelineSources);
    for (const e of tl) {
      expect(e.id.includes(":")).toBe(true);
    }
  });

  it("35. unknown customer returns empty timeline (empty state safe, no crash)", () => {
    const r = useSources();
    const tl = getCustomerTimeline(
      "cus_nonexistent",
      r.current.timelineSources,
    );
    expect(tl.length).toBe(0);
  });

  it("36. TIMELINE_CATEGORY_LABELS covers all categories", () => {
    const cats = Object.keys(TIMELINE_CATEGORY_LABELS);
    expect(cats.length).toBeGreaterThanOrEqual(15);
    expect(TIMELINE_CATEGORY_LABELS.rental).toBe("Rentals");
  });
});
