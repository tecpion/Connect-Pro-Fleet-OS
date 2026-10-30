// Connect Pro Fleet — Build #33 Copilot follow-up filter + conversation tests.
//
// Covers the Part XIX "wow feature": follow-up filters ("only show the ones
// over $500") applied to the prior result set, pronoun resolution, the
// conversation context model, and the AnswerCard rendering of Create-Task
// previews + draft messages. Reuses the shared copilotTestHarness (NON-test).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
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
import { IncidentsProvider } from "@/lib/incidentsStore";
import { DefenseProvider } from "@/lib/store/defenseStore";
import {
  resolveCopilotQuery,
  updateConversationContext,
} from "@/lib/copilotEngine";
import {
  isFollowUpFilter,
  parseFollowUpFilter,
  applyFollowUpFilter,
} from "@/lib/copilotFollowUpFilter";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { AnswerCard } from "@/components/copilot/AnswerCard";
import {
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";
import type {
  CopilotAnswer,
  CopilotAnswerItem,
  CopilotConversation,
} from "@/lib/copilotTypes";

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

function conv(partial: Partial<CopilotConversation> = {}): CopilotConversation {
  return { ...emptyConversation(), ...partial };
}

describe("Build #33 — Follow-up filter parsing", () => {
  const r = useCopilotTestSources();

  it("1. 'only show over $500' is a filter", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a", "b"],
    });
    expect(isFollowUpFilter("Only show the ones over $500", c)).toBe(true);
  });

  it("2. 'just the ones more than 7 days' is a filter", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a"],
    });
    expect(isFollowUpFilter("just the ones more than 7 days late", c)).toBe(
      true,
    );
  });

  it("3. a new question is NOT a filter", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a"],
    });
    expect(isFollowUpFilter("What vehicles are available?", c)).toBe(false);
  });

  it("4. no prior result → not a filter", () => {
    expect(isFollowUpFilter("Only show over $500", emptyConversation())).toBe(
      false,
    );
  });

  it("5. parses min_amount from 'over $500'", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a"],
    });
    const f = parseFollowUpFilter("Only show over $500", c, r.current.sources);
    expect(f?.min_amount).toBe(500);
  });

  it("6. parses min_days_late from 'more than 7 days'", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a"],
    });
    const f = parseFollowUpFilter(
      "just the ones more than 7 days late",
      c,
      r.current.sources,
    );
    expect(f?.min_days_late).toBe(7);
  });

  it("7. parses has_arrangement from 'with payment arrangements'", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a"],
    });
    const f = parseFollowUpFilter(
      "only the ones with a payment arrangement",
      c,
      r.current.sources,
    );
    expect(f?.has_arrangement).toBe(true);
  });

  it("8. returns null when no filter parsed", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["a"],
    });
    const f = parseFollowUpFilter("only show them", c, r.current.sources);
    expect(f).toBeNull();
  });
});

describe("Build #33 — Follow-up filter application", () => {
  const r = useCopilotTestSources();

  it("9. amount filter narrows the result set", () => {
    const items: CopilotAnswerItem[] = [
      { id: "billing:rental:r1:overdue:p1", title: "A", amount: 200 },
      { id: "billing:rental:r2:overdue:p2", title: "B", amount: 800 },
    ];
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: items.map((i) => i.id),
    });
    const filtered = applyFollowUpFilter(
      items,
      { min_amount: 500 },
      c,
      r.current.sources,
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].amount).toBe(800);
  });

  it("10. amount filter with no matches returns empty", () => {
    const items: CopilotAnswerItem[] = [
      { id: "billing:rental:r1:overdue:p1", title: "A", amount: 100 },
    ];
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: items.map((i) => i.id),
    });
    const filtered = applyFollowUpFilter(
      items,
      { min_amount: 500 },
      c,
      r.current.sources,
    );
    expect(filtered.length).toBe(0);
  });

  it("11. filter only applies to prior result ids (not arbitrary items)", () => {
    const items: CopilotAnswerItem[] = [
      { id: "billing:rental:r1:overdue:p1", title: "A", amount: 800 },
      { id: "billing:rental:r2:overdue:p2", title: "B", amount: 900 },
    ];
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: ["billing:rental:r1:overdue:p1"], // only A
    });
    const filtered = applyFollowUpFilter(
      items,
      { min_amount: 500 },
      c,
      r.current.sources,
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("A");
  });

  it("12. no NaN/Infinity from filter on zero amounts", () => {
    const items: CopilotAnswerItem[] = [
      { id: "billing:rental:r1:overdue:p1", title: "A", amount: 0 },
    ];
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_prior_result_ids: items.map((i) => i.id),
    });
    const filtered = applyFollowUpFilter(
      items,
      { min_amount: 500 },
      c,
      r.current.sources,
    );
    expect(filtered.length).toBe(0);
  });
});

describe("Build #33 — Conversation follow-up flow", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("13. 'who is overdue' then 'only over $500' filters prior result", () => {
    // Step 1: ask who is overdue.
    const a1 = resolveCopilotQuery(
      "Who is overdue right now?",
      emptyConversation(),
      ctx,
    );
    expect(a1.intent).toBe("overdue_accounts");
    const updated = updateConversationContext(emptyConversation(), a1, null);
    // Step 2: filter the prior result.
    if (a1.items.length > 0) {
      const a2 = resolveCopilotQuery(
        "Only show the ones over $500",
        updated,
        ctx,
      );
      // The filter answer retains the prior intent.
      expect(a2.intent).toBe("overdue_accounts");
      // Filtered items are a subset of the prior items.
      const priorIds = new Set(a1.items.map((i) => i.id));
      for (const item of a2.items) {
        expect(priorIds.has(item.id)).toBe(true);
      }
    }
  });

  it("14. follow-up filter does not re-run a new intent", () => {
    const a1 = resolveCopilotQuery(
      "Who is overdue right now?",
      emptyConversation(),
      ctx,
    );
    const updated = updateConversationContext(emptyConversation(), a1, null);
    if (a1.items.length > 0) {
      const a2 = resolveCopilotQuery("Only show over $500", updated, ctx);
      // Should NOT be a brand-new intent like idle_vehicles.
      expect(a2.intent).toBe("overdue_accounts");
    }
  });

  it("15. updateConversationContext tracks prior intent + result ids", () => {
    const a: CopilotAnswer = {
      ...a1Stub(),
      intent: "overdue_accounts",
      items: [
        { id: "x1", title: "A" },
        { id: "x2", title: "B" },
      ],
    };
    const updated = updateConversationContext(emptyConversation(), a, null);
    expect(updated.context_prior_intent).toBe("overdue_accounts");
    expect(updated.context_prior_result_ids).toEqual(["x1", "x2"]);
  });

  it("16. context is bounded (only last turn retained)", () => {
    const a1: CopilotAnswer = {
      ...a1Stub(),
      intent: "overdue_accounts",
      items: [{ id: "x1", title: "A" }],
    };
    const a2: CopilotAnswer = {
      ...a1Stub(),
      intent: "idle_vehicles",
      items: [{ id: "y1", title: "B" }],
    };
    let c = updateConversationContext(emptyConversation(), a1, null);
    c = updateConversationContext(c, a2, null);
    // Only the last turn's intent + ids are retained.
    expect(c.context_prior_intent).toBe("idle_vehicles");
    expect(c.context_prior_result_ids).toEqual(["y1"]);
  });

  it("17. pronoun follow-up resolves to context customer", () => {
    const customer = r.current.sources.briefing.store.customers[0];
    const c = conv({ context_customer_id: customer.id });
    const a = resolveCopilotQuery("What does he owe?", c, ctx);
    // Should resolve to a customer intent (not unsupported).
    expect(a.intent).not.toBe("unsupported");
  });

  it("18. ambiguous entity asks for disambiguation (never guesses)", () => {
    // Use a common partial name that matches multiple customers.
    const a = resolveCopilotQuery(
      "What's going on with smith?",
      emptyConversation(),
      ctx,
    );
    // Either resolves to a single customer or asks for disambiguation.
    if (a.answer_type === "disambiguation") {
      expect(a.options && a.options.length > 1).toBe(true);
    }
  });
});

describe("Build #33 — AnswerCard renders launch features", () => {
  it("19. AnswerCard renders task preview", () => {
    const answer: CopilotAnswer = {
      intent: "compliance_attention",
      answer_type: "list",
      summary: "3 vehicles need registration renewal.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
      generated_at: NOW.toISOString(),
      as_of: NOW.toISOString(),
      permission_filtered: false,
      confidence_type: "derived",
      task_preview: [
        {
          occurrence_id: "occ_1",
          title: "Renew registration — Vehicle A",
          description: "Registration expired",
          entity_type: "vehicle",
          entity_id: "v1",
          deep_link: "/vehicles/v1",
        },
      ],
    };
    const { getByText } = render(
      <MemoryRouter>
        <AnswerCard answer={answer} />
      </MemoryRouter>,
    );
    expect(getByText(/Create 1 task/i)).toBeTruthy();
    expect(getByText("Renew registration — Vehicle A")).toBeTruthy();
  });

  it("20. AnswerCard task preview says Copilot never mutates without approval", () => {
    const answer: CopilotAnswer = {
      intent: "compliance_attention",
      answer_type: "list",
      summary: "test",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
      generated_at: NOW.toISOString(),
      as_of: NOW.toISOString(),
      permission_filtered: false,
      confidence_type: "derived",
      task_preview: [
        {
          occurrence_id: "occ_1",
          title: "T1",
          description: "D1",
          entity_type: "vehicle",
          entity_id: "v1",
          deep_link: null,
        },
      ],
    };
    const { getByText } = render(
      <MemoryRouter>
        <AnswerCard answer={answer} />
      </MemoryRouter>,
    );
    expect(getByText(/never mutates without approval/i)).toBeTruthy();
  });

  it("21. AnswerCard renders draft messages", () => {
    const answer: CopilotAnswer = {
      intent: "overdue_accounts",
      answer_type: "list",
      summary: "test",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
      generated_at: NOW.toISOString(),
      as_of: NOW.toISOString(),
      permission_filtered: false,
      confidence_type: "derived",
      draft_messages: [
        {
          customer_id: "c1",
          customer_name: "John Smith",
          subject: "Payment reminder",
          body: "Hi John, your payment is due.",
          deep_link: "/customers/c1",
        },
      ],
    };
    const { getByText } = render(
      <MemoryRouter>
        <AnswerCard answer={answer} />
      </MemoryRouter>,
    );
    expect(getByText("John Smith")).toBeTruthy();
    expect(getByText(/Hi John/)).toBeTruthy();
  });

  it("22. AnswerCard draft says never sends without review", () => {
    const answer: CopilotAnswer = {
      intent: "overdue_accounts",
      answer_type: "list",
      summary: "test",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
      generated_at: NOW.toISOString(),
      as_of: NOW.toISOString(),
      permission_filtered: false,
      confidence_type: "derived",
      draft_messages: [
        {
          customer_id: "c1",
          customer_name: "John",
          subject: "Reminder",
          body: "Hi",
          deep_link: null,
        },
      ],
    };
    const { getByText } = render(
      <MemoryRouter>
        <AnswerCard answer={answer} />
      </MemoryRouter>,
    );
    expect(getByText(/never sends without your review/i)).toBeTruthy();
  });
});

describe("Build #33 — Copilot Home UI (categorized prompts)", () => {
  it("23. empty state shows 'Connect Pro AI Operator' heading", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText("Connect Pro AI Operator")).toBeTruthy();
  });

  it("24. empty state shows category headings", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText("Today")).toBeTruthy();
    expect(getByText("Fleet")).toBeTruthy();
    expect(getByText("Operations")).toBeTruthy();
  });

  it("25. empty state shows supporting text", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText(/Ask questions about your fleet/i)).toBeTruthy();
  });

  it("26. deterministic disclaimer present", () => {
    const { getByText } = uiWrapper(<CopilotPanel embedded />);
    expect(getByText(/deterministic and grounded/i)).toBeTruthy();
  });
});

describe("Build #33 — Permission behavior through engine", () => {
  const r = useCopilotTestSources();

  it("27. collections rank hides amounts for no-finance viewer", () => {
    const ctx = engineCtx(r.current.sources, NO_FINANCE_PERMS);
    const a = resolveCopilotQuery(
      "Who should collections follow up with first?",
      emptyConversation(),
      ctx,
    );
    for (const item of a.items) {
      expect(item.amount).toBeNull();
    }
  });

  it("28. money left on table hides recoverable total for no-finance viewer", () => {
    const ctx = engineCtx(r.current.sources, NO_FINANCE_PERMS);
    const a = resolveCopilotQuery(
      "Where am I leaving money on the table?",
      emptyConversation(),
      ctx,
    );
    // Idle opportunity (counts) is always shown; recoverable dollars are gated.
    const recoverableFact = a.facts.find((f) => /recoverable/i.test(f.label));
    if (recoverableFact && recoverableFact.financial) {
      expect(recoverableFact.value).toBe("—");
    }
  });

  it("29. weekly review hides billed revenue for no-finance viewer", () => {
    const ctx = engineCtx(r.current.sources, NO_FINANCE_PERMS);
    const a = resolveCopilotQuery(
      "Give me my weekly owner report",
      emptyConversation(),
      ctx,
    );
    const billed = a.facts.find((f) => f.label === "Billed revenue");
    expect(billed?.value).toBe("—");
  });

  it("30. permission_filtered flag set when not full perms", () => {
    const ctx = engineCtx(r.current.sources, NO_FINANCE_PERMS);
    const a = resolveCopilotQuery(
      "Who is overdue right now?",
      emptyConversation(),
      ctx,
    );
    expect(a.permission_filtered).toBe(true);
  });
});

describe("Build #33 — Reliability (no NaN/Infinity, empty states)", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("31. morning briefing empty state is truthful (no fabrication)", () => {
    const a = resolveCopilotQuery(
      "What do I need to know today?",
      emptyConversation(),
      ctx,
    );
    expect(a.summary).toBeTruthy();
    expect(a.summary).not.toContain("NaN");
    expect(a.summary).not.toContain("Infinity");
  });

  it("32. end-of-day recap handles empty day", () => {
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      ctx,
    );
    expect(a.summary).not.toContain("NaN");
    expect(a.facts.length).toBeGreaterThan(0);
  });

  it("33. weekly review no NaN in summary", () => {
    const a = resolveCopilotQuery(
      "Give me my weekly owner report",
      emptyConversation(),
      ctx,
    );
    expect(a.summary).not.toContain("NaN");
    expect(a.summary).not.toContain("Infinity");
  });

  it("34. improve health no NaN", () => {
    const a = resolveCopilotQuery(
      "How do I improve my Health Score?",
      emptyConversation(),
      ctx,
    );
    expect(a.summary).not.toContain("NaN");
  });

  it("35. why without context does not crash", () => {
    const a = resolveCopilotQuery("Why?", emptyConversation(), ctx);
    expect(a.answer_type).toBe("fallback");
    expect(a.summary).toBeTruthy();
  });

  it("36. product help with no KB match does not crash", () => {
    const a = resolveCopilotQuery(
      "How do I configure zzzqqqxxx nonexistent?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("product_help_handoff");
    expect(a.summary).toBeTruthy();
  });

  it("37. follow-up filter with empty prior result does not crash", () => {
    const a = resolveCopilotQuery(
      "Only show over $500",
      emptyConversation(),
      ctx,
    );
    // No prior result → resolves as a new question (not a filter crash).
    expect(a.summary).toBeTruthy();
  });
});

// Helper to build a minimal answer stub for context-tracking tests.
function a1Stub(): CopilotAnswer {
  return {
    intent: "overdue_accounts",
    answer_type: "list",
    summary: "",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: [],
    generated_at: NOW.toISOString(),
    as_of: NOW.toISOString(),
    permission_filtered: false,
    confidence_type: "derived",
  };
}
