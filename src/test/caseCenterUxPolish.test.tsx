// Connect Pro Fleet — Case Center founder UX polish tests (Build #55).
//
// Covers the polish pass: reduced list density/hierarchy, operational vs
// financial metric separation, issue-title-primary header, derived Next
// Action section, case-type-aware evidence (Required/Supporting, Not
// applicable instead of a wall of "Not on file"), and that no architecture
// (stores, statuses, permissions, financial linkage) changed.
//
// Evidence resolution is a pure function (caseCenterEvidence) so it is tested
// directly. UI rendering is tested via the page components with the standard
// provider wrapper.

import { describe, it, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { DefenseProvider } from "@/lib/store/defenseStore";
import { CaseCenterProvider } from "@/lib/store/caseCenterStore";
import CaseCenter from "@/pages/CaseCenter";
import { CaseDetail } from "@/pages/caseCenter/CaseDetail";
import {
  CASE_EVIDENCE_REQUIREMENTS,
  EVIDENCE_STATUS_LABELS,
  resolveEvidenceStatus,
  type EvidenceResolutionInputs,
} from "@/lib/caseCenterEvidence";
import type { CaseCategory } from "@/lib/caseCenterTypes";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <StoreProvider>
        <IncidentsProvider>
          <ViolationPolicyProvider>
            <ViolationProvider>
              <DamageClaimProvider>
                <DefenseProvider>
                  <CaseCenterProvider>{children}</CaseCenterProvider>
                </DefenseProvider>
              </DamageClaimProvider>
            </ViolationProvider>
          </ViolationPolicyProvider>
        </IncidentsProvider>
      </StoreProvider>
    </MemoryRouter>
  );
}

const emptyInputs = (
  over: Partial<EvidenceResolutionInputs> = {},
): EvidenceResolutionInputs => ({
  rental_id: null,
  customer_charge_ids: [],
  payment_ids: [],
  deposit_application_ids: [],
  refund_ids: [],
  expense_ids: [],
  insurance_claim_refs: [],
  violation_present: false,
  violation_number: null,
  incident_present: false,
  damage_claim_present: false,
  damage_claim_number: null,
  inspection_ids: [],
  vault_doc_refs: [],
  uploaded_file_refs: [],
  possession_match: null,
  maintenance_work_order_id: null,
  ...over,
});

describe("Case Center evidence requirements (case-type aware)", () => {
  it("toll case lists toll notice + possession match as required", () => {
    const reqs = CASE_EVIDENCE_REQUIREMENTS.tolls_tickets;
    const keys = reqs.filter((r) => r.tier === "required").map((r) => r.key);
    expect(keys).toContain("toll_notice");
    expect(keys).toContain("possession_match");
    expect(keys).toContain("customer_charge");
  });

  it("damage case lists damage claim + checkout inspection + photos as required", () => {
    const reqs = CASE_EVIDENCE_REQUIREMENTS.damage_claims;
    const keys = reqs.filter((r) => r.tier === "required").map((r) => r.key);
    expect(keys).toContain("damage_claim");
    expect(keys).toContain("checkout_inspection");
    expect(keys).toContain("photos");
  });

  it("refund case lists original charge + refund approval as required", () => {
    const reqs = CASE_EVIDENCE_REQUIREMENTS.deposits_refunds;
    const keys = reqs.filter((r) => r.tier === "required").map((r) => r.key);
    expect(keys).toContain("original_charge");
    expect(keys).toContain("refund_approval");
  });

  it("every category has at least one required and one supporting item", () => {
    const cats = Object.keys(CASE_EVIDENCE_REQUIREMENTS) as CaseCategory[];
    for (const c of cats) {
      const reqs = CASE_EVIDENCE_REQUIREMENTS[c];
      expect(reqs.some((r) => r.tier === "required")).toBe(true);
      expect(reqs.some((r) => r.tier === "supporting")).toBe(true);
    }
  });
});

describe("resolveEvidenceStatus", () => {
  it("reports on_file when rental linked", () => {
    const r = resolveEvidenceStatus(
      "rental_record",
      emptyInputs({ rental_id: "rnt_1" }),
    );
    expect(r.status).toBe("on_file");
    expect(r.link).toBe("/rentals/rnt_1");
  });

  it("reports missing when no customer charge", () => {
    const r = resolveEvidenceStatus("customer_charge", emptyInputs());
    expect(r.status).toBe("missing");
  });

  it("possession match shows ambiguous as missing/review", () => {
    const r = resolveEvidenceStatus(
      "possession_match",
      emptyInputs({ possession_match: "ambiguous" }),
    );
    expect(r.status).toBe("missing");
    expect(r.value).toContain("Ambiguous");
  });

  it("possession match shows matched as on_file", () => {
    const r = resolveEvidenceStatus(
      "possession_match",
      emptyInputs({ possession_match: "matched" }),
    );
    expect(r.status).toBe("on_file");
  });

  it("maintenance followup on_file when work order linked", () => {
    const r = resolveEvidenceStatus(
      "maintenance_followup",
      emptyInputs({ maintenance_work_order_id: "wo_1" }),
    );
    expect(r.status).toBe("on_file");
  });

  it("never returns a fabricated value for missing evidence", () => {
    const r = resolveEvidenceStatus("damage_claim", emptyInputs());
    expect(r.value).toBe("Missing");
    expect(r.status).toBe("missing");
  });
});

describe("Case Center list — reduced density & hierarchy", () => {
  it("renders issue title as the primary row text and case number as secondary", () => {
    render(<CaseCenter />, { wrapper });
    // A known seed case title should appear.
    expect(screen.getByText("SunPass toll — I-95 express lanes")).toBeTruthy();
    // Case number should still be present (secondary).
    expect(screen.getByText(/CASE-2026-0001/)).toBeTruthy();
  });

  it("separates operational and financial metric cards", () => {
    const { container } = render(<CaseCenter />, { wrapper });
    // Financial cards have the left accent border + hint text.
    const hints = Array.from(container.querySelectorAll("p"))
      .map((p) => p.textContent ?? "")
      .filter((t) => t.includes("Derived from authoritative ledger links"));
    expect(hints.length).toBeGreaterThanOrEqual(1);
    // Operational metrics present.
    expect(screen.getByText("Open Cases")).toBeTruthy();
    expect(screen.getByText("Total at Issue")).toBeTruthy();
    expect(screen.getByText("Unrecovered")).toBeTruthy();
  });
});

describe("Case Center detail — header & Next Action", () => {
  it("uses the issue title as the primary heading (case # secondary)", () => {
    render(
      <MemoryRouter initialEntries={["/case-center/case_1"]}>
        <StoreProvider>
          <IncidentsProvider>
            <ViolationPolicyProvider>
              <ViolationProvider>
                <DamageClaimProvider>
                  <DefenseProvider>
                    <CaseCenterProvider>
                      <CaseDetail caseId="case_1" />
                    </CaseCenterProvider>
                  </DefenseProvider>
                </DamageClaimProvider>
              </ViolationProvider>
            </ViolationPolicyProvider>
          </IncidentsProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("SunPass toll — I-95 express lanes");
  });

  it("shows a Next Action section derived from case state", () => {
    render(
      <MemoryRouter initialEntries={["/case-center/case_1"]}>
        <StoreProvider>
          <IncidentsProvider>
            <ViolationPolicyProvider>
              <ViolationProvider>
                <DamageClaimProvider>
                  <DefenseProvider>
                    <CaseCenterProvider>
                      <CaseDetail caseId="case_1" />
                    </CaseCenterProvider>
                  </DefenseProvider>
                </DamageClaimProvider>
              </ViolationProvider>
            </ViolationPolicyProvider>
          </IncidentsProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Next Action")).toBeTruthy();
    // case_1 is action_required → status-driven guidance present (DataLabel +
    // status pill both render "Action Required").
    expect(screen.getAllByText("Action Required").length).toBeGreaterThan(0);
  });
});

describe("Case Center evidence tab — case-type aware", () => {
  function renderCase(caseId: string) {
    const utils = render(
      <MemoryRouter initialEntries={[`/case-center/${caseId}`]}>
        <StoreProvider>
          <IncidentsProvider>
            <ViolationPolicyProvider>
              <ViolationProvider>
                <DamageClaimProvider>
                  <DefenseProvider>
                    <CaseCenterProvider>
                      <CaseDetail caseId={caseId} />
                    </CaseCenterProvider>
                  </DefenseProvider>
                </DamageClaimProvider>
              </ViolationProvider>
            </ViolationPolicyProvider>
          </IncidentsProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    // Evidence tab is not active by default — open it (Radix Tabs uses mouseDown).
    const evidenceTab = utils.getByRole("tab", { name: "Evidence" });
    fireEvent.mouseDown(evidenceTab);
    return utils;
  }

  it("shows Required Evidence and Supporting Evidence groups", () => {
    renderCase("case_1");
    expect(screen.getByText("Required Evidence")).toBeTruthy();
    expect(screen.getByText("Supporting Evidence")).toBeTruthy();
  });

  it("toll case shows Possession Match evidence (not irrelevant damage evidence)", () => {
    const { container } = renderCase("case_1");
    const text = container.textContent ?? "";
    expect(text).toContain("Possession Match");
    // Damage-claim-only evidence should NOT appear for a toll case.
    expect(text).not.toContain("Damage Claim");
    expect(text).not.toContain("Repair Estimate");
  });

  it("uses 'Missing' for absent evidence, not 'Not on file'", () => {
    const { container } = renderCase("case_1");
    expect(container.textContent).not.toContain("Not on file");
    // Missing label should appear for absent required evidence.
    const missingCount =
      (container.textContent ?? "").split("Missing").length - 1;
    expect(missingCount).toBeGreaterThan(0);
  });

  it("damage case shows Damage Claim + Checkout Inspection evidence", () => {
    const { container } = renderCase("case_5");
    const text = container.textContent ?? "";
    expect(text).toContain("Damage Claim");
    expect(text).toContain("Checkout Inspection");
  });
});

describe("Case Center polish — no architecture regression", () => {
  it("EVIDENCE_STATUS_LABELS has exactly on_file/missing/not_applicable", () => {
    expect(Object.keys(EVIDENCE_STATUS_LABELS).sort()).toEqual(
      ["missing", "not_applicable", "on_file"].sort(),
    );
  });

  it("does not introduce legal/Graves language in evidence labels", () => {
    const all = Object.values(CASE_EVIDENCE_REQUIREMENTS)
      .flat()
      .map((r) => r.label)
      .join(" ");
    expect(all).not.toMatch(/graves|legal protection|liability score/i);
  });
});
