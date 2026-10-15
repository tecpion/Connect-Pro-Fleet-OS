// Connect Pro Fleet — Copilot LLM classifier (Build #50).
//
// The LLM tool-calling layer. It calls the active Copilot language provider to
// interpret a natural-language query into a structured classification, then
// VALIDATES the result before the engine trusts it. The deterministic engine
// + handlers stay 100% intact as the execution layer and offline fallback.
//
// What the classifier does:
//  - call the active provider (no-op → null when no provider is connected)
//  - validate the returned intent is a real CopilotIntent
//  - validate scope / time-range / request-type shape
//  - enforce a confidence threshold (a wrong confident answer is worse than a
//    clarification → fall back to deterministic)
//  - return SEMANTIC entity hints only — never trusted internal ids
//
// What the classifier does NOT do:
//  - compute business values (handlers do that)
//  - resolve real entity records (the deterministic resolver does that)
//  - execute mutations / approvals (the existing action system does that)
//
// The classification maps directly onto the existing CopilotIntent enum — the
// LLM does not invent a new tool schema.

import type {
  CopilotIntent,
  LlmClassification,
  LlmConversationContext,
  LlmEntityHint,
  LlmRequestType,
  LlmScope,
} from "./copilotTypes";
import type { DomainTimeRange } from "./copilotDomainRouter";
import {
  getActiveCopilotLlmProvider,
  isCopilotLlmConnected,
} from "./copilotLlmProvider";

/** Minimum confidence for the engine to trust an LLM classification. Below
 *  this, the classifier returns null and the deterministic pipeline runs. */
export const LLM_CONFIDENCE_THRESHOLD = 0.6;

/** The set of valid CopilotIntent values, built once for O(1) validation. The
 *  LLM may not return an intent outside this set — invalid intents are
 *  rejected and the engine falls back to deterministic. */
const VALID_INTENTS = new Set<CopilotIntent>(
  // Hand-written to avoid a runtime import cycle; kept in sync with
  // CopilotIntent in copilotTypes.ts. A test asserts this stays complete.
  [
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
    // Build #52 — defense record intents.
    "rentals_missing_license_verification",
    "active_rentals_without_checkout",
    "authorized_driver_check",
    "vehicles_released_with_maintenance_warning",
    "incidents_missing_police_reports",
    "generate_documentation_package",
    "rental_defense_record",
    "driver_authorization_check",
    "release_insurance_status",
    "release_safety_maintenance",
    "greeting",
    "thanks",
    "goodbye",
    "affirmation",
    "help",
    "unsupported",
    // V1 Telematics — vehicle-scoped + fleet-wide telematics intents.
    "telematics_vehicle_location",
    "telematics_trips_for_vehicle",
    "telematics_last_seen",
    "telematics_summary",
    "telematics_offline_devices",
    "telematics_no_device",
    "telematics_rental_alerts",
    "telematics_outside_geofence",
  ] as CopilotIntent[],
);

const VALID_SCOPES = new Set<LlmScope>([
  "fleet_wide",
  "company_wide",
  "location",
  "list",
  "specific_record",
]);

const VALID_REQUEST_TYPES = new Set<LlmRequestType>([
  "aggregate_metric",
  "count",
  "list",
  "ranking",
  "status",
  "specific_record",
  "summary",
  "historical_activity",
  "create_action",
  "follow_up",
]);

const VALID_TIME_RANGES = new Set<DomainTimeRange>([
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
]);

const VALID_HINT_TYPES = new Set<LlmEntityHint["type"]>([
  "customer",
  "vehicle",
  "rental",
]);

/** Sanitize entity hints: keep only semantic fields, DROP any field that looks
 *  like an internal database id. The LLM must never supply trusted ids — the
 *  deterministic resolver chooses the real record. */
function sanitizeEntityHints(hints: unknown): LlmEntityHint[] {
  if (!Array.isArray(hints)) return [];
  const out: LlmEntityHint[] = [];
  for (const raw of hints) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const type = h.type;
    if (!type || !VALID_HINT_TYPES.has(type as LlmEntityHint["type"])) continue;
    // Reject any hint that carries an internal id — the LLM may not bypass
    // entity resolution.
    if (
      "id" in h ||
      "entity_id" in h ||
      "customer_id" in h ||
      "vehicle_id" in h ||
      "rental_id" in h
    ) {
      // Drop the id-like field entirely; keep semantic hints only.
    }
    const hint: LlmEntityHint = { type: type as LlmEntityHint["type"] };
    if (typeof h.customerName === "string" && h.customerName.trim())
      hint.customerName = h.customerName.trim();
    if (typeof h.makeOrModel === "string" && h.makeOrModel.trim())
      hint.makeOrModel = h.makeOrModel.trim();
    if (typeof h.plate === "string" && h.plate.trim())
      hint.plate = h.plate.trim();
    if (typeof h.vin === "string" && h.vin.trim()) hint.vin = h.vin.trim();
    if (typeof h.rentalNumber === "string" && h.rentalNumber.trim())
      hint.rentalNumber = h.rentalNumber.trim();
    out.push(hint);
  }
  return out;
}

/** Validate a raw provider response into a trusted LlmClassification, or null
 *  if it is invalid / low-confidence. Pure + synchronous. */
export function validateLlmClassification(
  raw: unknown,
): LlmClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const intent = c.intent;
  if (typeof intent !== "string" || !VALID_INTENTS.has(intent as CopilotIntent))
    return null;
  const scope = c.scope;
  if (typeof scope !== "string" || !VALID_SCOPES.has(scope as LlmScope))
    return null;
  const requestType = c.requestType;
  if (
    typeof requestType !== "string" ||
    !VALID_REQUEST_TYPES.has(requestType as LlmRequestType)
  )
    return null;
  const timeRange = c.timeRange;
  if (
    timeRange !== null &&
    timeRange !== undefined &&
    (typeof timeRange !== "string" ||
      !VALID_TIME_RANGES.has(timeRange as DomainTimeRange))
  )
    return null;
  const confidence = Number(c.confidence);
  if (!Number.isFinite(confidence)) return null;
  if (confidence < LLM_CONFIDENCE_THRESHOLD) return null;
  if (confidence > 1) return null; // out of range
  const entityHints = sanitizeEntityHints(c.entityHints);
  return {
    intent: intent as CopilotIntent,
    entityHints,
    scope: scope as LlmScope,
    timeRange: (timeRange ?? null) as DomainTimeRange | null,
    requestType: requestType as LlmRequestType,
    confidence,
  };
}

/** Classify a query through the active LLM provider. Returns a VALIDATED
 *  LlmClassification, or null when:
 *   - no production/mock provider is connected
 *   - the provider call fails / times out
 *   - the response is invalid or below the confidence threshold
 *
 *  In every null case the engine falls back to the deterministic pipeline. */
export async function classifyWithLlm(
  query: string,
  context: LlmConversationContext,
): Promise<LlmClassification | null> {
  const provider = getActiveCopilotLlmProvider();
  if (!isCopilotLlmConnected() || !provider.classifyIntent) return null;
  let raw: unknown;
  try {
    raw = await provider.classifyIntent(query, context);
  } catch {
    // Provider failure / timeout → deterministic fallback.
    return null;
  }
  return validateLlmClassification(raw);
}

/** Exposed for tests so the VALID_INTENTS set can be asserted complete. */
export function _isValidCopilotIntent(intent: string): boolean {
  return VALID_INTENTS.has(intent as CopilotIntent);
}
