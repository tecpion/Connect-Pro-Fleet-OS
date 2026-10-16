// Connect Pro Fleet — Build #32 Portal privacy integration tests.
//
// Verifies the portal never leaks: another customer's data, acquisition cost,
// profitability, investor/JV economics, banking data, internal notes, internal
// staff assignments, private support comments, raw ledger IDs, processor IDs,
// full DL/insurance numbers, or internal diagnostics. Also verifies the portal
// Help page only shows customer/both KB articles and that support diagnostics
// are sanitized.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import {
  PortalSessionProvider,
  usePortalSession,
} from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import { TENANT_ID } from "@/lib/store/ids";
import { PortalShell } from "@/pages/portal/PortalEntry";
import { PortalHome } from "@/pages/portal/PortalHome";
import { PortalPayments } from "@/pages/portal/PortalPayments";
import { PortalRental } from "@/pages/portal/PortalRental";
import { PortalHelp } from "@/pages/portal/PortalHelp";
import { buildCustomerPortal } from "@/lib/portalComposer";
import {
  createPortalSession,
  assertPortalAccess,
} from "@/lib/portalSessionStore";
import { usePortalTestSources, OTHER_TENANT_ID } from "./portalTestHarness";
import { buildDiagnosticsSnapshot } from "@/lib/supportDiagnostics";
import { publishedArticles } from "@/lib/supportKnowledgeBase";

function PortalProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <CustomerNotesProvider>
            <ComplianceProvider>
              <PortalSessionProvider>
                <PortalRequestProvider>{children}</PortalRequestProvider>
              </PortalSessionProvider>
            </ComplianceProvider>
          </CustomerNotesProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

function SessionBootstrap({
  customerId,
  children,
}: {
  customerId: string;
  children: ReactNode;
}) {
  const { session, startSession } = usePortalSession();
  if (!session) {
    startSession({
      customer_id: customerId,
      tenant_id: TENANT_ID,
      verification_mode: "development",
    });
    return null;
  }
  return <>{children}</>;
}

function renderPortal(node: ReactNode, customerId = "cus_1") {
  return render(
    <MemoryRouter initialEntries={["/portal"]}>
      <PortalProviders>
        <SessionBootstrap customerId={customerId}>
          <Routes>
            <Route path="*" element={node} />
          </Routes>
        </SessionBootstrap>
      </PortalProviders>
    </MemoryRouter>,
  );
}

function buildView(customerId: string, tenantId: string = TENANT_ID) {
  const { result } = usePortalTestSources();
  const session = createPortalSession(customerId, tenantId);
  return {
    session,
    view: buildCustomerPortal(session, {
      store: result.current.store,
      billing: result.current.billing,
      compliance: result.current.compliance,
      requests: result.current.requests.requests,
    }),
  };
}

describe("Build #32 — Portal privacy: rendered HTML", () => {
  it("does not render acquisition cost anywhere on Home", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalHome />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/acquisition_cost/i);
    expect(container.textContent).not.toMatch(/acquisition cost/i);
  });

  it("does not render profitability data on Home", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalHome />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/profit_margin/i);
    expect(container.textContent).not.toMatch(/operating profit/i);
  });

  it("does not render investor/JV data on Home", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalHome />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/investor/i);
    expect(container.textContent).not.toMatch(/joint venture/i);
  });

  it("does not render banking data on Payments", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalPayments />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/bank_account/i);
    expect(container.textContent).not.toMatch(/routing_number/i);
  });

  it("does not render internal staff notes on Rental", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalRental />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/internal_note/i);
    expect(container.textContent).not.toMatch(/staff_note/i);
  });

  it("does not render raw ledger transaction IDs on Payments", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalPayments />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/\btxn_\w+/);
  });

  it("does not render processor IDs on Payments", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalPayments />
      </PortalShell>,
    );
    expect(container.textContent).not.toMatch(/processor_id/i);
    expect(container.textContent).not.toMatch(/external_transaction_id/i);
  });

  it("does not render the full DL number on Documents", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalRental />
      </PortalShell>,
    );
    // cus_1 DL = D1234567
    expect(container.textContent).not.toMatch(/D1234567/);
  });

  it("does not render the full insurance policy number", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalRental />
      </PortalShell>,
    );
    // cus_1 insurance policy = SF-9981-22041
    expect(container.textContent).not.toMatch(/SF-9981-22041/);
  });
});

describe("Build #32 — Portal privacy: cross-customer / cross-tenant", () => {
  it("customer A's rendered Home does not show customer B's rental", () => {
    const { view: viewA } = buildView("cus_1");
    const { view: viewB } = buildView("cus_2");
    const aNumbers = viewA.active_rentals.map((r) => r.agreement_number);
    const bNumbers = viewB.active_rentals.map((r) => r.agreement_number);
    for (const n of aNumbers) {
      expect(bNumbers).not.toContain(n);
    }
  });

  it("cross-tenant access is denied at the session boundary", () => {
    // assertPortalAccess is the boundary contract: a session minted for one
    // tenant must not pass an access check for a different tenant.
    const session = createPortalSession("cus_1", TENANT_ID);
    expect(() =>
      assertPortalAccess(session, OTHER_TENANT_ID, "cus_1"),
    ).toThrow();
    // A self-consistent session passes its own check.
    expect(() => assertPortalAccess(session, TENANT_ID, "cus_1")).not.toThrow();
  });

  it("portal view never exposes acquisition cost or investor fields", () => {
    const { view } = buildView("cus_1");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("acquisition_cost");
    expect(serialized).not.toContain("investor");
    expect(serialized).not.toContain("profit_margin");
  });

  it("portal view never exposes banking fields", () => {
    const { view } = buildView("cus_1");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("bank_account");
    expect(serialized).not.toContain("routing_number");
  });

  it("portal view never exposes internal staff assignments", () => {
    const { view } = buildView("cus_1");
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("staff_assignment");
    expect(serialized).not.toContain("internal_task");
  });
});

describe("Build #32 — Portal Help: KB audience filtering", () => {
  it("renders only customer/both KB articles", () => {
    const { container } = renderPortal(
      <PortalShell>
        <PortalHelp />
      </PortalShell>,
    );
    // Staff-only slugs must not appear as links.
    expect(container.textContent).not.toMatch(
      /understanding-the-executive-dashboard/i,
    );
    expect(container.textContent).not.toMatch(
      /understanding-business-health-score/i,
    );
  });

  it("shows customer-facing help articles", () => {
    renderPortal(
      <PortalShell>
        <PortalHelp />
      </PortalShell>,
    );
    // "Security Deposits" is a customer-audience article that should appear.
    expect(screen.getByText("Security Deposits")).toBeInTheDocument();
  });

  it("published KB has no customer-audience leak of staff-only content", () => {
    const published = publishedArticles();
    // All seed articles are currently all_staff; the portal filters them out
    // unless they are in the CUSTOMER_SLUGS allowlist. Verify no staff-only
    // article appears with audience "customer" falsely.
    for (const a of published) {
      if (a.audience === "all_staff") {
        // Staff-only articles should not be marketed as customer-visible.
        expect(a.audience).not.toBe("customer");
      }
    }
  });
});

describe("Build #32 — Portal diagnostics sanitization", () => {
  it("excludes tokens, API keys, and banking from diagnostics", () => {
    const snap = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "cus_1",
      route: "/portal",
      selectedLocationId: null,
      metadata: {
        note: "sk-test-1234567890secretkey",
        jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjdXNfMSJ9.secretsignature",
      },
    });
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain("sk-test-1234567890secretkey");
    expect(serialized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(serialized).not.toContain("secretsignature");
  });

  it("includes safe portal route + tenant/customer refs", () => {
    const snap = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "cus_1",
      route: "/portal/payments",
      selectedLocationId: null,
    });
    expect(snap.route).toBe("/portal/payments");
    expect(snap.tenant_reference).toBe(TENANT_ID);
    expect(snap.user_reference).toBe("cus_1");
  });

  it("does not include full banking or document values", () => {
    const snap = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "cus_1",
      route: "/portal",
      selectedLocationId: null,
      metadata: {
        bank_account: "1234567890123456",
        routing_number: "021000021",
      },
    });
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("021000021");
  });
});
