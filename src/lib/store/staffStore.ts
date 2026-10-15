// Connect Pro Fleet — staff management methods (Build #24).
//
// StoreState-based wrapper around the last-active-Owner guard + staff lifecycle
// operations. The authoritative guard logic lives in staffGuard.ts (shared with
// the public FleetStore via staffLifecycle.ts) so there is a single source of
// truth for owner detection. NOTE: the public store currently exposes these
// lifecycle methods through staffLifecycle.ts (StaffAssignmentProvider); this
// module is kept for StoreState-based callers/tests and stays in sync via the
// shared guard.

import type { Role, Staff, UserStatus } from "../types";
import type { StoreState } from "./storeState";
import {
  isOwnerRole,
  staffIsOwner,
  activeOwnerCount,
  guardStaffStatus,
  guardStaffRoleChange,
  guardRoleUpdate,
  type StaffGuardStore,
} from "./staffGuard";

export type { StaffGuardStore };
export { isOwnerRole, staffIsOwner, activeOwnerCount };

export interface StaffDeactivationGuard {
  canDeactivate: boolean;
  reason: string | null;
  /** Count of active owners remaining if this owner were deactivated. */
  remainingOwners: number;
}

export function buildStaffMethods(s: StoreState) {
  return {
    deactivationGuard(staffId: string): StaffDeactivationGuard {
      const owners = activeOwnerCount(s);
      if (staffIsOwner(s, staffId) && owners <= 1) {
        return {
          canDeactivate: false,
          reason: "Cannot deactivate the last active Owner.",
          remainingOwners: 0,
        };
      }
      return {
        canDeactivate: true,
        reason: null,
        remainingOwners: staffIsOwner(s, staffId) ? owners - 1 : owners,
      };
    },

    setStaffStatus(staffId: string, status: UserStatus): boolean {
      const guard = guardStaffStatus(s, staffId, status);
      const inactive = status === "inactive" || status === "suspended";
      if (inactive && !guard.ok) return false;
      const st = s.staff.find((x) => x.id === staffId);
      if (!st) return false;
      s.setStaff((arr) =>
        arr.map((x) => (x.id === staffId ? { ...x, status } : x)),
      );
      return true;
    },

    changeStaffRole(staffId: string, roleId: string): void {
      const role = s.roles.find((r) => r.id === roleId);
      if (!role) return;
      const guard = guardStaffRoleChange(s, staffId, roleId);
      if (!guard.ok) return;
      s.setStaff((arr) =>
        arr.map((x) =>
          x.id === staffId
            ? {
                ...x,
                role_id: roleId,
                role: role.is_system
                  ? (role.name.toLowerCase() as Staff["role"])
                  : "custom",
                display_role: role.is_system
                  ? ((role.name.toLowerCase() === "owner"
                      ? "owner"
                      : role.name.toLowerCase() === "manager"
                        ? "manager"
                        : role.name.toLowerCase() === "user"
                          ? "user"
                          : "custom") as Staff["display_role"])
                  : "custom",
              }
            : x,
        ),
      );
    },

    setStaffLocations(staffId: string, locationIds: string[]): void {
      s.setStaff((arr) =>
        arr.map((x) =>
          x.id === staffId ? { ...x, location_ids: locationIds } : x,
        ),
      );
    },

    archiveRole(roleId: string): { ok: boolean; reason: string | null } {
      const role = s.roles.find((r) => r.id === roleId);
      if (!role) return { ok: false, reason: "Role not found." };
      if (role.is_system || role.is_protected)
        return { ok: false, reason: "System roles cannot be archived." };
      const inUse = s.staff.filter(
        (st) => st.role_id === roleId && (st.status ?? "active") === "active",
      ).length;
      if (inUse > 0)
        return {
          ok: false,
          reason: `${inUse} active staff still use this role. Reassign them first.`,
        };
      const guard = guardRoleUpdate(s, roleId, { active: false });
      if (!guard.ok) return guard;
      s.setRoles((rs) =>
        rs.map((r) => (r.id === roleId ? { ...r, active: false } : r)),
      );
      return { ok: true, reason: null };
    },
  };
}

export type StaffMethods = ReturnType<typeof buildStaffMethods>;
export type { Role };
