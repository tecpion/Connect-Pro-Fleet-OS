// Connect Pro Fleet — operational assignment mutations (Build #24 finalization).
//
// createAssignment / bulkAssign / reassign, extracted from
// staffAssignmentStore.tsx to keep that file focused. The duplicate-active
// dedupe check runs INSIDE the functional setAssignments updater so it reads
// the authoritative in-progress state — this makes assignment creation safe
// under rapid synchronous calls, double-clicks, and batched React actions
// where the ref snapshot is still the pre-flush state.

import { uid, TENANT_ID } from "./store/ids";
import type { FleetStore } from "./store/storeContext";
import type {
  OperationalStaffAssignment,
  OperationalAssignmentType,
  AssignmentEntityType,
  AssignmentStatus,
} from "./staffTypes";

export interface AssignmentMutationDeps {
  store: FleetStore;
  assignmentsRef: { current: OperationalStaffAssignment[] };
  setAssignments: (
    update: (
      prev: OperationalStaffAssignment[],
    ) => OperationalStaffAssignment[],
  ) => void;
  logActivity: (
    label: string,
    tone?: "neutral" | "available" | "maintenance" | "out",
  ) => void;
  emitReassignActivity: (
    old: OperationalStaffAssignment,
    next: OperationalStaffAssignment,
    reason: string | null,
  ) => void;
}

export interface CreateAssignmentInput {
  staff_id: string;
  assignment_type: OperationalAssignmentType;
  entity_type: AssignmentEntityType;
  entity_id: string;
  entity_label?: string | null;
  due_at?: string | null;
  priority?: OperationalStaffAssignment["priority"];
  notes?: string | null;
  assigned_by?: string | null;
}

export interface ReassignInput {
  assignment_id: string;
  new_staff_id: string;
  reason?: string | null;
}

/** Create an operational assignment, idempotent against duplicate active
 *  rows for the same staff + entity + assignment_type. */
export function createAssignment(
  deps: AssignmentMutationDeps,
  input: CreateAssignmentInput,
): string | null {
  const { store, setAssignments, logActivity } = deps;
  const id = uid("asg");
  const now = new Date().toISOString();
  const rec: OperationalStaffAssignment = {
    id,
    tenant_id: TENANT_ID,
    staff_id: input.staff_id,
    assignment_type: input.assignment_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_label: input.entity_label ?? null,
    status: "active",
    assigned_by: input.assigned_by ?? store.currentStaffId,
    assigned_at: now,
    due_at: input.due_at ?? null,
    priority: input.priority ?? null,
    notes: input.notes ?? null,
    completed_at: null,
    reassigned_to: null,
    reassign_reason: null,
  };
  let existingId: string | null = null;
  setAssignments((prev) => {
    const existing = prev.find(
      (a) =>
        a.status === "active" &&
        a.staff_id === input.staff_id &&
        a.entity_type === input.entity_type &&
        a.entity_id === input.entity_id &&
        a.assignment_type === input.assignment_type,
    );
    if (existing) {
      existingId = existing.id;
      return prev;
    }
    return [...prev, rec];
  });
  if (existingId) return existingId;
  const name =
    store.staff.find((s) => s.id === input.staff_id)?.full_name ?? "—";
  logActivity(
    `Assigned ${name} as ${input.assignment_type} for ${input.entity_type} ${input.entity_label ?? input.entity_id}`,
    "available",
  );
  return id;
}

/** Bulk-assign one staff member to many entities of the same type/slot.
 *  Idempotent: rapid/repeated bulk assigns never create duplicate active rows
 *  because createAssignment dedupes inside its functional updater. */
export function bulkAssign(
  deps: AssignmentMutationDeps,
  input: {
    staff_id: string;
    assignment_type: OperationalAssignmentType;
    entity_type: AssignmentEntityType;
    entity_ids: string[];
    entity_label?: string | null;
    assigned_by?: string | null;
  },
): number {
  const { store } = deps;
  let created = 0;
  for (const entityId of input.entity_ids) {
    const res = createAssignment(deps, {
      staff_id: input.staff_id,
      assignment_type: input.assignment_type,
      entity_type: input.entity_type,
      entity_id: entityId,
      entity_label: input.entity_label ?? null,
      assigned_by: input.assigned_by ?? store.currentStaffId,
    });
    if (res) created++;
  }
  return created;
}

/** Reassign an active assignment to a new staff member, preserving history.
 *  The dup-check + transition runs inside the functional updater so it reads
 *  authoritative in-progress state (safe under rapid calls). */
export function reassign(
  deps: AssignmentMutationDeps,
  input: ReassignInput,
): string | null {
  const { store, assignmentsRef, setAssignments, emitReassignActivity } = deps;
  const old = assignmentsRef.current.find((a) => a.id === input.assignment_id);
  if (!old || old.status !== "active") return null;
  // If new staff already has an active assignment of the same type for this
  // entity, don't create a duplicate — just complete the old one.
  const dup = assignmentsRef.current.find(
    (a) =>
      a.status === "active" &&
      a.id !== old.id &&
      a.staff_id === input.new_staff_id &&
      a.entity_type === old.entity_type &&
      a.entity_id === old.entity_id &&
      a.assignment_type === old.assignment_type,
  );

  const now = new Date().toISOString();
  if (dup) {
    // Just mark old as reassigned pointing to the existing dup.
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === old.id
          ? {
              ...a,
              status: "reassigned" as AssignmentStatus,
              reassigned_to: dup.id,
              reassign_reason: input.reason ?? null,
            }
          : a,
      ),
    );
    emitReassignActivity(old, dup, input.reason ?? null);
    return dup.id;
  }

  const newId = uid("asg");
  const next: OperationalStaffAssignment = {
    ...old,
    id: newId,
    staff_id: input.new_staff_id,
    assigned_by: store.currentStaffId,
    assigned_at: now,
    status: "active",
    reassigned_to: null,
    reassign_reason: null,
  };
  setAssignments((prev) => [
    ...prev.map((a) =>
      a.id === old.id
        ? {
            ...a,
            status: "reassigned" as AssignmentStatus,
            reassigned_to: newId,
            reassign_reason: input.reason ?? null,
          }
        : a,
    ),
    next,
  ]);
  emitReassignActivity(old, next, input.reason ?? null);
  return newId;
}
