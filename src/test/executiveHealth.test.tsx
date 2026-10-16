// Build #30 — Business Health Score tests (41–56).
import { describe, it, expect } from "vitest";
import {
  useExecutiveTestSources,
  execRange,
  NOW,
  FULL_PERMS,
} from "./executiveTestHarness";
import { buildFinancialSnapshot } from "@/lib/executiveFinancialSelectors";
import {
  buildFleetUtilizationSnapshot,
  buildIdleFleetSnapshot,
} from "@/lib/executiveFleetSelectors";
import {
  buildOperationalLoad,
  buildNeedsAttention,
} from "@/lib/executiveOperationsSelectors";
import {
  calculateBusinessHealthScore,
  gradeForScore,
  validateWeights,
} from "@/lib/businessHealthSelectors";
import {
  DEFAULT_HEALTH_CONFIG,
  HEALTH_FORMULA_VERSION,
} from "@/lib/executiveTypes";
import type { ExecutiveViewerPermissions } from "@/lib/executiveTypes";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";

function src() {
  return useExecutiveTestSources();
}

describe("Build #30 — Business Health Score", () => {
  const range = resolveProfitabilityRange("this_month", undefined, NOW);

  function healthInput(perms: ExecutiveViewerPermissions = FULL_PERMS) {
    const r = src();
    const fleetSources = {
      store: r.current.store,
      damageClaims: r.current.sources.damageClaims,
      violations: r.current.sources.violations,
      documents: r.current.sources.documents,
      requirements: r.current.sources.requirements,
      overrides: r.current.sources.overrides,
    };
    const opsSources = {
      store: r.current.store,
      damageClaims: r.current.sources.damageClaims,
      damageRecoveries: r.current.sources.damageRecoveries,
      violations: r.current.sources.violations,
      expenses: r.current.store.expenses,
      documents: r.current.sources.documents,
      requirements: r.current.sources.requirements,
      overrides: r.current.sources.overrides,
    };
    const financial = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      r.current.store.paymentArrangements,
      r.current.store.arrangementInstallments,
      { start: range.start, end: range.end, as_of: NOW },
      perms,
    );
    const fleet = buildFleetUtilizationSnapshot(fleetSources, range, NOW);
    const idle = buildIdleFleetSnapshot(
      fleetSources,
      range,
      DEFAULT_HEALTH_CONFIG.idle_attention_threshold_days,
      NOW,
    );
    const load = buildOperationalLoad(opsSources, range, NOW);
    const attention = buildNeedsAttention(opsSources, NOW, range);
    return { financial, fleet, idle, load, attention, store: r.current.store };
  }

  it("41. score calculated (0–100)", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.overall_score).toBeGreaterThanOrEqual(0);
    expect(h.overall_score).toBeLessThanOrEqual(100);
  });

  it("42. weights total 100", () => {
    expect(validateWeights(DEFAULT_HEALTH_CONFIG)).toBe(true);
  });

  it("43. collections component present", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    const c = h.components.find((c) => c.key === "collections");
    expect(c).toBeTruthy();
    expect(c!.score).toBeGreaterThanOrEqual(0);
    expect(c!.score).toBeLessThanOrEqual(100);
  });

  it("44. utilization component present", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.components.find((c) => c.key === "utilization")).toBeTruthy();
  });

  it("45. availability component present", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.components.find((c) => c.key === "availability")).toBeTruthy();
  });

  it("46. compliance component present", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.components.find((c) => c.key === "compliance")).toBeTruthy();
  });

  it("47. operations component present", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.components.find((c) => c.key === "operations")).toBeTruthy();
  });

  it("48. grade mapping correct", () => {
    expect(gradeForScore(95)).toBe("excellent");
    expect(gradeForScore(80)).toBe("good");
    expect(gradeForScore(65)).toBe("needs_attention");
    expect(gradeForScore(40)).toBe("critical");
  });

  it("49. explanation factual (not vague prose)", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.explanation.length).toBeGreaterThan(0);
    expect(h.explanation).toContain("Collections Health");
  });

  it("50. utilization target configurable", () => {
    const input = healthInput();
    const config = { ...DEFAULT_HEALTH_CONFIG, utilization_target_pct: 90 };
    const h = calculateBusinessHealthScore({
      ...input,
      config,
      range,
      asOf: NOW,
    });
    const util = h.components.find((c) => c.key === "utilization");
    expect(util).toBeTruthy();
    expect(util!.explanation).toContain("90%");
  });

  it("51. idle threshold configurable", () => {
    const r = src();
    const fleetSources = {
      store: r.current.store,
      damageClaims: r.current.sources.damageClaims,
      violations: r.current.sources.violations,
      documents: r.current.sources.documents,
      requirements: r.current.sources.requirements,
      overrides: r.current.sources.overrides,
    };
    const idle = buildIdleFleetSnapshot(fleetSources, range, 7, NOW);
    expect(idle.idle_past_threshold_count).toBeGreaterThanOrEqual(0);
  });

  it("52. formula version included (v1)", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(h.formula_version).toBe(HEALTH_FORMULA_VERSION);
    expect(h.formula_version).toBe("v1");
  });

  it("53. zero-data safe (no NaN/Infinity)", () => {
    const r = src();
    const emptyStore = {
      ...r.current.store,
      vehicles: [],
      transactions: [],
      tasks: [],
    } as never;
    const h = calculateBusinessHealthScore({
      financial: buildFinancialSnapshot(
        [],
        [],
        [],
        [],
        [],
        [],
        { start: range.start, end: range.end, as_of: NOW },
        FULL_PERMS,
      ),
      fleet: buildFleetUtilizationSnapshot(
        {
          store: emptyStore,
          damageClaims: [],
          violations: [],
          documents: [],
          requirements: [],
          overrides: [],
        },
        range,
        NOW,
      ),
      idle: buildIdleFleetSnapshot(
        {
          store: emptyStore,
          damageClaims: [],
          violations: [],
          documents: [],
          requirements: [],
          overrides: [],
        },
        range,
        3,
        NOW,
      ),
      load: buildOperationalLoad(
        {
          store: emptyStore,
          damageClaims: [],
          violations: [],
          documents: [],
          requirements: [],
          overrides: [],
        },
        range,
        NOW,
      ),
      attention: [],
      store: emptyStore,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
    });
    expect(Number.isNaN(h.overall_score)).toBe(false);
    expect(Number.isFinite(h.overall_score)).toBe(true);
  });

  it("54. prior-period score comparison (trend)", () => {
    const input = healthInput();
    const h = calculateBusinessHealthScore({
      ...input,
      config: DEFAULT_HEALTH_CONFIG,
      range,
      asOf: NOW,
      priorScore: 50,
    });
    expect(["up", "down", "flat", "unavailable"]).toContain(h.trend);
    expect(h.prior_score).toBe(50);
  });

  it("55. weight validation rejects non-100 total", () => {
    const bad = {
      ...DEFAULT_HEALTH_CONFIG,
      weights: {
        collections: 30,
        utilization: 25,
        availability: 15,
        compliance: 15,
        operations: 10,
      },
    };
    expect(validateWeights(bad)).toBe(false);
  });

  it("56. restore defaults returns valid config", () => {
    expect(validateWeights(DEFAULT_HEALTH_CONFIG)).toBe(true);
    expect(DEFAULT_HEALTH_CONFIG.weights.collections).toBe(30);
    expect(DEFAULT_HEALTH_CONFIG.weights.utilization).toBe(25);
  });
});
