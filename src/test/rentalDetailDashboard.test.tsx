// Connect Pro Fleet — Rental Detail dashboard tests (Build #59).
//
// Founder review restored Rental Detail to a strong at-a-glance operational
// dashboard (no top-level tabs). These tests confirm:
//   - core info renders without tab navigation
//   - payment / deposit / billing information appears on the main page
//   - Rental Actions render contextually
//   - Activity Timeline renders authoritative events
//   - Rental Record remains accessible
//   - warnings appear only when applicable
//   - navigation consolidation remains intact (no standalone nav links)
//
// No business logic is changed — these are UX/layout tests only.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
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
import { DefenseProvider } from "@/lib/store/defenseStore";
import { StaffLayout, navGroups } from "@/components/StaffLayout";
import RentalDetail from "@/pages/RentalDetail";

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <ResourceCenterProvider>
            <IncidentsProvider>
              <DefenseProvider>
                <InvestorProvider>
                  <PartnershipProvider>
                    <DamageClaimProvider>
                      <MigrationProvider>
                        <IntegrationProvider>
                          <StaffAssignmentProvider>
                            <ViolationPolicyProvider>
                              <ViolationProvider>
                                <TelematicsProvider>
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
                                </TelematicsProvider>
                              </ViolationProvider>
                            </ViolationPolicyProvider>
                          </StaffAssignmentProvider>
                        </IntegrationProvider>
                      </MigrationProvider>
                    </DamageClaimProvider>
                  </PartnershipProvider>
                </InvestorProvider>
              </DefenseProvider>
            </IncidentsProvider>
          </ResourceCenterProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

function renderRental(rentalId: string) {
  return render(
    <MemoryRouter initialEntries={[`/rentals/${rentalId}`]}>
      <AppProviders>
        <StaffLayout>
          <Routes>
            <Route path="/rentals/:id" element={<RentalDetail />} />
          </Routes>
        </StaffLayout>
      </AppProviders>
    </MemoryRouter>,
  );
}

describe("Rental Detail — dashboard layout (Build #59)", () => {
  it("renders the dashboard shell without a top-level tab bar", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rental-detail-dashboard")).toBeInTheDocument();
    // No tablist/segmented tab bar — core info is at-a-glance.
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows the agreement number as the primary heading", () => {
    renderRental("rnt_1");
    // The agreement number appears in the PageHeader H1 (and possibly in
    // derived sections like the Rental Record timeline). Assert it renders as
    // a heading at least once.
    const matches = screen.getAllByText("AGR-2026-000125");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.tagName === "H1")).toBe(true);
  });

  it("renders agreement details (customer, vehicle, dates) on the main page", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-agreement-details")).toBeInTheDocument();
    expect(screen.getByText("Agreement details")).toBeInTheDocument();
  });

  it("renders financial summary on the main page (no tab click required)", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-financial-summary")).toBeInTheDocument();
    expect(screen.getByText("Financial summary")).toBeInTheDocument();
  });

  it("renders deposit, billing, and arrangement sections on the main page", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-deposit")).toBeInTheDocument();
    expect(screen.getByTestId("rd-billing")).toBeInTheDocument();
    expect(screen.getByTestId("rd-arrangement")).toBeInTheDocument();
  });

  it("renders Rental Actions contextually", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-actions")).toBeInTheDocument();
    expect(screen.getByText("Rental actions")).toBeInTheDocument();
    expect(screen.getByText("Record payment")).toBeInTheDocument();
  });

  it("renders the Activity Timeline from authoritative events", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-activity")).toBeInTheDocument();
    expect(screen.getByText("Activity timeline")).toBeInTheDocument();
  });

  it("renders drivers and inspections sections", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-drivers")).toBeInTheDocument();
    expect(screen.getByTestId("rd-inspections")).toBeInTheDocument();
  });

  it("keeps the Rental Record accessible on the main page", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-rental-record")).toBeInTheDocument();
  });

  it("renders linked damage claims, tolls/violations, and documents sections", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-damage-claims")).toBeInTheDocument();
    expect(screen.getByTestId("rd-tolls-violations")).toBeInTheDocument();
    expect(screen.getByTestId("rd-documents")).toBeInTheDocument();
  });

  it("renders assigned staff section", () => {
    renderRental("rnt_1");
    expect(screen.getByTestId("rd-assigned-staff")).toBeInTheDocument();
  });

  it("shows a warning area when the rental has an outstanding balance", () => {
    // rnt_1 is active with balance_due 57 → payment-late warning expected.
    renderRental("rnt_1");
    const warning = screen.queryByTestId("rental-warning-area");
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain("Payment late");
  });

  it("renders a not-found state for an unknown rental", () => {
    renderRental("rnt_does_not_exist");
    expect(screen.getByText("Rental agreement not found")).toBeInTheDocument();
  });
});

describe("Rental Detail — navigation consolidation intact", () => {
  it("Rentals sidebar still contains only Rental Management and Planner", () => {
    const rentals = navGroups.find((g) => g.label === "Rentals")!;
    expect(rentals.items.map((i) => i.to)).toEqual([
      "/rental-management",
      "/planner",
    ]);
  });

  it("no standalone Payments Due / Payment Arrangements / Deposits / Verification nav links", () => {
    const all = navGroups.flatMap((g) => g.items);
    expect(all.find((i) => i.to === "/payments-due")).toBeUndefined();
    expect(all.find((i) => i.to === "/payment-arrangements")).toBeUndefined();
    expect(all.find((i) => i.to === "/deposits")).toBeUndefined();
    expect(all.find((i) => i.to === "/drivers")).toBeUndefined();
  });
});
