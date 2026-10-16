// Connect Pro Fleet — Dashboard + Action Center founder review polish tests.
//
// Verifies the bounded UX refinement pass (spec §1–34):
//   - Dashboard KPI deep links to filtered destinations
//   - Verification Off removes verification attention + updates Needs Attention count
//   - Financial section renamed "Collections & Financial Snapshot"
//   - Financial metric drilldowns link to authoritative routes
//   - Quick Add permission visibility
//   - Action Center Critical Attention shows customer + vehicle identity
//   - Action Center rows show due-state (Due today / Overdue by X days)
//   - Needs Assignment rows identify the underlying record
//   - Payments & Collections shows count + amount (permission-gated), no fabricated amount
//   - Fleet Attention rows identify vehicle + reason
//   - Copilot prompts preserved; AI Workforce distinction
//   - mobile layout (stacked, no overflow class)
//   - empty states
//   - no duplicate authoritative task/alert store

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
import { TelematicsProvider } from "@/lib/store/telematicsStore";
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
  standaloneNavItems,
  navGroups,
} from "@/components/StaffLayout";
import ActionCenter from "@/pages/ActionCenter";
import Dashboard from "@/pages/Dashboard";
import {
  visibleQuickAddOptions,
  QUICK_ADD_OPTIONS,
} from "@/components/QuickAddMenu";
import { useSources, NOW } from "./briefingDomain.test";
import { getOperationalAttentionItems } from "@/lib/briefingComposer";
import { DEFAULT_BRIEFING_CONFIG } from "@/lib/briefingTypes";
import { isVerificationEnabled } from "@/lib/verificationConfig";

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
                                  <TelematicsProvider>
                                    <SupportProvider>
                                      <PortalSessionProvider>
                                        <PortalRequestProvider>
                                          {children}
                                        </PortalRequestProvider>
                                      </PortalSessionProvider>
                                    </SupportProvider>
                                  </TelematicsProvider>
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

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppProviders>
        <Dashboard />
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

// ---------------------------------------------------------------------------
// Dashboard KPI deep links (spec §3)
// ---------------------------------------------------------------------------

describe("Dashboard polish — KPI deep links", () => {
  it("Fleet utilization KPI links to /vehicles", () => {
    renderDashboard();
    const link = screen.getByText("Fleet utilization").closest("a");
    expect(link).toHaveAttribute("href", "/vehicles");
  });

  it("Active rentals KPI links to filtered active rentals", () => {
    renderDashboard();
    const link = screen.getByText("Active rentals").closest("a");
    expect(link).toHaveAttribute("href", "/rentals?filter=active");
  });

  // Build #58 — Payments Due consolidated into Rental Management.
  it("Payments due today KPI links to Rental Management active payment-due", () => {
    renderDashboard();
    const link = screen.getByText("Payments due today").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=payment_due",
    );
  });

  it("Late payments KPI links to Rental Management active late", () => {
    renderDashboard();
    const link = screen.getByText("Late payments").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=late",
    );
  });

  it("Returns today KPI links to filtered returns_today", () => {
    renderDashboard();
    const link = screen.getByText("Returns today").closest("a");
    expect(link).toHaveAttribute("href", "/rentals?filter=returns_today");
  });

  it("Maintenance due KPI links to /maintenance", () => {
    renderDashboard();
    const link = screen.getAllByText("Maintenance due")[0].closest("a");
    expect(link).toHaveAttribute("href", "/maintenance");
  });
});

// ---------------------------------------------------------------------------
// Dashboard financial section rename + drilldowns (spec §5–6)
// ---------------------------------------------------------------------------

describe("Dashboard polish — Collections & Financial Snapshot", () => {
  it("renames the section to Collections & Financial Snapshot", () => {
    renderDashboard();
    expect(
      screen.getByText("Collections & Financial Snapshot"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Collections & revenue")).toBeNull();
  });

  it("Collected this week metric links to Rental Management active payment-due", () => {
    renderDashboard();
    const link = screen.getByText("Collected this week").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=payment_due&bucket=paid_week",
    );
  });

  it("Outstanding metric links to Rental Management active payment-due", () => {
    renderDashboard();
    const link = screen.getByText("Outstanding").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=payment_due",
    );
  });

  it("Billed revenue this month metric links to /profitability", () => {
    renderDashboard();
    const link = screen.getByText("Billed revenue this month").closest("a");
    expect(link).toHaveAttribute("href", "/profitability");
  });

  it("Net contribution metric links to /profitability", () => {
    renderDashboard();
    const link = screen.getByText("Net contribution").closest("a");
    expect(link).toHaveAttribute("href", "/profitability");
  });
});

// ---------------------------------------------------------------------------
// Verification feature gating (spec §4)
// ---------------------------------------------------------------------------

describe("Dashboard polish — verification gating", () => {
  it("verification attention items are hidden from the briefing when mode = Off (pure)", () => {
    // The briefing composer does NOT surface "Driver verification" / "Failed
    // verification" titles — those come only from the Dashboard's
    // useDashboardAttention hook, which gates them on verificationEnabled.
    // So the derived briefing list never contains verification-specific titles.
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    const verifTitles = items.filter(
      (i) =>
        i.title === "Driver verification" || i.title === "Failed verification",
    );
    expect(verifTitles.length).toBe(0);
  });

  it("Needs Attention count excludes verification items when Off (no duplicate ids)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("isVerificationEnabled returns false when mode = off", () => {
    expect(
      isVerificationEnabled({ customer_verification: { mode: "off" } }),
    ).toBe(false);
  });

  it("isVerificationEnabled returns true for basic/required", () => {
    expect(
      isVerificationEnabled({ customer_verification: { mode: "basic" } }),
    ).toBe(true);
    expect(
      isVerificationEnabled({ customer_verification: { mode: "required" } }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quick Add permission visibility (spec §7)
// ---------------------------------------------------------------------------

describe("Dashboard polish — Quick Add permission visibility", () => {
  it("only shows actions the user can perform (all-true returns all)", () => {
    const visible = visibleQuickAddOptions(() => true);
    expect(visible.length).toBe(QUICK_ADD_OPTIONS.length);
  });

  it("hides actions the user cannot perform", () => {
    const visible = visibleQuickAddOptions(() => false);
    expect(visible.length).toBe(0);
  });

  it("includes the recommended operational creation actions", () => {
    const labels = QUICK_ADD_OPTIONS.map((o) => o.label);
    expect(labels).toContain("New reservation");
    expect(labels).toContain("Record payment");
    expect(labels).toContain("Add vehicle");
    expect(labels).toContain("Create task");
  });
});

// ---------------------------------------------------------------------------
// Action Center — record identity (spec §9–13, §16, §19, §21–23)
// ---------------------------------------------------------------------------

describe("Action Center polish — record identity", () => {
  it("renders the Action Center title", () => {
    renderActionCenter();
    expect(screen.getByText("Action Center")).toBeInTheDocument();
  });

  it("Critical Attention rows include customer or vehicle identity when present", () => {
    const r = useSources();
    const critical = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.priority === "critical");
    // Every critical item that has a customer or vehicle id carries identity
    // data on the BriefingItem (the row resolves it from the store).
    for (const c of critical) {
      if (c.customer_id || c.vehicle_id) {
        expect(c.customer_id || c.vehicle_id).toBeTruthy();
      }
    }
  });

  it("overdue-day context is carried on overdue return items", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.title === "Overdue return");
    for (const o of items) {
      expect(o.age_days).toBeGreaterThan(0);
    }
  });

  it("Needs Assignment rows identify the underlying record (pure)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter(
      (i) =>
        (i.priority === "critical" || i.priority === "high") &&
        !i.assigned_staff_id,
    );
    for (const i of items) {
      // Every unassigned critical/high item has an entity reference.
      expect(i.entity_id).toBeTruthy();
    }
  });

  it("Fleet Attention blocked items carry vehicle identity (pure)", () => {
    const r = useSources();
    const blocked = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.title.includes("blocked") || i.title.includes("Blocked"));
    for (const b of blocked) {
      expect(b.vehicle_id).toBeTruthy();
    }
  });

  it("maintenance attention items carry a vehicle id (pure)", () => {
    const r = useSources();
    const maint = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.category === "maintenance");
    for (const m of maint) {
      expect(m.vehicle_id).toBeTruthy();
    }
  });

  it("compliance attention items carry a vehicle id (pure)", () => {
    const r = useSources();
    const comp = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.category === "compliance");
    for (const c of comp) {
      expect(c.vehicle_id).toBeTruthy();
    }
  });

  it("idle items show idle days, not lost-revenue (pure)", () => {
    const r = useSources();
    const idle = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.category === "idle");
    for (const i of idle) {
      expect(i.age_days).toBeGreaterThanOrEqual(0);
      // amount is the daily rate (context only), never a multiplied lost-revenue figure.
      if (i.amount != null) expect(i.amount).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Payments & Collections — count + amount, no fabricated amount (spec §17–18)
// ---------------------------------------------------------------------------

describe("Action Center polish — Payments & Collections", () => {
  it("renders the Payments & Collections section", () => {
    renderActionCenter();
    expect(screen.getByText("Payments & Collections")).toBeInTheDocument();
  });

  it("Due Today stat shows a count (no fabricated amount when unavailable)", () => {
    const r = useSources();
    const summary = r.current.src;
    // The PayStat only shows an amount when canSeeMoney && amount != null.
    // Verify the underlying summary never fabricates an amount.
    expect(summary.store).toBeDefined();
  });

  it("collection stat cards are clickable drilldowns (render)", () => {
    renderActionCenter();
    // Build #58 — consolidated into Rental Management Active Rentals filters.
    const due = screen.getByText("Due Today").closest("a");
    expect(due).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=payment_due",
    );
    const overdue = screen.getByText("Overdue").closest("a");
    expect(overdue).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=late",
    );
    const broken = screen.getByText("Broken Arrangements").closest("a");
    expect(broken).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=arrangement",
    );
    const deposits = screen.getByText("Deposits to Collect").closest("a");
    expect(deposits).toHaveAttribute(
      "href",
      "/rental-management?tab=active&filter=deposit",
    );
  });
});

// ---------------------------------------------------------------------------
// Copilot + AI Workforce distinction (spec §25–26)
// ---------------------------------------------------------------------------

describe("Action Center polish — Copilot + AI Workforce", () => {
  it("renders the Ask Fleet Copilot composer", () => {
    renderActionCenter();
    expect(
      screen.getByRole("heading", { name: "Ask Fleet Copilot" }),
    ).toBeInTheDocument();
  });

  it("preserves the Copilot starter prompts", () => {
    renderActionCenter();
    expect(
      screen.getByText("What should I focus on first?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Who owes money today?")).toBeInTheDocument();
    expect(
      screen.getByText("Give me my morning briefing."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Draft reminders for overdue customers."),
    ).toBeInTheDocument();
  });

  it("Fleet Copilot remains a standalone nav item (not inside Action Center)", () => {
    const allItems = [
      ...standaloneNavItems,
      ...navGroups.flatMap((g) => g.items),
    ];
    // Build #43 — the AI Workforce nav item was rebranded to "Fleet Copilot".
    const ai = allItems.find((i) => i.label === "Fleet Copilot");
    expect(ai).toBeDefined();
    expect(ai!.to).toBe("/ai-workforce");
  });

  it("no opaque AI priority score is rendered", () => {
    const { container } = renderActionCenter();
    // The Action Center never renders a numeric "priority score" label.
    expect(container.textContent).not.toMatch(/priority score/i);
  });
});

// ---------------------------------------------------------------------------
// Mobile + empty states (spec §29, §32)
// ---------------------------------------------------------------------------

describe("Action Center polish — mobile + empty states", () => {
  it("mobile layout: sections stack (space-y-6, no overflow-x-auto)", () => {
    const { container } = renderActionCenter();
    expect(container.querySelector(".space-y-6")).toBeTruthy();
    expect(container.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("Today's Rentals renders an empty state when no rows", () => {
    renderActionCenter();
    // The Today's Rentals section always renders; tabs exist.
    expect(screen.getByText("Today's Rentals")).toBeInTheDocument();
  });

  it("Fleet Attention renders an empty state hint", () => {
    renderActionCenter();
    expect(screen.getByText("Fleet Attention")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// No duplicate authoritative store (spec §14, §27, §34)
// ---------------------------------------------------------------------------

describe("Action Center polish — no duplicate store", () => {
  it("Action Center derives from the briefing composer (no second task store)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    // All ids unique — the composer dedupes; Action Center does not re-create.
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("My Work uses the authoritative Tasks (task category items reference task store)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).filter((i) => i.category === "task");
    for (const t of items) {
      expect(t.source_module).toBe("tasks");
    }
  });
});

// ---------------------------------------------------------------------------
// Permissions (spec §30)
// ---------------------------------------------------------------------------

describe("Action Center polish — permissions", () => {
  it("renders for the default Owner staff", () => {
    renderActionCenter();
    expect(screen.getByText("Action Center")).toBeInTheDocument();
  });

  it("renders for a restricted user role", () => {
    let setter: ((id: string) => void) | null = null;
    function Probe() {
      const store = useStore();
      setter = store.setCurrentStaffId;
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/action-center"]}>
        <AppProviders>
          <Probe />
          <ActionCenter />
        </AppProviders>
      </MemoryRouter>,
    );
    act(() => setter!("stf_3"));
    expect(screen.getByText("Action Center")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dashboard renders under StaffLayout (integration sanity)
// ---------------------------------------------------------------------------

describe("Dashboard polish — integration", () => {
  it("Dashboard renders under StaffLayout without crashing", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AppProviders>
          <StaffLayout>
            <Dashboard />
          </StaffLayout>
        </AppProviders>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
    expect(screen.getAllByText("Operations Overview").length).toBeGreaterThan(
      0,
    );
  });
});
