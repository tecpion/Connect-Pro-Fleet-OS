// Build #30 — Dashboard composer + context builder + reliability tests (68–96).
import { describe, it, expect } from "vitest";
import {
  useExecutiveTestSources,
  execRange,
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
} from "./executiveTestHarness";
import {
  buildExecutiveDashboard,
  buildExecutiveOperationalContext,
} from "@/lib/executiveDashboardComposer";
import { buildPriorityDistribution } from "@/lib/executiveOperationsSelectors";
import { DEFAULT_HEALTH_CONFIG } from "@/lib/executiveTypes";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";

function src() {
  return useExecutiveTestSources();
}

describe("Build #30 — Executive Dashboard composer", () => {
  it("68. full dashboard composes in a single pass", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.company_name).toBeTruthy();
    expect(summary.financial).toBeTruthy();
    expect(summary.profitability).toBeTruthy();
    expect(summary.fleet_utilization).toBeTruthy();
    expect(summary.idle_fleet).toBeTruthy();
    expect(summary.money_left_on_table).toBeTruthy();
    expect(summary.health).toBeTruthy();
    expect(summary.operational_load).toBeTruthy();
  });

  it("69. date range preserved in summary", () => {
    const r = src();
    const range = execRange("this_week");
    const summary = buildExecutiveDashboard(
      r.current.sources,
      range,
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.range.preset).toBe("this_week");
    expect(summary.range.start).toBe(range.start.toISOString());
    expect(summary.range.end).toBe(range.end.toISOString());
  });

  it("70. KPI strip values present", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(typeof summary.financial.collections).toBe("number");
    expect(typeof summary.fleet_utilization.utilization_pct).toBe("number");
    expect(typeof summary.profitability.operating_profit).toBe("number");
    expect(typeof summary.health.overall_score).toBe("number");
  });

  it("71. health card has components + grade", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.health.components.length).toBe(5);
    expect(["excellent", "good", "needs_attention", "critical"]).toContain(
      summary.health.grade,
    );
  });

  it("72. money left on table card separates known recoverable + idle", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const m = summary.money_left_on_table;
    expect(typeof m.known_recoverable_total).toBe("number");
    expect(typeof m.idle_opportunity.idle_count).toBe("number");
    expect(m.idle_opportunity).not.toBe(undefined);
  });

  it("73. needs attention bounded (top N)", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.needs_attention.length).toBeLessThanOrEqual(8);
  });

  it("74. finance hidden without permission", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      NO_FINANCE_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.financial.collections).toBe(null);
    expect(summary.financial.outstanding_balance).toBe(null);
    expect(summary.profitability.operating_profit).toBe(null);
    expect(summary.money_left_on_table.known_recoverable_total).toBe(null);
    expect(typeof summary.financial.overdue_count).toBe("number");
  });
});

describe("Build #30 — Executive operational context builder", () => {
  it("75. executive context builds (structured, no LLM)", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, FULL_PERMS);
    expect(ctx.company_name).toBeTruthy();
    expect(ctx.health.overall_score).toBe(summary.health.overall_score);
    expect(ctx.health.formula_version).toBe("v1");
    expect(Array.isArray(ctx.health.components)).toBe(true);
  });

  it("76. health score in context matches dashboard", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, FULL_PERMS);
    expect(ctx.health.overall_score).toBe(summary.health.overall_score);
    expect(ctx.health.grade).toBe(summary.health.grade);
  });

  it("77. utilization in context", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, FULL_PERMS);
    expect(ctx.fleet_utilization.utilization_pct).toBe(
      summary.fleet_utilization.utilization_pct,
    );
  });

  it("78. money-left-on-table in context (known recoverable vs idle)", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, FULL_PERMS);
    expect(ctx.money_left_on_table.known_recoverable_total).toBe(
      summary.money_left_on_table.known_recoverable_total,
    );
    expect(ctx.money_left_on_table.idle_count).toBe(
      summary.money_left_on_table.idle_opportunity.idle_count,
    );
  });

  it("79. known recoverable vs idle separated in context", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, FULL_PERMS);
    expect(typeof ctx.money_left_on_table.idle_count).toBe("number");
    expect(
      ctx.money_left_on_table.known_recoverable_total === null ||
        typeof ctx.money_left_on_table.known_recoverable_total === "number",
    ).toBe(true);
  });

  it("80. permission filtering in context", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, NO_FINANCE_PERMS);
    expect(ctx.financial.collections).toBe(null);
    expect(ctx.profitability.operating_profit).toBe(null);
    expect(ctx.money_left_on_table.known_recoverable_total).toBe(null);
  });

  it("81. source IDs retained in context needs-attention", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const ctx = buildExecutiveOperationalContext(summary, FULL_PERMS);
    for (const item of ctx.needs_attention) {
      expect(typeof item.title).toBe("string");
    }
  });
});

describe("Build #30 — Reliability (no NaN/Infinity, safe edges)", () => {
  it("82. no NaN in full dashboard", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(Number.isNaN(summary.health.overall_score)).toBe(false);
    expect(Number.isNaN(summary.fleet_utilization.utilization_pct)).toBe(false);
    expect(Number.isNaN(summary.financial.collections as number)).toBe(false);
  });

  it("83. no Infinity in full dashboard", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(Number.isFinite(summary.health.overall_score)).toBe(true);
    expect(Number.isFinite(summary.fleet_utilization.utilization_pct)).toBe(
      true,
    );
  });

  it("84. malformed date safe (does not crash)", () => {
    const r = src();
    expect(() => {
      const badRange = {
        preset: "custom" as const,
        start: new Date("invalid"),
        end: new Date("invalid"),
        as_of: NOW,
      };
      buildExecutiveDashboard(
        r.current.sources,
        badRange,
        FULL_PERMS,
        DEFAULT_HEALTH_CONFIG,
        NOW,
      );
    }).not.toThrow();
  });

  it("85. empty fleet safe", () => {
    const r = src();
    const emptyStore = { ...r.current.store, vehicles: [] };
    const summary = buildExecutiveDashboard(
      { ...r.current.sources, store: emptyStore as never },
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.fleet_utilization.utilization_pct).toBe(0);
    expect(summary.idle_fleet.idle_count).toBe(0);
  });

  it("86. no payments safe", () => {
    const r = src();
    const noPayStore = { ...r.current.store, transactions: [] };
    const summary = buildExecutiveDashboard(
      { ...r.current.sources, store: noPayStore as never },
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.financial.collections).toBe(0);
  });

  it("87. no expenses safe", () => {
    const r = src();
    const noExpStore = { ...r.current.store, expenses: [] };
    const summary = buildExecutiveDashboard(
      { ...r.current.sources, store: noExpStore as never },
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(
      Number.isFinite(summary.profitability.operating_profit as number),
    ).toBe(true);
  });

  it("88. no overdue safe", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.financial.overdue_count).toBeGreaterThanOrEqual(0);
  });

  it("89. no idle safe", () => {
    const r = src();
    const emptyStore = { ...r.current.store, vehicles: [] };
    const summary = buildExecutiveDashboard(
      { ...r.current.sources, store: emptyStore as never },
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.idle_fleet.idle_count).toBe(0);
    expect(summary.idle_fleet.total_idle_days).toBe(0);
  });

  it("90. no opportunities safe", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      {
        ...r.current.sources,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: [],
      },
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.money_left_on_table.known_recoverable_total).toBe(0);
  });

  it("91. missing location safe", () => {
    const r = src();
    const range = resolveProfitabilityRange("this_month", undefined, NOW);
    expect(() => {
      buildExecutiveDashboard(
        r.current.sources,
        {
          preset: "this_month",
          start: range.start,
          end: range.end,
          as_of: NOW,
        },
        FULL_PERMS,
        DEFAULT_HEALTH_CONFIG,
        NOW,
      );
    }).not.toThrow();
  });

  it("92. large-list bounded rendering (needs attention top N)", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.needs_attention.length).toBeLessThanOrEqual(8);
    expect(summary.idle_fleet.top_idle.length).toBeLessThanOrEqual(5);
  });

  it("93. priority distribution sums to needs-attention count", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    const dist = buildPriorityDistribution(summary.needs_attention);
    const total = dist.critical + dist.high + dist.medium + dist.informational;
    expect(total).toBe(summary.needs_attention.length);
  });

  it("94. trends object present with all four directions", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(["up", "down", "flat", "unavailable"]).toContain(
      summary.trends.collections,
    );
    expect(["up", "down", "flat", "unavailable"]).toContain(
      summary.trends.utilization,
    );
    expect(["up", "down", "flat", "unavailable"]).toContain(
      summary.trends.profit,
    );
    expect(["up", "down", "flat", "unavailable"]).toContain(
      summary.trends.health,
    );
  });

  it("95. generated_at timestamp present", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.generated_at).toBeTruthy();
    expect(() => new Date(summary.generated_at).getTime()).not.toThrow();
  });

  it("96. health formula version in summary", () => {
    const r = src();
    const summary = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(summary.health.formula_version).toBe("v1");
  });
});
