// Connect Pro Fleet — Copilot open-tasks handler (Build #47).
//
// "Do I have any open tasks?" / "what tasks do I have?" / "what is due today?" /
// "overdue tasks" / "unassigned tasks" / "my tasks" — uses the AUTHORITATIVE
// Task domain selectors (taskSelectors). Returns the count + a useful summary of
// open tasks (overdue / due today / unassigned breakdown). Pure + deterministic;
// no new store.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, plural, humanizeStatus } from "./copilotShared";
import {
  isTaskActive,
  isTaskOverdue,
  isTaskDueToday,
  getUnassignedTasks,
  sortTasksOperational,
} from "./taskSelectors";
import { taskEntityRoute } from "./taskSelectors";

/** "Do I have any open tasks?" — count + breakdown of open tasks. */
export function answerOpenTasks(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("open_tasks", asOf, perms, "derived");
  const tasks = src.briefing.store.tasks ?? [];
  const open = tasks.filter(isTaskActive);
  const overdue = open.filter((t) => isTaskOverdue(t, asOf));
  const dueToday = open.filter((t) => isTaskDueToday(t, asOf));
  const unassigned = getUnassignedTasks(tasks);

  const summary =
    open.length === 0
      ? "You're all caught up — no open tasks right now."
      : overdue.length > 0
        ? `You have ${open.length} open ${plural(open.length, "task")}, and ${overdue.length} ${plural(overdue.length, "is", "are")} overdue.`
        : `You have ${open.length} open ${plural(open.length, "task")}${dueToday.length > 0 ? `, ${dueToday.length} due today` : ""}.`;

  const sorted = sortTasksOperational(open).slice(0, 25);

  return {
    ...base,
    answer_type: "list",
    summary,
    facts: [
      { label: "Open tasks", value: open.length },
      { label: "Overdue", value: overdue.length },
      { label: "Due today", value: dueToday.length },
      { label: "Unassigned", value: unassigned.length },
    ],
    items: sorted.map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: t.entity_label ?? humanizeStatus(t.priority),
      due_at: t.due_date ?? null,
      status: humanizeStatus(t.status),
      deep_link: taskEntityRoute(t) ?? "/tasks",
    })),
    sources: sorted.slice(0, 10).map((t) => ({
      source_module: "tasks",
      entity_type: "task",
      entity_id: t.id,
      label: `${t.task_number} — ${t.title}`,
      deep_link: taskEntityRoute(t) ?? "/tasks",
    })),
    suggested_actions: [
      {
        label: "View Tasks",
        action_type: "view_tasks",
        deep_link: "/tasks",
      },
    ],
    caveats: [],
  };
}
