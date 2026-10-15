// Connect Pro Fleet — All Tasks management view (Build #11 / cleanup).
//
// Filterable cross-staff task view. Desktop renders a dense management table;
// mobile renders stacked TaskCards so managers can work without horizontal
// scrolling. Filters stack on mobile. Permission-gated by tasks.view_all in the
// parent Tasks page.

import { useIsMobile } from "@/hooks/use-mobile";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { fmtDateShort } from "@/lib/format";
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
} from "@/lib/taskTypes";
import type { Task, TaskCategory, TaskStatus } from "@/lib/taskTypes";
import { isTaskOverdue, taskEntityRoute } from "@/lib/taskSelectors";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListTodo } from "lucide-react";
import { TaskCard } from "./TaskCard";

export const STATUS_FILTERS: {
  key: TaskStatus | "all" | "active";
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export const CATEGORIES = Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[];

export function AllTasksView({
  rows,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  assigneeFilter,
  setAssigneeFilter,
  staff,
}: {
  rows: Task[];
  query: string;
  setQuery: (v: string) => void;
  statusFilter: TaskStatus | "all" | "active";
  setStatusFilter: (v: TaskStatus | "all" | "active") => void;
  categoryFilter: TaskCategory | "all";
  setCategoryFilter: (v: TaskCategory | "all") => void;
  assigneeFilter: string;
  setAssigneeFilter: (v: string) => void;
  staff: { id: string; full_name: string }[];
}) {
  const isMobile = useIsMobile();

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No tasks match"
        hint="Try clearing a filter, or scan for system-generated tasks."
        icon={<ListTodo size={28} />}
      />
    );
  }

  return (
    <SectionCard>
      <FilterBar
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        staff={staff}
      />
      {isMobile ? (
        <div className="space-y-2.5">
          {rows.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Linked to</th>
                <th className="px-3 py-2 font-medium">Assignee</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => {
                const route = taskEntityRoute(t);
                const overdue = isTaskOverdue(t);
                const assignee = staff.find(
                  (s) => s.id === t.assigned_to_user_id,
                );
                return (
                  <tr key={t.id} className="hover:bg-surface-2">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{t.title}</p>
                      <p className="font-mono text-[11px] tabular text-muted-foreground">
                        {t.task_number}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {route ? (
                        <a
                          href={route}
                          className="text-xs text-primary hover:text-primary-press"
                        >
                          {t.entity_label ?? "Open"}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {assignee ? (
                        assignee.full_name
                      ) : (
                        <span className="text-status-maintenance">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={TASK_PRIORITY_TONE[t.priority]}>
                        {TASK_PRIORITY_LABELS[t.priority]}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular">
                      {t.due_date ? (
                        <span
                          className={
                            overdue
                              ? "text-status-out"
                              : "text-muted-foreground"
                          }
                        >
                          {fmtDateShort(t.due_date)}
                          {t.due_time ? ` ${t.due_time}` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={TASK_STATUS_TONE[t.status]}>
                        {TASK_STATUS_LABELS[t.status]}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {t.source_type === "system" ? "System" : "Manual"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function FilterBar({
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  assigneeFilter,
  setAssigneeFilter,
  staff,
}: {
  query: string;
  setQuery: (v: string) => void;
  statusFilter: TaskStatus | "all" | "active";
  setStatusFilter: (v: TaskStatus | "all" | "active") => void;
  categoryFilter: TaskCategory | "all";
  setCategoryFilter: (v: TaskCategory | "all") => void;
  assigneeFilter: string;
  setAssigneeFilter: (v: string) => void;
  staff: { id: string; full_name: string }[];
}) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search task, number, or record…"
        className="w-full sm:w-64"
      />
      <Select
        value={statusFilter}
        onValueChange={(v) =>
          setStatusFilter(v as TaskStatus | "all" | "active")
        }
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={categoryFilter}
        onValueChange={(v) => setCategoryFilter(v as TaskCategory | "all")}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {TASK_CATEGORY_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          <SelectItem value="__none__">Unassigned</SelectItem>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
