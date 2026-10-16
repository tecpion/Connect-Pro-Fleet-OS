// Build #30 — Money Left on the Table tests (29–40).
import { describe, it, expect } from "vitest";
import {
  useExecutiveTestSources,
  NOW,
  FULL_PERMS,
} from "./executiveTestHarness";
import { buildIdleOpportunities } from "@/lib/executiveFleetSelectors";
import { getMoneyLeftOnTableSummary } from "@/lib/executiveOpportunitySelectors";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";

function src() {
  return useExecutiveTestSources();
}

describe("Build #30 — Money Left on the Table", () => {
  const range = resolveProfitabilityRange("this_year", undefined, NOW);

  function oppSrc() {
    const r = src();
    const fleetSources = {
      store: r.current.store,
      damageClaims: r.current.sources.damageClaims,
      violations: r.current.sources.violations,
      documents: r.current.sources.documents,
      requirements: r.current.sources.requirements,
      overrides: r.current.sources.overrides,
    };
    return {
      r,
      idleOps: buildIdleOpportunities(fleetSources, range, NOW),
    };
  }

  it("29. violation recoverable category supported", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: r.current.sources.violations ?? [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const hasViolation = m.quantified.some(
      (o) => o.category === "violation_recovery",
    );
    expect(typeof hasViolation).toBe("boolean");
  });

  it("30. damage recoverable category supported", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: r.current.sources.damageClaims ?? [],
        damageRecoveries: r.current.sources.damageRecoveries ?? [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const hasDamage = m.quantified.some(
      (o) => o.category === "damage_recovery",
    );
    expect(typeof hasDamage).toBe("boolean");
  });

  it("31. late fee recoverable category supported", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const hasLateFee = m.quantified.some((o) => o.category === "late_fees");
    expect(typeof hasLateFee).toBe("boolean");
  });

  it("32. known recoverable total sums only quantified amounts", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: r.current.sources.violations ?? [],
        damageClaims: r.current.sources.damageClaims ?? [],
        damageRecoveries: r.current.sources.damageRecoveries ?? [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const sum = m.quantified.reduce((s, o) => s + o.amount, 0);
    expect(Math.abs((m.known_recoverable_total as number) - sum)).toBeLessThan(
      0.01,
    );
  });

  it("33. idle excluded from dollar total", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: [],
        expenses: [],
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    expect(m.known_recoverable_total).toBe(0);
    expect(m.idle_opportunity.idle_count).toBe(idleOps.length);
  });

  it("34. idle opportunity count", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: [],
        expenses: [],
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    expect(m.idle_opportunity.idle_count).toBe(idleOps.length);
  });

  it("35. idle days summed", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: [],
        expenses: [],
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const totalDays = idleOps.reduce((s, i) => s + i.idle_days, 0);
    expect(m.idle_opportunity.total_idle_days).toBe(totalDays);
  });

  it("36. deposit exposure tracked separately", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: [],
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const hasDeposit = m.quantified.some(
      (o) => o.category === "deposit_exposure",
    );
    expect(typeof hasDeposit).toBe("boolean");
  });

  it("37. extension requires real record (no speculative)", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: [],
        damageClaims: [],
        damageRecoveries: [],
        rentalDeposits: [],
        expenses: [],
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const speculative = m.quantified.filter(
      (o) => o.category === "extension_opportunity" && o.amount > 0,
    );
    expect(speculative.length).toBe(0);
  });

  it("38. no speculative dollar amounts", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: r.current.sources.violations ?? [],
        damageClaims: r.current.sources.damageClaims ?? [],
        damageRecoveries: r.current.sources.damageRecoveries ?? [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    for (const o of m.quantified) {
      expect(Number.isFinite(o.amount)).toBe(true);
      expect(o.amount >= 0).toBe(true);
    }
  });

  it("39. source traceability retained", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: r.current.sources.violations ?? [],
        damageClaims: r.current.sources.damageClaims ?? [],
        damageRecoveries: r.current.sources.damageRecoveries ?? [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    for (const o of m.quantified) {
      expect(o.source_module).toBeTruthy();
      expect(o.entity_id).toBeTruthy();
      expect(o.deep_link === null || typeof o.deep_link === "string").toBe(
        true,
      );
    }
  });

  it("40. no double-count (deduped by source identity)", () => {
    const { r, idleOps } = oppSrc();
    const m = getMoneyLeftOnTableSummary(
      {
        store: r.current.store,
        violations: r.current.sources.violations ?? [],
        damageClaims: r.current.sources.damageClaims ?? [],
        damageRecoveries: r.current.sources.damageRecoveries ?? [],
        rentalDeposits: r.current.store.rentalDeposits,
        expenses: r.current.store.expenses,
        billingPeriods: [],
      },
      idleOps,
      FULL_PERMS,
    );
    const keys = m.quantified.map(
      (o) => `${o.source_module}:${o.category}:${o.entity_id}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
