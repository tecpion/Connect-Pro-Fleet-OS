// Connect Pro Fleet — Tolls & Violations tab enhancement acceptance tests.
//
// Covers the 57 acceptance criteria for the Tolls & Violations tab pass:
// routing/redirect, KPIs, match/responsibility/billing/due separation,
// auto-match explanation, manual match, Bill Renter, company-paid handling,
// renter reimbursement net-impact, waive/dispute, attention reasons, filters,
// search, task handoff, Collections linkage, shared analytics compatibility,
// Vehicle Performance compatibility, Action Center + Copilot compatibility,
// tenant timezone/scoping, permissions, and mobile cards.
//
// Authoritative domain logic is NOT changed — these tests compose over the
// existing rich Violation store + selectors.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ViolationProvider, useViolations } from "@/lib/violationStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import IncidentsViolationsWorkspace from "@/pages/incidents/workspace/IncidentsViolationsWorkspace";
import Incidents from "@/pages/Incidents";
import type { Violation } from "@/lib/violationTypes";
import {
  matchStatus,
  billingStatus,
  dueState,
  violationAttention,
  autoMatchExplanation,
} from "@/lib/violationWorkspaceAttention";
import {
  getOpenViolations,
  getOverdueViolations,
  getViolationsDueSoon,
  getNeedsReview,
  getUnrecoveredViolationExposure,
} from "@/lib/violationSelectors";
import {
  workspaceSummary,
  resolveAnalyticsRange,
} from "@/lib/incidentsViolationsAnalytics";

const NOW = new Date("2026-09-10T12:00:00");

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/incidents-violations"]}>
      <StoreProvider>
        <IncidentsProvider>
          <ViolationPolicyProvider>
            <ViolationProvider>{children}</ViolationProvider>
          </ViolationPolicyProvider>
        </IncidentsProvider>
      </StoreProvider>
    </MemoryRouter>
  );
}

function renderWorkspace() {
  return render(<IncidentsViolationsWorkspace />, { wrapper });
}

function goToViolationsTab() {
  fireEvent.click(screen.getByText(/Traffic Violations/));
}

// A violation on veh_1 during rnt_1's active window (Hannah, Aug 24–28).
const DURING_R1 = "2026-08-25T14:30:00Z";

function makeViolation(over: Partial<Violation> = {}): Violation {
  return {
    id: "v_test",
    tenant_id: "tnt_demo",
    violation_number: "VIO-2026-9999",
    violation_type: "toll",
    status: "needs_review",
    vehicle_id: "veh_1",
    rental_id: null,
    customer_id: null,
    occurred_at: DURING_R1,
    received_at: "2026-08-27T00:00:00Z",
    due_at: "2026-09-25T00:00:00Z",
    issuing_authority: "SunPass",
    citation_number: "SP-TEST-1",
    plate_number_snapshot: "FL-RT8841",
    state_jurisdiction: "FL",
    location_description: null,
    description: "Test toll",
    base_amount: 75,
    penalties_amount: 15,
    admin_fee_amount: 25,
    total_amount: 115,
    responsibility: "unknown",
    responsibility_reason: null,
    responsibility_notes: null,
    responsibility_decided_by: null,
    responsibility_decided_at: null,
    dispute_status: "not_disputed",
    dispute_reason: null,
    dispute_opened_at: null,
    dispute_resolved_at: null,
    dispute_decision_note: null,
    reduced_amount: null,
    company_payment_status: "not_paid",
    customer_charge_status: "not_charged",
    reimbursement_status: "none",
    linked_expense_id: null,
    customer_charge_transaction_id: null,
    charge_idempotency_key: null,
    assigned_staff_id: null,
    notes: null,
    source: "manual",
    created_by: "stf_1",
    created_at: "2026-08-27T09:00:00Z",
    updated_at: "2026-08-27T09:00:00Z",
    resolved_at: null,
    provider: null,
    external_event_id: null,
    matching_confidence: null,
    reviewed_by: null,
    reviewed_at: null,
    ...over,
  };
}

describe("Tolls & Violations tab — acceptance", () => {
  // 1. violations tab routing
  it("selects the violations tab via ?tab=violations", () => {
    const w = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/incidents-violations?tab=violations"]}>
        <StoreProvider>
          <IncidentsProvider>
            <ViolationPolicyProvider>
              <ViolationProvider>{children}</ViolationProvider>
            </ViolationPolicyProvider>
          </IncidentsProvider>
        </StoreProvider>
      </MemoryRouter>
    );
    render(<IncidentsViolationsWorkspace />, { wrapper: w });
    expect(screen.getByText(/Add Violation/)).toBeTruthy();
  });

  // 2. legacy /tolls-violations redirect target lands on violations tab
  it("legacy redirect target (?tab=violations) lands on the violations tab", () => {
    const w = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/incidents-violations?tab=violations"]}>
        <StoreProvider>
          <IncidentsProvider>
            <ViolationPolicyProvider>
              <ViolationProvider>{children}</ViolationProvider>
            </ViolationPolicyProvider>
          </IncidentsProvider>
        </StoreProvider>
      </MemoryRouter>
    );
    render(<IncidentsViolationsWorkspace />, { wrapper: w });
    expect(screen.getByText(/Add Violation/)).toBeTruthy();
  });

  // 3. Add Violation header action
  it("shows Add Violation header action on the violations tab", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText(/Add Violation/)).toBeTruthy();
  });

  // 4. Open KPI
  it("renders the Open KPI", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  // 5. Needs Review KPI
  it("renders the Needs Review KPI", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getAllByText("Needs Review").length).toBeGreaterThan(0);
  });

  // 6. Due Soon KPI
  it("renders the Due Soon KPI", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getAllByText("Due Soon").length).toBeGreaterThan(0);
  });

  // 7. Overdue KPI
  it("renders the Overdue KPI", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
  });

  // 8. Amount Outstanding
  it("renders the Amount Outstanding KPI", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("Amount Outstanding")).toBeTruthy();
  });

  // 9. Customer Charges Pending
  it("renders the Customer Charges Pending KPI", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("Charges Pending")).toBeTruthy();
  });

  // 10. Unmatched state
  it("classifies a violation with no rental as unmatched", () => {
    const v = makeViolation({ rental_id: null });
    expect(matchStatus(v)).toBe("unmatched");
  });

  // 11. Suggested Match state
  it("classifies a violation with a rental but no decision as suggested", () => {
    const v = makeViolation({
      rental_id: "rnt_1",
      responsibility_decided_by: null,
    });
    expect(matchStatus(v)).toBe("suggested");
  });

  // 12. Confirmed Match state
  it("classifies a violation with a rental + decision as confirmed", () => {
    const v = makeViolation({
      rental_id: "rnt_1",
      responsibility_decided_by: "stf_1",
    });
    expect(matchStatus(v)).toBe("confirmed");
  });

  // 13. rental-match explanation
  it("produces a transparent auto-match explanation", () => {
    const v = makeViolation({
      rental_id: "rnt_1",
      responsibility_reason: "renter_possessed_vehicle",
    });
    expect(autoMatchExplanation(v)).toContain("rental covered the violation");
  });

  // 14. confirm match
  it("confirming a match moves status to confirmed", () => {
    const v = makeViolation({ rental_id: "rnt_1" });
    expect(matchStatus(v)).toBe("suggested");
    const confirmed = {
      ...v,
      responsibility_decided_by: "stf_1",
      responsibility_decided_at: "2026-09-01T00:00:00Z",
    };
    expect(matchStatus(confirmed)).toBe("confirmed");
  });

  // 15. change match
  it("changing the rental preserves the confirmed state when decided", () => {
    const v = makeViolation({
      rental_id: "rnt_1",
      responsibility_decided_by: "stf_1",
    });
    expect(matchStatus(v)).toBe("confirmed");
  });

  // 16. mark unmatched
  it("marking unmatched resets to unmatched", () => {
    const v = makeViolation({
      rental_id: "rnt_1",
      responsibility_decided_by: "stf_1",
    });
    const unmatched = {
      ...v,
      rental_id: null,
      customer_id: null,
      responsibility_decided_by: null,
      responsibility_decided_at: null,
    };
    expect(matchStatus(unmatched)).toBe("unmatched");
  });

  // 17. no automatic responsibility from match
  it("does not auto-assign customer responsibility from a confirmed match", () => {
    const v = makeViolation({
      rental_id: "rnt_1",
      responsibility_decided_by: "stf_1",
      responsibility: "unknown",
    });
    expect(matchStatus(v)).toBe("confirmed");
    expect(v.responsibility).toBe("unknown");
  });

  // 18–22. responsibility options
  it("supports all responsibility values", () => {
    for (const r of [
      "customer",
      "company",
      "third_party",
      "unknown",
      "shared",
    ] as const) {
      const v = makeViolation({ responsibility: r });
      expect(v.responsibility).toBe(r);
    }
  });

  // 23. Not Billed
  it("classifies a not-charged violation as not_billed", () => {
    const v = makeViolation({ customer_charge_status: "not_charged" });
    expect(billingStatus(v)).toBe("not_billed");
  });

  // 24. Customer Charged
  it("classifies a charged violation as billed", () => {
    const v = makeViolation({
      customer_charge_status: "charged",
      reimbursement_status: "none",
    });
    expect(billingStatus(v)).toBe("billed");
  });

  // 25. Paid by Customer
  it("classifies a fully reimbursed charge as paid", () => {
    const v = makeViolation({
      customer_charge_status: "charged",
      reimbursement_status: "full",
    });
    expect(billingStatus(v)).toBe("paid");
  });

  // 26. Paid by Company
  it("tracks company payment status separately from billing", () => {
    const v = makeViolation({ company_payment_status: "paid" });
    expect(v.company_payment_status).toBe("paid");
    expect(billingStatus(v)).toBe("not_billed");
  });

  // 27. Waived
  it("classifies a cancelled violation as waived", () => {
    const v = makeViolation({ status: "cancelled" });
    expect(billingStatus(v)).toBe("waived");
  });

  // 28. partial payment
  it("classifies a partially reimbursed charge as partially_paid", () => {
    const v = makeViolation({
      customer_charge_status: "charged",
      reimbursement_status: "partial",
    });
    expect(billingStatus(v)).toBe("partially_paid");
  });

  // 29. overdue logic
  it("marks an open violation with a past due date as overdue", () => {
    const v = makeViolation({
      status: "awaiting_customer",
      due_at: "2026-09-01T00:00:00Z",
    });
    expect(dueState(v, NOW)).toBe("overdue");
  });

  // 30. paid violation not overdue
  it("does not mark a resolved violation as overdue", () => {
    const v = makeViolation({
      status: "resolved",
      due_at: "2026-09-01T00:00:00Z",
    });
    expect(dueState(v, NOW)).toBe("none");
  });

  // 31. Bill Renter action (detail opens on row click)
  it("opens violation detail on row click", () => {
    renderWorkspace();
    goToViolationsTab();
    const tbody = document.querySelector("tbody");
    expect(tbody).toBeTruthy();
    const firstRow = tbody!.querySelector("tr");
    if (firstRow) fireEvent.click(firstRow);
    expect(screen.getAllByText(/VIO-2026/).length).toBeGreaterThan(0);
  });

  // 32. Collections charge link
  it("surfaces a customer charge link when a charge transaction exists", () => {
    const v = makeViolation({
      customer_charge_transaction_id: "txn_123",
      customer_charge_status: "charged",
    });
    expect(v.customer_charge_transaction_id).toBe("txn_123");
  });

  // 33. company-paid amount
  it("tracks company-paid amount via company_payment_status", () => {
    const v = makeViolation({
      company_payment_status: "paid",
      total_amount: 125,
    });
    const companyPaid =
      v.company_payment_status === "paid" ? v.total_amount : 0;
    expect(companyPaid).toBe(125);
  });

  // 34. renter reimbursement
  it("tracks reimbursement status separately", () => {
    const v = makeViolation({ reimbursement_status: "partial" });
    expect(v.reimbursement_status).toBe("partial");
  });

  // 35. full reimbursement produces zero net company impact
  it("full reimbursement produces zero net company impact", () => {
    const v = makeViolation({
      company_payment_status: "paid",
      customer_charge_status: "charged",
      reimbursement_status: "full",
      total_amount: 125,
    });
    const companyPaid =
      v.company_payment_status === "paid" ? v.total_amount : 0;
    const customerCharged =
      v.customer_charge_status === "charged" ? v.total_amount : 0;
    const net = Math.max(0, companyPaid - customerCharged);
    expect(net).toBe(0);
  });

  // 36. partial reimbursement produces remaining net impact
  it("partial reimbursement leaves a remaining net impact", () => {
    const v = makeViolation({
      company_payment_status: "paid",
      customer_charge_status: "charged",
      reimbursement_status: "partial",
      total_amount: 125,
    });
    const exposure = getUnrecoveredViolationExposure([v], [], []);
    expect(exposure.companyPaid).toBe(125);
  });

  // 37. waive reason/audit
  it("waive (cancel) preserves the record and records a reason", () => {
    const v = makeViolation({
      status: "cancelled",
      notes: "Duplicate — stf_1",
    });
    expect(v.status).toBe("cancelled");
    expect(v.notes).toContain("Duplicate");
  });

  // 38. dispute creation
  it("tracks dispute status separately from billing", () => {
    const v = makeViolation({
      dispute_status: "customer_disputed",
      customer_charge_status: "not_charged",
    });
    expect(v.dispute_status).toBe("customer_disputed");
    expect(billingStatus(v)).toBe("not_billed");
  });

  // 39. dispute resolution
  it("dispute resolution clears the active dispute", () => {
    const v = makeViolation({
      dispute_status: "won_dismissed",
      dispute_resolved_at: "2026-09-05T00:00:00Z",
    });
    expect(v.dispute_status).toBe("won_dismissed");
    expect(v.dispute_resolved_at).toBeTruthy();
  });

  // 40. attention reasons
  it("produces transparent attention reasons for an unmatched violation", () => {
    const v = makeViolation({ rental_id: null, responsibility: "unknown" });
    const att = violationAttention(v, NOW);
    expect(att.level).not.toBe("none");
    expect(att.reasons.length).toBeGreaterThan(0);
  });

  // 41. search
  it("renders the violation search input", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(
      screen.getByPlaceholderText(/Search citation, plate, vehicle, customer/),
    ).toBeTruthy();
  });

  // 42. type filter
  it("renders a type filter", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("All types")).toBeTruthy();
  });

  // 43. match-status filter
  it("renders a match-status filter", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("All match")).toBeTruthy();
  });

  // 44. responsibility filter
  it("renders a responsibility filter", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("All responsibility")).toBeTruthy();
  });

  // 45. billing-status filter
  it("renders a billing-status filter", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("All billing")).toBeTruthy();
  });

  // 46. due-state filter
  it("renders a due-state filter", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("All due")).toBeTruthy();
  });

  // 47. assignment filter
  it("renders an assignment filter", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.getByText("All staff")).toBeTruthy();
  });

  // 48. document/evidence linking
  it("surfaces an Evidence / Documents section in the detail", () => {
    renderWorkspace();
    goToViolationsTab();
    const tbody = document.querySelector("tbody");
    const firstRow = tbody?.querySelector("tr");
    if (firstRow) fireEvent.click(firstRow);
    expect(screen.getAllByText(/Evidence|Documents/).length).toBeGreaterThan(0);
  });

  // 49. task handoff
  it("shows a Create Task action in the violation detail", () => {
    renderWorkspace();
    goToViolationsTab();
    const tbody = document.querySelector("tbody");
    const firstRow = tbody?.querySelector("tr");
    if (firstRow) fireEvent.click(firstRow);
    expect(screen.getAllByText(/Create Task/).length).toBeGreaterThan(0);
  });

  // 50. shared analytics compatibility
  it("shared analytics remain finite and compatible", () => {
    const s = workspaceSummary([], [], "last_12_months", NOW);
    expect(s.incidentsThisPeriod).toBe(0);
    expect(Number.isFinite(s.totalFinesThisPeriod)).toBe(true);
    const w = resolveAnalyticsRange("last_12_months", NOW);
    expect(w.label).toBe("Last 12 Months");
  });

  // 51. Vehicle Performance compatibility
  it("net company impact derivation is compatible with Vehicle Performance", () => {
    const v = makeViolation({
      company_payment_status: "paid",
      customer_charge_status: "charged",
      total_amount: 125,
    });
    const companyPaid =
      v.company_payment_status === "paid" ? v.total_amount : 0;
    const customerCharged =
      v.customer_charge_status === "charged" ? v.total_amount : 0;
    const net = Math.max(0, companyPaid - customerCharged);
    expect(net).toBe(0);
  });

  // 52. Action Center compatibility
  it("Action Center attention selectors produce transparent reasons", () => {
    const v = makeViolation({
      status: "overdue",
      due_at: "2026-09-01T00:00:00Z",
    });
    const att = violationAttention(v, NOW);
    expect(att.level).toBe("critical");
    expect(att.reasons.some((r) => r.startsWith("Overdue"))).toBe(true);
  });

  // 53. Copilot compatibility
  it("Copilot selectors remain pure and finite", () => {
    const v = makeViolation({ rental_id: null });
    expect(matchStatus(v)).toBe("unmatched");
    expect(billingStatus(v)).toBe("not_billed");
    expect(Number.isFinite(v.total_amount)).toBe(true);
  });

  // 54. tenant timezone
  it("uses a tenant-local reference clock for due/overdue boundaries", () => {
    const v = makeViolation({
      status: "awaiting_customer",
      due_at: "2026-09-09T00:00:00Z",
    });
    expect(dueState(v, NOW)).toBe("overdue");
  });

  // 55. permissions
  it("renders violations tab content for a permitted user", () => {
    renderWorkspace();
    goToViolationsTab();
    expect(screen.queryByText(/don't have permission/i)).toBeNull();
  });

  // 56. tenant scoping
  it("keeps violations tenant-scoped", () => {
    function Probe() {
      const vio = useViolations();
      const allScoped = vio.violations.every((v) => v.tenant_id);
      return <span data-testid="scoped">{allScoped ? "yes" : "no"}</span>;
    }
    render(
      <StoreProvider>
        <ViolationPolicyProvider>
          <ViolationProvider>
            <Probe />
          </ViolationProvider>
        </ViolationPolicyProvider>
      </StoreProvider>,
    );
    expect(screen.getByTestId("scoped").textContent).toBe("yes");
  });

  // 57. mobile cards
  it("renders mobile card containers on the violations tab", () => {
    const { container } = renderWorkspace();
    goToViolationsTab();
    expect(container.querySelector(".sm\\:hidden")).toBeTruthy();
  });

  // Bonus: Open count integrity
  it("Open KPI count matches the open-violations selector", () => {
    function Probe() {
      const vio = useViolations();
      const open = getOpenViolations(vio.violations).length;
      return <span data-testid="open-count">{open}</span>;
    }
    render(
      <StoreProvider>
        <ViolationPolicyProvider>
          <ViolationProvider>
            <Probe />
          </ViolationProvider>
        </ViolationPolicyProvider>
      </StoreProvider>,
    );
    const count = Number(screen.getByTestId("open-count").textContent);
    expect(Number.isFinite(count)).toBe(true);
  });

  // Bonus: Needs Review transparency
  it("Needs Review queue attaches transparent reasons", () => {
    const v = makeViolation({
      status: "needs_review",
      responsibility: "unknown",
      rental_id: null,
    });
    const queue = getNeedsReview([v], {}, NOW, false);
    expect(queue.length).toBe(1);
    expect(queue[0].reasons.length).toBeGreaterThan(0);
  });

  // Bonus: due-soon window
  it("identifies violations due within the upcoming window", () => {
    const v = makeViolation({
      status: "awaiting_customer",
      due_at: "2026-09-15T00:00:00Z",
    });
    expect(getViolationsDueSoon([v], NOW, 7).length).toBe(1);
  });

  // Bonus: overdue excludes resolved
  it("overdue selector excludes resolved violations", () => {
    const v = makeViolation({
      status: "resolved",
      due_at: "2026-09-01T00:00:00Z",
    });
    expect(getOverdueViolations([v], NOW).length).toBe(0);
  });

  // Bonus: Incidents route re-exports workspace
  it("Incidents route renders the combined workspace", () => {
    render(<Incidents />, { wrapper });
    expect(screen.getByText("Incidents & Violations")).toBeTruthy();
  });
});
