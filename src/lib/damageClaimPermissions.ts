// Connect Pro Fleet — damage claims permissions (Build #17).

import type { PermissionDef } from "./types";

export const DAMAGE_CLAIM_PERMISSIONS: PermissionDef[] = [
  {
    key: "damage_claims.view",
    label: "View Damage Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.create",
    label: "Create Damage Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.edit",
    label: "Edit Damage Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.assign",
    label: "Assign Damage Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.determine_responsibility",
    label: "Determine Responsibility",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.view_financials",
    label: "View Claim Financials",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.charge_customer",
    label: "Charge Customer for Damage",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.apply_deposit",
    label: "Apply Deposit to Damage",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.manage_insurance",
    label: "Manage Insurance Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.link_expenses",
    label: "Link Expenses to Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.close",
    label: "Close Damage Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.cancel",
    label: "Cancel Damage Claims",
    module: "Damage Claims",
  },
  {
    key: "damage_claims.manage_evidence",
    label: "Manage Evidence",
    module: "Damage Claims",
  },
];
