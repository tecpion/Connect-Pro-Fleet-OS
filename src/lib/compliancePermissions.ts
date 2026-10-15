// Connect Pro Fleet — Documents & Compliance permissions (Build #26).

import type { PermissionDef } from "./types";

export const COMPLIANCE_PERMISSIONS: PermissionDef[] = [
  { key: "documents.view", label: "View Documents", module: "Compliance" },
  { key: "documents.upload", label: "Upload Documents", module: "Compliance" },
  { key: "documents.review", label: "Review Documents", module: "Compliance" },
  {
    key: "documents.archive",
    label: "Archive Documents",
    module: "Compliance",
  },
  {
    key: "documents.view_sensitive",
    label: "View Sensitive Document Data",
    module: "Compliance",
  },
  { key: "compliance.view", label: "View Compliance", module: "Compliance" },
  {
    key: "compliance.manage",
    label: "Manage Compliance Rules",
    module: "Compliance",
  },
  {
    key: "compliance.override",
    label: "Override Compliance",
    module: "Compliance",
  },
  // Build #45 — Vehicle Document Vault: generated records + signatures.
  {
    key: "documents.generate_cash_expense",
    label: "Generate Cash Expense Record",
    module: "Compliance",
  },
  {
    key: "documents.generate_purchase",
    label: "Generate Bill of Sale / Purchase Record",
    module: "Compliance",
  },
  { key: "documents.sign", label: "Sign Documents", module: "Compliance" },
  {
    key: "documents.void_reissue",
    label: "Void / Reissue Documents",
    module: "Compliance",
  },
  {
    key: "documents.export",
    label: "Export Documents",
    module: "Compliance",
  },
];
