// Connect Pro Fleet — permission catalog definitions (Build #14 split).
// Extracted from permissions.ts to break a circular import: rolePermissions.ts
// needs the catalog to derive keys, and permissions.ts imports
// SYSTEM_ROLE_PERMISSIONS from rolePermissions.ts. Keeping the catalog in its
// own module lets both import it without a cycle.

import type { PermissionDef } from "./types";
import { EXPENSE_PERMISSIONS } from "./expensePermissions";
import { BANKING_PERMISSIONS } from "./bankingPermissions";
import { PROFITABILITY_PERMISSIONS } from "./profitabilityPermissions";
import { DAMAGE_CLAIM_PERMISSIONS } from "./damageClaimPermissions";
import { VIOLATION_PERMISSIONS } from "./violationPermissions";
import { REPORT_PERMISSIONS } from "./reportPermissions";
import { MIGRATION_PERMISSIONS } from "./migrationPermissions";
import { INTEGRATION_PERMISSIONS } from "./integrationPermissions";
import { COMPLIANCE_PERMISSIONS } from "./compliancePermissions";
import { SUPPORT_PERMISSIONS } from "./supportPermissions";
import { CASE_PERMISSIONS } from "./caseCenterPermissions";
import { TELEMATICS_PERMISSIONS } from "./telematicsPermissions";
import { VERIFICATION_PERMISSIONS } from "./verificationPermissions";

// The canonical permission catalog. Grouped by module so the permissions
// matrix can render sections. New permissions can be appended freely — roles
// store a Record<key, boolean>, so unknown keys simply default to false.
export const PERMISSION_CATALOG: PermissionDef[] = [
  // DASHBOARD
  { key: "dashboard.view", label: "View Dashboard", module: "Dashboard" },
  {
    key: "dashboard.view_financials",
    label: "View Financial KPIs",
    module: "Dashboard",
  },

  // PLANNER
  { key: "planner.view", label: "View Planner", module: "Planner" },
  {
    key: "planner.create_reservation",
    label: "Create Reservation from Planner",
    module: "Planner",
  },
  {
    key: "planner.modify_availability",
    label: "Modify Availability",
    module: "Planner",
  },

  // VEHICLES
  { key: "vehicles.view", label: "View Vehicles", module: "Vehicles" },
  { key: "vehicles.add", label: "Add Vehicles", module: "Vehicles" },
  { key: "vehicles.edit", label: "Edit Vehicles", module: "Vehicles" },
  {
    key: "vehicles.delete",
    label: "Delete / Archive Vehicles",
    module: "Vehicles",
  },
  {
    key: "vehicles.view_financials",
    label: "View Vehicle Financials",
    module: "Vehicles",
  },
  {
    key: "vehicles.view_documents",
    label: "View Vehicle Documents",
    module: "Vehicles",
  },
  {
    key: "vehicles.manage_classes",
    label: "Manage Vehicle Classes",
    module: "Vehicles",
  },
  {
    key: "vehicles.override_pricing",
    label: "Override Vehicle Pricing",
    module: "Vehicles",
  },
  {
    key: "vehicles.view_ownership",
    label: "View Vehicle Ownership",
    module: "Vehicles",
  },

  // RESERVATIONS
  {
    key: "reservations.view",
    label: "View Reservations",
    module: "Reservations",
  },
  {
    key: "reservations.create",
    label: "Create Reservations",
    module: "Reservations",
  },
  {
    key: "reservations.edit",
    label: "Edit Reservations",
    module: "Reservations",
  },
  {
    key: "reservations.cancel",
    label: "Cancel Reservations",
    module: "Reservations",
  },
  {
    key: "reservations.record_payment",
    label: "Record Reservation Payments",
    module: "Reservations",
  },
  {
    key: "reservations.override_price",
    label: "Override Rental Price",
    module: "Reservations",
  },
  {
    key: "reservations.override_minimum",
    label: "Override Minimum Rental Duration",
    module: "Reservations",
  },

  // RENTALS
  { key: "rentals.view", label: "View Rentals", module: "Rentals" },
  { key: "rentals.start", label: "Start Rental", module: "Rentals" },
  { key: "rentals.extend", label: "Extend Rental", module: "Rentals" },
  { key: "rentals.exchange", label: "Exchange Vehicle", module: "Rentals" },
  { key: "rentals.return", label: "Return Vehicle", module: "Rentals" },
  { key: "rentals.add_charges", label: "Add Charges", module: "Rentals" },
  {
    key: "rentals.override_deposit_requirement",
    label: "Override Deposit Requirement",
    module: "Rentals",
  },
  {
    key: "rentals.override_release_gate",
    label: "Override Release Gate (Checkout)",
    module: "Rentals",
  },

  // DEPOSITS
  { key: "deposits.view", label: "View Deposits", module: "Deposits" },
  { key: "deposits.collect", label: "Collect Deposits", module: "Deposits" },
  { key: "deposits.apply", label: "Apply Deposits", module: "Deposits" },
  { key: "deposits.refund", label: "Refund Deposits", module: "Deposits" },
  { key: "deposits.forfeit", label: "Forfeit Deposits", module: "Deposits" },
  {
    key: "deposits.override_requirement",
    label: "Override Deposit Requirement",
    module: "Deposits",
  },

  // PAYMENTS
  { key: "payments.view", label: "View Payments", module: "Payments" },
  { key: "payments.record", label: "Record Payments", module: "Payments" },
  {
    key: "payments.apply_late_fees",
    label: "Apply Late Fees",
    module: "Payments",
  },
  { key: "payments.waive_fees", label: "Waive Fees", module: "Payments" },
  { key: "payments.issue_credits", label: "Issue Credits", module: "Payments" },
  { key: "payments.issue_refunds", label: "Issue Refunds", module: "Payments" },
  { key: "payments.view_revenue", label: "View Revenue", module: "Payments" },

  // PAYMENT ARRANGEMENTS
  {
    key: "payment_arrangements.view",
    label: "View Payment Arrangements",
    module: "Payment Arrangements",
  },
  {
    key: "payment_arrangements.create",
    label: "Create Arrangements",
    module: "Payment Arrangements",
  },
  {
    key: "payment_arrangements.modify",
    label: "Modify Arrangements",
    module: "Payment Arrangements",
  },
  {
    key: "payment_arrangements.cancel",
    label: "Cancel Arrangements",
    module: "Payment Arrangements",
  },
  {
    key: "payment_arrangements.override",
    label: "Override Arrangement Rules",
    module: "Payment Arrangements",
  },

  // CUSTOMERS
  { key: "customers.view", label: "View Customers", module: "Customers" },
  { key: "customers.add", label: "Add Customers", module: "Customers" },
  { key: "customers.edit", label: "Edit Customers", module: "Customers" },
  {
    key: "customers.view_license",
    label: "View Driver License",
    module: "Customers",
  },
  {
    key: "customers.view_insurance",
    label: "View Insurance",
    module: "Customers",
  },
  {
    key: "customers.manage_status",
    label: "Add Do Not Rent / Watchlist",
    module: "Customers",
  },

  // INSPECTIONS
  { key: "inspections.view", label: "View Inspections", module: "Inspections" },
  {
    key: "inspections.create",
    label: "Create Inspections",
    module: "Inspections",
  },
  {
    key: "inspections.confirm_damage",
    label: "Confirm Damage",
    module: "Inspections",
  },

  // MAINTENANCE
  { key: "maintenance.view", label: "View Maintenance", module: "Maintenance" },
  { key: "maintenance.add", label: "Add Maintenance", module: "Maintenance" },
  { key: "maintenance.edit", label: "Edit Maintenance", module: "Maintenance" },
  {
    key: "maintenance.complete",
    label: "Complete Maintenance",
    module: "Maintenance",
  },
  {
    key: "maintenance.assign",
    label: "Assign Maintenance",
    module: "Maintenance",
  },
  {
    key: "maintenance.change_status",
    label: "Change Status",
    module: "Maintenance",
  },
  {
    key: "maintenance.cancel",
    label: "Cancel Maintenance",
    module: "Maintenance",
  },
  {
    key: "maintenance.reopen",
    label: "Reopen Maintenance",
    module: "Maintenance",
  },
  {
    key: "maintenance.manage_vendors",
    label: "Manage Vendors",
    module: "Maintenance",
  },
  {
    key: "maintenance.view_costs",
    label: "View Maintenance Costs",
    module: "Maintenance",
  },
  {
    key: "maintenance.edit_costs",
    label: "Edit Maintenance Costs",
    module: "Maintenance",
  },
  {
    key: "maintenance.upload_receipts",
    label: "Upload Receipts",
    module: "Maintenance",
  },
  {
    key: "maintenance.manage_downtime",
    label: "Manage Downtime",
    module: "Maintenance",
  },

  // INVESTORS / PARTNERS
  {
    key: "investors.view",
    label: "View Investors",
    module: "Investors / Partners",
  },
  {
    key: "investors.view_financials",
    label: "View Investor Financials",
    module: "Investors / Partners",
  },
  {
    key: "investors.view_statements",
    label: "View Statements",
    module: "Investors / Partners",
  },
  {
    key: "investors.manage_agreements",
    label: "Manage Investor Agreements",
    module: "Investors / Partners",
  },
  {
    key: "investors.generate_settlements",
    label: "Generate Settlements",
    module: "Investors / Partners",
  },
  {
    key: "investors.finalize_settlements",
    label: "Finalize Settlements",
    module: "Investors / Partners",
  },
  {
    key: "investors.create_partnership",
    label: "Create Investor / JV Partnerships",
    module: "Investors / Partners",
  },

  // SETTINGS
  { key: "settings.view", label: "View Settings", module: "Settings" },
  {
    key: "settings.manage_company",
    label: "Manage Company",
    module: "Settings",
  },
  { key: "settings.manage_users", label: "Manage Users", module: "Settings" },
  { key: "settings.manage_roles", label: "Manage Roles", module: "Settings" },
  {
    key: "settings.manage_locations",
    label: "Manage Locations",
    module: "Settings",
  },
  {
    key: "settings.manage_pricing",
    label: "Manage Pricing",
    module: "Settings",
  },
  {
    key: "settings.manage_addons",
    label: "Manage Add-Ons",
    module: "Settings",
  },
  {
    key: "settings.manage_deposits",
    label: "Manage Deposits",
    module: "Settings",
  },
  {
    key: "settings.manage_agreements",
    label: "Manage Agreements",
    module: "Settings",
  },
  {
    key: "settings.manage_integrations",
    label: "Manage Integrations",
    module: "Settings",
  },
  // Build #23 — company policy management permissions.
  {
    key: "company_settings.view",
    label: "View Company Settings",
    module: "Company Policies",
  },
  {
    key: "company_settings.manage",
    label: "Manage Company Settings",
    module: "Company Policies",
  },
  {
    key: "rental_policies.view",
    label: "View Rental Policies",
    module: "Company Policies",
  },
  {
    key: "rental_policies.manage",
    label: "Manage Rental Policies",
    module: "Company Policies",
  },
  {
    key: "billing_policies.manage",
    label: "Manage Billing & Payment Policies",
    module: "Company Policies",
  },
  {
    key: "fee_settings.manage",
    label: "Manage Fee Settings",
    module: "Company Policies",
  },

  // TAXES & FEES (Build #9 — configurable taxes & fees engine)
  { key: "taxes.view", label: "View Tax Rules", module: "Taxes & Fees" },
  { key: "taxes.manage", label: "Manage Tax Rules", module: "Taxes & Fees" },
  {
    key: "taxes.override",
    label: "Override / Exempt Tax",
    module: "Taxes & Fees",
  },
  { key: "fees.view", label: "View Fee Rules", module: "Taxes & Fees" },
  { key: "fees.manage", label: "Manage Fee Rules", module: "Taxes & Fees" },
  { key: "fees.assess", label: "Assess Fees", module: "Taxes & Fees" },
  {
    key: "fees.override",
    label: "Override Fee Amounts",
    module: "Taxes & Fees",
  },

  // TASKS (Build #11 — operational work management)
  { key: "tasks.view_own", label: "View Own Tasks", module: "Tasks" },
  { key: "tasks.view_all", label: "View All Tasks", module: "Tasks" },
  { key: "tasks.create", label: "Create Tasks", module: "Tasks" },
  { key: "tasks.assign", label: "Assign / Reassign Tasks", module: "Tasks" },
  { key: "tasks.edit", label: "Edit Tasks", module: "Tasks" },
  { key: "tasks.complete", label: "Complete Tasks", module: "Tasks" },
  { key: "tasks.cancel", label: "Cancel Tasks", module: "Tasks" },
  { key: "tasks.reopen", label: "Reopen Tasks", module: "Tasks" },
  {
    key: "tasks.manage_system_tasks",
    label: "Manage System Tasks",
    module: "Tasks",
  },

  // NOTIFICATIONS (Build #12 — staff awareness layer)
  {
    key: "notifications.view_own",
    label: "View Own Notifications",
    module: "Notifications",
  },
  {
    key: "notifications.manage_preferences",
    label: "Manage Notification Preferences",
    module: "Notifications",
  },

  // EXPENSES (Build #14 — accounting expense ledger)
  ...EXPENSE_PERMISSIONS,

  // BANKING (Build #15 — bank/card reconciliation)
  ...BANKING_PERMISSIONS,

  // REPORTS (Build #16 — profitability & P&L)
  ...PROFITABILITY_PERMISSIONS,

  // DAMAGE CLAIMS (Build #17 — damage claims & recovery)
  ...DAMAGE_CLAIM_PERMISSIONS,

  // REPORTS (Build #18 — operating & management reports)
  ...REPORT_PERMISSIONS,

  // MIGRATION (Build #19 — data import / migration center)
  ...MIGRATION_PERMISSIONS,

  // INTEGRATIONS (Build #21 — Connect Pro ↔ Fleet sync)
  ...INTEGRATION_PERMISSIONS,

  // VIOLATIONS (Build #25 — tolls / tickets / violations)
  ...VIOLATION_PERMISSIONS,

  // COMPLIANCE & DOCUMENTS (Build #26 — documents & compliance center)
  ...COMPLIANCE_PERMISSIONS,

  // SUPPORT (Build #31 — in-app support center)
  ...SUPPORT_PERMISSIONS,

  // STAFF (Build #24 — staff & operational assignments)
  { key: "staff.view", label: "View Staff", module: "Staff" },
  { key: "staff.create", label: "Add Staff", module: "Staff" },
  { key: "staff.edit", label: "Edit Staff", module: "Staff" },
  {
    key: "staff.deactivate",
    label: "Deactivate / Suspend Staff",
    module: "Staff",
  },
  { key: "staff.manage_roles", label: "Manage Roles", module: "Staff" },
  {
    key: "staff.manage_permissions",
    label: "Manage Permissions",
    module: "Staff",
  },
  {
    key: "staff.assign_work",
    label: "Assign / Reassign Work",
    module: "Staff",
  },
  { key: "staff.view_activity", label: "View Staff Activity", module: "Staff" },

  // AI WORKFORCE (Build #46 — AI Agent Platform)
  {
    key: "ai_workforce.view",
    label: "View AI Workforce",
    module: "AI Workforce",
  },
  {
    key: "ai_workforce.manage",
    label: "Manage AI Agents & Settings",
    module: "AI Workforce",
  },
  {
    key: "ai_workforce.approve_actions",
    label: "Approve / Reject Agent Actions",
    module: "AI Workforce",
  },
  {
    key: "ai_workforce.run",
    label: "Run Agents Manually",
    module: "AI Workforce",
  },
  {
    key: "ai_workforce.view_usage",
    label: "View AI Usage & Billing",
    module: "AI Workforce",
  },

  // CASE CENTER (Build #54) — coordinates authoritative records. Financial
  // actions still use their authoritative permission; case perms never bypass
  // finance perms.
  ...CASE_PERMISSIONS,

  // TELEMATICS (V1 Telematics Hub) — GPS/telematics visibility, monitoring,
  // history, alerts, device assignment, geofences. No remote vehicle control in
  // V1 (visibility only). Financial actions still use their authoritative
  // permission; telematics perms never bypass a finance permission.
  ...TELEMATICS_PERMISSIONS,

  // CUSTOMER VERIFICATION (V1) — optional, company-controlled paid/third-party
  // verification services. Provider results are never altered by an override;
  // the override is an audited operational decision on top.
  ...VERIFICATION_PERMISSIONS,
];
