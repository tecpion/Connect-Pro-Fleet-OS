// Connect Pro Fleet — settings permission helper (Build #23).
// Resolves the current staff's effective permissions for gating policy UI.

import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";

export function useCan(permission: string): boolean {
  const store = useStore();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const role = currentStaff
    ? (store.roles.find((r) => r.id === currentStaff.role_id) ??
      store.roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const overrides = currentStaff?.permission_overrides ?? null;
  return role ? can(role, overrides, permission) : true;
}
