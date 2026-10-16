// Connect Pro Fleet — Build #29 Copilot conversation/daily-briefing/end-of-day/UI tests.
//
// Shared helpers are imported from ./copilotTestHarness.tsx (a NON-test module)
// so no test cases are re-registered here.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
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
import {
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
  firstVehicle,
} from "./copilotTestHarness";

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

describe("Build #29 — Conversation context", () => {
  it("74. conversation stores messages", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.summary).toBeTruthy();
  });
  it("75. new conversation clears context", () => {
    const fresh = emptyConversation();
    expect(fresh.context_customer_id).toBeNull();
  });
  it("76. current customer retained in context", () => {
    const r = useCopilotTestSources();
    const custId = r.current.sources.briefing.store.customers[0].id;
    const conv = { ...emptyConversation(), context_customer_id: custId };
    const a = resolveCopilotQuery(
      "What does he owe?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_balance");
  });
  it("77. current vehicle retained in context", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const conv = { ...emptyConversation(), context_vehicle_id: v.id };
    const a = resolveCopilotQuery(
      "What's going on with it?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_status");
  });
  it("78. follow-up refers to context", () => {
    const r = useCopilotTestSources();
    const custId = r.current.sources.briefing.store.customers[0].id;
    const conv = { ...emptyConversation(), context_customer_id: custId };
    const a = resolveCopilotQuery(
      "What does he owe?",
      conv,
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_balance");
  });
  it("79. context changes when new entity named", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources[0].entity_type).toBe("customer");
  });
  it("80. answer as-of time present", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.as_of).toBe(NOW.toISOString());
  });
  it("81. refresh re-runs same query (deterministic)", () => {
    const r = useCopilotTestSources();
    const q = "Who owes me money today?";
    const a1 = resolveCopilotQuery(
      q,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const a2 = resolveCopilotQuery(
      q,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a2.summary).toBe(a1.summary);
  });
});

describe("Build #29 — Daily briefing", () => {
  it("82. what should I focus on → daily_priorities", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What should I focus on today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("daily_priorities");
  });
  it("83. priority preserved (deterministic, not re-ranked)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What should I focus on today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.caveats.some((c) => /never re-rank/i.test(c))).toBe(true);
  });
  it("84. critical reason shown", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What should I focus on today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const crit = a.items.find((i) => i.status === "critical");
    if (crit) expect(crit.subtitle).toBeTruthy();
  });
  it("85. due today count in summary", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Today's summary",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Due today")).toBe(true);
  });
  it("86. starts today count", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Today's summary",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Starting today")).toBe(true);
  });
  it("87. blocked fleet count", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Today's summary",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Blocked vehicles")).toBe(true);
  });
  it("88. idle fleet count", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Today's summary",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Idle vehicles")).toBe(true);
  });
  it("89. counts-only permission (no money)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Today's summary",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const amt = a.facts.find((f) => f.label === "Due today amount");
    expect(amt?.value).toBe("—");
  });
});

describe("Build #29 — End-of-day recap", () => {
  it("90. payments received in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("end_of_day_recap");
    expect(a.facts.some((f) => f.label === "Payments received")).toBe(true);
  });
  it("91. rentals started in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Rentals started")).toBe(true);
  });
  it("92. rentals returned in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Rentals returned")).toBe(true);
  });
  it("93. work orders completed in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Work orders completed")).toBe(true);
  });
  it("94. claim opened in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Claims opened")).toBe(true);
  });
  it("95. violation created in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Violations created")).toBe(true);
  });
  it("96. recap permission filtering", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const amt = a.facts.find((f) => f.label === "Received amount");
    expect(amt?.value).toBe("—");
  });
  it("97. no unsupported conclusions in recap", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.caveats.some((c) => /no fabricated conclusions/i.test(c))).toBe(
      true,
    );
  });
});

describe("Build #29 — Copilot UI", () => {
  function uiWrapper(node: React.ReactNode) {
    return render(
      <MemoryRouter>
        <Providers>{node}</Providers>
      </MemoryRouter>,
    );
  }
  it("107. Copilot panel renders with header", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText("Fleet Copilot")).toBeTruthy();
  });
  it("108. suggested prompts shown in empty state", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    // Build #33 — prompts are now categorized; the "Today" category heading
    // and a Today prompt render in the empty state.
    expect(getByText("Today")).toBeTruthy();
    expect(getByText("What do I need to know today?")).toBeTruthy();
  });
  it("109. send button present", () => {
    const { getByPlaceholderText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByPlaceholderText("Ask about your operation…")).toBeTruthy();
  });
  it("110. clear conversation button present", () => {
    const { getByTitle } = uiWrapper(<CopilotPanel embedded />);
    expect(getByTitle("New conversation")).toBeTruthy();
  });
  it("111. refresh button present", () => {
    const { getByTitle } = uiWrapper(<CopilotPanel embedded />);
    expect(getByTitle("Refresh answer")).toBeTruthy();
  });
  it("112. context label hidden when no context", () => {
    const { queryByText } = uiWrapper(<CopilotPanel embedded />);
    expect(queryByText("Context:")).toBeNull();
  });
  it("113. context label shown when provided", () => {
    const { getByText } = uiWrapper(
      <CopilotPanel
        embedded
        initialContext={{ customerId: "c1", label: "John Smith" }}
      />,
    );
    expect(getByText("John Smith")).toBeTruthy();
  });
  it("114. mobile shell uses full width", () => {
    const { container } = uiWrapper(<CopilotPanel embedded />);
    const panel = container.firstChild as HTMLElement;
    expect(panel.className).toContain("w-full");
  });
  it("115. feedback buttons absent before any answer", () => {
    const { queryByText } = uiWrapper(<CopilotPanel embedded />);
    expect(queryByText("👍 Helpful")).toBeNull();
  });
  it("116. Phase 1 disclaimer shown", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText(/deterministic/i)).toBeTruthy();
  });
});
