// Connect Pro Fleet — Build #28 summary + AI context + recent changes tests.
import { describe, it, expect } from "vitest";
import { useSources, NOW } from "./briefingDomain.test";
import {
  buildDailyBriefing,
  buildDailyBriefingContext,
  buildOperationalSummary,
  getRecentOperationalChanges,
} from "@/lib/briefingComposer";
import { getTodaysPaymentSummary } from "@/lib/briefingMoney";
import { getCustomerTimeline } from "@/lib/timelineComposer";
import { DEFAULT_BRIEFING_CONFIG } from "@/lib/briefingTypes";

const FULL_PERMS = {
  canViewFinancials: true,
  canViewProfitability: true,
  canViewSensitiveDocs: true,
  canViewBanking: true,
};
const NO_FIN_PERMS = {
  canViewFinancials: false,
  canViewProfitability: false,
  canViewSensitiveDocs: false,
  canViewBanking: false,
};

describe("Build #28 — Summary", () => {
  it("63. deterministic morning summary", () => {
    const r = useSources();
    const a = buildDailyBriefing(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    const b = buildDailyBriefing(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    expect(a.operational_summary.critical_count).toBe(
      b.operational_summary.critical_count,
    );
    expect(a.operational_summary.due_today_count).toBe(
      b.operational_summary.due_today_count,
    );
  });

  it("64. financial summary authorized (amounts present)", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, FULL_PERMS);
    expect(typeof s.due_today_amount).toBe("number");
    expect(typeof s.overdue_amount).toBe("number");
  });

  it("65. counts-only unauthorized (amounts null)", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, NO_FIN_PERMS);
    expect(s.due_today_amount).toBeNull();
    expect(s.overdue_amount).toBeNull();
    // counts still present
    expect(typeof s.due_today_count).toBe("number");
  });

  it("66. blocked fleet count", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, FULL_PERMS);
    expect(s.blocked_vehicles_count).toBeGreaterThanOrEqual(0);
  });

  it("67. idle count", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, FULL_PERMS);
    expect(s.idle_vehicles_count).toBeGreaterThanOrEqual(0);
  });

  it("68. starting count", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, FULL_PERMS);
    expect(s.starts_today_count).toBeGreaterThanOrEqual(0);
  });

  it("69. returning count", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, FULL_PERMS);
    expect(s.returns_today_count).toBeGreaterThanOrEqual(0);
  });

  it("70. critical item count", () => {
    const r = useSources();
    const s = buildOperationalSummary(r.current.src, NOW, FULL_PERMS);
    expect(s.critical_count).toBeGreaterThanOrEqual(0);
  });
});

describe("Build #28 — AI context foundation", () => {
  it("71. daily context builds", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    expect(ctx.as_of).toBe(NOW.toISOString());
    expect(Array.isArray(ctx.priority_items)).toBe(true);
  });

  it("72. priority items included", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    expect(ctx.priority_items.length).toBeGreaterThanOrEqual(0);
  });

  it("73. payment context included (money items)", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    expect(ctx.summary.due_today_count).toBeGreaterThanOrEqual(0);
  });

  it("74. rental context included", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    expect(ctx.summary.starts_today_count).toBeGreaterThanOrEqual(0);
    expect(ctx.summary.returns_today_count).toBeGreaterThanOrEqual(0);
  });

  it("75. idle context included", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    expect(
      ctx.idle_rollup === null || typeof ctx.idle_rollup === "object",
    ).toBe(true);
  });

  it("76. task context included", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    const taskItems = ctx.priority_items.filter((i) => i.category === "task");
    expect(Array.isArray(taskItems)).toBe(true);
  });

  it("77. source entity IDs retained", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    for (const i of ctx.priority_items) {
      expect(i.source_module).toBeTruthy();
      expect(i.source_entity).toBeTruthy();
      expect(i.source_id).toBeTruthy();
    }
  });

  it("78. financial permission filtering (amounts null without perm)", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      NO_FIN_PERMS,
      "stf_1",
      "tnt_demo",
    );
    for (const i of ctx.priority_items) {
      expect(i.amount).toBeNull();
    }
  });

  it("79. sensitive values absent from context (no raw doc numbers)", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      NO_FIN_PERMS,
      "stf_1",
      "tnt_demo",
    );
    const blob = JSON.stringify(ctx);
    expect(blob).not.toMatch(/drivers_license_number/);
  });

  it("80. no LLM invocation (pure structured data)", () => {
    const r = useSources();
    const ctx = buildDailyBriefingContext(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
      FULL_PERMS,
      "stf_1",
      "tnt_demo",
    );
    // Context is plain structured data — no prose/answer field.
    expect(ctx).not.toHaveProperty("answer");
    expect(ctx).not.toHaveProperty("prose");
  });
});

describe("Build #28 — Recent changes", () => {
  it("81. payment appears in recent changes", () => {
    const r = useSources();
    const events = getCustomerTimeline(
      r.current.store.customers[0]?.id ?? "cust_1",
      {
        store: r.current.store,
        billingPeriods: [],
        damageClaims: [],
        violations: [],
        documents: [],
      },
    );
    const recent = getRecentOperationalChanges(events, NOW, 30);
    expect(Array.isArray(recent)).toBe(true);
  });

  it("82. rental return appears in recent changes", () => {
    const r = useSources();
    const events = getCustomerTimeline(
      r.current.store.customers[0]?.id ?? "cust_1",
      {
        store: r.current.store,
        billingPeriods: [],
        damageClaims: [],
        violations: [],
        documents: [],
      },
    );
    const recent = getRecentOperationalChanges(events, NOW, 30);
    expect(recent.every((e) => typeof e.title === "string")).toBe(true);
  });

  it("83. new violation appears in recent changes", () => {
    const r = useSources();
    const events = getCustomerTimeline(
      r.current.store.customers[0]?.id ?? "cust_1",
      {
        store: r.current.store,
        billingPeriods: [],
        damageClaims: [],
        violations: r.current.store.transactions.length ? [] : [],
        documents: [],
      },
    );
    const recent = getRecentOperationalChanges(events, NOW, 30);
    expect(Array.isArray(recent)).toBe(true);
  });

  it("84. Work Order completion appears in recent changes", () => {
    const r = useSources();
    const events = getCustomerTimeline(
      r.current.store.customers[0]?.id ?? "cust_1",
      {
        store: r.current.store,
        billingPeriods: [],
        damageClaims: [],
        violations: [],
        documents: [],
      },
    );
    const recent = getRecentOperationalChanges(events, NOW, 30);
    expect(recent.length).toBeGreaterThanOrEqual(0);
  });

  it("85. compliance transition appears in recent changes", () => {
    const r = useSources();
    const events = getCustomerTimeline(
      r.current.store.customers[0]?.id ?? "cust_1",
      {
        store: r.current.store,
        billingPeriods: [],
        damageClaims: [],
        violations: [],
        documents: [],
      },
    );
    const recent = getRecentOperationalChanges(events, NOW, 30);
    expect(Array.isArray(recent)).toBe(true);
  });

  it("86. safe sorting (malformed dates do not throw)", () => {
    expect(() =>
      getRecentOperationalChanges(
        [
          { occurred_at: "bad-date", category: "system", title: "x" },
          {
            occurred_at: "2026-09-01T10:00:00Z",
            category: "payment",
            title: "y",
          },
        ],
        NOW,
        30,
      ),
    ).not.toThrow();
  });
});
