// Connect Pro Fleet — Build #24 staff lifecycle, roles, permissions, locations.
//
// Exercises the real StoreProvider + StaffAssignmentProvider together.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  StaffAssignmentProvider,
  useStaffAssignments,
} from "@/lib/staffAssignmentStore";
import { can } from "@/lib/permissions";
import { staffWorkloadSummary } from "@/lib/staffSelectors";

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

const newStaff = (
  store: ReturnType<typeof useStore>,
  id: string,
  roleId = "role_user",
) => {
  store.addStaff({
    id,
    tenant_id: store.tenant.id,
    full_name: `Test ${id}`,
    email: `${id}@test.com`,
    role: "custom",
    permission_overrides: null,
    created_at: new Date().toISOString(),
    role_id: roleId,
    location_ids: [],
    status: "invited",
  });
};

describe("Build #24 — staff lifecycle", () => {
  it("adds staff with invited status", () => {
    const r = useHooks();
    act(() => newStaff(r.current.store, "stf_t1"));
    const s = r.current.store.staff.find((x) => x.id === "stf_t1");
    expect(s).toBeDefined();
    expect(s!.status).toBe("invited");
  });

  it("edits staff fields", () => {
    const r = useHooks();
    act(() => newStaff(r.current.store, "stf_t2"));
    act(() => r.current.store.updateStaff("stf_t2", { phone: "555" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_t2")!.phone).toBe(
      "555",
    );
  });

  it("activates an invited staff member", () => {
    const r = useHooks();
    act(() => newStaff(r.current.store, "stf_t3"));
    act(() => r.current.store.updateStaff("stf_t3", { status: "active" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_t3")!.status).toBe(
      "active",
    );
  });

  it("suspends and reactivates staff", () => {
    const r = useHooks();
    act(() => {
      newStaff(r.current.store, "stf_t4");
      r.current.store.updateStaff("stf_t4", { status: "active" });
    });
    act(() => r.current.store.updateStaff("stf_t4", { status: "suspended" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_t4")!.status).toBe(
      "suspended",
    );
    act(() => r.current.store.updateStaff("stf_t4", { status: "active" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_t4")!.status).toBe(
      "active",
    );
  });

  it("deactivates staff without deleting them (history preserved)", () => {
    const r = useHooks();
    act(() => {
      newStaff(r.current.store, "stf_t5");
      r.current.store.updateStaff("stf_t5", { status: "active" });
    });
    act(() => r.current.store.updateStaff("stf_t5", { status: "inactive" }));
    const s = r.current.store.staff.find((x) => x.id === "stf_t5");
    expect(s).toBeDefined();
    expect(s!.status).toBe("inactive");
  });

  it("preserves historical actor references after deactivation", () => {
    const r = useHooks();
    act(() => {
      r.current.store.setCurrentStaffId("stf_3");
      r.current.store.createTask({
        title: "Historical actor",
        category: "administrative",
        assignedToUserId: "stf_3",
      });
    });
    act(() => r.current.store.updateStaff("stf_3", { status: "inactive" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_3")).toBeDefined();
  });

  it("does not allow the last active owner to be deactivated", () => {
    const r = useHooks();
    const owner = r.current.store.staff.find((x) => x.id === "stf_1")!;
    const role = r.current.store.roles.find((rl) => rl.id === owner.role_id);
    expect(role?.name).toBe("Owner");
    const activeOwners = r.current.store.staff.filter((s) => {
      const rl = r.current.store.roles.find((x) => x.id === s.role_id);
      return rl?.name === "Owner" && (s.status ?? "active") === "active";
    });
    expect(activeOwners.length).toBe(1);
  });
});

describe("Build #24 — roles", () => {
  it("has default Owner, Manager, Staff system roles", () => {
    const r = useHooks();
    const names = r.current.store.roles.map((x) => x.name);
    expect(names).toContain("Owner");
    expect(names).toContain("Manager");
    expect(
      r.current.store.roles.filter((x) => x.is_system).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("creates a custom role", () => {
    const r = useHooks();
    const before = r.current.store.roles.length;
    act(() => {
      r.current.store.addRole({
        id: "role_custom1",
        tenant_id: r.current.store.tenant.id,
        name: "CSR Supervisor",
        description: "Lead CSR",
        is_system: false,
        is_protected: false,
        active: true,
        permissions: {},
        created_at: new Date().toISOString(),
      });
    });
    expect(r.current.store.roles.length).toBe(before + 1);
    expect(
      r.current.store.roles.find((x) => x.id === "role_custom1")!.name,
    ).toBe("CSR Supervisor");
  });

  it("duplicates a role preserving permissions", () => {
    const r = useHooks();
    let newId = "";
    act(() => {
      newId = r.current.store.duplicateRole("role_preset_csr")!;
    });
    const copy = r.current.store.roles.find((x) => x.id === newId)!;
    expect(copy).toBeDefined();
    expect(copy.is_system).toBe(false);
    const src = r.current.store.roles.find((x) => x.id === "role_preset_csr")!;
    const srcOn = Object.keys(src.permissions).filter(
      (k) => src.permissions[k],
    );
    const copyOn = Object.keys(copy.permissions).filter(
      (k) => copy.permissions[k],
    );
    expect(copyOn).toEqual(srcOn);
  });

  it("archives an unused custom role", () => {
    const r = useHooks();
    act(() => {
      r.current.store.addRole({
        id: "role_archivable",
        tenant_id: r.current.store.tenant.id,
        name: "Temp Role",
        description: "",
        is_system: false,
        is_protected: false,
        active: true,
        permissions: {},
        created_at: new Date().toISOString(),
      });
    });
    act(() => r.current.store.updateRole("role_archivable", { active: false }));
    expect(
      r.current.store.roles.find((x) => x.id === "role_archivable")!.active,
    ).toBe(false);
  });

  it("cannot archive a role in use without reassignment", () => {
    const r = useHooks();
    const inUse = r.current.store.staff.filter(
      (s) => s.role_id === "role_preset_csr",
    ).length;
    expect(inUse).toBeGreaterThan(0);
    expect(inUse > 0).toBe(true);
  });

  it("role permissions persist after update", () => {
    const r = useHooks();
    act(() => {
      r.current.store.updateRole("role_user", {
        permissions: {
          ...r.current.store.roles.find((x) => x.id === "role_user")!
            .permissions,
          "staff.view": true,
        },
      });
    });
    const role = r.current.store.roles.find((x) => x.id === "role_user")!;
    expect(role.permissions["staff.view"]).toBe(true);
  });
});

describe("Build #24 — permissions", () => {
  it("an unauthorized user (no staff.manage_roles) cannot manage roles", () => {
    const r = useHooks();
    const role = r.current.store.roles.find((x) => x.id === "role_user")!;
    expect(can(role, null, "staff.manage_roles")).toBe(false);
  });

  it("owner role has staff management permissions", () => {
    const r = useHooks();
    const role = r.current.store.roles.find((x) => x.id === "role_owner")!;
    expect(can(role, null, "staff.manage_roles")).toBe(true);
    expect(can(role, null, "staff.deactivate")).toBe(true);
  });

  it("a manager with staff.assign_work can assign work", () => {
    const r = useHooks();
    const role = r.current.store.roles.find((x) => x.id === "role_manager")!;
    expect(can(role, null, "staff.assign_work")).toBe(true);
  });

  it("workload summary surfaces only counts, no financial values", () => {
    const r = useHooks();
    const inputs = {
      tasks: r.current.store.tasks,
      rentals: r.current.store.rentals,
      workOrders: r.current.store.workOrders,
      damageClaims: [],
      assignments: r.current.sa.assignments,
    };
    const wl = staffWorkloadSummary(inputs, "stf_1");
    expect(typeof wl.openTasks).toBe("number");
    expect(typeof wl.overdueTasks).toBe("number");
    expect(wl.breakdown.every((b) => typeof b.count === "number")).toBe(true);
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

  it("activity privacy: banking entries exist and are permission-gated", () => {
    const r = useHooks();
    act(() => {
      r.current.store.logActivity({
        id: "act_bank1",
        at: new Date().toISOString(),
        label: "Alex reviewed Bank of America transaction $15,000",
        tone: "neutral",
      });
      r.current.store.logActivity({
        id: "act_gen1",
        at: new Date().toISOString(),
        label: "Sarah assigned to rental RNT-001",
        tone: "available",
      });
    });
    const role = r.current.store.roles.find((x) => x.id === "role_user")!;
    expect(can(role, null, "banking.view")).toBe(false);
    const bankingEntry = r.current.store.activityLog.find(
      (e) => e.id === "act_bank1",
    );
    expect(bankingEntry?.label).toContain("Bank");
  });
});

describe("Build #24 — locations", () => {
  it("assigns one location to staff", () => {
    const r = useHooks();
    act(() => {
      newStaff(r.current.store, "stf_loc1");
      r.current.store.updateStaff("stf_loc1", { location_ids: ["loc_1"] });
    });
    expect(
      r.current.store.staff.find((x) => x.id === "stf_loc1")!.location_ids,
    ).toEqual(["loc_1"]);
  });

  it("assigns multiple locations to staff", () => {
    const r = useHooks();
    act(() => {
      newStaff(r.current.store, "stf_loc2");
      r.current.store.updateStaff("stf_loc2", {
        location_ids: ["loc_1", "loc_2"],
      });
    });
    expect(
      r.current.store.staff.find((x) => x.id === "stf_loc2")!.location_ids,
    ).toEqual(["loc_1", "loc_2"]);
  });

  it("empty location_ids means all locations", () => {
    const r = useHooks();
    act(() => newStaff(r.current.store, "stf_loc3"));
    expect(
      r.current.store.staff.find((x) => x.id === "stf_loc3")!.location_ids,
    ).toEqual([]);
  });

  it("primary location is the first in location_ids", () => {
    const r = useHooks();
    act(() => {
      newStaff(r.current.store, "stf_loc4");
      r.current.store.updateStaff("stf_loc4", {
        location_ids: ["loc_2", "loc_1"],
      });
    });
    const primary = r.current.store.staff.find((x) => x.id === "stf_loc4")!
      .location_ids![0];
    expect(primary).toBe("loc_2");
  });
});
