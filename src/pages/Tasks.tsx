// Connect Pro Fleet — Tasks page (Build #11 / cleanup).
//
// Two tabs: My Tasks (the signed-in user's work) and All Tasks (management view,
// permission-gated). My Tasks groups by Overdue / Today / Upcoming / No Due Date
// and hides completed by default. All Tasks is a filterable view across staff
// (table on desktop, cards on mobile — see AllTasksView). System tasks can be
// regenerated via a manual "Scan for tasks" action (no background scheduler).

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { statusToneClasses } from "@/lib/format";
import type { Task, TaskCategory, TaskStatus } from "@/lib/taskTypes";
import {
  getOverdueTasks,
  getTasksDueToday,
  getUnassignedTasks,
  isTaskOverdue,
  isTaskUpcoming,
  searchTasks,
  sortTasksOperational,
} from "@/lib/taskSelectors";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, RefreshCw, CheckCircle2 } from "lucide-react";
import { TaskCard } from "./tasks/TaskCard";
import { CreateTaskDialog } from "./tasks/CreateTaskDialog";
import { AllTasksView, STATUS_FILTERS, CATEGORIES } from "./tasks/AllTasksView";

export default function Tasks() {
  const { tasks, staff, roles, currentStaffId, generateSystemTasks } =
    useStore();
  const companyInfo = useStore().companyInfo;

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const role = currentStaff
    ? (roles.find((r) => r.id === currentStaff.role_id) ??
      roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const canViewAll = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "tasks.view_all",
  );
  const canCreate = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "tasks.create",
  );

  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");

  // Quick Add / deep link: auto-open the create-task dialog when ?new=1 is
  // present (only if the user can create tasks).
  useEffect(() => {
    if (searchParams.get("new") === "1" && canCreate) {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [statusFilter, setStatusFilter] = useState<
    TaskStatus | "all" | "active"
  >("active");
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | "all">(
    "all",
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  // Generate system tasks once on mount (idempotent).
  useEffect(() => {
    generateSystemTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myTasks = useMemo(
    () =>
      sortTasksOperational(
        tasks.filter((t) => t.assigned_to_user_id === currentStaffId),
        new Date(),
        companyInfo?.timezone,
      ),
    [tasks, currentStaffId, companyInfo],
  );
  const myOverdue = myTasks.filter((t) => isTaskOverdue(t));
  const myToday = myTasks.filter(
    (t) => !isTaskOverdue(t) && getTasksDueToday([t]).length,
  );
  const myUpcoming = myTasks.filter((t) => isTaskUpcoming(t));
  const myNoDate = myTasks.filter(
    (t) => !t.due_date && (t.status === "open" || t.status === "in_progress"),
  );

  const allRows = useMemo(() => {
    let rows = tasks;
    if (statusFilter === "active")
      rows = rows.filter(
        (t) => t.status === "open" || t.status === "in_progress",
      );
    else if (statusFilter !== "all")
      rows = rows.filter((t) => t.status === statusFilter);
    if (categoryFilter !== "all")
      rows = rows.filter((t) => t.category === categoryFilter);
    if (assigneeFilter === "__none__")
      rows = rows.filter((t) => !t.assigned_to_user_id);
    else if (assigneeFilter !== "all")
      rows = rows.filter((t) => t.assigned_to_user_id === assigneeFilter);
    rows = searchTasks(rows, query);
    return sortTasksOperational(rows, new Date(), companyInfo?.timezone);
  }, [tasks, statusFilter, categoryFilter, assigneeFilter, query, companyInfo]);

  const overdueCount = getOverdueTasks(tasks).length;
  const dueTodayCount = getTasksDueToday(tasks).length;
  const unassignedCount = getUnassignedTasks(tasks).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        subtitle="Operational work that needs doing — who's responsible, when it's due, and what it's connected to."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const r = generateSystemTasks();
                toast.success(
                  r.created > 0
                    ? `${r.created} new task${r.created === 1 ? "" : "s"} generated.`
                    : "No new tasks — everything's covered.",
                );
              }}
            >
              <RefreshCw size={15} className="mr-1.5" /> Scan for tasks
            </Button>
            {canCreate && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                <Plus size={15} className="mr-1.5" /> Task
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Overdue" value={overdueCount} tone="out" />
        <KpiTile label="Due today" value={dueTodayCount} tone="maintenance" />
        <KpiTile
          label="Unassigned"
          value={unassignedCount}
          tone="maintenance"
        />
        <KpiTile
          label="My open"
          value={
            myTasks.filter(
              (t) => t.status === "open" || t.status === "in_progress",
            ).length
          }
          tone="available"
        />
      </div>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My Tasks
        </TabButton>
        {canViewAll && (
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All Tasks
          </TabButton>
        )}
      </div>

      {tab === "mine" ? (
        <MyTasksView
          overdue={myOverdue}
          today={myToday}
          upcoming={myUpcoming}
          noDate={myNoDate}
        />
      ) : (
        <AllTasksView
          rows={allRows}
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
      )}

      {createOpen && (
        <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}

function MyTasksView({
  overdue,
  today,
  upcoming,
  noDate,
}: {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  noDate: Task[];
}) {
  const active =
    overdue.length + today.length + upcoming.length + noDate.length;
  if (active === 0) {
    return (
      <EmptyState
        title="You're caught up"
        hint="No tasks are due right now. New tasks assigned to you will appear here."
        icon={<CheckCircle2 size={28} />}
      />
    );
  }
  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <SectionCard title={`Overdue · ${overdue.length}`}>
          <div className="space-y-2.5">
            {overdue.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </SectionCard>
      )}
      {today.length > 0 && (
        <SectionCard title={`Due today · ${today.length}`}>
          <div className="space-y-2.5">
            {today.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </SectionCard>
      )}
      {upcoming.length > 0 && (
        <SectionCard title={`Upcoming · ${upcoming.length}`}>
          <div className="space-y-2.5">
            {upcoming.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </SectionCard>
      )}
      {noDate.length > 0 && (
        <SectionCard title={`No due date · ${noDate.length}`}>
          <div className="space-y-2.5">
            {noDate.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "available" | "maintenance" | "out" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn("h-2 w-2 rounded-full", statusToneClasses[tone].dot)}
        />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular text-foreground">
        {value}
      </p>
    </div>
  );
}

// Re-export for any external consumers of the old constants.
export { STATUS_FILTERS, CATEGORIES };
