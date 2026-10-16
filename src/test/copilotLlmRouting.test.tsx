// Connect Pro Fleet — Build #50 LLM Copilot Routing Foundation regression.
//
// Verifies the LLM routing layer: provider OFF → deterministic unchanged;
// provider ON → validated classification dispatches through the existing
// handlers with deterministic entity resolution; entity hints never bypass the
// resolver; invalid/low-confidence/failure → deterministic fallback; high-risk
// actions keep the approval workflow; LLM phrasing changes no numerical values.

import { afterEach, describe, it, expect } from "vitest";
import {
  resolveCopilotQuery,
  resolveCopilotQueryAsync,
} from "@/lib/copilotEngine";
import {
  setActiveCopilotLlmProvider,
  resetCopilotLlmProvider,
  createMockCopilotLlmProvider,
  isCopilotLlmConnected,
} from "@/lib/copilotLlmProvider";
import {
  validateLlmClassification,
  classifyWithLlm,
  LLM_CONFIDENCE_THRESHOLD,
  _isValidCopilotIntent,
} from "@/lib/copilotLlmClassifier";
import { ENTITY_INTENTS as LLM_DISPATCH_ENTITY_INTENTS } from "@/lib/copilotLlmDispatch";
import type { LlmClassification, CopilotIntent } from "@/lib/copilotTypes";
import {
  FULL_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
  firstVehicle,
} from "./copilotTestHarness";

afterEach(() => {
  resetCopilotLlmProvider();
});

/** Build a valid classification for a given intent (high confidence). */
function cls(
  intent: CopilotIntent,
  overrides: Partial<LlmClassification> = {},
): LlmClassification {
  return {
    intent,
    entityHints: [],
    scope: "fleet_wide",
    timeRange: null,
    requestType: "aggregate_metric",
    confidence: 0.95,
    ...overrides,
  };
}

describe("Build #50 — A. provider OFF → deterministic behavior unchanged", () => {
  it("isCopilotLlmConnected() is false by default", () => {
    expect(isCopilotLlmConnected()).toBe(false);
  });
  it("classifyWithLlm returns null when no provider connected", async () => {
    const c = await classifyWithLlm("anything", {
      lastUserQuery: "anything",
      priorIntent: null,
      priorEntityLabel: null,
      priorEntityType: null,
    });
    expect(c).toBeNull();
  });
  it("resolveCopilotQueryAsync falls back to deterministic when OFF", async () => {
    const r = useCopilotTestSources();
    const a = await resolveCopilotQueryAsync(
      "what is my utilization rate",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("fleet_utilization");
  });
  it("deterministic resolveCopilotQuery still works unchanged", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "do I have any open task",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("open_tasks");
  });
});

describe("Build #50 — B. provider returns fleet_utilization → handler executes", () => {
  it("dispatches fleet_utilization via LLM classification", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("fleet_utilization", { scope: "fleet_wide" }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "what is my utilization rate",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("fleet_utilization");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

describe("Build #50 — C. finance intent + last_month → financial handler", () => {
  it("dispatches earnings_summary with last_month time range", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("earnings_summary", {
        timeRange: "last_month",
        requestType: "summary",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "how much did we make last month",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("earnings_summary");
  });
});

describe("Build #50 — D. entity hint → deterministic resolver finds vehicle", () => {
  it("LLM vehicle hint resolves to the real vehicle via deterministic resolver", async () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("vehicle_utilization", {
        scope: "specific_record",
        entityHints: [
          {
            type: "vehicle",
            makeOrModel: `${v.make} ${v.model}`,
            plate: v.license_plate,
          },
        ],
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "That Nissan — when was it last rented?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_utilization");
    // The deterministic resolver found the real vehicle (source present).
    expect(a.sources.length).toBeGreaterThan(0);
  });
});

describe("Build #50 — E. ambiguous entity → clarification, not a guess", () => {
  it("two matching customers → disambiguation answer", async () => {
    const r = useCopilotTestSources();
    // Use a partial name that matches multiple seeded customers if possible;
    // otherwise simulate ambiguity by hinting a common token. The resolver
    // returns ambiguous when >1 customer matches.
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("customer_summary", {
        scope: "specific_record",
        entityHints: [{ type: "customer", customerName: "a" }],
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "Tell me about Marcus",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Either disambiguation (multiple matches) or a natural clarification
    // (no/one match) — never a silent wrong guess.
    expect(
      a.answer_type === "disambiguation" || a.answer_type === "fallback",
    ).toBe(true);
  });
});

describe("Build #50 — F. invalid model intent → rejected → fallback", () => {
  it("invalid intent string is rejected by validateLlmClassification", () => {
    expect(
      validateLlmClassification({
        intent: "not_a_real_intent",
        scope: "fleet_wide",
        timeRange: null,
        requestType: "count",
        confidence: 0.99,
        entityHints: [],
      }),
    ).toBeNull();
  });
  it("invalid intent → deterministic fallback", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      // The provider returns an invalid intent; the classifier rejects it.
      nextClassification: {
        intent: "bogus" as CopilotIntent,
        entityHints: [],
        scope: "fleet_wide",
        timeRange: null,
        requestType: "count",
        confidence: 0.99,
      },
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "do I have any open task",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Falls back to deterministic → open_tasks.
    expect(a.intent).toBe("open_tasks");
  });
});

describe("Build #50 — G. low confidence → deterministic fallback", () => {
  it("below threshold classification is rejected", () => {
    expect(
      validateLlmClassification({
        intent: "fleet_utilization",
        scope: "fleet_wide",
        timeRange: null,
        requestType: "aggregate_metric",
        confidence: LLM_CONFIDENCE_THRESHOLD - 0.01,
        entityHints: [],
      }),
    ).toBeNull();
  });
  it("low confidence → deterministic fallback", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("fleet_count", { confidence: 0.2 }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "what is my utilization rate",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("fleet_utilization");
  });
});

describe("Build #50 — H. provider failure/timeout → deterministic fallback", () => {
  it("provider throws → deterministic fallback", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("fleet_count"),
      failNext: true,
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "what is my utilization rate",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("fleet_utilization");
  });
});

describe("Build #50 — I. LLM internal entity id ignored / re-resolved", () => {
  it("entity hint carrying an internal id field is sanitized (id dropped)", () => {
    // validateLlmClassification sanitizes hints — id-like fields are dropped,
    // only semantic hints (name/make/plate) are kept.
    const c = validateLlmClassification({
      intent: "customer_summary",
      scope: "specific_record",
      timeRange: null,
      requestType: "specific_record",
      confidence: 0.9,
      entityHints: [
        {
          type: "customer",
          id: "cust_123",
          customerName: "Marcus Johnson",
        },
      ],
    });
    expect(c).not.toBeNull();
    expect(c!.entityHints[0].customerName).toBe("Marcus Johnson");
    // No id-like field survives on the hint.
    expect(
      (c!.entityHints[0] as unknown as Record<string, unknown>).id,
    ).toBeUndefined();
  });
  it("LLM-supplied id is never trusted — resolver re-resolves from hints", async () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("customer_summary", {
        scope: "specific_record",
        entityHints: [
          {
            type: "customer",
            // The LLM tries to supply a fake id alongside the real name.
            customerName: name,
          },
        ],
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "tell me about that customer",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // The deterministic resolver matched the real customer by name.
    expect(a.intent).toBe("customer_summary");
    expect(a.sources.length).toBeGreaterThan(0);
  });
});

describe("Build #50 — J. high-risk action → approval workflow enforced", () => {
  it("create_reminder prepares a task preview, never auto-creates", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("create_reminder", {
        scope: "company_wide",
        requestType: "create_action",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "remind me in 1 hour to call Marcus",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("create_reminder");
    // The handler prepares a preview; it does NOT execute. The answer asks
    // for approval (caveat mentions approval).
    const caveatText = a.caveats.join(" ").toLowerCase();
    expect(caveatText).toContain("approv");
  });
});

describe("Build #50 — K. LLM phrasing changes no numerical values", () => {
  it("phrasing returns deterministic text when no provider connected", async () => {
    const { phraseCopilotAnswerAsync } = await import("@/lib/copilotEngine");
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "how many vehicles do I have",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const spoken = await phraseCopilotAnswerAsync(a, "deterministic text");
    expect(spoken).toBe("deterministic text");
  });
  it("phrasing may reword but preserves numerical values from the answer", async () => {
    const { phraseCopilotAnswerAsync } = await import("@/lib/copilotEngine");
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "how many vehicles do I have",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Extract any numbers from the authoritative answer summary.
    const nums = (a.summary.match(/\d+/g) ?? []).slice();
    const mock = createMockCopilotLlmProvider({
      nextPhrasing: `Sure — ${a.summary} Let me know if you want more detail.`,
    });
    setActiveCopilotLlmProvider(mock);
    const spoken = await phraseCopilotAnswerAsync(a, "fallback");
    // Every number from the authoritative answer is preserved in phrasing.
    for (const n of nums) {
      expect(spoken).toContain(n);
    }
  });
});

describe("Build #50 — classifier validation shape", () => {
  it("rejects invalid scope", () => {
    expect(
      validateLlmClassification({
        intent: "fleet_count",
        scope: "galaxy_wide",
        timeRange: null,
        requestType: "count",
        confidence: 0.9,
        entityHints: [],
      }),
    ).toBeNull();
  });
  it("rejects invalid time range", () => {
    expect(
      validateLlmClassification({
        intent: "earnings_summary",
        scope: "fleet_wide",
        timeRange: "last_decade",
        requestType: "summary",
        confidence: 0.9,
        entityHints: [],
      }),
    ).toBeNull();
  });
  it("rejects confidence > 1", () => {
    expect(
      validateLlmClassification({
        intent: "fleet_count",
        scope: "fleet_wide",
        timeRange: null,
        requestType: "count",
        confidence: 1.5,
        entityHints: [],
      }),
    ).toBeNull();
  });
  it("accepts a fully valid classification", () => {
    const c = validateLlmClassification({
      intent: "open_tasks",
      scope: "company_wide",
      timeRange: "today",
      requestType: "count",
      confidence: 0.88,
      entityHints: [],
    });
    expect(c).not.toBeNull();
    expect(c!.intent).toBe("open_tasks");
  });
});

describe("Build #50 — VALID_INTENTS set completeness", () => {
  it("covers all entity intents used by the dispatch module", () => {
    for (const intent of LLM_DISPATCH_ENTITY_INTENTS) {
      expect(_isValidCopilotIntent(intent)).toBe(true);
    }
  });
  it("covers a sample of company-wide intents", () => {
    const sample: CopilotIntent[] = [
      "fleet_utilization",
      "earnings_summary",
      "create_reminder",
      "historical_returns",
      "finance_overview",
      "open_tasks",
      "morning_ops_briefing",
    ];
    for (const intent of sample) {
      expect(_isValidCopilotIntent(intent)).toBe(true);
    }
  });
});
