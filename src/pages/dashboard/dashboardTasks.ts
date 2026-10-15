// Connect Pro Fleet — dashboard tasks attention (Build #11).
// Extracted helper that builds a compact "My Tasks" attention list for the
// dashboard: the signed-in user's overdue + due-today + urgent tasks.

import type { Task } from "@/lib/taskTypes";
import { isTaskOverdue, isTaskDueToday } from "@/lib/taskSelectors";

export interface DashboardTaskItem {
  id: string;
  title: string;
  detail: string;
  overdue: boolean;
  to: string;
}

export function myDashboardTasks(
  tasks: Task[],
  userId: string,
): DashboardTaskItem[] {
  const mine = tasks.filter(
    (t) =>
      t.assigned_to_user_id === userId &&
      (t.status === "open" || t.status === "in_progress"),
  );
  const items: DashboardTaskItem[] = [];
  for (const t of mine) {
    const overdue = isTaskOverdue(t);
    const today = isTaskDueToday(t);
    if (!overdue && !today && t.priority !== "urgent") continue;
    items.push({
      id: t.id,
      title: t.title,
      detail: overdue ? "Overdue" : today ? "Due today" : "Urgent",
      overdue,
      to: "/tasks",
    });
  }
  // Overdue first, then urgent, then today.
  return items
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return 0;
    })
    .slice(0, 5);
}
