// Connect Pro Fleet — Staff Workload view (Build #24 enhancement).
//
// Operational workload cards per staff. No financial values surfaced unless the
// viewer has financial permission. No performance/capacity scoring — factual
// counts only. Filters: role, location, responsibility, overdue only, has open
// work, work type. A compact "Review Unassigned Work" link deep-links to the
// authoritative Action Center queue (Staff does NOT duplicate the queue).

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useCan } from "@/pages/settings/useCan";
import {
  staffWorkloadSummary,
  getUnassignedWork,
  type WorkloadInputs,
} from "@/lib/staffSelectors";
import {
  RESPONSIBILITY_LABELS,
  type ResponsibilityTag,
} from "@/lib/staffTypes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Inbox } from "lucide-react";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const WORK_TYPES = ["all", "tasks", "rentals", "WOs", "claims"] as const;
type WorkTypeFilter = (typeof WORK_TYPES)[number];

export function WorkloadView({ inputs }: { inputs: WorkloadInputs }) {
  const store = useStore();
  const canSeeFinancials = useCan("dashboard.view_financials");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [respFilter, setRespFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [hasOpenOnly, setHasOpenOnly] = useState(false);
  const [workType, setWorkType] = useState<WorkTypeFilter>("all");

  const roleNames = useMemo(
    () =>
      Array.from(
        new Set(
          store.staff.map(
            (s) => store.roles.find((r) => r.id === s.role_id)?.name ?? s.role,
          ),
        ),
      ),
    [store.staff, store.roles],
  );

  const unassignedCount = useMemo(
    () => getUnassignedWork(inputs).length,
    [inputs],
  );

  const rows = useMemo(() => {
    return store.staff
      .filter((s) => (s.status ?? "active") === "active")
      .filter((s) => {
        if (roleFilter !== "all") {
          const role = store.roles.find((r) => r.id === s.role_id);
          if ((role?.name ?? s.role) !== roleFilter) return false;
        }
        if (locationFilter !== "all") {
          const locs = s.location_ids ?? [];
          if (locs.length === 0) {
            // "All locations" staff — include only if filter is "all".
            return false;
          }
          if (!locs.includes(locationFilter)) return false;
        }
        if (respFilter !== "all") {
          const tags = (s.responsibilities as ResponsibilityTag[] | null) ?? [];
          if (!tags.includes(respFilter as ResponsibilityTag)) return false;
        }
        return true;
      })
      .map((s) => ({
        staff: s,
        wl: staffWorkloadSummary(inputs, s.id),
      }))
      .filter((r) => {
        if (overdueOnly && r.wl.overdueTasks === 0) return false;
        if (hasOpenOnly && r.wl.hasNoWork) return false;
        if (workType !== "all") {
          const has = r.wl.breakdown.some((b) => b.label === workType);
          if (!has) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          b.wl.overdueTasks - a.wl.overdueTasks ||
          b.wl.totalActiveAssignments - a.wl.totalActiveAssignments,
      );
  }, [
    store.staff,
    store.roles,
    inputs,
    roleFilter,
    locationFilter,
    respFilter,
    overdueOnly,
    hasOpenOnly,
    workType,
  ]);

  return (
    <div className="space-y-4">
      {/* Unassigned work deep-link (authoritative queue lives in Action Center). */}
      {unassignedCount > 0 && (
        <Link
          to="/action-center?focus=needs-assignment"
          className="flex items-center justify-between gap-2 rounded-lg border border-status-maintenance/30 bg-status-maintenance/5 p-3 transition-colors hover:border-status-maintenance/60"
        >
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Inbox size={15} className="text-status-maintenance" />
            {unassignedCount} item{unassignedCount === 1 ? "" : "s"} need
            assignment
          </span>
          <span className="text-xs font-medium text-primary">
            Review Unassigned Work →
          </span>
        </Link>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All roles</option>
          {roleNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All locations</option>
          {store.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          value={respFilter}
          onChange={(e) => setRespFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All responsibilities</option>
          {(Object.keys(RESPONSIBILITY_LABELS) as ResponsibilityTag[]).map(
            (t) => (
              <option key={t} value={t}>
                {RESPONSIBILITY_LABELS[t]}
              </option>
            ),
          )}
        </select>
        <select
          value={workType}
          onChange={(e) => setWorkType(e.target.value as WorkTypeFilter)}
          className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {WORK_TYPES.map((w) => (
            <option key={w} value={w}>
              {w === "all" ? "All work types" : w}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Overdue only
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={hasOpenOnly}
            onChange={(e) => setHasOpenOnly(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Has open work
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ staff, wl }) => {
          const showOpen = wl.openTasks > 0;
          const showDueToday = wl.dueTodayTasks > 0;
          const showOverdue = wl.overdueTasks > 0;
          const showUrgent = wl.urgentTasks > 0;
          return (
            <div
              key={staff.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                    {initials(staff.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {staff.full_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {store.roles.find((r) => r.id === staff.role_id)?.name ??
                      staff.role}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {showOpen && (
                  <Badge variant="outline" className="text-[11px]">
                    Open: {wl.openTasks}
                  </Badge>
                )}
                {showDueToday && (
                  <Badge
                    variant="outline"
                    className="border-status-maintenance/40 text-[11px] text-status-maintenance"
                  >
                    Due Today: {wl.dueTodayTasks}
                  </Badge>
                )}
                {showOverdue && (
                  <Badge
                    variant="outline"
                    className="border-status-out/40 text-[11px] text-status-out"
                  >
                    Overdue: {wl.overdueTasks}
                  </Badge>
                )}
                {showUrgent && (
                  <Badge
                    variant="outline"
                    className="border-status-out/40 text-[11px] text-status-out"
                  >
                    Urgent: {wl.urgentTasks}
                  </Badge>
                )}
                {!showOpen && !showDueToday && !showOverdue && !showUrgent && (
                  <span className="text-xs text-muted-foreground">
                    No open work
                  </span>
                )}
              </div>
              {wl.breakdown.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {wl.breakdown.map((b) => `${b.count} ${b.label}`).join(" · ")}
                </p>
              )}
              {canSeeFinancials && wl.lateAccounts > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {wl.lateAccounts} late account
                  {wl.lateAccounts > 1 ? "s" : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No staff match.
        </p>
      )}
    </div>
  );
}
