// Connect Pro Fleet — Staff Profile > Work section (Build #24 enhancement).
// Authoritative assigned work: open workload counts + active operational
// assignments. No duplicate work records — all data comes from existing
// selectors/stores.

import type { StaffWorkloadSummary } from "@/lib/staffSelectors";
import type { OperationalStaffAssignment } from "@/lib/staffTypes";
import {
  ASSIGNMENT_TYPE_LABELS,
  ASSIGNMENT_ENTITY_LABELS,
} from "@/lib/staffTypes";
import { Badge } from "@/components/ui/badge";

export function ProfileWork({
  wl,
  activeAssignments,
}: {
  wl: StaffWorkloadSummary;
  activeAssignments: OperationalStaffAssignment[];
}) {
  const showOpen = wl.openTasks > 0;
  const showDueToday = wl.dueTodayTasks > 0;
  const showOverdue = wl.overdueTasks > 0;
  const showUrgent = wl.urgentTasks > 0;
  const hasCounts = showOpen || showDueToday || showOverdue || showUrgent;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Open Workload
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {hasCounts ? (
            <>
              {showOpen && (
                <Badge variant="outline">Open: {wl.openTasks}</Badge>
              )}
              {showDueToday && (
                <Badge
                  variant="outline"
                  className="border-status-maintenance/40 text-status-maintenance"
                >
                  Due Today: {wl.dueTodayTasks}
                </Badge>
              )}
              {showOverdue && (
                <Badge
                  variant="outline"
                  className="border-status-out/40 text-status-out"
                >
                  Overdue: {wl.overdueTasks}
                </Badge>
              )}
              {showUrgent && (
                <Badge
                  variant="outline"
                  className="border-status-out/40 text-status-out"
                >
                  Urgent: {wl.urgentTasks}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              No open work assigned.
            </span>
          )}
        </div>
        {wl.breakdown.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {wl.breakdown.map((b) => `${b.count} ${b.label}`).join(" · ")}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Active Assignments ({activeAssignments.length})
        </p>
        {activeAssignments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {activeAssignments.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="text-foreground">
                  {ASSIGNMENT_TYPE_LABELS[a.assignment_type]} ·{" "}
                  {ASSIGNMENT_ENTITY_LABELS[a.entity_type]}{" "}
                  {a.entity_label ?? a.entity_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
