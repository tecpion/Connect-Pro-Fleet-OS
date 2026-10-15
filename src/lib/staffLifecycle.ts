// Connect Pro Fleet — staff lifecycle methods (Build #24).
//
// Owner detection + last-active-Owner guard, status changes, role changes,
// location assignment, and role archiving. These coordinate with the
// operational-assignment store (for open-assignment counts) but mutate staff
// records through the core store's public API (updateStaff / updateRole /
// logSettingsChange). The authoritative last-Owner guard now lives in
// staffGuard.ts and is enforced inside updateStaff / updateRole themselves, so
// these methods are defense-in-depth on top of the authoritative layer.
//
// Extracted from staffAssignmentStore.tsx to keep that file focused.

import type { Staff, Role, UserStatus } from "./types";
import type { FleetStore } from "./store/storeContext";
import type { OperationalStaffAssignment } from "./staffTypes";
import {
  staffIsOwner as staffIsOwnerG,
  activeOwnerCount as activeOwnerCountG,
  guardStaffStatus,
  guardStaffRoleChange,
  guardRoleUpdate,
} from "./store/staffGuard";

export interface StaffLifecycleContext {
  store: FleetStore;
  /** Always-current snapshot of operational assignments (a ref). */
  assignmentsRef: { current: OperationalStaffAssignment[] };
  /** Append a label to the activity log. */
  logActivity: (
    label: string,
    tone?: "neutral" | "available" | "maintenance" | "out",
  ) => void;
}

// Re-exported for consumers that resolve owner status from the public store.
export const staffIsOwner = staffIsOwnerG;
export const activeOwnerCount = activeOwnerCountG;

function openAssignmentCount(
  ctx: StaffLifecycleContext,
  staffId: string,
): number {
  return ctx.assignmentsRef.current.filter(
    (a) => a.staff_id === staffId && a.status === "active",
  ).length;
}

export function buildStaffLifecycleMethods(ctx: StaffLifecycleContext) {
  const { store, logActivity } = ctx;

  return {
    deactivationGuard(staffId: string) {
      const owners = activeOwnerCountG(store);
      const open = openAssignmentCount(ctx, staffId);
      const isOwner = staffIsOwnerG(store, staffId);
      if (isOwner && owners <= 1) {
        return {
          canDeactivate: false,
          reason: "Cannot deactivate the last active Owner.",
          remainingOwners: 0,
          openAssignments: open,
        };
      }
      return {
        canDeactivate: true,
        reason: null,
        remainingOwners: isOwner ? owners - 1 : owners,
        openAssignments: open,
      };
    },

    setStaffStatus(staffId: string, status: UserStatus): boolean {
      // Defense-in-depth: the authoritative guard also runs inside
      // store.updateStaff. We check here first so we can return a clear
      // boolean and skip the audit/activity emission on refusal.
      const guard = guardStaffStatus(store, staffId, status);
      const inactive = status === "inactive" || status === "suspended";
      if (inactive && !guard.ok) return false;
      const st = store.staff.find((x) => x.id === staffId);
      if (!st) return false;
      const oldStatus = st.status ?? "active";
      // updateStaff applies the authoritative guard again (safe).
      store.updateStaff(staffId, { status });
      // If the authoritative layer refused, surface that as a failure.
      const after = store.staff.find((x) => x.id === staffId);
      if (after?.status !== status) return false;
      const label = status.charAt(0).toUpperCase() + status.slice(1);
      store.logSettingsChange({
        action: "Staff status changed",
        detail: `${st.full_name}: ${oldStatus} → ${status}`,
        old_value: oldStatus,
        new_value: status,
      });
      logActivity(
        `${st.full_name} status set to ${label}`,
        status === "active" ? "available" : "out",
      );
      return true;
    },

    changeStaffRole(staffId: string, roleId: string): void {
      const role = store.roles.find((r) => r.id === roleId);
      const st = store.staff.find((x) => x.id === staffId);
      if (!role || !st) return;
      // Defense-in-depth: the authoritative guard also runs inside
      // store.updateStaff (role_id branch). Refuse here for a clear no-op.
      const guard = guardStaffRoleChange(store, staffId, roleId);
      if (!guard.ok) return;
      const oldRole =
        store.roles.find((r) => r.id === st.role_id)?.name ?? st.role;
      store.updateStaff(staffId, {
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
      });
      store.logSettingsChange({
        action: "Staff role changed",
        detail: `${st.full_name}: ${oldRole} → ${role.name}`,
        old_value: oldRole,
        new_value: role.name,
      });
      logActivity(
        `${st.full_name} role changed: ${oldRole} → ${role.name}`,
        "neutral",
      );
    },

    setStaffLocations(staffId: string, locationIds: string[]): void {
      store.updateStaff(staffId, { location_ids: locationIds });
    },

    archiveRole(roleId: string): { ok: boolean; reason: string | null } {
      const role = store.roles.find((r) => r.id === roleId);
      if (!role) return { ok: false, reason: "Role not found." };
      if (role.is_system || role.is_protected)
        return { ok: false, reason: "System roles cannot be archived." };
      const inUse = store.staff.filter(
        (st) => st.role_id === roleId && (st.status ?? "active") === "active",
      ).length;
      if (inUse > 0)
        return {
          ok: false,
          reason: `${inUse} active staff still use this role. Reassign them first.`,
        };
      // Authoritative guard runs inside updateRole too; check here for clarity.
      const guard = guardRoleUpdate(store, roleId, { active: false });
      if (!guard.ok) return guard;
      store.updateRole(roleId, { active: false });
      store.logSettingsChange({
        action: "Role archived",
        detail: role.name,
        old_value: "active",
        new_value: "archived",
      });
      return { ok: true, reason: null };
    },
  };
}

// Silence unused-import lint for re-exported type helpers kept for clarity.
export type { Role };
