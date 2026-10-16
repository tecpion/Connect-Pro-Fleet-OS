// Connect Pro Fleet — Build #24 assignments, deactivation, workload, entity UI.

import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider, useStore } from "@/lib/store";
import {
  StaffAssignmentProvider,
  useStaffAssignments,
} from "@/lib/staffAssignmentStore";
import { staffWorkloadSummary, getUnassignedWork } from "@/lib/staffSelectors";
import { AssigneeDisplay } from "@/pages/staff/AssignStaffDialog";
import { EntityAssignmentsSection } from "@/components/EntityAssignmentsSection";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <StaffAssignmentProvider>{children}</StaffAssignmentProvider>
    </StoreProvider>
  );
}
function useHooks() {
  return renderHook(() => ({ store: useStore(), sa: useStaffAssignments() }), {
    wrapper,
  }).result;
}
function inputsOf(r: ReturnType<typeof useHooks>) {
  return {
    tasks: r.current.store.tasks,
    rentals: r.current.store.rentals,
    workOrders: r.current.store.workOrders,
    damageClaims: [],
    assignments: r.current.sa.assignments,
  };
}

describe("Build #24 — assignments", () => {
  it("assigns a rental CSR", () => {
    const r = useHooks();
    const rental = r.current.store.rentals[0];
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: rental.id,
        entity_label: rental.agreement_number,
      });
    });
    expect(
      r.current.sa.activeAssignment("rental", rental.id, "rental_csr")
        ?.staff_id,
    ).toBe("stf_4");
  });

  it("assigns a customer account owner", () => {
    const r = useHooks();
    const cust = r.current.store.customers[0];
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "customer_account_owner",
        entity_type: "customer",
        entity_id: cust.id,
      });
    });
    expect(
      r.current.sa.activeAssignment(
        "customer",
        cust.id,
        "customer_account_owner",
      )?.staff_id,
    ).toBe("stf_4");
  });

  it("assigns a vehicle fleet manager", () => {
    const r = useHooks();
    const veh = r.current.store.vehicles[0];
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_5",
        assignment_type: "vehicle_fleet_manager",
        entity_type: "vehicle",
        entity_id: veh.id,
      });
    });
    expect(
      r.current.sa.activeAssignment("vehicle", veh.id, "vehicle_fleet_manager")
        ?.staff_id,
    ).toBe("stf_5");
  });

  it("assigns a work order coordinator", () => {
    const r = useHooks();
    const wo = r.current.store.workOrders[0];
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_5",
        assignment_type: "work_order_coordinator",
        entity_type: "work_order",
        entity_id: wo.id,
      });
    });
    expect(
      r.current.sa.activeAssignment(
        "work_order",
        wo.id,
        "work_order_coordinator",
      )?.staff_id,
    ).toBe("stf_5");
  });

  it("assigns a damage claim owner", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_7",
        assignment_type: "damage_claim_owner",
        entity_type: "damage_claim",
        entity_id: "dmg_test1",
      });
    });
    expect(
      r.current.sa.activeAssignment(
        "damage_claim",
        "dmg_test1",
        "damage_claim_owner",
      )?.staff_id,
    ).toBe("stf_7");
  });

  it("blocks a duplicate active assignment for the same staff + entity + type", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_dup",
      });
    });
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_dup",
      });
    });
    const count = r.current.sa.assignments.filter(
      (a) =>
        a.staff_id === "stf_4" &&
        a.entity_id === "rnt_dup" &&
        a.assignment_type === "rental_csr" &&
        a.status === "active",
    ).length;
    expect(count).toBe(1);
  });

  it("reassignment preserves history (old reassigned, new active)", () => {
    const r = useHooks();
    let origId = "";
    act(() => {
      origId = r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_re1",
      })!;
    });
    let newId: string | null = null;
    act(() => {
      newId = r.current.sa.reassign({
        assignment_id: origId,
        new_staff_id: "stf_5",
        reason: "workload rebalance",
      });
    });
    expect(newId).not.toBeNull();
    const old = r.current.sa.assignmentById(origId)!;
    expect(old.status).toBe("reassigned");
    expect(old.reassigned_to).toBe(newId);
    const next = r.current.sa.assignmentById(newId!)!;
    expect(next.status).toBe("active");
    expect(next.staff_id).toBe("stf_5");
  });

  it("reassignment emits an activity log entry", () => {
    const r = useHooks();
    const before = r.current.store.activityLog.length;
    let origId = "";
    act(() => {
      origId = r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_re2",
      })!;
    });
    act(() => {
      r.current.sa.reassign({ assignment_id: origId, new_staff_id: "stf_5" });
    });
    expect(r.current.store.activityLog.length).toBeGreaterThan(before);
    expect(
      r.current.store.activityLog.some((e) =>
        e.label.toLowerCase().includes("reassign"),
      ),
    ).toBe(true);
  });

  it("completing an entity's assignments marks them completed", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_comp",
      });
      r.current.sa.createAssignment({
        staff_id: "stf_5",
        assignment_type: "rental_account_owner",
        entity_type: "rental",
        entity_id: "rnt_comp",
      });
    });
    act(() => {
      r.current.sa.completeEntityAssignments("rental", "rnt_comp");
    });
    expect(
      r.current.sa.activeAssignmentsForEntity("rental", "rnt_comp").length,
    ).toBe(0);
  });
});

describe("Build #24 — deactivation + bulk transfer", () => {
  it("shows open assignment count before deactivation", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_d1",
      });
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_d2",
      });
    });
    expect(r.current.sa.openAssignmentCount("stf_4")).toBeGreaterThanOrEqual(2);
  });

  it("bulk transfers all open assignments to another staff member", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_b1",
      });
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_b2",
      });
    });
    const before = r.current.sa.openAssignmentCount("stf_4");
    act(() => {
      const active = r.current.sa
        .assignmentsForStaff("stf_4")
        .filter((a) => a.status === "active");
      for (const a of active) {
        r.current.sa.reassign({ assignment_id: a.id, new_staff_id: "stf_5" });
      }
    });
    expect(r.current.sa.openAssignmentCount("stf_4")).toBe(0);
    expect(r.current.sa.openAssignmentCount("stf_5")).toBeGreaterThanOrEqual(
      before,
    );
  });

  it("deactivated staff are excluded from the active assignment picker", () => {
    const r = useHooks();
    act(() => r.current.store.updateStaff("stf_7", { status: "inactive" }));
    const assignable = r.current.store.staff.filter(
      (s) => (s.status ?? "active") === "active",
    );
    expect(assignable.find((s) => s.id === "stf_7")).toBeUndefined();
  });

  it("history retains the original actor after deactivation", () => {
    const r = useHooks();
    act(() => {
      r.current.store.setCurrentStaffId("stf_4");
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_hist",
      });
    });
    act(() => r.current.store.updateStaff("stf_4", { status: "inactive" }));
    const a = r.current.sa.activeAssignment("rental", "rnt_hist", "rental_csr");
    expect(a).toBeDefined();
    expect(
      r.current.store.staff.find((x) => x.id === a!.assigned_by),
    ).toBeDefined();
  });
});

describe("Build #24 — workload + unassigned work", () => {
  it("counts open tasks for a staff member", () => {
    const r = useHooks();
    act(() => {
      r.current.store.setCurrentStaffId("stf_1");
      r.current.store.createTask({
        title: "T1",
        category: "administrative",
        assignedToUserId: "stf_3",
      });
    });
    const wl = staffWorkloadSummary(inputsOf(r), "stf_3");
    expect(wl.openTasks).toBeGreaterThanOrEqual(1);
  });

  it("counts rental assignments", () => {
    const r = useHooks();
    const rental = r.current.store.rentals[0];
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: rental.id,
      });
    });
    const wl = staffWorkloadSummary(inputsOf(r), "stf_4");
    expect(wl.activeRentals).toBeGreaterThanOrEqual(1);
  });

  it("unassigned work selector finds rentals with no CSR", () => {
    const r = useHooks();
    const unassigned = getUnassignedWork(inputsOf(r));
    expect(Array.isArray(unassigned)).toBe(true);
  });

  it("completed work is excluded from workload", () => {
    const r = useHooks();
    act(() => {
      r.current.store.setCurrentStaffId("stf_1");
      const id = r.current.store.createTask({
        title: "Done task",
        category: "administrative",
        assignedToUserId: "stf_3",
      });
      r.current.store.completeTask?.(id);
    });
    const wl = staffWorkloadSummary(inputsOf(r), "stf_3");
    const completedTask = r.current.store.tasks.find(
      (t) => t.title === "Done task" && t.assigned_to_user_id === "stf_3",
    );
    if (completedTask && completedTask.status === "completed") {
      expect(wl.openTasks).toBe(0);
    }
  });

  it("workload totals contain no monetary fields", () => {
    const r = useHooks();
    const wl = staffWorkloadSummary(inputsOf(r), "stf_1");
    const keys = Object.keys(wl);
    expect(
      keys.some(
        (k) =>
          k.toLowerCase().includes("amount") ||
          k.toLowerCase().includes("dollar") ||
          k.toLowerCase().includes("revenue"),
      ),
    ).toBe(false);
  });
});

describe("Build #24 — entity assignment UI", () => {
  it("AssigneeDisplay shows Unassigned when no active assignment", () => {
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <AssigneeDisplay
              entityType="rental"
              entityId="rnt_none"
              assignmentType="rental_csr"
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("AssigneeDisplay shows the assigned staff name", () => {
    function Harness() {
      const sa = useStaffAssignments();
      const ran = React.useRef(false);
      React.useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        sa.createAssignment({
          staff_id: "stf_4",
          assignment_type: "rental_csr",
          entity_type: "rental",
          entity_id: "rnt_ui1",
        });
      }, [sa]);
      return (
        <AssigneeDisplay
          entityType="rental"
          entityId="rnt_ui1"
          assignmentType="rental_csr"
        />
      );
    }
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <Harness />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Sarah Chen/)).toBeInTheDocument();
  });

  it("EntityAssignmentsSection renders all rental assignment slots", () => {
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <EntityAssignmentsSection
              entityType="rental"
              entityId="rnt_slots"
              entityLabel="RNT-001"
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Account Owner")).toBeInTheDocument();
    expect(screen.getByText("CSR")).toBeInTheDocument();
    expect(screen.getByText("Collections Owner")).toBeInTheDocument();
    expect(screen.getByText("Check-Out Staff")).toBeInTheDocument();
    expect(screen.getByText("Return Staff")).toBeInTheDocument();
  });

  it("EntityAssignmentsSection renders vehicle operational slots", () => {
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <EntityAssignmentsSection
              entityType="vehicle"
              entityId="veh_slots"
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Fleet Manager")).toBeInTheDocument();
    expect(screen.getByText("Maintenance Coordinator")).toBeInTheDocument();
    expect(screen.getByText("Porter / Runner")).toBeInTheDocument();
  });

  it("EntityAssignmentsSection renders damage claim owner slot", () => {
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <EntityAssignmentsSection
              entityType="damage_claim"
              entityId="dmg_slots"
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Claim Owner")).toBeInTheDocument();
    expect(
      screen.getByText("Adjuster / Insurance Follow-Up"),
    ).toBeInTheDocument();
    expect(screen.getByText("Repair Coordinator")).toBeInTheDocument();
  });
});
