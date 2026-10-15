// Connect Pro Fleet — task store methods (Build #11).
//
// The operational work layer: create (manual + system), assign/reassign, start,
// complete, reopen, cancel, edit, add notes. Tasks are NOT financial transactions
// — they track human work. Task HISTORY is append-oriented (TaskEvent[]); the
// task record itself is mutable operational state.
//
// System tasks are idempotent via a stable dedupe_key (source_event + entity +
// occurrence). Re-running the same trigger never creates a duplicate open task.
// Domain actions can RESOLVE matching system tasks (e.g. an actual deposit
// refund resolves the "process deposit refund" system task) via
// resolveSystemTasksForEntity — marked completed with a system reason, never
// deleted. Manual tasks are never auto-resolved by domain status changes.
//
// The SYSTEM actor is represented by actor_id: null + actor_is_system: true —
// never a fabricated staff user id.

import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type {
  TaskCategory,
  TaskEntityType,
  TaskPriority,
  TaskStatus,
} from "../taskTypes";
import {
  findOpenSystemTask,
  findOpenSystemTasksForEntity,
  nextTaskNumber,
  systemTaskDedupeKey,
} from "../taskSelectors";
import { TENANT_ID, uid } from "./ids";
import { toneForTaskCategory } from "../staffActivityMeta";
import type { StoreState } from "./storeState";
import { generateSystemTasksPass } from "./taskSystem";
import type { CreateNotificationInput } from "./notificationContext";

export function buildTaskMethods(
  s: StoreState,
  deps: { notify: (input: CreateNotificationInput) => string | null },
) {
  function logEvent(
    taskId: string,
    type: TaskEvent["type"],
    label: string,
    opts?: {
      actorId?: string | null;
      actorIsSystem?: boolean;
      oldValue?: string | null;
      newValue?: string | null;
    },
  ) {
    const ev: TaskEvent = {
      id: uid("tev"),
      tenant_id: TENANT_ID,
      task_id: taskId,
      type,
      label,
      at: new Date().toISOString(),
      actor_id: opts?.actorId === undefined ? s.currentStaffId : opts.actorId,
      actor_is_system: opts?.actorIsSystem ?? false,
      old_value: opts?.oldValue ?? null,
      new_value: opts?.newValue ?? null,
    };
    s.setTaskEvents((es) => [ev, ...es]);
  }

  function logAct(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "neutral",
  ) {
    s.setActivity((a) =>
      [
        { id: uid("act"), at: new Date().toISOString(), label, tone },
        ...a,
      ].slice(0, 30),
    );
  }

  function patchTask(taskId: string, patch: Partial<Task>) {
    s.setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? { ...t, ...patch, updated_at: new Date().toISOString() }
          : t,
      ),
    );
  }

  function staffName(id: string | null): string {
    if (!id) return "System";
    const st = s.staff.find((x) => x.id === id);
    return st ? st.full_name : "—";
  }

  function addNoteInternal(taskId: string, text: string) {
    const note: TaskNote = {
      id: uid("tno"),
      tenant_id: TENANT_ID,
      task_id: taskId,
      author_id: s.currentStaffId,
      author_is_system: false,
      text,
      at: new Date().toISOString(),
    };
    s.setTaskNotes((ns) => [note, ...ns]);
    logEvent(taskId, "note_added", `Note added`);
  }

  const ensureSystemTask = (input: {
    sourceEvent: import("../taskTypes").TaskSourceEvent;
    entityType: TaskEntityType;
    entityId: string;
    entityLabel: string;
    title: string;
    description?: string | null;
    category: TaskCategory;
    priority?: TaskPriority;
    occurrence?: string;
    assignedToUserId?: string | null;
    dueDate?: string | null;
  }): { created: boolean; taskId: string } => {
    const occurrence = input.occurrence ?? "1";
    const dedupeKey = systemTaskDedupeKey(
      input.sourceEvent,
      input.entityType,
      input.entityId,
      occurrence,
    );
    const existing = findOpenSystemTask(s.tasks, dedupeKey);
    if (existing) return { created: false, taskId: existing.id };
    const now = new Date().toISOString();
    const id = uid("tsk");
    const task: Task = {
      id,
      tenant_id: TENANT_ID,
      task_number: nextTaskNumber(s.tasks),
      title: input.title,
      description: input.description ?? null,
      status: "open",
      priority: input.priority ?? "high",
      source_type: "system",
      source_event: input.sourceEvent,
      assigned_to_user_id: input.assignedToUserId ?? null,
      assigned_by_user_id: null,
      created_by_user_id: null,
      due_date: input.dueDate ?? null,
      due_time: null,
      completed_at: null,
      completed_by_user_id: null,
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancellation_reason: null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      entity_label: input.entityLabel,
      location_id: null,
      category: input.category,
      tags: [],
      notes: null,
      dedupe_key: dedupeKey,
      created_at: now,
      updated_at: now,
    };
    s.setTasks((ts) => [task, ...ts]);
    logEvent(id, "system_generated", `System task generated — ${input.title}`, {
      actorId: null,
      actorIsSystem: true,
    });
    // Staff Activity category safety: the tone must reflect the task's actual
    // domain (its category), not a generic "maintenance" fallback. A driver-
    // verification follow-up or an overdue-rental task is NOT maintenance.
    logAct(
      `System task created — ${input.title}`,
      toneForTaskCategory(input.category),
    );
    return { created: true, taskId: id };
  };

  return {
    // --- selectors ----------------------------------------------------------
    tasksForUser: (userId: string): Task[] =>
      s.tasks.filter((t) => t.assigned_to_user_id === userId),
    taskById: (id: string): Task | undefined =>
      s.tasks.find((t) => t.id === id),
    taskEventLog: (taskId: string): TaskEvent[] =>
      s.taskEvents
        .filter((e) => e.task_id === taskId)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    taskNoteLog: (taskId: string): TaskNote[] =>
      s.taskNotes
        .filter((n) => n.task_id === taskId)
        .sort((a, b) => (a.at < b.at ? 1 : -1)),
    openTasksForEntity: (
      sourceEvent: string,
      entityType: string | null,
      entityId: string | null,
    ): Task[] =>
      findOpenSystemTasksForEntity(s.tasks, sourceEvent, entityType, entityId),

    // --- manual creation ----------------------------------------------------
    createTask: (input: {
      title: string;
      description?: string | null;
      category: TaskCategory;
      priority?: TaskPriority;
      assignedToUserId?: string | null;
      dueDate?: string | null;
      dueTime?: string | null;
      entityType?: TaskEntityType | null;
      entityId?: string | null;
      entityLabel?: string | null;
      locationId?: string | null;
      notes?: string | null;
      tags?: string[];
    }): string => {
      const now = new Date().toISOString();
      const id = uid("tsk");
      const task: Task = {
        id,
        tenant_id: TENANT_ID,
        task_number: nextTaskNumber(s.tasks),
        title: input.title,
        description: input.description ?? null,
        status: "open",
        priority: input.priority ?? "normal",
        source_type: "manual",
        source_event: null,
        assigned_to_user_id: input.assignedToUserId ?? null,
        assigned_by_user_id: input.assignedToUserId ? s.currentStaffId : null,
        created_by_user_id: s.currentStaffId,
        due_date: input.dueDate ?? null,
        due_time: input.dueTime ?? null,
        completed_at: null,
        completed_by_user_id: null,
        cancelled_at: null,
        cancelled_by_user_id: null,
        cancellation_reason: null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        entity_label: input.entityLabel ?? null,
        location_id: input.locationId ?? null,
        category: input.category,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        dedupe_key: null,
        created_at: now,
        updated_at: now,
      };
      s.setTasks((ts) => [task, ...ts]);
      logEvent(id, "created", "Task created");
      if (input.assignedToUserId)
        logEvent(
          id,
          "assigned",
          `Assigned to ${staffName(input.assignedToUserId)}`,
        );
      logAct(`Task created — ${input.title}`, "neutral");
      return id;
    },

    ensureSystemTask,

    // --- assignment ---------------------------------------------------------
    assignTask: (taskId: string, userId: string | null): void => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const oldAssignee = t.assigned_to_user_id
        ? staffName(t.assigned_to_user_id)
        : "Unassigned";
      const newAssignee = userId ? staffName(userId) : "Unassigned";
      const isReassign = !!(userId && t.assigned_to_user_id);
      patchTask(taskId, {
        assigned_to_user_id: userId,
        assigned_by_user_id: userId ? s.currentStaffId : null,
      });
      logEvent(
        taskId,
        isReassign ? "reassigned" : "assigned",
        isReassign
          ? `Reassigned from ${oldAssignee} to ${newAssignee}`
          : `Assigned to ${newAssignee}`,
        { oldValue: oldAssignee, newValue: newAssignee },
      );
      // Notify the new assignee (not the actor for self-assignment, not the old
      // assignee). Low-noise: one notification per assignment event.
      if (userId && userId !== s.currentStaffId) {
        deps.notify({
          recipientUserId: userId,
          type: isReassign ? "task.reassigned" : "task.assigned",
          title: `${isReassign ? "Task reassigned" : "New task assigned"}: ${t.title}`,
          message: isReassign
            ? `${staffName(s.currentStaffId)} reassigned this task to you.`
            : `${staffName(s.currentStaffId)} assigned this task to you.`,
          entityType: t.entity_type,
          entityId: t.entity_id,
          entityLabel: t.entity_label,
          actionUrl: `/tasks?task=${taskId}`,
          sourceEventId: taskId,
          occurrence: isReassign ? `reassign-${Date.now()}` : "1",
          actorUserId: s.currentStaffId,
          metadata: { task_id: taskId },
        });
      }
    },

    // --- lifecycle ----------------------------------------------------------
    startTask: (taskId: string): void => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t || t.status !== "open") return;
      patchTask(taskId, { status: "in_progress" });
      logEvent(taskId, "started", "Task started");
    },
    completeTask: (taskId: string, note?: string): void => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t || t.status === "completed" || t.status === "cancelled") return;
      const now = new Date().toISOString();
      patchTask(taskId, {
        status: "completed",
        completed_at: now,
        completed_by_user_id: s.currentStaffId,
      });
      logEvent(
        taskId,
        "completed",
        `Task completed${note ? ` — ${note}` : ""}`,
      );
      logAct(`Task completed — ${t.title}`, "available");
      if (note) addNoteInternal(taskId, note);
    },
    reopenTask: (taskId: string, toStatus?: TaskStatus): void => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t || t.status !== "completed") return;
      const status = toStatus === "in_progress" ? "in_progress" : "open";
      patchTask(taskId, {
        status,
        completed_at: null,
        completed_by_user_id: null,
      });
      logEvent(
        taskId,
        "reopened",
        `Task reopened — ${status === "in_progress" ? "in progress" : "open"}`,
      );
    },
    cancelTask: (taskId: string, reason: string): void => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t || t.status === "completed" || t.status === "cancelled") return;
      const now = new Date().toISOString();
      patchTask(taskId, {
        status: "cancelled",
        cancelled_at: now,
        cancelled_by_user_id: s.currentStaffId,
        cancellation_reason: reason,
      });
      logEvent(taskId, "cancelled", `Task cancelled — ${reason}`, {
        newValue: reason,
      });
      logAct(`Task cancelled — ${t.title}`, "neutral");
    },

    // --- editing / notes ----------------------------------------------------
    editTask: (
      taskId: string,
      patch: Partial<
        Pick<
          Task,
          | "title"
          | "description"
          | "priority"
          | "category"
          | "due_date"
          | "due_time"
          | "entity_type"
          | "entity_id"
          | "entity_label"
          | "location_id"
          | "tags"
          | "notes"
        >
      >,
    ): void => {
      const t = s.tasks.find((x) => x.id === taskId);
      if (!t) return;
      if (patch.priority && patch.priority !== t.priority)
        logEvent(taskId, "priority_changed", `Priority changed`, {
          oldValue: t.priority,
          newValue: patch.priority,
        });
      if (patch.due_date !== undefined && patch.due_date !== t.due_date)
        logEvent(taskId, "due_date_changed", `Due date changed`, {
          oldValue: t.due_date ?? "—",
          newValue: patch.due_date ?? "—",
        });
      patchTask(taskId, patch);
    },
    addTaskNote: (taskId: string, text: string): void =>
      addNoteInternal(taskId, text),

    // --- system task resolution --------------------------------------------
    resolveSystemTasksForEntity: (
      sourceEvent: string,
      entityType: string | null,
      entityId: string | null,
      reason: string,
    ): number => {
      const open = findOpenSystemTasksForEntity(
        s.tasks,
        sourceEvent,
        entityType,
        entityId,
      );
      if (open.length === 0) return 0;
      const now = new Date().toISOString();
      const ids = new Set(open.map((t) => t.id));
      s.setTasks((ts) =>
        ts.map((t) =>
          ids.has(t.id)
            ? {
                ...t,
                status: "completed",
                completed_at: now,
                completed_by_user_id: null,
                updated_at: now,
              }
            : t,
        ),
      );
      for (const t of open) {
        logEvent(t.id, "system_resolved", `System resolved — ${reason}`, {
          actorId: null,
          actorIsSystem: true,
        });
      }
      return open.length;
    },

    // --- system task generation pass ---------------------------------------
    generateSystemTasks: (): { created: number } =>
      generateSystemTasksPass(s, ensureSystemTask),
  };
}
