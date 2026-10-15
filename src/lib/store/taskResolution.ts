// Connect Pro Fleet — system task resolution helper (Build #11).
//
// Tiny shared helper so domain stores (deposit, rental, ...) can resolve matching
// open SYSTEM tasks when an underlying condition clears — without each store
// duplicating the find + complete + event-log logic. Marks the tasks completed
// with a system reason; never deletes. Only affects system tasks found by
// source_event + entity. Manual tasks are never touched.

import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import { findOpenSystemTasksForEntity } from "../taskSelectors";

export function resolveSystemTasks(
  s: StoreState,
  sourceEvent: string,
  entityType: string | null,
  entityId: string | null,
  reason: string,
): number {
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
  s.setTaskEvents((es) => [
    ...open.map((t) => ({
      id: uid("tev"),
      tenant_id: TENANT_ID,
      task_id: t.id,
      type: "system_resolved" as const,
      label: `System resolved — ${reason}`,
      at: now,
      actor_id: null,
      actor_is_system: true,
    })),
    ...es,
  ]);
  return open.length;
}
