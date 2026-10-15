// Connect Pro Fleet — expense permissions catalog (Build #14).
// Extracted from permissions.ts to keep it under the line limit. Concatenated
// into PERMISSION_CATALOG at module load.

import type { PermissionDef } from "./types";

export const EXPENSE_PERMISSIONS: PermissionDef[] = [
  { key: "expenses.view", label: "View Expenses", module: "Expenses" },
  { key: "expenses.create", label: "Record Expenses", module: "Expenses" },
  {
    key: "expenses.edit_metadata",
    label: "Edit Expense Metadata",
    module: "Expenses",
  },
  { key: "expenses.reverse", label: "Reverse Expenses", module: "Expenses" },
  {
    key: "expenses.view_company_overhead",
    label: "View Company Overhead",
    module: "Expenses",
  },
  {
    key: "expenses.view_vehicle_expenses",
    label: "View Vehicle Expenses",
    module: "Expenses",
  },
  {
    key: "expenses.view_payment_details",
    label: "View Payment Details",
    module: "Expenses",
  },
  {
    key: "expenses.manage_categories",
    label: "Manage Expense Categories",
    module: "Expenses",
  },
  {
    key: "expenses.manage_receipts",
    label: "Manage Receipts",
    module: "Expenses",
  },
  {
    key: "expenses.view_reimbursements",
    label: "View Reimbursements",
    module: "Expenses",
  },
  {
    key: "expenses.manage_reimbursements",
    label: "Manage Reimbursements",
    module: "Expenses",
  },
  {
    key: "expenses.view_petty_cash",
    label: "View Petty Cash",
    module: "Expenses",
  },
  {
    key: "expenses.manage_petty_cash",
    label: "Manage Petty Cash",
    module: "Expenses",
  },
  { key: "expenses.view_costs", label: "View Cost Data", module: "Expenses" },
];
