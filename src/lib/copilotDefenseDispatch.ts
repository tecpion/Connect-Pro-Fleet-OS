// Connect Pro Fleet — Copilot defense entity dispatch (Build #52).
//
// Focused module that dispatches the defense entity-scoped intents through the
// authoritative defense handlers. Kept out of copilotEngine.ts (which is at its
// size ceiling) so the engine stays maintainable. Pure delegation — no new
// calculations, selectors, permissions, or safeguards.
//
// Historical questions use the immutable Release Snapshot + incident-driver
// historical authorization — NOT current state. Never fabricates, never
// produces a legal conclusion.

import type { CopilotAnswer, CopilotIntent, EntityRef } from "./copilotTypes";
import type { CopilotEngineContext } from "./copilotEngine";
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
import { resolveEntities } from "./copilotResolver";

/** The defense entity-scoped intents handled here. */
export const DEFENSE_ENTITY_INTENTS = new Set<CopilotIntent>([
  "authorized_driver_check",
  "generate_documentation_package",
  "rental_defense_record",
  "driver_authorization_check",
  "release_insurance_status",
  "release_safety_maintenance",
]);

/** Dispatch a defense entity intent. Returns null when the intent is not a
 *  defense entity intent (so the caller can fall through to its default). */
export function dispatchDefenseEntityIntent(
  intent: CopilotIntent,
  entity: EntityRef,
  query: string,
  ctx: CopilotEngineContext,
): CopilotAnswer | null {
  switch (intent) {
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
    default:
      return null;
  }
}

/** Build #52 — legal-conclusion guard. Returns a factual-summary + legal-review
 *  answer when the query asks for a Graves/liability conclusion, else null so
 *  the caller proceeds normally. Resolves a rental entity (best-effort) so the
 *  summary can cite documentation status. */
export function maybeLegalConclusionAnswer(
  query: string,
  conversation: import("./copilotTypes").CopilotConversation,
  ctx: CopilotEngineContext,
): CopilotAnswer | null {
  if (!isLegalConclusionQuery(query)) return null;
  const { refs } = resolveEntities(query, ctx.src);
  const rental = refs.find((r) => r.type === "rental") ?? null;
  return answerLegalConclusionRefusal(query, rental, ctx);
}
