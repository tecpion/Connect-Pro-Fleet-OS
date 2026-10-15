// Connect Pro Fleet — Copilot LLM dispatch (Build #50).
//
// Focused module that dispatches a VALIDATED LlmClassification through the SAME
// authoritative handlers the deterministic engine uses. Kept separate from
// copilotEngine.ts so the engine file stays maintainable. Pure delegation —
// no new calculations, selectors, permissions, or safeguards.
//
// The LLM only supplies intent + scope + time range + semantic entity hints.
// Entity resolution is ALWAYS re-run by the deterministic Fleet resolver
// (resolveEntities / resolveFollowUpEntity). The LLM never returns trusted
// internal ids and can never bypass entity resolution.

import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotIntent,
  CopilotSources,
  EntityRef,
  LlmClassification,
} from "./copilotTypes";
import type { CopilotEngineContext } from "./copilotEngine";
import {
  resolveEntities,
  resolveFollowUpEntity,
  disambiguationAnswer,
  helpAnswer,
} from "./copilotResolver";
import { answerPopularVehicle } from "./copilotPopularVehicleHandler";
import { answerEarningsSummary } from "./copilotEarningsHandler";
import { answerFinanceOverview } from "./copilotFinanceOverviewHandler";
import {
  answerHistoricalReturns,
  answerVehicleAdditions,
} from "./copilotRentalHistoryHandlers";
import { answerCreateReminder } from "./copilotReminderHandler";
import { answerRecentChanges } from "./copilotDailyHandlers";
import { answerWhy, answerProductHelpHandoff } from "./copilotLaunchWhy";
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
import {
  answerCustomerSummary,
  answerCustomerPaymentStatus,
  answerCustomerRentalHistory,
  answerCustomerDamageHistory,
  answerCustomerViolationHistory,
  answerCustomerCompliance,
} from "./copilotCustomerHandlers";
import { dispatchCompanyIntent as dispatchCompanyIntentImpl } from "./copilotCompanyDispatch";
import { baseAnswer } from "./copilotShared";
import {
  answerAuthorizedDriverCheck,
  answerGenerateDocumentationPackage,
  answerRentalDefenseRecord,
  answerDriverAuthorizationCheck,
  answerReleaseInsuranceStatus,
  answerReleaseSafetyMaintenance,
  isLegalConclusionQuery,
  answerLegalConclusionRefusal,
} from "./copilotDefenseHandlers";
import {
  answerTelematicsVehicleLocation,
  answerTelematicsTripsForVehicle,
  answerTelematicsLastSeen,
  answerTelematicsSummaryFallback,
} from "./copilotTelematicsHandlers";

/** Intents that require a single entity ref (customer/vehicle/rental). Mirrors
 *  the set in copilotEngine.ts — kept in sync (a test asserts parity). */
export const ENTITY_INTENTS = new Set<CopilotIntent>([
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
  // Build #52 — defense entity-scoped intents.
  "authorized_driver_check",
  "generate_documentation_package",
  "rental_defense_record",
  "driver_authorization_check",
  "release_insurance_status",
  "release_safety_maintenance",
  // V1 Telematics — vehicle-scoped intents (location/trips/last-seen/summary).
  // Resolved against a vehicle entity (plate/unit/name); the handler uses the
  // raw query for plate/unit matching. Optional sources → graceful fallback.
  "telematics_vehicle_location",
  "telematics_trips_for_vehicle",
  "telematics_last_seen",
  "telematics_summary",
]);

/** Resolve LLM semantic entity hints into real EntityRefs using the EXISTING
 *  deterministic resolver. The LLM never supplies trusted ids — it only gives
 *  hints (name, make/model, plate, …) which the Fleet resolver matches against
 *  actual records. Ambiguous matches → disambiguation (never a guess). */
function resolveLlmEntityHints(
  hints: LlmClassification["entityHints"],
  src: CopilotSources,
): { refs: EntityRef[]; ambiguous: boolean } {
  const parts: string[] = [];
  for (const h of hints) {
    if (h.customerName) parts.push(h.customerName);
    if (h.makeOrModel) parts.push(h.makeOrModel);
    if (h.plate) parts.push(h.plate);
    if (h.vin) parts.push(h.vin);
    if (h.rentalNumber) parts.push(`rental ${h.rentalNumber}`);
  }
  if (parts.length === 0) return { refs: [], ambiguous: false };
  return resolveEntities(parts.join(" "), src);
}

/** Natural clarifying answer when an entity-scoped LLM intent can't resolve to
 *  a single record. Mirrors the deterministic engine's requireEntityAnswer. */
function requireEntityAnswer(
  intent: CopilotIntent,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const base = baseAnswer(intent, ctx.asOf, ctx.perms, "ai_assisted");
  return {
    ...base,
    answer_type: "fallback",
    summary:
      "I'm not sure which one you mean. Could you tell me the customer's full name, or the vehicle's make and plate? For example, 'Tell me about Marcus Johnson' or 'What's going on with the Nissan Altima?'",
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
    // Build #52 — defense entity-scoped intents. These use the historical
    // release snapshot / incident-driver fact, never current state, and never
    // produce a legal conclusion.
    case "authorized_driver_check":
      return answerAuthorizedDriverCheck(entity, ctx);
    case "generate_documentation_package":
      return answerGenerateDocumentationPackage(entity, query, ctx);
    case "rental_defense_record":
      return answerRentalDefenseRecord(entity, query, ctx);
    case "driver_authorization_check":
      return answerDriverAuthorizationCheck(entity, query, ctx);
    case "release_insurance_status":
      return answerReleaseInsuranceStatus(entity, query, ctx);
    case "release_safety_maintenance":
      return answerReleaseSafetyMaintenance(entity, query, ctx);
    // V1 Telematics — vehicle-scoped intents. The handler resolves the vehicle
    // by plate/unit from the raw query AND the resolved entity label.
    case "telematics_vehicle_location":
      return answerTelematicsVehicleLocation(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        query,
      );
    case "telematics_trips_for_vehicle":
      return answerTelematicsTripsForVehicle(
        ctx.src,
        ctx.asOf,
        ctx.perms,
        query,
      );
    case "telematics_last_seen":
      return answerTelematicsLastSeen(ctx.src, ctx.asOf, ctx.perms, query);
    case "telematics_summary":
      // Re-dispatch (no entity) → prompt for a vehicle. The first-turn intercept
      // below handles the raw query when the LLM resolves a vehicle entity.
      return answerTelematicsSummaryFallback(ctx.asOf, ctx.perms);
    default:
      return dispatchCompanyIntentImpl(intent, ctx);
  }
}

function dispatchCompanyIntent(
  intent: CopilotIntent,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  return dispatchCompanyIntentImpl(intent, ctx);
}

/** The entity type an entity-scoped intent wants to resolve. Defense intents
 *  (Build #52) are rental-scoped — they operate on a rental/release snapshot. */
function wantedEntityType(intent: CopilotIntent): EntityRef["type"] | null {
  if (intent.startsWith("customer")) return "customer";
  if (intent.startsWith("vehicle") || intent === "vehicle_unavailable_reason")
    return "vehicle";
  if (intent.startsWith("rental")) return "rental";
  // V1 Telematics — vehicle-scoped intents resolve a vehicle.
  if (
    intent === "telematics_vehicle_location" ||
    intent === "telematics_trips_for_vehicle" ||
    intent === "telematics_last_seen" ||
    intent === "telematics_summary"
  )
    return "vehicle";
  // Build #52 — defense entity intents resolve against a rental (or incident
  // for driver-authorization). The handlers accept either; the resolver prefers
  // a rental match.
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

/** Resolve the entity for an entity-scoped LLM intent, handling ambiguity +
 *  follow-up. Mirrors the deterministic engine's resolveEntityForIntent but
 *  seeds the search from LLM semantic hints first. */
function resolveEntityForLlmIntent(
  intent: CopilotIntent,
  query: string,
  classification: LlmClassification,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): { entity: EntityRef | null; answer: CopilotAnswer | null } {
  // 1. Follow-up pronoun → current conversation context.
  const followUp = resolveFollowUpEntity(query, conversation, ctx.src);
  if (followUp) return { entity: followUp, answer: null };

  // 2. LLM semantic hints → deterministic resolver.
  if (classification.entityHints.length > 0) {
    const { refs, ambiguous } = resolveLlmEntityHints(
      classification.entityHints,
      ctx.src,
    );
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
    // No match → natural clarification (do not guess).
    return { entity: null, answer: requireEntityAnswer(intent, ctx) };
  }

  // 3. No hints — fall back to the raw query through the deterministic resolver.
  const { refs, ambiguous } = resolveEntities(query, ctx.src);
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
  return { entity: null, answer: requireEntityAnswer(intent, ctx) };
}

/** Dispatch a VALIDATED LlmClassification through the SAME handlers the
 *  deterministic engine uses. Reuses the raw-query intercepts (earnings,
 *  finance_overview, historical_returns, …) so time-range + metric detection
 *  still works. */
export function dispatchLlmClassification(
  classification: LlmClassification,
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const { intent } = classification;
  let answer: CopilotAnswer;

  // Build #52 — legal-conclusion guard. The LLM may route a Graves/liability
  // question to a defense intent, but Copilot must NEVER assert a legal
  // conclusion. Intercept before dispatch and return a factual summary +
  // legal-review recommendation.
  if (isLegalConclusionQuery(query)) {
    const { entity } = resolveEntityForLlmIntent(
      intent,
      query,
      classification,
      conversation,
      ctx,
    );
    return {
      ...answerLegalConclusionRefusal(query, entity, ctx),
      confidence_type: "ai_assisted",
    };
  }

  // Raw-query intercepts (mirror resolveCopilotQuerySingle).
  if (intent === "popular_vehicle")
    answer = answerPopularVehicle(query, ctx.src, ctx.asOf, ctx.perms);
  else if (intent === "earnings_summary")
    answer = answerEarningsSummary(query, ctx.src, ctx.asOf, ctx.perms);
  else if (intent === "finance_overview")
    answer = answerFinanceOverview(query, ctx.src, ctx.asOf, ctx.perms);
  else if (intent === "historical_returns")
    answer = answerHistoricalReturns(query, ctx.src, ctx.asOf, ctx.perms);
  else if (intent === "vehicle_additions")
    answer = answerVehicleAdditions(query, ctx.src, ctx.asOf, ctx.perms);
  else if (intent === "create_reminder")
    answer = answerCreateReminder(query, ctx.src, ctx.asOf, ctx.perms);
  else if (intent === "recent_changes")
    answer = answerRecentChanges(
      ctx.src,
      ctx.asOf,
      ctx.perms,
      ctx.allowedLocationIds ?? [],
      query,
    );
  else if (intent === "why")
    answer = answerWhy(ctx.src, ctx.asOf, ctx.perms, conversation);
  else if (intent === "product_help_handoff")
    answer = answerProductHelpHandoff(query, ctx.asOf, ctx.perms);
  else if (intent === "help") answer = helpAnswer(ctx.asOf, ctx.perms);
  else if (ENTITY_INTENTS.has(intent)) {
    const { entity, answer: entAnswer } = resolveEntityForLlmIntent(
      intent,
      query,
      classification,
      conversation,
      ctx,
    );
    answer =
      entAnswer ??
      (entity
        ? dispatchEntityIntent(intent, entity, query, ctx)
        : requireEntityAnswer(intent, ctx));
  } else {
    answer = dispatchCompanyIntent(intent, ctx);
  }

  // Stamp the routing origin. Values/numbers/permissions are unchanged.
  return { ...answer, confidence_type: "ai_assisted" };
}
