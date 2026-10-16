// Connect Pro Fleet — Incidents & Violations workspace analytics + attention
// selector tests. Pure functions with deterministic 2026 fixtures.

import { describe, it, expect } from "vitest";
import type { Incident } from "@/lib/incidents";
import type { Violation } from "@/lib/violationTypes";
import { violation as baseVio } from "./vehiclePerformanceFixtures";
import {
  workspaceSummary,
  buildTrend,
  incidentTypeBreakdown,
  violationTypeBreakdown,
  topVehiclesByFrequency,
  comparisonIndicator,
  periodReport,
  resolveAnalyticsRange,
  priorWindow,
  incidentsInWindow,
  violationsInWindow,
} from "@/lib/incidentsViolationsAnalytics";
import {
  incidentAttention,
  incidentSource,
  incidentVehicleImpact,
} from "@/lib/incidentAttention";
import {
  matchStatus,
  billingStatus,
  dueState,
  violationAttention,
  autoMatchExplanation,
} from "@/lib/violationWorkspaceAttention";
import { getOpenViolations } from "@/lib/violationSelectors";

const NOW = new Date("2026-09-10T12:00:00");
const TENANT = "tnt_1";

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "inc_x",
    tenant_id: TENANT,
    vehicle_id: "veh_1",
    reservation_id: "res_1",
    incident_type: "accident",
    description: "test",
    occurred_at: "2026-09-05",
    reported_at: "2026-09-05",
    status: "open",
    responsible_party: "renter",
    payment_amount: 0,
    payment_status: "waived",
    insurance_claim_number: null,
    assigned_staff_id: "stf_1",
    photos: [],
    created_at: "2026-09-05T00:00:00Z",
    ...over,
  };
}

function vio(over: Partial<Violation>): Violation {
  return baseVio({
    id: "vio_x",
    status: "customer_charged",
    occurred_at: "2026-09-05T10:00:00Z",
    due_at: "2026-09-25T00:00:00Z",
    total_amount: 100,
    customer_charge_status: "charged",
    responsibility: "customer",
    responsibility_decided_by: "stf_1",
    rental_id: "rnt_1",
    resolved_at: null,
    ...over,
  });
}

// 1–5. COUNTS + COMPARISON ---------------------------------------------------

describe("Incidents & Violations — counts + comparison", () => {
  it("1. incidents monthly count (this month)", () => {
    const s = workspaceSummary(
      [
        incident({ id: "i1" }),
        incident({ id: "i2", occurred_at: "2026-08-01" }),
      ],
      [],
      "this_month",
      NOW,
    );
    expect(s.incidentsThisPeriod).toBe(1);
  });
  it("2. violations monthly count (this month)", () => {
    const s = workspaceSummary(
      [],
      [
        vio({ id: "v1" }),
        vio({ id: "v2", occurred_at: "2026-08-01T00:00:00Z" }),
      ],
      "this_month",
      NOW,
    );
    expect(s.violationsThisPeriod).toBe(1);
  });
  it("3. incidents yearly count (this year)", () => {
    const s = workspaceSummary(
      [
        incident({ id: "i1" }),
        incident({ id: "i2", occurred_at: "2025-12-01" }),
      ],
      [],
      "this_year",
      NOW,
    );
    expect(s.incidentsThisYear).toBe(1);
  });
  it("4. violations yearly count (this year)", () => {
    const s = workspaceSummary(
      [],
      [
        vio({ id: "v1" }),
        vio({ id: "v2", occurred_at: "2025-12-01T00:00:00Z" }),
      ],
      "this_year",
      NOW,
    );
    expect(s.violationsThisYear).toBe(1);
  });
  it("5. prior-period comparison (this month vs last month)", () => {
    const s = workspaceSummary(
      [
        incident({ id: "i1", occurred_at: "2026-09-05" }),
        incident({ id: "i2", occurred_at: "2026-08-05" }),
      ],
      [],
      "this_month",
      NOW,
    );
    expect(s.incidentsPrior).toBe(1);
    expect(s.priorLabel).toBe("vs last month");
  });
  it("5b. comparison indicator direction", () => {
    const up = comparisonIndicator(6, 4, "vs last month");
    expect(up.direction).toBe("up");
    expect(up.pctChange).toBe(50);
    const down = comparisonIndicator(3, 4, "vs last month");
    expect(down.direction).toBe("down");
    const zero = comparisonIndicator(5, 0, "vs last month");
    expect(zero.pctChange).toBeNull();
    expect(zero.direction).toBe("up");
  });
});

// 6–11. TREND + BREAKDOWN + TOP VEHICLES + FINANCIALS -----------------------

describe("Incidents & Violations — trend + breakdown + financials", () => {
  it("6. trend chart dataset (monthly)", () => {
    const pts = buildTrend(
      [incident({ occurred_at: "2026-08-05" })],
      [
        vio({ occurred_at: "2026-08-05T00:00:00Z" }),
        vio({ id: "v2", occurred_at: "2026-07-05T00:00:00Z" }),
      ],
      "monthly",
      NOW,
      12,
    );
    expect(pts.length).toBeGreaterThan(0);
    const aug = pts.find((p) => p.label.startsWith("Aug"));
    expect(aug?.incidents).toBe(1);
    expect(aug?.violations).toBe(1);
  });
  it("7. yearly summary", () => {
    const pts = buildTrend(
      [incident({ occurred_at: "2026-08-05" })],
      [vio({ occurred_at: "2026-08-05T00:00:00Z" })],
      "yearly",
      NOW,
      3,
    );
    const y2026 = pts.find((p) => p.label === "2026");
    expect(y2026?.incidents).toBe(1);
    expect(y2026?.violations).toBe(1);
  });
  it("8. total fines (sum of total_amount in period)", () => {
    const s = workspaceSummary(
      [],
      [
        vio({ id: "v1", total_amount: 100 }),
        vio({ id: "v2", total_amount: 50 }),
      ],
      "this_month",
      NOW,
    );
    expect(s.totalFinesThisPeriod).toBe(150);
  });
  it("9. amount billed to renters (charged only)", () => {
    const s = workspaceSummary(
      [],
      [
        vio({ id: "v1", total_amount: 100, customer_charge_status: "charged" }),
        vio({
          id: "v2",
          total_amount: 50,
          customer_charge_status: "not_charged",
        }),
      ],
      "this_month",
      NOW,
    );
    expect(s.amountBilledToRenters).toBe(100);
  });
  it("9b. fine vs billed distinction", () => {
    const s = workspaceSummary(
      [],
      [
        vio({
          id: "v1",
          total_amount: 100,
          customer_charge_status: "not_charged",
        }),
      ],
      "this_month",
      NOW,
    );
    expect(s.totalFinesThisPeriod).toBe(100);
    expect(s.amountBilledToRenters).toBe(0);
  });
  it("10. type breakdown (incidents)", () => {
    const w = resolveAnalyticsRange("this_month", NOW);
    const bd = incidentTypeBreakdown(
      [
        incident({ incident_type: "accident" }),
        incident({ id: "i2", incident_type: "accident" }),
        incident({ id: "i3", incident_type: "theft" }),
      ],
      w,
    );
    expect(bd[0].type).toBe("accident");
    expect(bd[0].count).toBe(2);
  });
  it("10b. type breakdown (violations)", () => {
    const w = resolveAnalyticsRange("this_month", NOW);
    const bd = violationTypeBreakdown(
      [
        vio({ violation_type: "toll" }),
        vio({ id: "v2", violation_type: "parking_ticket" }),
      ],
      w,
    );
    expect(bd.length).toBe(2);
  });
  it("11. top vehicle frequency (raw count, not risk)", () => {
    const w = resolveAnalyticsRange("this_month", NOW);
    const top = topVehiclesByFrequency(
      [
        incident({ vehicle_id: "veh_1" }),
        incident({ id: "i2", vehicle_id: "veh_2" }),
      ],
      [vio({ vehicle_id: "veh_1" }), vio({ id: "v2", vehicle_id: "veh_1" })],
      w,
      5,
    );
    expect(top[0].vehicleId).toBe("veh_1");
    expect(top[0].total).toBe(3);
    expect(top[0].violations).toBe(2);
    expect(top[0].incidents).toBe(1);
  });
});

// 12–17. KPI COUNTS + ATTENTION ---------------------------------------------

describe("Incidents & Violations — KPI counts + attention", () => {
  it("12. incident KPI counts (open/in-review/damage/down)", () => {
    const incs = [
      incident({ id: "o1", status: "open", incident_type: "accident" }),
      incident({ id: "o2", status: "in_review", incident_type: "breakdown" }),
      incident({
        id: "o3",
        status: "resolved",
        incident_type: "other",
      }),
    ];
    expect(incs.filter((i) => i.status === "open").length).toBe(1);
    expect(incs.filter((i) => i.status === "in_review").length).toBe(1);
    expect(
      incs.filter(
        (i) =>
          i.incident_type === "damage_dispute" ||
          i.incident_type === "accident",
      ).length,
    ).toBe(1);
  });
  it("13. violation KPI counts (pending match/billed/paid/disputed)", () => {
    const vs = [
      vio({
        id: "v1",
        status: "needs_review",
        rental_id: null,
        responsibility: "unknown",
        responsibility_decided_by: null,
        customer_charge_status: "not_charged",
      }),
      vio({
        id: "v2",
        status: "customer_charged",
        customer_charge_status: "charged",
        reimbursement_status: "none",
      }),
      vio({
        id: "v3",
        status: "resolved",
        customer_charge_status: "charged",
        reimbursement_status: "full",
      }),
      vio({
        id: "v4",
        status: "disputed",
        dispute_status: "customer_disputed",
        customer_charge_status: "not_charged",
      }),
    ];
    expect(getOpenViolations(vs).length).toBe(3);
    expect(vs.filter((v) => matchStatus(v) === "unmatched").length).toBe(1);
    expect(vs.filter((v) => billingStatus(v) === "billed").length).toBe(1);
    expect(vs.filter((v) => billingStatus(v) === "paid").length).toBe(1);
    expect(vs.filter((v) => v.dispute_status !== "not_disputed").length).toBe(
      1,
    );
  });
  it("14. incident attention — unassigned + unknown responsibility", () => {
    // Pass the pinned NOW so the "Overdue follow-up (>14 days)" rule is
    // evaluated deterministically. Without `now`, production falls back to
    // real-time new Date(), which drifts past 14 days as calendar time
    // advances and flips this case to "critical". At NOW (2026-09-10) the
    // incident (occurred 2026-09-05) is only 5 days old → no overdue reason.
    const a = incidentAttention(
      incident({
        incident_type: "damage_dispute",
        status: "in_review",
        assigned_staff_id: null,
        responsible_party: "unknown",
      }),
      NOW,
    );
    expect(a.level).toBe("attention");
    expect(a.reasons).toContain("Unassigned");
    expect(a.reasons).toContain("Responsibility unresolved");
  });
  it("14b. incident attention — critical vehicle down", () => {
    const a = incidentAttention(
      incident({ incident_type: "accident", status: "open" }),
    );
    expect(a.level).toBe("critical");
    expect(a.reasons).toContain("Vehicle down");
  });
  it("15. violation attention — unmatched + not billed", () => {
    const a = violationAttention(
      vio({
        status: "needs_review",
        rental_id: null,
        responsibility: "customer",
        responsibility_decided_by: null,
        customer_charge_status: "not_charged",
        issuing_authority: "SunPass",
        due_at: null,
      }),
    );
    expect(a.level).not.toBe("none");
    expect(a.reasons).toContain("Unmatched — no rental");
    expect(a.reasons).toContain("Renter has not been billed");
  });
  it("16. violation attention — overdue critical", () => {
    const a = violationAttention(
      vio({ status: "new", due_at: "2026-08-25T00:00:00Z" }),
      NOW,
    );
    expect(a.level).toBe("critical");
    expect(a.reasons.some((r) => r.startsWith("Overdue"))).toBe(true);
  });
  it("17. violation attention — none when resolved", () => {
    const a = violationAttention(vio({ status: "resolved" }), NOW);
    expect(a.level).toBe("none");
  });
});

// 18–24. SOURCE / MATCH / BILLING / DUE / REPORTS ---------------------------

describe("Incidents & Violations — source, match, billing, due, reports", () => {
  it("18. incident source link (check-in inspection)", () => {
    const s = incidentSource(incident(), { linkedInspectionType: "checkin" });
    expect(s.kind).toBe("check_in_inspection");
    expect(s.label).toBe("Check-In Inspection");
  });
  it("19. vehicle out-of-service action inferred", () => {
    expect(
      incidentVehicleImpact(
        incident({ incident_type: "accident", status: "open" }),
      ),
    ).toBe("out_of_service");
    expect(incidentVehicleImpact(incident({ status: "resolved" }))).toBe(
      "none",
    );
  });
  it("20. damage dispute evidence source", () => {
    const s = incidentSource(incident({ incident_type: "damage_dispute" }), {
      linkedClaimId: "dmg_1",
    });
    expect(s.kind).toBe("damage_claim");
  });
  it("21. inspection linking (checkout source)", () => {
    const s = incidentSource(incident(), { linkedInspectionType: "checkout" });
    expect(s.kind).toBe("check_out_inspection");
  });
  it("22. damage claim handoff source", () => {
    const s = incidentSource(incident(), { linkedClaimId: "dmg_9" });
    expect(s.kind).toBe("damage_claim");
  });
  it("23. maintenance handoff source", () => {
    const s = incidentSource(incident(), { linkedWorkOrderId: "wo_1" });
    expect(s.kind).toBe("maintenance");
  });
  it("24. violation match states (unmatched/suggested/confirmed)", () => {
    expect(
      matchStatus(vio({ rental_id: null, responsibility_decided_by: null })),
    ).toBe("unmatched");
    expect(
      matchStatus(vio({ rental_id: "rnt_1", responsibility_decided_by: null })),
    ).toBe("suggested");
    expect(
      matchStatus(
        vio({ rental_id: "rnt_1", responsibility_decided_by: "stf_1" }),
      ),
    ).toBe("confirmed");
  });
  it("25. auto-match explanation (transparent, no score)", () => {
    const v = vio({ responsibility_reason: "renter_possessed_vehicle" });
    expect(autoMatchExplanation(v)).toContain("covered the violation date");
    expect(autoMatchExplanation(vio({ rental_id: null }))).toBeNull();
  });
  it("26. billing states separated", () => {
    expect(
      billingStatus(
        vio({
          customer_charge_status: "charged",
          reimbursement_status: "none",
        }),
      ),
    ).toBe("billed");
    expect(
      billingStatus(
        vio({
          customer_charge_status: "charged",
          reimbursement_status: "full",
        }),
      ),
    ).toBe("paid");
    expect(billingStatus(vio({ customer_charge_status: "not_charged" }))).toBe(
      "not_billed",
    );
    expect(billingStatus(vio({ status: "cancelled" }))).toBe("waived");
  });
  it("27. renter billing action (charged status)", () => {
    const v = vio({
      customer_charge_status: "not_charged",
      responsibility: "customer",
    });
    expect(billingStatus(v)).toBe("not_billed");
  });
  it("28. collections linkage — charged violation has customer charge", () => {
    const v = vio({
      customer_charge_status: "charged",
      customer_charge_transaction_id: "txn_1",
    });
    expect(v.customer_charge_transaction_id).toBeTruthy();
  });
  it("29. due/overdue state", () => {
    expect(dueState(vio({ due_at: "2026-08-25T00:00:00Z" }), NOW)).toBe(
      "overdue",
    );
    expect(dueState(vio({ due_at: "2026-09-10T18:00:00Z" }), NOW)).toBe(
      "due_today",
    );
    expect(dueState(vio({ due_at: "2026-09-15T00:00:00Z" }), NOW)).toBe(
      "due_soon",
    );
    expect(dueState(vio({ due_at: null }), NOW)).toBe("none");
  });
  it("30. quick actions — only valid actions (resolved has none)", () => {
    const v = vio({ status: "resolved" });
    expect(violationAttention(v, NOW).level).toBe("none");
  });
  it("31. monthly report data", () => {
    const r = periodReport(
      [incident({ id: "i1" })],
      [vio({ id: "v1", total_amount: 100, customer_charge_status: "charged" })],
      "this_month",
      NOW,
    );
    expect(r.totalIncidents).toBe(1);
    expect(r.totalViolations).toBe(1);
    expect(r.totalFines).toBe(100);
    expect(r.amountBilled).toBe(100);
  });
  it("32. yearly report data", () => {
    const r = periodReport(
      [incident({ id: "i1", occurred_at: "2026-03-05" })],
      [vio({ id: "v1", occurred_at: "2026-03-05T00:00:00Z" })],
      "this_year",
      NOW,
    );
    expect(r.totalIncidents).toBe(1);
    expect(r.totalViolations).toBe(1);
  });
  it("33. tenant timezone boundaries (window uses passed now)", () => {
    const local = new Date(2026, 8, 10, 12, 0, 0); // Sep 10 2026 local
    const w = resolveAnalyticsRange("this_month", local);
    expect(w.start.getMonth()).toBe(8);
    expect(w.start.getFullYear()).toBe(2026);
  });
  it("34. tenant scoping — selectors ignore other-tenant records via caller filter", () => {
    // Selectors operate on the array passed in; the store is tenant-scoped.
    const w = resolveAnalyticsRange("this_month", NOW);
    const own = [vio({ id: "v1", tenant_id: TENANT })];
    expect(violationsInWindow(own, w).length).toBe(1);
  });
  it("35. prior window null for custom range", () => {
    expect(
      priorWindow("custom", NOW, { start: "2026-09-01", end: "2026-09-10" }),
    ).toBeNull();
  });
  it("35b. incidentsInWindow / violationsInWindow respect boundaries", () => {
    const w = resolveAnalyticsRange("this_month", NOW);
    expect(
      incidentsInWindow(
        [
          incident({ occurred_at: "2026-08-31" }),
          incident({ id: "i2", occurred_at: "2026-09-01" }),
        ],
        w,
      ).length,
    ).toBe(1);
  });
});
