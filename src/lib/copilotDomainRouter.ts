// Connect Pro Fleet — Copilot domain-first intent routing (Build #47).
//
// Problem this solves: the fuzzy synonym matcher could jump from raw text
// straight to an unrelated final intent on weak similarity. "how much do I have
// in deposits this year" matched fleet_count (because "how many"/"have"/"fleet"
// keywords overlapped). "do I have any open task" matched fleet_count. "do I have
// any overdue rentals" matched overdue_accounts (payment overdue) instead of
// overdue_returns (rental overdue).
//
// This module adds a DOMAIN-FIRST layer that runs BEFORE the generic fuzzy
// matcher. It classifies a query into a domain using STRONG anchors, then
// resolves the specific intent within that domain. Collision rules keep
// rental-overdue and payment-overdue strictly separate, and "deposit"/"task"
// anchors force their own domains so they can never bleed into fleet_count.
//
// The layer is deterministic + pure. It only WIDENS correct routing — it never
// invents data, bypasses approvals, or exposes restricted financials. When
// domain confidence is genuinely weak, it returns null so the caller falls
// through to the existing regex rules / conversational unsupported answer
// (never a wrong confident answer).
//
// Pipeline (in the resolver):
//   1. normalizeSpeechQuery (STT repair)
//   2. INTENT_RULES (exact regex)
//   3. resolveDomainIntent  ← THIS MODULE (strong-anchor domain routing)
//   4. resolveFuzzyIntent   (looser synonym fallback)
//   5. unsupported

import type { CopilotIntent } from "./copilotTypes";
import {
  startOfDayInTz,
  endOfDayInTz,
  startOfWeekInTz,
  startOfMonthInTz,
  startOfYearInTz,
  endOfMonthInTz,
  zonedDateTimeParts,
  getOrgTimezone,
} from "./timezone";

/** A domain anchor: a strong keyword/phrase that pins a query to a domain.
 *  Anchors are intentionally NARROW so a weak overlap (e.g. "have" alone) can
 *  never trigger a domain. Multi-word anchors match as substrings; single words
 *  match as whole words. */
interface DomainRule {
  domain: string;
  /** Strong anchors — at least one must be present to consider this domain. */
  anchors: RegExp[];
  /** Within the domain, route to this intent when a sub-pattern matches.
   *  Evaluated in order; first match wins. If none match, the domain's
   *  `defaultIntent` is used (or null to defer). */
  routes: Array<{ intent: CopilotIntent; patterns: RegExp[] }>;
  /** Default intent when the domain is anchored but no sub-route matches. */
  defaultIntent: CopilotIntent | null;
}

const DOMAIN_RULES: DomainRule[] = [
  // --- TASKS (strong "task" anchor → never fleet_count) ---
  {
    domain: "tasks",
    anchors: [/\btask\b/i, /\btasks\b/i, /\bto-?do\b/i, /\bto do\b/i],
    routes: [
      {
        intent: "overdue_tasks",
        patterns: [
          /\boverdue\s+task/i,
          /\blate\s+task/i,
          /\btasks?\s+(due|overdue)/i,
        ],
      },
      {
        intent: "my_priorities",
        patterns: [
          /\bmy\s+(tasks|work|priorities)\b/i,
          /\bwhat should i work on\b/i,
        ],
      },
      {
        intent: "needs_assignment",
        patterns: [/\b(unassigned|needs?\s+assignment|assign)\b/i],
      },
    ],
    defaultIntent: "open_tasks",
  },

  // --- DEPOSITS (strong "deposit" anchor → never fleet_count) ---
  {
    domain: "deposits",
    anchors: [
      /\bdeposit\b/i,
      /\bdeposits\b/i,
      /\bsecurity deposit\b/i,
      /\bheld deposit\b/i,
    ],
    routes: [],
    defaultIntent: "deposit_summary",
  },

  // --- EARNINGS / FINANCE (earn/revenue/profit/collected/contribution) ---
  {
    domain: "finance",
    anchors: [
      /\bearn\b/i,
      /\bearnings\b/i,
      /\brevenue\b/i,
      /\bprofit\b/i,
      /\bprofitable\b/i,
      /\bcollect(ed|ions)?\b/i,
      /\bcontribution\b/i,
      /\bhow much.*(make|made|earn|collect)\b/i,
      /\bhow much.*money\b/i,
    ],
    routes: [
      // Single-vehicle profitability only when a vehicle is clearly referenced.
      {
        intent: "vehicle_profitability",
        patterns: [
          /\bprofit\w*\s+(of|for|on)\s+.*(car|vehicle|truck|suv|jeep|nissan|toyota|hyundai|chevy|chevrolet|ford|honda)\b/i,
          /\bhow profitable\b/i,
        ],
      },
      {
        intent: "fleet_performance",
        patterns: [
          /\b(underperforming|lowest performing|worst vehicle|best vehicle)\b/i,
        ],
      },
    ],
    defaultIntent: "earnings_summary",
  },

  // --- RENTAL OVERDUE vs PAYMENT OVERDUE (collision rule) ---
  // Rental overdue: the VEHICLE/RENTAL is past its scheduled return.
  {
    domain: "rental_overdue",
    anchors: [
      /\boverdue\s+(rental|return|car|vehicle)\b/i,
      /\blate\s+(return|rental)\b/i,
      /\brental\s+(past due|overdue)\b/i,
      /\bvehicle not returned\b/i,
      /\bnot returned\b/i,
      /\breturns?\s+(overdue|past due|late)\b/i,
      /\boverdue\s+returns?\b/i,
      /\bany overdue rentals\b/i,
    ],
    routes: [],
    defaultIntent: "overdue_returns",
  },
  // Payment overdue: the CUSTOMER owes money past the payment cutoff.
  {
    domain: "payment_overdue",
    anchors: [
      /\blate\s+payment/i,
      /\boverdue\s+(payment|balance|account|invoice)/i,
      /\bpast\s+due\s+payment/i,
      /\bwho\s+(hasn'?t|has not)\s+paid\b/i,
      /\bhasn'?t paid\b/i,
      /\bunpaid\b/i,
      /\bbehind\s+on\s+payments?\b/i,
      /\banybody\s+behind\b/i,
      /\banyone\s+behind\b/i,
      /\bwho\s+owes\s+me\b/i,
      /\bowes\s+me\s+money\b/i,
      /\bdo i have any late payments\b/i,
      /\bany late payments\b/i,
    ],
    routes: [],
    defaultIntent: "overdue_accounts",
  },

  // --- ACTIVE RENTALS (rental domain count, NOT vehicle status) ---
  // "How many active rentals do I have?" → active_rentals. This MUST precede
  // fleet_count so "rentals" is never treated as "rented vehicles". A vehicle-
  // status count ("how many vehicles are currently rented") has no "rental"
  // noun and falls through to fleet_count below.
  {
    domain: "active_rentals",
    anchors: [
      /\bhow many (active\s+)?rentals?\b/i,
      /\bactive rentals?\b/i,
      /\bnumber of (active\s+)?rentals?\b/i,
      /\brentals? (do|are) (i|we) (have|currently)\b/i,
    ],
    routes: [],
    defaultIntent: "active_rentals",
  },

  // --- HISTORICAL RETURNS (completed returns in a time range) ---
  // "How many returns have I had last week?" → historical_returns. This MUST
  // precede the rentals_returning_today regex rule (handled in INTENT_RULES)
  // and the fleet_count domain. Anchored on "returns" + a past-tense / had /
  // time-range signal so "what returns are due today" is NOT swallowed.
  {
    domain: "historical_returns",
    anchors: [
      /\breturns?\s+(have|had|did|i|we)\b/i,
      /\bhow many returns\b/i,
      /\breturns?\s+(last|this)\s+(week|month|year)\b/i,
      /\breturns?\s+yesterday\b/i,
      /\breturns?\s+completed\b/i,
      /\bcompleted returns?\b/i,
    ],
    routes: [],
    defaultIntent: "historical_returns",
  },

  // --- RECENT CHANGES / OPERATIONAL HISTORY ("what happened last week") ---
  // "What happened last week?" / "what happened yesterday?" → recent_changes,
  // scoped to the detected time range. Anchored on "what happened" + a time
  // phrase so it does not swallow "what's happening today" (briefing).
  {
    domain: "recent_changes",
    anchors: [
      /\bwhat happened\b/i,
      /\bwhat.*happened\b/i,
      /\b(last|this)\s+(week|month|year)'?s rundown\b/i,
      /\bgive me last\b/i,
    ],
    routes: [],
    defaultIntent: "recent_changes",
  },

  // --- VEHICLE ADDITIONS (vehicles acquired/added in a time range) ---
  {
    domain: "vehicle_additions",
    anchors: [
      /\b(new|added|acquired)\s+(cars?|vehicles?)\b/i,
      /\b(cars?|vehicles?)\s+(added|acquired)\b/i,
      /\bnew (cars?|vehicles?)\s+(were|added|acquired)\b/i,
    ],
    routes: [],
    defaultIntent: "vehicle_additions",
  },

  // --- FINANCE OVERVIEW (explicit "finance overview" / "financial overview") ---
  // Distinct from the earnings domain: "give me a finance overview" is a broad
  // request for the financial picture, not a single "how much did I earn".
  {
    domain: "finance_overview",
    anchors: [
      /\bfinance overview\b/i,
      /\bfinancial overview\b/i,
      /\bgive me a? finance\b/i,
      /\bfinance summary\b/i,
      /\boverview of (my )?(finances|income|revenue)\b/i,
      /\bincome (overview|summary)\b/i,
    ],
    routes: [],
    defaultIntent: "finance_overview",
  },

  // --- CREATE REMINDER / TASK (action intent — prepare, never auto-create) ---
  // "Remind me in 1 hour to call Marcus" / "remind me tomorrow to follow up".
  // Anchored on "remind me" / "create a task" / "set a reminder". Routes to
  // create_reminder which PREPARES a task preview for approval (never mutates).
  {
    domain: "create_reminder",
    anchors: [
      /\bremind me\b/i,
      /\bset a reminder\b/i,
      /\bcreate a (task|reminder)\b/i,
      /\bi want you to remind\b/i,
      /\bremind (me|him|her|them)?\s.*(in|tomorrow|on|at)\b/i,
    ],
    routes: [],
    defaultIntent: "create_reminder",
  },

  // --- FLEET UTILIZATION (utilization anchor → fleet-wide unless a vehicle named) ---
  // Note: single-vehicle redirect is handled by the engine's scope model
  // (copilotScope) AFTER intent resolution, so here a bare "utilization" routes
  // to fleet_utilization and the engine downgrades to vehicle_utilization only
  // when a specific vehicle is resolved.
  {
    domain: "fleet_utilization",
    anchors: [
      /\butilization\b/i,
      /\butilised\b/i,
      /\butilized\b/i,
      /\bbeing used\b/i,
    ],
    routes: [],
    defaultIntent: "fleet_utilization",
  },

  // --- POPULAR / BEST VEHICLE (ranking, never fleet_count) ---
  {
    domain: "popular_vehicle",
    anchors: [
      /\bmost popular\b/i,
      /\bpopular vehicle\b/i,
      /\bbest (performing|rented)\b/i,
      /\btop (rented|performing)\b/i,
      /\bmost rented\b/i,
      /\brented most\b/i,
      /\bmost often rented\b/i,
      /\bmost rental days\b/i,
      /\bhighest utilization\b/i,
    ],
    routes: [],
    defaultIntent: "popular_vehicle",
  },

  // --- FLEET COUNT (only genuine count/size questions) ---
  {
    domain: "fleet_count",
    anchors: [
      /\bhow many (cars?|vehicles?)\b/i,
      /\bfleet size\b/i,
      /\bwhat'?s my fleet size\b/i,
      /\bcount of (cars?|vehicles?)\b/i,
      /\brented vs\.? available\b/i,
      /\brented versus available\b/i,
      /\bhow many.*(rented|available)\b/i,
    ],
    routes: [],
    defaultIntent: "fleet_count",
  },
];

/** Detect the time range a query references, if any. Used by the earnings /
 *  deposit / finance / historical handlers to pick the right period. Returns
 *  null when no time phrase is present (the caller defaults appropriately). */
export type DomainTimeRange =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year";

export function detectDomainTimeRange(query: string): DomainTimeRange | null {
  const q = query.toLowerCase();
  if (/\bthis year\b/.test(q) || /\bthis calendar year\b/.test(q))
    return "this_year";
  if (/\blast month\b/.test(q)) return "last_month";
  if (/\bthis month\b/.test(q)) return "this_month";
  if (/\blast week\b/.test(q)) return "last_week";
  if (/\bthis week\b/.test(q)) return "this_week";
  if (/\byesterday\b/.test(q)) return "yesterday";
  if (/\btoday\b/.test(q)) return "today";
  return null;
}

/** Resolve a DomainTimeRange to an absolute {start, end} window anchored on
 *  `asOf`. Handles the past ranges the profitability helper does not
 *  (yesterday, last_week) using the organization's configured timezone (`tz`,
 *  resolved through `getOrgTimezone` → UTC safe default) for day/week/month/
 *  year boundaries. Pure + deterministic. */
export function resolveDomainRange(
  range: DomainTimeRange,
  asOf: Date,
  tz?: string,
): { start: Date; end: Date } {
  const DAY = 86_400_000;
  const z = getOrgTimezone(tz);
  const sod = (d: Date) => startOfDayInTz(d, z);
  const eod = (d: Date) => endOfDayInTz(d, z);
  switch (range) {
    case "today":
      return { start: sod(asOf), end: eod(asOf) };
    case "yesterday": {
      const y = new Date(asOf.getTime() - DAY);
      return { start: sod(y), end: eod(y) };
    }
    case "this_week": {
      return {
        start: startOfWeekInTz(asOf, z),
        end: eod(asOf),
      };
    }
    case "last_week": {
      const thisWeekStart = startOfWeekInTz(asOf, z);
      const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY);
      const lastWeekEnd = new Date(thisWeekStart.getTime() - DAY);
      return { start: sod(lastWeekStart), end: eod(lastWeekEnd) };
    }
    case "this_month":
      return {
        start: startOfMonthInTz(asOf, z),
        end: eod(asOf),
      };
    case "last_month": {
      const thisMonthStart = startOfMonthInTz(asOf, z);
      const start = startOfMonthInTz(
        new Date(thisMonthStart.getTime() - DAY),
        z,
      );
      return { start, end: endOfMonthInTz(start, z) };
    }
    case "this_year":
      return {
        start: startOfYearInTz(asOf, z),
        end: eod(asOf),
      };
  }
}

/** A human label for a DomainTimeRange (customer-facing, no internal keys). */
export function domainRangeLabel(range: DomainTimeRange): string {
  switch (range) {
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "this_week":
      return "this week";
    case "last_week":
      return "last week";
    case "this_month":
      return "this month";
    case "last_month":
      return "last month";
    case "this_year":
      return "this year";
  }
}

/** Domain-first intent resolution. Returns a CopilotIntent when a strong domain
 *  anchor is present (and the sub-route/default applies), or null to defer to
 *  the next layer. Deterministic: rules are evaluated in declaration order; the
 *  first anchored domain wins. */
export function resolveDomainIntent(query: string): CopilotIntent | null {
  const q = query.toLowerCase();
  if (!q.trim()) return null;
  for (const rule of DOMAIN_RULES) {
    if (!rule.anchors.some((a) => a.test(q))) continue;
    // Domain is anchored. Try sub-routes first.
    for (const route of rule.routes) {
      if (route.patterns.some((p) => p.test(q))) return route.intent;
    }
    if (rule.defaultIntent) return rule.defaultIntent;
  }
  return null;
}
