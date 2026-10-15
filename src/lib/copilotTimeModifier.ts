// Connect Pro Fleet — Copilot time-modifier follow-up.
//
// A bare time phrase ("today", "this week", "this month") after a prior
// question is often a FOLLOW-UP MODIFIER, not a new question. Example:
//   User: "What's the most popular vehicle in my fleet?"
//   User: "today"
//   → interpreted as "What's the most popular vehicle in my fleet today?"
//
// This module detects a bare time modifier and, when the prior turn's intent
// is known, re-runs that intent with the new time range applied. It only fires
// when the phrase is ESSENTIALLY just a time modifier (no new question words),
// so "what's due today" is never hijacked.
//
// Pure + deterministic. No network, no secrets, no LLM.

import type { CopilotConversation, CopilotIntent } from "./copilotTypes";

export type TimeRangeKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year";

/** Phrases that are essentially just a time modifier (no new question). */
const BARE_TIME_MODIFIERS: Array<{ re: RegExp; key: TimeRangeKey }> = [
  { re: /^\s*today\s*\??$/i, key: "today" },
  { re: /^\s*yesterday\s*\??$/i, key: "yesterday" },
  { re: /^\s*this week\s*\??$/i, key: "this_week" },
  { re: /^\s*last week\s*\??$/i, key: "last_week" },
  { re: /^\s*this month\s*\??$/i, key: "this_month" },
  { re: /^\s*last month\s*\??$/i, key: "last_month" },
  { re: /^\s*this year\s*\??$/i, key: "this_year" },
];

/** Question words that mean the phrase is a NEW question, not a modifier. */
const QUESTION_WORDS =
  /\b(what|who|which|how|show|list|give|tell|why|when|where|are|is|do|does|did|can|could)\b/i;

/** Detect a bare time-modifier follow-up. Returns the time key when the query
 *  is essentially just a time phrase AND there is a prior intent to re-run;
 *  otherwise null. */
export function detectTimeModifier(
  query: string,
  conversation: CopilotConversation,
): TimeRangeKey | null {
  const q = query.trim();
  if (!q) return null;
  // A new-question word means it's a real question, not a bare modifier.
  if (QUESTION_WORDS.test(q)) return null;
  const prior = conversation.context_prior_intent;
  if (!prior || prior === "unsupported") return null;
  for (const m of BARE_TIME_MODIFIERS) {
    if (m.re.test(q)) return m.key;
  }
  return null;
}

/** Intents whose answer is meaningfully affected by a time range, so a time
 *  modifier is a sensible follow-up. For intents not in this set, a bare time
 *  phrase is treated as a new (unsupported) turn rather than re-running. */
const TIME_SENSITIVE_INTENTS = new Set<CopilotIntent>([
  "popular_vehicle",
  "vehicle_utilization",
  "fleet_utilization",
  "vehicle_profitability",
  "earnings_summary",
  "deposit_summary",
  "finance_overview",
  "historical_returns",
  "vehicle_additions",
  "active_rentals",
  "recent_changes",
  "fleet_performance",
  "business_summary",
  "weekly_review",
]);

/** Whether re-running the prior intent with a new time range is meaningful. */
export function isTimeSensitiveIntent(intent: CopilotIntent): boolean {
  return TIME_SENSITIVE_INTENTS.has(intent);
}
