// Connect Pro Fleet — TaskCard (Build #11).
// Mobile-first card for a single task. Used in My Tasks and the Tasks list.
// Shows title, priority, due, linked entity, and quick Start/Complete actions.

import { Link } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { StatusPill } from "@/components/Status";
import { fmtDateShort, statusToneClasses } from "@/lib/format";
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
} from "@/lib/taskTypes";
import { isTaskOverdue, taskEntityRoute } from "@/lib/taskSelectors";
import type { Task } from "@/lib/taskTypes";
import { cn } from "@/lib/utils";
import { Play, Check, AlertCircle, Link2, Clock } from "lucide-react";
import { toast } from "sonner";

export function TaskCard({ task }: { task: Task }) {
  const { startTask, completeTask, staff } = useStore();
  const overdue = isTaskOverdue(task);
  const route = taskEntityRoute(task);
  const assignee = task.assigned_to_user_id
    ? staff.find((s) => s.id === task.assigned_to_user_id)
    : null;
  const pTone = TASK_PRIORITY_TONE[task.priority];
  const sTone = TASK_STATUS_TONE[task.status];

  return (
    <div
      className={cn(
        "status-border border-l-2 rounded-r-md border border-border bg-surface p-3",
        overdue
          ? statusToneClasses["out"].border
          : task.status === "completed"
            ? statusToneClasses["available"].border
            : statusToneClasses["maintenance"].border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tabular text-muted-foreground">
              {task.task_number}
            </span>
            {task.source_type === "system" && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                System
              </span>
            )}
            <StatusPill tone={pTone}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </StatusPill>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>
        <StatusPill tone={sTone}>{TASK_STATUS_LABELS[task.status]}</StatusPill>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {task.due_date && (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono tabular",
              overdue && "text-status-out",
            )}
          >
            <Clock size={12} />
            {overdue ? "Overdue · " : "Due "}
            {fmtDateShort(task.due_date)}
            {task.due_time ? ` ${task.due_time}` : ""}
          </span>
        )}
        {!task.due_date && (
          <span className="text-muted-foreground">No due date</span>
        )}
        {route && (
          <Link
            to={route}
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            <Link2 size={12} />
            {task.entity_label ?? "Open record"}
          </Link>
        )}
        {assignee && (
          <span className="text-muted-foreground">{assignee.full_name}</span>
        )}
        {!assignee &&
          task.status !== "completed" &&
          task.status !== "cancelled" && (
            <span className="text-status-maintenance">Unassigned</span>
          )}
      </div>

      {overdue && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-status-out">
          <AlertCircle size={12} /> Past due
        </p>
      )}

      {task.status !== "completed" && task.status !== "cancelled" && (
        <div className="mt-3 flex gap-2">
          {task.status === "open" && (
            <button
              onClick={() => startTask(task.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-2"
            >
              <Play size={13} /> Start
            </button>
          )}
          <button
            onClick={() => {
              completeTask(task.id);
              toast.success("Task completed.");
            }}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-press"
          >
            <Check size={13} /> Complete
          </button>
        </div>
      )}
    </div>
  );
}
