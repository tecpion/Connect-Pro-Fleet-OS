// Connect Pro Fleet — Tolls & Violations permissions (Build #25).

import type { PermissionDef } from "./types";

export const VIOLATION_PERMISSIONS: PermissionDef[] = [
  { key: "violations.view", label: "View Violations", module: "Violations" },
  {
    key: "violations.create",
    label: "Create Violations",
    module: "Violations",
  },
  { key: "violations.edit", label: "Edit Violations", module: "Violations" },
  {
    key: "violations.assign_responsibility",
    label: "Assign Responsibility",
    module: "Violations",
  },
  {
    key: "violations.charge_customer",
    label: "Charge Customer for Violation",
    module: "Violations",
  },
  {
    key: "violations.record_company_payment",
    label: "Record Company Payment",
    module: "Violations",
  },
  {
    key: "violations.dispute",
    label: "Manage Disputes",
    module: "Violations",
  },
  {
    key: "violations.resolve",
    label: "Resolve / Close Violations",
    module: "Violations",
  },
  {
    key: "violations.import",
    label: "Import Violations (CSV)",
    module: "Violations",
  },
  {
    key: "violations.view_financials",
    label: "View Violation Financials",
    module: "Violations",
  },
];
