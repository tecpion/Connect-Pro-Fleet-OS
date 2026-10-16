// Connect Pro Fleet — Sidebar Information Architecture cleanup tests.
//
// Verifies the business-oriented sidebar reorganization: the old catch-all
// "Operations" group is gone; items are grouped by domain (Rentals, Fleet,
// Customers, Finance, Team, Insights, System); Reservation + Rental nav
// entries are consolidated under "Rental Management"; labels are renamed;
// permission filtering hides unauthorized items and empty categories; the
// active group auto-expands; collapse/expand works; Help & Support sits in a
// visually separated footer.
//
// These are navigation/IA tests only — no business logic is changed.

import { describe, it, expect } from "vitest";
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
import {
  StaffLayout,
  navGroups,
  standaloneNavItems,
  footerNavItems,
} from "@/components/StaffLayout";

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
      if (setter) act(() => setter(id));
    },
  };
}

// ---------------------------------------------------------------------------
// Layer 1 — pure data-model tests (instant)
// ---------------------------------------------------------------------------

describe("Sidebar IA — group structure (pure)", () => {
  it("removes the old catch-all Operations group", () => {
    expect(navGroups.find((g) => g.label === "Operations")).toBeUndefined();
  });

  it("removes the old People group", () => {
    expect(navGroups.find((g) => g.label === "People")).toBeUndefined();
  });

  it("uses business-oriented group labels in order", () => {
    expect(navGroups.map((g) => g.label)).toEqual([
      "Rentals",
      "Fleet",
      "Customers",
      "Finance",
      "Team",
      "Insights",
      "System",
    ]);
  });

  it("HOME standalone items are Dashboard, Action Center", () => {
    expect(standaloneNavItems.map((i) => i.label)).toEqual([
      "Dashboard",
      "Action Center",
    ]);
  });

  it("Action Center standalone routes to /action-center", () => {
    const ac = standaloneNavItems.find((i) => i.label === "Action Center");
    expect(ac).toBeDefined();
    expect(ac!.to).toBe("/action-center");
  });

  it("Daily Briefing is removed from primary nav", () => {
    expect(
      standaloneNavItems.find((i) => i.label === "Daily Briefing"),
    ).toBeUndefined();
  });

  it("Fleet Copilot is removed from primary nav (global button remains)", () => {
    expect(
      standaloneNavItems.find((i) => i.label === "Fleet Copilot"),
    ).toBeUndefined();
  });
});

describe("Sidebar IA — Rentals group", () => {
  const rentals = () => navGroups.find((g) => g.label === "Rentals")!;

  it("contains Rental Management", () => {
    const rm = rentals().items.find((i) => i.to === "/rental-management");
    expect(rm).toBeDefined();
    expect(rm!.label).toBe("Rental Management");
  });

  // Build #58 — Payments Due, Payment Arrangements, and Security Deposits are
  // no longer standalone sidebar links. They live inside Rental Management
  // (Active Rentals filters) and the Rental Detail Billing & Payments tab. The
  // routes redirect/deep-link for backward compatibility.
  it("removes Payments Due as a standalone sidebar link", () => {
    expect(
      rentals().items.find((i) => i.to === "/payments-due"),
    ).toBeUndefined();
  });

  it("removes Payment Arrangements as a standalone sidebar link", () => {
    expect(
      rentals().items.find((i) => i.to === "/payment-arrangements"),
    ).toBeUndefined();
  });

  it("removes Security Deposits as a standalone sidebar link", () => {
    expect(rentals().items.find((i) => i.to === "/deposits")).toBeUndefined();
  });

  it("Rentals group contains only Rental Management and Planner", () => {
    expect(rentals().items.map((i) => i.to)).toEqual([
      "/rental-management",
      "/planner",
    ]);
  });

  it("contains Planner", () => {
    expect(rentals().items.find((i) => i.to === "/planner")).toBeDefined();
  });

  it("removed the separate Reservations nav entry", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/reservations")).toBeUndefined();
  });

  it("removed the separate Rentals nav entry", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(
      all.find((i) => i.to === "/rentals" && i.label === "Rentals"),
    ).toBeUndefined();
  });
});

describe("Sidebar IA — Fleet group", () => {
  const fleet = () => navGroups.find((g) => g.label === "Fleet")!;

  it("contains Vehicles, Maintenance, Inspections, Case Center, Compliance", () => {
    const tos = fleet().items.map((i) => i.to);
    expect(tos).toContain("/vehicles");
    expect(tos).toContain("/maintenance");
    expect(tos).toContain("/inspections");
    expect(tos).toContain("/case-center");
    expect(tos).toContain("/compliance");
  });

  it("contains Case Center and Compliance labels", () => {
    const labels = fleet().items.map((i) => i.label);
    expect(labels).toContain("Case Center");
    expect(labels).toContain("Compliance");
  });

  // Build #56 — Incidents & Violations and Damage Claims are removed from the
  // sidebar. They remain authoritative underlying domains, surfaced via Case
  // Center and accessible at their direct routes. The sidebar no longer lists
  // them so Case Center is the umbrella for issue/case workflows.
  it("removes Incidents & Violations from the sidebar", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/incidents-violations")).toBeUndefined();
    const labels = fleet().items.map((i) => i.label);
    expect(labels).not.toContain("Incidents & Violations");
  });

  it("removes Damage Claims from the sidebar", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/damage-claims")).toBeUndefined();
    const labels = fleet().items.map((i) => i.label);
    expect(labels).not.toContain("Damage Claims");
  });
});

describe("Sidebar IA — Customers group", () => {
  const customers = () => navGroups.find((g) => g.label === "Customers")!;

  it("contains Customers and removes the standalone Verification link", () => {
    const labels = customers().items.map((i) => i.label);
    expect(labels).toContain("Customers");
    expect(labels).not.toContain("Verification");
  });

  // Build #58 — Verification is no longer a standalone sidebar link. The
  // Customers list owns verification filters and Customer Detail owns the
  // per-customer verification record. The /drivers route redirects to
  // /customers?filter=pending_verification for backward compatibility.
  it("removes the Verification item entirely from the Customers group", () => {
    expect(
      customers().items.find((i) => i.label === "Verification"),
    ).toBeUndefined();
    expect(customers().items.find((i) => i.to === "/drivers")).toBeUndefined();
  });

  it("does not use the vague People label", () => {
    expect(customers().label).toBe("Customers");
  });
});

describe("Sidebar IA — Finance group", () => {
  const finance = () => navGroups.find((g) => g.label === "Finance")!;

  it("consolidates Expenses + Banking into one Finance workspace item", () => {
    const tos = finance().items.map((i) => i.to);
    expect(tos).toContain("/finance");
    // The standalone /expenses and /banking sidebar items are gone.
    expect(tos).not.toContain("/expenses");
    expect(tos).not.toContain("/banking");
  });

  it("still contains Profitability", () => {
    const tos = finance().items.map((i) => i.to);
    expect(tos).toContain("/profitability");
  });

  it("moved Investor management here with the renamed label", () => {
    const inv = finance().items.find((i) => i.to === "/investors");
    expect(inv).toBeDefined();
    expect(inv!.label).toBe("Investor & Partner Management");
  });

  it("Investor management is no longer a standalone top item", () => {
    expect(
      standaloneNavItems.find((i) => i.to === "/investors"),
    ).toBeUndefined();
  });

  it("does not surface a separate Expenses or Banking nav item", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/expenses")).toBeUndefined();
    expect(all.find((i) => i.to === "/banking")).toBeUndefined();
  });
});

describe("Sidebar IA — Team group", () => {
  const team = () => navGroups.find((g) => g.label === "Team")!;

  it("contains Tasks and Staff", () => {
    const tos = team().items.map((i) => i.to);
    expect(tos).toContain("/tasks");
    expect(tos).toContain("/staff");
  });

  it("uses Team rather than People", () => {
    expect(team().label).toBe("Team");
  });
});

describe("Sidebar IA — Insights group", () => {
  const insights = () => navGroups.find((g) => g.label === "Insights")!;

  it("contains Reports", () => {
    expect(insights().items.find((i) => i.to === "/reports")).toBeDefined();
  });
});

describe("Sidebar IA — System group", () => {
  const system = () => navGroups.find((g) => g.label === "System")!;

  it("contains Integrations, Data Import / Migration, Settings", () => {
    const labels = system().items.map((i) => i.label);
    expect(labels).toContain("Integrations");
    expect(labels).toContain("Data Import / Migration");
    expect(labels).toContain("Settings");
  });

  it("uses the renamed label Data Import / Migration (not Migration)", () => {
    const mig = system().items.find((i) => i.to === "/migration");
    expect(mig).toBeDefined();
    expect(mig!.label).toBe("Data Import / Migration");
  });
});

describe("Sidebar IA — Help & Support footer", () => {
  it("Help & Support is a footer item, not a standalone top item", () => {
    expect(standaloneNavItems.find((i) => i.to === "/support")).toBeUndefined();
    expect(footerNavItems.find((i) => i.to === "/support")).toBeDefined();
    expect(footerNavItems[0].label).toBe("Help & Support");
  });
});

describe("Sidebar IA — permission keys", () => {
  it("the consolidated Finance workspace item has no single perm gate", () => {
    const finance = navGroups.find((g) => g.label === "Finance")!;
    const item = finance.items.find((i) => i.to === "/finance");
    expect(item).toBeDefined();
    expect(item!.perm).toBeUndefined();
  });

  it("gates Profitability behind reports.view_profitability", () => {
    const finance = navGroups.find((g) => g.label === "Finance")!;
    expect(finance.items.find((i) => i.to === "/profitability")!.perm).toBe(
      "reports.view_profitability",
    );
  });

  it("gates Staff behind staff.view", () => {
    const team = navGroups.find((g) => g.label === "Team")!;
    expect(team.items.find((i) => i.to === "/staff")!.perm).toBe("staff.view");
  });

  it("gates Reports behind reports.view_management_summary", () => {
    const insights = navGroups.find((g) => g.label === "Insights")!;
    expect(insights.items.find((i) => i.to === "/reports")!.perm).toBe(
      "reports.view_management_summary",
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — render tests (fast, synchronous)
// ---------------------------------------------------------------------------

describe("Sidebar IA — render", () => {
  it("renders the seven business group headers", () => {
    renderAt("/", <div>page</div>);
    // Group toggles are buttons; item links are <a>. Query group labels by role.
    for (const label of [
      "Rentals",
      "Fleet",
      "Customers",
      "Finance",
      "Team",
      "Insights",
      "System",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the HOME standalone items as links", () => {
    renderAt("/", <div>page</div>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Action Center" }),
    ).toBeInTheDocument();
    // Daily Briefing + Fleet Copilot are no longer nav links.
    expect(screen.queryByRole("link", { name: "Daily Briefing" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Fleet Coping" })).toBeNull();
  });

  it("renders Rental Management as a link (group auto-expands on its route)", () => {
    renderAt("/rental-management", <div>page</div>);
    expect(
      screen.getByRole("link", { name: "Rental Management" }),
    ).toBeInTheDocument();
  });

  it("does not render a Reservations or Rentals nav link", () => {
    renderAt("/", <div>page</div>);
    expect(screen.queryByRole("link", { name: "Reservations" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Rentals" })).toBeNull();
  });

  it("renders Help & Support as a separated footer link", () => {
    renderAt("/", <div>page</div>);
    expect(
      screen.getByRole("link", { name: "Help & Support" }),
    ).toBeInTheDocument();
  });

  it("auto-expands the group containing the active route", () => {
    // /vehicles is under the Fleet group.
    renderAt("/vehicles", <div>page</div>);
    const fleetToggle = screen.getByRole("button", { name: "Fleet" });
    expect(fleetToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("marks the active child link with aria-current", () => {
    renderAt("/vehicles", <div>page</div>);
    const link = screen.getByRole("link", { name: "Vehicles" });
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("collapsed group expands on click", () => {
    renderAt("/", <div>page</div>);
    // Customers is not active at "/", so it starts collapsed.
    const toggle = screen.getByRole("button", { name: "Customers" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders the mobile navigation toggle button", () => {
    renderAt("/", <div>page</div>);
    expect(
      screen.getByRole("button", { name: "Toggle navigation" }),
    ).toBeInTheDocument();
  });

  it("mobile toggle opens and closes the drawer", () => {
    renderAt("/", <div>page</div>);
    const toggle = screen.getByRole("button", { name: "Toggle navigation" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Close via the backdrop button.
    const backdrop = screen.getByRole("button", { name: "Close navigation" });
    fireEvent.click(backdrop);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — permission filtering (render)
// ---------------------------------------------------------------------------

describe("Sidebar IA — permission filtering", () => {
  it("Owner sees all groups including Finance, Insights, System", () => {
    renderAt("/", <div>page</div>);
    // Default staff is stf_1 (Owner) — full permissions.
    expect(screen.getByRole("button", { name: "Finance" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Insights" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
    // Expand the collapsed Finance group to confirm its children render.
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(screen.getByRole("link", { name: "Finance" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Profitability" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Investor & Partner Management" }),
    ).toBeInTheDocument();
  });

  it("User role (stf_3) hides Profitability, Investors; Finance remains", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderAt("/", <Probe />);
    switchTo("stf_3");
    // The system "user" role lacks banking.view, reports.view_profitability,
    // and investors.view. The consolidated Finance item has no single perm
    // gate, so it remains visible — but Profitability + Investors are hidden.
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(screen.getByRole("link", { name: "Finance" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Profitability" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Investor & Partner Management" }),
    ).toBeNull();
    // The old standalone Expenses/Banking nav links are gone.
    expect(screen.queryByRole("link", { name: "Expenses" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Banking" })).toBeNull();
  });

  it("User role hides the entire Insights group (Reports gated)", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderAt("/", <Probe />);
    switchTo("stf_3");
    // user has reports.view_operations but NOT reports.view_management_summary
    // (the Reports nav gate) → the Insights group has zero permitted children.
    expect(screen.queryByRole("button", { name: "Insights" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reports" })).toBeNull();
  });

  it("User role still sees Rentals, Fleet, Customers, Team, System groups", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderAt("/", <Probe />);
    switchTo("stf_3");
    expect(screen.getByRole("button", { name: "Rentals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fleet" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Customers" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toBeInTheDocument();
  });

  it("User role sees System with only Settings (Integrations/Migration hidden)", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderAt("/", <Probe />);
    switchTo("stf_3");
    // Expand the System group to inspect its rendered children.
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Data Import / Migration" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("User role keeps Staff (has staff.view) and Tasks", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderAt("/", <Probe />);
    switchTo("stf_3");
    // Expand the Team group to inspect its rendered children.
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(screen.getByRole("link", { name: "Staff" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks" })).toBeInTheDocument();
  });

  it("User role keeps Case Center (has case.view) in the Fleet group", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderAt("/", <Probe />);
    switchTo("stf_3");
    // Expand the Fleet group to inspect its rendered children.
    fireEvent.click(screen.getByRole("button", { name: "Fleet" }));
    expect(
      screen.getByRole("link", { name: "Case Center" }),
    ).toBeInTheDocument();
    // Build #56 — Incidents & Violations is no longer a sidebar link.
    expect(
      screen.queryByRole("link", { name: "Incidents & Violations" }),
    ).toBeNull();
  });
});
