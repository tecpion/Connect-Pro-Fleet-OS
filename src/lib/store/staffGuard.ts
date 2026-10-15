// Connect Pro Fleet — last-active-Owner domain guard (Build #24 finalization).
//
// The UI (StaffProfile) guards the last active Owner from deactivation, but a
// UI guard is not sufficient domain protection: store.updateStaff /
// updateRole / setUserPermissionOverride can be called directly (tests,
// future backend adapters, other UI paths) and bypass it. This module moves
// the rule into the authoritative staff/role mutation layer so it cannot be
// bypassed regardless of the caller.
//
// Owner identity uses STABLE system-role semantics: a role is the protected
// Owner only when it is the system Owner (is_system && name === "Owner"). A
// custom role merely named "Owner" is NOT treated as the protected system
// Owner. Only ACTIVE staff (status === "active") count toward the
// final-owner requirement — invited/inactive/suspended do not.

import type { Role, Staff, UserStatus } from "../types";

/** Minimal shape the guard needs. Both StoreState and the public FleetStore
 *  satisfy it (both expose `staff` and `roles` arrays). */
export interface StaffGuardStore {
  staff: Staff[];
  roles: Role[];
}

/** A role is the protected system Owner. */
export function isOwnerRole(role: Role | undefined): boolean {
  if (!role) return false;
  return role.is_system && role.name.toLowerCase() === "owner";
}

/** Resolve the role a staff member currently holds. */
export function roleForStaff(
  s: StaffGuardStore,
  staffId: string,
): Role | undefined {
  const st = s.staff.find((x) => x.id === staffId);
  if (!st) return undefined;
  return (
    s.roles.find((r) => r.id === st.role_id) ??
    s.roles.find((r) => r.name === st.role)
  );
}

/** Whether a staff member currently holds the system Owner role. */
export function staffIsOwner(s: StaffGuardStore, staffId: string): boolean {
  return isOwnerRole(roleForStaff(s, staffId));
}

/** Count currently-ACTIVE staff holding the system Owner role. Inactive,
 *  suspended, and non-active invited staff do not count. */
export function activeOwnerCount(s: StaffGuardStore): number {
  return s.staff.filter(
    (st) => (st.status ?? "active") === "active" && staffIsOwner(s, st.id),
  ).length;
}

export interface OwnerGuardResult {
  ok: boolean;
  reason: string | null;
}

/** Evaluate whether a status change on a staff member is permitted. Blocks
 *  deactivation/suspension of the last active Owner. */
export function guardStaffStatus(
  s: StaffGuardStore,
  staffId: string,
  newStatus: UserStatus,
): OwnerGuardResult {
  const inactive = newStatus === "inactive" || newStatus === "suspended";
  if (!inactive) return { ok: true, reason: null };
  if (!staffIsOwner(s, staffId)) return { ok: true, reason: null };
  if (activeOwnerCount(s) <= 1) {
    return {
      ok: false,
      reason: "Cannot deactivate or suspend the last active Owner.",
    };
  }
  return { ok: true, reason: null };
}

/** Evaluate whether a role change on a staff member is permitted. Blocks
 *  moving the last active Owner away from the Owner role. */
export function guardStaffRoleChange(
  s: StaffGuardStore,
  staffId: string,
  newRoleId: string,
): OwnerGuardResult {
  if (!staffIsOwner(s, staffId)) return { ok: true, reason: null };
  const newRole = s.roles.find((r) => r.id === newRoleId);
  // Moving to another Owner role is fine (still an owner).
  if (isOwnerRole(newRole)) return { ok: true, reason: null };
  if (activeOwnerCount(s) <= 1) {
    return {
      ok: false,
      reason: "Cannot change the last active Owner away from the Owner role.",
    };
  }
  return { ok: true, reason: null };
}

/** Evaluate whether a role update (e.g. archiving / editing permissions) is
 *  permitted. Blocks archiving the system Owner role while any active Owner
 *  still holds it. */
export function guardRoleUpdate(
  s: StaffGuardStore,
  roleId: string,
  patch: Partial<Role>,
): OwnerGuardResult {
  const role = s.roles.find((r) => r.id === roleId);
  if (!role) return { ok: true, reason: null };
  // Archiving / deactivating the system Owner role.
  if (patch.active === false && isOwnerRole(role)) {
    const owners = s.staff.filter(
      (st) => st.role_id === roleId && (st.status ?? "active") === "active",
    ).length;
    if (owners > 0) {
      return {
        ok: false,
        reason: "Cannot archive the Owner role while active Owners hold it.",
      };
    }
  }
  return { ok: true, reason: null };
}

/** Evaluate whether a per-user permission override is permitted. Blocks any
 *  override that would strip the last active Owner's effective Owner access
 *  (e.g. turning off a critical owner permission). This is conservative: it
 *  only blocks overrides on the last active Owner. */
export function guardPermissionOverride(
  s: StaffGuardStore,
  staffId: string,
  _key: string,
  _value: boolean,
): OwnerGuardResult {
  if (!staffIsOwner(s, staffId)) return { ok: true, reason: null };
  if (activeOwnerCount(s) > 1) return { ok: true, reason: null };
  // We cannot know which permission is "owner-critical" without a catalog,
  // so we block ALL permission-stripping overrides on the last active Owner
  // (value === false). Turning permissions ON (value === true) is allowed.
  if (_value === false) {
    return {
      ok: false,
      reason:
        "Cannot strip permissions from the last active Owner via override.",
    };
  }
  return { ok: true, reason: null };
}
