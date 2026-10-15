// Connect Pro Fleet — Copilot query normalization + fuzzy intent matching
// (Build #45).
//
// Speech-to-text is noisy. Users say "longest idle vehicle" but the recognizer
// may transcribe "longest ideal Idol vehicle". Users drop filler words, use
// plurals, homophones, and ask the same operational question a dozen different
// ways. The regex intent rules in copilotResolver.ts are exact-phrase based, so
// a single mis-transcribed word routes a perfectly clear question to the
// "unsupported" fallback.
//
// This module adds TWO layers BEFORE the fallback:
//
//  1. normalizeSpeechQuery() — repairs common STT homophones + strips filler
//     words so the existing regex rules match more often. This runs FIRST, so
//     "what is my longest ideal Idol vehicle" becomes "what is my longest idle
//     idle vehicle" and the existing idle_vehicles rule fires.
//
//  2. resolveFuzzyIntent() — a synonym-group matcher that runs AFTER the regex
//     rules (only when they return "unsupported"). Each group is a set of
//     synonym keywords + a target intent. If the normalized query contains
//     enough of a group's keywords, it routes to that intent. This catches
//     "do I have any late payments", "who hasn't paid", "how many cars do I
//     have", "briefing", etc. that the exact-phrase rules miss.
//
// Both layers are deterministic, pure, and contain NO network/LLM. They only
// widen the existing deterministic routing — they never invent new data, never
// bypass approvals, and never expose restricted financials. If a query is
// genuinely ambiguous (no group matches with confidence), it still falls
// through to the conversational unsupported answer.

import type { CopilotIntent } from "./copilotTypes";

// ---------------------------------------------------------------------------
// 1. Speech-to-text repair
// ---------------------------------------------------------------------------

/** Common speech-recognition homophones / near-misses that break intent
 *  matching. Applied as whole-word replacements (case-insensitive) so normal
 *  words are not corrupted mid-string. Order matters: longer phrases first. */
const STT_REPLACEMENTS: Array<[RegExp, string]> = [
  // "ideal" / "idol" / "idle" confusion — the classic STT error for "idle".
  // "longest ideal Idol vehicle" → "longest idle idle vehicle".
  [/\bideal\b/gi, "idle"],
  [/\bidol\b/gi, "idle"],
  [/\bidle\b/gi, "idle"],
  // "ideal" sometimes transcribes "idol" as "ideal" — covered above.
  // "rental" / "rentals" sometimes heard as "rendle" / "rentle".
  [/\brendle\b/gi, "rental"],
  [/\brentles\b/gi, "rentals"],
  // "overdue" sometimes heard as "over do" / "overdo".
  [/\bover do\b/gi, "overdue"],
  [/\boverdo\b/gi, "overdue"],
  // "compliance" sometimes heard as "compliance" is fine; "compliant" too.
  // "maintenance" sometimes heard as "maintenence" / "maintnance".
  [/\bmaintenence\b/gi, "maintenance"],
  [/\bmaintnance\b/gi, "maintenance"],
  [/\bmaintainance\b/gi, "maintenance"],
  // "utilization" sometimes heard as "utilization" is fine.
  // "vehicles" sometimes heard as "vehicles" is fine; "veicles" / "vehciles".
  [/\bveicles\b/gi, "vehicles"],
  [/\bvehciles\b/gi, "vehicles"],
  // "customers" sometimes heard as "costumers" / "customres".
  [/\bcostumers\b/gi, "customers"],
  [/\bcustomres\b/gi, "customers"],
  // "payments" sometimes heard as "payment" is fine; "pay ments".
  [/\bpay ments\b/gi, "payments"],
  // "briefing" sometimes heard as "briefing" is fine; "breifing".
  [/\bbreifing\b/gi, "briefing"],
  // "fleet" sometimes heard as "fleet" is fine; "fleat" / "fleeet".
  [/\bfleat\b/gi, "fleet"],
  [/\bfleeet\b/gi, "fleet"],
];

/** Filler / hesitation words that add no intent signal. Removed so the
 *  remaining keywords are easier to match. Only removes whole-word fillers
 *  that appear mid-sentence, never the entire query. */
const FILLER_WORDS = [
  "um",
  "uh",
  "er",
  "ah",
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
  "actually",
  "literally",
  "honestly",
  "please",
  "hey",
];

/** Normalize a raw speech/query transcript for intent matching:
 *  - lowercase
 *  - repair common STT homophones
 *  - strip filler words
 *  - collapse whitespace + trailing punctuation
 *  The caller preserves the original visible transcript; this is for MATCHING
 *  only. */
export function normalizeSpeechQuery(query: string): string {
  let q = query.toLowerCase();
  // Repair STT homophones (whole-word).
  for (const [re, rep] of STT_REPLACEMENTS) {
    q = q.replace(re, rep);
  }
  // Strip filler words (whole-word, with surrounding spaces).
  for (const f of FILLER_WORDS) {
    q = q.replace(new RegExp(`\\b${f.replace(/\s+/g, "\\s+")}\\b`, "g"), " ");
  }
  // Collapse whitespace + strip trailing punctuation.
  q = q
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return q;
}

// ---------------------------------------------------------------------------
// 2. Fuzzy synonym-group intent matching (fallback before "unsupported")
// ---------------------------------------------------------------------------

interface FuzzyGroup {
  intent: CopilotIntent;
  /** Keywords that signal this intent. A query matches when it contains at
   *  least `minHits` distinct keywords from this group. Synonyms are listed
   *  together so different phrasings of the same operational question route
   *  to the same intent. */
  keywords: string[];
  minHits: number;
  /** Optional: require at least one of these "anchor" keywords to even
   *  consider the group (prevents weak overlaps). */
  requireAny?: string[];
}

const FUZZY_GROUPS: FuzzyGroup[] = [
  // --- Idle vehicles ---
  {
    intent: "idle_vehicles",
    minHits: 1,
    requireAny: [
      "idle",
      "sitting",
      "sit",
      "sitting around",
      "not rented",
      "hasn't rented",
      "hasnt rented",
      "unused",
    ],
    keywords: [
      "idle",
      "sitting",
      "sit",
      "longest",
      "vehicle",
      "car",
      "vehicles",
      "cars",
      "not rented",
      "hasn't rented",
      "hasnt rented",
      "not being used",
      "unused",
      "available",
    ],
  },
  // --- Late / overdue payments (collections) ---
  {
    intent: "overdue_accounts",
    minHits: 1,
    requireAny: ["late", "overdue", "behind", "hasn't paid", "unpaid", "owes"],
    keywords: [
      "late",
      "overdue",
      "past due",
      "behind",
      "hasn't paid",
      "havent paid",
      "unpaid",
      "owes",
      "owe",
      "payments",
      "payment",
      "anybody",
      "anyone",
      "who",
      "money",
      "collections",
      "collect",
    ],
  },
  // --- Fleet vehicle count / fleet size ---
  {
    intent: "fleet_count",
    minHits: 2,
    requireAny: [
      "how many",
      "fleet size",
      "count",
      "size",
      "in my fleet",
      "in the fleet",
      "do i have",
      "do we have",
    ],
    keywords: [
      "how many",
      "cars",
      "car",
      "vehicles",
      "vehicle",
      "fleet",
      "size",
      "count",
      "currently",
      "have",
      "own",
      "manage",
      "do i have",
      "in my fleet",
    ],
  },
  // --- Operational briefing ---
  {
    intent: "morning_ops_briefing",
    minHits: 1,
    requireAny: ["briefing", "rundown", "brief", "run down"],
    keywords: [
      "briefing",
      "brief",
      "rundown",
      "run down",
      "morning",
      "ops",
      "operational",
      "summary",
      "today",
      "give me",
    ],
  },
  // --- Recent changes ---
  {
    intent: "recent_changes",
    minHits: 1,
    requireAny: ["changed", "what's new", "whats new", "since yesterday"],
    keywords: [
      "changed",
      "change",
      "what's new",
      "whats new",
      "since yesterday",
      "recent",
      "new",
      "happened",
      "updates",
      "yesterday",
    ],
  },
  // --- Blocked vehicles ---
  {
    intent: "blocked_vehicles",
    minHits: 1,
    requireAny: ["blocked", "block", "can't rent", "cant rent", "can't go out"],
    keywords: [
      "blocked",
      "block",
      "can't rent",
      "cant rent",
      "cannot rent",
      "can't go out",
      "cant go out",
      "unavailable",
      "not available",
      "vehicles",
      "cars",
      "which",
    ],
  },
  // --- Maintenance ---
  {
    intent: "maintenance_attention",
    minHits: 1,
    requireAny: ["maintenance", "shop", "service", "repair", "work order"],
    keywords: [
      "maintenance",
      "shop",
      "service",
      "serviced",
      "repair",
      "repairs",
      "work order",
      "mechanic",
      "fix",
    ],
  },
  // --- Compliance ---
  {
    intent: "compliance_attention",
    minHits: 1,
    requireAny: ["compliance", "compliant", "expiring", "expire", "expired"],
    keywords: [
      "compliance",
      "compliant",
      "expiring",
      "expire",
      "expired",
      "registration",
      "insurance",
      "inspection",
      "documents",
      "license",
    ],
  },
  // --- Money due today ---
  {
    intent: "money_due_today",
    minHits: 2,
    requireAny: ["due", "owe", "pay", "money"],
    keywords: [
      "due",
      "owe",
      "owes",
      "pay",
      "payment",
      "payments",
      "money",
      "today",
      "who",
      "need",
      "needs",
    ],
  },
  // --- Returns today ---
  {
    intent: "rentals_returning_today",
    minHits: 2,
    requireAny: ["return", "returns", "due back", "drop off", "dropoff"],
    keywords: [
      "return",
      "returns",
      "returning",
      "due back",
      "drop off",
      "dropoff",
      "drop-offs",
      "today",
      "rentals",
      "rental",
    ],
  },
  // --- Starting today / pickups ---
  {
    intent: "rentals_starting_today",
    minHits: 2,
    requireAny: ["start", "starting", "pickup", "pick up", "checkout"],
    keywords: [
      "start",
      "starting",
      "pickup",
      "pick up",
      "pickups",
      "checkout",
      "check out",
      "today",
      "rentals",
      "rental",
    ],
  },
  // --- Overdue returns ---
  {
    intent: "overdue_returns",
    minHits: 2,
    requireAny: ["overdue", "late", "not returned"],
    keywords: [
      "overdue",
      "late",
      "not returned",
      "past",
      "return",
      "returns",
      "rental",
      "rentals",
      "due back",
    ],
  },
  // --- Executive focus / priorities ---
  {
    intent: "executive_focus",
    minHits: 2,
    requireAny: ["focus", "priority", "priorities", "attention", "handle"],
    keywords: [
      "focus",
      "priority",
      "priorities",
      "attention",
      "handle",
      "important",
      "urgent",
      "today",
      "should",
      "need",
      "needs",
      "handle",
    ],
  },
];

/** Count how many distinct keywords from `keywords` appear as whole words (or
 *  whole phrases for multi-word keywords) in the normalized query. */
function countKeywordHits(q: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (kw.includes(" ")) {
      // Multi-word phrase — look for it as a substring (already normalized).
      if (q.includes(kw)) hits++;
    } else {
      // Single word — whole-word match.
      if (new RegExp(`\\b${escapeRegex(kw)}\\b`).test(q)) hits++;
    }
  }
  return hits;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether the query contains at least one anchor keyword (whole word/phrase). */
function hasAnchor(q: string, anchors: string[] | undefined): boolean {
  if (!anchors || anchors.length === 0) return true;
  return anchors.some((a) =>
    a.includes(" ")
      ? q.includes(a)
      : new RegExp(`\\b${escapeRegex(a)}\\b`).test(q),
  );
}

/** Fuzzy synonym-group intent matching. Runs only when the exact regex rules
 *  returned "unsupported". Returns the best-matching intent, or "unsupported"
 *  when no group reaches its confidence threshold. Deterministic: groups are
 *  evaluated in declaration order; the first group that meets its threshold
 *  (anchor present + minHits reached) wins. */
export function resolveFuzzyIntent(query: string): CopilotIntent {
  const q = normalizeSpeechQuery(query);
  if (!q) return "unsupported";
  for (const group of FUZZY_GROUPS) {
    if (!hasAnchor(q, group.requireAny)) continue;
    const hits = countKeywordHits(q, group.keywords);
    if (hits >= group.minHits) return group.intent;
  }
  return "unsupported";
}
