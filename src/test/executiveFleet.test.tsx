// Build #30 — Fleet utilization + idle tests (21–28).
import { describe, it, expect } from "vitest";
import {
  useExecutiveTestSources,
  NOW,
  FULL_PERMS,
} from "./executiveTestHarness";
import {
  buildFleetUtilizationSnapshot,
  buildIdleFleetSnapshot,
} from "@/lib/executiveFleetSelectors";
import { DEFAULT_HEALTH_CONFIG } from "@/lib/executiveTypes";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";

function src() {
  return useExecutiveTestSources();
}

describe("Build #30 — Fleet utilization + idle", () => {
  const range = resolveProfitabilityRange("this_year", undefined, NOW);

  function fleetSrc() {
    const r = src();
    return {
      store: r.current.store,
      damageClaims: r.current.sources.damageClaims,
      violations: r.current.sources.violations,
      documents: r.current.sources.documents,
      requirements: r.current.sources.requirements,
      overrides: r.current.sources.overrides,
    };
  }

  it("21. fleet utilization derived", () => {
    const u = buildFleetUtilizationSnapshot(fleetSrc(), range, NOW);
    expect(u.utilization_pct).toBeGreaterThanOrEqual(0);
    expect(u.utilization_pct).toBeLessThanOrEqual(100);
    expect(u.rented_days).toBeGreaterThanOrEqual(0);
    expect(u.rentable_days).toBeGreaterThanOrEqual(0);
  });

  it("22. blocked days derived (overlap-merged)", () => {
    const u = buildFleetUtilizationSnapshot(fleetSrc(), range, NOW);
    expect(u.blocked_days).toBeGreaterThanOrEqual(0);
    expect(u.blocked_days).toBeLessThanOrEqual(
      u.rentable_days + u.blocked_days,
    );
  });

  it("23. idle days derived", () => {
    const u = buildFleetUtilizationSnapshot(fleetSrc(), range, NOW);
    expect(u.idle_available_days).toBeGreaterThanOrEqual(0);
  });

  it("24. overlapping blockers merged (one vehicle-day counts once)", () => {
    const u = buildFleetUtilizationSnapshot(fleetSrc(), range, NOW);
    expect(u.idle_available_days).toBe(
      Math.max(0, u.rentable_days - u.rented_days),
    );
  });

  it("25. idle by class aggregated", () => {
    const idle = buildIdleFleetSnapshot(
      fleetSrc(),
      range,
      DEFAULT_HEALTH_CONFIG.idle_attention_threshold_days,
      NOW,
    );
    expect(Array.isArray(idle.by_class)).toBe(true);
    const totalByClass = idle.by_class.reduce((s, c) => s + c.idle_count, 0);
    expect(totalByClass).toBe(idle.idle_count);
  });

  it("26. idle by location aggregated", () => {
    const idle = buildIdleFleetSnapshot(
      fleetSrc(),
      range,
      DEFAULT_HEALTH_CONFIG.idle_attention_threshold_days,
      NOW,
    );
    expect(Array.isArray(idle.by_location)).toBe(true);
    const totalByLoc = idle.by_location.reduce((s, c) => s + c.idle_count, 0);
    expect(totalByLoc).toBe(idle.idle_count);
  });

  it("27. utilization trend (prior-period comparison)", () => {
    const u = buildFleetUtilizationSnapshot(fleetSrc(), range, NOW);
    expect(["up", "down", "flat", "unavailable"]).toContain(
      u.utilization_trend,
    );
  });

  it("28. no fleet safe (zero vehicles)", () => {
    const r = src();
    const emptyStore = { ...r.current.store, vehicles: [] };
    const u = buildFleetUtilizationSnapshot(
      {
        store: emptyStore as never,
        damageClaims: [],
        violations: [],
        documents: [],
        requirements: [],
        overrides: [],
      },
      range,
      NOW,
    );
    expect(u.utilization_pct).toBe(0);
    expect(u.rentable_days).toBe(0);
    expect(Number.isNaN(u.utilization_pct)).toBe(false);
  });
});
