// Connect Pro Fleet — Staff Profile shared helpers (Build #24 enhancement).
// Small pure helpers reused across the four profile sections so each section
// file stays focused and under the line limit.

import { PERMISSION_CATALOG, effectivePermissions } from "@/lib/permissions";
import { PERMISSION_MODULES } from "@/lib/permissions";
import type { Role, Staff } from "@/lib/types";
import type { ResponsibilityTag } from "@/lib/staffTypes";
import { RESPONSIBILITY_LABELS } from "@/lib/staffTypes";

export type ProfileSection = "overview" | "work" | "access" | "activity";

export const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  invited: "bg-blue-500/15 text-blue-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-amber-500/15 text-amber-600",
};

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function locationNamesFor(
  staff: Staff,
  locations: { id: string; name: string }[],
): string[] {
  return (staff.location_ids ?? [])
    .map((id) => locations.find((l) => l.id === id)?.name)
    .filter(Boolean) as string[];
}

export function responsibilitiesFor(staff: Staff): ResponsibilityTag[] {
  return (staff.responsibilities as ResponsibilityTag[] | null) ?? [];
}

export function responsibilityLabels(staff: Staff): string[] {
  return responsibilitiesFor(staff).map((t) => RESPONSIBILITY_LABELS[t]);
}

/** Enabled permission definitions for a staff member (role + overrides). */
export function enabledPermsFor(role: Role | undefined, staff: Staff) {
  const perms = effectivePermissions(role, staff.permission_overrides);
  return PERMISSION_CATALOG.filter((p) => perms[p.key]);
}

/** Per-module access summary: module name + whether the role has any perm. */
export function moduleAccessMap(
  enabled: ReturnType<typeof enabledPermsFor>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of enabled) map.set(p.module, (map.get(p.module) ?? 0) + 1);
  return map;
}

export { PERMISSION_MODULES };
