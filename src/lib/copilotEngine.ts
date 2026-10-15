// Connect Pro Fleet — Copilot engine (Build #29).
//
// The engine is the single deterministic entry point: it resolves the intent,
// resolves entities (with disambiguation + follow-up context), dispatches to the
// authoritative handler, and returns a structured CopilotAnswer. No LLM is
// called — a future server-backed provider can phrase the structured answer
// conversationally. The context passed anywhere is already permission-filtered
// by the handlers (BEFORE any provider layer), so money/sensitive values never
// leak to an unauthorized viewer.

import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotIntent,
  CopilotSources,
  CopilotViewerPermissions,
  EntityRef,
  LlmClassification,
  LlmConversationContext,
} from "./copilotTypes";
import {
  resolveCopilotIntent,
  resolveEntities,
  resolveFollowUpEntity,
  disambiguationAnswer,
  helpAnswer,
  unsupportedAnswer,
} from "./copilotResolver";
import {
  answerCustomerBalance,
  answerRentalReadiness,
} from "./copilotMoneyRentalHandlers";
import {
  answerVehicleSummary,
  answerVehicleUnavailableReason,
  answerVehicleUtilization,
  answerVehicleProfitability,
  answerVehicleHistory,
  answerVehicleMaintenanceHistory,
} from "./copilotVehicleHandlers";
import { answerEarningsSummary } from "./copilotEarningsHandler";
import { answerFinanceOverview } from "./copilotFinanceOverviewHandler";
import {
  answerActiveRentals,
  answerHistoricalReturns,
  answerVehicleAdditions,
} from "./copilotRentalHistoryHandlers";
import { answerCreateReminder } from "./copilotReminderHandler";
import { answerRecentChanges } from "./copilotDailyHandlers";
import {
  answerCustomerSummary,
  answerCustomerPaymentStatus,
  answerCustomerRentalHistory,
  answerCustomerDamageHistory,
  answerCustomerViolationHistory,
  answerCustomerCompliance,
} from "./copilotCustomerHandlers";
import { answerWhy, answerProductHelpHandoff } from "./copilotLaunchWhy";
import {
  parseFollowUpFilter,
  buildFilteredAnswer,
} from "./copilotFollowUpFilter";
import { answerCompoundQuery } from "./copilotCompoundQuery";
import { baseAnswer } from "./copilotShared";
import { resolveConversationalQuery } from "./copilotConversational";
import { dispatchCompanyIntent as dispatchCompanyIntentImpl } from "./copilotCompanyDispatch";
import { resolveVehicleScope } from "./copilotScope";
import { answerPopularVehicle } from "./copilotPopularVehicleHandler";
import {
  detectTimeModifier,
  isTimeSensitiveIntent,
} from "./copilotTimeModifier";
import { classifyWithLlm } from "./copilotLlmClassifier";
import { buildLlmConversationContext } from "./copilotLlmProvider";
import { dispatchLlmClassification } from "./copilotLlmDispatch";
import {
  dispatchDefenseEntityIntent,
  DEFENSE_ENTITY_INTENTS,
  maybeLegalConclusionAnswer,
} from "./copilotDefenseDispatch";
import { answerCaseForEntity } from "./copilotCaseHandlers";
import { answerBookingRequestSummary } from "./copilotBookingHandlers";
export interface CopilotEngineContext {
  src: CopilotSources;
  asOf: Date;
  perms: CopilotViewerPermissions;
  staffId: string;
  tenantId: string;
  /** Location ids the viewer may see (empty = all locations). */
  allowedLocationIds?: string[];
}

/** Intents that require a single entity ref (customer/vehicle/rental). */
const ENTITY_INTENTS = new Set<CopilotIntent>([
  "customer_balance",
  "customer_summary",
  "customer_payment_status",
  "customer_rental_history",
  "customer_damage_history",
  "customer_violation_history",
  "customer_compliance",
  "vehicle_status",
  "vehicle_unavailable_reason",
  "vehicle_utilization",
  "vehicle_profitability",
  "vehicle_history",
  "vehicle_maintenance_history",
  "rental_status",
  // Build #52 — defense entity-scoped intents (rental/release-snapshot scoped).
  "authorized_driver_check",
  "generate_documentation_package",
  "rental_defense_record",
  "driver_authorization_check",
  "release_insurance_status",
  "release_safety_maintenance",
  // Build #54 — Case Center entity-scoped (customer or rental).
  "case_for_entity",
  // Build #62 — Booking Request summary is customer-name-scoped.
  "booking_request_summary",
]);

/** The entity type an entity-scoped intent wants to resolve. Defense intents
 *  (Build #52) are rental-scoped. */
function wantedEntityType(intent: CopilotIntent): EntityRef["type"] | null {
  if (intent.startsWith("customer")) return "customer";
  if (intent === "booking_request_summary") return "customer";
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

/** Resolve the entity for an entity-scoped intent, handling ambiguity + follow-up. */
function resolveEntityForIntent(
  intent: CopilotIntent,
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): { entity: EntityRef | null; answer: CopilotAnswer | null } {
  // 1. Follow-up pronoun → current conversation context.
  const followUp = resolveFollowUpEntity(query, conversation, ctx.src);
  if (followUp) return { entity: followUp, answer: null };

  // 2. Extract entities from the query.
  const { refs, ambiguous } = resolveEntities(query, ctx.src);

  // Prefer the entity type matching the intent.
  const wantedType = wantedEntityType(intent);

  const matching = wantedType
    ? refs.filter((r) => r.type === wantedType)
    : refs;

  if (ambiguous && matching.length > 1) {
    return {
      entity: null,
      answer: disambiguationAnswer(matching, intent, ctx.asOf, ctx.perms),
    };
  }

  if (matching.length === 1) return { entity: matching[0], answer: null };

  // 3. Fall back to current conversation context of the wanted type.
  if (wantedType === "customer" && conversation.context_customer_id) {
    return {
      entity: {
        type: "customer",
        id: conversation.context_customer_id,
        label: ctx.src.briefing.store.customerName(
          conversation.context_customer_id,
        ),
      },
      answer: null,
    };
  }
  if (wantedType === "vehicle" && conversation.context_vehicle_id) {
    const v = ctx.src.briefing.store.vehicles.find(
      (x) => x.id === conversation.context_vehicle_id,
    );
    if (v)
      return {
        entity: {
          type: "vehicle",
          id: v.id,
          label: `${v.year} ${v.make} ${v.model} (${v.license_plate})`,
        },
        answer: null,
      };
  }
  if (wantedType === "rental" && conversation.context_rental_id) {
    const r = ctx.src.briefing.store.rentals.find(
      (x) => x.id === conversation.context_rental_id,
    );
    if (r)
      return {
        entity: {
          type: "rental",
          id: r.id,
          label: `Rental ${r.agreement_number ?? r.id}`,
        },
        answer: null,
      };
  }

  return { entity: null, answer: null };
}

/** Re-resolve the prior intent's answer so a follow-up filter can apply to its
 *  full (un-gated-for-display) item set. The prior intent + entity context are
 *  retained on the conversation. */
function resolvePriorAnswer(
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotAnswer | null {
  const priorIntent = conversation.context_prior_intent;
  if (!priorIntent || priorIntent === "unsupported") return null;
  // Re-run the prior intent with the same context to get fresh items.
  // For entity-scoped intents, rebuild the entity ref from context.
  if (ENTITY_INTENTS.has(priorIntent)) {
    let entity: EntityRef | null = null;
    if (conversation.context_customer_id) {
      entity = {
        type: "customer",
        id: conversation.context_customer_id,
        label: ctx.src.briefing.store.customerName(
          conversation.context_customer_id,
        ),
      };
    } else if (conversation.context_vehicle_id) {
      const v = ctx.src.briefing.store.vehicles.find(
        (x) => x.id === conversation.context_vehicle_id,
      );
      if (v)
        entity = {
          type: "vehicle",
          id: v.id,
          label: `${v.year} ${v.make} ${v.model} (${v.license_plate})`,
        };
    } else if (conversation.context_rental_id) {
      const r = ctx.src.briefing.store.rentals.find(
        (x) => x.id === conversation.context_rental_id,
      );
      if (r)
        entity = {
          type: "rental",
          id: r.id,
          label: `Rental ${r.agreement_number ?? r.id}`,
        };
    }
    if (entity) return dispatchEntityIntent(priorIntent, entity, "", ctx);
    return null;
  }
  return dispatchCompanyIntent(priorIntent, ctx);
}

/** The deterministic query resolver. Returns a structured CopilotAnswer.
 *  Handles follow-up filters + compound queries, then delegates to the
 *  single-intent resolver. */
export function resolveCopilotQuery(
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  // Build #33 — follow-up filter ("only show the ones over $500") applies to
  // the PRIOR result set before resolving a new intent. The filter is parsed
  // deterministically and applied to the prior answer's items.
  const filter = parseFollowUpFilter(query, conversation, ctx.src);
  if (filter) {
    const priorAnswer = resolvePriorAnswer(conversation, ctx);
    if (priorAnswer) {
      return buildFilteredAnswer(
        priorAnswer,
        filter,
        conversation,
        ctx.src,
        ctx.asOf,
        ctx.perms,
      );
    }
  }

  // Build #40 — compound query: "What's overdue AND how many pickups this week?"
  // Split into two clauses, resolve each through the same engine, merge. Must
  // run BEFORE single-intent resolution so both parts are answered. Returns null
  // when the query is not a real compound question (falls through below).
  const compound = answerCompoundQuery(query, conversation, ctx, (q, conv, c) =>
    resolveCopilotQuerySingle(q, conv, c),
  );
  if (compound) return compound;

  return resolveCopilotQuerySingle(query, conversation, ctx);
}

/** Single-intent resolution (no compound splitting). Used by the compound
 *  handler for each sub-clause so there is no infinite recursion. */
function resolveCopilotQuerySingle(
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  // Conversational/social intent (greetings, thanks, goodbye, affirmations)
  // is checked BEFORE record resolution so "Hi Copilot" never falls through to
  // the entity-resolution fallback (spec §10, §16). Returns null for any query
  // that is not PRIMARILY a social utterance.
  const conversational = resolveConversationalQuery(query, ctx.asOf, ctx.perms);
  if (conversational) return conversational;

  // Build #52 — legal-conclusion guard ( Graves/liability → factual summary +
  // legal review, never a legal conclusion).
  const legal = maybeLegalConclusionAnswer(query, conversation, ctx);
  if (legal) return legal;
  // A bare time phrase ("today", "this week") after a time-sensitive prior
  // question is a FOLLOW-UP MODIFIER, not a new question. Re-run the prior
  // intent with the new time range applied. Only fires when the phrase is
  // essentially just a time modifier (no question words) AND the prior intent
  // is time-sensitive.
  const timeMod = detectTimeModifier(query, conversation);
  if (
    timeMod &&
    isTimeSensitiveIntent(conversation.context_prior_intent as CopilotIntent)
  ) {
    return dispatchCompanyIntent(
      conversation.context_prior_intent as CopilotIntent,
      ctx,
    );
  }

  let intent = resolveCopilotIntent(query);

  if (intent === "help") return helpAnswer(ctx.asOf, ctx.perms);
  if (intent === "unsupported") {
    // "Tell me more about that" after a multi-item answer (e.g. a briefing
    // with several priorities) is ambiguous — "that" doesn't map to one
    // record. Instead of a generic unsupported message, offer the items from
    // the prior answer so the user can pick one to dig into.
    const q = query.toLowerCase();
    const isAboutThat =
      /\b(?:tell me (?:more )?about|more about|what about|explain|elaborate on)\s+that\b/i.test(
        q,
      ) || /^(?:about|more about|what about)\s+that\b/i.test(q);
    const priorIds = conversation.context_prior_result_ids ?? [];
    if (isAboutThat && priorIds.length > 1) {
      return clarifyPriorItems(conversation, ctx);
    }
    return unsupportedAnswer(query, ctx.asOf, ctx.perms);
  }

  // The generic "what's going on with X" phrase resolves to customer_summary by
  // default, but if the named entity is a vehicle/rental, redirect to the
  // matching entity intent so vehicle status / rental status is answered.
  if (intent === "customer_summary") {
    const { refs } = resolveEntities(query, ctx.src);
    const vehicle = refs.find((r) => r.type === "vehicle");
    const rental = refs.find((r) => r.type === "rental");
    if (vehicle) intent = "vehicle_status";
    else if (rental) intent = "rental_status";
    else {
      // Pronoun follow-up ("what's going on with it?") — redirect by context type.
      const followUp = resolveFollowUpEntity(query, conversation, ctx.src);
      if (followUp?.type === "vehicle") intent = "vehicle_status";
      else if (followUp?.type === "rental") intent = "rental_status";
    }
  }

  // Vehicle utilization scope: a generic "my utilization" / "fleet
  // utilization" / "all vehicles" question with NO named vehicle must NOT
  // silently resolve to the first matching vehicle. Redirect to the fleet-wide
  // aggregate intent unless a specific vehicle is named or active context
  // clearly identifies one.
  if (intent === "vehicle_utilization") {
    const scope = resolveVehicleScope(query, conversation, ctx.src);
    if (scope === "fleet_wide") intent = "fleet_utilization";
    else if (scope === "ambiguous") intent = "fleet_utilization";
    // single_record → keep vehicle_utilization (entity resolution below).
  }

  // "Most popular vehicle" needs the raw query to detect which metric the user
  // named (most rented / most rental days / highest utilization).
  if (intent === "popular_vehicle") {
    return answerPopularVehicle(query, ctx.src, ctx.asOf, ctx.perms);
  }

  // "How much did I earn this year?" — needs the raw query to detect the time
  // range. Distinct revenue / cash / contribution metrics.
  if (intent === "earnings_summary") {
    return answerEarningsSummary(query, ctx.src, ctx.asOf, ctx.perms);
  }

  // "Give me a finance overview" / "overview of income for last month" — broad
  // financial picture scoped to the detected time range.
  if (intent === "finance_overview") {
    return answerFinanceOverview(query, ctx.src, ctx.asOf, ctx.perms);
  }

  // "How many returns have I had last week?" — historical completed returns in
  // the detected time range (NOT returns due today). Needs the raw query.
  if (intent === "historical_returns") {
    return answerHistoricalReturns(query, ctx.src, ctx.asOf, ctx.perms);
  }

  // "Any new cars added last month?" — vehicles acquired in the time range.
  if (intent === "vehicle_additions") {
    return answerVehicleAdditions(query, ctx.src, ctx.asOf, ctx.perms);
  }

  // "Remind me in 1 hour to call Marcus" — prepare a task preview for approval.
  // The Copilot never auto-creates; it PREPARES and asks for confirmation.
  if (intent === "create_reminder") {
    return answerCreateReminder(query, ctx.src, ctx.asOf, ctx.perms);
  }

  // "What happened last week?" — recent changes scoped to the detected time
  // range. Needs the raw query to detect last week / yesterday / this month.
  if (intent === "recent_changes") {
    return answerRecentChanges(
      ctx.src,
      ctx.asOf,
      ctx.perms,
      ctx.allowedLocationIds ?? [],
      query,
    );
  }

  // Build #33 — "why?" explains the prior answer (needs conversation context).
  if (intent === "why") {
    return answerWhy(ctx.src, ctx.asOf, ctx.perms, conversation);
  }
  // Build #33 — product-help questions route to the Knowledge Base.
  if (intent === "product_help_handoff") {
    return answerProductHelpHandoff(query, ctx.asOf, ctx.perms);
  }

  // Entity-scoped intents.
  if (ENTITY_INTENTS.has(intent)) {
    const { entity, answer } = resolveEntityForIntent(
      intent,
      query,
      conversation,
      ctx,
    );
    if (answer) return answer;
    if (!entity) {
      return {
        ...requireEntityAnswer(intent, ctx),
      };
    }
    return dispatchEntityIntent(intent, entity, query, ctx);
  }

  // Company-wide / non-entity intents.
  return dispatchCompanyIntent(intent, ctx);
}

/** "Tell me more about that" after a multi-item answer — list the prior items
 *  so the user can pick one to dig into, instead of a generic unsupported
 *  message. Re-derives the prior answer to recover its item titles. */
function clarifyPriorItems(
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const priorAnswer = resolvePriorAnswer(conversation, ctx);
  const base = baseAnswer(
    conversation.context_prior_intent ?? "unsupported",
    ctx.asOf,
    ctx.perms,
    "derived",
  );
  const items = priorAnswer?.items ?? [];
  if (items.length === 0) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I'm not sure which part you'd like to dig into. Could you tell me which item — for example, the overdue return or the blocked vehicle?",
      caveats: [],
    };
  }
  const list = items
    .slice(0, 5)
    .map((i, idx) => `${idx + 1}. ${i.title}`)
    .join("\n");
  return {
    ...base,
    answer_type: "fallback",
    summary: `Sure — which one do you want to dig into?\n${list}`,
    items: items.slice(0, 5).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.subtitle ?? null,
      deep_link: i.deep_link ?? null,
    })),
    caveats: [],
  };
}

function requireEntityAnswer(
  intent: CopilotIntent,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const base = baseAnswer(intent, ctx.asOf, ctx.perms, "derived");
  // Build #43 — conversational, not robotic. When an entity-scoped question
  // (e.g. "Tell me about Marcus") can't resolve to a single record, Copilot
  // asks a natural clarifying question instead of "I couldn't determine which
  // record you mean." If there's conversation context, it offers to use it.
  const hasContext =
    !!ctx.src.briefing.store.customers.length ||
    !!ctx.src.briefing.store.vehicles.length;
  const summary = hasContext
    ? "I'm not sure which one you mean. Could you tell me the customer's full name, or the vehicle's make and plate? For example, 'Tell me about Marcus Johnson' or 'What's going on with the Nissan Altima?'"
    : "I don't have any customers or vehicles on file yet to look that up. Once you've added some, I can pull up the details for any one of them.";
  return {
    ...base,
    answer_type: "fallback",
    summary,
  };
}

function dispatchEntityIntent(
  intent: CopilotIntent,
  entity: EntityRef,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  switch (intent) {
    case "customer_balance":
      return answerCustomerBalance(ctx.src, ctx.asOf, ctx.perms, entity);
    case "customer_summary":
      return answerCustomerSummary(ctx.src, ctx.asOf, ctx.perms, entity);
    case "customer_payment_status":
      return answerCustomerPaymentStatus(ctx.src, ctx.asOf, ctx.perms, entity);
    case "customer_rental_history":
      return answerCustomerRentalHistory(ctx.src, ctx.asOf, ctx.perms, entity);
    case "customer_damage_history":
      return answerCustomerDamageHistory(ctx.src, ctx.asOf, ctx.perms, entity);
    case "customer_violation_history":
      return answerCustomerViolationHistory(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        entity,
      );
    case "customer_compliance":
      return answerCustomerCompliance(ctx.src, ctx.asOf, ctx.perms, entity);
    case "vehicle_status":
      return answerVehicleSummary(ctx.src, ctx.asOf, ctx.perms, entity);
    case "vehicle_unavailable_reason":
      return answerVehicleUnavailableReason(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        entity,
      );
    case "vehicle_utilization":
      return answerVehicleUtilization(ctx.src, ctx.asOf, ctx.perms, entity);
    case "vehicle_profitability":
      return answerVehicleProfitability(ctx.src, ctx.asOf, ctx.perms, entity);
    case "vehicle_history":
      return answerVehicleHistory(ctx.src, ctx.asOf, ctx.perms, entity);
    case "vehicle_maintenance_history":
      return answerVehicleMaintenanceHistory(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        entity,
      );
    case "rental_status":
      return answerRentalReadiness(ctx.src, ctx.asOf, ctx.perms, entity);
    case "case_for_entity":
      return answerCaseForEntity(entity, ctx);
    case "booking_request_summary":
      return answerBookingRequestSummary(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        entity.label,
      );
    default: {
      // Build #52 — defense entity intents delegate to the focused module.
      if (DEFENSE_ENTITY_INTENTS.has(intent)) {
        return (
          dispatchDefenseEntityIntent(intent, entity, query, ctx) ??
          unsupportedAnswer(intent, ctx.asOf, ctx.perms)
        );
      }
      return unsupportedAnswer(intent, ctx.asOf, ctx.perms);
    }
  }
}

function dispatchCompanyIntent(
  intent: CopilotIntent,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  return dispatchCompanyIntentImpl(intent, ctx);
}

/** Update conversation context after a resolved query. Build #33 also tracks
 *  the prior intent + prior result ids so "tell me more about that" and
 *  follow-up filters can re-resolve the prior answer. Pure derivation from the
 *  answer + resolved entity — no new source of truth.
 *
 *  `entity` is the resolved entity ref (customer/vehicle/rental) for the
 *  current turn, or null for company-wide intents. */
export function updateConversationContext(
  conversation: CopilotConversation,
  answer: CopilotAnswer,
  entity: EntityRef | null,
): CopilotConversation {
  return {
    ...conversation,
    context_prior_intent: answer.intent,
    context_prior_result_ids: answer.items.map((i) => i.id),
    context_customer_id:
      entity?.type === "customer"
        ? entity.id
        : (conversation.context_customer_id ?? null),
    context_vehicle_id:
      entity?.type === "vehicle"
        ? entity.id
        : (conversation.context_vehicle_id ?? null),
    context_rental_id:
      entity?.type === "rental"
        ? entity.id
        : (conversation.context_rental_id ?? null),
    context_label: entity?.label ?? conversation.context_label ?? null,
  };
}

// ---------------------------------------------------------------------------
// LLM provider layer
// ---------------------------------------------------------------------------
//
// A pluggable LLM classification layer that runs
// BEFORE the deterministic engine. When a provider is connected and returns a
// high-confidence VALIDATED classification, the engine uses the LLM's intent +
// scope + time range + semantic entity hints, then re-runs the EXISTING
// deterministic entity resolution + dispatch + handlers (via
// copilotLlmDispatch). The LLM never computes values and never returns trusted
// ids. In every other case it falls back to the synchronous deterministic
// resolveCopilotQuery — unchanged behavior.
// ---------------------------------------------------------------------------

/** The async query resolver. Tries the LLM classification layer first; on a
 *  valid high-confidence classification it dispatches through the existing
 *  handlers (with deterministic entity resolution). Otherwise it falls back to
 *  the synchronous deterministic engine. */
export async function resolveCopilotQueryAsync(
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): Promise<CopilotAnswer> {
  const llmContext: LlmConversationContext =
    buildLlmConversationContext(conversation);
  let classification: LlmClassification | null = null;
  try {
    classification = await classifyWithLlm(query, llmContext);
  } catch {
    classification = null;
  }
  if (classification) {
    try {
      return dispatchLlmClassification(
        classification,
        query,
        conversation,
        ctx,
      );
    } catch {
      // Any dispatch failure → deterministic fallback (never a hard error).
    }
  }
  return resolveCopilotQuery(query, conversation, ctx);
}

/** Optional LLM natural-language phrasing. May REWORD the structured answer
 *  but may NOT change numbers / invent facts / add recommendations / remove
 *  warnings / alter permission results. The structured answer remains
 *  authoritative. On any failure, returns the deterministic spoken text. */
export async function phraseCopilotAnswerAsync(
  answer: CopilotAnswer,
  deterministicSpoken: string,
): Promise<string> {
  const { getActiveCopilotLlmProvider, isCopilotLlmConnected } =
    await import("./copilotLlmProvider");
  if (!isCopilotLlmConnected()) return deterministicSpoken;
  const provider = getActiveCopilotLlmProvider();
  if (!provider.summarizeStructuredAnswer) return deterministicSpoken;
  try {
    const phrased = await provider.summarizeStructuredAnswer(answer);
    if (typeof phrased !== "string" || !phrased.trim())
      return deterministicSpoken;
    return phrased;
  } catch {
    return deterministicSpoken;
  }
}
