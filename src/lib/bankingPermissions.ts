// Connect Pro Fleet — banking & reconciliation permissions (Build #15).
// Concatenated into PERMISSION_CATALOG at module load.

import type { PermissionDef } from "./types";

export const BANKING_PERMISSIONS: PermissionDef[] = [
  {
    key: "banking.view",
    label: "View Banking & Reconciliation",
    module: "Banking",
  },
  { key: "banking.import", label: "Import Statements", module: "Banking" },
  { key: "banking.review", label: "Review Transactions", module: "Banking" },
  { key: "banking.match", label: "Confirm Matches", module: "Banking" },
  { key: "banking.unmatch", label: "Unmatch Transactions", module: "Banking" },
  {
    key: "banking.create_expense",
    label: "Create Expense from Import",
    module: "Banking",
  },
  {
    key: "banking.manage_accounts",
    label: "Manage Financial Accounts",
    module: "Banking",
  },
  { key: "banking.mark_transfer", label: "Mark Transfers", module: "Banking" },
  {
    key: "banking.reconcile_statement",
    label: "Reconcile Statements",
    module: "Banking",
  },
  {
    key: "banking.view_balances",
    label: "View Account Balances",
    module: "Banking",
  },
];
