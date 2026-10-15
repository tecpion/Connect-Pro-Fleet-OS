// Connect Pro Fleet — reusable assignment badge + Assign Staff dialog (Build #24).
//
// Build #24 enhancement: shows transparent assignment suggestions ranked by
// eligibility (active + module permission + location access) and then by
// responsibility match + lowest open work. No opaque score; no auto-assign.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useCan } from "@/pages/settings/useCan";
import {
  ASSIGNMENT_TYPE_LABELS,
  type OperationalAssignmentType,
  type AssignmentEntityType,
} from "@/lib/staffTypes";
import { staffWorkloadSummary } from "@/lib/staffSelectors";
import {
  suggestAssignees,
  suggestionReason,
} from "@/lib/assignmentEligibility";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Sparkles } from "lucide-react";

export function AssigneeDisplay({
  entityType,
  entityId,
  assignmentType,
  entityLabel,
  onAssigned,
}: {
  entityType: AssignmentEntityType;
  entityId: string;
  assignmentType: OperationalAssignmentType;
  entityLabel?: string | null;
  onAssigned?: () => void;
}) {
  const store = useStore();
  const assignments = useStaffAssignments();
  const canAssign = useCan("staff.assign_work");
  const [open, setOpen] = useState(false);

  const active = assignments.activeAssignment(
    entityType,
    entityId,
    assignmentType,
  );
  const staff = active
    ? store.staff.find((s) => s.id === active.staff_id)
    : undefined;

  return (
    <div className="flex items-center gap-2">
      {staff ? (
        <Badge variant="secondary" className="gap-1.5">
          {staff.full_name}
          <span className="text-[10px] text-muted-foreground">
            · {ASSIGNMENT_TYPE_LABELS[assignmentType]}
          </span>
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Unassigned
        </Badge>
      )}
      {canAssign && (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-primary hover:underline"
        >
          {staff ? "Reassign" : "Assign"}
        </button>
      )}
      {open && (
        <AssignStaffDialog
          open={open}
          onOpenChange={setOpen}
          entityType={entityType}
          entityId={entityId}
          entityLabel={entityLabel}
          assignmentType={assignmentType}
          currentStaffId={active?.staff_id ?? null}
          onAssigned={onAssigned}
        />
      )}
    </div>
  );
}

export function AssignStaffDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityLabel,
  assignmentType,
  currentStaffId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: AssignmentEntityType;
  entityId: string;
  entityLabel?: string | null;
  assignmentType: OperationalAssignmentType;
  currentStaffId: string | null;
  onAssigned?: () => void;
}) {
  const store = useStore();
  const assignments = useStaffAssignments();
  const [staffId, setStaffId] = useState(
    currentStaffId ??
      store.staff.find((s) => (s.status ?? "active") === "active")?.id ??
      "",
  );
  const [reason, setReason] = useState("");

  // Only active staff are assignable. Deactivated/suspended excluded.
  const assignable = store.staff.filter(
    (s) => (s.status ?? "active") === "active",
  );

  // Transparent suggestions ranked by eligibility (active + module permission +
  // location access) then responsibility match + lowest open work. No auto-assign.
  const suggestions = useMemo(
    () =>
      suggestAssignees({
        staff: assignable,
        roles: store.roles,
        assignmentType,
        openWorkCount: (sid) =>
          staffWorkloadSummary(
            {
              tasks: store.tasks,
              rentals: store.rentals,
              workOrders: store.workOrders,
              damageClaims: [],
              assignments: assignments.assignments,
            },
            sid,
          ).totalActiveAssignments,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignable, store.roles, store.tasks, store.rentals, store.workOrders],
  );
  const topSuggestions = suggestions.slice(0, 3);

  function save() {
    if (!staffId) return;
    const existing = assignments.activeAssignment(
      entityType,
      entityId,
      assignmentType,
    );
    if (existing && existing.staff_id === staffId) {
      onOpenChange(false);
      return;
    }
    if (existing) {
      assignments.reassign({
        assignment_id: existing.id,
        new_staff_id: staffId,
        reason: reason.trim() || null,
      });
    } else {
      assignments.createAssignment({
        staff_id: staffId,
        assignment_type: assignmentType,
        entity_type: entityType,
        entity_id: entityId,
        entity_label: entityLabel ?? null,
      });
    }
    onAssigned?.();
    onOpenChange(false);
    setReason("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {currentStaffId ? "Reassign" : "Assign"} —{" "}
            {ASSIGNMENT_TYPE_LABELS[assignmentType]}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {topSuggestions.length > 0 && !currentStaffId && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                <Sparkles size={12} /> Suggested assignee
              </p>
              {topSuggestions.map((sug) => (
                <button
                  key={sug.staff.id}
                  onClick={() => setStaffId(sug.staff.id)}
                  className="mt-1.5 block w-full rounded px-1.5 py-1 text-left text-xs hover:bg-primary/10"
                >
                  <span className="font-medium text-foreground">
                    {sug.staff.full_name}
                  </span>
                  <span className="ml-1 text-muted-foreground">
                    {suggestionReason(sug)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Staff member
            </label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {assignable.map((s) => {
                const role = store.roles.find((r) => r.id === s.role_id);
                return (
                  <option key={s.id} value={s.id}>
                    {s.full_name} · {role?.name ?? s.role}
                  </option>
                );
              })}
            </select>
          </div>
          {currentStaffId && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Reason (optional)
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. workload rebalance"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!staffId}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {currentStaffId ? "Reassign" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
