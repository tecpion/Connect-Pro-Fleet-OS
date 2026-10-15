// Connect Pro Fleet — Copilot Voice Mode (Build #38 / #39 / #40 True Voice).
//
// buildCopilotSpokenResponse: converts a structured CopilotAnswer into concise,
// customer-safe, NATURAL conversational speech. This is the ONLY text that may
// be spoken aloud. The visual answer (cards/tables/sources) and the spoken
// answer are intentionally different: the spoken version is a concise
// conversational summary, not a read-out of the UI.
//
// Safety rules:
//  - Never speak source IDs, internal enum values, UUIDs, URLs, deep_link
//    paths, source_module keys, or technical metadata.
//  - Never speak raw amounts the viewer lacks permission to see. The engine
//    already gates financial facts/items to "—" when permission-filtered; the
//    formatter omits any "—"/null amount rather than reading "dash".
//  - Bounded lists: never read an entire 20-row result set. Summarize counts +
//    totals, name at most the top 3 by title, and say "You can review the full
//    list on screen."
//  - Per-answer intent shaping (morning briefing, overdue, money-left-on-table,
//    utilization, KPI pickup/return explanations) where the structure carries a
//    clear narrative; otherwise fall back to the summary line + top facts.
//
// Build #40 — natural speech:
//  - Money → "four thousand one hundred thirty-six dollars" (not "$4,136").
//  - Percentages → "sixty-two percent" (not "62%").
//  - Numbers → natural English words for small counts; grouped thousands for
//    large counts.
//  - Conversational phrasing: not a database report. Avoid "Current overdue
//    customers: zero" in favor of "You don't currently have anything overdue."
//  - No internal/technical/debug text: build numbers, route paths, selector
//    names, intent enum values, source_module keys never appear in speech.
//
// Pure + deterministic. No network, no secrets.

import type {
  CopilotAnswer,
  CopilotFact,
  CopilotViewerPermissions,
} from "./copilotTypes";

function isRedacted(v: string | number | null | undefined): boolean {
  return v === null || v === undefined || v === "" || v === "—";
}

// ---------------------------------------------------------------------------
// Number → natural spoken English (for money, counts, percentages)
// ---------------------------------------------------------------------------

const SMALL_NUMBERS: Record<number, string> = {
  0: "zero",
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
  11: "eleven",
  12: "twelve",
  13: "thirteen",
  14: "fourteen",
  15: "fifteen",
  16: "sixteen",
  17: "seventeen",
  18: "eighteen",
  19: "nineteen",
};

const TENS: Record<number, string> = {
  20: "twenty",
  30: "thirty",
  40: "forty",
  50: "fifty",
  60: "sixty",
  70: "seventy",
  80: "eighty",
  90: "ninety",
};

/** Convert a non-negative integer < 1000 to spoken English. */
function speakUnder1000(n: number): string {
  if (n < 20) return SMALL_NUMBERS[n] ?? String(n);
  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const rest = n % 10;
    if (rest === 0) return TENS[tens] ?? String(n);
    return `${TENS[tens] ?? String(tens)} ${SMALL_NUMBERS[rest] ?? rest}`;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const h = `${SMALL_NUMBERS[hundreds] ?? hundreds} hundred`;
  if (rest === 0) return h;
  return `${h} ${speakUnder1000(rest)}`;
}

/** Convert a non-negative integer to spoken English (up to billions). */
function speakNumber(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return `negative ${speakNumber(Math.abs(n))}`;
  if (n < 1000) return speakUnder1000(n);
  // For large numbers, use natural grouping ("4,136" → "four thousand, one
  // hundred thirty-six") but cap detail so speech isn't exhausting.
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    if (rest === 0) return `${speakUnder1000(thousands)} thousand`;
    return `${speakUnder1000(thousands)} thousand, ${speakUnder1000(rest)}`;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const thousands = Math.floor(rest / 1000);
    if (rest === 0) return `${speakUnder1000(millions)} million`;
    if (thousands === 0)
      return `${speakUnder1000(millions)} million, ${speakUnder1000(rest)}`;
    return `${speakUnder1000(millions)} million, ${speakUnder1000(thousands)} thousand`;
  }
  // Very large — fall back to grouped digits for readability.
  return n.toLocaleString("en-US");
}

/** Convert a dollar amount (number or currency string) to natural speech. */
function speakMoney(v: string | number | null | undefined): string | null {
  if (isRedacted(v)) return null;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "zero dollars";
  const abs = Math.abs(n);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100);
  let spoken =
    dollars === 0
      ? ""
      : `${speakNumber(dollars)} dollar${dollars === 1 ? "" : "s"}`;
  if (cents > 0) {
    spoken += spoken ? " and " : "";
    spoken += `${speakNumber(cents)} cent${cents === 1 ? "" : "s"}`;
  }
  if (!spoken) return null;
  return n < 0 ? `negative ${spoken}` : spoken;
}

/** Convert a percentage string/number to natural speech ("62%" → "sixty-two percent"). */
function speakPercent(v: string | number | null | undefined): string | null {
  if (isRedacted(v)) return null;
  const s = String(v).replace(/%/g, "").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return `${speakNumber(Math.round(n))} percent`;
}

/** Convert a count number to natural speech. Small counts use words; large use
 *  grouped digits. */
function speakCount(v: string | number | null | undefined): string {
  if (isRedacted(v)) return "none";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n <= 999) return speakNumber(Math.round(n));
  return n.toLocaleString("en-US");
}

/** Detect whether a value looks like a percentage (ends with % or the label
 *  hints at a percentage). */
function looksPercent(v: string | number, label: string): boolean {
  if (typeof v === "string" && v.includes("%")) return true;
  return /utili[li]z|health|score|rate|percent/i.test(label);
}

// ---------------------------------------------------------------------------

/** A clean spoken label from a fact label (title-case-ish, no ALL CAPS). */
function spokenLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

/** Strip internal/technical tokens from any value before it is spoken. This
 *  removes build references, route paths, selector names, source_module keys,
 *  UUIDs, and other developer-facing strings. */
function stripInternal(text: string): string {
  return (
    text
      // Build references like "Build #21", "Build #30".
      .replace(/\bBuild\s*#\d+\b/gi, "")
      // UUID-like tokens.
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "",
      )
      // Route paths.
      .replace(/\/[a-z][a-z0-9_-]*(?:\/[a-z0-9_-]+)+/gi, "")
      // snake_case / kebab-case technical identifiers.
      .replace(/\b(source_module|deep_link|entity_id|entity_type)\b/gi, "")
      .replace(/\b[a-z]+_[a-z_]+\b/g, (m) =>
        // Keep human-readable multi-word labels; strip obvious snake_case keys.
        m.includes("__") || /^(res_|agr_|veh_|cust_|task_|pay_)/.test(m)
          ? ""
          : m,
      )
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function topItemTitles(answer: CopilotAnswer, n: number): string[] {
  return answer.items
    .slice(0, n)
    .map((i) => stripInternal(i.title))
    .filter(Boolean);
}

/** Format the facts grid as spoken key/value sentences, skipping redacted
 *  financial values and technical labels. Handles money, percentages, and
 *  counts naturally. */
function spokenFacts(facts: CopilotFact[]): string[] {
  const out: string[] = [];
  for (const f of facts) {
    const label = spokenLabel(f.label);
    if (f.financial) {
      const money = speakMoney(f.value);
      if (money) out.push(`${label}: ${money}.`);
      continue;
    }
    if (isRedacted(f.value)) continue;
    if (looksPercent(f.value, label)) {
      const pct = speakPercent(f.value);
      if (pct) {
        out.push(`${label}: ${pct}.`);
        continue;
      }
    }
    out.push(`${label}: ${stripInternal(String(f.value))}.`);
  }
  return out;
}

/** Bounded list summary: count, optional total, top 3 names, screen reminder.
 *  Conversational rather than a database read-out. */
function spokenBoundedList(
  answer: CopilotAnswer,
  noun: string,
  totalLabel?: string,
): string {
  const count = answer.items.length;
  const names = topItemTitles(answer, 3);
  const parts: string[] = [];
  if (totalLabel) {
    const totalFact = answer.facts.find((f) => f.label === totalLabel);
    const money = totalFact ? speakMoney(totalFact.value) : null;
    if (money) parts.push(`owing a total of ${money}`);
  }
  if (count === 0) {
    return `You don't currently have any ${noun}.`;
  }
  const lead = `You have ${speakCount(count)} ${noun}${parts.length ? ` ${parts.join(", ")}` : ""}.`;
  if (names.length > 0) {
    const list = names.join(", ");
    return `${lead} The ${names.length === 1 ? "largest is" : "largest are"} ${list}. You can review the full list on screen.`;
  }
  return `${lead} You can review the full list on screen.`;
}

/** KPI / dashboard explanation answers carry a summary that already reads as a
 *  natural sentence. We clean any internal tokens and append a short facts tail. */
function spokenSummaryWithFacts(answer: CopilotAnswer): string {
  const summary = naturalizeInline(stripInternal(answer.summary));
  const tail = spokenFacts(answer.facts).join(" ");
  return tail ? `${summary} ${tail}`.trim() : summary;
}

// ---------------------------------------------------------------------------

/** The main entry point: turn a structured answer into safe spoken text. */
export function buildCopilotSpokenResponse(
  answer: CopilotAnswer,
  _perms?: CopilotViewerPermissions,
): string {
  // Disambiguation / fallback / help — read the summary only (no entity IDs).
  if (
    answer.answer_type === "disambiguation" ||
    answer.answer_type === "fallback" ||
    answer.answer_type === "help"
  ) {
    return stripInternal(answer.summary);
  }

  let result: string;
  switch (answer.intent) {
    case "morning_ops_briefing":
      result = spokenMorningBriefing(answer);
      break;
    case "executive_focus":
      result = spokenFocus(answer);
      break;
    case "overdue_accounts":
    case "collections_rank":
      result = spokenBoundedList(answer, "overdue customers", "Total overdue");
      break;
    case "money_left_on_table":
      result = spokenMoneyLeftOnTable(answer);
      break;
    case "vehicle_utilization":
    case "utilization_explanation":
      result = spokenUtilization(answer);
      break;
    case "rentals_starting_today":
    case "rentals_returning_today":
    case "overdue_returns":
      result = spokenRentalCounts(answer);
      break;
    case "idle_vehicles":
      result = spokenIdleVehicles(answer);
      break;
    case "fleet_count":
      result = spokenFleetCount(answer);
      break;
    case "fleet_utilization":
      result = spokenSummaryWithFacts(answer);
      break;
    case "earnings_summary":
    case "deposit_summary":
      result = spokenSummaryWithFacts(answer);
      break;
    case "open_tasks":
      result = spokenSummaryWithFacts(answer);
      break;
    case "compound_query":
      result = spokenCompound(answer);
      break;
    case "business_summary":
    case "weekly_review":
      result = spokenSummaryWithFacts(answer);
      break;
    case "daily_priorities":
    case "todays_summary":
    case "business_health":
    case "health_score_explanation":
    case "improve_health":
      result = spokenSummaryWithFacts(answer);
      break;
    default:
      result = spokenGeneric(answer);
  }
  // Final sweep: strip any internal/technical/debug tokens that slipped through.
  return stripInternal(result) || "I don't have anything to say about that.";
}

function spokenMorningBriefing(answer: CopilotAnswer): string {
  const facts = answer.facts;
  const critical = facts.find((f) => f.label === "Critical")?.value;
  const money = facts.find((f) => f.label === "Money items")?.value;
  const rentals = facts.find((f) => f.label === "Rental items")?.value;
  const fleet = facts.find((f) => f.label === "Fleet items")?.value;
  const parts: string[] = [];
  if (!isRedacted(critical) && Number(critical) > 0)
    parts.push(
      `${speakCount(critical)} critical issue${Number(critical) === 1 ? "" : "s"}`,
    );
  if (!isRedacted(money) && Number(money) > 0)
    parts.push(
      `${speakCount(money)} money item${Number(money) === 1 ? "" : "s"}`,
    );
  if (!isRedacted(rentals) && Number(rentals) > 0)
    parts.push(
      `${speakCount(rentals)} rental item${Number(rentals) === 1 ? "" : "s"}`,
    );
  if (!isRedacted(fleet) && Number(fleet) > 0)
    parts.push(
      `${speakCount(fleet)} fleet item${Number(fleet) === 1 ? "" : "s"}`,
    );
  const top = topItemTitles(answer, 1)[0];
  if (parts.length === 0) {
    return "Good morning. You have a clean slate right now — nothing urgent needs your attention.";
  }
  const lead = `Good morning. You have ${parts.join(", ")}.`;
  return top
    ? `${lead} Your highest-priority issue is ${top}. You can review the rest on screen.`
    : `${lead} You can review the rest on screen.`;
}

function spokenFocus(answer: CopilotAnswer): string {
  const count = answer.items.length;
  if (count === 0)
    return "You don't have any priorities right now. Everything's in good shape.";
  const names = topItemTitles(answer, 5);
  return `Your top ${speakCount(count)} ${count === 1 ? "priority" : "priorities"} to focus on: ${names.join("; ")}. You can review the full list on screen.`;
}

function spokenMoneyLeftOnTable(answer: CopilotAnswer): string {
  const known = answer.facts.find((f) => f.label === "Known Recoverable");
  const money = known ? speakMoney(known.value) : null;
  const idle = answer.facts.find(
    (f) => f.label === "Idle vehicles (opportunity)",
  )?.value;
  if (!money && isRedacted(idle))
    return "You don't currently have any recoverable money on the table.";
  if (!money) {
    return `Idle opportunity: ${speakCount(idle)} vehicles. Financial amounts are hidden. You can review the details on screen.`;
  }
  // Breakdown by item category (the items carry status === category).
  const byCat = new Map<string, number>();
  for (const it of answer.items) {
    if (it.amount == null) continue;
    byCat.set(
      it.status ?? "other",
      (byCat.get(it.status ?? "other") ?? 0) + it.amount,
    );
  }
  const breakdown = [...byCat.entries()]
    .filter(([, amt]) => amt > 0)
    .map(([cat, amt]) => `${speakMoney(amt)} from ${stripInternal(cat)}`)
    .join(", ");
  return breakdown
    ? `You currently have ${money} in known recoverable money: ${breakdown}. You can review the full list on screen.`
    : `You currently have ${money} in known recoverable money. You can review the full list on screen.`;
}

function spokenUtilization(answer: CopilotAnswer): string {
  // The summary already reads naturally ("Fleet utilization is 50%. 3 of 6
  // rentable vehicles are currently on rent..."). Convert inline money/
  // percentages/times to natural speech and clean internal tokens.
  return naturalizeInline(stripInternal(answer.summary));
}

function spokenRentalCounts(answer: CopilotAnswer): string {
  const count = answer.items.length;
  if (count === 0) {
    // Use the summary if it already reads naturally; otherwise a clean line.
    const s = stripInternal(answer.summary);
    return s || "You don't have any to look at right now.";
  }
  const names = topItemTitles(answer, 3);
  const lead = stripInternal(answer.summary);
  if (names.length === 0)
    return `${lead} You can review the full list on screen.`;
  return `${lead} The ${names.length === 1 ? "first is" : "first few are"} ${names.join(", ")}. You can review the full list on screen.`;
}

/** Idle vehicles — name the longest-idle vehicle by year/make/model + plate
 *  and its idle days, conversationally. Build #45. */
function spokenIdleVehicles(answer: CopilotAnswer): string {
  const count = answer.items.length;
  if (count === 0) return "You don't have any idle vehicles right now.";
  const longestFact = answer.facts.find((f) => f.label === "Longest idle");
  const longest = longestFact ? stripInternal(String(longestFact.value)) : "";
  const lead = `You have ${speakCount(count)} idle ${count === 1 ? "vehicle" : "vehicles"}.`;
  if (!longest || longest === "—")
    return `${lead} You can review the full list on screen.`;
  return `${lead} The longest is ${longest}. You can review the rest on screen.`;
}

/** Fleet count — "You currently have N vehicles in your fleet." Build #45. */
function spokenFleetCount(answer: CopilotAnswer): string {
  return naturalizeInline(stripInternal(answer.summary));
}

/** Compound query: the merged summary already addresses both parts. Clean it
 *  and convert any inline money/percentages to natural speech. */
function spokenCompound(answer: CopilotAnswer): string {
  const cleaned = stripInternal(answer.summary);
  return naturalizeInline(cleaned);
}

/** Convert inline money ($4,136), percentages (62%), and common time/date
 *  patterns in a sentence to natural spoken English. */
function naturalizeInline(text: string): string {
  return (
    text
      // Money: "$4,136" or "$4,136.50" → "four thousand one hundred thirty-six dollars"
      .replace(/\$([\d,]+(?:\.\d+)?)/g, (_, amt) => {
        const m = speakMoney(amt);
        return m ?? `$${amt}`;
      })
      // Percentages: "62%" → "sixty-two percent"
      .replace(/(\d+(?:\.\d+)?)%/g, (_, digits) => {
        const n = Number(digits);
        return Number.isFinite(n)
          ? `${speakNumber(Math.round(n))} percent`
          : `${digits} percent`;
      })
      // Times: "2:00 PM" / "2 PM" → "two PM"
      .replace(/\b(\d{1,2})(?::\d{2})?\s*(AM|PM|am|pm)\b/g, (_, hr, mer) => {
        const n = Number(hr);
        return `${speakNumber(n)} ${mer.toUpperCase()}`;
      })
      // Dates: "Sep 7, 2026" / "Sep 7" → "September seventh"
      .replace(
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/g,
        (_, mon, day, year) => {
          const month = MONTH_NAMES[mon.toLowerCase()];
          const daySpoken = speakOrdinal(Number(day));
          return year
            ? `${month} ${daySpoken}, ${speakNumber(Number(year))}`
            : `${month} ${daySpoken}`;
        },
      )
  );
}

const MONTH_NAMES: Record<string, string> = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

/** Speak an ordinal day ("7" → "seventh"). Used for dates. */
function speakOrdinal(n: number): string {
  const ordinals: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    5: "fifth",
    6: "sixth",
    7: "seventh",
    8: "eighth",
    9: "ninth",
    10: "tenth",
    11: "eleventh",
    12: "twelfth",
    13: "thirteenth",
    14: "fourteenth",
    15: "fifteenth",
    16: "sixteenth",
    17: "seventeenth",
    18: "eighteenth",
    19: "nineteenth",
    20: "twentieth",
    21: "twenty-first",
    22: "twenty-second",
    23: "twenty-third",
    24: "twenty-fourth",
    25: "twenty-fifth",
    26: "twenty-sixth",
    27: "twenty-seventh",
    28: "twenty-eighth",
    29: "twenty-ninth",
    30: "thirtieth",
    31: "thirty-first",
  };
  return ordinals[n] ?? speakNumber(n);
}

function spokenGeneric(answer: CopilotAnswer): string {
  const tail = spokenFacts(answer.facts).join(" ");
  const lead =
    naturalizeInline(stripInternal(answer.summary)) ||
    (answer.items.length > 0
      ? `${speakCount(answer.items.length)} result${answer.items.length === 1 ? "" : "s"}.`
      : "");
  return tail
    ? `${lead} ${tail}`.trim()
    : lead || "I don't have anything to say about that.";
}
