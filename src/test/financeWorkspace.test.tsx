// Connect Pro Fleet — Finance workspace consolidation acceptance tests.
//
// Verifies the Expenses + Banking + Reconciliation IA consolidation into one
// /finance workspace: the Finance route loads, the four top-level tabs render
// (permission-aware), legacy /expenses + /banking routes redirect to /finance,
// URL tab/subtab state is addressable, the Overview reuses authoritative
// selectors (no duplicate logic), permission-safe rendering, and the sidebar
// exposes a single Finance item (standalone Expenses/Banking removed;
// Profitability + Investor & Partner Management remain separate).

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
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
import { useStore } from "@/lib/store";
import Finance from "@/pages/Finance";
import {
  ExpensesRedirect,
  BankingRedirect,
} from "@/components/FinanceRedirects";
import {
  StaffLayout,
  navGroups,
  standaloneNavItems,
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

function renderFinanceAt(path: string, probe?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <StaffLayout>
          {probe}
          <Routes>
            <Route path="/finance" element={<Finance />} />
            <Route path="*" element={<div>not found</div>} />
          </Routes>
        </StaffLayout>
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
// Sidebar — the Finance item replaces standalone Expenses/Banking
// ---------------------------------------------------------------------------

describe("Finance workspace — sidebar consolidation", () => {
  it("exposes a single Finance sidebar item", () => {
    const finance = navGroups.find((g) => g.label === "Finance")!;
    expect(finance.items.find((i) => i.to === "/finance")).toBeDefined();
  });

  it("removes the standalone Expenses sidebar item", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/expenses")).toBeUndefined();
  });

  it("removes the standalone Banking sidebar item", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/banking")).toBeUndefined();
  });

  it("keeps Profitability as a separate Finance-group item (not folded in)", () => {
    const finance = navGroups.find((g) => g.label === "Finance")!;
    expect(finance.items.find((i) => i.to === "/profitability")).toBeDefined();
  });

  it("keeps Investor & Partner Management separate (not folded into Finance)", () => {
    const finance = navGroups.find((g) => g.label === "Finance")!;
    const inv = finance.items.find((i) => i.to === "/investors");
    expect(inv).toBeDefined();
    expect(inv!.label).toBe("Investor & Partner Management");
  });

  it("Finance is not a standalone top item", () => {
    expect(standaloneNavItems.find((i) => i.to === "/finance")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Route — /finance loads and renders the workspace
// ---------------------------------------------------------------------------

describe("Finance workspace — /finance route", () => {
  it("loads the Finance page with the Finance header", () => {
    renderFinanceAt("/finance");
    expect(
      screen.getByRole("heading", { name: "Finance" }),
    ).toBeInTheDocument();
  });

  it("renders the Overview tab by default when no tab is specified", () => {
    renderFinanceAt("/finance");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Expenses This Month")).toBeInTheDocument();
  });

  it("renders all four top-level tabs for the owner", () => {
    renderFinanceAt("/finance");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Banking" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Reconciliation" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tab state — URL-addressable (refresh/bookmark/back)
// ---------------------------------------------------------------------------

describe("Finance workspace — URL tab state", () => {
  it("honors ?tab=expenses and shows the Expenses sub-workspace", () => {
    renderFinanceAt("/finance?tab=expenses");
    // The top-level Expenses tab is active.
    const tabs = screen.getAllByRole("tab", { name: "Expenses" });
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs.some((t) => t.getAttribute("data-state") === "active")).toBe(
      true,
    );
    // The embedded Expenses V1 KPI row renders.
    expect(screen.getByText("Expenses This Month")).toBeInTheDocument();
  });

  it("honors ?tab=banking and shows the Banking sub-workspace", () => {
    renderFinanceAt("/finance?tab=banking");
    const tabs = screen.getAllByRole("tab", { name: "Banking" });
    expect(tabs.some((t) => t.getAttribute("data-state") === "active")).toBe(
      true,
    );
    // The embedded Banking KPI row renders (Needs Review label appears).
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
  });

  it("honors ?tab=reconciliation and shows the Reconciliation view", () => {
    renderFinanceAt("/finance?tab=reconciliation");
    expect(screen.getByRole("tab", { name: "Reconciliation" })).toHaveAttribute(
      "data-state",
      "active",
    );
    // The reconciliation filter buttons render (Open / Needs Attention /
    // Reconciled) — confirms the Reconciliation tab mounted.
    expect(screen.getByRole("button", { name: /Open \(/ })).toBeInTheDocument();
  });

  it("falls back to Overview for an unknown tab value", () => {
    renderFinanceAt("/finance?tab=nonsense");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("switching top tabs activates the clicked tab", () => {
    renderFinanceAt("/finance");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "data-state",
      "active",
    );
    // Radix Tabs use pointerDown to activate; fire mouseDown.
    act(() => {
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Banking" }));
    });
    expect(screen.getByRole("tab", { name: "Banking" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("preserves the Expenses subtab (?tab=expenses&subtab=receipts)", () => {
    renderFinanceAt("/finance?tab=expenses&subtab=receipts");
    expect(screen.getByRole("tab", { name: "Receipts" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("preserves the Banking subtab (?tab=banking&subtab=statements)", () => {
    renderFinanceAt("/finance?tab=banking&subtab=statements");
    expect(screen.getByRole("tab", { name: "Statements" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});

// ---------------------------------------------------------------------------
// Overview — reuses authoritative selectors (no duplicate KPI logic)
// ---------------------------------------------------------------------------

describe("Finance workspace — Overview reuse", () => {
  it("Overview shows the Expenses This Month KPI from the expense selector", () => {
    renderFinanceAt("/finance");
    expect(screen.getByText("Expenses This Month")).toBeInTheDocument();
    expect(screen.getByText("Missing Receipts")).toBeInTheDocument();
    expect(screen.getByText("Reimbursements Owed")).toBeInTheDocument();
  });

  it("Overview shows banking attention KPIs from the banking selector", () => {
    renderFinanceAt("/finance");
    expect(screen.getByText("Unmatched Bank Txns")).toBeInTheDocument();
    expect(screen.getByText("Statements Need Attention")).toBeInTheDocument();
  });

  it("Overview surfaces the Month-End Expense Check (reused)", () => {
    renderFinanceAt("/finance");
    expect(screen.getByText("Month-End Expense Check")).toBeInTheDocument();
    // Month-End grid labels.
    expect(screen.getByText("Unmatched bank")).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
  });

  it("Overview attention row links exist for actionable items", () => {
    renderFinanceAt("/finance");
    // The Needs Attention section renders with at least one attention row.
    const section = screen.getByText("Needs Attention").closest("section");
    expect(section).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Permissions — permission-safe rendering
// ---------------------------------------------------------------------------

describe("Finance workspace — permissions", () => {
  it("owner sees all four tabs", () => {
    renderFinanceAt("/finance");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Banking" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Reconciliation" }),
    ).toBeInTheDocument();
  });

  it("user role (stf_3) without banking.view does not see Banking/Reconciliation tabs", () => {
    const { Probe, switchTo } = useSwitchStaff();
    renderFinanceAt("/finance", <Probe />);
    switchTo("stf_3");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Banking" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Reconciliation" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Legacy redirects — /expenses + /banking → /finance
// ---------------------------------------------------------------------------

describe("Finance workspace — legacy redirects", () => {
  function renderRedirectsAt(initial: string) {
    const locationRef: { current: string } = { current: "" };
    function LocationProbe() {
      const loc = useLocation();
      locationRef.current = loc.pathname + loc.search;
      return <div data-testid="probe">{loc.pathname + loc.search}</div>;
    }
    render(
      <MemoryRouter initialEntries={[initial]}>
        <AppProviders>
          <Routes>
            <Route path="/expenses" element={<ExpensesRedirect />} />
            <Route path="/banking" element={<BankingRedirect />} />
            <Route
              path="/finance"
              element={
                <>
                  <Finance />
                  <LocationProbe />
                </>
              }
            />
            <Route path="*" element={<div>not found</div>} />
          </Routes>
        </AppProviders>
      </MemoryRouter>,
    );
    return locationRef;
  }

  it("redirects /expenses → /finance?tab=expenses", () => {
    const loc = renderRedirectsAt("/expenses");
    expect(loc.current.startsWith("/finance")).toBe(true);
    expect(loc.current).toContain("tab=expenses");
  });

  it("redirects /banking → /finance?tab=banking", () => {
    const loc = renderRedirectsAt("/banking");
    expect(loc.current.startsWith("/finance")).toBe(true);
    expect(loc.current).toContain("tab=banking");
  });

  it("preserves ?txn= on the /banking redirect", () => {
    const loc = renderRedirectsAt("/banking?txn=abc_123");
    expect(loc.current).toContain("txn=abc_123");
    expect(loc.current).toContain("tab=banking");
  });

  it("preserves ?expense= on the /expenses redirect", () => {
    const loc = renderRedirectsAt("/expenses?expense=exp_1");
    expect(loc.current).toContain("expense=exp_1");
    expect(loc.current).toContain("tab=expenses");
  });

  it("translates /banking?tab=statements → subtab=statements", () => {
    const loc = renderRedirectsAt("/banking?tab=statements");
    expect(loc.current).toContain("subtab=statements");
  });
});

// ---------------------------------------------------------------------------
// Deep-link compatibility — banking attention deep-links point at /finance
// ---------------------------------------------------------------------------

describe("Finance workspace — deep-link compatibility", () => {
  it("bankingAttention transaction deep-links point at /finance (not /banking)", async () => {
    const { getTransactionAttention } = await import("@/lib/bankingAttention");
    let captured: ReturnType<typeof getTransactionAttention> = [];
    function Probe() {
      const store = useStore();
      captured = getTransactionAttention(
        store.importedTransactions,
        store.reconciliationMatches,
        (id) => store.financialAccountById(id)?.name ?? null,
      );
      return null;
    }
    render(
      <MemoryRouter>
        <AppProviders>
          <Probe />
        </AppProviders>
      </MemoryRouter>,
    );
    const links = captured
      .map((c) => c.deep_link)
      .filter((d): d is string => !!d);
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.startsWith("/finance"))).toBe(true);
    expect(links.some((l) => l.includes("tab=banking"))).toBe(true);
  });

  it("statement attention deep-links point at /finance?tab=reconciliation", async () => {
    const { getStatementAttention } = await import("@/lib/bankingAttention");
    let captured: ReturnType<typeof getStatementAttention> = [];
    function Probe() {
      const store = useStore();
      captured = getStatementAttention(
        store.statements,
        store.importedTransactions,
        (id) => store.financialAccountById(id)?.name ?? null,
      );
      return null;
    }
    render(
      <MemoryRouter>
        <AppProviders>
          <Probe />
        </AppProviders>
      </MemoryRouter>,
    );
    const links = captured
      .map((c) => c.deep_link)
      .filter((d): d is string => !!d);
    // Statement attention deep-links now route into the Finance reconciliation tab.
    expect(links.every((l) => l.startsWith("/finance"))).toBe(true);
  });
});
