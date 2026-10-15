// Connect Pro Fleet — profitability & reporting permissions (Build #16).

import type { PermissionDef } from "./types";

export const PROFITABILITY_PERMISSIONS: PermissionDef[] = [
  {
    key: "reports.view_profitability",
    label: "View Profitability Reports",
    module: "Reports",
  },
  {
    key: "reports.view_vehicle_profitability",
    label: "View Vehicle Profitability",
    module: "Reports",
  },
  {
    key: "reports.view_company_profitability",
    label: "View Company P&L",
    module: "Reports",
  },
  {
    key: "reports.view_revenue",
    label: "View Revenue Reports",
    module: "Reports",
  },
  {
    key: "reports.view_expenses",
    label: "View Expense Reports",
    module: "Reports",
  },
  {
    key: "reports.view_collections",
    label: "View Collections Reports",
    module: "Reports",
  },
  { key: "reports.export", label: "Export Reports", module: "Reports" },
];
