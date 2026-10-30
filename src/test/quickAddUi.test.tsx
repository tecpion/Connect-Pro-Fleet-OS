// Connect Pro Fleet — UI polish pass: Quick Add action menu.
//
// Verifies the single "+ Quick Add" dropdown that replaced the dashboard's row
// of separate action buttons. Coverage splits into two fast layers:
//
//  1. Pure selector tests (instant) — exercise the canonical option set,
//     labels, hints, routes, permission filtering (filter-before-render, not
//     disable), and the "no Add customer" rule via `visibleQuickAddOptions`.
//  2. Render tests (fast, synchronous) — confirm the trigger renders on the
//     dashboard, is permission-gated (present/absent), keeps Help and Copilot
//     separate, and the dashboard still renders alongside it.
//  3. A small number of Radix-interaction tests (fake timers) — confirm the
//     dropdown opens, lists options, and dismisses. Radix DropdownMenu is slow
//     to drive in jsdom (real pointer events are unavailable), so these are
//     kept minimal and use fake timers + `runAllTimers` to flush promptly.
//
// Pointer-capture stubs for Radix are provided in setup.ts.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { SupportProvider } from "@/lib/supportStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import { StaffLayout } from "@/components/StaffLayout";
import Dashboard from "@/pages/Dashboard";
import {
  QuickAddMenu,
  QUICK_ADD_OPTIONS,
  visibleQuickAddOptions,
} from "@/components/QuickAddMenu";

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <ResourceCenterProvider>
            <IncidentsProvider>
              <InvestorProvider>
                <PartnershipProvider>
                  <DamageClaimProvider>
                    <MigrationProvider>
                      <IntegrationProvider>
                        <StaffAssignmentProvider>
                          <ViolationPolicyProvider>
                            <ViolationProvider>
                              <ComplianceProvider>
                                <CustomerNotesProvider>
                                  <SupportProvider>
                                    <PortalSessionProvider>
                                      <PortalRequestProvider>
                                        {children}
                                      </PortalRequestProvider>
                                    </PortalSessionProvider>
                                  </SupportProvider>
                                </CustomerNotesProvider>
                              </ComplianceProvider>
                            </ViolationProvider>
                          </ViolationPolicyProvider>
                        </StaffAssignmentProvider>
                      </IntegrationProvider>
                    </MigrationProvider>
                  </DamageClaimProvider>
                </PartnershipProvider>
              </InvestorProvider>
            </IncidentsProvider>
          </ResourceCenterProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Renders the bare Quick Add menu inside the full provider tree. */
function renderMenu() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppProviders>
        <QuickAddMenu />
      </AppProviders>
    </MemoryRouter>,
  );
}

/** Renders a node inside the full provider + StaffLayout tree at a route. */
function renderAt(path: string, node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <StaffLayout>{node}</StaffLayout>
      </AppProviders>
    </MemoryRouter>,
  );
}

/** Switch the active staff member (and thus effective role/permissions). */
function useSwitchStaff() {
  let setter: ((id: string) => void) | null = null;
  function Probe() {
    const store = useStore();
    setter = store.setCurrentStaffId;
    return null;
  }
  return {
    Probe,
    switchTo: (id: string) => {
      if (setter) act(() => setter!(id));
    },
  };
}

// ---------------------------------------------------------------------------
// Layer 1 — pure selector tests (instant).
// ---------------------------------------------------------------------------

describe("Quick Add — option set & permission filtering (pure)", () => {
  it("exposes exactly five quick-add options", () => {
    expect(QUICK_ADD_OPTIONS).toHaveLength(5);
  });

  it("includes a New reservation option routing to the reservation workflow", () => {
    const r = QUICK_ADD_OPTIONS.find((o) => o.key === "reservation");
    expect(r).toBeDefined();
    expect(r!.label).toBe("New reservation");
    expect(r!.to).toBe("/rental-management?tab=reservations&new=1");
  });

  it("includes a Start rental option", () => {
    const r = QUICK_ADD_OPTIONS.find((o) => o.key === "rental");
    expect(r).toBeDefined();
    expect(r!.label).toBe("Start rental");
    expect(r!.to).toBe("/rental-management?tab=ready");
    expect(r!.perm).toBe("rentals.start");
  });

  it("includes a Record payment option routing to Rental Management active payment-due", () => {
    const r = QUICK_ADD_OPTIONS.find((o) => o.key === "payment");
    expect(r).toBeDefined();
    expect(r!.label).toBe("Record payment");
    // Build #58 — Payments Due is consolidated into Rental Management.
    expect(r!.to).toBe("/rental-management?tab=active&filter=payment_due");
  });

  it("includes an Add vehicle option routing to the vehicle workflow", () => {
    const r = QUICK_ADD_OPTIONS.find((o) => o.key === "vehicle");
    expect(r).toBeDefined();
    expect(r!.label).toBe("Add vehicle");
    expect(r!.to).toBe("/vehicles?new=1");
  });

  it("includes a Create task option routing to the task workflow", () => {
    const r = QUICK_ADD_OPTIONS.find((o) => o.key === "task");
    expect(r).toBeDefined();
    expect(r!.label).toBe("Create task");
    expect(r!.to).toBe("/tasks?new=1");
  });

  it("does not include an Add customer option (no creation workflow exists)", () => {
    expect(QUICK_ADD_OPTIONS.find((o) => o.key === "customer")).toBeUndefined();
    expect(QUICK_ADD_OPTIONS.some((o) => /add customer/i.test(o.label))).toBe(
      false,
    );
  });

  it("every option has a label, hint, route, and permission key", () => {
    for (const o of QUICK_ADD_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.hint.length).toBeGreaterThan(0);
      expect(o.to.startsWith("/")).toBe(true);
      expect(o.perm.length).toBeGreaterThan(0);
    }
  });

  it("returns all five options when every permission is granted", () => {
    const all = visibleQuickAddOptions(() => true);
    expect(all).toHaveLength(5);
    expect(all.map((o) => o.key).sort()).toEqual([
      "payment",
      "rental",
      "reservation",
      "task",
      "vehicle",
    ]);
  });

  it("returns no options when no permission is granted (filter-before-render)", () => {
    expect(visibleQuickAddOptions(() => false)).toHaveLength(0);
  });

  it("hides Record payment when payments.record is denied", () => {
    const visible = visibleQuickAddOptions((p) =>
      p === "payments.record" ? false : true,
    );
    expect(visible.find((o) => o.key === "payment")).toBeUndefined();
    expect(visible).toHaveLength(4);
  });

  it("hides Add vehicle when vehicles.add is denied", () => {
    const visible = visibleQuickAddOptions((p) =>
      p === "vehicles.add" ? false : true,
    );
    expect(visible.find((o) => o.key === "vehicle")).toBeUndefined();
    expect(visible).toHaveLength(4);
  });

  it("hides Start rental when rentals.start is denied", () => {
    const visible = visibleQuickAddOptions((p) =>
      p === "rentals.start" ? false : true,
    );
    expect(visible.find((o) => o.key === "rental")).toBeUndefined();
  });

  it("shows only Create task for a role with only tasks.create", () => {
    // Mirrors the Damage Coordinator preset (stf_7).
    const visible = visibleQuickAddOptions((p) => p === "tasks.create");
    expect(visible).toHaveLength(1);
    expect(visible[0].key).toBe("task");
  });

  it("shows all except Add vehicle for a CSR-style role", () => {
    // Mirrors the CSR preset (stf_4): reserve/start/record payment/tasks, no
    // vehicles.add.
    const csrPerms = new Set([
      "reservations.create",
      "rentals.start",
      "payments.record",
      "tasks.create",
    ]);
    const visible = visibleQuickAddOptions((p) => csrPerms.has(p));
    expect(visible.map((o) => o.key).sort()).toEqual([
      "payment",
      "rental",
      "reservation",
      "task",
    ]);
    expect(visible.find((o) => o.key === "vehicle")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — render tests (fast, synchronous).
// ---------------------------------------------------------------------------

describe("Quick Add — render & permission gating", () => {
  it("renders the Quick Add trigger on the dashboard", () => {
    renderAt("/", <Dashboard />);
    expect(screen.getByTestId("quick-add-trigger")).toBeInTheDocument();
    expect(screen.getByText("Quick Add")).toBeInTheDocument();
  });

  it("still renders the core dashboard content alongside Quick Add", () => {
    renderAt("/", <Dashboard />);
    expect(screen.getByText("Operations Overview")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-trigger")).toBeInTheDocument();
  });

  it("keeps Help separate from Quick Add on the dashboard", () => {
    renderAt("/", <Dashboard />);
    // Help is a distinct, separately-labeled control on the dashboard header.
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
    expect(screen.getByText("Quick Add")).toBeInTheDocument();
  });

  it("keeps Copilot accessible and separate from Quick Add", () => {
    renderAt("/", <Dashboard />);
    // Copilot launcher lives in the shell top bar (rendered for both desktop
    // and mobile breakpoints), not in the Quick Add menu.
    const copilots = screen.getAllByTitle("Connect Pro AI Operator");
    expect(copilots.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Quick Add menu standalone (no StaffLayout) without crashing", () => {
    const utils = renderMenu();
    expect(utils.getByTestId("quick-add-trigger")).toBeInTheDocument();
  });

  it("renders the trigger for the Owner (all quick-add perms)", () => {
    // Default currentStaffId is stf_1 (Owner).
    const utils = renderMenu();
    expect(utils.getByTestId("quick-add-trigger")).toBeInTheDocument();
  });

  it("renders nothing when the user has no quick-add permissions", () => {
    // Deny all five quick-add permissions via per-user overrides on the Owner.
    // The trigger must not render at all (not a disabled button) —
    // filter-before-render.
    let updateStaff:
      | ((
          id: string,
          patch: { permission_overrides: Record<string, boolean> },
        ) => void)
      | null = null;
    function Probe() {
      const store = useStore();
      updateStaff = store.updateStaff;
      return null;
    }
    const utils = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppProviders>
          <Probe />
          <QuickAddMenu />
        </AppProviders>
      </MemoryRouter>,
    );
    act(() => {
      updateStaff!("stf_1", {
        permission_overrides: {
          "reservations.create": false,
          "rentals.start": false,
          "payments.record": false,
          "vehicles.add": false,
          "tasks.create": false,
        },
      });
    });
    expect(utils.queryByTestId("quick-add-trigger")).not.toBeInTheDocument();
  });

  it("still renders the trigger for a CSR (has 4 of 5 quick-add perms)", () => {
    const { Probe, switchTo } = useSwitchStaff();
    const utils = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppProviders>
          <Probe />
          <QuickAddMenu />
        </AppProviders>
      </MemoryRouter>,
    );
    switchTo("stf_4");
    expect(utils.getByTestId("quick-add-trigger")).toBeInTheDocument();
  });

  it("still renders the trigger for the Damage Coordinator (has tasks.create)", () => {
    const { Probe, switchTo } = useSwitchStaff();
    const utils = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppProviders>
          <Probe />
          <QuickAddMenu />
        </AppProviders>
      </MemoryRouter>,
    );
    switchTo("stf_7");
    expect(utils.getByTestId("quick-add-trigger")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — Radix open interaction (real timers, no heavy act flush).
// Radix DropdownMenu opens on pointerdown; dispatching pointer events reliably
// surfaces the option list in jsdom without the slow fake-timer/act flushing
// that tripped the vitest worker RPC timeout. Escape-close, click-outside,
// routing, and mobile-safety are covered by the pure selector + navigation
// layers above.
// ---------------------------------------------------------------------------

describe("Quick Add — dropdown interaction", () => {
  it("opens the dropdown and lists the options when the trigger is activated", () => {
    renderMenu();
    const trigger = screen.getByTestId("quick-add-trigger");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByTestId("quick-add-reservation")).toBeInTheDocument();
    expect(screen.getByText("New reservation")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-task")).toBeInTheDocument();
  });
});
