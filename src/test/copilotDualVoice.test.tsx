// Connect Pro Fleet — V1 dual-voice absence regression.
//
// V1 product decision: Fleet OS AI Operator is TEXT-ONLY for V1.
// Both the dictation mic and the Voice Conversation button are intentionally
// hidden from the V1 UI. These tests protect that decision by asserting both
// voice controls are absent, while confirming the text composer remains.
//
// The underlying voice utilities are preserved for future use; only the
// customer-facing UI is hidden.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { DefenseProvider } from "@/lib/store/defenseStore";

function Providers({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <IncidentsProvider>
            <DefenseProvider>
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
            </DefenseProvider>
          </IncidentsProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

function uiWrapper(node: ReactNode) {
  return render(
    <MemoryRouter>
      <Providers>{node}</Providers>
    </MemoryRouter>,
  );
}

describe("V1 — Dual voice controls hidden from AI Operator UI", () => {
  it("no dictation mic button in V1", () => {
    const { queryByRole } = uiWrapper(<CopilotPanel embedded />);
    expect(
      queryByRole("button", { name: "Dictate message" }),
    ).not.toBeInTheDocument();
  });

  it("no Voice Conversation button in V1", () => {
    const { queryByRole } = uiWrapper(<CopilotPanel embedded />);
    expect(
      queryByRole("button", { name: "Start Voice Conversation" }),
    ).not.toBeInTheDocument();
  });

  it("no 'Fleet Copilot Voice' heading in V1", () => {
    const { queryByText } = uiWrapper(<CopilotPanel embedded />);
    expect(queryByText(/Fleet Copilot Voice/i)).not.toBeInTheDocument();
  });

  it("text composer IS present in V1", () => {
    const { getByPlaceholderText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByPlaceholderText(/Ask about your fleet/i)).toBeInTheDocument();
  });
});
