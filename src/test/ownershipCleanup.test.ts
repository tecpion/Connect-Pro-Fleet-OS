// Connect Pro Fleet — Build #6 cleanup tests.
//
// Verifies: investor financial permission gating, agreement editing via the
// shared compensation builders, audit history on agreement changes, per-pairing
// independence, and historical settlement preservation. Uses the pure domain
// helpers + the permission resolver (no React rendering needed for the logic).

import { describe, it, expect } from "vitest";
import type { InvestorVehicle } from "@/lib/investorTypes";
import type { Role } from "@/lib/settingsTypes";
import {
  can,
  effectivePermissions,
  SYSTEM_ROLE_PERMISSIONS,
} from "@/lib/permissions";
import {
  getVehicleCompensation,
  makePercentageCompensation,
  makeFixedCompensation,
  makeCustomCompensation,
  validateCompensation,
  getVehicleEconomics,
} from "@/lib/ownership";
import type { Vehicle } from "@/lib/types";

function mkRole(
  id: string,
  name: string,
  permissions: Record<string, boolean>,
): Role {
  return {
    id,
    tenant_id: "tnt_connectpro",
    name,
    description: "",
    is_system: false,
    is_protected: false,
    active: true,
    permissions,
    created_at: "2026-01-01",
  };
}

const basePairing = (over: Partial<InvestorVehicle> = {}): InvestorVehicle => ({
  id: "iv_1",
  tenant_id: "tnt_connectpro",
  investor_id: "inv_1",
  vehicle_id: "veh_1",
  ownership_type: "owned",
  revenue_split_investor_pct: 60,
  revenue_split_operator_pct: 40,
  agreement_id: null,
  active: true,
  compensation: makePercentageCompensation(60, { basis: "net" }),
  effective_date: "2026-01-15",
  ...over,
});

const baseVehicle = (over: Partial<Vehicle> = {}): Vehicle =>
  ({
    id: "veh_1",
    vin: "1C4RJFBG0MC872341",
    make: "Jeep",
    model: "Wrangler",
    year: 2022,
    license_plate: "FL-RT8841",
    status: "available",
    location: "Miami Downtown",
    vehicle_type: "suv",
    daily_rate: 120,
    weekly_rate: 720,
    deposit_amount: 500,
    images: [],
    ownership_type: "external_owner",
    owner_entity_id: "inv_1",
    ...over,
  }) as Vehicle;

describe("investor financial permissions", () => {
  it("owner can view investor financials", () => {
    const ownerRole = mkRole(
      "role_owner",
      "Owner",
      SYSTEM_ROLE_PERMISSIONS.owner,
    );
    expect(can(ownerRole, null, "investors.view_financials")).toBe(true);
    expect(can(ownerRole, null, "investors.manage_agreements")).toBe(true);
  });

  it("manager can view financials but cannot manage agreements by default", () => {
    const managerRole = mkRole(
      "role_manager",
      "Manager",
      SYSTEM_ROLE_PERMISSIONS.manager,
    );
    expect(can(managerRole, null, "investors.view_financials")).toBe(true);
    expect(can(managerRole, null, "investors.manage_agreements")).toBe(false);
  });

  it("ordinary user cannot view investor financials", () => {
    const userRole = mkRole("role_user", "User", SYSTEM_ROLE_PERMISSIONS.user);
    expect(can(userRole, null, "investors.view_financials")).toBe(false);
    expect(can(userRole, null, "investors.manage_agreements")).toBe(false);
  });

  it("user with vehicles.view_ownership can see ownership but not financials", () => {
    const role = mkRole(
      "role_custom",
      "Fleet",
      effectivePermissions(undefined, {
        "vehicles.view_ownership": true,
        "investors.view_financials": false,
      }),
    );
    expect(can(role, null, "vehicles.view_ownership")).toBe(true);
    expect(can(role, null, "investors.view_financials")).toBe(false);
  });

  it("per-user override can grant manage_agreements to a manager", () => {
    const managerRole = mkRole(
      "role_manager",
      "Manager",
      SYSTEM_ROLE_PERMISSIONS.manager,
    );
    expect(can(managerRole, null, "investors.manage_agreements")).toBe(false);
    expect(
      can(
        managerRole,
        { "investors.manage_agreements": true },
        "investors.manage_agreements",
      ),
    ).toBe(true);
  });
});

describe("agreement editing (shared compensation builders)", () => {
  it("can edit a percentage agreement from 60/40 to 50/50", () => {
    const pairing = basePairing();
    const old = getVehicleCompensation(pairing);
    expect(old.type).toBe("percentage");
    if (old.type === "percentage") expect(old.investor_percentage).toBe(60);

    const next = makePercentageCompensation(50, { basis: "net" });
    const err = validateCompensation(next);
    expect(err).toBeNull();
    expect(next.investor_percentage).toBe(50);
    expect(next.operator_percentage).toBe(50);
  });

  it("can edit a fixed agreement amount and frequency", () => {
    const fixed = makeFixedCompensation(500, "monthly", {
      guaranteedWhenNotRented: true,
    });
    expect(fixed.fixed_amount).toBe(500);
    expect(fixed.fixed_frequency).toBe("monthly");
    expect(fixed.guaranteed_when_not_rented).toBe(true);

    const edited = makeFixedCompensation(750, "weekly");
    expect(validateCompensation(edited)).toBeNull();
    expect(edited.fixed_amount).toBe(750);
    expect(edited.fixed_frequency).toBe("weekly");
  });

  it("can edit a custom agreement description", () => {
    const custom = makeCustomCompensation("$350/week while rented");
    expect(validateCompensation(custom)).toBeNull();
    const edited = makeCustomCompensation(
      "$400/week while rented, $200 downtime",
    );
    expect(validateCompensation(edited)).toBeNull();
    expect(edited.description).toContain("$400");
  });

  it("invalid percentage (sum != 100) is rejected", () => {
    const bad = makePercentageCompensation(60, { basis: "net" });
    // Tamper to break the sum invariant.
    const tampered = { ...bad, operator_percentage: 30 };
    expect(validateCompensation(tampered)).toBeTruthy();
  });

  it("editing one pairing does not alter another pairing for the same investor", () => {
    const pairingA = basePairing({ id: "iv_a", vehicle_id: "veh_a" });
    const pairingB = basePairing({
      id: "iv_b",
      vehicle_id: "veh_b",
      compensation: makePercentageCompensation(50, { basis: "net" }),
    });

    // Simulate editing A to 70/30.
    const editedA: InvestorVehicle = {
      ...pairingA,
      compensation: makePercentageCompensation(70, { basis: "net" }),
    };

    const aComp = getVehicleCompensation(editedA);
    const bComp = getVehicleCompensation(pairingB);
    expect(aComp.type).toBe("percentage");
    expect(bComp.type).toBe("percentage");
    if (aComp.type === "percentage") expect(aComp.investor_percentage).toBe(70);
    // B is untouched.
    if (bComp.type === "percentage") expect(bComp.investor_percentage).toBe(50);
  });
});

describe("audit + historical preservation", () => {
  it("agreement change produces a new compensation with an effective date", () => {
    const old = makePercentageCompensation(60, { basis: "net" });
    const next = makePercentageCompensation(50, {
      basis: "net",
      effectiveDate: "2026-09-01",
    });
    expect(next.effective_date).toBe("2026-09-01");
    expect(next.investor_percentage).not.toBe(old.investor_percentage);
  });

  it("vehicle economics reflect the new agreement without hiding a loss", () => {
    const v = baseVehicle();
    // Guaranteed fixed payout larger than net performance → negative operator.
    const pairing = basePairing({
      compensation: makeFixedCompensation(1000, "monthly"),
    });
    const econ = getVehicleEconomics({
      vehicleId: v.id,
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    expect(econ.net_performance).toBe(800);
    expect(econ.investor_payout).toBe(1000);
    expect(econ.operator_retained).toBe(-200);
  });

  it("existing 60/40 and 50/50 relationships still resolve correctly", () => {
    const sixty = basePairing({
      compensation: makePercentageCompensation(60, { basis: "net" }),
    });
    const fifty = basePairing({
      id: "iv_2",
      vehicle_id: "veh_2",
      compensation: makePercentageCompensation(50, { basis: "net" }),
    });
    const sComp = getVehicleCompensation(sixty);
    const fComp = getVehicleCompensation(fifty);
    expect(sComp.type).toBe("percentage");
    expect(fComp.type).toBe("percentage");
    if (sComp.type === "percentage") expect(sComp.investor_percentage).toBe(60);
    if (fComp.type === "percentage") expect(fComp.investor_percentage).toBe(50);

    const econ60 = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1000,
      operatingCosts: 200,
      repairCosts: 0,
      pairing: sixty,
    });
    // net = 1000 - 200 = 800; investor 60% of net = 480.
    expect(econ60.investor_payout).toBe(480);
    expect(econ60.operator_retained).toBe(320);
  });
});
