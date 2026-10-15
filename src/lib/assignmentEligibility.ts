// Connect Pro Fleet — assignment eligibility + suggestions (Build #24 enhancement).
//
// Transparent, explainable assignment eligibility that combines the four real
// signals from the spec:
//   1. Staff status = Active
//   2. Relevant module permission (role + overrides)
//   3. Relevant location access
//   4. Relevant responsibility where configured
//
// Responsibilities do NOT grant permissions. A staff member with the
// "Banking" responsibility but no banking permission still CANNOT access
// banking — they are filtered out by the permission check. Responsibilities
// only rank/recommend eligible staff (suggestions), never grant access.
//
// No opaque workload score. No automatic hidden assignment.

import type { Role, Staff } from "@/lib/types";
import { effectivePermissions, PERMISSION_CATALOG } from "@/lib/permissions";
import type {
  OperationalAssignmentType,
  ResponsibilityTag,
} from "@/lib/staffTypes";
import { RESPONSIBILITY_LABELS } from "@/lib/staffTypes";

/** Map an assignment type to the permission module that governs it. */
const ASSIGNMENT_MODULE: Partial<Record<OperationalAssignmentType, string>> = {
  // Rental
  rental_account_owner: "Rentals",
  rental_csr: "Rentals",
  rental_collections_owner: "Payment Arrangements",
  rental_checkout_staff: "Rentals",
  rental_return_staff: "Rentals",
  // Customer
  customer_account_owner: "Customers",
  customer_csr: "Customers",
  // Vehicle
  vehicle_fleet_manager: "Vehicles",
  vehicle_maintenance_coordinator: "Maintenance",
  vehicle_porter: "Vehicles",
  // Maintenance
  work_order_coordinator: "Maintenance",
  work_order_assigned_staff: "Maintenance",
  // Damage claim
  damage_claim_owner: "Damage Claims",
  damage_adjuster: "Damage Claims",
  damage_repair_coordinator: "Damage Claims",
  // Banking
  banking_transaction_review: "Banking",
  banking_reconciliation: "Banking",
  banking_statement_import: "Banking",
  // Investor
  investor_manager: "Investor & Partner Management",
  investor_settlement_reviewer: "Investor & Partner Management",
  // Expense
  expense_submitted_by: "Expenses",
  expense_reviewed_by: "Expenses",
  expense_approved_by: "Expenses",
  // Violations
  violation_owner: "Violations",
  violation_review_coordinator: "Violations",
  // Documents & Compliance
  compliance_owner: "Compliance",
  document_reviewer: "Documents",
  // General
  general_owner: "Tasks",
};

/** Map an assignment type to a relevant responsibility (for ranking only). */
const ASSIGNMENT_RESPONSIBILITY: Partial<
  Record<OperationalAssignmentType, ResponsibilityTag>
> = {
  rental_csr: "customer_service",
  rental_account_owner: "customer_service",
  rental_collections_owner: "collections",
  customer_account_owner: "customer_service",
  customer_csr: "customer_service",
  vehicle_fleet_manager: "fleet_operations",
  vehicle_maintenance_coordinator: "maintenance",
  work_order_coordinator: "maintenance",
  work_order_assigned_staff: "maintenance",
  damage_claim_owner: "damage_claims",
  damage_adjuster: "damage_claims",
  damage_repair_coordinator: "damage_claims",
  banking_transaction_review: "banking",
  banking_reconciliation: "banking",
  investor_manager: "investor_relations",
  investor_settlement_reviewer: "investor_relations",
  expense_submitted_by: "expenses",
  expense_reviewed_by: "expenses",
  expense_approved_by: "expenses",
  violation_owner: "tickets_violations",
  violation_review_coordinator: "tickets_violations",
  compliance_owner: "fleet_operations",
  document_reviewer: "fleet_operations",
};

export interface AssignmentEligibility {
  staffId: string;
  eligible: boolean;
  reasons: string[];
}

/** Whether a staff member can be assigned a given assignment type for a
 *  potentially location-scoped entity. Returns transparent reasons. */
export function assignmentEligibility(args: {
  staff: Staff;
  role: Role | undefined;
  assignmentType: OperationalAssignmentType;
  /** Entity location id, if known. null/undefined = no location restriction. */
  entityLocationId?: string | null;
}): AssignmentEligibility {
  const { staff, role, assignmentType, entityLocationId } = args;
  const reasons: string[] = [];
  const status = staff.status ?? "active";

  // 1. Status — only active staff are assignable.
  if (status !== "active") {
    return {
      staffId: staff.id,
      eligible: false,
      reasons: [`Inactive (${status}) — only active staff can be assigned`],
    };
  }
  reasons.push("Active");

  // 2. Permission (module) — checked against the authoritative permission catalog.
  const module = ASSIGNMENT_MODULE[assignmentType];
  if (module) {
    const perms = effectivePermissions(role, staff.permission_overrides);
    const modulePerms = PERMISSION_CATALOG.filter((p) => p.module === module);
    const ok = modulePerms.some((p) => perms[p.key]);
    if (!ok) {
      return {
        staffId: staff.id,
        eligible: false,
        reasons: [`No ${module} permission`],
      };
    }
    reasons.push(`Has ${module} permission`);
  }

  // 3. Location access — a location-scoped staff member must cover the entity's location.
  if (entityLocationId) {
    const locs = staff.location_ids ?? [];
    if (locs.length > 0 && !locs.includes(entityLocationId)) {
      return {
        staffId: staff.id,
        eligible: false,
        reasons: ["No access to that location"],
      };
    }
    reasons.push("Has location access");
  }

  return { staffId: staff.id, eligible: true, reasons };
}

export interface AssignmentSuggestion extends AssignmentEligibility {
  staff: Staff;
  /** True when the staff member has the relevant responsibility tag. */
  hasResponsibility: boolean;
  /** Current open-work count for ranking transparency. */
  openWorkCount: number;
}

/** Rank eligible staff into transparent suggestions. Eligible first, then by
 *  responsibility match, then by lowest open work. Never auto-assigns. */
export function suggestAssignees(args: {
  staff: Staff[];
  roles: Role[];
  assignmentType: OperationalAssignmentType;
  entityLocationId?: string | null;
  /** openWorkCount(staffId) -> number */
  openWorkCount: (staffId: string) => number;
}): AssignmentSuggestion[] {
  const { staff, roles, assignmentType, entityLocationId, openWorkCount } =
    args;
  const respTag = ASSIGNMENT_RESPONSIBILITY[assignmentType];
  const out: AssignmentSuggestion[] = [];
  for (const s of staff) {
    const role = roles.find((r) => r.id === s.role_id);
    const elig = assignmentEligibility({
      staff: s,
      role,
      assignmentType,
      entityLocationId,
    });
    if (!elig.eligible) continue;
    const tags = (s.responsibilities as ResponsibilityTag[] | null) ?? [];
    const hasResp = respTag ? tags.includes(respTag) : false;
    out.push({
      ...elig,
      staff: s,
      hasResponsibility: hasResp,
      openWorkCount: openWorkCount(s.id),
    });
  }
  out.sort(
    (a, b) =>
      Number(b.hasResponsibility) - Number(a.hasResponsibility) ||
      a.openWorkCount - b.openWorkCount,
  );
  return out;
}

/** Build a human-readable suggestion reason line for a suggestion. */
export function suggestionReason(s: AssignmentSuggestion): string {
  const parts: string[] = [];
  if (s.hasResponsibility) {
    const tag = (s.staff.responsibilities as ResponsibilityTag[] | null) ?? [];
    const label = tag.map((t) => RESPONSIBILITY_LABELS[t]).find(Boolean);
    if (label) parts.push(`${label} responsibility`);
  }
  parts.push(
    `${s.openWorkCount} open work item${s.openWorkCount === 1 ? "" : "s"}`,
  );
  return parts.join(" · ");
}

export { ASSIGNMENT_MODULE, ASSIGNMENT_RESPONSIBILITY };
