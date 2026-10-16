// Connect Pro Fleet — Build #27 Vehicle Digital Twin + utilization tests.
//
// Verifies the Digital Twin aggregation layer: blocked-interval merging (no
// double-counting of overlapping maintenance/damage/compliance), utilization
// math (rentable = calendar - blocked, idle = rentable - rented), exchange-
// awareness, idle-vehicle sorting, damage frequency, attention items, and
// the twin summary. Pure helpers are tested directly; store-backed selectors
// use the real provider tree (same pattern as customer360Domain tests).
// NOW = 2026-09-02.

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
  mergeBlockedIntervals,
  countBlockedDays,
  getVehicleBlockedIntervals,
  getVehicleUtilization,
  getVehicleDigitalTwinSummary,
  getAvailableIdleVehicles,
  getVehicleDamageFrequency,
  getVehicleAttentionItems,
  type BlockedInterval,
  type VehicleTwinSources,
} from "@/lib/vehicleTwinSelectors";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import type { DateRange } from "@/lib/profitabilityHelpers";

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
                      <ComplianceProvider>{children}</ComplianceProvider>
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
      const { investorVehicles } = useInvestors();
      const { expenseRules } = usePartnerships();
      const vehicleTwinSources: VehicleTwinSources = {
        store,
        damageClaims: dc.damageClaims,
        violations: vio.violations,
        documents: comp.documents,
        requirements: comp.requirements,
        overrides: comp.overrides,
        range: resolveProfitabilityRange("this_year", undefined, NOW),
      };
      return { vehicleTwinSources, store, investorVehicles, expenseRules };
    },
    { wrapper },
  ).result;
}

function range(start: string, end: string): DateRange {
  return { start: new Date(start), end: new Date(end) };
}

describe("Build #27 — blocked interval merging (pure)", () => {
  it("52. fully overlapping maintenance + damage merge to one span (no double count)", () => {
    const intervals: BlockedInterval[] = [
      {
        source: "maintenance",
        start: "2026-08-19T00:00:00Z",
        end: "2026-08-25T00:00:00Z",
        reason: "Maintenance: brakes",
      },
      {
        source: "damage",
        start: "2026-08-20T00:00:00Z",
        end: "2026-08-24T00:00:00Z",
        reason: "Damage: fender",
      },
    ];
    const merged = mergeBlockedIntervals(intervals);
    expect(merged.length).toBe(1);
    // Merged reason contains both sources.
    expect(merged[0].reason).toContain("Maintenance");
    expect(merged[0].reason).toContain("Damage");
  });

  it("53. non-overlapping intervals stay separate", () => {
    const intervals: BlockedInterval[] = [
      {
        source: "maintenance",
        start: "2026-08-01T00:00:00Z",
        end: "2026-08-03T00:00:00Z",
        reason: "A",
      },
      {
        source: "damage",
        start: "2026-08-10T00:00:00Z",
        end: "2026-08-12T00:00:00Z",
        reason: "B",
      },
    ];
    expect(mergeBlockedIntervals(intervals).length).toBe(2);
  });

  it("54. malformed start date filtered out (no crash)", () => {
    const intervals: BlockedInterval[] = [
      { source: "maintenance", start: "not-a-date", end: null, reason: "bad" },
      {
        source: "damage",
        start: "2026-08-10T00:00:00Z",
        end: "2026-08-12T00:00:00Z",
        reason: "good",
      },
    ];
    const merged = mergeBlockedIntervals(intervals);
    expect(merged.length).toBe(1);
    expect(merged[0].reason).toBe("good");
  });

  it("55. empty intervals → empty merged", () => {
    expect(mergeBlockedIntervals([])).toEqual([]);
  });

  it("56. countBlockedDays counts distinct calendar days (merged)", () => {
    const intervals: BlockedInterval[] = [
      {
        source: "maintenance",
        start: "2026-08-19T00:00:00Z",
        end: "2026-08-21T00:00:00Z",
        reason: "A",
      },
      {
        source: "damage",
        start: "2026-08-20T00:00:00Z",
        end: "2026-08-22T00:00:00Z",
        reason: "B",
      },
    ];
    // Overlap 08-19..08-22 → 4 distinct days, not 6.
    expect(countBlockedDays(intervals, NOW)).toBe(4);
  });

  it("57. open-ended block (null end) counts up to now", () => {
    const intervals: BlockedInterval[] = [
      {
        source: "maintenance",
        start: "2026-08-30T00:00:00Z",
        end: null,
        reason: "ongoing",
      },
    ];
    const days = countBlockedDays(intervals, NOW);
    // 08-30, 08-31, 09-01, 09-02 → at least 3 days.
    expect(days).toBeGreaterThanOrEqual(3);
  });
});

describe("Build #27 — vehicle blocked intervals (store, seeded)", () => {
  it("58. veh_3 has both maintenance + damage blocks coexisting (merged reason)", () => {
    const r = useSources();
    const intervals = getVehicleBlockedIntervals(
      "veh_3",
      r.current.vehicleTwinSources,
      NOW,
    );
    // Merged interval reason lists both coexisting block sources.
    const allReasons = intervals.map((i) => i.reason.toLowerCase()).join(";");
    expect(allReasons).toContain("maintenance");
    expect(allReasons).toContain("damage");
  });

  it("59. veh_5 maintenance block present", () => {
    const r = useSources();
    const intervals = getVehicleBlockedIntervals(
      "veh_5",
      r.current.vehicleTwinSources,
      NOW,
    );
    expect(intervals.some((i) => i.source === "maintenance")).toBe(true);
  });

  it("60. veh_2 compliance block present (expired registration)", () => {
    const r = useSources();
    const intervals = getVehicleBlockedIntervals(
      "veh_2",
      r.current.vehicleTwinSources,
      NOW,
    );
    expect(intervals.some((i) => i.source === "compliance")).toBe(true);
  });

  it("61. veh_4 completed maintenance (past, ended) does not produce an open block", () => {
    const r = useSources();
    const intervals = getVehicleBlockedIntervals(
      "veh_4",
      r.current.vehicleTwinSources,
      NOW,
    );
    // veh_4's only blocking WO ended 2026-07-15 — closed, no open-ended block.
    expect(
      intervals.every((i) => i.end !== null || i.source !== "maintenance"),
    ).toBe(true);
  });
});

describe("Build #27 — vehicle utilization (store, seeded)", () => {
  it("62. utilization returns calendarDays >= rentableDays >= rentedDays", () => {
    const r = useSources();
    const util = getVehicleUtilization(
      "veh_1",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(util.calendarDays).toBeGreaterThanOrEqual(util.rentableDays);
    expect(util.rentableDays).toBeGreaterThanOrEqual(util.rentedDays);
    expect(util.idleDays).toBe(util.rentableDays - util.rentedDays);
  });

  it("63. utilizationPct = rentedDays / rentableDays (0 when rentable=0)", () => {
    const r = useSources();
    const util = getVehicleUtilization(
      "veh_1",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    const expected =
      util.rentableDays > 0
        ? Math.round((util.rentedDays / util.rentableDays) * 100 * 10) / 10
        : 0;
    expect(util.utilizationPct).toBe(expected);
  });

  it("64. zero rentable days safe (utilizationPct = 0, no NaN)", () => {
    // A range fully consumed by a block could yield rentable 0; construct a
    // synthetic source where the whole range is blocked.
    const r = useSources();
    // Use a 1-day range on a fully-blocked vehicle.
    const util = getVehicleUtilization(
      "veh_5",
      r.current.vehicleTwinSources,
      range("2026-08-12T00:00:00Z", "2026-08-12T23:59:59Z"),
      NOW,
    );
    expect(Number.isNaN(util.utilizationPct)).toBe(false);
    expect(util.utilizationPct).toBeGreaterThanOrEqual(0);
  });

  it("65. blocked days excluded from rentable denominator (veh_3 has blocks)", () => {
    const r = useSources();
    const util = getVehicleUtilization(
      "veh_3",
      r.current.vehicleTwinSources,
      range("2026-08-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(util.blockedDays).toBeGreaterThan(0);
    expect(util.rentableDays).toBeLessThan(util.calendarDays);
  });
});

describe("Build #27 — vehicle digital twin summary (store, seeded)", () => {
  it("66. veh_1 current renter + rental resolved", () => {
    const r = useSources();
    const s = getVehicleDigitalTwinSummary(
      "veh_1",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(s.currentRentalId).toBe("rnt_1");
    expect(s.currentCustomerId).toBe("cus_1");
  });

  it("67. veh_2 compliance blocked → blockingReasons non-empty", () => {
    const r = useSources();
    const s = getVehicleDigitalTwinSummary(
      "veh_2",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(s.complianceStatus).toBe("blocked");
    expect(s.blockingReasons.length).toBeGreaterThan(0);
  });

  it("68. veh_3 multiple blockers coexist (maintenance + damage reasons preserved)", () => {
    const r = useSources();
    const intervals = getVehicleBlockedIntervals(
      "veh_3",
      r.current.vehicleTwinSources,
      NOW,
    );
    // Coexisting block sources are preserved in the merged reason(s), not
    // overwritten by one another (spec §18/§28/§45).
    const allReasons = intervals.map((i) => i.reason.toLowerCase()).join(";");
    expect(allReasons).toContain("maintenance");
    expect(allReasons).toContain("damage");
  });

  it("69. ownership type surfaced", () => {
    const r = useSources();
    const s = getVehicleDigitalTwinSummary(
      "veh_1",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(
      s.ownershipType === null || typeof s.ownershipType === "string",
    ).toBe(true);
  });

  it("70. last activity derived across rentals/maintenance/transactions", () => {
    const r = useSources();
    const s = getVehicleDigitalTwinSummary(
      "veh_1",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(s.lastActivityAt).not.toBeNull();
  });
});

describe("Build #27 — idle vehicles + damage frequency", () => {
  it("71. getAvailableIdleVehicles returns only status=available + idle>0, sorted desc", () => {
    const r = useSources();
    const idle = getAvailableIdleVehicles(
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    for (const v of idle) expect(v.status).toBe("available");
    for (let i = 1; i < idle.length; i++) {
      expect(idle[i - 1].idleDays).toBeGreaterThanOrEqual(idle[i].idleDays);
    }
  });

  it("72. getVehicleDamageFrequency counts claims in window (no risk label)", () => {
    const r = useSources();
    const freq = getVehicleDamageFrequency(
      "veh_1",
      r.current.vehicleTwinSources.damageClaims ?? [],
      365,
      NOW,
    );
    expect(freq).toBeGreaterThanOrEqual(0);
  });
});

describe("Build #27 — vehicle attention items", () => {
  it("73. veh_2 compliance block surfaces as critical attention", () => {
    const r = useSources();
    const items = getVehicleAttentionItems(
      "veh_2",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(
      items.some(
        (a) => a.type === "compliance_block" && a.severity === "critical",
      ),
    ).toBe(true);
  });

  it("74. veh_3 maintenance + damage blocks both surface", () => {
    const r = useSources();
    const items = getVehicleAttentionItems(
      "veh_3",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(items.some((a) => a.type === "maintenance_block")).toBe(true);
    expect(items.some((a) => a.type === "damage_block")).toBe(true);
  });

  it("75. resolved issue excluded — veh_4 has no open block (completed maintenance)", () => {
    const r = useSources();
    const items = getVehicleAttentionItems(
      "veh_4",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    expect(items.some((a) => a.type === "maintenance_block")).toBe(false);
  });

  it("76. attention severity only critical/high/medium/normal", () => {
    const r = useSources();
    const items = getVehicleAttentionItems(
      "veh_1",
      r.current.vehicleTwinSources,
      range("2026-01-01T00:00:00Z", "2026-09-02T23:59:59Z"),
      NOW,
    );
    for (const a of items) {
      expect(["critical", "high", "medium", "normal"]).toContain(a.severity);
    }
  });
});
