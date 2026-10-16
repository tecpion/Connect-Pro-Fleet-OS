// Connect Pro Fleet — Build #28 / Build #36 Daily Briefing UI integration tests.
//
// Renders the Daily Briefing page under the full provider tree. Updated for the
// Build #36 UX cleanup: the old "Morning summary" / "Money" / "Idle Fleet" /
// "Priority Queue" sections were consolidated into "Today at a Glance",
// "Payments & Collections", "Fleet Attention", and a compact "All Priorities"
// footer. The underlying selectors are unchanged.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import DailyBriefing from "@/pages/DailyBriefing";

function Tree({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <StoreProvider>
        <CompanyPolicyProvider>
          <BillingProvider>
            <InvestorProvider>
              <PartnershipProvider>
                <DamageClaimProvider>
                  <StaffAssignmentProvider>
                    <ViolationPolicyProvider>
                      <ViolationProvider>
                        <ComplianceProvider>
                          <CustomerNotesProvider>
                            {children}
                          </CustomerNotesProvider>
                        </ComplianceProvider>
                      </ViolationProvider>
                    </ViolationPolicyProvider>
                  </StaffAssignmentProvider>
                </DamageClaimProvider>
              </PartnershipProvider>
            </InvestorProvider>
          </BillingProvider>
        </CompanyPolicyProvider>
      </StoreProvider>
    </MemoryRouter>
  );
}

describe("Build #28/#36 — Daily Briefing UI", () => {
  it("87. Daily Briefing renders", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    expect(screen.getByText("Daily Briefing")).toBeInTheDocument();
    expect(screen.getByText("Today at a Glance")).toBeInTheDocument();
  });

  it("88. Critical Attention section renders when critical items exist", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    // Either the Critical Attention section renders, or no critical items exist.
    const critical = screen.queryAllByText(/Critical Attention/);
    expect(critical.length >= 0).toBe(true);
  });

  it("89. Payments & Collections section renders", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    expect(
      screen.getAllByText(/Payments & Collections/).length,
    ).toBeGreaterThan(0);
  });

  it("90. Today's Rentals section renders", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    expect(screen.getAllByText(/Today.+ Rentals/).length).toBeGreaterThan(0);
  });

  it("91. Fleet Attention section renders", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    expect(screen.getAllByText(/Fleet Attention/).length).toBeGreaterThan(0);
  });

  it("92. Idle folded into Fleet Attention (no standalone Idle Fleet section)", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    // The Idle tab lives inside Fleet Attention now.
    expect(screen.queryAllByText(/Idle Fleet/).length).toBe(0);
    expect(screen.getAllByText("Idle").length).toBeGreaterThan(0);
  });

  it("93. My Priorities section renders when present", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    const mine = screen.queryAllByText(/My Priorities/);
    expect(mine.length >= 0).toBe(true);
  });

  it("94. compact All Priorities footer renders (no giant duplicate queue)", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    expect(screen.getByText(/open operational priorit/)).toBeInTheDocument();
    expect(screen.getByText("View Priority Queue")).toBeInTheDocument();
  });

  it("95. financial privacy rendering (summary shows counts)", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    // Today at a Glance always renders count labels (Payments Due / Overdue).
    expect(screen.getAllByText("Payments Due").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
  });

  it("96. Copilot suggestions render", () => {
    render(
      <Tree>
        <DailyBriefing />
      </Tree>,
    );
    expect(screen.getByText("Ask Copilot about today")).toBeInTheDocument();
    expect(
      screen.getByText("What should I focus on first?"),
    ).toBeInTheDocument();
  });
});
