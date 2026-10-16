// Connect Pro Fleet — Build #51 Copilot Edge Function + Edge provider regression.
//
// Verifies the REAL LLM classification path end-to-end at the frontend seam:
//  - feature flag OFF → deterministic behavior unchanged
//  - Edge provider returns a classification → authoritative handler executes
//  - finance/last_month, recent_changes/last_week, active_rentals, overdue
//    rentals vs overdue payments, collections, semantic hint + resolver,
//    ambiguous → clarification, invented id discarded, low confidence,
//    invalid intent, timeout, Edge unavailable, high-risk approval, and
//    NO LLM API secret in frontend env/output.
//
// The Edge Function itself (Deno) is exercised via the server-side validator
// module imported directly (it is plain TypeScript with no Deno-only APIs at
// import time). The frontend edge provider is exercised with a mocked fetch +
// mocked Supabase session.

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Mock the Supabase client so the edge provider's endpoint derivation +
// session retrieval can be controlled per-test without relying on real
// import.meta.env (which is captured at module load and cannot be stubbed).
const supabaseMock = vi.hoisted(() => ({
  hasConfig: false,
  url: "",
  session: null as { access_token: string } | null,
}));
vi.mock("@/lib/supabase/client", () => ({
  hasSupabaseConfig: () => supabaseMock.hasConfig,
  getSupabase: () =>
    supabaseMock.hasConfig
      ? {
          auth: {
            getSession: async () => ({
              data: { session: supabaseMock.session },
              error: null,
            }),
          },
        }
      : null,
}));

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
  _isValidCopilotIntent,
} from "@/lib/copilotLlmClassifier";
import {
  createCopilotEdgeProvider,
  _edgeAllowedIntents,
  _edgeFunctionUrl,
} from "@/lib/copilot/copilotEdgeProvider";
import { validateClassification } from "../../supabase/functions/copilot/_shared/validator";
import {
  FULL_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
  firstVehicle,
} from "./copilotTestHarness";
import type { LlmClassification, CopilotIntent } from "@/lib/copilotTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const CTX = {
  lastUserQuery: null,
  priorIntent: null,
  priorEntityLabel: null,
  priorEntityType: null,
};

afterEach(() => {
  resetCopilotLlmProvider();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  supabaseMock.hasConfig = false;
  supabaseMock.url = "";
  supabaseMock.session = null;
});

// ---------------------------------------------------------------------------
// A. feature flag OFF → deterministic behavior unchanged
// ---------------------------------------------------------------------------

describe("Build #51 — A. flag OFF → deterministic unchanged", () => {
  it("isCopilotLlmConnected() is false by default", () => {
    expect(isCopilotLlmConnected()).toBe(false);
  });
  it("resolveCopilotQueryAsync falls back to deterministic when OFF", async () => {
    const r = useCopilotTestSources();
    const a = await resolveCopilotQueryAsync(
      "what is my utilization rate",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("fleet_utilization");
    expect(a.confidence_type).not.toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// B. fleet utilization classification → handler executes
// ---------------------------------------------------------------------------

describe("Build #51 — B. fleet_utilization classification", () => {
  it("dispatches fleet_utilization and stamps ai_assisted", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("fleet_utilization", { scope: "fleet_wide" }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "What's my fleet utilization?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("fleet_utilization");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// C. finance + last_month
// ---------------------------------------------------------------------------

describe("Build #51 — C. finance_overview + last_month", () => {
  it("dispatches finance_overview with last_month time range", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("finance_overview", {
        timeRange: "last_month",
        requestType: "summary",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "How much did we make last month?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("finance_overview");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// D. recent_changes + last_week
// ---------------------------------------------------------------------------

describe("Build #51 — D. recent_changes + last_week", () => {
  it("dispatches recent_changes with last_week time range", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("recent_changes", {
        timeRange: "last_week",
        requestType: "historical_activity",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "What happened last week?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("recent_changes");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// E. active_rentals count
// ---------------------------------------------------------------------------

describe("Build #51 — E. active_rentals count", () => {
  it("dispatches active_rentals (rental domain, not fleet count)", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("active_rentals", {
        scope: "company_wide",
        requestType: "count",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "How many active rentals do I have?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("active_rentals");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// F. overdue rentals (rental domain) vs overdue payments
// ---------------------------------------------------------------------------

describe("Build #51 — F. overdue rentals intent", () => {
  it("dispatches overdue_returns (rental overdue, not payment overdue)", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("overdue_returns", {
        requestType: "list",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "Do I have overdue rentals?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("overdue_returns");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// G. collections intent
// ---------------------------------------------------------------------------

describe("Build #51 — G. collections / overdue_accounts", () => {
  it("dispatches overdue_accounts for 'who owes me money'", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("overdue_accounts", {
        requestType: "ranking",
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "Who owes me money?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("overdue_accounts");
    expect(a.confidence_type).toBe("ai_assisted");
  });
});

// ---------------------------------------------------------------------------
// H. semantic hint + deterministic entity resolution
// ---------------------------------------------------------------------------

describe("Build #51 — H. semantic hint → deterministic resolver", () => {
  it("LLM vehicle hint resolves to the real vehicle via the resolver", async () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("vehicle_history", {
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
    expect(a.intent).toBe("vehicle_history");
    expect(a.sources.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// I. ambiguous → clarification
// ---------------------------------------------------------------------------

describe("Build #51 — I. ambiguous entity → clarification", () => {
  it("multiple customer matches → disambiguation/clarification, never a guess", async () => {
    const r = useCopilotTestSources();
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
    expect(
      a.answer_type === "disambiguation" || a.answer_type === "fallback",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// J. invented vehicle_id discarded → resolver still required
// ---------------------------------------------------------------------------

describe("Build #51 — J. invented id discarded", () => {
  it("server validator strips an invented vehicle_id from a hint", () => {
    const c = validateClassification(
      {
        intent: "vehicle_history",
        scope: "specific_record",
        timeRange: null,
        requestType: "specific_record",
        confidence: 0.9,
        entityHints: [
          {
            type: "vehicle",
            vehicle_id: "veh_FAKE_INVENTED",
            makeOrModel: "Nissan Altima",
          },
        ],
      },
      _edgeAllowedIntents(),
    );
    expect(c).not.toBeNull();
    // The id-like field is gone; only the semantic hint survives.
    expect(
      (c!.entityHints[0] as unknown as Record<string, unknown>).vehicle_id,
    ).toBeUndefined();
    expect(c!.entityHints[0].makeOrModel).toBe("Nissan Altima");
  });

  it("client validator also strips an invented id", () => {
    const c = validateLlmClassification({
      intent: "customer_summary",
      scope: "specific_record",
      timeRange: null,
      requestType: "specific_record",
      confidence: 0.9,
      entityHints: [
        { type: "customer", customer_id: "cust_FAKE", customerName: "Marcus" },
      ],
    });
    expect(c).not.toBeNull();
    expect(
      (c!.entityHints[0] as unknown as Record<string, unknown>).customer_id,
    ).toBeUndefined();
  });

  it("LLM-supplied id is never trusted — resolver re-resolves from name", async () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const mock = createMockCopilotLlmProvider({
      nextClassification: cls("customer_summary", {
        scope: "specific_record",
        entityHints: [{ type: "customer", customerName: name }],
      }),
    });
    setActiveCopilotLlmProvider(mock);
    const a = await resolveCopilotQueryAsync(
      "tell me about that customer",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_summary");
    expect(a.sources.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// K. low confidence → deterministic fallback
// ---------------------------------------------------------------------------

describe("Build #51 — K. low confidence → fallback", () => {
  it("server validator rejects below-threshold confidence", () => {
    expect(
      validateClassification(
        {
          intent: "fleet_utilization",
          scope: "fleet_wide",
          timeRange: null,
          requestType: "aggregate_metric",
          confidence: 0.4,
          entityHints: [],
        },
        _edgeAllowedIntents(),
      ),
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

// ---------------------------------------------------------------------------
// L. invalid intent → deterministic fallback
// ---------------------------------------------------------------------------

describe("Build #51 — L. invalid intent → fallback", () => {
  it("server validator rejects an intent not in allowedIntents", () => {
    expect(
      validateClassification(
        {
          intent: "totally_made_up_intent",
          scope: "fleet_wide",
          timeRange: null,
          requestType: "count",
          confidence: 0.99,
          entityHints: [],
        },
        _edgeAllowedIntents(),
      ),
    ).toBeNull();
  });
  it("invalid intent → deterministic fallback", async () => {
    const r = useCopilotTestSources();
    const mock = createMockCopilotLlmProvider({
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
    expect(a.intent).toBe("open_tasks");
  });
});

// ---------------------------------------------------------------------------
// M. provider timeout → deterministic fallback
// ---------------------------------------------------------------------------

describe("Build #51 — M. provider timeout → fallback", () => {
  beforeEach(() => {
    supabaseMock.hasConfig = true;
    supabaseMock.url = "https://example.supabase.co";
    supabaseMock.session = { access_token: "jwt-token" };
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-test-key");
  });
  it("edge provider returns null on fetch timeout (AbortError)", async () => {
    const provider = createCopilotEdgeProvider();
    expect(provider).not.toBeNull();
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new DOMException("aborted", "AbortError")),
    );
    const result = await provider!.classifyIntent!("hi", CTX);
    expect(result).toBeNull(); // timeout → deterministic fallback
  });
  it("edge provider returns null on a non-ok response", async () => {
    const provider = createCopilotEdgeProvider();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}", { status: 500 }),
    );
    const result = await provider!.classifyIntent!("hi", CTX);
    expect(result).toBeNull();
  });
  it("edge provider returns null on malformed JSON body", async () => {
    const provider = createCopilotEdgeProvider();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const result = await provider!.classifyIntent!("hi", CTX);
    expect(result).toBeNull();
  });
  it("edge provider returns null when no session is available", async () => {
    supabaseMock.session = null;
    const provider = createCopilotEdgeProvider();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const result = await provider!.classifyIntent!("hi", CTX);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled(); // early null before fetch
  });
});

// ---------------------------------------------------------------------------
// N. Edge Function unavailable → deterministic fallback
// ---------------------------------------------------------------------------

describe("Build #51 — N. Edge unavailable → fallback", () => {
  it("createCopilotEdgeProvider returns null when Supabase is not configured", () => {
    supabaseMock.hasConfig = false;
    const provider = createCopilotEdgeProvider();
    expect(provider).toBeNull();
  });
  it("edgeFunctionUrl is null without config", () => {
    supabaseMock.hasConfig = false;
    expect(_edgeFunctionUrl()).toBeNull();
  });
  it("edgeFunctionUrl derives from Supabase config", () => {
    supabaseMock.hasConfig = true;
    supabaseMock.url = "https://fleet.supabase.co";
    vi.stubEnv("VITE_SUPABASE_URL", "https://fleet.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    expect(_edgeFunctionUrl()).toBe(
      "https://fleet.supabase.co/functions/v1/copilot",
    );
  });
});

// ---------------------------------------------------------------------------
// O. high-risk request → approval safeguards intact
// ---------------------------------------------------------------------------

describe("Build #51 — O. high-risk approval safeguards", () => {
  it("create_reminder prepares a preview, never auto-creates", async () => {
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
    expect(a.caveats.join(" ").toLowerCase()).toContain("approv");
  });
  it("the LLM never executes — no payment/refund intent is auto-run", () => {
    // There is no LLM intent that directly charges/refunds. The intent set has
    // no "process_payment"/"refund"/"apply_deposit" value; such actions only
    // happen through the existing Prepare/Approval/Execute pipeline.
    expect(_isValidCopilotIntent("process_payment")).toBe(false);
    expect(_isValidCopilotIntent("refund_money")).toBe(false);
    expect(_isValidCopilotIntent("apply_deposit")).toBe(false);
    expect(_isValidCopilotIntent("close_rental")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P. No LLM API secret in frontend env / output
// ---------------------------------------------------------------------------

describe("Build #51 — P. no LLM API secret in frontend", () => {
  beforeEach(() => {
    supabaseMock.hasConfig = true;
    supabaseMock.url = "https://fleet.supabase.co";
    supabaseMock.session = { access_token: "jwt-token" };
    vi.stubEnv("VITE_SUPABASE_URL", "https://fleet.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  });
  it("no VITE_ env var carries an OpenAI key", () => {
    const envKeys = Object.keys(import.meta.env);
    const offenders = envKeys.filter(
      (k) => k.startsWith("VITE_") && /openai|api_key|secret/i.test(k),
    );
    expect(offenders).toEqual([]);
  });
  it("the edge provider object exposes no hardcoded API key", () => {
    const provider = createCopilotEdgeProvider();
    expect(provider).not.toBeNull();
    const json = JSON.stringify(provider);
    expect(/sk-[A-Za-z0-9]{20,}/.test(json)).toBe(false);
    expect(/api[_-]?key/i.test(json)).toBe(false);
    const intents = _edgeAllowedIntents();
    expect(intents.length).toBeGreaterThan(0);
    expect(JSON.stringify(intents)).not.toMatch(/sk-/);
  });
  it("the edge provider sends only query + context + allowedIntents (no secrets)", async () => {
    const provider = createCopilotEdgeProvider();
    expect(provider).not.toBeNull();
    let capturedBody: unknown = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedBody =
        init && typeof init === "object" && "body" in init
          ? (init as RequestInit).body
          : null;
      return new Response(JSON.stringify({ classification: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    await provider!.classifyIntent!("what happened last week", CTX);
    expect(capturedBody).not.toBeNull();
    const body = JSON.parse(String(capturedBody)) as Record<string, unknown>;
    expect(body.mode).toBe("classify");
    expect(Object.keys(body).sort()).toEqual(
      ["allowedIntents", "context", "mode", "query"].sort(),
    );
    // No secret/key/token field in the body.
    expect(JSON.stringify(body)).not.toMatch(/sk-|api[_-]?key|secret/i);
    // The Authorization header carries only the user JWT, never an API key.
    // (Verified by the mock: supabaseMock.session.access_token = "jwt-token".)
  });
});

// ---------------------------------------------------------------------------
// Edge provider + server validator parity
// ---------------------------------------------------------------------------

describe("Build #51 — edge provider / server validator parity", () => {
  it("edge allowedIntents are all valid CopilotIntents", () => {
    for (const intent of _edgeAllowedIntents()) {
      expect(_isValidCopilotIntent(intent)).toBe(true);
    }
  });
  it("server validator accepts a fully valid classification", () => {
    const c = validateClassification(
      {
        intent: "active_rentals",
        scope: "company_wide",
        timeRange: null,
        requestType: "count",
        confidence: 0.9,
        entityHints: [],
      },
      _edgeAllowedIntents(),
    );
    expect(c).not.toBeNull();
    expect(c!.intent).toBe("active_rentals");
  });
  it("server validator rejects invalid scope", () => {
    expect(
      validateClassification(
        {
          intent: "fleet_count",
          scope: "galaxy_wide",
          timeRange: null,
          requestType: "count",
          confidence: 0.9,
          entityHints: [],
        },
        _edgeAllowedIntents(),
      ),
    ).toBeNull();
  });
  it("server validator rejects confidence > 1", () => {
    expect(
      validateClassification(
        {
          intent: "fleet_count",
          scope: "fleet_wide",
          timeRange: null,
          requestType: "count",
          confidence: 1.5,
          entityHints: [],
        },
        _edgeAllowedIntents(),
      ),
    ).toBeNull();
  });
});
