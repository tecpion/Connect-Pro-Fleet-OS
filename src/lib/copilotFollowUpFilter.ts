// Connect Pro Fleet — Copilot follow-up filter parsing + application (Build #33).
//
// Part XIX "wow feature": a user can ask "Who is overdue?", then "Only show the
// ones over $500", then "Which of those have payment arrangements?" — each
// follow-up filters the PRIOR result set rather than re-running the intent.
//
// The filter is parsed deterministically from the query (amount threshold, age,
// arrangement, location, class) and applied to the prior answer's items. It
// never stores raw sensitive answer content — only the prior intent, prior
// result ids, and the active filter (bounded to the last meaningful turn).
//
// Permission-aware: amounts are never revealed to a viewer who lacks financial
// permission, but the FILTER itself can still narrow the set (the user typed
// the threshold). The returned items keep their permission-gated amounts.

import type {
  CopilotAnswer,
  CopilotAnswerItem,
  CopilotConversation,
  CopilotFollowUpFilter,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, plural } from "./copilotShared";

/** Phrases that indicate a follow-up filter (not a new question). */
const FILTER_PHRASES = [
  /\bonly (show|include|list|the|those|these)\b/i,
  /\bjust (show|the|those|these)\b/i,
  /\bof those\b/i,
  /\bof these\b/i,
  /\bfilter\b/i,
  /\b(narrow|limit) (it|them|the list|down)\b/i,
];

/** Phrases that indicate a brand-new question (do NOT treat as a filter). */
const NEW_QUESTION_PHRASES = [
  /\bwhat\b/i,
  /\bwho\b/i,
  /\bwhich\b/i,
  /\bshow me\b/i,
  /\blist (all|every)\b/i,
  /\bhow (many|much)\b/i,
  /\bgive me\b/i,
  /\btell me\b/i,
];

/** Parse an amount threshold like "over $500", "more than 500", "> 200". */
function parseMinAmount(query: string): number | null {
  const m = query.match(
    /\b(?:over|more than|above|greater than|>|>=?)\s*\$?\s*([\d,]+(?:\.\d+)?)\b/i,
  );
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

/** Parse a days-late threshold like "more than 7 days", "over 7 days late". */
function parseMinDaysLate(query: string): number | null {
  const m = query.match(
    /\b(?:more than|over|older than|greater than|>)\s*(\d+)\s*(?:days?|d)\b/i,
  );
  if (!m) return null;
  const n = Number(m[1]);
  return isNaN(n) ? null : n;
}

/** Parse "have a payment arrangement" / "with arrangements". */
function parseHasArrangement(query: string): boolean | null {
  if (/\b(?:have|with|has) (?:a |an )?(?:payment )?arrangement\b/i.test(query))
    return true;
  if (/\bbroken arrangement\b/i.test(query)) return true;
  return null;
}

/** Parse a location name like "at Warren", "in Detroit". */
function parseLocationId(query: string, src: CopilotSources): string | null {
  const m = query.match(
    /\b(?:at|in|for)\s+([A-Za-z][A-Za-z\s]+?)(?:[.,?!]|$)/i,
  );
  if (!m) return null;
  const name = m[1].trim().toLowerCase();
  if (!name) return null;
  const loc = src.briefing.store.locations.find(
    (l) => (l.name ?? "").toLowerCase() === name,
  );
  return loc?.id ?? null;
}

/** Parse a vehicle class like "economy vehicles", "SUVs". */
function parseVehicleClass(query: string): string | null {
  const m = query.match(
    /\b(economy|compact|midsize|standard|full[- ]?size|suv|luxury|premium|van|truck|pickup)\b/i,
  );
  return m ? m[1].toLowerCase().replace(/[-\s]/g, "") : null;
}

/** Does this query look like a follow-up filter on a prior result? */
export function isFollowUpFilter(
  query: string,
  conversation: CopilotConversation,
): boolean {
  // Must have a prior result set to filter.
  if (!conversation.context_prior_intent) return false;
  if (!conversation.context_prior_result_ids?.length) return false;
  const q = query.trim();
  if (!q) return false;
  // A clear new-question phrase means it's a new question, not a filter.
  if (NEW_QUESTION_PHRASES.some((p) => p.test(q))) {
    // But "only show the ones..." overrides — it's explicitly a filter.
    if (FILTER_PHRASES.some((p) => p.test(q))) return true;
    return false;
  }
  return FILTER_PHRASES.some((p) => p.test(q));
}

/** Parse a follow-up filter from the query. Returns null if no filter found. */
export function parseFollowUpFilter(
  query: string,
  conversation: CopilotConversation,
  src: CopilotSources,
): CopilotFollowUpFilter | null {
  if (!isFollowUpFilter(query, conversation)) return null;
  const filter: CopilotFollowUpFilter = {};
  const minAmount = parseMinAmount(query);
  if (minAmount != null) filter.min_amount = minAmount;
  const minDays = parseMinDaysLate(query);
  if (minDays != null) filter.min_days_late = minDays;
  const hasArr = parseHasArrangement(query);
  if (hasArr != null) filter.has_arrangement = hasArr;
  const locId = parseLocationId(query, src);
  if (locId) filter.location_id = locId;
  const cls = parseVehicleClass(query);
  if (cls) filter.vehicle_class = cls;
  // If nothing parsed, it's not a real filter.
  const hasAny =
    filter.min_amount != null ||
    filter.min_days_late != null ||
    filter.has_arrangement != null ||
    filter.location_id != null ||
    filter.vehicle_class != null;
  return hasAny ? filter : null;
}

/** Apply a follow-up filter to a prior answer's items. Returns the filtered
 *  items (permission-aware: amounts stay gated, but the threshold still
 *  narrows the set using the real underlying amount). */
export function applyFollowUpFilter(
  items: CopilotAnswerItem[],
  filter: CopilotFollowUpFilter,
  conversation: CopilotConversation,
  src: CopilotSources,
): CopilotAnswerItem[] {
  // Resolve the prior full items (with amounts) from the briefing store so the
  // filter can use real values even when the prior answer gated amounts.
  const priorIds = new Set(conversation.context_prior_result_ids ?? []);
  const priorItems = items.filter((i) => priorIds.has(i.id));

  // Build a lookup of customer → has arrangement for the arrangement filter.
  let brokenCustomerIds: Set<string> | null = null;
  if (filter.has_arrangement) {
    brokenCustomerIds = new Set<string>();
    const arrangements = src.briefing.paymentArrangements ?? [];
    const installments = src.briefing.arrangementInstallments ?? [];
    for (const a of arrangements) {
      if (a.customer_id) brokenCustomerIds.add(a.customer_id);
    }
    // Also cover installments referencing arrangements.
    for (const ins of installments) {
      const a = arrangements.find((x) => x.id === ins.arrangement_id);
      if (a?.customer_id) brokenCustomerIds.add(a.customer_id);
    }
  }

  // Build a lookup of vehicle → class for the class filter. The Vehicle type
  // carries `vehicle_class_id` (not a class name), so resolve the class name
  // through the store's vehicleClasses table.
  let vehicleClassById: Map<string, string> | null = null;
  if (filter.vehicle_class) {
    vehicleClassById = new Map<string, string>();
    const classes = src.briefing.store.vehicleClasses ?? [];
    for (const v of src.briefing.store.vehicles) {
      const cls = classes.find((c) => c.id === v.vehicle_class_id);
      const name = (cls?.name ?? "").toLowerCase().replace(/[-\s]/g, "");
      vehicleClassById.set(v.id, name);
    }
  }

  return priorItems.filter((item) => {
    // Amount filter — use the item's amount (the prior handler set it; for
    // overdue it's the real amount even when display-gated, because the
    // overdue handler stores the raw amount and gates only in subtitle).
    if (filter.min_amount != null) {
      const amt = item.amount ?? 0;
      if (amt < filter.min_amount) return false;
    }
    // Days-late filter — derive from due_at vs asOf.
    if (filter.min_days_late != null) {
      const due = item.due_at ? new Date(item.due_at).getTime() : NaN;
      const asOfMs = Date.now();
      const days = isNaN(due)
        ? 0
        : Math.max(0, Math.round((asOfMs - due) / 86400000));
      if (days < filter.min_days_late) return false;
    }
    // Arrangement filter — match by customer id embedded in the item id or
    // by looking up the rental's customer.
    if (filter.has_arrangement && brokenCustomerIds) {
      // The prior overdue items encode customer via the source; we approximate
      // by checking if any prior overdue account's customer is in the set.
      // Since CopilotAnswerItem doesn't carry customer_id, we resolve via the
      // rental in the store.
      const rentalId = extractRentalId(item.id);
      if (rentalId) {
        const r = src.briefing.store.rentals.find((x) => x.id === rentalId);
        if (r && r.customer_id && brokenCustomerIds.has(r.customer_id))
          return true;
        return false;
      }
      return false;
    }
    // Location filter — resolve the item's vehicle/rental location.
    if (filter.location_id) {
      const rentalId = extractRentalId(item.id);
      const vehicleId = extractVehicleId(item);
      const loc = resolveItemLocation(src, item, rentalId, vehicleId);
      if (loc !== filter.location_id) return false;
    }
    // Vehicle class filter.
    if (filter.vehicle_class && vehicleClassById) {
      const vehicleId = extractVehicleId(item);
      if (!vehicleId) return false;
      const cls = vehicleClassById.get(vehicleId) ?? "";
      if (cls !== filter.vehicle_class) return false;
    }
    return true;
  });
}

function extractRentalId(itemId: string): string | null {
  // Overdue ids look like "billing:rental:<rentalId>:overdue:<periodId>".
  const m = itemId.match(/rental:([^:]+):/);
  return m ? m[1] : null;
}

function extractVehicleId(item: CopilotAnswerItem): string | null {
  // Idle/blocked vehicle items use the vehicle id as the item id prefix.
  return item.deep_link?.match(/\/vehicles\/([^/?#]+)/)?.[1] ?? null;
}

function resolveItemLocation(
  src: CopilotSources,
  item: CopilotAnswerItem,
  rentalId: string | null,
  vehicleId: string | null,
): string | null {
  // A rental carries no location id; resolve its vehicle's `location` name
  // (a free-text yard/branch) to a Location id via the store's locations.
  const locations = src.briefing.store.locations ?? [];
  const resolveVehicleLocation = (vId: string): string | null => {
    const v = src.briefing.store.vehicles.find((x) => x.id === vId);
    if (!v?.location) return null;
    const loc = locations.find(
      (l) => (l.name ?? "").toLowerCase() === v.location.toLowerCase(),
    );
    return loc?.id ?? null;
  };
  if (rentalId) {
    const r = src.briefing.store.rentals.find((x) => x.id === rentalId);
    if (r?.vehicle_id) {
      const locId = resolveVehicleLocation(r.vehicle_id);
      if (locId) return locId;
    }
  }
  if (vehicleId) {
    const locId = resolveVehicleLocation(vehicleId);
    if (locId) return locId;
  }
  return null;
}

/** Build the filtered answer from a prior answer + parsed filter. */
export function buildFilteredAnswer(
  priorAnswer: CopilotAnswer,
  filter: CopilotFollowUpFilter,
  conversation: CopilotConversation,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    conversation.context_prior_intent ?? "overdue_accounts",
    asOf,
    perms,
    "derived",
  );
  const filtered = applyFollowUpFilter(
    priorAnswer.items,
    filter,
    conversation,
    src,
  );
  const filterDesc = describeFilter(filter);
  return {
    ...base,
    intent: conversation.context_prior_intent ?? priorAnswer.intent,
    answer_type: "list",
    summary:
      filtered.length === 0
        ? `No results match "${filterDesc}".`
        : `${filtered.length} ${plural(filtered.length, "result")} match "${filterDesc}".`,
    facts: [{ label: "Matching", value: filtered.length }],
    items: filtered,
    sources: filtered.slice(0, 10).map((i) => ({
      source_module: priorAnswer.sources[0]?.source_module ?? "billing",
      entity_type: "rental",
      entity_id: i.id,
      label: i.title,
      deep_link: i.deep_link ?? undefined,
    })),
    suggested_actions: priorAnswer.suggested_actions,
    caveats: [
      `Filtered the prior result by ${filterDesc}. Ask a new question to start over.`,
    ],
  };
}

function describeFilter(filter: CopilotFollowUpFilter): string {
  const parts: string[] = [];
  if (filter.min_amount != null) parts.push(`over $${filter.min_amount}`);
  if (filter.min_days_late != null)
    parts.push(`more than ${filter.min_days_late} days late`);
  if (filter.has_arrangement) parts.push("has payment arrangement");
  if (filter.location_id) parts.push("location");
  if (filter.vehicle_class) parts.push(`${filter.vehicle_class} class`);
  return parts.join(", ") || "filter";
}
