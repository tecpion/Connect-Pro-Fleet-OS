// Connect Pro Fleet — Staff & Operational Assignments domain types (Build #24).
//
// This module adds a FIRST-CLASS operational assignment model that is distinct
// from Tasks (work items) and from the legacy reservation-only StaffAssignment
// (checkout/checkin/delivery slots). An OperationalStaffAssignment represents
// RESPONSIBILITY/OWNERSHIP over an entity — e.g. "Sarah is the CSR for Rental
// #123" — and is preserved as history when reassigned or when the entity
// completes. It is NOT a financial record, a task, or a notification.
//
// Rental-company staff roles here are entirely separate from any future Connect
// Pro Fleet platform Super Admin / Support users (Build #27).

import type { UserStatus } from "./types";

// ---------------------------------------------------------------------------
// Responsibility tags (structured operational responsibility)
// ---------------------------------------------------------------------------

export type ResponsibilityTag =
  | "customer_service"
  | "reservations"
  | "collections"
  | "fleet_operations"
  | "maintenance"
  | "damage_claims"
  | "expenses"
  | "banking"
  | "tickets_violations"
  | "investor_relations"
  | "admin"
  | "reports";

export const RESPONSIBILITY_LABELS: Record<ResponsibilityTag, string> = {
  customer_service: "Customer Service",
  reservations: "Reservations",
  collections: "Collections",
  fleet_operations: "Fleet Operations",
  maintenance: "Maintenance",
  damage_claims: "Damage Claims",
  expenses: "Expenses",
  banking: "Banking",
  tickets_violations: "Tickets / Violations",
  investor_relations: "Investor Relations",
  admin: "Admin",
  reports: "Reports",
};

export const ALL_RESPONSIBILITY_TAGS = Object.keys(
  RESPONSIBILITY_LABELS,
) as ResponsibilityTag[];

// ---------------------------------------------------------------------------
// Operational assignment types
// ---------------------------------------------------------------------------

export type OperationalAssignmentType =
  // Rental
  | "rental_account_owner"
  | "rental_csr"
  | "rental_collections_owner"
  | "rental_checkout_staff"
  | "rental_return_staff"
  // Customer
  | "customer_account_owner"
  | "customer_csr"
  // Vehicle
  | "vehicle_fleet_manager"
  | "vehicle_maintenance_coordinator"
  | "vehicle_porter"
  // Maintenance work order
  | "work_order_coordinator"
  | "work_order_assigned_staff"
  // Damage claim
  | "damage_claim_owner"
  | "damage_adjuster"
  | "damage_repair_coordinator"
  // Banking
  | "banking_transaction_review"
  | "banking_reconciliation"
  | "banking_statement_import"
  // Investor
  | "investor_manager"
  | "investor_settlement_reviewer"
  // Expense
  | "expense_submitted_by"
  | "expense_reviewed_by"
  | "expense_approved_by"
  // Tolls & Violations
  | "violation_owner"
  | "violation_review_coordinator"
  // Documents & Compliance (Build #26)
  | "compliance_owner"
  | "document_reviewer"
  // General
  | "general_owner";

export const ASSIGNMENT_TYPE_LABELS: Record<OperationalAssignmentType, string> =
  {
    rental_account_owner: "Account Owner",
    rental_csr: "CSR",
    rental_collections_owner: "Collections Owner",
    rental_checkout_staff: "Check-Out Staff",
    rental_return_staff: "Return Staff",
    customer_account_owner: "Account Owner",
    customer_csr: "CSR",
    vehicle_fleet_manager: "Fleet Manager",
    vehicle_maintenance_coordinator: "Maintenance Coordinator",
    vehicle_porter: "Porter / Runner",
    work_order_coordinator: "Coordinator",
    work_order_assigned_staff: "Assigned Staff",
    damage_claim_owner: "Claim Owner",
    damage_adjuster: "Adjuster / Insurance Follow-Up",
    damage_repair_coordinator: "Repair Coordinator",
    banking_transaction_review: "Transaction Review",
    banking_reconciliation: "Reconciliation",
    banking_statement_import: "Statement Import",
    investor_manager: "Investor Manager",
    investor_settlement_reviewer: "Settlement Reviewer",
    expense_submitted_by: "Submitted By",
    expense_reviewed_by: "Reviewed By",
    expense_approved_by: "Approved By",
    violation_owner: "Violation Owner",
    violation_review_coordinator: "Review Coordinator",
    compliance_owner: "Compliance Owner",
    document_reviewer: "Document Reviewer",
    general_owner: "Owner",
  };

/** The entity an operational assignment points at. */
export type AssignmentEntityType =
  | "rental"
  | "customer"
  | "vehicle"
  | "work_order"
  | "damage_claim"
  | "banking"
  | "investor"
  | "expense"
  | "violation"
  | "compliance"
  | "general";

export const ASSIGNMENT_ENTITY_LABELS: Record<AssignmentEntityType, string> = {
  rental: "Rental",
  customer: "Customer",
  vehicle: "Vehicle",
  work_order: "Work Order",
  damage_claim: "Damage Claim",
  banking: "Banking",
  investor: "Investor",
  expense: "Expense",
  violation: "Violation",
  compliance: "Compliance",
  general: "General",
};

export type AssignmentStatus =
  "active" | "completed" | "reassigned" | "cancelled";

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  active: "Active",
  completed: "Completed",
  reassigned: "Reassigned",
  cancelled: "Cancelled",
};

export const ASSIGNMENT_STATUS_TONE: Record<
  AssignmentStatus,
  "available" | "maintenance" | "out" | "rented" | "neutral"
> = {
  active: "rented",
  completed: "available",
  reassigned: "neutral",
  cancelled: "neutral",
};

// ---------------------------------------------------------------------------
// OperationalStaffAssignment record
// ---------------------------------------------------------------------------

export interface OperationalStaffAssignment {
  id: string;
  tenant_id: string;
  staff_id: string;
  assignment_type: OperationalAssignmentType;
  entity_type: AssignmentEntityType;
  entity_id: string;
  /** Snapshot label so historical assignments stay readable even if the
   *  entity is later archived/renamed. */
  entity_label: string | null;
  status: AssignmentStatus;
  assigned_by: string | null; // staff id, or null for SYSTEM
  assigned_at: string;
  due_at: string | null;
  priority: "low" | "normal" | "high" | "urgent" | null;
  notes: string | null;
  completed_at: string | null;
  /** When reassigned, the previous assignment is marked "reassigned" and this
   *  points to the new assignment id (for history chains). */
  reassigned_to: string | null;
  /** Reason captured for the reassignment (audit). */
  reassign_reason: string | null;
}

// ---------------------------------------------------------------------------
// Staff notes (operational, not HR)
// ---------------------------------------------------------------------------

export type StaffNoteVisibility = "general" | "manager_only";

export interface StaffNote {
  id: string;
  tenant_id: string;
  staff_id: string;
  author_id: string | null; // staff id, or null for SYSTEM
  text: string;
  visibility: StaffNoteVisibility;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Role presets (editable starting points for custom roles)
// ---------------------------------------------------------------------------

export interface RolePreset {
  id: string;
  name: string;
  description: string;
  /** Permission keys to enable. All others default to false. */
  permissions: string[];
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "preset_csr",
    name: "CSR",
    description:
      "Front-line customer service: customers, reservations, rentals, payments due, tasks. No company financials, banking, or policy management.",
    permissions: [
      "dashboard.view",
      "planner.view",
      "planner.create_reservation",
      "vehicles.view",
      "reservations.view",
      "reservations.create",
      "reservations.edit",
      "reservations.cancel",
      "reservations.record_payment",
      "rentals.view",
      "rentals.start",
      "rentals.return",
      "deposits.view",
      "deposits.collect",
      "payments.view",
      "payments.record",
      "payment_arrangements.view",
      "payment_arrangements.create",
      "customers.view",
      "customers.add",
      "customers.edit",
      "inspections.view",
      "inspections.create",
      "maintenance.view",
      "settings.view",
      "company_settings.view",
      "rental_policies.view",
      "taxes.view",
      "fees.view",
      "tasks.view_own",
      "tasks.view_all",
      "tasks.create",
      "tasks.assign",
      "tasks.edit",
      "tasks.complete",
      "notifications.view_own",
      "staff.view",
      "staff.assign_work",
      "compliance.view",
      "documents.view",
      "documents.upload",
    ],
  },
  {
    id: "preset_fleet_manager",
    name: "Fleet Manager",
    description:
      "Vehicles, maintenance, exchanges, inspections, damage operational details. No company P&L or banking.",
    permissions: [
      "dashboard.view",
      "planner.view",
      "planner.modify_availability",
      "vehicles.view",
      "vehicles.add",
      "vehicles.edit",
      "vehicles.view_documents",
      "vehicles.manage_classes",
      "vehicles.override_pricing",
      "vehicles.view_ownership",
      "reservations.view",
      "rentals.view",
      "rentals.exchange",
      "inspections.view",
      "inspections.create",
      "inspections.confirm_damage",
      "maintenance.view",
      "maintenance.add",
      "maintenance.edit",
      "maintenance.complete",
      "maintenance.assign",
      "maintenance.change_status",
      "maintenance.cancel",
      "maintenance.reopen",
      "maintenance.manage_vendors",
      "maintenance.view_costs",
      "maintenance.edit_costs",
      "maintenance.upload_receipts",
      "maintenance.manage_downtime",
      "settings.view",
      "company_settings.view",
      "rental_policies.view",
      "tasks.view_own",
      "tasks.view_all",
      "tasks.create",
      "tasks.assign",
      "tasks.edit",
      "tasks.complete",
      "notifications.view_own",
      "damage_claims.view",
      "damage_claims.edit",
      "damage_claims.assign",
      "damage_claims.manage_evidence",
      "staff.view",
      "staff.assign_work",
      "compliance.view",
      "compliance.manage",
      "documents.view",
      "documents.upload",
      "documents.review",
      "documents.archive",
    ],
  },
  {
    id: "preset_bookkeeper",
    name: "Bookkeeper",
    description:
      "Payments, expenses, banking, reports. No policy management or staff management.",
    permissions: [
      "dashboard.view",
      "dashboard.view_financials",
      "rentals.view",
      "deposits.view",
      "deposits.apply",
      "deposits.refund",
      "payments.view",
      "payments.record",
      "payments.apply_late_fees",
      "payments.waive_fees",
      "payments.issue_credits",
      "payments.issue_refunds",
      "payments.view_revenue",
      "payment_arrangements.view",
      "payment_arrangements.create",
      "payment_arrangements.modify",
      "customers.view",
      "settings.view",
      "company_settings.view",
      "rental_policies.view",
      "taxes.view",
      "fees.view",
      "fees.assess",
      "expenses.view",
      "expenses.create",
      "expenses.edit_metadata",
      "expenses.view_vehicle_expenses",
      "expenses.view_payment_details",
      "expenses.manage_receipts",
      "expenses.view_reimbursements",
      "expenses.view_petty_cash",
      "expenses.view_costs",
      "banking.view",
      "banking.import",
      "banking.review",
      "banking.match",
      "banking.unmatch",
      "banking.create_expense",
      "banking.mark_transfer",
      "banking.reconcile_statement",
      "banking.view_balances",
      "reports.view_profitability",
      "reports.view_revenue",
      "reports.view_expenses",
      "reports.view_collections",
      "reports.export",
      "reports.view_accounting",
      "reports.view_management_summary",
      "staff.view",
    ],
  },
  {
    id: "preset_damage_coordinator",
    name: "Damage Coordinator",
    description:
      "Claims, evidence, maintenance linkage, assigned tasks. No banking or investor financials.",
    permissions: [
      "dashboard.view",
      "vehicles.view",
      "vehicles.view_documents",
      "rentals.view",
      "reservations.view",
      "customers.view",
      "maintenance.view",
      "maintenance.add",
      "maintenance.edit",
      "maintenance.view_costs",
      "settings.view",
      "company_settings.view",
      "rental_policies.view",
      "tasks.view_own",
      "tasks.view_all",
      "tasks.create",
      "tasks.assign",
      "tasks.edit",
      "tasks.complete",
      "notifications.view_own",
      "damage_claims.view",
      "damage_claims.create",
      "damage_claims.edit",
      "damage_claims.assign",
      "damage_claims.determine_responsibility",
      "damage_claims.view_financials",
      "damage_claims.charge_customer",
      "damage_claims.apply_deposit",
      "damage_claims.manage_insurance",
      "damage_claims.link_expenses",
      "damage_claims.close",
      "damage_claims.manage_evidence",
      "staff.view",
      "staff.assign_work",
    ],
  },
];

// ---------------------------------------------------------------------------
// Assignment defaults (company-level)
// ---------------------------------------------------------------------------

export type AssignmentDefaultKey =
  | "default_csr"
  | "default_fleet_manager"
  | "default_maintenance_coordinator"
  | "default_damage_coordinator"
  | "default_collections_owner";

export const ASSIGNMENT_DEFAULT_LABELS: Record<AssignmentDefaultKey, string> = {
  default_csr: "Default CSR",
  default_fleet_manager: "Default Fleet Manager",
  default_maintenance_coordinator: "Default Maintenance Coordinator",
  default_damage_coordinator: "Default Damage Coordinator",
  default_collections_owner: "Default Collections Owner",
};

export interface AssignmentDefaults {
  default_csr: string | null;
  default_fleet_manager: string | null;
  default_maintenance_coordinator: string | null;
  default_damage_coordinator: string | null;
  default_collections_owner: string | null;
}

export const EMPTY_ASSIGNMENT_DEFAULTS: AssignmentDefaults = {
  default_csr: null,
  default_fleet_manager: null,
  default_maintenance_coordinator: null,
  default_damage_coordinator: null,
  default_collections_owner: null,
};

// Re-export UserStatus for convenience.
export type { UserStatus };
