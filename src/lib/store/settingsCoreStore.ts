// Connect Pro Fleet — settings core methods (Build #5): company, locations,
// roles, staff permission overrides, appearance, audit.
//
// Build #24 finalization: updateRole + setUserPermissionOverride now enforce
// the last-active-Owner guard at the authoritative mutation layer. A direct
// call that would archive the Owner role while active Owners hold it, or strip
// permissions from the last active Owner, is refused (silent no-op).

import type {
  CompanyInfo,
  Location,
  Role,
  Staff,
  ThemePreference,
} from "../types";
import { SYSTEM_ROLE_PERMISSIONS } from "../permissions";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { guardRoleUpdate, guardPermissionOverride } from "./staffGuard";

export function buildSettingsCoreMethods(s: StoreState) {
  return {
    updateCompanyInfo: (patch: Partial<CompanyInfo>) =>
      s.setCompanyInfo((c) => ({ ...c, ...patch })),

    addLocation: (loc: Location) => s.setLocations((ls) => [...ls, loc]),
    updateLocation: (id: string, patch: Partial<Location>) =>
      s.setLocations((ls) =>
        ls.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      ),
    setDefaultLocation: (id: string) =>
      s.setLocations((ls) =>
        ls.map((l) => ({ ...l, is_default: l.id === id })),
      ),

    addRole: (r: Role) => s.setRoles((rs) => [...rs, r]),
    updateRole: (id: string, patch: Partial<Role>) => {
      // Authoritative guard: refuse to archive/deactivate the system Owner
      // role while active Owners still hold it.
      const guard = guardRoleUpdate(s, id, patch);
      if (!guard.ok) return;
      s.setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    duplicateRole: (id: string): string | null => {
      const src = s.roles.find((r) => r.id === id);
      if (!src) return null;
      const newId = uid("role");
      const copy: Role = {
        ...src,
        id: newId,
        name: `${src.name} (Copy)`,
        is_system: false,
        is_protected: false,
        permissions: { ...src.permissions },
        created_at: new Date().toISOString(),
      };
      s.setRoles((rs) => [...rs, copy]);
      return newId;
    },
    setUserPermissionOverride: (
      staffId: string,
      key: string,
      value: boolean,
    ) => {
      // Authoritative guard: refuse to strip permissions from the last active
      // Owner via a per-user override.
      const guard = guardPermissionOverride(s, staffId, key, value);
      if (!guard.ok) return;
      s.setStaff((ss) =>
        ss.map((st) => {
          if (st.id !== staffId) return st;
          const overrides: Record<string, boolean> = {
            ...((st.permission_overrides as Record<string, boolean>) ?? {}),
            [key]: value,
          };
          return { ...st, permission_overrides: overrides };
        }),
      );
    },
    clearUserPermissionOverride: (staffId: string, key: string) =>
      s.setStaff((ss) =>
        ss.map((st) => {
          if (st.id !== staffId) return st;
          const { [key]: _omit, ...rest } =
            (st.permission_overrides as Record<string, boolean>) ?? {};
          return { ...st, permission_overrides: rest };
        }),
      ),

    setUserTheme: (staffId: string, theme: ThemePreference) =>
      s.setStaff((ss) =>
        ss.map((st) => (st.id === staffId ? { ...st, theme } : st)),
      ),

    setUserBrandColor: (staffId: string, color: string | null) =>
      s.setStaff((ss) =>
        ss.map((st) =>
          st.id === staffId ? { ...st, brand_color: color } : st,
        ),
      ),

    logSettingsChange: (input: {
      action: string;
      detail?: string;
      old_value?: string | null;
      new_value?: string | null;
    }) => {
      const entry = {
        id: uid("aud"),
        tenant_id: TENANT_ID,
        at: new Date().toISOString(),
        actor_id: s.currentStaffId,
        action: input.action,
        detail: input.detail ?? null,
        old_value: input.old_value ?? null,
        new_value: input.new_value ?? null,
      };
      s.setSettingsAudit((a) => [entry, ...a].slice(0, 100));
    },
  };
}

// Re-export so consumers can resolve effective permissions without importing
// permissions.ts separately.
export { SYSTEM_ROLE_PERMISSIONS };
