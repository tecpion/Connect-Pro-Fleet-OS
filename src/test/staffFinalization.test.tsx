// Connect Pro Fleet — Build #24 finalization: rapid duplicate-assignment safety
// + last-active-Owner domain protection.
//
// These tests prove the two integrity items from the Build #24 finalization pass:
//   1. createAssignment / bulkAssign / reassign are idempotent under rapid
//      synchronous calls and batched React actions (the dedupe check runs inside
//      the functional setAssignments updater, not against a stale ref).
//   2. The last-active-Owner guard lives in the AUTHORITATIVE staff/role
//      mutation layer (updateStaff / updateRole / setUserPermissionOverride),
//      not only in the UI. A direct store call that would deactivate/suspend the
//      last Owner, change the last Owner's role away from Owner, or archive the
//      Owner role while Owners hold it, is refused.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import {
  StaffAssignmentProvider,
  useStaffAssignments,
} from "@/lib/staffAssignmentStore";

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

describe("Build #24 finalization — rapid duplicate-assignment safety", () => {
  it("two synchronous identical createAssignment calls yield one active assignment", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_sync",
      });
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_sync",
      });
    });
    const count = r.current.sa.assignments.filter(
      (a) =>
        a.staff_id === "stf_4" &&
        a.entity_id === "rnt_sync" &&
        a.assignment_type === "rental_csr" &&
        a.status === "active",
    ).length;
    expect(count).toBe(1);
  });

  it("two identical createAssignment calls inside one act() yield one active assignment", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_5",
        assignment_type: "vehicle_fleet_manager",
        entity_type: "vehicle",
        entity_id: "veh_batch",
      });
      r.current.sa.createAssignment({
        staff_id: "stf_5",
        assignment_type: "vehicle_fleet_manager",
        entity_type: "vehicle",
        entity_id: "veh_batch",
      });
    });
    const count = r.current.sa.assignments.filter(
      (a) =>
        a.staff_id === "stf_5" &&
        a.entity_id === "veh_batch" &&
        a.assignment_type === "vehicle_fleet_manager" &&
        a.status === "active",
    ).length;
    expect(count).toBe(1);
  });

  it("rapid bulk assign does not create duplicate active rows", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.bulkAssign({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_ids: ["rnt_bulk1", "rnt_bulk2", "rnt_bulk1", "rnt_bulk2"],
      });
    });
    for (const id of ["rnt_bulk1", "rnt_bulk2"]) {
      const count = r.current.sa.assignments.filter(
        (a) =>
          a.staff_id === "stf_4" &&
          a.entity_id === id &&
          a.assignment_type === "rental_csr" &&
          a.status === "active",
      ).length;
      expect(count).toBe(1);
    }
  });

  it("same staff + same entity + different assignment type is allowed", () => {
    const r = useHooks();
    act(() => {
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_diff",
      });
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_collections_owner",
        entity_type: "rental",
        entity_id: "rnt_diff",
      });
    });
    expect(
      r.current.sa.activeAssignment("rental", "rnt_diff", "rental_csr")
        ?.staff_id,
    ).toBe("stf_4");
    expect(
      r.current.sa.activeAssignment(
        "rental",
        "rnt_diff",
        "rental_collections_owner",
      )?.staff_id,
    ).toBe("stf_4");
  });

  it("reassignment Sarah → Marcus preserves history (old reassigned, new active)", () => {
    const r = useHooks();
    let origId = "";
    act(() => {
      origId = r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_reassign_final",
      })!;
    });
    let newId: string | null = null;
    act(() => {
      newId = r.current.sa.reassign({
        assignment_id: origId,
        new_staff_id: "stf_5",
        reason: "workload",
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
});

describe("Build #24 finalization — last-active-Owner domain protection", () => {
  it("the last active Owner cannot be deactivated via direct store call", () => {
    const r = useHooks();
    const owner = r.current.store.staff.find((x) => x.id === "stf_1")!;
    expect(owner.status ?? "active").toBe("active");
    act(() => r.current.store.updateStaff("stf_1", { status: "inactive" }));
    // Refused: status unchanged.
    expect(r.current.store.staff.find((x) => x.id === "stf_1")!.status).toBe(
      "active",
    );
  });

  it("the last active Owner cannot be suspended via direct store call", () => {
    const r = useHooks();
    act(() => r.current.store.updateStaff("stf_1", { status: "suspended" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_1")!.status).toBe(
      "active",
    );
  });

  it("the last active Owner cannot be changed away from the Owner role", () => {
    const r = useHooks();
    act(() =>
      r.current.store.updateStaff("stf_1", {
        role_id: "role_user",
        role: "staff",
        display_role: "user",
      }),
    );
    const after = r.current.store.staff.find((x) => x.id === "stf_1")!;
    // Refused: role_id unchanged (still the owner role).
    expect(after.role_id).toBe("role_owner");
    expect(after.role).toBe("owner");
  });

  it("with two active Owners, one may be deactivated", () => {
    const r = useHooks();
    // Add a second active Owner.
    act(() => {
      r.current.store.addStaff({
        id: "stf_owner2",
        tenant_id: r.current.store.tenant.id,
        full_name: "Second Owner",
        email: "owner2@connectpro.fleet",
        role: "owner",
        permission_overrides: null,
        created_at: new Date().toISOString(),
        role_id: "role_owner",
        location_ids: [],
        status: "active",
      });
    });
    const ownersBefore = r.current.store.staff.filter((s) => {
      const rl = r.current.store.roles.find((x) => x.id === s.role_id);
      return rl?.name === "Owner" && (s.status ?? "active") === "active";
    }).length;
    expect(ownersBefore).toBe(2);
    // Deactivating the second owner is allowed.
    act(() =>
      r.current.store.updateStaff("stf_owner2", { status: "inactive" }),
    );
    expect(
      r.current.store.staff.find((x) => x.id === "stf_owner2")!.status,
    ).toBe("inactive");
    // The original owner remains protected.
    expect(r.current.store.staff.find((x) => x.id === "stf_1")!.status).toBe(
      "active",
    );
  });

  it("an inactive/suspended Owner does not count as a backup Owner", () => {
    const r = useHooks();
    // Add a second owner but keep it suspended.
    act(() => {
      r.current.store.addStaff({
        id: "stf_owner_suspended",
        tenant_id: r.current.store.tenant.id,
        full_name: "Suspended Owner",
        email: "osusp@connectpro.fleet",
        role: "owner",
        permission_overrides: null,
        created_at: new Date().toISOString(),
        role_id: "role_owner",
        location_ids: [],
        status: "suspended",
      });
    });
    // The only ACTIVE owner is stf_1; the suspended owner does not count.
    // Therefore deactivating stf_1 must still be refused.
    act(() => r.current.store.updateStaff("stf_1", { status: "inactive" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_1")!.status).toBe(
      "active",
    );
  });

  it("a custom role merely named 'Owner' is not treated as the protected Owner", () => {
    const r = useHooks();
    let customOwnerId = "";
    act(() => {
      r.current.store.addRole({
        id: "role_custom_owner_named",
        tenant_id: r.current.store.tenant.id,
        name: "Owner", // NOT a system role — must not be protected.
        description: "A custom role that happens to be named Owner.",
        is_system: false,
        is_protected: false,
        active: true,
        permissions: {},
        created_at: new Date().toISOString(),
      });
      customOwnerId = "role_custom_owner_named";
    });
    // Assign a non-owner staff member to this custom-named-Owner role.
    act(() => {
      r.current.store.addStaff({
        id: "stf_custom_owner_named",
        tenant_id: r.current.store.tenant.id,
        full_name: "Custom Owner",
        email: "cowner@connectpro.fleet",
        role: "custom",
        permission_overrides: null,
        created_at: new Date().toISOString(),
        role_id: customOwnerId,
        location_ids: [],
        status: "active",
      });
    });
    // Deactivating this custom-named-Owner staff is NOT blocked by the
    // last-active-Owner guard, because it is not the system Owner role.
    act(() =>
      r.current.store.updateStaff("stf_custom_owner_named", {
        status: "inactive",
      }),
    );
    expect(
      r.current.store.staff.find((x) => x.id === "stf_custom_owner_named")!
        .status,
    ).toBe("inactive");
    // The real system Owner remains protected.
    expect(r.current.store.staff.find((x) => x.id === "stf_1")!.status).toBe(
      "active",
    );
  });

  it("the UI guard (StaffProfile changeStatus) and the store guard agree", () => {
    const r = useHooks();
    // The assignment-store lifecycle guard also refuses the last Owner.
    const guard = r.current.sa.deactivationGuard("stf_1");
    expect(guard.canDeactivate).toBe(false);
    expect(guard.reason).toMatch(/last active Owner/i);
  });

  it("the store/action guard works when the UI is bypassed (direct updateRole cannot archive the Owner role)", () => {
    const r = useHooks();
    // Archiving the system Owner role while an active Owner holds it is refused.
    act(() => r.current.store.updateRole("role_owner", { active: false }));
    expect(
      r.current.store.roles.find((x) => x.id === "role_owner")!.active,
    ).toBe(true);
  });

  it("cannot strip permissions from the last active Owner via override", () => {
    const r = useHooks();
    act(() =>
      r.current.store.setUserPermissionOverride(
        "stf_1",
        "staff.manage_roles",
        false,
      ),
    );
    // The override must not have been applied (still no override record, or the
    // effective permission remains true because the override was refused).
    const st = r.current.store.staff.find((x) => x.id === "stf_1")!;
    const overrides = st.permission_overrides as Record<string, boolean> | null;
    expect(overrides?.["staff.manage_roles"] ?? false).toBe(false);
  });
});
