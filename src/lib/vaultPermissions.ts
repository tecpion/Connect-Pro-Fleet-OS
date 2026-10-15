// Connect Pro Fleet — Vehicle Document Vault permissions (Build #45).
//
// The base document permissions (documents.view, documents.upload,
// documents.view_sensitive, documents.review, documents.archive) are already
// defined in compliancePermissions.ts and reused by the vault. This module
// adds ONLY the vault-specific capabilities so the permission catalog stays
// de-duplicated.

import type { PermissionDef } from "./types";

export const VAULT_PERMISSIONS: PermissionDef[] = [
  {
    key: "documents.generate_cash_expense",
    label: "Generate Cash Expense Record",
    module: "Vehicle Docs",
  },
  {
    key: "documents.generate_purchase",
    label: "Generate Purchase / Bill of Sale",
    module: "Vehicle Docs",
  },
  { key: "documents.sign", label: "Sign Documents", module: "Vehicle Docs" },
  {
    key: "documents.void_reissue",
    label: "Void / Reissue Documents",
    module: "Vehicle Docs",
  },
  {
    key: "documents.delete_draft",
    label: "Delete Unused Drafts",
    module: "Vehicle Docs",
  },
  {
    key: "documents.export",
    label: "Export Documents",
    module: "Vehicle Docs",
  },
];
