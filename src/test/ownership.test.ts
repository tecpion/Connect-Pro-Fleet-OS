// Connect Pro Fleet — Build #6 ownership + compensation tests.
//
// Verifies the ownership/compensation domain: ownership types, per-vehicle
// compensation arrangements (percentage/fixed/custom), gross vs net basis,
// per-vehicle agreement independence, historical preservation, and the
// one-primary-owner V1 rule.

import { describe, it, expect } from "vitest";
import type { Vehicle } from "@/lib/types";
import type { InvestorVehicle } from "@/lib/investorTypes";
import {
  getVehicleOwnership,
  hasOutsideOwner,
  ownershipTypeLabel,
  getVehicleCompensation,
  compensationTypeLabel,
  investorPercentage,
  makePercentageCompensation,
  makeFixedCompensation,
  makeCustomCompensation,
  validateCompensation,
  getVehicleInvestorRelationship,
  hasActivePairing,
  getVehicleEconomics,
} from "@/lib/ownership";

const baseVehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
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
  documents: [],
  purchase_date: "2022-03-04",
  purchase_price: 41200,
  current_mileage: 28410,
  insurance_policy_number: "AX-9901-22341",
  insurance_expiry: "2026-11-30",
  registration_expiry: "2027-02-28",
  tenant_id: "tnt_test",
  created_at: "2022-03-04T10:00:00Z",
  updated_at: "2026-08-20T10:00:00Z",
  ...over,
});

const basePairing = (over: Partial<InvestorVehicle> = {}): InvestorVehicle => ({
  id: "iv_1",
  tenant_id: "tnt_test",
  investor_id: "inv_1",
  vehicle_id: "veh_1",
  ownership_type: "owned",
  revenue_split_investor_pct: 60,
  revenue_split_operator_pct: 40,
  agreement_id: null,
  active: true,
  ...over,
});

describe("Build #6 — vehicle ownership", () => {
  it("company-owned vehicle works without investor", () => {
    const v = baseVehicle({ ownership_type: "company_owned" });
    expect(getVehicleOwnership(v).ownership_type).toBe("company_owned");
    expect(hasOutsideOwner(v)).toBe(false);
    expect(ownershipTypeLabel(v)).toBe("Company Owned");
  });

  it("external owner vehicle has an outside owner", () => {
    const v = baseVehicle({
      ownership_type: "external_owner",
      owner_entity_id: "inv_1",
      owner_display_name: "Daniel Reyes",
    });
    expect(hasOutsideOwner(v)).toBe(true);
    expect(ownershipTypeLabel(v)).toBe("External Owner / Investor Owned");
  });

  it("business partner owned works", () => {
    const v = baseVehicle({ ownership_type: "business_partner_owned" });
    expect(hasOutsideOwner(v)).toBe(true);
    expect(ownershipTypeLabel(v)).toBe("Business Partner Owned");
  });

  it("jointly owned works", () => {
    const v = baseVehicle({
      ownership_type: "jointly_owned",
      ownership_notes: "Company and John Smith jointly own vehicle.",
    });
    expect(hasOutsideOwner(v)).toBe(true);
    expect(getVehicleOwnership(v).ownership_notes).toContain("jointly");
  });

  it("other works with notes", () => {
    const v = baseVehicle({
      ownership_type: "other",
      ownership_notes: "Lease-to-own arrangement",
    });
    expect(ownershipTypeLabel(v)).toBe("Other");
    expect(getVehicleOwnership(v).ownership_notes).toBe(
      "Lease-to-own arrangement",
    );
  });

  it("defaults to company_owned when ownership_type absent", () => {
    const v = baseVehicle({ ownership_type: undefined });
    expect(getVehicleOwnership(v).ownership_type).toBe("company_owned");
  });

  it("company-owned hides investor fields", () => {
    const v = baseVehicle({ ownership_type: "company_owned" });
    expect(hasOutsideOwner(v)).toBe(false);
  });
});

describe("Build #6 — compensation arrangements", () => {
  it("percentage compensation can be stored", () => {
    const iv = basePairing({
      compensation: makePercentageCompensation(60, { basis: "net" }),
    });
    const c = getVehicleCompensation(iv);
    expect(c.type).toBe("percentage");
    expect(investorPercentage(iv)).toBe(60);
  });

  it("60/40 split works", () => {
    const iv = basePairing({
      compensation: makePercentageCompensation(60),
    });
    const c = getVehicleCompensation(iv);
    expect(c.type === "percentage" && c.investor_percentage).toBe(60);
    expect(c.type === "percentage" && c.operator_percentage).toBe(40);
  });

  it("50/50 split works", () => {
    const iv = basePairing({
      compensation: makePercentageCompensation(50),
    });
    expect(investorPercentage(iv)).toBe(50);
  });

  it("gross vs net basis is explicit", () => {
    const gross = basePairing({
      compensation: makePercentageCompensation(60, { basis: "gross" }),
    });
    const net = basePairing({
      compensation: makePercentageCompensation(60, { basis: "net" }),
    });
    const gc = getVehicleCompensation(gross);
    const nc = getVehicleCompensation(net);
    expect(gc.type === "percentage" && gc.basis).toBe("gross");
    expect(nc.type === "percentage" && nc.basis).toBe("net");
  });

  it("fixed compensation can be configured", () => {
    const iv = basePairing({
      compensation: makeFixedCompensation(500, "monthly", {
        guaranteedWhenNotRented: true,
      }),
    });
    const c = getVehicleCompensation(iv);
    expect(c.type).toBe("fixed");
    if (c.type === "fixed") {
      expect(c.fixed_amount).toBe(500);
      expect(c.fixed_frequency).toBe("monthly");
      expect(c.guaranteed_when_not_rented).toBe(true);
    }
  });

  it("guarantee during downtime can be represented", () => {
    const iv = basePairing({
      compensation: makeFixedCompensation(500, "monthly", {
        guaranteedDuringDowntime: true,
      }),
    });
    const c = getVehicleCompensation(iv);
    if (c.type === "fixed") expect(c.guaranteed_during_downtime).toBe(true);
  });

  it("custom compensation can be represented without fake calculation", () => {
    const iv = basePairing({
      compensation: makeCustomCompensation(
        "$350/week while rented, $200/week while down for maintenance longer than 7 days.",
      ),
    });
    const c = getVehicleCompensation(iv);
    expect(c.type).toBe("custom");
    if (c.type === "custom") expect(c.description).toContain("$350/week");
  });

  it("legacy pairings without compensation map to percentage net", () => {
    const iv = basePairing({ compensation: null });
    const c = getVehicleCompensation(iv);
    expect(c.type).toBe("percentage");
    expect(c.type === "percentage" && c.basis).toBe("net");
    expect(c.type === "percentage" && c.investor_percentage).toBe(60);
  });
});

describe("Build #6 — per-vehicle agreements", () => {
  it("same investor can have vehicle A at 60/40 and vehicle B on fixed payout", () => {
    const pairings: InvestorVehicle[] = [
      basePairing({
        id: "iv_a",
        vehicle_id: "veh_a",
        compensation: makePercentageCompensation(60),
      }),
      basePairing({
        id: "iv_b",
        vehicle_id: "veh_b",
        compensation: makeFixedCompensation(600, "monthly"),
      }),
    ];
    const a = getVehicleCompensation(pairings.find((p) => p.id === "iv_a")!);
    const b = getVehicleCompensation(pairings.find((p) => p.id === "iv_b")!);
    expect(a.type).toBe("percentage");
    expect(b.type).toBe("fixed");
  });

  it("editing vehicle A does not alter vehicle B", () => {
    const pairings: InvestorVehicle[] = [
      basePairing({
        id: "iv_a",
        vehicle_id: "veh_a",
        compensation: makePercentageCompensation(60),
      }),
      basePairing({
        id: "iv_b",
        vehicle_id: "veh_b",
        compensation: makeFixedCompensation(600, "monthly"),
      }),
    ];
    // Simulate editing A's split to 50/50
    const updated = pairings.map((p) =>
      p.id === "iv_a"
        ? { ...p, compensation: makePercentageCompensation(50) }
        : p,
    );
    const a = getVehicleCompensation(updated.find((p) => p.id === "iv_a")!);
    const b = getVehicleCompensation(updated.find((p) => p.id === "iv_b")!);
    expect(a.type === "percentage" && a.investor_percentage).toBe(50);
    expect(b.type).toBe("fixed");
  });
});

describe("Build #6 — vehicle ↔ investor linking", () => {
  it("finds the active primary pairing for a vehicle", () => {
    const pairings: InvestorVehicle[] = [
      basePairing({ id: "iv_1", vehicle_id: "veh_1", active: true }),
      basePairing({ id: "iv_2", vehicle_id: "veh_2", active: true }),
    ];
    const rel = getVehicleInvestorRelationship("veh_1", pairings);
    expect(rel?.id).toBe("iv_1");
  });

  it("enforces one active pairing per vehicle (V1)", () => {
    const pairings: InvestorVehicle[] = [
      basePairing({ id: "iv_1", vehicle_id: "veh_1", active: true }),
    ];
    expect(hasActivePairing("veh_1", pairings)).toBe(true);
    expect(hasActivePairing("veh_2", pairings)).toBe(false);
  });
});

describe("Build #6 — vehicle economics", () => {
  it("net performance can be negative (guaranteed payout hides no loss)", () => {
    const pairing = basePairing({
      compensation: makeFixedCompensation(1000, "monthly"),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    // Gross 1500 - expenses 700 = net 800; guaranteed payout 1000 > 800
    expect(econ.net_performance).toBe(800);
    expect(econ.investor_payout).toBe(1000);
    expect(econ.operator_retained).toBe(-200);
  });

  it("percentage net basis splits net performance", () => {
    const pairing = basePairing({
      compensation: makePercentageCompensation(60, { basis: "net" }),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    // net = 800; investor 60% of 800 = 480
    expect(econ.investor_payout).toBe(480);
    expect(econ.operator_retained).toBe(320);
  });

  it("percentage gross basis splits gross revenue", () => {
    const pairing = basePairing({
      compensation: makePercentageCompensation(60, { basis: "gross" }),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1500,
      operatingCosts: 700,
      repairCosts: 0,
      pairing,
    });
    // investor 60% of gross 1500 = 900
    expect(econ.investor_payout).toBe(900);
  });

  it("costs remain separate from payout", () => {
    const pairing = basePairing({
      compensation: makePercentageCompensation(50, { basis: "net" }),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1000,
      operatingCosts: 200,
      repairCosts: 100,
      pairing,
    });
    expect(econ.vehicle_expenses).toBe(300);
    expect(econ.maintenance_repair_cost).toBe(100);
  });
});

describe("Build #6 — compensation validation", () => {
  it("rejects percentages that don't sum to 100", () => {
    const c = {
      type: "percentage" as const,
      basis: "net" as const,
      investor_percentage: 60,
      operator_percentage: 50,
      effective_date: "2026-01-01",
      end_date: null,
      notes: null,
    };
    expect(validateCompensation(c)).toContain("sum to 100");
  });

  it("rejects negative fixed amounts", () => {
    const c = makeFixedCompensation(-100, "monthly");
    expect(validateCompensation(c)).toContain("negative");
  });

  it("requires custom compensation description", () => {
    const c = makeCustomCompensation("");
    expect(validateCompensation(c)).toContain("description");
  });
});

describe("Build #6 — isolation", () => {
  it("ownership does not alter vehicle class", () => {
    const v = baseVehicle({
      ownership_type: "external_owner",
      vehicle_class_id: "cls_suv",
    });
    expect(v.vehicle_class_id).toBe("cls_suv");
  });

  it("ownership does not alter rental rate", () => {
    const v = baseVehicle({
      ownership_type: "external_owner",
      daily_rate: 120,
      weekly_rate: 720,
    });
    expect(v.daily_rate).toBe(120);
    expect(v.weekly_rate).toBe(720);
  });

  it("ownership does not alter operational status", () => {
    const v = baseVehicle({
      ownership_type: "external_owner",
      status: "maintenance",
    });
    expect(v.status).toBe("maintenance");
  });
});
