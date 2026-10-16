// Connect Pro Fleet — AI Damage Detection V1 acceptance tests (UI layer).
//
// Renders the real AiReviewStep + AiDamageReportView components through the
// full provider stack. Covers: initial/run/results/offline/failed states,
// Before/After evidence + bounding highlight, staff review action buttons,
// edit form, no-damage state, report header, Vehicle Digital Twin + reservation
// deep-links, AI-vs-human distinction, Damage Claim + Maintenance handoff
// visibility, vehicle-availability recommendation, repair-price absence,
// printable view, disclaimers, and provider labeling.
//
// PRODUCTION AI IS NOT CONNECTED — the dev adapter drives these renders.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { SupportProvider } from "@/lib/supportStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";

import { AiReviewStep } from "@/pages/inspections/AiReviewStep";
import { AiDamageReportView } from "@/pages/inspections/AiDamageReportView";
import { buildReport } from "@/lib/aiDamageSelectors";
import { TENANT_ID } from "@/lib/store/ids";
import type { Inspection } from "@/lib/inspectionTypes";
import type { AiDamageFinding, AiDamageReport } from "@/lib/aiDamageTypes";

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

function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "insp_checkin_1",
    reservation_id: "res_1",
    vehicle_id: "veh_1",
    inspection_type: "checkin",
    photos: ["front-1", "rear-1", "leftside-1", "rightside-1", "dashboard-1"],
    odometer_reading: 28500,
    fuel_level: 60,
    damage_notes: "",
    damage_detected: false,
    damage_ai_confidence: 0,
    damage_ai_flagged_regions: [],
    inspector_signature_url: "sig_1",
    timestamp: "2026-09-09T10:00:00Z",
    tenant_id: TENANT_ID,
    ...overrides,
  } as Inspection;
}

function makeCheckout(): Inspection {
  return makeInspection({
    id: "insp_checkout_1",
    inspection_type: "checkout",
    photos: ["front-0", "rear-0", "leftside-0", "rightside-0", "dashboard-0"],
    odometer_reading: 28000,
    fuel_level: 95,
    timestamp: "2026-09-08T10:00:00Z",
  });
}

function makeFinding(
  overrides: Partial<AiDamageFinding> = {},
): AiDamageFinding {
  return {
    finding_id: "aif_1",
    tenant_id: TENANT_ID,
    inspection_id: "insp_checkin_1",
    rental_id: "res_1",
    vehicle_id: "veh_1",
    checkout_photo_id: "front-0",
    checkin_photo_id: "front-1",
    angle: "Front",
    damage_type: "scratch",
    approximate_location: "front bumper",
    severity: "moderate",
    confidence: "high",
    description: "Possible new scratch near front not visible in checkout.",
    bounding_region: { x: 0.3, y: 0.4, w: 0.2, h: 0.15 },
    ai_status: "ai_flagged",
    staff_decision: "pending",
    staff_notes: "",
    created_at: "2026-09-09T10:05:00Z",
    reviewed_at: null,
    reviewed_by: null,
    pre_existing_note: null,
    ...overrides,
  };
}

function pairFor(finding: AiDamageFinding) {
  return {
    angle: finding.angle,
    checkout_photo_id: finding.checkout_photo_id,
    checkin_photo_id: finding.checkin_photo_id,
    status: "compared" as const,
    quality: null,
    findings: [finding],
  };
}

const COV = { photos_compared: 5, angles_analyzed: 5, angles_not_analyzed: 0 };

function renderAiReview(
  props: Partial<Parameters<typeof AiReviewStep>[0]> = {},
) {
  const checkin = props.checkin ?? makeInspection();
  const checkout = props.checkout ?? makeCheckout();
  return render(
    <MemoryRouter>
      <AppProviders>
        <AiReviewStep
          checkin={checkin}
          checkout={checkout}
          rentalId="res_1"
          reviewerId="staff_1"
          onFindingsChange={() => {}}
          onAnalysisComplete={() => {}}
          {...props}
        />
      </AppProviders>
    </MemoryRouter>,
  );
}

function renderReport(
  props: Partial<Parameters<typeof AiDamageReportView>[0]> = {},
) {
  const report: AiDamageReport =
    props.report ??
    buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [makeFinding()],
      pairs: [],
      coverage: COV,
      rentalId: "res_1",
    });
  return render(
    <MemoryRouter>
      <AppProviders>
        <AiDamageReportView
          report={report}
          vehicle={{
            id: "veh_1",
            year: 2023,
            make: "Tesla",
            model: "Model 3",
            license_plate: "FL-EV2290",
          }}
          reservation={{ id: "res_1", renter_name: "Liam Chen" }}
          onCreateClaim={() => {}}
          onCreateWorkOrder={() => {}}
          onDone={() => {}}
          {...props}
        />
      </AppProviders>
    </MemoryRouter>,
  );
}

// ===========================================================================
// AiReviewStep UI
// ===========================================================================

describe("AI Damage Detection — AiReviewStep UI", () => {
  it("shows the initial review state with a Run AI Comparison button", () => {
    renderAiReview();
    expect(screen.getByTestId("ai-review-initial")).toBeTruthy();
    expect(screen.getByTestId("ai-run-analysis")).toBeTruthy();
  });

  it("shows the AI accuracy disclaimer", () => {
    renderAiReview();
    expect(screen.getByTestId("ai-disclaimer").textContent).toMatch(
      /may miss or incorrectly flag/i,
    );
  });

  it("warns when no checkout baseline exists", () => {
    renderAiReview({ checkout: null });
    expect(screen.getByTestId("ai-review-initial").textContent).toMatch(
      /No checkout baseline/i,
    );
  });

  it("offers Save / Analyze Later (offline) and enters pending state", () => {
    renderAiReview();
    fireEvent.click(screen.getByTestId("ai-save-later"));
    expect(screen.getByTestId("ai-review-offline").textContent).toMatch(
      /AI Analysis Pending/i,
    );
  });

  it("runs analysis and shows results or failure after completion", async () => {
    renderAiReview();
    fireEvent.click(screen.getByTestId("ai-run-analysis"));
    await waitFor(() => {
      const hasResults = screen.queryByTestId("ai-review-results");
      const hasFailed = screen.queryByTestId("ai-review-failed");
      expect(hasResults || hasFailed).toBeTruthy();
    });
  });

  it("renders finding cards with Before/After evidence when findings exist", () => {
    const finding = makeFinding();
    renderAiReview({
      initialFindings: [finding],
      initialPairs: [pairFor(finding)],
      initialCoverage: COV,
      initialRun: true,
    });
    expect(screen.getByTestId(`ai-finding-${finding.finding_id}`)).toBeTruthy();
    expect(
      screen.getByTestId(`ai-evidence-${finding.finding_id}`),
    ).toBeTruthy();
    expect(
      screen.queryAllByTestId("ai-bounding-highlight").length,
    ).toBeGreaterThan(0);
  });

  it("exposes Confirm / Pre-existing / Not Damage / Needs Review actions", () => {
    const finding = makeFinding();
    renderAiReview({
      initialFindings: [finding],
      initialPairs: [pairFor(finding)],
      initialCoverage: COV,
      initialRun: true,
    });
    expect(screen.getByTestId(`ai-confirm-${finding.finding_id}`)).toBeTruthy();
    expect(
      screen.getByTestId(`ai-preexisting-${finding.finding_id}`),
    ).toBeTruthy();
    expect(screen.getByTestId(`ai-reject-${finding.finding_id}`)).toBeTruthy();
    expect(
      screen.getByTestId(`ai-needsreview-${finding.finding_id}`),
    ).toBeTruthy();
  });

  it("confirming a finding updates the review progress count", () => {
    const finding = makeFinding();
    renderAiReview({
      initialFindings: [finding],
      initialPairs: [pairFor(finding)],
      initialCoverage: COV,
      initialRun: true,
    });
    fireEvent.click(screen.getByTestId(`ai-confirm-${finding.finding_id}`));
    expect(screen.getByTestId("ai-review-progress").textContent).toMatch(
      /1 confirmed/,
    );
  });

  it("opens the edit form for a finding", () => {
    const finding = makeFinding();
    renderAiReview({
      initialFindings: [finding],
      initialPairs: [pairFor(finding)],
      initialCoverage: COV,
      initialRun: true,
    });
    fireEvent.click(screen.getByTestId(`ai-editbtn-${finding.finding_id}`));
    expect(screen.getByTestId(`ai-edit-${finding.finding_id}`)).toBeTruthy();
  });

  it("shows the no-damage state when analysis yields zero findings", () => {
    renderAiReview({
      initialFindings: [],
      initialPairs: [],
      initialCoverage: COV,
      initialRun: true,
    });
    expect(screen.getByTestId("ai-no-damage").textContent).toMatch(
      /No Potential New Damage Detected/i,
    );
    expect(screen.getByTestId("ai-no-damage").textContent).toMatch(
      /Staff should still review/i,
    );
  });
});

// ===========================================================================
// AiDamageReportView UI
// ===========================================================================

describe("AI Damage Detection — AiDamageReportView UI", () => {
  it("renders the Vehicle Damage Comparison Report header", () => {
    renderReport();
    expect(screen.getByTestId("ai-report").textContent).toMatch(
      /Vehicle Damage Comparison Report/i,
    );
  });

  it("links to the Vehicle Digital Twin", () => {
    renderReport();
    const link = screen.getByRole("link", { name: /Tesla Model 3/i });
    expect(link.getAttribute("href")).toBe("/vehicles/veh_1");
  });

  it("links to the reservation", () => {
    renderReport();
    const link = screen.getByRole("link", { name: /View Reservation/i });
    expect(link.getAttribute("href")).toBe("/reservations/res_1");
  });

  it("shows the AI-vs-human distinction per finding row", () => {
    const finding = makeFinding({ staff_decision: "confirmed" });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [finding],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    renderReport({ report });
    const row = screen.getByTestId(`report-finding-${finding.finding_id}`);
    expect(row.textContent).toMatch(/AI Finding/i);
    expect(row.textContent).toMatch(/Staff Decision/i);
  });

  it("offers Create Damage Claim only when damage is confirmed", () => {
    const finding = makeFinding({ staff_decision: "confirmed" });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [finding],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    renderReport({ report });
    expect(screen.getByTestId("report-create-claim")).toBeTruthy();
  });

  it("does NOT offer Create Damage Claim when nothing is confirmed", () => {
    const finding = makeFinding({ staff_decision: "pending" });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [finding],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    renderReport({ report });
    expect(screen.queryByTestId("report-create-claim")).toBeNull();
  });

  it("offers Create Maintenance Work Order when damage is confirmed", () => {
    const finding = makeFinding({ staff_decision: "confirmed" });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [finding],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    renderReport({ report });
    expect(screen.getByTestId("report-create-wo")).toBeTruthy();
  });

  it("shows a vehicle-availability recommendation (not an action) on confirmed damage", () => {
    const finding = makeFinding({ staff_decision: "confirmed" });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [finding],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    renderReport({ report });
    const rec = screen.getByTestId("ai-availability-rec");
    expect(rec.textContent).toMatch(/Vehicle Availability Review Recommended/i);
    expect(rec.textContent).toMatch(/does not determine/i);
  });

  it("does not show a repair price anywhere in the report", () => {
    const finding = makeFinding({ staff_decision: "confirmed" });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [finding],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    const { container } = renderReport({ report });
    expect(container.textContent).not.toMatch(/repair[: ]*\$/i);
    expect(container.textContent).not.toMatch(/estimated repair/i);
  });

  it("includes a printable view toggle", () => {
    renderReport();
    expect(screen.getByTestId("report-print")).toBeTruthy();
  });

  it("displays the liability/billing disclaimer", () => {
    renderReport();
    expect(screen.getByTestId("report-disclaimer").textContent).toMatch(
      /does not determine liability/i,
    );
  });

  it("labels the provider as dev/mock with production-not-connected note", () => {
    renderReport();
    expect(screen.getByTestId("ai-report").textContent).toMatch(
      /deterministic-dev/i,
    );
    expect(screen.getByTestId("ai-report").textContent).toMatch(
      /production AI not connected/i,
    );
  });
});
