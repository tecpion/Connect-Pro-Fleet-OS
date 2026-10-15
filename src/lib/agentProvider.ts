// Connect Pro Fleet — AI provider abstraction (V1).
//
// Provider-neutral architecture so agents are not tightly coupled to one AI
// vendor. In V1 NO production AI provider is connected — a deterministic/mock
// provider is used for development. This is reported honestly in the UI and
// final report: "AI Agent framework implemented; production AI provider NOT
// connected."
//
// The provider never receives unrestricted data. Callers pass minimum-required,
// permission-filtered, redacted context. No full payment card data, bank
// credentials, sensitive identity documents, or unnecessary PII is sent.
//
// All structured AI output is validated against strict schemas before
// application (see agentSchema.ts). Invalid output is rejected safely.

import type { AgentActionType, AgentType } from "./agentTypes";

// ---------------------------------------------------------------------------
// Findings — permission-filtered, minimum-context operational facts that are
// the INPUT to the provider. The provider never reads the store directly.
// ---------------------------------------------------------------------------

export interface AgentFinding {
  finding_type: string;
  entity_type: string;
  entity_id: string;
  label: string;
  deep_link: string;
  fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Planned actions — the provider/planner output. The store turns these into
// authoritative AgentAction records (with dedupe + approval gating).
// ---------------------------------------------------------------------------

export interface PlannedAction {
  action_type: AgentActionType;
  /** What was found (the fact). */
  finding: string;
  /** Why it matters (operational evidence, NOT chain-of-thought). */
  reason: string;
  /** Human-readable suggested action. */
  proposed_action: string;
  /** Strict structured data validated before execution. */
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface AiProviderRequest {
  agent_id: string;
  /** Minimum-required, redacted context (never the full tenant database). */
  context: unknown;
  /** The structured task the provider should produce output for. */
  task: string;
  tenant_id: string;
  schema?: unknown;
}

export interface AiProviderUsage {
  input_units: number;
  output_units: number;
  /** Provider cost (what Connect Pro pays). NEVER exposed to tenant. */
  provider_cost: number;
  /** Billable amount (what the tenant owes Connect Pro). */
  billable_amount: number;
  provider: string;
  model: string;
}

export interface AiProviderResponse {
  /** Structured output (validated by the caller against a schema). */
  structured_output: unknown;
  usage: AiProviderUsage;
}

export interface AiGenerateStructuredRequest {
  agent_id: AgentType;
  task: string;
  context: unknown;
  schema?: unknown;
}

/** Provider-neutral interface. Future production providers implement this. */
export interface AiProvider {
  id: string;
  /** Whether a REAL production provider is connected (false in V1). */
  available: boolean;
  /** Human-readable honesty label. */
  label: string;
  generate(req: AiProviderRequest): Promise<AiProviderResponse>;
  /** Structured generation used by the agent run engine. */
  generateStructured(
    req: AiGenerateStructuredRequest,
  ): Promise<{ structured_output: unknown; usage: AiProviderUsage }>;
}

/**
 * The deterministic/mock provider used in V1. It does NOT call any AI vendor.
 * It produces deterministic structured output from the supplied context so the
 * agent framework, approval workflow, usage metering, and UI can be developed
 * and tested end-to-end. It is NEVER represented as production AI.
 */
export const MOCK_AI_PROVIDER: AiProvider = {
  id: "mock-deterministic",
  available: false,
  label: "Deterministic (development) — production AI provider not connected",
  async generate(req: AiProviderRequest): Promise<AiProviderResponse> {
    const ctx = (req.context as { structured_output?: unknown }) ?? {};
    return {
      structured_output: ctx.structured_output ?? null,
      usage: {
        input_units: 0,
        output_units: 0,
        provider_cost: 0,
        billable_amount: 0,
        provider: "mock-deterministic",
        model: "dev-v1",
      },
    };
  },
  async generateStructured(req: AiGenerateStructuredRequest) {
    const ctx = (req.context as { structured_output?: unknown }) ?? {};
    return {
      structured_output: ctx.structured_output ?? null,
      usage: {
        input_units: 0,
        output_units: 0,
        provider_cost: 0,
        billable_amount: 0,
        provider: "mock-deterministic",
        model: "dev-v1",
      },
    };
  },
};

/** The active provider. In V1 this is always the mock. A future build swaps in
 *  a real server-backed provider here. */
let _activeProvider: AiProvider = MOCK_AI_PROVIDER;

export function getAIProvider(): AiProvider {
  return _activeProvider;
}

/** Alias used by some modules. */
export const getActiveAiProvider = getAIProvider;

/** Replace the active provider (future production wiring). */
export function setActiveAiProvider(provider: AiProvider): void {
  _activeProvider = provider;
}

/** Whether a real production AI provider is connected. */
export function isProductionAiConnected(): boolean {
  return _activeProvider.available;
}

/** Whether a production AI provider is connected (honest V1 state = false). */
export const PRODUCTION_AI_CONNECTED = MOCK_AI_PROVIDER.available;
