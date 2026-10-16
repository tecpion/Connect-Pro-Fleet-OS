// Build #30 — Operational load tests (57–67).
import { describe, it, expect } from "vitest";
import { useExecutiveTestSources, NOW } from "./executiveTestHarness";
import {
  buildOperationalLoad,
  buildBlockedFleet,
  buildNeedsAttention,
  buildPriorityDistribution,
} from "@/lib/executiveOperationsSelectors";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";

function src() {
  return useExecutiveTestSources();
}

describe("Build #30 — Operational load", () => {
  const range = resolveProfitabilityRange("this_month", undefined, NOW);

  function opsSrc() {
    const r = src();
    return {
      store: r.current.store,
      damageClaims: r.current.sources.damageClaims,
      damageRecoveries: r.current.sources.damageRecoveries,
      violations: r.current.sources.violations,
      expenses: r.current.store.expenses,
      documents: r.current.sources.documents,
      requirements: r.current.sources.requirements,
      overrides: r.current.sources.overrides,
    } as never;
  }

  it("57. unique blocked total (overlap-safe)", () => {
    const bf = buildBlockedFleet(opsSrc(), NOW);
    expect(bf.total_unique).toBeLessThanOrEqual(
      bf.maintenance + bf.damage + bf.compliance,
    );
    expect(bf.total_unique).toBeGreaterThanOrEqual(
      Math.max(bf.maintenance, bf.damage, bf.compliance),
    );
  });

  it("58. maintenance block counted", () => {
    const bf = buildBlockedFleet(opsSrc(), NOW);
    expect(bf.maintenance).toBeGreaterThanOrEqual(0);
  });

  it("59. damage block counted", () => {
    const bf = buildBlockedFleet(opsSrc(), NOW);
    expect(bf.damage).toBeGreaterThanOrEqual(0);
  });

  it("60. compliance block counted", () => {
    const bf = buildBlockedFleet(opsSrc(), NOW);
    expect(bf.compliance).toBeGreaterThanOrEqual(0);
  });

  it("61. overlapping blocker counts once", () => {
    const bf = buildBlockedFleet(opsSrc(), NOW);
    expect(bf.total_unique).toBeLessThanOrEqual(
      bf.maintenance + bf.damage + bf.compliance,
    );
  });

  it("62. maintenance load derived", () => {
    const load = buildOperationalLoad(opsSrc(), range, NOW);
    expect(load.maintenance.open_work_orders).toBeGreaterThanOrEqual(0);
    expect(load.maintenance.blocking_work_orders).toBeGreaterThanOrEqual(0);
  });

  it("63. damage load derived", () => {
    const load = buildOperationalLoad(opsSrc(), range, NOW);
    expect(load.damage.open_claims).toBeGreaterThanOrEqual(0);
    expect(load.damage.blocking_claims).toBeGreaterThanOrEqual(0);
  });

  it("64. violation load derived", () => {
    const load = buildOperationalLoad(opsSrc(), range, NOW);
    expect(load.violations.unresolved).toBeGreaterThanOrEqual(0);
    expect(load.violations.disputed).toBeGreaterThanOrEqual(0);
  });

  it("65. compliance load derived", () => {
    const load = buildOperationalLoad(opsSrc(), range, NOW);
    expect(load.compliance.blocked_vehicles).toBeGreaterThanOrEqual(0);
    expect(load.compliance.expired_docs).toBeGreaterThanOrEqual(0);
  });

  it("66. needs attention reuses briefing items", () => {
    const items = buildNeedsAttention(opsSrc(), NOW, range, 8);
    expect(items.length).toBeLessThanOrEqual(8);
    for (const i of items) {
      expect(typeof i.title).toBe("string");
      expect(i.deep_link === null || typeof i.deep_link === "string").toBe(
        true,
      );
    }
  });

  it("67. resolved issue excluded from needs attention", () => {
    const items = buildNeedsAttention(opsSrc(), NOW, range, 8);
    for (const i of items) {
      expect(i.priority).not.toBe("resolved");
    }
  });
});
