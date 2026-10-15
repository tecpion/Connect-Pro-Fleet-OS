// Connect Pro Fleet — Copilot compound query handler (Build #40).
//
// A compound question asks about TWO distinct operational topics in one turn,
// e.g. "What's currently overdue and how many pickups did I have this week?"
// The single-intent resolver would pick one clause and ignore the other.
// This handler splits the query on coordinating conjunctions ("and"/"plus"/
// "also") between operational clauses, resolves EACH clause through the SAME
// deterministic engine, and merges the two structured answers into one.
//
// It does NOT create a new intelligence engine — it reuses resolveCopilotQuery
// for each sub-clause and composes the results. No business logic is duplicated.
//
// Rules:
//  - Only splits when BOTH clauses resolve to a real (non-unsupported, non-help,
//    non-disambiguation, non-fallback) company-wide intent. Entity-scoped
//    clauses are not split (a named entity + a second clause is rare and the
//    single-intent path handles it).
//  - Merges summaries, facts, items, sources, suggested_actions, caveats.
//  - The merged answer's intent is "compound_query" so the spoken formatter can
//    shape it conversationally (answer both parts, not a database read-out).
//  - Bounded: at most the first two clauses; ignores trailing fragments.

import type {
  CopilotAnswer,
  CopilotConversation,
  CopilotIntent,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { resolveCopilotIntent } from "./copilotResolver";
import { baseAnswer } from "./copilotShared";

export interface CopilotEngineContextLike {
  src: CopilotSources;
  asOf: Date;
  perms: CopilotViewerPermissions;
  staffId: string;
  tenantId: string;
  allowedLocationIds?: string[];
}

/** Intents that are NOT eligible for compound splitting (meta / entity / fallback). */
const NON_COMPOUNDABLE = new Set<CopilotIntent>([
  "help",
  "unsupported",
  "why",
  "product_help_handoff",
  "compound_query",
  "business_summary",
]);

/** Entity-scoped intents — never split (they need a named entity). */
const ENTITY_INTENTS_COMPOUND = new Set<CopilotIntent>([
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
]);

/** Split a compound query into candidate clauses on coordinating conjunctions.
 *  Only splits when the conjunction sits between two substantive clauses
 *  (not inside a phrase like "pickups and returns"). Returns [] when no split. */
export function splitCompoundClauses(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  // Split on " and ", " plus ", " also " when surrounded by word boundaries and
  // each side has at least 3 words (avoids splitting "pickups and returns").
  const parts = q
    .split(/\s+(?:and|plus|also)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return [];
  // Require each clause to have at least 3 words to avoid trivial fragments.
  const substantive = parts.filter((p) => p.split(/\s+/).length >= 3);
  if (substantive.length < 2) return [];
  return substantive.slice(0, 2);
}

/** Whether a query looks like a compound (two operational clauses joined by a
 *  conjunction) AND both clauses resolve to real company-wide intents. */
export function isCompoundQuery(query: string): { clauses: string[] } | null {
  const clauses = splitCompoundClauses(query);
  if (clauses.length < 2) return null;
  // Both clauses must resolve to a compoundable company-wide intent.
  for (const c of clauses) {
    const intent = resolveCopilotIntent(c);
    if (NON_COMPOUNDABLE.has(intent)) return null;
    if (ENTITY_INTENTS_COMPOUND.has(intent)) return null;
  }
  return { clauses };
}

/** Merge two structured answers into one compound answer. */
export function mergeAnswers(
  a: CopilotAnswer,
  b: CopilotAnswer,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("compound_query", asOf, perms, "derived");
  // Compose a conversational summary that addresses BOTH parts.
  const summary = `${a.summary} ${b.summary}`.trim();
  return {
    ...base,
    answer_type: "summary",
    summary,
    facts: [...a.facts, ...b.facts],
    items: [...a.items, ...b.items].slice(0, 25),
    sources: [...a.sources, ...b.sources].slice(0, 12),
    suggested_actions: [...a.suggested_actions, ...b.suggested_actions].slice(
      0,
      6,
    ),
    caveats: [...a.caveats, ...b.caveats],
  };
}

/** Resolve a compound query by splitting + resolving each clause through the
 *  existing engine, then merging. Returns null when the query is not compound
 *  (so the caller falls back to the single-intent path). */
export function answerCompoundQuery(
  query: string,
  conversation: CopilotConversation,
  ctx: CopilotEngineContextLike,
  resolveSingle: (
    q: string,
    conv: CopilotConversation,
    ctx: CopilotEngineContextLike,
  ) => CopilotAnswer,
): CopilotAnswer | null {
  const detected = isCompoundQuery(query);
  if (!detected) return null;
  const [clauseA, clauseB] = detected.clauses;
  const answerA = resolveSingle(clauseA, conversation, ctx);
  const answerB = resolveSingle(clauseB, conversation, ctx);
  // If either clause fell back to unsupported/fallback, this wasn't a real
  // compound question — let the single-intent path handle the whole query.
  if (
    answerA.answer_type === "fallback" ||
    answerA.intent === "unsupported" ||
    answerB.answer_type === "fallback" ||
    answerB.intent === "unsupported"
  ) {
    return null;
  }
  return mergeAnswers(answerA, answerB, ctx.asOf, ctx.perms);
}
