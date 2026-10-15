// Connect Pro Fleet — Customer Verification permissions (V1).
//
// Verification is optional + company-controlled. Permissions gate: viewing
// verification status/history, managing company verification policy, requiring
// a check per-customer/per-rental, running paid checks, and overriding a
// provider result. Provider results are never altered by an override; the
// override is an operational decision recorded on top (audited, never silent).

import type { PermissionDef } from "./types";

export const VERIFICATION_PERMISSIONS: PermissionDef[] = [
  {
    key: "verification.view",
    label: "View Customer Verification",
    module: "Verification",
  },
  {
    key: "verification.view_results",
    label: "View Verification Results / History",
    module: "Verification",
  },
  {
    key: "verification.manage_policy",
    label: "Manage Verification Policy",
    module: "Verification",
  },
  {
    key: "verification.require",
    label: "Require / Remove Per-Customer Checks",
    module: "Verification",
  },
  {
    key: "verification.run",
    label: "Run Paid Verification Checks",
    module: "Verification",
  },
  {
    key: "verification.override",
    label: "Override Verification Result",
    module: "Verification",
  },
];
