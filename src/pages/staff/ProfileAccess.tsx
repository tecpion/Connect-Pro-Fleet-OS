// Connect Pro Fleet — Staff Profile > Access section (Build #24 enhancement).
// Role = Access. Shows role, location scope, a per-module permission summary
// (Access / No access), and responsibilities clearly labeled as routing-only.
// Effective Access = Role Permissions AND Location Scope.

import type { Role } from "@/lib/types";
import type { ResponsibilityTag } from "@/lib/staffTypes";
import { RESPONSIBILITY_LABELS } from "@/lib/staffTypes";
import { Badge } from "@/components/ui/badge";
import {
  enabledPermsFor,
  moduleAccessMap,
  PERMISSION_MODULES,
} from "./profileHelpers";
import type { Staff } from "@/lib/types";

export function ProfileAccess({
  staff,
  role,
  locationNames,
  responsibilities,
}: {
  staff: Staff;
  role: Role | undefined;
  locationNames: string[];
  responsibilities: ResponsibilityTag[];
}) {
  const enabled = enabledPermsFor(role, staff);
  const moduleMap = moduleAccessMap(enabled);
  const modulesWithAccess = new Set(moduleMap.keys());

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Role
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {role?.name ?? "—"}
          {role?.is_system ? " (system)" : ""}
          {role?.is_protected ? " · protected" : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Role controls what this staff member is allowed to view and do.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Location Scope
        </p>
        <p className="mt-2 text-sm text-foreground">
          {locationNames.length ? locationNames.join(", ") : "All locations"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Effective access = Role Permissions AND Location Scope.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Permission Summary
        </p>
        <div className="mt-2 space-y-1">
          {PERMISSION_MODULES.map((mod) => {
            const has = modulesWithAccess.has(mod);
            return (
              <div
                key={mod}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-foreground">{mod}</span>
                <span
                  className={
                    has ? "text-status-maintenance" : "text-muted-foreground"
                  }
                >
                  {has ? "Access" : "No access"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {enabled.length} permissions enabled across {moduleMap.size} areas.
        </p>
      </div>

      {responsibilities.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Responsibilities (work routing)
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {responsibilities.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px]">
                {RESPONSIBILITY_LABELS[tag]}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Responsibilities do not grant access. They only help organize and
            suggest work assignments.
          </p>
        </div>
      )}
    </div>
  );
}
