// Connect Pro Fleet — TaskMethods interface (Build #11).
// Extracted from storeContext to keep it under the line limit.

import type { Task, TaskEvent, TaskNote } from "../taskTypes";
import type {
  TaskCategory,
  TaskEntityType,
  TaskPriority,
  TaskStatus,
  TaskSourceEvent,
} from "../taskTypes";

export interface TaskMethods {
  tasksForUser: (userId: string) => Task[];
  taskById: (id: string) => Task | undefined;
  taskEventLog: (taskId: string) => TaskEvent[];
  taskNoteLog: (taskId: string) => TaskNote[];
  openTasksForEntity: (
    sourceEvent: string,
    entityType: string | null,
    entityId: string | null,
  ) => Task[];
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
  }) => string;
  ensureSystemTask: (input: {
    sourceEvent: TaskSourceEvent;
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
  }) => { created: boolean; taskId: string };
  assignTask: (taskId: string, userId: string | null) => void;
  startTask: (taskId: string) => void;
  completeTask: (taskId: string, note?: string) => void;
  reopenTask: (taskId: string, toStatus?: TaskStatus) => void;
  cancelTask: (taskId: string, reason: string) => void;
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
  ) => void;
  addTaskNote: (taskId: string, text: string) => void;
  resolveSystemTasksForEntity: (
    sourceEvent: string,
    entityType: string | null,
    entityId: string | null,
    reason: string,
  ) => number;
  generateSystemTasks: () => { created: number };
}
