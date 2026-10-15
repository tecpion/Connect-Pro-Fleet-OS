// Connect Pro Fleet — Copilot verification intent rules (V1 Customer Verification).
//
// Focused module holding the exact-phrase regex rules that map a normalized
// query to a verification intent. Extracted from copilotIntentRules.ts so that
// file stays under its size budget. Pure + deterministic — no network/secrets.
//
// Copilot distinguishes optional vs required; never reports an optional unrun
// check as a missing requirement.

import type { IntentRule } from "./copilotIntentRules";

export const VERIFICATION_INTENT_RULES: IntentRule[] = [
  {
    intent: "verification_blocked",
    patterns: [
      /\bwhich (rentals?|reservations?) (are )?blocked by verification\b/i,
      /\bblocked by (identity|license|mvr|background|verification)\b/i,
      /\bverification (block|blocker|blocking)\b/i,
      /\brequired verification pending\b/i,
    ],
  },
  {
    intent: "verification_needs_review",
    patterns: [
      /\bwhich (required )?(checks?|verifications?) (still )?need (staff )?review\b/i,
      /\bverification (needs?|need) review\b/i,
      /\bmvr needs? review\b/i,
    ],
  },
  {
    intent: "verification_expired_licenses",
    patterns: [
      /\bwhich customers? have expired (driver'?s? )?licen[cs]es?\b/i,
      /\bexpired (driver'?s? )?licen[cs]es?\b/i,
      /\blicen[cs]e expired\b/i,
    ],
  },
  {
    intent: "verification_usage",
    patterns: [
      /\bhow much verification usage\b/i,
      /\bverification usage (this )?month\b/i,
      /\bverification (cost|charges|spend) (this )?month\b/i,
    ],
  },
  {
    intent: "verification_customer_summary",
    patterns: [
      /\bdoes .+ need (identity )?verification\b/i,
      /\bhas mvr been run for .+\b/i,
      /\bwhen was .+'s last verification\b/i,
      /\btell me about .+'s verification\b/i,
      /\bverification (for|about) .+\b/i,
    ],
  },
  {
    intent: "verification_no_history",
    patterns: [
      /\bwhich customers? have no verification history\b/i,
      /\bno verification (history|records?)\b/i,
    ],
  },
];
