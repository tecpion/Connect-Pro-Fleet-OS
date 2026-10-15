// Connect Pro Fleet — Copilot toll/violation intent rules (V1 Tolls & Violations
// Automation).
//
// Focused module holding the exact-phrase regex rules that map a normalized
// query to a toll/violation intent. Extracted so copilotIntentRules.ts stays
// under its size budget. Pure + deterministic — no network/secrets.
//
// Copilot uses possession matching; never infers responsibility without
// possession evidence.

import type { IntentRule } from "./copilotIntentRules";

export const TOLL_INTENT_RULES: IntentRule[] = [
  {
    intent: "tolls_unmatched",
    patterns: [
      /\bwhich tolls? (are )?unmatched\b/i,
      /\bunmatched (tolls?|tickets?)\b/i,
      /\btolls? (with )?no match\b/i,
    ],
  },
  {
    intent: "violations_need_review",
    patterns: [
      /\bwhich (violations?|tickets?) need review\b/i,
      /\bviolations? (need|needing) review\b/i,
      /\bwhat violations need (my )?attention\b/i,
    ],
  },
  {
    intent: "tolls_for_customer_rental",
    patterns: [
      /\bwhat tolls belong to .+'s? rental\b/i,
      /\btolls? (for|belonging to) .+'s? rental\b/i,
      /\bshow .+'s? (rental )?tolls?\b/i,
    ],
  },
  {
    intent: "toll_possession_at_event",
    patterns: [
      /\bwho had (this |the |that )?(vehicle|car) .+ when (this |the |that )?(ticket|toll|violation) (occurred|happened)\b/i,
      /\bwho had vehicle .+ when\b/i,
      /\bwho was renting (this |the |that )?(vehicle|car) .+ when\b/i,
    ],
  },
  {
    intent: "tolls_unrecovered",
    patterns: [
      /\bwhich tolls? (have |haven'?)?t? (been )?recovered\b/i,
      /\btolls? (have |haven'?)?not (been )?recovered\b/i,
      /\btolls? not (yet )?recovered\b/i,
      /\bunrecovered tolls?\b/i,
    ],
  },
  {
    intent: "tolls_paid_this_month",
    patterns: [
      /\bhow much (have we )?paid in tolls? (this )?month\b/i,
      /\btolls? paid this month\b/i,
      /\bcompany toll (cost|spend) this month\b/i,
    ],
  },
  {
    intent: "tolls_recovered_amount",
    patterns: [
      /\bhow much (have we )?recovered\b/i,
      /\btoll recovery (amount|total)\b/i,
      /\bhow much (in )?tolls? (have we )?recovered\b/i,
    ],
  },
  {
    intent: "violations_due_this_week",
    patterns: [
      /\bviolations? (due|due this week|due soon)\b/i,
      /\btickets? due this week\b/i,
      /\bshow (me )?violations? due this week\b/i,
    ],
  },
  {
    intent: "customers_disputed_violations",
    patterns: [
      /\bwhich customers? (have )?disputed (violations?|tickets?|tolls?)\b/i,
      /\bcustomers? (with )?disputed (violations?|tickets?|tolls?)\b/i,
      /\bwho (has|have) disputed (a )?(violation|ticket|toll)\b/i,
    ],
  },
];
