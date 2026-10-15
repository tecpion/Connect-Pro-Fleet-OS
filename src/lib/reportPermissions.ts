// Connect Pro Fleet — Build #18 Operating Reports permissions.
//
// Granular report-access permissions. The Reports Center hides cards the
// current user cannot access. Sensitive company profit/overhead/investor
// economics reuse existing permissions (expenses.view_company_overhead,
// investors.view_financials) so privacy inference is impossible.

import type { PermissionDef } from "./types";

export const REPORT_PERMISSIONS: PermissionDef[] = [
  {
    key: "reports.view_management_summary",
    label: "View Management Summary",
    module: "Reports",
  },
  {
    key: "reports.view_operations",
    label: "View Operating Reports",
    module: "Reports",
  },
  {
    key: "reports.view_fleet_reports",
    label: "View Fleet Reports",
    module: "Reports",
  },
  {
    key: "reports.view_accounting",
    label: "View Accounting Reports",
    module: "Reports",
  },
  {
    key: "reports.view_staff_activity",
    label: "View Staff Activity Reports",
    module: "Reports",
  },
  {
    key: "reports.view_partner_reports",
    label: "View Partner / Investor Reports",
    module: "Reports",
  },
  {
    key: "reports.view_compliance",
    label: "View Compliance Report",
    module: "Reports",
  },
];
