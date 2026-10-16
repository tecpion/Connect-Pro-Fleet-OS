// Build #31 — Support Center UI tests.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { SupportProvider } from "@/lib/supportStore";
import SupportCenter from "@/pages/support/SupportCenter";
import SupportStatus from "@/pages/support/SupportStatus";
import SupportUpdates from "@/pages/support/SupportUpdates";
import SupportArticle from "@/pages/support/SupportArticle";
import SupportTicketDetail from "@/pages/support/SupportTicketDetail";
import { useSupportTestSources } from "./supportTestHarness";

function Providers({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <CustomerNotesProvider>
            <SupportProvider>{children}</SupportProvider>
          </CustomerNotesProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

// Render a page that does NOT depend on route params (no useParams).
function renderWithRouter(node: ReactNode, route = "/support") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Providers>
        <Routes>
          <Route path="*" element={node} />
        </Routes>
      </Providers>
    </MemoryRouter>,
  );
}

// Render a param-based page against its real route so useParams resolves.
function renderAtRoute(node: ReactNode, pattern: string, route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Providers>
        <Routes>
          <Route path={pattern} element={node} />
        </Routes>
      </Providers>
    </MemoryRouter>,
  );
}

describe("Build #31 — Support Center UI", () => {
  it("71. Support Center renders", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.getByText("Help & Support")).toBeTruthy();
  });

  it("72. search box present", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.getByLabelText("Search help")).toBeTruthy();
  });

  it("73. categories shown", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.getByText("Browse by category")).toBeTruthy();
  });

  it("74. System status card present", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.getByText("System status")).toBeTruthy();
  });

  it("75. My requests card present", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.getByText("My support requests")).toBeTruthy();
  });

  it("76. Report a problem button present (owner can create)", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.getByText("Report a problem")).toBeTruthy();
  });

  it("77. article page renders content", () => {
    renderAtRoute(
      <SupportArticle />,
      "/support/articles/:slug",
      "/support/articles/understanding-billing-periods",
    );
    expect(screen.getByText("Understanding Billing Periods")).toBeTruthy();
  });

  it("78. ticket detail renders not-found for missing ticket", () => {
    renderAtRoute(
      <SupportTicketDetail />,
      "/support/tickets/:id",
      "/support/tickets/nonexistent",
    );
    expect(screen.getByText("Request not found")).toBeTruthy();
  });

  it("79. status page renders overall + components", () => {
    renderWithRouter(<SupportStatus />, "/support/status");
    expect(screen.getByText("System status")).toBeTruthy();
  });

  it("80. updates page renders release notes", () => {
    renderWithRouter(<SupportUpdates />, "/support/updates");
    expect(
      screen.getAllByText("Executive Dashboard & Business Health").length,
    ).toBeGreaterThan(0);
  });

  it("81. empty search state — no premature 'no articles found'", () => {
    renderWithRouter(<SupportCenter />);
    expect(screen.queryByText("No articles found")).toBeNull();
  });

  it("82. finance hidden — support pages contain no financial amounts", () => {
    const { container } = renderWithRouter(<SupportCenter />);
    expect(container.textContent).not.toMatch(/\$[0-9,]+\.\d{2}/);
  });

  it("83. ticket detail shows seeded resolved ticket", () => {
    const r = useSupportTestSources();
    const seeded = r.current.support.tickets[0];
    renderAtRoute(
      <SupportTicketDetail />,
      "/support/tickets/:id",
      `/support/tickets/${seeded.id}`,
    );
    expect(screen.getByText(seeded.subject)).toBeTruthy();
  });
});
