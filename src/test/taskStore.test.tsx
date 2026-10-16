// Connect Pro Fleet — Build #11 task store lifecycle tests.
//
// Exercises the task store methods through the real StoreProvider: manual
// creation, assignment/reassignment, lifecycle (start/complete/reopen/cancel),
// notes, system-task idempotency, system-task resolution, and the critical
// rule that tasks never change financial truth (ledger/balance/revenue).

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StoreProvider, useStore, TENANT_ID } from "@/lib/store";
import type { ReactNode } from "react";
import { isTaskOverdue } from "@/lib/taskSelectors";

function wrapper({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
function useStoreHook() {
  return renderHook(() => useStore(), { wrapper }).result;
}

describe("task manual creation + lifecycle", () => {
  it("creates a manual task with a readable number", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "Call Marcus",
        category: "payment_collection",
        priority: "high",
        assignedToUserId: "stf_1",
      });
    });
    const t = r.current.taskById(id);
    expect(t).toBeDefined();
    expect(t!.source_type).toBe("manual");
    expect(t!.task_number).toMatch(/^TSK-\d{4}-\d{6}$/);
    expect(t!.status).toBe("open");
    expect(t!.priority).toBe("high");
    expect(t!.assigned_to_user_id).toBe("stf_1");
  });

  it("task can exist without an entity", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "Order supplies",
        category: "administrative",
      });
    });
    const t = r.current.taskById(id);
    expect(t!.entity_type).toBeNull();
    expect(t!.entity_id).toBeNull();
  });

  it("OPEN -> IN_PROGRESS -> COMPLETED", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    act(() => r.current.startTask(id));
    expect(r.current.taskById(id)!.status).toBe("in_progress");
    act(() => r.current.completeTask(id, "done"));
    const t = r.current.taskById(id);
    expect(t!.status).toBe("completed");
    expect(t!.completed_at).not.toBeNull();
    expect(t!.completed_by_user_id).toBe("stf_1");
  });

  it("can complete an OPEN task directly (no start required)", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    act(() => r.current.completeTask(id));
    expect(r.current.taskById(id)!.status).toBe("completed");
  });

  it("reopen preserves completion history", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    act(() => r.current.completeTask(id));
    act(() => r.current.reopenTask(id));
    const t = r.current.taskById(id);
    expect(t!.status).toBe("open");
    expect(t!.completed_at).toBeNull();
    // History retains the completion event.
    const events = r.current.taskEventLog(id);
    expect(events.some((e) => e.type === "completed")).toBe(true);
    expect(events.some((e) => e.type === "reopened")).toBe(true);
  });

  it("cancellation requires a reason and preserves history", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    act(() => r.current.cancelTask(id, "no longer needed"));
    const t = r.current.taskById(id);
    expect(t!.status).toBe("cancelled");
    expect(t!.cancellation_reason).toBe("no longer needed");
    expect(r.current.taskEventLog(id).some((e) => e.type === "cancelled")).toBe(
      true,
    );
  });
});

describe("task assignment", () => {
  it("can assign and reassign, recording history", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    act(() => r.current.assignTask(id, "stf_1"));
    expect(r.current.taskById(id)!.assigned_to_user_id).toBe("stf_1");
    act(() => r.current.assignTask(id, "stf_2"));
    expect(r.current.taskById(id)!.assigned_to_user_id).toBe("stf_2");
    const events = r.current.taskEventLog(id);
    expect(events.some((e) => e.type === "assigned")).toBe(true);
    expect(events.some((e) => e.type === "reassigned")).toBe(true);
  });
  it("can unassign", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "T",
        category: "other",
        assignedToUserId: "stf_1",
      });
    });
    act(() => r.current.assignTask(id, null));
    expect(r.current.taskById(id)!.assigned_to_user_id).toBeNull();
  });
  it("tasksForUser returns only the user's tasks", () => {
    const r = useStoreHook();
    act(() => {
      r.current.createTask({
        title: "A",
        category: "other",
        assignedToUserId: "stf_1",
      });
      r.current.createTask({
        title: "B",
        category: "other",
        assignedToUserId: "stf_2",
      });
    });
    expect(r.current.tasksForUser("stf_1").length).toBeGreaterThanOrEqual(1);
    const mine = r.current.tasksForUser("stf_1").filter((t) => t.title === "A");
    expect(mine).toHaveLength(1);
  });
});

describe("task notes", () => {
  it("appends a note and logs it", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    act(() => r.current.addTaskNote(id, "called, no answer"));
    const notes = r.current.taskNoteLog(id);
    expect(notes.some((n) => n.text === "called, no answer")).toBe(true);
    expect(
      r.current.taskEventLog(id).some((e) => e.type === "note_added"),
    ).toBe(true);
  });
});

describe("system task idempotency", () => {
  it("creates a system task once for the same occurrence", () => {
    const r = useStoreHook();
    let first, second;
    act(() => {
      first = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_test1",
        entityLabel: "AGR-TEST",
        title: "Follow up on overdue rental",
        category: "return",
        occurrence: "2026-08-01",
      });
    });
    act(() => {
      second = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_test1",
        entityLabel: "AGR-TEST",
        title: "Follow up on overdue rental",
        category: "return",
        occurrence: "2026-08-01",
      });
    });
    expect(first!.created).toBe(true);
    expect(second!.created).toBe(false);
    expect(first!.taskId).toBe(second!.taskId);
  });
  it("a new occurrence can create a new task", () => {
    const r = useStoreHook();
    let a, b;
    act(() => {
      a = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_test2",
        entityLabel: "AGR-TEST2",
        title: "Follow up",
        category: "return",
        occurrence: "2026-08-01",
      });
    });
    act(() => {
      b = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_test2",
        entityLabel: "AGR-TEST2",
        title: "Follow up",
        category: "return",
        occurrence: "2026-08-08",
      });
    });
    expect(a!.created).toBe(true);
    expect(b!.created).toBe(true);
    expect(a!.taskId).not.toBe(b!.taskId);
  });
  it("system actor does not invent a staff user id", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.ensureSystemTask({
        sourceEvent: "maintenance.overdue",
        entityType: "maintenance",
        entityId: "mnt_test",
        entityLabel: "brakes",
        title: "Schedule maintenance",
        category: "maintenance",
      }).taskId;
    });
    const t = r.current.taskById(id);
    expect(t!.created_by_user_id).toBeNull();
    const events = r.current.taskEventLog(id);
    const genEvent = events.find((e) => e.type === "system_generated");
    expect(genEvent!.actor_is_system).toBe(true);
    expect(genEvent!.actor_id).toBeNull();
  });
});

describe("system task resolution", () => {
  it("resolves matching open system tasks when domain action clears", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.ensureSystemTask({
        sourceEvent: "deposit.refund_pending",
        entityType: "deposit",
        entityId: "dep_resolve1",
        entityLabel: "Deposit",
        title: "Process deposit refund",
        category: "deposit",
      }).taskId;
    });
    expect(r.current.taskById(id)!.status).toBe("open");
    let resolved = 0;
    act(() => {
      resolved = r.current.resolveSystemTasksForEntity(
        "deposit.refund_pending",
        "deposit",
        "dep_resolve1",
        "deposit refunded",
      );
    });
    expect(resolved).toBe(1);
    expect(r.current.taskById(id)!.status).toBe("completed");
    expect(
      r.current.taskEventLog(id).some((e) => e.type === "system_resolved"),
    ).toBe(true);
  });
  it("does not delete the task (history preserved)", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.ensureSystemTask({
        sourceEvent: "rental.overdue",
        entityType: "rental",
        entityId: "rnt_resolve2",
        entityLabel: "AGR",
        title: "Follow up",
        category: "return",
      }).taskId;
    });
    act(() => {
      r.current.resolveSystemTasksForEntity(
        "rental.overdue",
        "rental",
        "rnt_resolve2",
        "rental returned",
      );
    });
    expect(r.current.taskById(id)).toBeDefined();
  });
  it("manual tasks are not auto-resolved by domain resolution", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "Manual follow-up",
        category: "return",
        entityType: "rental",
        entityId: "rnt_manual1",
        entityLabel: "AGR",
      });
    });
    let resolved = 0;
    act(() => {
      resolved = r.current.resolveSystemTasksForEntity(
        "rental.overdue",
        "rental",
        "rnt_manual1",
        "rental returned",
      );
    });
    expect(resolved).toBe(0);
    expect(r.current.taskById(id)!.status).toBe("open");
  });
});

describe("task financial non-interference", () => {
  it("creating a task changes no ledger balance", () => {
    const r = useStoreHook();
    const before = r.current.transactions.length;
    act(() => {
      r.current.createTask({ title: "T", category: "other" });
    });
    expect(r.current.transactions.length).toBe(before);
  });
  it("completing a task changes no ledger balance", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    const before = r.current.transactions.length;
    act(() => r.current.completeTask(id));
    expect(r.current.transactions.length).toBe(before);
  });
  it("cancelling a task changes no ledger balance", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    const before = r.current.transactions.length;
    act(() => r.current.cancelTask(id, "x"));
    expect(r.current.transactions.length).toBe(before);
  });
});

describe("task overdue is derived", () => {
  it("a completed task with a past due date is not overdue", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({
        title: "T",
        category: "other",
        dueDate: "2020-01-01",
      });
    });
    act(() => r.current.completeTask(id));
    expect(isTaskOverdue(r.current.taskById(id)!)).toBe(false);
  });
});

describe("task tenant isolation", () => {
  it("created tasks are tenant-scoped", () => {
    const r = useStoreHook();
    let id = "";
    act(() => {
      id = r.current.createTask({ title: "T", category: "other" });
    });
    expect(r.current.taskById(id)!.tenant_id).toBe(TENANT_ID);
  });
});
