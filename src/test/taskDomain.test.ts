// Connect Pro Fleet — Build #11 task domain tests.
//
// Pure tests over the task selectors: status derivation, local-date overdue
// behavior, priority sorting, system-task idempotency/dedupe, search, and
// entity routing. Verifies the core rules: overdue is derived (never stored),
// completed/cancelled tasks are never overdue, date-only tasks remain due
// through the end of the local day.

import { describe, it, expect } from "vitest";
import type { Task } from "@/lib/taskTypes";
import {
  isTaskOverdue,
  isTaskDueToday,
  isTaskUpcoming,
  isTaskActive,
  getTasksForUser,
  getUnassignedTasks,
  getOverdueTasks,
  getTasksDueToday,
  sortTasksOperational,
  searchTasks,
  taskEntityRoute,
  nextTaskNumber,
  systemTaskDedupeKey,
  findOpenSystemTask,
  findOpenSystemTasksForEntity,
} from "@/lib/taskSelectors";

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "tsk_x",
    tenant_id: "tnt",
    task_number: "TSK-2026-000001",
    title: "Test task",
    description: null,
    status: "open",
    priority: "normal",
    source_type: "manual",
    source_event: null,
    assigned_to_user_id: null,
    assigned_by_user_id: null,
    created_by_user_id: "stf_1",
    due_date: null,
    due_time: null,
    completed_at: null,
    completed_by_user_id: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    entity_type: null,
    entity_id: null,
    entity_label: null,
    location_id: null,
    category: "other",
    tags: [],
    notes: null,
    dedupe_key: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

const today = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
};
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
};
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

describe("task overdue derivation", () => {
  it("open task with past due date is overdue", () => {
    const t = makeTask({ due_date: dateStr(yesterday()) });
    expect(isTaskOverdue(t, today())).toBe(true);
  });
  it("completed task is never overdue", () => {
    const t = makeTask({
      status: "completed",
      due_date: dateStr(yesterday()),
      completed_at: "2026-08-01T00:00:00Z",
    });
    expect(isTaskOverdue(t, today())).toBe(false);
  });
  it("cancelled task is never overdue", () => {
    const t = makeTask({
      status: "cancelled",
      due_date: dateStr(yesterday()),
      cancellation_reason: "done elsewhere",
    });
    expect(isTaskOverdue(t, today())).toBe(false);
  });
  it("task with no due date is never overdue", () => {
    expect(isTaskOverdue(makeTask(), today())).toBe(false);
  });
  it("date-only task due today is NOT overdue (due through end of day)", () => {
    const t = makeTask({ due_date: dateStr(today()) });
    expect(isTaskOverdue(t, today())).toBe(false);
  });
  it("date-only task due yesterday IS overdue", () => {
    const t = makeTask({ due_date: dateStr(yesterday()) });
    expect(isTaskOverdue(t, today())).toBe(true);
  });
  it("task with past due time today is overdue", () => {
    const t = makeTask({
      due_date: dateStr(today()),
      due_time: "09:00",
    });
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(isTaskOverdue(t, noon)).toBe(true);
  });
  it("task with future due time today is NOT overdue", () => {
    const t = makeTask({
      due_date: dateStr(today()),
      due_time: "17:00",
    });
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    expect(isTaskOverdue(t, noon)).toBe(false);
  });
});

describe("task due today / upcoming", () => {
  it("due today matches today's date", () => {
    const t = makeTask({ due_date: dateStr(today()) });
    expect(isTaskDueToday(t, today())).toBe(true);
  });
  it("upcoming matches future date", () => {
    const t = makeTask({ due_date: dateStr(tomorrow()) });
    expect(isTaskUpcoming(t, today())).toBe(true);
  });
  it("completed task is not due today", () => {
    const t = makeTask({
      status: "completed",
      due_date: dateStr(today()),
    });
    expect(isTaskDueToday(t, today())).toBe(false);
  });
});

describe("task active / user selectors", () => {
  it("isTaskActive true for open and in_progress", () => {
    expect(isTaskActive(makeTask({ status: "open" }))).toBe(true);
    expect(isTaskActive(makeTask({ status: "in_progress" }))).toBe(true);
  });
  it("isTaskActive false for completed and cancelled", () => {
    expect(isTaskActive(makeTask({ status: "completed" }))).toBe(false);
    expect(isTaskActive(makeTask({ status: "cancelled" }))).toBe(false);
  });
  it("getTasksForUser filters by assignee", () => {
    const tasks = [
      makeTask({ id: "a", assigned_to_user_id: "stf_1" }),
      makeTask({ id: "b", assigned_to_user_id: "stf_2" }),
      makeTask({ id: "c", assigned_to_user_id: null }),
    ];
    expect(getTasksForUser(tasks, "stf_1")).toHaveLength(1);
  });
  it("getUnassignedTasks returns active unassigned only", () => {
    const tasks = [
      makeTask({ id: "a", assigned_to_user_id: null, status: "open" }),
      makeTask({ id: "b", assigned_to_user_id: null, status: "completed" }),
      makeTask({ id: "c", assigned_to_user_id: "stf_1" }),
    ];
    expect(getUnassignedTasks(tasks)).toHaveLength(1);
  });
  it("getOverdueTasks filters overdue", () => {
    const tasks = [
      makeTask({ id: "a", due_date: dateStr(yesterday()) }),
      makeTask({ id: "b", due_date: dateStr(tomorrow()) }),
    ];
    expect(getOverdueTasks(tasks, today())).toHaveLength(1);
  });
});

describe("task operational sort", () => {
  it("overdue first, then priority, then due date", () => {
    const tasks = [
      makeTask({ id: "low", priority: "low", due_date: dateStr(tomorrow()) }),
      makeTask({
        id: "overdue",
        priority: "normal",
        due_date: dateStr(yesterday()),
      }),
      makeTask({
        id: "urgent",
        priority: "urgent",
        due_date: dateStr(today()),
      }),
    ];
    const sorted = sortTasksOperational(tasks);
    expect(sorted[0].id).toBe("overdue");
    expect(sorted[1].id).toBe("urgent");
  });
  it("completed sinks to bottom", () => {
    const tasks = [
      makeTask({ id: "done", status: "completed", priority: "urgent" }),
      makeTask({ id: "open", status: "open", priority: "low" }),
    ];
    const sorted = sortTasksOperational(tasks);
    expect(sorted[0].id).toBe("open");
  });
});

describe("task search", () => {
  it("matches title, number, entity label", () => {
    const tasks = [
      makeTask({
        id: "a",
        title: "Call Marcus",
        task_number: "TSK-2026-000100",
      }),
      makeTask({ id: "b", title: "Other", entity_label: "AGR-2026-000125" }),
    ];
    expect(searchTasks(tasks, "marcus")).toHaveLength(1);
    expect(searchTasks(tasks, "AGR-2026")).toHaveLength(1);
    expect(searchTasks(tasks, "TSK-2026-000100")).toHaveLength(1);
  });
  it("empty query returns all", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];
    expect(searchTasks(tasks, "")).toHaveLength(2);
  });
});

describe("task entity route", () => {
  it("routes customer to /customers/:id", () => {
    const t = makeTask({ entity_type: "customer", entity_id: "cust_1" });
    expect(taskEntityRoute(t)).toBe("/customers/cust_1");
  });
  it("routes rental to /rentals/:id", () => {
    const t = makeTask({ entity_type: "rental", entity_id: "rnt_1" });
    expect(taskEntityRoute(t)).toBe("/rentals/rnt_1");
  });
  it("returns null when no entity", () => {
    expect(taskEntityRoute(makeTask())).toBeNull();
  });
});

describe("task numbering", () => {
  it("increments from max for current year", () => {
    const year = new Date().getFullYear();
    const tasks = [
      makeTask({ task_number: `TSK-${year}-000005` }),
      makeTask({ task_number: `TSK-${year}-000003` }),
    ];
    expect(nextTaskNumber(tasks)).toBe(`TSK-${year}-000006`);
  });
  it("starts at 1 when none for current year", () => {
    const year = new Date().getFullYear();
    expect(nextTaskNumber([])).toBe(`TSK-${year}-000001`);
  });
});

describe("system task dedupe", () => {
  it("stable dedupe key for same inputs", () => {
    const k1 = systemTaskDedupeKey(
      "rental.overdue",
      "rental",
      "rnt_1",
      "2026-08-01",
    );
    const k2 = systemTaskDedupeKey(
      "rental.overdue",
      "rental",
      "rnt_1",
      "2026-08-01",
    );
    expect(k1).toBe(k2);
  });
  it("different occurrence produces different key", () => {
    const k1 = systemTaskDedupeKey(
      "rental.overdue",
      "rental",
      "rnt_1",
      "2026-08-01",
    );
    const k2 = systemTaskDedupeKey(
      "rental.overdue",
      "rental",
      "rnt_1",
      "2026-08-08",
    );
    expect(k1).not.toBe(k2);
  });
  it("findOpenSystemTask finds matching open task", () => {
    const key = systemTaskDedupeKey("rental.overdue", "rental", "rnt_1", "1");
    const tasks = [
      makeTask({
        id: "a",
        dedupe_key: key,
        source_type: "system",
        status: "open",
      }),
      makeTask({ id: "b", dedupe_key: "other", status: "open" }),
    ];
    expect(findOpenSystemTask(tasks, key)?.id).toBe("a");
  });
  it("findOpenSystemTask ignores completed tasks", () => {
    const key = systemTaskDedupeKey("rental.overdue", "rental", "rnt_1", "1");
    const tasks = [makeTask({ id: "a", dedupe_key: key, status: "completed" })];
    expect(findOpenSystemTask(tasks, key)).toBeUndefined();
  });
  it("findOpenSystemTasksForEntity returns all open for entity", () => {
    const tasks = [
      makeTask({
        id: "a",
        source_type: "system",
        source_event: "rental.overdue",
        entity_type: "rental",
        entity_id: "rnt_1",
        status: "open",
      }),
      makeTask({
        id: "b",
        source_type: "system",
        source_event: "rental.overdue",
        entity_type: "rental",
        entity_id: "rnt_1",
        status: "completed",
      }),
      makeTask({
        id: "c",
        source_type: "system",
        source_event: "rental.overdue",
        entity_type: "rental",
        entity_id: "rnt_2",
        status: "open",
      }),
    ];
    const open = findOpenSystemTasksForEntity(
      tasks,
      "rental.overdue",
      "rental",
      "rnt_1",
    );
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe("a");
  });
});
