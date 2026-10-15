// Connect Pro Fleet — Copilot INTERNAL routing-debug layer (Build #53).
//
// Founder/developer-only diagnostics for Copilot routing. When the internal
// debug flag is OFF (the default) the production resolvers run UNCHANGED with
// zero overhead — this module is never called by the panel. When the flag is
// ON, the panel calls the `*WithDebug` wrappers below, which replicate the
// thin routing shell (deterministic resolve / LLM classify → dispatch →
// deterministic fallback) using the SAME exported primitives the production
// resolvers use, and additionally return a `CopilotRoutingDebug` trace.
//
// Privacy contract (matches the audited architecture):
//  - NEVER include API keys, JWTs, Supabase secrets, or any VITE_* value. This
//    module has no access to any of them.
//  - NEVER include internal database ids. The resolved entity is shown as a
//    safe display label + resolution result only (no id field).
//  - NEVER include full VINs. LLM entity-hint labels are built from
//    customerName / makeOrModel / plate / rentalNumber only — `vin` is dropped.
//  - NEVER include raw financial payloads or unrestricted conversation
//    context. Only the prior intent + prior entity label are carried.
//  - The debug trace does NOT alter CopilotAnswer or routing: the `answer`
//    returned by the wrappers is produced by the exact same exported
//    functions the production resolvers call, in the same order.

import { useSyncExternalStore } from "react";
import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotIntent,
  CopilotRoutingDebug,
  CopilotRoutingDebugEntity,
  CopilotRoutingDebugEntityHint,
  CopilotSources,
  LlmEntityHint,
} from "../copilotTypes";
import type { CopilotEngineContext } from "../copilotEngine";
import { resolveCopilotQuery } from "../copilotEngine";
import { validateLlmClassification } from "../copilotLlmClassifier";
import { dispatchLlmClassification } from "../copilotLlmDispatch";
import {
  buildLlmConversationContext,
  getActiveCopilotLlmProvider,
  isCopilotLlmConnected,
} from "../copilotLlmProvider";
import { resolveEntities, resolveFollowUpEntity } from "../copilotResolver";
import { normalizeSpeechQuery } from "../copilotNormalizer";
import { stripWakePhrase } from "../copilotConversational";

// Re-export the trace types so callers import them from the debug module too.
export type {
  CopilotRoutingDebug,
  CopilotRoutingDebugEntity,
  CopilotRoutingDebugEntityHint,
};

// ---------------------------------------------------------------------------
// Internal debug flag (localStorage, default OFF). NOT a customer setting.
// ---------------------------------------------------------------------------

const DEBUG_STORAGE_KEY = "cpf_copilot_debug";

let _cachedEnabled: boolean | null = null;
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  if (_cachedEnabled !== null) return _cachedEnabled;
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether the internal Copilot routing-debug panel is enabled. */
export function isCopilotDebugEnabled(): boolean {
  return readEnabled();
}

/** Toggle the internal debug flag (dev only). Persists to localStorage and
 *  notifies any subscribed components so the panel re-renders live. */
export function setCopilotDebugEnabled(on: boolean): void {
  _cachedEnabled = on;
  try {
    if (on) localStorage.setItem(DEBUG_STORAGE_KEY, "1");
    else localStorage.removeItem(DEBUG_STORAGE_KEY);
  } catch {
    /* ignore quota / privacy mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook returning the live debug-flag value. */
export function useCopilotDebugEnabled(): boolean {
  return useSyncExternalStore(subscribe, isCopilotDebugEnabled, () => false);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function nowMs(): number {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

/** Best-effort handler/tool label for an intent (dev readability only). */
export function handlerLabelForIntent(intent: CopilotIntent): string {
  const map: Partial<Record<CopilotIntent, string>> = {
    finance_overview: "answerFinanceOverview",
    active_rentals: "answerActiveRentals",
    fleet_utilization: "answerFleetUtilization",
    vehicle_utilization: "answerVehicleUtilization",
    recent_changes: "answerRecentChanges",
    overdue_accounts: "answerOverdueAccounts",
    create_reminder: "answerCreateReminder",
    earnings_summary: "answerEarningsSummary",
    historical_returns: "answerHistoricalReturns",
    vehicle_additions: "answerVehicleAdditions",
    popular_vehicle: "answerPopularVehicle",
    customer_summary: "answerCustomerSummary",
    customer_balance: "answerCustomerBalance",
    vehicle_status: "answerVehicleSummary",
    rental_status: "answerRentalReadiness",
    rentals_missing_license_verification:
      "answerRentalsMissingLicenseVerification",
    active_rentals_without_checkout: "answerActiveRentalsWithoutCheckout",
    authorized_driver_check: "answerAuthorizedDriverCheck",
    vehicles_released_with_maintenance_warning:
      "answerVehiclesReleasedWithMaintenanceWarning",
    incidents_missing_police_reports: "answerIncidentsMissingPoliceReports",
    generate_documentation_package: "answerGenerateDocumentationPackage",
    rental_defense_record: "answerRentalDefenseRecord",
    driver_authorization_check: "answerDriverAuthorizationCheck",
    release_insurance_status: "answerReleaseInsuranceStatus",
    release_safety_maintenance: "answerReleaseSafetyMaintenance",
    help: "helpAnswer",
    unsupported: "unsupportedAnswer",
  };
  return map[intent] ?? `handle:${intent}`;
}

/** Coarse domain bucket for an intent (dev readability only). */
export function domainForIntent(intent: CopilotIntent): string | null {
  if (intent === "unsupported" || intent === "help") return "meta";
  if (
    intent === "greeting" ||
    intent === "thanks" ||
    intent === "goodbye" ||
    intent === "affirmation"
  )
    return "conversational";
  if (
    intent.startsWith("rentals_missing") ||
    intent.startsWith("active_rentals_without") ||
    intent === "authorized_driver_check" ||
    intent.startsWith("vehicles_released") ||
    intent === "incidents_missing_police_reports" ||
    intent === "generate_documentation_package" ||
    intent === "rental_defense_record" ||
    intent === "driver_authorization_check" ||
    intent === "release_insurance_status" ||
    intent === "release_safety_maintenance"
  )
    return "defense";
  if (
    intent.startsWith("customer") ||
    intent === "overdue_accounts" ||
    intent === "money_due_today" ||
    intent === "collections_rank" ||
    intent === "collections_summary" ||
    intent === "payments_received_today" ||
    intent === "broken_arrangements" ||
    intent === "earnings_summary" ||
    intent === "finance_overview" ||
    intent === "deposit_summary"
  )
    return "money";
  if (
    intent.startsWith("rental") ||
    intent === "active_rentals" ||
    intent === "historical_returns" ||
    intent === "overdue_returns" ||
    intent === "rentals_starting_today" ||
    intent === "rentals_returning_today"
  )
    return "rentals";
  if (
    intent.startsWith("vehicle") ||
    intent === "fleet_utilization" ||
    intent === "fleet_count" ||
    intent === "idle_vehicles" ||
    intent === "blocked_vehicles" ||
    intent === "popular_vehicle" ||
    intent === "vehicle_additions"
  )
    return "fleet";
  if (intent.startsWith("maintenance")) return "maintenance";
  if (intent.startsWith("compliance") || intent === "expiring_documents")
    return "compliance";
  if (intent.startsWith("violation")) return "violations";
  if (
    intent === "open_tasks" ||
    intent === "my_priorities" ||
    intent === "needs_assignment" ||
    intent === "overdue_tasks" ||
    intent === "create_reminder"
  )
    return "tasks";
  if (intent.startsWith("banking")) return "banking";
  if (intent.startsWith("executive") || intent === "business_health")
    return "executive";
  if (intent === "recent_changes" || intent === "why") return "ops";
  return null;
}

/** The entity type an entity-scoped intent wants to resolve. Mirrors the
 *  engine's internal `wantedEntityType` for dev diagnostics only. */
function wantedEntityType(intent: CopilotIntent): string | null {
  if (intent.startsWith("customer")) return "customer";
  if (intent.startsWith("vehicle") || intent === "vehicle_unavailable_reason")
    return "vehicle";
  if (intent.startsWith("rental")) return "rental";
  if (
    intent === "authorized_driver_check" ||
    intent === "rental_defense_record" ||
    intent === "generate_documentation_package" ||
    intent === "driver_authorization_check" ||
    intent === "release_insurance_status" ||
    intent === "release_safety_maintenance"
  )
    return "rental";
  return null;
}

/** Build a safe (no-id, no-VIN) label for an LLM entity hint. */
function hintLabel(h: LlmEntityHint): string {
  const parts = [h.customerName, h.makeOrModel, h.plate, h.rentalNumber].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : h.type;
}

/** Normalized query when deterministic normalization changed it, else null. */
function normalizedQueryOf(query: string): string | null {
  const stripped = stripWakePhrase(query).trim() || query.trim();
  if (!stripped) return null;
  const normalized = normalizeSpeechQuery(stripped);
  if (!normalized) return null;
  if (normalized === query.trim().toLowerCase()) return null;
  return normalized;
}

/** Follow-up context snapshot (prior intent + prior entity label only). */
function followUpOf(
  conversation: CopilotConversation,
): CopilotRoutingDebug["followUpContext"] {
  return {
    priorIntent: conversation.context_prior_intent ?? null,
    priorEntityLabel: conversation.context_label ?? null,
    priorTimeRange: null,
  };
}

/** Deterministically resolve the entity for an intent, returning a safe
 *  (no-id) debug descriptor. Uses the SAME exported resolver as the engine. */
function buildResolvedEntity(
  query: string,
  conversation: CopilotConversation,
  src: CopilotSources,
  intent: CopilotIntent,
): CopilotRoutingDebugEntity | null {
  const wanted = wantedEntityType(intent);
  if (!wanted) return null;
  // Pronoun follow-up → current conversation context.
  const followUp = resolveFollowUpEntity(query, conversation, src);
  let refs = followUp ? [followUp] : resolveEntities(query, src).refs;
  refs = refs.filter((r) => r.type === wanted);
  if (refs.length === 0) {
    return { type: wanted, label: "—", resolution: "no_match" };
  }
  if (refs.length > 1) {
    return {
      type: refs[0].type,
      label: refs.map((r) => r.label).join(" / "),
      resolution: "ambiguous",
    };
  }
  return { type: refs[0].type, label: refs[0].label, resolution: "matched" };
}

function emptyDebug(
  query: string,
  conversation: CopilotConversation,
): CopilotRoutingDebug {
  return {
    providerPath: "deterministic",
    rawQuery: query,
    normalizedQuery: null,
    domain: null,
    intent: null,
    confidence: null,
    scope: null,
    requestType: null,
    timeRange: null,
    entityHints: [],
    resolvedEntity: null,
    followUpContext: followUpOf(conversation),
    handler: null,
    fallbackReason: null,
    latencyMs: null,
  };
}

/** Populate the deterministic-path fields on a debug trace from the answer. */
function fillDeterministic(
  debug: CopilotRoutingDebug,
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
  answer: CopilotAnswer,
): void {
  debug.intent = answer.intent;
  debug.domain = domainForIntent(answer.intent);
  debug.normalizedQuery = normalizedQueryOf(query);
  debug.handler = handlerLabelForIntent(answer.intent);
  debug.resolvedEntity = buildResolvedEntity(
    query,
    conversation,
    ctx.src,
    answer.intent,
  );
  debug.followUpContext = followUpOf(conversation);
}

// ---------------------------------------------------------------------------
// WithDebug resolvers — return the SAME answer the production resolvers
// produce, plus a routing-debug trace. Only called when the debug flag is ON.
// ---------------------------------------------------------------------------

export interface CopilotDebugResult {
  answer: CopilotAnswer;
  debug: CopilotRoutingDebug;
}

/** Deterministic resolver + debug trace. The answer is produced by the
 *  unchanged `resolveCopilotQuery`; the trace is best-effort diagnostics
 *  recomputed from the same exported helpers. */
export function resolveCopilotQueryWithDebug(
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotDebugResult {
  const debug = emptyDebug(query, conversation);
  const start = nowMs();
  const answer = resolveCopilotQuery(query, conversation, ctx);
  debug.providerPath = "deterministic";
  fillDeterministic(debug, query, conversation, ctx, answer);
  debug.latencyMs = Math.round(nowMs() - start);
  return { answer, debug };
}

/** Async LLM-aware resolver + debug trace. Mirrors the thin shell of
 *  `resolveCopilotQueryAsync` (classify → dispatch → deterministic fallback)
 *  using the same exported primitives, recording the LLM classification +
 *  fallback reason. The deterministic fallback reuses the unchanged
 *  `resolveCopilotQuery`. */
export async function resolveCopilotQueryAsyncWithDebug(
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): Promise<CopilotDebugResult> {
  const debug = emptyDebug(query, conversation);
  const start = nowMs();
  const llmOn = isCopilotLlmConnected();

  if (!llmOn) {
    debug.fallbackReason = "provider_off";
  } else {
    const llmContext = buildLlmConversationContext(conversation);
    // Call the provider directly so a thrown error (timeout / network failure)
    // is distinguishable from a null / invalid / low-confidence classification.
    // classifyWithLlm swallows both into null; here we keep them apart for the
    // fallback-reason trace. Validation uses the SAME validateLlmClassification
    // the production classifier uses.
    const provider = getActiveCopilotLlmProvider();
    let raw: unknown = null;
    let providerError = false;
    if (provider.classifyIntent) {
      try {
        raw = await provider.classifyIntent(query, llmContext);
      } catch {
        providerError = true;
      }
    }
    let classification = null;
    if (!providerError && raw != null) {
      classification = validateLlmClassification(raw);
    }
    if (providerError) {
      debug.fallbackReason = "provider_error";
    } else if (!classification) {
      // null raw, invalid shape, or below the confidence threshold.
      debug.fallbackReason = "low_confidence_or_invalid";
    }
    if (classification) {
      debug.providerPath = "llm";
      debug.confidence = classification.confidence;
      debug.scope = classification.scope;
      debug.requestType = classification.requestType;
      debug.timeRange = classification.timeRange;
      debug.entityHints = classification.entityHints.map((h) => ({
        type: h.type,
        label: hintLabel(h),
      }));
      let answer: CopilotAnswer | null = null;
      try {
        answer = dispatchLlmClassification(
          classification,
          query,
          conversation,
          ctx,
        );
      } catch {
        debug.fallbackReason = "dispatch_failure";
        classification = null;
      }
      if (classification && answer) {
        debug.intent = answer.intent;
        debug.domain = domainForIntent(answer.intent);
        debug.handler = handlerLabelForIntent(answer.intent);
        debug.normalizedQuery = normalizedQueryOf(query);
        debug.resolvedEntity = buildResolvedEntity(
          query,
          conversation,
          ctx.src,
          answer.intent,
        );
        debug.followUpContext = followUpOf(conversation);
        debug.latencyMs = Math.round(nowMs() - start);
        return { answer, debug };
      }
    }
  }

  // Deterministic fallback (provider off, or LLM classification rejected).
  debug.providerPath = llmOn ? "llm_fallback" : "deterministic";
  const answer = resolveCopilotQuery(query, conversation, ctx);
  fillDeterministic(debug, query, conversation, ctx, answer);
  debug.latencyMs = Math.round(nowMs() - start);
  return { answer, debug };
}
