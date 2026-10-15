// Connect Pro Fleet — assignment eligibility & transparent suggestions.
//
// The Staff workspace must recommend assignees based on AUTHORITY (status,
// permission, location) — not an opaque score — and may RANK by
// responsibility. Responsibilities never grant access; they only help
// organize/suggest work routing. This module is a pure selector layer over
// the existing staff/role/permission/assignment domain: it creates NO new
// assignment records and never auto-assigns.
//
// Eligibility model (all must hold):
//   1. Staff status = Active
//   2. Staff has the relevant module permission (via role + overrides)
//   3. Staff has location access to the work's location (or All Locations)
//   4. (soft) Staff has the configured responsibility tag — boosts ranking
//      only, never gates eligibility on its own unless `requireResponsibility`.
//
// The suggestion is explainable: each candidate carries a list of human-
// readable reasons so the UI can show WHY someone is suggested.

import type { Role, Staff } from "./types";
import type { Location } from "./types";
import type {
  OperationalStaffAssignment,
  ResponsibilityTag,
} from "./staffTypes";
import { RESPONSIBILITY_LABELS } from "./staffTypes";
import type { ActivityTone } from "./staffActivityMeta";

export interface AssignmentEligibilityInput {
  staff: Staff[];
  roles: Role[];
  locations: Location[];
  assignments: OperationalStaffAssignment[];
  /** The current viewer (used to avoid suggesting oneself where inappropriate
   *  — not a hard gate). */
  currentStaffId?: string | null;
}

export type WorkDomain =
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

/** The permission key required to act on a work domain. */
export const DOMAIN_PERMISSION: Record<WorkDomain, string> = {
  rental: "rentals.view",
  customer: "customers.view",
  vehicle: "vehicles.view",
  work_order: "maintenance.view",
  damage_claim: "damage_claims.view",
  banking: "banking.view",
  investor: "investors.view",
  expense: "expenses.view",
  violation: "vehicles.view",
  compliance: "compliance.view",
  general: "tasks.view_own",
};

/** The responsibility tag most associated with a work domain (for ranking). */
export const DOMAIN_RESPONSIBILITY: Record<
  WorkDomain,
  ResponsibilityTag | null
> = {
  rental: "customer_service",
  customer: "customer_service",
  vehicle: "fleet_operations",
  work_order: "maintenance",
  damage_claim: "damage_claims",
  banking: "banking",
  investor: "investor_relations",
  expense: "expenses",
  violation: "tickets_violations",
  compliance: "fleet_operations",
  general: "admin",
};

export interface EligibleAssignee {
  staffId: string;
  staffName: string;
  roleName: string;
  /** Human-readable, transparent reasons this person is eligible/suggested. */
  reasons: string[];
  /** Whether the staff has the matching responsibility tag (ranking signal). */
  hasResponsibility: boolean;
  /** Count of currently-active assignments for this staff (ranking signal). */
  openWorkCount: number;
  /** Active status used for display. */
  status: string;
}

function staffHasPermission(
  staff: Staff,
  roles: Role[],
  permission: string,
): boolean {
  const role = roles.find((r) => r.id === staff.role_id);
  const base = role?.permissions ?? {};
  const overrides =
    (staff.permission_overrides as Record<string, boolean> | null) ?? null;
  if (overrides && typeof overrides[permission] === "boolean") {
    return overrides[permission];
  }
  return !!base[permission];
}

function staffHasLocation(
  staff: Staff,
  locations: Location[],
  locationId: string | null | undefined,
): boolean {
  // No location on the work item => no location gate.
  if (!locationId) return true;
  const locs = staff.location_ids ?? [];
  // Empty location_ids means All Locations.
  if (locs.length === 0) return true;
  return locs.includes(locationId);
}

function openWorkForStaff(
  assignments: OperationalStaffAssignment[],
  staffId: string,
): number {
  return assignments.filter(
    (a) => a.staff_id === staffId && a.status === "active",
  ).length;
}

/**
 * Returns eligible assignees for a work item, ranked by transparent signals:
 * matching responsibility (first), then fewer open work items, then name.
 * Responsibilities NEVER grant access — they only affect ranking.
 */
export function suggestAssignees(
  input: AssignmentEligibilityInput,
  work: {
    domain: WorkDomain;
    /** Required permission override. Defaults to DOMAIN_PERMISSION[domain]. */
    permission?: string;
    locationId?: string | null;
    /** If true, staff must have the matching responsibility tag to qualify. */
    requireResponsibility?: boolean;
    /** Limit results. */
    limit?: number;
  },
): EligibleAssignee[] {
  const { staff, roles, locations, assignments } = input;
  const permission = work.permission ?? DOMAIN_PERMISSION[work.domain];
  const expectedResp = DOMAIN_RESPONSIBILITY[work.domain];

  const candidates = staff
    .filter((s) => (s.status ?? "active") === "active")
    .filter((s) => staffHasPermission(s, roles, permission))
    .filter((s) => staffHasLocation(s, locations, work.locationId))
    .map((s): EligibleAssignee | null => {
      const tags = (s.responsibilities as ResponsibilityTag[] | null) ?? [];
      const hasResp = expectedResp ? tags.includes(expectedResp) : false;
      if (work.requireResponsibility && expectedResp && !hasResp) {
        return null;
      }
      const role = roles.find((r) => r.id === s.role_id);
      const reasons: string[] = [];
      reasons.push(`${responsibilityOrRoleNote(hasResp, expectedResp)}`);
      reasons.push(locationLabel(s, locations, work.locationId));
      const open = openWorkForStaff(assignments, s.id);
      reasons.push(
        open === 0
          ? "0 active assignments"
          : `${open} active assignment${open === 1 ? "" : "s"}`,
      );
      return {
        staffId: s.id,
        staffName: s.full_name,
        roleName: role?.name ?? s.role,
        reasons,
        hasResponsibility: hasResp,
        openWorkCount: open,
        status: s.status ?? "active",
      };
    })
    .filter((c): c is EligibleAssignee => c !== null)
    .sort((a, b) => {
      // Responsibility match first, then fewer open items, then name.
      if (a.hasResponsibility !== b.hasResponsibility)
        return a.hasResponsibility ? -1 : 1;
      if (a.openWorkCount !== b.openWorkCount)
        return a.openWorkCount - b.openWorkCount;
      return a.staffName.localeCompare(b.staffName);
    });

  const limit = work.limit ?? candidates.length;
  return candidates.slice(0, limit);
}

function responsibilityOrRoleNote(
  hasResp: boolean,
  expected: ResponsibilityTag | null,
): string {
  if (expected && hasResp)
    return `${RESPONSIBILITY_LABELS[expected]} responsibility`;
  return "Has required access";
}

function locationLabel(
  staff: Staff,
  locations: Location[],
  locationId: string | null | undefined,
): string {
  if (!locationId) return "Any location";
  const locs = staff.location_ids ?? [];
  if (locs.length === 0) return "All locations access";
  const name = locations.find((l) => l.id === locationId)?.name ?? "location";
  return `${name} access`;
}

/** Whether a single staff member is eligible for a work item. */
export function isEligibleAssignee(
  input: AssignmentEligibilityInput,
  staffId: string,
  work: {
    domain: WorkDomain;
    permission?: string;
    locationId?: string | null;
    requireResponsibility?: boolean;
  },
): boolean {
  return suggestAssignees(input, work).some((c) => c.staffId === staffId);
}

// Re-export tone for callers that also render activity badges.
export type { ActivityTone };
