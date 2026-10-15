// Connect Pro Fleet — Copilot Edge provider (Build #51).
//
// The production CopilotLanguageProvider backed by the Supabase Edge Function
// `copilot`. This is the ONLY frontend wiring for real LLM classification.
//
// Safety contract:
//  - No API key in the browser. The LLM key lives only in the Edge Function's
//    Deno env (COPILOT_OPENAI_API_KEY). The browser sends only its existing
//    Supabase session JWT.
//  - The provider derives the Edge Function URL from the existing Supabase
//    project config — no customer-facing endpoint setting, no localStorage.
//  - On ANY failure (no session, no Supabase config, network error, timeout,
//    malformed response, rejected classification) it returns null so
//    resolveCopilotQueryAsync falls back to the deterministic engine.
//  - The provider NEVER throws into the Copilot UI.
//  - PHASE 1 = CLASSIFICATION ONLY. No phrasing (summarizeStructuredAnswer is
//    intentionally absent — phrasing is a later, separate build).

import type {
  CopilotAnswer,
  CopilotLanguageProvider,
  LlmClassification,
  LlmConversationContext,
} from "../copilotTypes";
import { getSupabase, hasSupabaseConfig } from "../supabase/client";

/** Hard client-side timeout. The Edge Function also enforces a server-side
 *  cap; this ensures the UI never hangs if the network stalls. */
const EDGE_TIMEOUT_MS = 7000;

/** Derive the Edge Function URL from the existing Supabase project config.
 *  No customer-facing setting, no localStorage. */
function edgeFunctionUrl(): string | null {
  if (!hasSupabaseConfig()) return null;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  // Supabase Edge Functions are served at {projectUrl}/functions/v1/{name}.
  return `${url.replace(/\/$/, "")}/functions/v1/copilot`;
}

/** The full set of intents the Fleet engine supports. Sent to the Edge Function
 *  so the server constrains the model to valid intents. Mirrors CopilotIntent;
 *  kept in sync (the classifier test asserts completeness). */
const ALLOWED_INTENTS: string[] = [
  "daily_priorities",
  "todays_summary",
  "recent_changes",
  "end_of_day_recap",
  "morning_ops_briefing",
  "weekly_review",
  "executive_focus",
  "money_due_today",
  "overdue_accounts",
  "customer_balance",
  "payments_received_today",
  "broken_arrangements",
  "collections_rank",
  "rentals_starting_today",
  "rentals_returning_today",
  "overdue_returns",
  "rental_status",
  "idle_vehicles",
  "vehicle_status",
  "vehicle_unavailable_reason",
  "blocked_vehicles",
  "vehicle_utilization",
  "fleet_utilization",
  "vehicle_profitability",
  "vehicle_history",
  "fleet_count",
  "popular_vehicle",
  "earnings_summary",
  "deposit_summary",
  "open_tasks",
  "finance_overview",
  "active_rentals",
  "historical_returns",
  "vehicle_additions",
  "create_reminder",
  "customer_summary",
  "customer_payment_status",
  "customer_rental_history",
  "customer_damage_history",
  "customer_violation_history",
  "customer_compliance",
  "maintenance_attention",
  "vehicle_maintenance_history",
  "open_damage_claims",
  "customer_damage_claims",
  "vehicle_damage_claims",
  "compliance_attention",
  "expiring_documents",
  "blocked_by_compliance",
  "violation_attention",
  "unresolved_violations",
  "my_priorities",
  "needs_assignment",
  "overdue_tasks",
  "executive_summary",
  "business_health",
  "health_score_explanation",
  "improve_health",
  "money_left_on_table",
  "fleet_performance",
  "utilization_explanation",
  "collections_summary",
  "banking_needs_review",
  "banking_unmatched_out",
  "banking_unmatched_in",
  "banking_duplicate_expenses",
  "banking_statements_attention",
  "banking_suggested_matches",
  "compound_query",
  "business_summary",
  "why",
  "product_help_handoff",
  "greeting",
  "thanks",
  "goodbye",
  "affirmation",
  "help",
  "unsupported",
];

/** Build the production edge provider. Returns null when Supabase is not
 *  configured (memory/dev mode) — the caller then keeps the deterministic
 *  provider. */
export function createCopilotEdgeProvider(): CopilotLanguageProvider | null {
  const endpoint = edgeFunctionUrl();
  if (!endpoint) return null;

  const provider: CopilotLanguageProvider = {
    // classifyIntent is the only production method in Phase 1.
    async classifyIntent(
      query: string,
      context: LlmConversationContext,
    ): Promise<LlmClassification | null> {
      const supabase = getSupabase();
      if (!supabase) return null;
      // Retrieve the user's current session JWT. No API key is involved.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return null; // not signed in → deterministic fallback.

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS);
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            mode: "classify",
            query: query.slice(0, 1000),
            context: {
              lastUserQuery: context.lastUserQuery?.slice(0, 500) ?? null,
              priorIntent: context.priorIntent ?? null,
              priorEntityLabel: context.priorEntityLabel ?? null,
              priorEntityType: context.priorEntityType ?? null,
            },
            allowedIntents: ALLOWED_INTENTS,
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data || typeof data !== "object") return null;
        const classification = (data as { classification?: unknown })
          .classification;
        if (classification === null || classification === undefined)
          return null;
        // The server already validated, but we re-validate client-side too so a
        // tampered/proxy response can never bypass the engine's contract.
        // Lazy import to avoid a circular dependency at module load.
        const { validateLlmClassification } =
          await import("../copilotLlmClassifier");
        return validateLlmClassification(classification);
      } catch {
        // Network error / timeout / malformed → deterministic fallback.
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
    // Phase 1: no phrasing. summarizeStructuredAnswer is intentionally absent.
    // The engine falls back to buildCopilotSpokenResponse.
  };

  // Mark as available so isCopilotLlmConnected() returns true.
  return Object.assign(provider, {
    available: true,
  }) as CopilotLanguageProvider & {
    available: boolean;
  };
}

/** Exposed for tests so the ALLOWED_INTENTS set can be asserted complete. */
export function _edgeAllowedIntents(): string[] {
  return [...ALLOWED_INTENTS];
}

/** Exposed for tests so the endpoint derivation can be asserted. */
export function _edgeFunctionUrl(): string | null {
  return edgeFunctionUrl();
}

// Reference CopilotAnswer to keep the type import meaningful for future
// phrasing wiring (Phase 2). This avoids an unused-type lint without pulling
// runtime cost.
export type { CopilotAnswer };
