// Connect Pro Fleet — permissions public API (Build #5+).
//
// The permission catalog + system role defaults were extracted into
// permissionCatalog.ts and rolePermissions.ts to keep each file under the line
// limit and to break a circular import. This file re-exports them and provides
// the `effectivePermissions` / `can` resolution helpers used across the app.

import type { PermissionDef, Role } from "./types";

export { PERMISSION_CATALOG } from "./permissionCatalog";
export { EXPENSE_PERMISSIONS } from "./expensePermissions";
export { SYSTEM_ROLE_PERMISSIONS } from "./rolePermissions";

import { PERMISSION_CATALOG } from "./permissionCatalog";
import { SYSTEM_ROLE_PERMISSIONS } from "./rolePermissions";

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export const PERMISSION_MODULES = Array.from(
  new Set(PERMISSION_CATALOG.map((p) => p.module)),
);

export function permissionsForModule(module: string): PermissionDef[] {
  return PERMISSION_CATALOG.filter((p) => p.module === module);
}

// Resolve the effective permission map for a staff member: start from the
// role's permissions, then apply per-user overrides (which can turn a
// permission on or off).
export function effectivePermissions(
  role: Role | undefined,
  overrides: Record<string, unknown> | null,
): Record<string, boolean> {
  const base: Record<string, boolean> = role
    ? { ...role.permissions }
    : { ...SYSTEM_ROLE_PERMISSIONS.user };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

export function can(
  role: Role | undefined,
  overrides: Record<string, unknown> | null,
  key: string,
): boolean {
  return !!effectivePermissions(role, overrides)[key];
}
