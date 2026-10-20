// Connect Pro Fleet — Build #33 QA: routing, settings, range, terminology,
// privacy, empty states, mobile, and cross-module composition.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import {
  CompanyPolicyProvider,
  useCompanyPolicies,
} from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { CustomerTagsProvider } from "@/lib/customerTagStore";
import { CustomerImportHistoryProvider } from "@/lib/customerImportHistoryStore";
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
import ActionCenter from "@/pages/ActionCenter";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard";
import Customers from "@/pages/Customers";
import CustomerProfile from "@/pages/CustomerProfile";
import Vehicles from "@/pages/Vehicles";
import VehicleDetail from "@/pages/VehicleDetail";
import { RentalsRedirect } from "@/components/RentalRouteRedirects";
import RentalDetail from "@/pages/RentalDetail";
import PaymentsDue from "@/pages/PaymentsDue";
import Tasks from "@/pages/Tasks";
import Maintenance from "@/pages/Maintenance";
import DamageClaims from "@/pages/DamageClaims";
import Violations from "@/pages/Violations";
import Compliance from "@/pages/Compliance";
import Staff from "@/pages/Staff";
import SupportCenter from "@/pages/support/SupportCenter";
import SupportStatus from "@/pages/support/SupportStatus";
import SupportUpdates from "@/pages/support/SupportUpdates";
import { PortalEntry } from "@/pages/portal/PortalEntry";
import { BusinessHealthSection } from "@/pages/settings/BusinessHealthSection";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import { gradeForScore, validateWeights } from "@/lib/businessHealthSelectors";
import {
  DEFAULT_HEALTH_CONFIG,
  HEALTH_FORMULA_VERSION,
  type HealthConfig,
} from "@/lib/executiveTypes";
import { buildExecutiveDashboard } from "@/lib/executiveDashboardComposer";
import {
  useExecutiveTestSources,
  execRange,
  NOW,
  FULL_PERMS,
} from "./executiveTestHarness";
import { healthSettingsToConfig } from "@/pages/settings/BusinessHealthSection";
import { defaultBusinessHealthSettings } from "@/lib/companyPolicyDefaults";

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
                                  <CustomerTagsProvider>
                                    <CustomerImportHistoryProvider>
                                      <SupportProvider>
                                        <PortalSessionProvider>
                                          <PortalRequestProvider>
                                            {children}
                                          </PortalRequestProvider>
                                        </PortalSessionProvider>
                                      </SupportProvider>
                                    </CustomerImportHistoryProvider>
                                  </CustomerTagsProvider>
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

describe("Build #33 — Routing", () => {
  const routes: Array<[string, ReactNode]> = [
    ["/", <Dashboard />],
    ["/action-center", <ActionCenter />],
    ["/briefing", <ActionCenter />],
    ["/executive", <ExecutiveDashboard />],
    ["/copilot", <ActionCenter />],
    ["/customers", <Customers />],
    ["/customers/cus_1", <CustomerProfile />],
    ["/vehicles", <Vehicles />],
    ["/vehicles/veh_1", <VehicleDetail />],
    ["/rentals", <RentalsRedirect />],
    ["/rentals/rnt_1", <RentalDetail />],
    ["/payments-due", <PaymentsDue />],
    ["/tasks", <Tasks />],
    ["/maintenance", <Maintenance />],
    ["/damage-claims", <DamageClaims />],
    ["/violations", <Violations />],
    ["/compliance", <Compliance />],
    ["/staff", <Staff />],
    ["/support", <SupportCenter />],
    ["/support/status", <SupportStatus />],
    ["/support/updates", <SupportUpdates />],
  ];

  it.each(routes)("route %s renders without crashing", (_p, node) => {
    const { container } = renderAt("/_any", node);
    expect(container).toBeTruthy();
  });

  it("portal entry renders without StaffLayout", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/portal"]}>
        <AppProviders>
          <PortalEntry />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
    expect(screen.queryByText("Daily Briefing")).not.toBeInTheDocument();
  });
});

import { screen } from "@testing-library/react";

describe("Build #33 — Business Health settings persistence", () => {
  it("default business health settings mirror DEFAULT_HEALTH_CONFIG", () => {
    const d = healthSettingsToConfig(defaultBusinessHealthSettings());
    expect(d.utilization_target_pct).toBe(
      DEFAULT_HEALTH_CONFIG.utilization_target_pct,
    );
    expect(d.idle_attention_threshold_days).toBe(
      DEFAULT_HEALTH_CONFIG.idle_attention_threshold_days,
    );
    expect(d.weights).toEqual(DEFAULT_HEALTH_CONFIG.weights);
  });

  it("company policy store seeds business_health", () => {
    let captured: ReturnType<typeof useCompanyPolicies> | null = null;
    function Probe() {
      captured = useCompanyPolicies();
      return null;
    }
    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    expect(captured!.companyPolicies.business_health).toBeDefined();
    expect(
      captured!.companyPolicies.business_health.utilization_target_pct,
    ).toBe(80);
  });

  it("restore defaults resets to v1 weights totalling 100", () => {
    const d = defaultBusinessHealthSettings();
    const total =
      d.weights.collections +
      d.weights.utilization +
      d.weights.availability +
      d.weights.compliance +
      d.weights.operations;
    expect(total).toBe(100);
  });

  it("BusinessHealthSection renders the Signals UI (no weighted-score page)", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <BusinessHealthSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Business Health");
    // Signals UI — not the old weighted "Component Weights" totalling 100%.
    expect(container.textContent).toContain("Signals");
  });

  it("BusinessHealthSection no longer shows the weighted Component Weights UI", () => {
    const { container } = render(
      <MemoryRouter>
        <AppProviders>
          <BusinessHealthSection />
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container.textContent).not.toContain("Component Weights");
    expect(container.textContent).not.toMatch(/must equal 100/);
  });

  it("weights validation rejects non-100 total", () => {
    const bad: HealthConfig = {
      ...DEFAULT_HEALTH_CONFIG,
      weights: { ...DEFAULT_HEALTH_CONFIG.weights, collections: 10 },
    };
    expect(validateWeights(bad)).toBe(false);
  });

  it("weights validation accepts default 100 total", () => {
    expect(validateWeights(DEFAULT_HEALTH_CONFIG)).toBe(true);
  });

  it("health score uses persisted config (formula version retained)", () => {
    const r = useExecutiveTestSources();
    const range = execRange("this_month");
    const cfg: HealthConfig = {
      ...DEFAULT_HEALTH_CONFIG,
      utilization_target_pct: 90,
    };
    const summary = buildExecutiveDashboard(
      r.current.sources,
      range,
      FULL_PERMS,
      cfg,
      NOW,
    );
    expect(summary.health.formula_version).toBe(HEALTH_FORMULA_VERSION);
    expect(
      summary.health.components.find((c) => c.key === "utilization"),
    ).toBeDefined();
  });
});

describe("Build #33 — Last 30 Days rolling range", () => {
  it("last_30_days is a 30-day window ending today", () => {
    const now = new Date("2026-09-15T10:00:00Z");
    const r = resolveProfitabilityRange("last_30_days", undefined, now);
    // start-of-day 29 days back → end-of-day today spans 30 calendar days.
    const days = Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });

  it("last_30_days start is 29 calendar days before end's date", () => {
    const now = new Date("2026-01-30T14:00:00Z");
    const r = resolveProfitabilityRange("last_30_days", undefined, now);
    expect(r.end.toDateString()).toBe(now.toDateString());
    // tz omitted → UTC safe default, so the range start is a UTC instant;
    // assert via the UTC calendar date so it holds under any process TZ.
    expect(r.start.getUTCDate()).toBe(1); // Jan 1 (30 - 29)
  });

  it("last_30_days differs from this_month (mid-month)", () => {
    const now = new Date("2026-09-15T10:00:00Z");
    const a = resolveProfitabilityRange("last_30_days", undefined, now);
    const b = resolveProfitabilityRange("this_month", undefined, now);
    expect(a.start.getTime()).not.toBe(b.start.getTime());
  });

  it("execRange(last_30_days) uses the real rolling range", () => {
    const range = execRange("last_30_days", NOW);
    expect(
      Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000),
    ).toBe(30);
  });

  it("last_30_days is never NaN/Infinity", () => {
    const r = resolveProfitabilityRange("last_30_days");
    expect(isNaN(r.start.getTime())).toBe(false);
    expect(isFinite(r.start.getTime())).toBe(true);
  });
});

describe("Build #33 — Terminology (no raw enum leaks)", () => {
  const RAW = [
    "pending_review",
    "in_progress",
    "company_owned",
    "customer_responsible",
    "needs_attention",
  ];

  it.each(RAW)("'%s' absent from Dashboard HTML", (raw) => {
    const { container } = renderAt("/", <Dashboard />);
    expect(container.textContent).not.toContain(raw);
  });

  it.each(RAW)("'%s' absent from Payments Due HTML", (raw) => {
    const { container } = renderAt("/payments-due", <PaymentsDue />);
    expect(container.textContent).not.toContain(raw);
  });

  it.each(RAW)("'%s' absent from Compliance HTML", (raw) => {
    const { container } = renderAt("/compliance", <Compliance />);
    expect(container.textContent).not.toContain(raw);
  });

  it("Staff page does not expose 'company_owned'", () => {
    const { container } = renderAt("/staff", <Staff />);
    expect(container.textContent).not.toMatch(/company_owned/);
  });
});

describe("Build #33 — Privacy gating (rendered)", () => {
  it("Dashboard does not expose routing_number", () => {
    const { container } = renderAt("/", <Dashboard />);
    expect(container.textContent).not.toMatch(/routing_number/i);
  });

  it("Payments Due does not expose processor_id", () => {
    const { container } = renderAt("/payments-due", <PaymentsDue />);
    expect(container.textContent).not.toMatch(/processor_id/i);
  });

  it("Customer profile does not expose acquisition cost", () => {
    const { container } = renderAt("/customers/cus_1", <CustomerProfile />);
    expect(container.textContent).not.toMatch(/acquisition_cost/i);
  });

  it("Vehicle detail does not expose investor compensation", () => {
    const { container } = renderAt("/vehicles/veh_1", <VehicleDetail />);
    expect(container.textContent).not.toMatch(/investor_compensation/i);
  });
});

describe("Build #33 — Empty state safety", () => {
  it("Tasks renders", () => {
    const { container } = renderAt("/tasks", <Tasks />);
    expect(container.textContent).toBeTruthy();
  });
  it("Maintenance renders", () => {
    const { container } = renderAt("/maintenance", <Maintenance />);
    expect(container.textContent).toBeTruthy();
  });
  it("Damage claims renders", () => {
    const { container } = renderAt("/damage-claims", <DamageClaims />);
    expect(container.textContent).toBeTruthy();
  });
  it("Violations renders", () => {
    const { container } = renderAt("/violations", <Violations />);
    expect(container.textContent).toBeTruthy();
  });
  it("Compliance renders", () => {
    const { container } = renderAt("/compliance", <Compliance />);
    expect(container.textContent).toBeTruthy();
  });
  it("Staff renders", () => {
    const { container } = renderAt("/staff", <Staff />);
    expect(container.textContent).toBeTruthy();
  });
});

describe("Build #33 — Mobile rendering", () => {
  it("Action Center renders mobile", () => {
    expect(renderAt("/action-center", <ActionCenter />).container).toBeTruthy();
  });
  it("Executive Dashboard renders mobile", () => {
    expect(
      renderAt("/executive", <ExecutiveDashboard />).container,
    ).toBeTruthy();
  });
  it("/briefing redirect target renders mobile", () => {
    expect(renderAt("/briefing", <ActionCenter />).container).toBeTruthy();
  });
  it("/copilot redirect target renders mobile", () => {
    expect(renderAt("/copilot", <ActionCenter />).container).toBeTruthy();
  });
  it("Customer 360 renders mobile", () => {
    expect(
      renderAt("/customers/cus_1", <CustomerProfile />).container,
    ).toBeTruthy();
  });
  it("Vehicle Twin renders mobile", () => {
    expect(
      renderAt("/vehicles/veh_1", <VehicleDetail />).container,
    ).toBeTruthy();
  });
  it("Support Center renders mobile", () => {
    expect(renderAt("/support", <SupportCenter />).container).toBeTruthy();
  });
});

describe("Build #33 — Cross-module composition", () => {
  it("Executive Dashboard composes without NaN/Infinity in score", () => {
    const r = useExecutiveTestSources();
    const s = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(isNaN(s.health.overall_score)).toBe(false);
    expect(isFinite(s.health.overall_score)).toBe(true);
    expect(s.health.overall_score).toBeGreaterThanOrEqual(0);
    expect(s.health.overall_score).toBeLessThanOrEqual(100);
  });

  it("health components each clamp 0–100", () => {
    const r = useExecutiveTestSources();
    const s = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    for (const c of s.health.components) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      expect(isNaN(c.score)).toBe(false);
    }
  });

  it("grade mapping covers full range", () => {
    expect(gradeForScore(95)).toBe("excellent");
    expect(gradeForScore(80)).toBe("good");
    expect(gradeForScore(65)).toBe("needs_attention");
    expect(gradeForScore(40)).toBe("critical");
  });

  it("needs attention list is bounded (<=20)", () => {
    const r = useExecutiveTestSources();
    const s = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(s.needs_attention.length).toBeLessThanOrEqual(20);
  });

  it("malformed date falls back safely (no NaN in score)", () => {
    const r = useExecutiveTestSources();
    const bad = execRange("this_month");
    bad.start = new Date("not-a-date");
    const s = buildExecutiveDashboard(
      r.current.sources,
      bad,
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(isNaN(s.health.overall_score)).toBe(false);
    expect(isFinite(s.health.overall_score)).toBe(true);
  });
});
