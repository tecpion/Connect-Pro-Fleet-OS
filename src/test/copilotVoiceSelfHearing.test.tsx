// Connect Pro Fleet — V1 Voice-absence regression (self-hearing / intent-reset).
//
// The Build #44 self-hearing / intent-reset regression exercised the voice
// state machine through the customer-facing "Start Voice Conversation"
// button, which is intentionally HIDDEN from the V1 Fleet OS AI Operator UI.
// The underlying voice utilities remain covered by their dedicated unit
// tests (copilotVoiceSpeechRecognition / copilotVoiceSpeechSynthesis).
//
// This file replaces the old Build #44 UI-integration suite with V1
// regression coverage that protects the product decision: Voice controls
// must NOT appear in the Fleet OS AI Operator UI, while text chat remains.

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
  return render(<MemoryRouter>{<Providers>{node}</Providers>}</MemoryRouter>);
}

describe("V1 — Voice self-hearing controls hidden from AI Operator UI", () => {
  it("no 'Start Voice Conversation' button in V1", () => {
    const { queryByRole } = uiWrapper(<CopilotPanel embedded />);
    expect(
      queryByRole("button", { name: "Start Voice Conversation" }),
    ).not.toBeInTheDocument();
  });

  it("no dictation mic button in V1", () => {
    const { queryByRole } = uiWrapper(<CopilotPanel embedded />);
    expect(
      queryByRole("button", { name: "Dictate message" }),
    ).not.toBeInTheDocument();
  });

  it("no 'Listening…' indicator in V1", () => {
    const { queryByText } = uiWrapper(<CopilotPanel embedded />);
    expect(queryByText(/Listening/i)).not.toBeInTheDocument();
  });

  it("no 'Copilot is speaking' indicator in V1", () => {
    const { queryByText } = uiWrapper(<CopilotPanel embedded />);
    expect(queryByText(/Copilot is speaking/i)).not.toBeInTheDocument();
  });

  it("no 'Fleet Copilot Voice' text in V1", () => {
    const { queryByText } = uiWrapper(<CopilotPanel embedded />);
    expect(queryByText(/Fleet Copilot Voice/i)).not.toBeInTheDocument();
  });

  it("text composer IS present in V1", () => {
    const { getByPlaceholderText } = uiWrapper(<CopilotPanel embedded />);
    expect(
      getByPlaceholderText(/Ask about your fleet/i),
    ).toBeInTheDocument();
  });

  it("AI Operator header IS present in V1", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText("Connect Pro AI Operator")).toBeInTheDocument();
  });
});