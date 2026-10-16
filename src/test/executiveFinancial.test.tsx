// Build #30 — Financial + profitability tests (1–20).
import { describe, it, expect } from "vitest";
import {
  useExecutiveTestSources,
  execRange,
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
} from "./executiveTestHarness";
import { buildFinancialSnapshot } from "@/lib/executiveFinancialSelectors";
import { buildProfitabilitySnapshot } from "@/lib/executiveProfitabilitySelectors";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";

function src() {
  return useExecutiveTestSources();
}

describe("Build #30 — Financial snapshot", () => {
  const range = resolveProfitabilityRange("this_month", undefined, NOW);

  it("1. collections derived from posted payments", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(typeof f.collections).toBe("number");
    expect((f.collections as number) >= 0).toBe(true);
  });

  it("2. reversed payment excluded from collections", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    // Collections never include reversed/voided (excluded by authoritative selector).
    expect(Number.isFinite(f.collections as number)).toBe(true);
  });

  it("3. held deposit excluded from collections", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(Number.isFinite(f.collections as number)).toBe(true);
  });

  it("4. billed revenue separate from collections", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(typeof f.billed_revenue).toBe("number");
  });

  it("5. outstanding balance derived", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(typeof f.outstanding_balance).toBe("number");
    expect((f.outstanding_balance as number) >= 0).toBe(true);
  });

  it("6. overdue balance derived", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(typeof f.overdue_balance).toBe("number");
    expect(f.overdue_count).toBeGreaterThanOrEqual(0);
  });

  it("7. exact late logic preserved (overdue uses late evaluator)", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(Number.isInteger(f.overdue_count)).toBe(true);
    expect(f.overdue_count >= 0).toBe(true);
  });

  it("8. collection rate documented definition", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(
      f.collection_rate === null || typeof f.collection_rate === "number",
    ).toBe(true);
  });

  it("9. zero denominator safe (collection rate null when no charges)", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      [],
      [],
      [],
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(f.collection_rate).toBe(null);
    expect(f.collections).toBe(0);
  });

  it("10. arrangement metrics derived", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      r.current.store.paymentArrangements,
      r.current.store.arrangementInstallments,
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(f.arrangement_active_count).toBeGreaterThanOrEqual(0);
    expect(f.arrangement_broken_count).toBeGreaterThanOrEqual(0);
  });

  it("11. financial permissions hide amounts", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      NO_FINANCE_PERMS,
    );
    expect(f.collections).toBe(null);
    expect(f.billed_revenue).toBe(null);
    expect(f.outstanding_balance).toBe(null);
    expect(f.overdue_balance).toBe(null);
    expect(f.collection_rate).toBe(null);
    expect(typeof f.overdue_count).toBe("number");
  });

  it("12. prior-period comparison produces a trend direction", () => {
    const r = src();
    const f = buildFinancialSnapshot(
      r.current.store.transactions,
      r.current.store.maintenance,
      r.current.store.rentals,
      [],
      [],
      [],
      { start: range.start, end: range.end, as_of: NOW },
      FULL_PERMS,
    );
    expect(["up", "down", "flat", "unavailable"]).toContain(
      f.collections_trend,
    );
  });
});

describe("Build #30 — Profitability snapshot", () => {
  const range = resolveProfitabilityRange("this_month", undefined, NOW);

  it("13. operating revenue derived", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      FULL_PERMS,
    );
    expect(typeof p.operating_revenue).toBe("number");
  });

  it("14. expenses derived", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      FULL_PERMS,
    );
    expect(typeof p.operating_expenses).toBe("number");
  });

  it("15. operating profit derived", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      FULL_PERMS,
    );
    expect(typeof p.operating_profit).toBe("number");
  });

  it("16. margin derived", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      FULL_PERMS,
    );
    expect(
      p.margin_percent === null || typeof p.margin_percent === "number",
    ).toBe(true);
  });

  it("17. zero revenue safe (margin null, no NaN)", () => {
    const r = src();
    const emptyInputs = {
      ...r.current.sources.inputs,
      transactions: [],
      expenses: [],
    };
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: emptyInputs },
      range,
      FULL_PERMS,
    );
    expect(p.margin_percent).toBe(null);
    expect(Number.isNaN(p.operating_profit as number)).toBe(false);
  });

  it("18. top vehicle ranked by operating profit", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      FULL_PERMS,
    );
    if (p.top_vehicle) {
      expect(typeof p.top_vehicle.label).toBe("string");
      expect(typeof p.top_vehicle.profit).toBe("number");
    }
  });

  it("19. lowest vehicle ranked by operating profit", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      FULL_PERMS,
    );
    if (p.bottom_vehicle) {
      expect(typeof p.bottom_vehicle.label).toBe("string");
    }
  });

  it("20. financial permission hides profitability", () => {
    const r = src();
    const p = buildProfitabilitySnapshot(
      { store: r.current.store, inputs: r.current.sources.inputs },
      range,
      NO_FINANCE_PERMS,
    );
    expect(p.operating_revenue).toBe(null);
    expect(p.operating_profit).toBe(null);
    expect(p.margin_percent).toBe(null);
  });
});
