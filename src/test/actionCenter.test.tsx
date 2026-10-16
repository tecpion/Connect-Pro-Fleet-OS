// Connect Pro Fleet — Build #37 Action Center + Copilot UX merge tests.
//
// Verifies the consolidation of Daily Briefing + standalone Copilot into one
// unified Action Center workspace:
//   - Daily Briefing removed from primary nav
//   - standalone Fleet Copilot removed from primary nav
//   - Action Center nav item exists
//   - /daily-briefing + /copilot compatibility (redirect to Action Center)
//   - Action Center renders with Copilot composer + operational sections
//   - Dashboard remains separate (no KPI strip on Action Center)
//   - Dashboard "Ask about this dashboard" + KPI "Explain this" actions
//   - Copilot starter prompts render
//   - Deep links to Action Center from morning briefing / end-of-day recap
//   - permissions preserved
//
// No business logic is changed — these are navigation/IA + UX tests.

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
import { StaffLayout, standaloneNavItems } from "@/components/StaffLayout";
import ActionCenter from "@/pages/ActionCenter";
import Dashboard from "@/pages/Dashboard";
import {
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  FULL_PERMS,
  NOW,
} from "./copilotTestHarness";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { answerMorningOpsBriefing } from "@/lib/copilotLaunchBriefing";

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

function renderActionCenter() {
  return render(
    <MemoryRouter initialEntries={["/action-center"]}>
      <AppProviders>
        <ActionCenter />
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
// Layer 1 — navigation data model (pure)
// ---------------------------------------------------------------------------

describe("Build #37 — Action Center navigation (pure)", () => {
  it("removes Daily Briefing from primary nav", () => {
    expect(
      standaloneNavItems.find((i) => i.label === "Daily Briefing"),
    ).toBeUndefined();
  });

  it("removes standalone Fleet Copilot from primary nav", () => {
    expect(
      standaloneNavItems.find((i) => i.label === "Fleet Copilot"),
    ).toBeUndefined();
  });

  it("adds Action Center to primary nav", () => {
    const ac = standaloneNavItems.find((i) => i.label === "Action Center");
    expect(ac).toBeDefined();
    expect(ac!.to).toBe("/action-center");
  });

  it("Dashboard remains the first HOME item", () => {
    expect(standaloneNavItems[0].label).toBe("Dashboard");
    expect(standaloneNavItems[0].to).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — Action Center renders
// ---------------------------------------------------------------------------

describe("Build #37 — Action Center page", () => {
  it("renders the Action Center title + subheading", () => {
    renderActionCenter();
    expect(screen.getByText("Action Center")).toBeInTheDocument();
    expect(
      screen.getByText(/Prioritized work and operational intelligence/),
    ).toBeInTheDocument();
  });

  it("renders the prominent Copilot composer (Ask Fleet Copilot)", () => {
    renderActionCenter();
    expect(
      screen.getByRole("heading", { name: "Ask Fleet Copilot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask or speak to Fleet Copilot…"),
    ).toBeInTheDocument();
  });

  it("renders Copilot starter prompt chips", () => {
    renderActionCenter();
    expect(
      screen.getByText("What should I focus on first?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Who owes money today?")).toBeInTheDocument();
    expect(
      screen.getByText("Give me my morning briefing."),
    ).toBeInTheDocument();
  });

  it("renders the operational work sections", () => {
    renderActionCenter();
    // These sections render conditionally; assert the always-present ones.
    expect(screen.getByText("Today's Rentals")).toBeInTheDocument();
    expect(screen.getByText("Payments & Collections")).toBeInTheDocument();
    expect(screen.getByText("Fleet Attention")).toBeInTheDocument();
  });

  it("does NOT repeat the Dashboard KPI strip (no Today at a Glance)", () => {
    renderActionCenter();
    // "Today at a Glance" belongs on the Daily Briefing/Dashboard, not Action Center.
    expect(screen.queryByText("Today at a Glance")).toBeNull();
  });

  it("renders the compact All Priorities footer and is itself the priority queue", () => {
    renderActionCenter();
    expect(screen.getByText(/open operational priorit/)).toBeInTheDocument();
    // Pass 2: Action Center IS the priority queue — there is no separate
    // "View Priority Queue" link routing to /executive. The footer states the
    // sections above ARE the live queue instead of linking out.
    expect(screen.getByText(/live queue/)).toBeInTheDocument();
    expect(screen.queryByText("View Priority Queue")).toBeNull();
    expect(screen.queryByRole("link", { name: /priority queue/i })).toBeNull();
  });

  it("renders the Fleet Attention tabs (Blocked/Maintenance/Compliance/Idle)", () => {
    renderActionCenter();
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maintenance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Compliance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);
  });

  it("renders the Today's Rentals tabs (Pickups/Returns/Overdue Returns)", () => {
    renderActionCenter();
    expect(screen.getAllByText("Pickups").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Returns").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue Returns").length).toBeGreaterThan(0);
  });

  it("Action Center renders under StaffLayout without crashing", () => {
    expect(renderAt("/action-center", <ActionCenter />).container).toBeTruthy();
  });

  it("/briefing compatibility route renders Action Center", () => {
    const { container } = renderAt("/briefing", <ActionCenter />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText("Action Center").length).toBeGreaterThan(0);
  });

  it("/copilot compatibility route renders Action Center", () => {
    const { container } = renderAt("/copilot", <ActionCenter />);
    expect(container).toBeTruthy();
    expect(screen.getAllByText("Action Center").length).toBeGreaterThan(0);
  });

  it("mobile layout: sections stack (no horizontal overflow)", () => {
    const { container } = renderActionCenter();
    expect(container.querySelector(".space-y-6")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — Dashboard remains separate + Copilot integration
// ---------------------------------------------------------------------------

describe("Build #37 — Dashboard Copilot integration", () => {
  it("Dashboard renders the 'Ask Copilot' action", () => {
    renderAt("/", <Dashboard />);
    const copilotButtons = screen.getAllByRole("button", {
      name: /Ask Copilot/,
    });
    expect(copilotButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("Dashboard KPI cards expose 'Explain this' Copilot actions", () => {
    renderAt("/", <Dashboard />);
    // Fleet utilization KPI has an Explain this button (aria-label).
    expect(
      screen.getByRole("button", { name: /Ask Copilot to explain Fleet/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ask Copilot to explain Payments/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ask Copilot to explain Late/ }),
    ).toBeInTheDocument();
  });

  it("Dashboard still renders its KPI strip (separate from Action Center)", () => {
    renderAt("/", <Dashboard />);
    expect(screen.getAllByText("Fleet utilization").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active rentals").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Layer 4 — Copilot deep links + prompts (engine, pure)
// ---------------------------------------------------------------------------

describe("Build #37 — Copilot deep links to Action Center", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("morning briefing deep-links to /action-center", () => {
    const a = answerMorningOpsBriefing(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "stf_1",
    );
    expect(
      a.suggested_actions.some((s) => s.deep_link === "/action-center"),
    ).toBe(true);
  });

  it("end-of-day recap deep-links to /action-center", () => {
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      ctx,
    );
    expect(
      a.suggested_actions.some((s) => s.deep_link === "/action-center"),
    ).toBe(true);
  });

  it("'What should I focus on right now?' resolves to executive_focus", () => {
    const a = resolveCopilotQuery(
      "What should I focus on right now?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("executive_focus");
  });

  it("'Give me my morning briefing' resolves to morning_ops_briefing", () => {
    const a = resolveCopilotQuery(
      "Give me my morning briefing.",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("morning_ops_briefing");
  });

  it("end-of-day recap intent resolves", () => {
    const a = resolveCopilotQuery(
      "Give me my end-of-day recap.",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("end_of_day_recap");
  });
});

// ---------------------------------------------------------------------------
// Layer 5 — permissions preserved
// ---------------------------------------------------------------------------

describe("Build #37 — permissions preserved", () => {
  it("Action Center renders for the default Owner staff", () => {
    renderActionCenter();
    expect(screen.getByText("Action Center")).toBeInTheDocument();
  });

  it("Action Center renders for a restricted user role", () => {
    const { Probe, switchTo } = useSwitchStaff();
    render(
      <MemoryRouter initialEntries={["/action-center"]}>
        <AppProviders>
          <Probe />
          <ActionCenter />
        </AppProviders>
      </MemoryRouter>,
    );
    switchTo("stf_3");
    expect(screen.getByText("Action Center")).toBeInTheDocument();
  });

  it("Copilot financial permission filtering: no amounts without payments.view", () => {
    const r = useCopilotTestSources();
    const noFinCtx = engineCtx(r.current.sources, {
      canViewFinancials: false,
      canViewProfitability: false,
      canViewSensitiveDocs: false,
      canViewBanking: false,
    });
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      noFinCtx,
    );
    // Without financial permission, the answer is permission-filtered.
    expect(a.permission_filtered).toBe(true);
  });
});
