// Connect Pro Fleet — Build #19 cleanup: investor import + reporting tests.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore } from "@/lib/store";
import { MigrationProvider, useMigration } from "@/lib/migrationStore";
import { InvestorProvider, useInvestors } from "@/lib/investorStore";
import type { ReactNode } from "react";
import {
  mapVehicleStatus,
  mapOwnershipType,
  resolveVehicleClass,
} from "@/lib/migrationMapping";
import {
  findExistingVehicle,
  findExistingCustomer,
} from "@/lib/migrationCommit";
import { findExistingInvestor } from "@/lib/migrationInvestorCommit";
import {
  getReportSourceTotals,
  getNonOverlappingHistoricalSet,
} from "@/lib/migrationSelectors";
import type { HistoricalFinancialPeriod } from "@/lib/migrationTypes";
import type { FleetStore } from "@/lib/store";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <InvestorProvider>
        <MigrationProvider>{children}</MigrationProvider>
      </InvestorProvider>
    </StoreProvider>
  );
}
function useHooks() {
  return renderHook(
    () => ({ store: useStore(), mig: useMigration(), inv: useInvestors() }),
    { wrapper },
  ).result;
}
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

describe("migration: investor import", () => {
  it("creates an investor with a percentage pairing", () => {
    const r = useHooks();
    const beforeInv = r.current.inv.investors.length;
    const beforeIv = r.current.inv.investorVehicles.length;
    let res;
    act(() => {
      res = r.current.mig.importInvestor(
        {
          full_name: "Test Investor",
          email: "testinv@example.com",
          phone: "555-INV1",
          relationship: "external",
          vehicle_id: "veh_3",
          ownership_type: "owned",
          compensation_type: "percentage",
          investor_percentage: 60,
          operator_percentage: 40,
          basis: "net",
          fixed_amount: null,
          fixed_frequency: null,
          guaranteed_when_not_rented: null,
          guaranteed_during_downtime: null,
          custom_description: null,
          effective_date: "2026-09-01",
          notes: null,
          external_id: "EXT-INV-1",
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(true);
    expect(res!.action).toBe("created");
    expect(r.current.inv.investors.length).toBe(beforeInv + 1);
    expect(r.current.inv.investorVehicles.length).toBe(beforeIv + 1);
    const pairing = r.current.inv.investorVehicles.find(
      (x) => x.investor_id === res!.investor_id,
    );
    expect(pairing!.compensation?.type).toBe("percentage");
    expect(pairing!.compensation).toHaveProperty("investor_percentage", 60);
  });

  it("detects an email duplicate and skips", () => {
    const r = useHooks();
    const existingEmail = r.current.inv.investors[0].email;
    let res;
    act(() => {
      res = r.current.mig.importInvestor(
        {
          full_name: "Dup Investor",
          email: existingEmail,
          phone: "555-DUP",
          relationship: "external",
          vehicle_id: null,
          ownership_type: "owned",
          compensation_type: "percentage",
          investor_percentage: 50,
          operator_percentage: 50,
          basis: "net",
          fixed_amount: null,
          fixed_frequency: null,
          guaranteed_when_not_rented: null,
          guaranteed_during_downtime: null,
          custom_description: null,
          effective_date: "2026-09-01",
          notes: null,
          external_id: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.action).toBe("skipped");
  });

  it("warns (does not auto-merge) on a weak name-only match", () => {
    const r = useHooks();
    const existingName = r.current.inv.investors[0].full_name;
    let res;
    act(() => {
      res = r.current.mig.importInvestor(
        {
          full_name: existingName,
          email: "brandnew@example.com",
          phone: "555-WEAK",
          relationship: "external",
          vehicle_id: null,
          ownership_type: "owned",
          compensation_type: "percentage",
          investor_percentage: 50,
          operator_percentage: 50,
          basis: "net",
          fixed_amount: null,
          fixed_frequency: null,
          guaranteed_when_not_rented: null,
          guaranteed_during_downtime: null,
          custom_description: null,
          effective_date: "2026-09-01",
          notes: null,
          external_id: null,
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("name");
  });

  it("rejects a pairing to a nonexistent vehicle (tenant isolation)", () => {
    const r = useHooks();
    let res;
    act(() => {
      res = r.current.mig.importInvestor(
        {
          full_name: "Isolated Investor",
          email: "iso@example.com",
          phone: "555-ISO",
          relationship: "external",
          vehicle_id: "veh_nonexistent",
          ownership_type: "owned",
          compensation_type: "percentage",
          investor_percentage: 50,
          operator_percentage: 50,
          basis: "net",
          fixed_amount: null,
          fixed_frequency: null,
          guaranteed_when_not_rented: null,
          guaranteed_during_downtime: null,
          custom_description: null,
          effective_date: "2026-09-01",
          notes: null,
          external_id: "EXT-ISO",
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("Vehicle not found");
  });

  it("is idempotent — re-importing the same external id is blocked", () => {
    const r = useHooks();
    act(() => {
      r.current.mig.importInvestor(
        {
          full_name: "Idem Investor",
          email: "ideminv@example.com",
          phone: "555-IDEMINV",
          relationship: "external",
          vehicle_id: null,
          ownership_type: "owned",
          compensation_type: "percentage",
          investor_percentage: 50,
          operator_percentage: 50,
          basis: "net",
          fixed_amount: null,
          fixed_frequency: null,
          guaranteed_when_not_rented: null,
          guaranteed_during_downtime: null,
          custom_description: null,
          effective_date: "2026-09-01",
          notes: null,
          external_id: "EXT-INV-IDEM",
        },
        "skip",
      );
    });
    const before = r.current.inv.investors.length;
    let res;
    act(() => {
      res = r.current.mig.importInvestor(
        {
          full_name: "Other Investor",
          email: "otherinv@example.com",
          phone: "555-OTHERINV",
          relationship: "external",
          vehicle_id: null,
          ownership_type: "owned",
          compensation_type: "percentage",
          investor_percentage: 50,
          operator_percentage: 50,
          basis: "net",
          fixed_amount: null,
          fixed_frequency: null,
          guaranteed_when_not_rented: null,
          guaranteed_during_downtime: null,
          custom_description: null,
          effective_date: "2026-09-01",
          notes: null,
          external_id: "EXT-INV-IDEM",
        },
        "skip",
      );
    });
    expect(res!.ok).toBe(false);
    expect(r.current.inv.investors.length).toBe(before);
  });
});

describe("migration mapping helpers", () => {
  it("maps external vehicle statuses to canonical statuses", () => {
    expect(mapVehicleStatus("Available").status).toBe("available");
    expect(mapVehicleStatus("RENTED").status).toBe("rented");
    expect(mapVehicleStatus("out of service").status).toBe("out_of_service");
    expect(mapVehicleStatus("in_maintenance").status).toBe("maintenance");
  });
  it("flags unknown statuses as unresolved", () => {
    expect(mapVehicleStatus("banana").resolved).toBe(false);
  });
  it("maps external ownership labels to VehicleOwnershipType", () => {
    expect(mapOwnershipType("company").type).toBe("company_owned");
    expect(mapOwnershipType("investor").type).toBe("external_owner");
    expect(mapOwnershipType("business partner").type).toBe(
      "business_partner_owned",
    );
    expect(mapOwnershipType("joint").type).toBe("jointly_owned");
  });
  it("resolves an existing vehicle class by name (case-insensitive)", () => {
    const store = {
      vehicleClasses: [{ id: "cls_suv", name: "SUV", active: true }],
    } as unknown as FleetStore;
    expect(resolveVehicleClass(store, "suv").classId).toBe("cls_suv");
  });
  it("leaves an unknown class unresolved", () => {
    const store = {
      vehicleClasses: [{ id: "cls_suv", name: "SUV", active: true }],
    } as unknown as FleetStore;
    expect(resolveVehicleClass(store, "Exotic").resolved).toBe(false);
  });
});

describe("migration: duplicate-finder helpers", () => {
  it("finds an existing vehicle by VIN (case-insensitive)", () => {
    const store = {
      vehicles: [{ id: "v1", vin: "ABC123", license_plate: "FL-1" }],
    } as unknown as FleetStore;
    const found = findExistingVehicle(store, {
      vin: "abc123",
      unit_number: null,
      make: "",
      model: "",
    } as any);
    expect(found?.id).toBe("v1");
  });
  it("finds an existing customer by email (case-insensitive)", () => {
    const store = {
      customers: [
        {
          id: "c1",
          phone: "555",
          email: "Jane@X.com",
          drivers_license_number: null,
        },
      ],
    } as unknown as FleetStore;
    const found = findExistingCustomer(store, {
      phone: null,
      email: "jane@x.com",
      drivers_license: null,
      first_name: "",
      last_name: "",
    } as any);
    expect(found?.id).toBe("c1");
  });
  it("finds an existing investor by email (high confidence)", () => {
    const investors = [
      { id: "i1", full_name: "A", email: "a@x.com", phone: "1" },
    ];
    const found = findExistingInvestor(investors, {
      full_name: "B",
      email: "a@x.com",
      phone: null,
    } as any);
    expect(found?.confidence).toBe("high");
  });
  it("flags a weak name-only investor match", () => {
    const investors = [
      { id: "i1", full_name: "John Smith", email: "", phone: "" },
    ];
    const found = findExistingInvestor(investors, {
      full_name: "john smith",
      email: null,
      phone: null,
    } as any);
    expect(found?.confidence).toBe("weak");
  });
});

describe("migration: historical reporting", () => {
  const fleetStore = {
    transactions: [
      {
        transaction_type: "rental_charge",
        category: "charge",
        status: "posted",
        amount: 500,
        deposit_id: null,
        metadata: null,
      },
    ],
    rentals: [],
  } as unknown as FleetStore;

  it("fleet-only mode returns only fleet-native totals", () => {
    const t = getReportSourceTotals(
      fleetStore,
      [period({ revenue: 800000 })],
      "fleet_only",
    );
    expect(t.fleet_revenue).toBe(500);
    expect(t.historical_revenue).toBe(0);
    expect(t.combined_revenue).toBe(500);
  });
  it("historical-only mode returns only the summary layer", () => {
    const t = getReportSourceTotals(
      fleetStore,
      [period({ revenue: 800000 })],
      "historical_only",
    );
    expect(t.fleet_revenue).toBe(0);
    expect(t.historical_revenue).toBe(800000);
    expect(t.combined_revenue).toBe(800000);
  });
  it("combined mode preserves source distinction", () => {
    const t = getReportSourceTotals(
      fleetStore,
      [period({ revenue: 800000 })],
      "combined",
    );
    expect(t.fleet_revenue).toBe(500);
    expect(t.historical_revenue).toBe(800000);
    expect(t.combined_revenue).toBe(800500);
  });
  it("non-overlapping set excludes a lifetime opening that overlaps monthly", () => {
    const periods = [
      period({
        id: "m1",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        granularity: "month",
      }),
      period({
        id: "m2",
        period_start: "2026-02-01",
        period_end: "2026-02-28",
        granularity: "month",
      }),
      period({
        id: "lt",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        granularity: "lifetime_opening",
        revenue: 800000,
      }),
    ];
    const set = getNonOverlappingHistoricalSet(periods);
    expect(set.find((p) => p.id === "lt")).toBeUndefined();
    expect(set).toHaveLength(2);
  });
  it("keeps a non-overlapping lifetime opening", () => {
    const periods = [
      period({
        id: "m1",
        period_start: "2026-06-01",
        period_end: "2026-06-30",
        granularity: "month",
      }),
      period({
        id: "lt",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        granularity: "lifetime_opening",
        revenue: 800000,
      }),
    ];
    const set = getNonOverlappingHistoricalSet(periods);
    expect(set.find((p) => p.id === "lt")).toBeDefined();
  });
});
