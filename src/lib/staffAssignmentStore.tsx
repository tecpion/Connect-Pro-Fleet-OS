// Connect Pro Fleet — Operational Staff Assignment store (Build #24).
//
// A standalone React context (the main fleet store module is at its size
// ceiling). Provides create/reassign/complete/cancel for operational
// assignments, idempotent duplicate-active prevention, and audit activity
// emission. Coordinates with the main store for staff lookups + activity log.
// NOT a financial record; NOT a task.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useStore } from "./store";
import { uid, TENANT_ID } from "./store/ids";
import type {
  OperationalStaffAssignment,
  OperationalAssignmentType,
  AssignmentEntityType,
  AssignmentStatus,
  StaffNote,
  StaffNoteVisibility,
} from "./staffTypes";
import { activeAssignment, activeAssignmentsForEntity } from "./staffSelectors";
import { buildStaffLifecycleMethods } from "./staffLifecycle";
import {
  createAssignment as createAssignmentFn,
  bulkAssign as bulkAssignFn,
  reassign as reassignFn,
} from "./staffAssignmentMutations";

interface CreateAssignmentInput {
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

interface ReassignInput {
  assignment_id: string;
  new_staff_id: string;
  reason?: string | null;
}

interface StaffAssignmentStore {
  assignments: OperationalStaffAssignment[];
  staffNotes: StaffNote[];

  // queries
  assignmentById: (id: string) => OperationalStaffAssignment | undefined;
  activeAssignment: (
    entityType: AssignmentEntityType,
    entityId: string,
    type: OperationalAssignmentType,
  ) => OperationalStaffAssignment | undefined;
  activeAssignmentsForEntity: (
    entityType: AssignmentEntityType,
    entityId: string,
  ) => OperationalStaffAssignment[];
  assignmentsForStaff: (staffId: string) => OperationalStaffAssignment[];
  openAssignmentCount: (staffId: string) => number;
  /** Active assignments for a staff member, grouped by entity type label. */
  openAssignmentsByCategory: (staffId: string) => {
    entityType: AssignmentEntityType;
    items: OperationalStaffAssignment[];
  }[];
  historyForEntity: (
    entityType: AssignmentEntityType,
    entityId: string,
  ) => OperationalStaffAssignment[];

  // mutations
  createAssignment: (input: CreateAssignmentInput) => string | null;
  /** Bulk-assign one staff member to many entities of the same type/slot.
   *  Idempotent: rapid/repeated bulk assigns never create duplicate active
   *  rows. Returns the number of assignments created/confirmed. */
  bulkAssign: (input: {
    staff_id: string;
    assignment_type: OperationalAssignmentType;
    entity_type: AssignmentEntityType;
    entity_ids: string[];
    entity_label?: string | null;
    assigned_by?: string | null;
  }) => number;
  reassign: (input: ReassignInput) => string | null;
  /** Bulk-reassign all of a staff member's active assignments to another
   *  staff member (used during deactivation). Returns the count moved. */
  bulkReassign: (
    fromStaffId: string,
    toStaffId: string,
    reason?: string | null,
  ) => number;
  /** Bulk-reassign only assignments of given entity types. */
  bulkReassignByCategory: (
    fromStaffId: string,
    toStaffId: string,
    entityTypes: AssignmentEntityType[],
    reason?: string | null,
  ) => number;
  completeAssignment: (id: string) => void;
  cancelAssignment: (id: string, reason?: string | null) => void;
  completeEntityAssignments: (
    entityType: AssignmentEntityType,
    entityId: string,
    exceptTypes?: OperationalAssignmentType[],
  ) => void;

  // staff lifecycle (Build #24) — coordinate with assignments
  deactivationGuard: (staffId: string) => {
    canDeactivate: boolean;
    reason: string | null;
    remainingOwners: number;
    openAssignments: number;
  };
  setStaffStatus: (
    staffId: string,
    status: "active" | "invited" | "inactive" | "suspended",
  ) => boolean;
  changeStaffRole: (staffId: string, roleId: string) => void;
  setStaffLocations: (staffId: string, locationIds: string[]) => void;
  archiveRole: (roleId: string) => { ok: boolean; reason: string | null };

  // notes
  addStaffNote: (
    staffId: string,
    text: string,
    visibility?: StaffNoteVisibility,
  ) => void;
  staffNotesFor: (staffId: string) => StaffNote[];
}

const StaffAssignmentContext = createContext<StaffAssignmentStore | null>(null);

export function StaffAssignmentProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const [assignments, setAssignments] = useState<OperationalStaffAssignment[]>(
    [],
  );
  const [staffNotes, setStaffNotes] = useState<StaffNote[]>([]);
  // Always-current snapshot so rapid synchronous actions read authoritative state.
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;

  function logActivity(
    label: string,
    tone: "neutral" | "available" | "maintenance" | "out" = "neutral",
  ) {
    store.logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label,
      tone,
    });
  }

  const value = useMemo<StaffAssignmentStore>(() => {
    function emitReassignActivity(
      old: OperationalStaffAssignment,
      next: OperationalStaffAssignment,
      reason: string | null,
    ) {
      const oldName =
        store.staff.find((s) => s.id === old.staff_id)?.full_name ?? "—";
      const newName =
        store.staff.find((s) => s.id === next.staff_id)?.full_name ?? "—";
      logActivity(
        `Reassigned ${old.entity_type} ${old.entity_label ?? old.entity_id} (${old.assignment_type}): ${oldName} → ${newName}${reason ? ` — ${reason}` : ""}`,
        "neutral",
      );
    }

    // --- Staff lifecycle methods (Build #24) ---
    // Extracted into staffLifecycle.ts to keep this file focused. They operate
    // over the store's public staff/role API (updateStaff / updateRole) so the
    // assignment store stays the single owner of assignment history while staff
    // records live in the core store.
    const lifecycle = buildStaffLifecycleMethods({
      store,
      assignmentsRef,
      logActivity,
    });

    // Deps shared by the extracted assignment mutation module. The ref + the
    // functional setAssignments updater give the mutations authoritative,
    // render-flush-independent state for rapid/batched duplicate detection.
    const mutationDeps = {
      store,
      assignmentsRef,
      setAssignments,
      logActivity,
      emitReassignActivity,
    };

    const value: StaffAssignmentStore = {
      assignments,
      staffNotes,

      assignmentById: (id) => assignments.find((a) => a.id === id),
      activeAssignment: (entityType, entityId, type) =>
        activeAssignment(assignments, entityType, entityId, type),
      activeAssignmentsForEntity: (entityType, entityId) =>
        activeAssignmentsForEntity(assignments, entityType, entityId),
      assignmentsForStaff: (staffId) =>
        assignments
          .filter((a) => a.staff_id === staffId)
          .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1)),
      openAssignmentCount: (staffId) =>
        assignments.filter(
          (a) => a.staff_id === staffId && a.status === "active",
        ).length,
      openAssignmentsByCategory: (staffId) => {
        const active = assignments.filter(
          (a) => a.staff_id === staffId && a.status === "active",
        );
        const groups: AssignmentEntityType[] = [
          ...new Set(active.map((a) => a.entity_type)),
        ];
        return groups.map((entityType) => ({
          entityType,
          items: active
            .filter((a) => a.entity_type === entityType)
            .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1)),
        }));
      },
      historyForEntity: (entityType, entityId) =>
        assignments
          .filter(
            (a) => a.entity_type === entityType && a.entity_id === entityId,
          )
          .sort((a, b) => (a.assigned_at < b.assigned_at ? 1 : -1)),

      bulkReassign: (fromStaffId, toStaffId, reason = null) => {
        const active = assignmentsRef.current.filter(
          (a) => a.staff_id === fromStaffId && a.status === "active",
        );
        let moved = 0;
        for (const a of active) {
          if (
            value.reassign({
              assignment_id: a.id,
              new_staff_id: toStaffId,
              reason,
            })
          )
            moved++;
        }
        return moved;
      },
      bulkReassignByCategory: (
        fromStaffId,
        toStaffId,
        entityTypes,
        reason = null,
      ) => {
        const active = assignmentsRef.current.filter(
          (a) =>
            a.staff_id === fromStaffId &&
            a.status === "active" &&
            entityTypes.includes(a.entity_type),
        );
        let moved = 0;
        for (const a of active) {
          if (
            value.reassign({
              assignment_id: a.id,
              new_staff_id: toStaffId,
              reason,
            })
          )
            moved++;
        }
        return moved;
      },

      createAssignment: (input) => createAssignmentFn(mutationDeps, input),

      /** Bulk-assign one staff member to many entities of the same type/slot.
       *  Idempotent: rapid/repeated bulk assigns never create duplicate active
       *  rows because createAssignment dedupes inside its functional updater. */
      bulkAssign: (input) => bulkAssignFn(mutationDeps, input),

      reassign: (input) => reassignFn(mutationDeps, input),

      completeAssignment: (id) => {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === id && a.status === "active"
              ? {
                  ...a,
                  status: "completed" as AssignmentStatus,
                  completed_at: new Date().toISOString(),
                }
              : a,
          ),
        );
      },

      cancelAssignment: (id, reason = null) => {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === id && a.status === "active"
              ? {
                  ...a,
                  status: "cancelled" as AssignmentStatus,
                  reassign_reason: reason,
                }
              : a,
          ),
        );
      },

      completeEntityAssignments: (entityType, entityId, exceptTypes = []) => {
        setAssignments((prev) =>
          prev.map((a) => {
            if (
              a.status === "active" &&
              a.entity_type === entityType &&
              a.entity_id === entityId &&
              !exceptTypes.includes(a.assignment_type)
            ) {
              return {
                ...a,
                status: "completed" as AssignmentStatus,
                completed_at: new Date().toISOString(),
              };
            }
            return a;
          }),
        );
      },

      addStaffNote: (staffId, text, visibility = "general") => {
        const note: StaffNote = {
          id: uid("snote"),
          tenant_id: TENANT_ID,
          staff_id: staffId,
          author_id: store.currentStaffId,
          text,
          visibility,
          created_at: new Date().toISOString(),
        };
        setStaffNotes((prev) => [note, ...prev]);
      },

      staffNotesFor: (staffId) =>
        staffNotes
          .filter((n) => n.staff_id === staffId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),

      // Staff lifecycle (Build #24) — delegated to staffLifecycle.ts
      deactivationGuard: lifecycle.deactivationGuard,
      setStaffStatus: lifecycle.setStaffStatus,
      changeStaffRole: lifecycle.changeStaffRole,
      setStaffLocations: lifecycle.setStaffLocations,
      archiveRole: lifecycle.archiveRole,
    };
    return value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, staffNotes, store]);

  return (
    <StaffAssignmentContext.Provider value={value}>
      {children}
    </StaffAssignmentContext.Provider>
  );
}

export function useStaffAssignments() {
  const ctx = useContext(StaffAssignmentContext);
  if (!ctx)
    throw new Error(
      "useStaffAssignments must be used within StaffAssignmentProvider",
    );
  return ctx;
}
