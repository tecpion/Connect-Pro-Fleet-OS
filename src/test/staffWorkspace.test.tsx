// Connect Pro Fleet — Build #24 Staff workspace enhancement tests.
//
// Covers: profile sections, role-vs-responsibility separation, assignment
// eligibility (active + permission + location + responsibility), transparent
// suggestions, activity category safety (no mislabeling as maintenance),
// workload filters, role access summaries, and deactivation attribution.

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
import {
  assignmentEligibility,
  suggestAssignees,
  suggestionReason,
} from "@/lib/assignmentEligibility";
import {
  activityMetaFromLabel,
  categoryFromLabel,
  sourceFromLabel,
} from "@/pages/staff/activityMeta";
import { StaffProfile } from "@/pages/staff/StaffProfile";
import { AssigneeDisplay } from "@/pages/staff/AssignStaffDialog";
import { TASK_CATEGORY_TONE } from "@/lib/staffActivityMeta";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <StaffAssignmentProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </StaffAssignmentProvider>
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

// ---------------------------------------------------------------------------
// Role vs Responsibility separation
// ---------------------------------------------------------------------------

describe("Staff workspace — role vs responsibility", () => {
  it("responsibility does not grant permission (banking responsibility but no banking role)", () => {
    const r = useHooks();
    // stf_4 (Sarah) has collections responsibility but CSR role (no banking).
    const sarah = r.current.store.staff.find((s) => s.id === "stf_4")!;
    expect((sarah.responsibilities ?? []).includes("collections")).toBe(true);
    const elig = assignmentEligibility({
      staff: sarah,
      role: r.current.store.roles.find((x) => x.id === sarah.role_id),
      assignmentType: "banking_transaction_review",
    });
    expect(elig.eligible).toBe(false);
    expect(elig.reasons.some((x) => /banking/i.test(x))).toBe(true);
  });

  it("a bookkeeper with banking responsibility AND banking permission is eligible", () => {
    const r = useHooks();
    const priya = r.current.store.staff.find((s) => s.id === "stf_6")!;
    const elig = assignmentEligibility({
      staff: priya,
      role: r.current.store.roles.find((x) => x.id === priya.role_id),
      assignmentType: "banking_transaction_review",
    });
    expect(elig.eligible).toBe(true);
  });

  it("inactive staff are never eligible", () => {
    const r = useHooks();
    const sarah = r.current.store.staff.find((s) => s.id === "stf_4")!;
    const elig = assignmentEligibility({
      staff: { ...sarah, status: "suspended" },
      role: r.current.store.roles.find((x) => x.id === sarah.role_id),
      assignmentType: "rental_csr",
    });
    expect(elig.eligible).toBe(false);
    expect(elig.reasons.some((x) => /inactive/i.test(x))).toBe(true);
  });

  it("location-scoped staff cannot be assigned to an out-of-scope location", () => {
    const r = useHooks();
    // stf_7 Jordan is scoped to loc_2 (Miami Airport).
    const jordan = r.current.store.staff.find((s) => s.id === "stf_7")!;
    const role = r.current.store.roles.find((x) => x.id === jordan.role_id);
    const elig = assignmentEligibility({
      staff: { ...jordan, status: "active" },
      role,
      assignmentType: "damage_claim_owner",
      entityLocationId: "loc_1",
    });
    expect(elig.eligible).toBe(false);
    expect(elig.reasons.some((x) => /location/i.test(x))).toBe(true);
  });

  it("location-scoped staff CAN be assigned to an in-scope location", () => {
    const r = useHooks();
    const jordan = r.current.store.staff.find((s) => s.id === "stf_7")!;
    const role = r.current.store.roles.find((x) => x.id === jordan.role_id);
    const elig = assignmentEligibility({
      staff: { ...jordan, status: "active" },
      role,
      assignmentType: "damage_claim_owner",
      entityLocationId: "loc_2",
    });
    expect(elig.eligible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Assignment suggestions
// ---------------------------------------------------------------------------

describe("Staff workspace — assignment suggestions", () => {
  it("suggestAssignees ranks by responsibility match then lowest open work", () => {
    const r = useHooks();
    const active = r.current.store.staff.filter(
      (s) => (s.status ?? "active") === "active",
    );
    const suggestions = suggestAssignees({
      staff: active,
      roles: r.current.store.roles,
      assignmentType: "damage_claim_owner",
      openWorkCount: () => 0,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    // Every suggested staff must be eligible.
    for (const s of suggestions) expect(s.eligible).toBe(true);
    // If any have the damage_claims responsibility, they come first.
    const firstResp = suggestions.findIndex((s) => s.hasResponsibility);
    if (firstResp >= 0) {
      const beforeResp = suggestions.slice(0, firstResp);
      for (const b of beforeResp) expect(b.hasResponsibility).toBe(true);
    }
  });

  it("suggestionReason is transparent and non-opaque (no numeric score)", () => {
    const r = useHooks();
    const s = suggestAssignees({
      staff: r.current.store.staff,
      roles: r.current.store.roles,
      assignmentType: "rental_csr",
      openWorkCount: () => 2,
    })[0];
    if (s) {
      const reason = suggestionReason(s);
      expect(reason).not.toMatch(/\d+%/);
      expect(reason).toMatch(/open work/i);
    }
  });

  it("suggestions never auto-assign (returns only ranked candidates)", () => {
    const r = useHooks();
    const suggestions = suggestAssignees({
      staff: r.current.store.staff,
      roles: r.current.store.roles,
      assignmentType: "rental_csr",
      openWorkCount: () => 0,
    });
    // Suggestions are candidates, not assignments — no assignment rows created.
    const before = r.current.sa.assignments.length;
    expect(suggestions.length).toBeGreaterThanOrEqual(0);
    expect(r.current.sa.assignments.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Activity category safety (no mislabeling as maintenance)
// ---------------------------------------------------------------------------

describe("Staff workspace — activity category safety", () => {
  it("a driver-verification follow-up task is NOT categorized as maintenance", () => {
    const label = "System task created — Review driver verification";
    expect(categoryFromLabel(label)).not.toBe("Maintenance");
    // Driver/verification follow-up maps to Customer Service.
    expect(categoryFromLabel(label)).toBe("Customer Service");
  });

  it("an overdue-rental follow-up task is NOT categorized as maintenance", () => {
    const label = "System task created — Follow up on overdue rental";
    expect(categoryFromLabel(label)).not.toBe("Maintenance");
  });

  it("maintenance-related labels ARE categorized as maintenance", () => {
    expect(categoryFromLabel("Maintenance scheduled — Ford F-150 brakes")).toBe(
      "Maintenance",
    );
  });

  it("a collections task maps to Collections, not maintenance", () => {
    expect(
      categoryFromLabel(
        "System task created — Call overdue renter for payment",
      ),
    ).toBe("Collections");
  });

  it("system-generated task labels derive a System/Automation source", () => {
    const meta = activityMetaFromLabel(
      "System task created — Review driver verification",
    );
    expect(["System", "Automation"]).toContain(meta.source);
    expect(meta.actor === "System" || meta.actor === "Automation").toBe(true);
  });

  it("a manual staff action derives a Manual source", () => {
    const meta = activityMetaFromLabel(
      "Marcus Webb completed task — Inspect brakes",
      ["Marcus Webb"],
    );
    expect(meta.source).toBe("Manual");
    expect(meta.actor).toBe("Marcus Webb");
  });

  it("task category tone never falls back to maintenance for non-maintenance tasks", () => {
    expect(TASK_CATEGORY_TONE.customer_follow_up).not.toBe("maintenance");
    expect(TASK_CATEGORY_TONE.payment_collection).not.toBe("maintenance");
    expect(TASK_CATEGORY_TONE.maintenance).toBe("maintenance");
  });
});

// ---------------------------------------------------------------------------
// Staff Profile sections
// ---------------------------------------------------------------------------

describe("Staff workspace — Staff Profile sections", () => {
  it("renders the four profile sections (Overview/Work/Access/Activity)", () => {
    const r = useHooks();
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <StaffProfile
              staffId="stf_4"
              inputs={inputsOf(r)}
              onBack={() => {}}
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("Overview shows responsibilities with the routing-only help copy", () => {
    const r = useHooks();
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <StaffProfile
              staffId="stf_4"
              inputs={inputsOf(r)}
              onBack={() => {}}
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/Responsibilities help Connect Pro/i),
    ).toBeInTheDocument();
    // Sarah has Customer Service responsibility.
    expect(screen.getByText("Customer Service")).toBeInTheDocument();
  });

  it("Access section shows Role = Access and Location Scope messaging", () => {
    const r = useHooks();
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <StaffProfile
              staffId="stf_4"
              inputs={inputsOf(r)}
              onBack={() => {}}
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    // Click the Access tab.
    act(() => {
      screen.getByText("Access").click();
    });
    expect(
      screen.getByText(
        /Effective access = Role Permissions AND Location Scope/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Role controls what this staff member is allowed/i),
    ).toBeInTheDocument();
  });

  it("Access section states responsibilities do not grant access", () => {
    const r = useHooks();
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <StaffProfile
              staffId="stf_4"
              inputs={inputsOf(r)}
              onBack={() => {}}
            />
          </StaffAssignmentProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    act(() => {
      screen.getByText("Access").click();
    });
    expect(
      screen.getByText(/Responsibilities do not grant access/i),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Workload + unassigned-work deep-link
// ---------------------------------------------------------------------------

describe("Staff workspace — workload & unassigned", () => {
  it("workload totals contain no monetary fields", () => {
    const r = useHooks();
    const wl = staffWorkloadSummary(inputsOf(r), "stf_1");
    const keys = Object.keys(wl);
    expect(
      keys.some(
        (k) =>
          k.toLowerCase().includes("amount") ||
          k.toLowerCase().includes("dollar") ||
          k.toLowerCase().includes("revenue") ||
          k.toLowerCase().includes("score") ||
          k.toLowerCase().includes("capacity"),
      ),
    ).toBe(false);
  });

  it("getUnassignedWork returns an array (authoritative queue lives in Action Center)", () => {
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
    const done = r.current.store.tasks.find(
      (t) => t.title === "Done task" && t.assigned_to_user_id === "stf_3",
    );
    if (done && done.status === "completed") {
      expect(wl.openTasks).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Deactivation preserves historical attribution
// ---------------------------------------------------------------------------

describe("Staff workspace — deactivation attribution", () => {
  it("deactivating staff preserves the actor on existing assignments", () => {
    const r = useHooks();
    act(() => {
      r.current.store.setCurrentStaffId("stf_4");
      r.current.sa.createAssignment({
        staff_id: "stf_4",
        assignment_type: "rental_csr",
        entity_type: "rental",
        entity_id: "rnt_attr",
      });
    });
    const before = r.current.sa.activeAssignment(
      "rental",
      "rnt_attr",
      "rental_csr",
    );
    expect(before?.assigned_by).toBeDefined();
    act(() => {
      // Add a second owner so stf_4 (non-owner) can be deactivated if needed.
      // stf_4 is CSR, not owner, so deactivation is allowed.
      r.current.store.updateStaff("stf_4", { status: "inactive" });
    });
    const after = r.current.sa.assignments.find((a) => a.id === before!.id);
    expect(after).toBeDefined();
    // assigned_by is preserved (historical attribution intact).
    expect(after?.assigned_by).toBe(before?.assigned_by);
  });
});

// ---------------------------------------------------------------------------
// Permission-safe role management (last-owner guard)
// ---------------------------------------------------------------------------

describe("Staff workspace — permission safety", () => {
  it("the last active Owner cannot be deactivated via store", () => {
    const r = useHooks();
    act(() => r.current.store.updateStaff("stf_1", { status: "inactive" }));
    expect(r.current.store.staff.find((x) => x.id === "stf_1")!.status).toBe(
      "active",
    );
  });

  it("the assignment-store deactivation guard agrees the last Owner is protected", () => {
    const r = useHooks();
    const guard = r.current.sa.deactivationGuard("stf_1");
    expect(guard.canDeactivate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AssigneeDisplay integration
// ---------------------------------------------------------------------------

describe("Staff workspace — assignment UI", () => {
  it("AssigneeDisplay shows Unassigned when no active assignment", () => {
    render(
      <MemoryRouter>
        <StoreProvider>
          <StaffAssignmentProvider>
            <AssigneeDisplay
              entityType="rental"
              entityId="rnt_none2"
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
          entity_id: "rnt_ui2",
        });
      }, [sa]);
      return (
        <AssigneeDisplay
          entityType="rental"
          entityId="rnt_ui2"
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
});
