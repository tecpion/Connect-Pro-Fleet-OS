// Connect Pro Fleet — V1 Voice Mode absence regression.
//
// V1 product decision: Fleet OS AI Operator is TEXT-ONLY for V1.
// Voice Mode (the conversational auto-submit + auto-speak surface) is
// intentionally hidden from the V1 UI. These tests protect that decision by
// asserting Voice Mode cannot be entered and its UI does not render, while
// confirming the text chat experience remains available.
//
// The underlying voice utilities (useVoiceConversation, speech recognition,
// speech synthesis) are preserved for future use — only the customer-facing
// Voice Mode UI is hidden. Those utilities have their own dedicated unit tests.

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
import { FULL_PERMS } from "./copilotTestHarness";

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

describe("V1 — Voice Mode hidden from AI Operator UI", () => {
  it("no 'Start Voice Conversation' button in V1", () => {
    const { queryByRole } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(
      queryByRole("button", { name: "Start Voice Conversation" }),
    ).not.toBeInTheDocument();
  });

  it("no 'Fleet Copilot Voice' text in V1", () => {
    const { queryByText } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(queryByText(/Fleet Copilot Voice/i)).not.toBeInTheDocument();
  });

  it("no 'Voice Mode' label in V1", () => {
    const { queryByText } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(queryByText(/Voice Mode/i)).not.toBeInTheDocument();
  });

  it("no 'Listening…' indicator in V1 (no voice)", () => {
    const { queryByText } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(queryByText(/Listening/i)).not.toBeInTheDocument();
  });

  it("no 'Copilot is speaking' indicator in V1", () => {
    const { queryByText } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(queryByText(/Copilot is speaking/i)).not.toBeInTheDocument();
  });

  it("text composer IS present in V1", () => {
    const { getByPlaceholderText } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(
      getByPlaceholderText(/Ask about your fleet/i),
    ).toBeInTheDocument();
  });

  it("AI Operator header IS present in V1", () => {
    const { getByText } = uiWrapper(
      <CopilotPanel embedded perms={FULL_PERMS} />,
    );
    expect(getByText("Connect Pro AI Operator")).toBeInTheDocument();
  });
});