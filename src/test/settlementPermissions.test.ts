// Connect Pro Fleet — Build #6 final cleanup: settlement action permissions.
//
// Verifies that generate/finalize settlement permissions are independent of
// view-financials and of each other, that custom-role overrides grant them,
// and that existing settlement calculations remain unchanged.

import { describe, it, expect } from "vitest";
import type { Role } from "@/lib/settingsTypes";
import {
  can,
  effectivePermissions,
  SYSTEM_ROLE_PERMISSIONS,
} from "@/lib/permissions";
import {
  getVehicleEconomics,
  makePercentageCompensation,
} from "@/lib/ownership";
import type { InvestorVehicle } from "@/lib/investorTypes";

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

describe("settlement action permissions", () => {
  it("owner can generate and finalize settlements", () => {
    const owner = mkRole("role_owner", "Owner", SYSTEM_ROLE_PERMISSIONS.owner);
    expect(can(owner, null, "investors.generate_settlements")).toBe(true);
    expect(can(owner, null, "investors.finalize_settlements")).toBe(true);
  });

  it("manager can generate settlements but cannot finalize by default", () => {
    const manager = mkRole(
      "role_manager",
      "Manager",
      SYSTEM_ROLE_PERMISSIONS.manager,
    );
    expect(can(manager, null, "investors.generate_settlements")).toBe(true);
    expect(can(manager, null, "investors.finalize_settlements")).toBe(false);
  });

  it("ordinary user cannot generate or finalize settlements", () => {
    const user = mkRole("role_user", "User", SYSTEM_ROLE_PERMISSIONS.user);
    expect(can(user, null, "investors.generate_settlements")).toBe(false);
    expect(can(user, null, "investors.finalize_settlements")).toBe(false);
  });

  it("view-financials alone does not grant generate or finalize", () => {
    const role = mkRole(
      "role_viewonly",
      "Viewer",
      effectivePermissions(undefined, {
        "investors.view_financials": true,
        "investors.generate_settlements": false,
        "investors.finalize_settlements": false,
      }),
    );
    expect(can(role, null, "investors.view_financials")).toBe(true);
    expect(can(role, null, "investors.generate_settlements")).toBe(false);
    expect(can(role, null, "investors.finalize_settlements")).toBe(false);
  });

  it("custom-role override can grant generate permission", () => {
    const role = mkRole(
      "role_custom",
      "Analyst",
      effectivePermissions(undefined, {
        "investors.view_financials": true,
        "investors.generate_settlements": false,
      }),
    );
    expect(can(role, null, "investors.generate_settlements")).toBe(false);
    expect(
      can(
        role,
        { "investors.generate_settlements": true },
        "investors.generate_settlements",
      ),
    ).toBe(true);
  });

  it("custom-role override can grant finalize permission", () => {
    const role = mkRole(
      "role_custom",
      "Analyst",
      effectivePermissions(undefined, {
        "investors.view_financials": true,
        "investors.finalize_settlements": false,
      }),
    );
    expect(can(role, null, "investors.finalize_settlements")).toBe(false);
    expect(
      can(
        role,
        { "investors.finalize_settlements": true },
        "investors.finalize_settlements",
      ),
    ).toBe(true);
  });

  it("generate permission does not automatically grant finalize", () => {
    const role = mkRole(
      "role_gen_only",
      "Generator",
      effectivePermissions(undefined, {
        "investors.generate_settlements": true,
        "investors.finalize_settlements": false,
      }),
    );
    expect(can(role, null, "investors.generate_settlements")).toBe(true);
    expect(can(role, null, "investors.finalize_settlements")).toBe(false);
  });

  it("finalize permission does not automatically grant generate", () => {
    const role = mkRole(
      "role_fin_only",
      "Finalizer",
      effectivePermissions(undefined, {
        "investors.generate_settlements": false,
        "investors.finalize_settlements": true,
      }),
    );
    expect(can(role, null, "investors.generate_settlements")).toBe(false);
    expect(can(role, null, "investors.finalize_settlements")).toBe(true);
  });

  it("existing settlement calculations remain unchanged (60/40 net)", () => {
    const pairing = basePairing();
    const econ = getVehicleEconomics({
      vehicleId: "veh_1",
      grossRevenue: 1000,
      operatingCosts: 200,
      repairCosts: 0,
      pairing,
    });
    // net = 1000 - 200 = 800; investor 60% of net = 480; operator = 320.
    expect(econ.investor_payout).toBe(480);
    expect(econ.operator_retained).toBe(320);
  });

  it("existing 50/50 settlement calculation remains unchanged", () => {
    const pairing = basePairing({
      compensation: makePercentageCompensation(50, { basis: "net" }),
    });
    const econ = getVehicleEconomics({
      vehicleId: "veh_2",
      grossRevenue: 1000,
      operatingCosts: 200,
      repairCosts: 0,
      pairing,
    });
    // net = 800; investor 50% = 400; operator = 400.
    expect(econ.investor_payout).toBe(400);
    expect(econ.operator_retained).toBe(400);
  });
});
