// Connect Pro Fleet — Build #19 migration domain tests.
//
// Tests the pure selectors (historical totals, combined lifetime, overlap
// detection, cutover date) and the CSV dry-run validators. Store integration
// tests live in migrationStore.test.tsx.

import { describe, it, expect } from "vitest";
import {
  getHistoricalTotals,
  getCombinedLifetimeTotals,
  findOverlappingPeriods,
  getMonthlyHistorical,
  getMigrationCutoverDate,
} from "@/lib/migrationSelectors";
import type { HistoricalFinancialPeriod } from "@/lib/migrationTypes";
import type { FleetStore } from "@/lib/store";
import {
  parseVehicleCsv,
  parseCustomerCsv,
  parseHistoricalCsv,
  dryRunVehicles,
  dryRunCustomers,
  dryRunHistorical,
} from "@/lib/migrationCsv";

function period(
  over: Partial<HistoricalFinancialPeriod>,
): HistoricalFinancialPeriod {
  return {
    id: "hfp_" + Math.random().toString(36).slice(2, 6),
    tenant_id: "tnt_connectpro",
    period_start: "2026-01-01",
    period_end: "2026-01-31",
    granularity: "month",
    source_system: "spreadsheet",
    revenue: 0,
    collections: null,
    expenses: null,
    net_profit: null,
    rental_count: null,
    vehicle_count: null,
    notes: null,
    import_batch_id: null,
    created_at: "2026-08-20T10:00:00Z",
    ...over,
  };
}

describe("migration historical selectors", () => {
  it("sums historical totals, preserving nulls for unknown values", () => {
    const periods = [
      period({
        revenue: 82000,
        collections: 79500,
        expenses: 34000,
        net_profit: 48000,
        rental_count: 142,
      }),
      period({
        revenue: 88500,
        collections: 86200,
        expenses: 36500,
        net_profit: 52000,
        rental_count: 158,
      }),
    ];
    const totals = getHistoricalTotals(periods);
    expect(totals.revenue).toBe(170500);
    expect(totals.collections).toBe(165700);
    expect(totals.expenses).toBe(70500);
    expect(totals.net_profit).toBe(100000);
    expect(totals.rental_count).toBe(300);
    expect(totals.period_count).toBe(2);
  });

  it("returns null for collections/expenses when no period supplies them", () => {
    const totals = getHistoricalTotals([period({ revenue: 1000 })]);
    expect(totals.collections).toBeNull();
    expect(totals.expenses).toBeNull();
    expect(totals.revenue).toBe(1000);
  });

  it("detects overlapping periods of the same granularity", () => {
    const periods = [
      period({
        id: "a",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        granularity: "month",
      }),
      period({
        id: "b",
        period_start: "2026-01-15",
        period_end: "2026-02-15",
        granularity: "month",
      }),
      period({
        id: "c",
        period_start: "2026-03-01",
        period_end: "2026-03-31",
        granularity: "month",
      }),
    ];
    const overlaps = findOverlappingPeriods(periods);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].a.id).toBe("a");
    expect(overlaps[0].b.id).toBe("b");
  });

  it("does not flag overlap across different granularities", () => {
    const periods = [
      period({
        id: "a",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        granularity: "year",
      }),
      period({
        id: "b",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        granularity: "month",
      }),
    ];
    expect(findOverlappingPeriods(periods)).toHaveLength(0);
  });

  it("sorts monthly historical periods chronologically", () => {
    const periods = [
      period({ period_start: "2026-07-01", period_end: "2026-07-31" }),
      period({ period_start: "2026-06-01", period_end: "2026-06-30" }),
      period({ period_start: "2026-05-01", period_end: "2026-05-31" }),
    ];
    const monthly = getMonthlyHistorical(periods);
    expect(monthly[0].period_start).toBe("2026-05-01");
    expect(monthly[2].period_start).toBe("2026-07-01");
  });
});

describe("migration combined lifetime totals", () => {
  it("combines historical + fleet-native revenue, preserving source distinction", () => {
    const store = {
      transactions: [
        {
          transaction_type: "rental_charge",
          category: "charge",
          status: "posted",
          amount: 500,
          deposit_id: null,
          metadata: null,
        },
        {
          transaction_type: "tax_charge",
          category: "charge",
          status: "posted",
          amount: 30,
          deposit_id: null,
          metadata: null,
        },
        {
          transaction_type: "card_payment",
          category: "payment",
          status: "posted",
          amount: 400,
          deposit_id: null,
          metadata: null,
        },
      ],
      rentals: [],
    } as unknown as FleetStore;
    const periods = [period({ revenue: 800000 })];
    const combined = getCombinedLifetimeTotals(store, periods);
    // Fleet-native revenue excludes tax + held deposits; only the rental_charge counts.
    expect(combined.fleet_revenue).toBe(500);
    expect(combined.historical_revenue).toBe(800000);
    expect(combined.combined_revenue).toBe(800500);
    expect(combined.fleet_collections).toBe(400);
  });

  it("excludes migration opening balance from fleet-native revenue", () => {
    const store = {
      transactions: [
        {
          transaction_type: "rental_charge",
          category: "charge",
          status: "posted",
          amount: 500,
          deposit_id: null,
          metadata: null,
        },
        {
          transaction_type: "migration_opening_balance",
          category: "charge",
          status: "posted",
          amount: 650,
          deposit_id: null,
          metadata: { migration: true },
        },
      ],
      rentals: [],
    } as unknown as FleetStore;
    const combined = getCombinedLifetimeTotals(store, []);
    expect(combined.fleet_revenue).toBe(500);
  });

  it("excludes migrated held-deposit collection from fleet-native collections", () => {
    const store = {
      transactions: [
        {
          transaction_type: "card_payment",
          category: "payment",
          status: "posted",
          amount: 400,
          deposit_id: null,
          metadata: null,
        },
        {
          transaction_type: "other_payment",
          category: "payment",
          status: "posted",
          amount: 300,
          deposit_id: "dep_1",
          metadata: {
            deposit: true,
            deposit_kind: "collection",
            migration: true,
          },
        },
      ],
      rentals: [],
    } as unknown as FleetStore;
    const combined = getCombinedLifetimeTotals(store, []);
    expect(combined.fleet_collections).toBe(400);
  });
});

describe("migration cutover date", () => {
  it("returns the earliest migration cutover date across imported rentals", () => {
    const store = {
      rentals: [
        { imported_legacy_rental: true, migration_cutover_at: "2026-08-20" },
        { imported_legacy_rental: true, migration_cutover_at: "2026-08-15" },
        { imported_legacy_rental: false, migration_cutover_at: undefined },
      ],
      transactions: [],
    } as unknown as FleetStore;
    expect(getMigrationCutoverDate(store)).toBe("2026-08-15");
  });

  it("returns null when no imported rentals exist", () => {
    const store = { rentals: [], transactions: [] } as unknown as FleetStore;
    expect(getMigrationCutoverDate(store)).toBeNull();
  });
});

describe("migration CSV dry-run validators", () => {
  it("parses + validates vehicles, detecting VIN duplicates", () => {
    const csv =
      "unit,vin,make,model,year,plate\n1,1G1AB123,Toyota,Camry,2020,FL-1\n2,1G1AB123,Honda,Civic,2021,FL-2\n3,,Ford,,2022,FL-3\n";
    const rows = parseVehicleCsv(csv);
    const result = dryRunVehicles(rows, ["1g1ab123"]);
    expect(result.totalCount).toBe(3);
    // row 1: duplicate VIN (existing) -> duplicate
    // row 2: duplicate VIN (within file, same as row 1) -> duplicate
    // row 3: missing model -> invalid
    expect(result.validRows).toHaveLength(0);
    expect(result.duplicateRows.length).toBeGreaterThanOrEqual(1);
    expect(result.invalidRows).toHaveLength(1);
  });

  it("parses + validates customers, detecting phone/email duplicates", () => {
    const csv =
      "first_name,last_name,phone,email\nJane,Doe,555-1,jane@x.com\nJane,Doe,555-1,other@x.com\n,,555-2,\n";
    const rows = parseCustomerCsv(csv);
    const result = dryRunCustomers(rows, [], []);
    expect(result.totalCount).toBe(3);
    expect(result.validRows).toHaveLength(1); // row 2 (different email, but same phone as row1 -> dup)
    expect(result.duplicateRows.length).toBeGreaterThanOrEqual(1);
    expect(result.invalidRows).toHaveLength(1); // row 3 missing names
  });

  it("parses + validates historical financials, requiring period + revenue", () => {
    const csv =
      "period_start,revenue,expenses\n2026-01-01,82000,34000\n,82000,34000\n2026-02-01,,34000\n";
    const rows = parseHistoricalCsv(csv);
    const result = dryRunHistorical(rows);
    expect(result.totalCount).toBe(3);
    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(2);
  });
});
