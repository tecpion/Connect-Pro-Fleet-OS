// Connect Pro Fleet — Build #17 damage claim permission tests.

import { describe, it, expect } from "vitest";
import { can } from "@/lib/permissions";
import { TENANT_ID } from "@/lib/store/ids";
import type { Role } from "@/lib/settingsTypes";

const makeRole = (
  over: Partial<Role> & { permissions: Record<string, boolean> },
): Role => ({
  id: "r1",
  tenant_id: TENANT_ID,
  name: "role",
  description: "",
  is_system: false,
  is_protected: false,
  active: true,
  created_at: "x",
  ...over,
});

describe("Build #17 — damage claim permissions", () => {
  it("owner has all damage claim permissions", () => {
    const ownerRole = makeRole({
      name: "owner",
      is_system: true,
      permissions: Object.fromEntries(
        [
          "damage_claims.view",
          "damage_claims.create",
          "damage_claims.charge_customer",
          "damage_claims.apply_deposit",
          "damage_claims.close",
          "damage_claims.cancel",
          "damage_claims.view_financials",
          "damage_claims.manage_insurance",
          "damage_claims.determine_responsibility",
          "damage_claims.manage_evidence",
          "damage_claims.link_expenses",
          "damage_claims.assign",
          "damage_claims.edit",
        ].map((k) => [k, true]),
      ),
    });
    expect(can(ownerRole, null, "damage_claims.view")).toBe(true);
    expect(can(ownerRole, null, "damage_claims.charge_customer")).toBe(true);
    expect(can(ownerRole, null, "damage_claims.close")).toBe(true);
  });

  it("user without permission cannot view financials", () => {
    const userRole = makeRole({
      name: "user",
      permissions: {
        "damage_claims.view": true,
        "damage_claims.view_financials": false,
      },
    });
    expect(can(userRole, null, "damage_claims.view")).toBe(true);
    expect(can(userRole, null, "damage_claims.view_financials")).toBe(false);
    expect(can(userRole, null, "damage_claims.charge_customer")).toBe(false);
  });

  it("custom override can grant charge permission", () => {
    const userRole = makeRole({
      name: "user",
      permissions: {
        "damage_claims.view": true,
        "damage_claims.charge_customer": false,
      },
    });
    expect(
      can(
        userRole,
        { "damage_claims.charge_customer": true },
        "damage_claims.charge_customer",
      ),
    ).toBe(true);
  });
});
