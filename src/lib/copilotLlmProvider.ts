// Connect Pro Fleet — Copilot LLM language provider (Build #50).
//
// Implements the existing CopilotLanguageProvider seam for LLM-driven intent
// classification + natural-language phrasing. This is the ROUTING FOUNDATION
// only — no production AI vendor is connected here.
//
// Safety contract (matches the audited architecture):
//  - The provider is UNAVAILABLE by default. With no provider connected, the
//    deterministic engine runs unchanged (100% existing behavior).
//  - No browser API key. Production requests must go through a server-side
//    endpoint (the `endpoint` field documents the future POST /api/copilot).
//  - The LLM only returns SEMANTIC entity hints — never trusted internal ids.
//    The deterministic Fleet resolver always chooses the actual record.
//  - The LLM never executes mutations. High-risk actions (payments, refunds,
//    task creation, …) keep flowing through the existing Prepare / Approval /
//    Execute pipeline. The LLM merely classifies intent.
//  - Phrasing may reword a structured answer but may NOT change numbers,
//    invent facts, add recommendations, remove warnings, or alter permission
//    results. The structured CopilotAnswer remains authoritative; if phrasing
//    fails, the deterministic spoken response is used.
//
// Dependency injection: tests inject a mock provider via setActiveCopilotLlmProvider
// so routing can be exercised without pretending production AI is connected.
// This mirrors the agentProvider.ts pattern (MOCK_AI_PROVIDER / setActiveAiProvider).

import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotLanguageProvider,
  CopilotServerProvider,
  LlmClassification,
  LlmConversationContext,
} from "./copilotTypes";
import { createCopilotEdgeProvider } from "./copilot/copilotEdgeProvider";

/** The deterministic provider — always "available" as a fallback path, but its
 *  `classifyIntent` returns null so the engine falls through to the existing
 *  deterministic pipeline. No secrets, no network. */
export const DETERMINISTIC_COPILOT_PROVIDER: CopilotServerProvider = {
  endpoint: "",
  available: false,
  // classifyIntent intentionally absent → classifier returns null → fallback.
};

/** The active Copilot language provider. Defaults to the deterministic
 *  placeholder (no LLM). A future production build swaps in a server-backed
 *  provider here; tests inject a mock. */
let _activeProvider: CopilotLanguageProvider = DETERMINISTIC_COPILOT_PROVIDER;

/** Whether a production (server-backed) Copilot LLM provider is connected. */
export function isCopilotLlmConnected(): boolean {
  const p = _activeProvider as CopilotServerProvider;
  return !!p && !!p.available;
}

export function getActiveCopilotLlmProvider(): CopilotLanguageProvider {
  return _activeProvider;
}

/** Replace the active provider (future production wiring / test injection). */
export function setActiveCopilotLlmProvider(
  provider: CopilotLanguageProvider,
): void {
  _activeProvider = provider;
}

/** Reset to the deterministic placeholder (tests). */
export function resetCopilotLlmProvider(): void {
  _activeProvider = DETERMINISTIC_COPILOT_PROVIDER;
}

// ---------------------------------------------------------------------------
// Build #51 — production edge-provider activation.
//
// When the internal `llmRoutingEnabled` flag is ON and a Supabase session is
// configured, the edge provider is activated. Otherwise the deterministic
// placeholder stays active (100% existing behavior). The edge provider itself
// returns null on any failure, so resolveCopilotQueryAsync always falls back to
// the deterministic engine.
//
// This is NOT a customer-facing setting. The flag defaults OFF and is flipped
// only for an internal/test tenant after deployment.
// ---------------------------------------------------------------------------

/** Lazily-created edge provider singleton (created once when first needed). */
let _edgeProvider: CopilotLanguageProvider | null | undefined;

/** Activate the production edge provider when the flag is on + Supabase is
 *  configured. Called by the voice context whenever the flag changes. Safe to
 *  call repeatedly. When `enabled` is false, resets to the deterministic
 *  placeholder so behavior is 100% deterministic.
 *
 *  This is async because the edge provider module is loaded via a dynamic
 *  ESM import (a synchronous `require()` does not exist in the Vite browser
 *  bundle). On the first activation we import the module, build the provider,
 *  and cache it. Subsequent activations reuse the cached provider. If the
 *  module fails to load or Supabase is not configured, the deterministic
 *  placeholder stays active. */
export async function applyCopilotLlmRoutingFlag(
  enabled: boolean,
): Promise<void> {
  if (!enabled) {
    _activeProvider = DETERMINISTIC_COPILOT_PROVIDER;
    return;
  }
  if (_edgeProvider === undefined) {
    try {
      const mod = (await import("./copilot/copilotEdgeProvider")) as {
        createCopilotEdgeProvider: () => CopilotLanguageProvider | null;
      };
      _edgeProvider = mod.createCopilotEdgeProvider();
    } catch {
      _edgeProvider = null;
    }
  }
  _activeProvider = _edgeProvider ?? DETERMINISTIC_COPILOT_PROVIDER;
}

/** Synchronous variant for tests that inject a mock provider directly via
 *  setActiveCopilotLlmProvider (no module load needed). Production wiring uses
 *  the async variant above. */
export function applyCopilotLlmRoutingFlagSync(enabled: boolean): void {
  if (!enabled) {
    _activeProvider = DETERMINISTIC_COPILOT_PROVIDER;
    return;
  }
  // Only meaningful once the async activation has cached the edge provider.
  _activeProvider = _edgeProvider ?? DETERMINISTIC_COPILOT_PROVIDER;
}

// ---------------------------------------------------------------------------
// A mock provider for routing integration tests. It is NEVER represented as
// production AI — it returns canned classifications so the engine's
// LLM→deterministic-resolution→dispatch path can be verified. Production
// wiring replaces this with a server-backed fetch to `endpoint`.
// ---------------------------------------------------------------------------

export interface MockCopilotLlmProvider extends CopilotLanguageProvider {
  available: boolean;
  /** Canned classification to return for the next call (or null to simulate
   *  low-confidence / unavailable). */
  nextClassification: LlmClassification | null;
  /** Optional canned phrasing result (or null to fall back to deterministic). */
  nextPhrasing: string | null;
  /** Canned failure mode for timeout/error tests. */
  failNext: boolean;
  classifyIntent: (
    query: string,
    context: LlmConversationContext,
  ) => Promise<LlmClassification | null>;
  summarizeStructuredAnswer: (answer: CopilotAnswer) => Promise<string>;
}

export function createMockCopilotLlmProvider(
  initial: Partial<MockCopilotLlmProvider> = {},
): MockCopilotLlmProvider {
  const provider: MockCopilotLlmProvider = {
    available: true,
    nextClassification: null,
    nextPhrasing: null,
    failNext: false,
    ...initial,
    async classifyIntent(
      _query: string,
      _context: LlmConversationContext,
    ): Promise<LlmClassification | null> {
      if (provider.failNext) {
        provider.failNext = false;
        throw new Error("mock provider timeout");
      }
      return provider.nextClassification;
    },
    async summarizeStructuredAnswer(answer: CopilotAnswer): Promise<string> {
      if (provider.failNext) {
        provider.failNext = false;
        throw new Error("mock phrasing timeout");
      }
      return provider.nextPhrasing ?? answer.summary;
    },
  };
  return provider;
}

/** Convenience: build a minimal conversation-context snapshot for the LLM.
 *  Sends only the last user query + prior intent + a human entity label.
 *  Never sends raw sensitive answer content or unrestricted app data. */
export function buildLlmConversationContext(
  conversation: CopilotConversation,
): LlmConversationContext {
  const lastUser = [...conversation.messages]
    .reverse()
    .find((m) => m.role === "user");
  return {
    lastUserQuery: lastUser?.content?.slice(0, 500) ?? null,
    priorIntent: conversation.context_prior_intent ?? null,
    priorEntityLabel: conversation.context_label ?? null,
    priorEntityType: conversation.context_customer_id
      ? "customer"
      : conversation.context_vehicle_id
        ? "vehicle"
        : conversation.context_rental_id
          ? "rental"
          : null,
  };
}
