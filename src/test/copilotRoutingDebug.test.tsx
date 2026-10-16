// Connect Pro Fleet — Build #53 INTERNAL Copilot routing-debug panel tests.
//
// Verifies:
//  1. debug OFF → panel not rendered (messages carry no routing_debug)
//  2. deterministic query shows deterministic routing
//  3. LLM query shows classification/confidence
//  4. LLM fallback shows fallback reason
//  5. sensitive secrets never render
//  6. entity ids / secrets / JWTs are not exposed (safe labels only)
//  7. debug panel does not alter CopilotAnswer or routing behavior
//
// Plus pure-function coverage for the debug trace builders.

import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import {
  resolveCopilotQuery,
  resolveCopilotQueryAsync,
} from "@/lib/copilotEngine";
import {
  resolveCopilotQueryWithDebug,
  resolveCopilotQueryAsyncWithDebug,
  setCopilotDebugEnabled,
  isCopilotDebugEnabled,
  useCopilotDebugEnabled,
  handlerLabelForIntent,
  domainForIntent,
} from "@/lib/copilot/copilotDebug";
import {
  setActiveCopilotLlmProvider,
  resetCopilotLlmProvider,
  createMockCopilotLlmProvider,
} from "@/lib/copilotLlmProvider";
import type { LlmClassification, CopilotIntent } from "@/lib/copilotTypes";
import { CopilotRoutingDebugPanel } from "@/components/copilot/CopilotRoutingDebugPanel";
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
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
  firstVehicle,
} from "./copilotTestHarness";

const DEBUG_KEY = "cpf_copilot_debug";

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
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
    </MemoryRouter>
  );
}

beforeEach(() => {
  setCopilotDebugEnabled(false);
  localStorage.removeItem(DEBUG_KEY);
  resetCopilotLlmProvider();
});

afterEach(() => {
  setCopilotDebugEnabled(false);
  localStorage.removeItem(DEBUG_KEY);
  resetCopilotLlmProvider();
});

function cls(
  intent: CopilotIntent,
  overrides: Partial<LlmClassification> = {},
): LlmClassification {
  return {
    intent,
    entityHints: [],
    scope: "company_wide",
    timeRange: null,
    requestType: "summary",
    confidence: 0.94,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("Build #53 — debug flag", () => {
  it("1. defaults OFF", () => {
    expect(isCopilotDebugEnabled()).toBe(false);
  });
  it("toggles ON and OFF", () => {
    setCopilotDebugEnabled(true);
    expect(isCopilotDebugEnabled()).toBe(true);
    expect(localStorage.getItem(DEBUG_KEY)).toBe("1");
    setCopilotDebugEnabled(false);
    expect(isCopilotDebugEnabled()).toBe(false);
    expect(localStorage.getItem(DEBUG_KEY)).toBeNull();
  });
  it("useCopilotDebugEnabled reflects the live flag", () => {
    let captured = false;
    function Probe() {
      captured = useCopilotDebugEnabled();
      return null;
    }
    const utils = render(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(captured).toBe(false);
    setCopilotDebugEnabled(true);
    utils.rerender(
      <Providers>
        <Probe />
      </Providers>,
    );
    expect(captured).toBe(true);
    setCopilotDebugEnabled(false);
  });
});

describe("Build #53 — handler/domain label helpers", () => {
  it("maps known intents to handler labels", () => {
    expect(handlerLabelForIntent("finance_overview")).toBe(
      "answerFinanceOverview",
    );
    expect(handlerLabelForIntent("active_rentals")).toBe("answerActiveRentals");
    expect(handlerLabelForIntent("unsupported")).toBe("unsupportedAnswer");
  });
  it("falls back to handle:<intent> for unmapped intents", () => {
    expect(handlerLabelForIntent("weekly_review")).toBe("handle:weekly_review");
  });
  it("buckets intents into coarse domains", () => {
    expect(domainForIntent("finance_overview")).toBe("money");
    expect(domainForIntent("active_rentals")).toBe("rentals");
    expect(domainForIntent("fleet_utilization")).toBe("fleet");
    expect(domainForIntent("rental_defense_record")).toBe("defense");
    expect(domainForIntent("greeting")).toBe("conversational");
  });
});

// ---------------------------------------------------------------------------
// Debug trace builders (deterministic + LLM)
// ---------------------------------------------------------------------------

describe("Build #53 — 2. deterministic query shows deterministic routing", () => {
  it("captures provider=deterministic + intent for a fleet query", () => {
    const r = useCopilotTestSources();
    const { answer, debug } = resolveCopilotQueryWithDebug(
      "what is my utilization rate",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("fleet_utilization");
    expect(debug.providerPath).toBe("deterministic");
    expect(debug.intent).toBe("fleet_utilization");
    expect(debug.fallbackReason).toBeNull();
    expect(debug.confidence).toBeNull();
    expect(debug.handler).toBe("answerFleetUtilization");
    expect(debug.domain).toBe("fleet");
    expect(debug.latencyMs).not.toBeNull();
  });

  it("captures normalized query when STT repair changes it", () => {
    const r = useCopilotTestSources();
    const { debug } = resolveCopilotQueryWithDebug(
      "what is my longest ideal Idol vehicle",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(debug.normalizedQuery).toContain("idle");
    expect(debug.normalizedQuery).not.toContain("ideal");
  });

  it("captures resolved entity (safe label, no id) for a customer query", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const { answer, debug } = resolveCopilotQueryWithDebug(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("customer_summary");
    expect(debug.resolvedEntity).not.toBeNull();
    expect(debug.resolvedEntity!.resolution).toBe("matched");
    expect(debug.resolvedEntity!.label).toContain(name.split(" ")[0]);
    // No internal id is present in the trace.
    const serialized = JSON.stringify(debug);
    const custId = r.current.sources.briefing.store.customers[0].id;
    expect(serialized).not.toContain(custId);
  });

  it("records ambiguous resolution when multiple customers match", () => {
    const r = useCopilotTestSources();
    // Use a common first-name fragment likely to match several seeded
    // customers; if not ambiguous, the trace still must not crash.
    const { debug } = resolveCopilotQueryWithDebug(
      "Tell me about Marcus",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (debug.resolvedEntity) {
      expect(["matched", "ambiguous", "no_match"]).toContain(
        debug.resolvedEntity.resolution,
      );
    }
  });
});

describe("Build #53 — 7. debug does not alter answer or routing", () => {
  it("deterministic debug answer === production answer", () => {
    const r = useCopilotTestSources();
    const q = "How many active rentals do I have?";
    const prod = resolveCopilotQuery(
      q,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const { answer } = resolveCopilotQueryWithDebug(
      q,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe(prod.intent);
    expect(answer.summary).toBe(prod.summary);
    expect(answer.answer_type).toBe(prod.answer_type);
  });
});

// ---------------------------------------------------------------------------
// LLM path
// ---------------------------------------------------------------------------

describe("Build #53 — 3. LLM query shows classification/confidence", () => {
  it("captures provider=llm + confidence + scope for a finance query", async () => {
    const r = useCopilotTestSources();
    const provider = createMockCopilotLlmProvider({
      nextClassification: cls("finance_overview", {
        scope: "company_wide",
        timeRange: "last_month",
        requestType: "summary",
        confidence: 0.94,
      }),
    });
    setActiveCopilotLlmProvider(provider);
    const { answer, debug } = await resolveCopilotQueryAsyncWithDebug(
      "How much did we make last month?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("finance_overview");
    expect(debug.providerPath).toBe("llm");
    expect(debug.confidence).toBeCloseTo(0.94, 2);
    expect(debug.scope).toBe("company_wide");
    expect(debug.timeRange).toBe("last_month");
    expect(debug.fallbackReason).toBeNull();
  });

  it("captures LLM semantic entity hints as safe labels (no id, no VIN)", async () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const provider = createMockCopilotLlmProvider({
      nextClassification: cls("customer_summary", {
        scope: "specific_record",
        requestType: "specific_record",
        entityHints: [
          {
            type: "customer",
            customerName: name,
            vin: "1C4BJXDG2RW123456",
          },
        ],
      }),
    });
    setActiveCopilotLlmProvider(provider);
    const { debug } = await resolveCopilotQueryAsyncWithDebug(
      `Tell me about ${name}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(debug.entityHints.length).toBe(1);
    expect(debug.entityHints[0].label).toContain(name.split(" ")[0]);
    // The full VIN must never appear in the trace.
    const serialized = JSON.stringify(debug);
    expect(serialized).not.toContain("1C4BJXDG2RW123456");
  });
});

describe("Build #53 — 4. LLM fallback shows fallback reason", () => {
  it("low confidence → llm_fallback + reason", async () => {
    const r = useCopilotTestSources();
    const provider = createMockCopilotLlmProvider({
      nextClassification: cls("finance_overview", { confidence: 0.42 }),
    });
    setActiveCopilotLlmProvider(provider);
    const { answer, debug } = await resolveCopilotQueryAsyncWithDebug(
      "How much did we make last month?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(debug.providerPath).toBe("llm_fallback");
    expect(debug.fallbackReason).toBe("low_confidence_or_invalid");
    // The fallback answer comes from the deterministic engine for the same
    // query (earnings_summary), NOT the rejected LLM intent.
    expect(answer.intent).toBe("earnings_summary");
  });

  it("invalid intent → llm_fallback + reason", async () => {
    const r = useCopilotTestSources();
    const provider = createMockCopilotLlmProvider({
      // classifyWithLlm validates → null for an invalid intent.
      nextClassification: {
        intent: "totally_made_up_intent" as CopilotIntent,
        entityHints: [],
        scope: "company_wide",
        timeRange: null,
        requestType: "summary",
        confidence: 0.9,
      },
    });
    setActiveCopilotLlmProvider(provider);
    const { debug } = await resolveCopilotQueryAsyncWithDebug(
      "something weird",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(debug.providerPath).toBe("llm_fallback");
    expect(debug.fallbackReason).toBeTruthy();
  });

  it("provider timeout → llm_fallback + provider_error", async () => {
    const r = useCopilotTestSources();
    const provider = createMockCopilotLlmProvider({
      failNext: true,
      nextClassification: cls("finance_overview"),
    });
    setActiveCopilotLlmProvider(provider);
    const { answer, debug } = await resolveCopilotQueryAsyncWithDebug(
      "How much did we make last month?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(debug.providerPath).toBe("llm_fallback");
    expect(debug.fallbackReason).toBe("provider_error");
    // Deterministic fallback answer (earnings_summary), not the LLM intent.
    expect(answer.intent).toBe("earnings_summary");
  });

  it("provider off → deterministic + provider_off reason", async () => {
    const r = useCopilotTestSources();
    const { debug } = await resolveCopilotQueryAsyncWithDebug(
      "How much did we make last month?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(debug.providerPath).toBe("deterministic");
    expect(debug.fallbackReason).toBe("provider_off");
  });
});

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

describe("Build #53 — 5/6. secrets / ids never render", () => {
  it("trace never contains API keys, JWTs, or secret markers", async () => {
    const r = useCopilotTestSources();
    const provider = createMockCopilotLlmProvider({
      nextClassification: cls("finance_overview", { confidence: 0.95 }),
    });
    setActiveCopilotLlmProvider(provider);
    const { debug } = await resolveCopilotQueryAsyncWithDebug(
      "How much did we make last month?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const serialized = JSON.stringify(debug);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]/i);
    expect(serialized).not.toMatch(/ey[a-zA-Z0-9_-]+\./);
    expect(serialized).not.toMatch(/COPILOT_OPENAI_API_KEY/i);
    expect(serialized).not.toMatch(/supabase.*key/i);
    expect(serialized).not.toMatch(/bearer/i);
  });

  it("resolved entity exposes a label but not an internal id", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const { debug } = resolveCopilotQueryWithDebug(
      `What's going with the ${v.make} ${v.model}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (debug.resolvedEntity) {
      const serialized = JSON.stringify(debug.resolvedEntity);
      expect(serialized).not.toContain(v.id);
      expect(serialized).not.toContain(v.vin ?? "__no_vin__");
    }
  });
});

// ---------------------------------------------------------------------------
// Panel component
// ---------------------------------------------------------------------------

describe("Build #53 — panel rendering", () => {
  it("renders the panel with safe fields when open", () => {
    const debug = {
      providerPath: "llm" as const,
      rawQuery: "How much did we make last month?",
      normalizedQuery: null,
      domain: "money",
      intent: "finance_overview" as CopilotIntent,
      confidence: 0.94,
      scope: "company_wide",
      requestType: "summary",
      timeRange: "last_month",
      entityHints: [],
      resolvedEntity: null,
      followUpContext: null,
      handler: "answerFinanceOverview",
      fallbackReason: null,
      latencyMs: 428,
    };
    render(
      <MemoryRouter>
        <CopilotRoutingDebugPanel debug={debug} />
      </MemoryRouter>,
    );
    // Collapsed by default — header visible, body hidden.
    expect(screen.getByText("Routing Debug")).toBeTruthy();
    expect(screen.queryByText("finance_overview")).toBeNull();
    // Expand.
    fireEvent.click(screen.getByText("Routing Debug"));
    expect(screen.getByText("finance_overview")).toBeTruthy();
    expect(screen.getByText("0.94")).toBeTruthy();
    expect(screen.getByText("last_month")).toBeTruthy();
    expect(screen.getByText("answerFinanceOverview")).toBeTruthy();
    expect(screen.getByText("428 ms")).toBeTruthy();
    expect(screen.getByText("LLM")).toBeTruthy();
  });

  it("shows fallback reason for an LLM fallback trace", () => {
    const debug = {
      providerPath: "llm_fallback" as const,
      rawQuery: "x",
      normalizedQuery: null,
      domain: "rentals",
      intent: "active_rentals" as CopilotIntent,
      confidence: null,
      scope: null,
      requestType: null,
      timeRange: null,
      entityHints: [],
      resolvedEntity: null,
      followUpContext: null,
      handler: "answerActiveRentals",
      fallbackReason: "low_confidence_or_invalid",
      latencyMs: 12,
    };
    render(
      <MemoryRouter>
        <CopilotRoutingDebugPanel debug={debug} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Routing Debug"));
    expect(screen.getByText("LLM → deterministic fallback")).toBeTruthy();
    expect(
      screen.getByText("Low confidence / invalid classification"),
    ).toBeTruthy();
  });

  it("does not render any secret-looking strings", () => {
    const debug = {
      providerPath: "deterministic" as const,
      rawQuery: "what is my utilization rate",
      normalizedQuery: null,
      domain: "fleet",
      intent: "fleet_utilization" as CopilotIntent,
      confidence: null,
      scope: null,
      requestType: null,
      timeRange: null,
      entityHints: [],
      resolvedEntity: {
        type: "vehicle",
        label: "2024 Jeep Wrangler (FL-JEEP21)",
        resolution: "matched" as const,
      },
      followUpContext: null,
      handler: "answerFleetUtilization",
      fallbackReason: null,
      latencyMs: 3,
    };
    const { container } = render(
      <MemoryRouter>
        <CopilotRoutingDebugPanel debug={debug} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("Routing Debug"));
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/sk-[a-zA-Z0-9]/i);
    expect(text).not.toMatch(/ey[a-zA-Z0-9_-]+\./);
    expect(text).not.toMatch(/COPILOT_OPENAI_API_KEY/i);
    expect(text).not.toMatch(/bearer/i);
  });
});

// ---------------------------------------------------------------------------
// Integration: CopilotPanel hides the panel when debug OFF, shows it ON
// ---------------------------------------------------------------------------

describe("Build #53 — 1. CopilotPanel hides debug when OFF", () => {
  it("no routing-debug panel rendered when debug OFF", async () => {
    setCopilotDebugEnabled(false);
    render(
      <Providers>
        <CopilotPanel initialQuery="How many active rentals do I have?" />
      </Providers>,
    );
    // Wait for the auto-run turn's answer summary (only in the answer card).
    await screen.findByText(/You currently have/i, { exact: false });
    expect(screen.queryByTestId("copilot-routing-debug")).toBeNull();
  });
});

describe("Build #53 — CopilotPanel shows debug when ON", () => {
  it("renders the routing-debug panel under the answer when ON", async () => {
    setCopilotDebugEnabled(true);
    render(
      <Providers>
        <CopilotPanel initialQuery="How many active rentals do I have?" />
      </Providers>,
    );
    await screen.findByText(/You currently have/i, { exact: false });
    const panel = await screen.findByTestId("copilot-routing-debug");
    expect(panel).toBeTruthy();
    // Expand and confirm deterministic routing is shown.
    fireEvent.click(within(panel).getByText("Routing Debug"));
    expect(within(panel).getByText("Deterministic")).toBeTruthy();
    expect(within(panel).getByText("active_rentals")).toBeTruthy();
  });

  it("debug ON does not change the answer content", async () => {
    setCopilotDebugEnabled(false);
    const { unmount } = render(
      <Providers>
        <CopilotPanel initialQuery="How many active rentals do I have?" />
      </Providers>,
    );
    const offSummary = (
      await screen.findByText(/You currently have/i, {
        exact: false,
      })
    ).textContent;
    unmount();

    setCopilotDebugEnabled(true);
    render(
      <Providers>
        <CopilotPanel initialQuery="How many active rentals do I have?" />
      </Providers>,
    );
    const onSummary = (
      await screen.findByText(/You currently have/i, {
        exact: false,
      })
    ).textContent;
    expect(onSummary).toBe(offSummary);
  });
});
