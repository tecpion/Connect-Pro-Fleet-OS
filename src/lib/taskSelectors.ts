// Connect Pro Fleet — Tasks domain selectors (Build #11).
//
// Pure functions over Task[] + TaskEvent[] + TaskNote[]. Overdue is DERIVED
// (status open/in_progress + due date passed), never stored. Date-only tasks
// remain due through the end of the org-local calendar day so a 5 PM task
// isn't overdue at the wrong local time. All comparisons use org-local-day
// semantics (the organization's configured timezone), never the machine
// wall clock — see `CompanyInfo.timezone` / `getOrgTimezone`.

import type { Task, TaskEvent, TaskNote, TaskStatus } from "./taskTypes";
import { TASK_PRIORITY_RANK } from "./taskTypes";
import {
  startOfDayInTz,
  endOfDayInTz,
  getOrgTimezone,
} from "./timezone";

const DAY = 86_400_000;

/** Next task number in the TSK-000000 sequence (tenant-scoped). */
export function nextTaskNumber(tasks: Task[]): string {
  const year = new Date().getFullYear();
  const max = tasks
    .map((t) => {
      const m = t.task_number.match(/^TSK-(\d{4})-(\d+)$/);
      return m && m[1] === String(year) ? Number(m[2]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `TSK-${year}-${String(max + 1).padStart(6, "0")}`;
}

/** A task is overdue when it's open/in_progress AND its due date/time passed.
 *  Date-only tasks are due through the end of that org-local calendar day.
 *  `tz` (org timezone) makes the day boundary org-local; omitted resolves
 *  through `getOrgTimezone` (the documented UTC safe default). */
export function isTaskOverdue(
  task: Task,
  now: Date = new Date(),
  tz?: string,
): boolean {
  if (task.status !== "open" && task.status !== "in_progress") return false;
  if (!task.due_date) return false;
  const due = new Date(task.due_date + "T12:00:00Z");
  if (isNaN(due.getTime())) return false;
  const z = getOrgTimezone(tz);
  if (task.due_time) {
    // Specific wall time on the due date, in the org timezone.
    const [h, m] = task.due_time.split(":").map(Number);
    const dayStart = startOfDayInTz(due, z);
    return (
      now.getTime() >
      dayStart.getTime() + (h ?? 0) * 3600_000 + (m ?? 0) * 60_000
    );
  }
  // Date-only: due through end of that org-local day.
  const dueEnd = endOfDayInTz(due, z);
  return now.getTime() > dueEnd.getTime();
}

/** Tasks due today (org-local). Includes overdue tasks due today. */
export function isTaskDueToday(
  task: Task,
  now: Date = new Date(),
  tz?: string,
): boolean {
  if (task.status !== "open" && task.status !== "in_progress") return false;
  if (!task.due_date) return false;
  const z = getOrgTimezone(tz);
  const today = startOfDayInTz(now, z);
  const due = startOfDayInTz(new Date(task.due_date + "T12:00:00Z"), z);
  return due.getTime() === today.getTime();
}

/** Tasks due in the future (after today, org-local). */
export function isTaskUpcoming(
  task: Task,
  now: Date = new Date(),
  tz?: string,
): boolean {
  if (task.status !== "open" && task.status !== "in_progress") return false;
  if (!task.due_date) return false;
  const z = getOrgTimezone(tz);
  const today = startOfDayInTz(now, z);
  const due = startOfDayInTz(new Date(task.due_date + "T12:00:00Z"), z);
  return due.getTime() > today.getTime();
}

/** Active = open or in_progress (not completed/cancelled). */
export function isTaskActive(task: Task): boolean {
  return task.status === "open" || task.status === "in_progress";
}

export function getTasksForUser(tasks: Task[], userId: string): Task[] {
  return tasks.filter((t) => t.assigned_to_user_id === userId);
}

export function getUnassignedTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.assigned_to_user_id && isTaskActive(t));
}

export function getOverdueTasks(
  tasks: Task[],
  now: Date = new Date(),
  tz?: string,
): Task[] {
  return tasks.filter((t) => isTaskOverdue(t, now, tz));
}

export function getTasksDueToday(
  tasks: Task[],
  now: Date = new Date(),
  tz?: string,
): Task[] {
  return tasks.filter((t) => isTaskDueToday(t, now, tz));
}

/** Operational sort: overdue first, then due today, then priority, then nearest
 *  due date. Completed/cancelled sink to the bottom. `tz` (org timezone) makes
 *  the overdue/due-today boundary org-local. */
export function sortTasksOperational(tasks: Task[], tz?: string): Task[] {
  const now = new Date();
  return [...tasks].sort((a, b) => {
    const aActive = isTaskActive(a);
    const bActive = isTaskActive(b);
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aOver = isTaskOverdue(a, now, tz);
    const bOver = isTaskOverdue(b, now, tz);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const aToday = isTaskDueToday(a, now, tz);
    const bToday = isTaskDueToday(b, now, tz);
    if (aToday !== bToday) return aToday ? -1 : 1;
    const pDiff =
      TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority];
    if (pDiff !== 0) return pDiff;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
}

export function taskEventsFor(tasks: TaskEvent[], taskId: string): TaskEvent[] {
  return tasks
    .filter((e) => e.task_id === taskId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function taskNotesFor(tasks: TaskNote[], taskId: string): TaskNote[] {
  return tasks
    .filter((n) => n.task_id === taskId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Build a stable dedupe key for a system task occurrence. */
export function systemTaskDedupeKey(
  sourceEvent: string,
  entityType: string | null,
  entityId: string | null,
  occurrence: string,
): string {
  return `sys:${sourceEvent}:${entityType ?? ""}:${entityId ?? ""}:${occurrence}`;
}

/** Find an existing OPEN/in_progress system task with the same dedupe key. */
export function findOpenSystemTask(
  tasks: Task[],
  dedupeKey: string,
): Task | undefined {
  return tasks.find((t) => t.dedupe_key === dedupeKey && isTaskActive(t));
}

/** Find an existing open system task for an entity + source event (any
 *  occurrence) — used to resolve tasks when the underlying condition clears. */
export function findOpenSystemTasksForEntity(
  tasks: Task[],
  sourceEvent: string,
  entityType: string | null,
  entityId: string | null,
): Task[] {
  return tasks.filter(
    (t) =>
      t.source_type === "system" &&
      t.source_event === sourceEvent &&
      t.entity_type === entityType &&
      t.entity_id === entityId &&
      isTaskActive(t),
  );
}

/** Search tasks by number, title, entity label, or linked record id. */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => {
    return (
      t.task_number.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      (t.entity_label ?? "").toLowerCase().includes(q) ||
      (t.entity_id ?? "").toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  });
}

/** Resolve the route for a linked entity (deep link). */
export function taskEntityRoute(task: Task): string | null {
  if (!task.entity_type || !task.entity_id) return null;
  switch (task.entity_type) {
    case "customer":
      return `/customers/${task.entity_id}`;
    case "reservation":
      return `/reservations/${task.entity_id}`;
    case "rental":
      return `/rentals/${task.entity_id}`;
    case "vehicle":
      return `/vehicles/${task.entity_id}`;
    case "payment_arrangement":
      // Build #58 — no standalone arrangements page. Land on Rental
      // Management → Active Rentals → Payment Arrangement filter.
      return `/rental-management?tab=active&filter=arrangement&arrangement=${task.entity_id}`;
    case "maintenance":
      return `/maintenance`;
    case "maintenance_work_order":
      return `/maintenance?wo=${task.entity_id}`;
    case "inspection":
      return `/inspections`;
    case "incident":
      return `/incidents`;
    case "violation":
      return `/incidents`;
    case "deposit":
      // Build #58 — no standalone deposits page. Land on Rental Management →
      // Active Rentals → Deposit filter.
      return `/rental-management?tab=active&filter=deposit&deposit=${task.entity_id}`;
    case "expense":
      return `/finance?tab=expenses&expense=${task.entity_id}`;
    case "damage_claim":
      return `/damage-claims?claim=${task.entity_id}`;
    default:
      return null;
  }
}

export const TASK_STATUS_ACTIVE: TaskStatus[] = ["open", "in_progress"];
