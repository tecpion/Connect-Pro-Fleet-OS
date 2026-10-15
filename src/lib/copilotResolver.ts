// Connect Pro Fleet — Copilot intent + entity resolution (Build #29).
//
// `resolveCopilotIntent` maps natural-language variants to a deterministic
// intent. `resolveEntities` finds known customers/vehicles/rentals by name,
// plate, VIN, make/model, or rental number. Ambiguous matches are returned as a
// disambiguation answer (never a guess). A lightweight conversation context
// resolves pronouns ("he"/"she"/"it"/"this one") to the last selected entity.

import type {
  CopilotAnswer,
  CopilotIntent,
  CopilotSources,
  CopilotViewerPermissions,
  EntityRef,
} from "./copilotTypes";
import { baseAnswer, plural } from "./copilotShared";
import { stripWakePhrase } from "./copilotConversational";
import { normalizeSpeechQuery, resolveFuzzyIntent } from "./copilotNormalizer";
import { resolveDomainIntent } from "./copilotDomainRouter";
import { INTENT_RULES } from "./copilotIntentRules";
import { VERIFICATION_INTENT_RULES } from "./copilotVerificationIntentRules";
import { TOLL_INTENT_RULES } from "./copilotTollIntentRules";

// ---------------------------------------------------------------------------
// Intent resolution
// ---------------------------------------------------------------------------

/** Resolve a natural-language query to a deterministic intent. A leading wake
 *  phrase ("Hey Copilot", "Hi Copilot", "Copilot", …) is stripped before
 *  matching so "Hey Copilot, what should I focus on?" routes to the operational
 *  intent rather than unsupported. The visible user transcript is preserved by
 *  the caller.
 *
 *  Build #45 — the query is first run through normalizeSpeechQuery() to repair
 *  common speech-to-text homophones ("ideal"/"idol" → "idle") and strip filler
 *  words, so the exact regex rules match more often. If the regex rules still
 *  return "unsupported", a fuzzy synonym-group matcher (resolveFuzzyIntent)
 *  catches natural phrasings the exact rules miss ("do I have any late
 *  payments", "how many cars do I have", "briefing"). Only when BOTH layers
 *  fail does the query fall through to the conversational unsupported answer. */
export function resolveCopilotIntent(query: string): CopilotIntent {
  const stripped = stripWakePhrase(query).trim() || query.trim();
  if (!stripped) return "unsupported";
  // Build #45 — normalize STT errors + filler words before regex matching.
  const q = normalizeSpeechQuery(stripped) || stripped;
  // V1 Customer Verification rules (kept in a focused module). Evaluated
  // alongside the main rules so verification intents route deterministically.
  // V1 Tolls & Violations Automation rules (focused module) evaluated together.
  for (const rule of [
    ...INTENT_RULES,
    ...VERIFICATION_INTENT_RULES,
    ...TOLL_INTENT_RULES,
  ]) {
    if (rule.patterns.some((p) => p.test(q))) return rule.intent;
  }
  // Build #47 — domain-first routing with STRONG anchors. Runs before the
  // looser fuzzy matcher so "deposit"/"task"/"overdue rental" anchors force
  // their own domain and can never bleed into fleet_count or overdue_accounts.
  // Collision rules keep rental-overdue and payment-overdue strictly separate.
  const domain = resolveDomainIntent(q);
  if (domain) return domain;
  // Build #45 — fuzzy synonym-group fallback before "unsupported".
  return resolveFuzzyIntent(q);
}

// ---------------------------------------------------------------------------
// Entity resolution
// ---------------------------------------------------------------------------

export interface EntityResolution {
  refs: EntityRef[];
  ambiguous: boolean;
}

/** Find customers/vehicles/rentals mentioned in the query. Returns multiple
 *  matches as ambiguous (caller shows disambiguation). */
export function resolveEntities(
  query: string,
  src: CopilotSources,
): EntityResolution {
  const s = src.briefing.store;
  const refs: EntityRef[] = [];
  const seen = new Set<string>();

  const add = (ref: EntityRef) => {
    const key = `${ref.type}:${ref.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push(ref);
    }
  };

  // Customers — match by full name or partial name.
  const q = query.toLowerCase();
  for (const c of s.customers) {
    const name = s.customerName(c.id).toLowerCase();
    if (!name) continue;
    const parts = name.split(/\s+/).filter((p) => p.length > 2);
    const hitsName =
      name.includes(q) ||
      parts.some((p) => q.includes(p)) ||
      (q.includes(name) && name.length > 3);
    if (hitsName) {
      add({ type: "customer", id: c.id, label: s.customerName(c.id) });
    }
  }

  // Vehicles — match by plate, VIN, or make/model/year.
  for (const v of s.vehicles) {
    const plate = (v.license_plate ?? "").toLowerCase();
    const vin = (v.vin ?? "").toLowerCase();
    const mm = `${v.year} ${v.make} ${v.model}`.toLowerCase();
    const hit =
      (plate && q.includes(plate)) ||
      (vin && q.includes(vin)) ||
      (mm &&
        (q.includes(mm) ||
          q.includes(`${v.make.toLowerCase()} ${v.model.toLowerCase()}`)));
    if (hit) {
      add({
        type: "vehicle",
        id: v.id,
        label: `${v.year} ${v.make} ${v.model} (${v.license_plate})`,
      });
    }
  }

  // Rentals — match by rental number / id.
  const rentalMatch = q.match(/\b(?:rental|#)\s*([a-z0-9_-]+)/i);
  if (rentalMatch) {
    const token = rentalMatch[1];
    for (const r of s.rentals) {
      if (
        r.id.toLowerCase() === token ||
        r.agreement_number?.toLowerCase() === token ||
        r.id.toLowerCase().includes(token)
      ) {
        add({
          type: "rental",
          id: r.id,
          label: `Rental ${r.agreement_number ?? r.id}`,
        });
      }
    }
  }

  // Ambiguity: more than one customer OR more than one vehicle of the same type.
  const customers = refs.filter((r) => r.type === "customer");
  const vehicles = refs.filter((r) => r.type === "vehicle");
  const ambiguous = customers.length > 1 || vehicles.length > 1;

  return { refs, ambiguous };
}

/** Resolve a pronoun/follow-up to the conversation's current entity context. */
export function resolveFollowUpEntity(
  query: string,
  context: {
    context_customer_id?: string | null;
    context_vehicle_id?: string | null;
    context_rental_id?: string | null;
  },
  src: CopilotSources,
): EntityRef | null {
  const q = query.toLowerCase();
  const s = src.briefing.store;
  // Build #44 — pronoun + "that" reference detection. Bare "that" is only
  // treated as a pronoun reference in follow-up constructions ("tell me more
  // about that", "what about that", "explain that", "more about that") so it
  // does NOT false-positive as a determiner ("What's that vehicle?"). This lets
  // a user say "Can you tell me more about that?" and bind to the immediately
  // prior subject — preserving entity/context memory while intent
  // classification stays fresh every turn.
  const hasPronoun =
    /\b(he|she|they|it|this one|that one|this customer|this vehicle|this rental|them)\b/i.test(
      q,
    ) ||
    /\b(?:tell me (?:more )?about|more about|what about|explain|elaborate on|go on about)\s+that\b/i.test(
      q,
    ) ||
    /^(?:about|more about|what about)\s+that\b/i.test(q);
  if (!hasPronoun) return null;
  if (context.context_customer_id) {
    return {
      type: "customer",
      id: context.context_customer_id,
      label: s.customerName(context.context_customer_id),
    };
  }
  if (context.context_vehicle_id) {
    const v = s.vehicles.find((x) => x.id === context.context_vehicle_id);
    if (v)
      return {
        type: "vehicle",
        id: v.id,
        label: `${v.year} ${v.make} ${v.model} (${v.license_plate})`,
      };
  }
  if (context.context_rental_id) {
    const r = s.rentals.find((x) => x.id === context.context_rental_id);
    if (r)
      return {
        type: "rental",
        id: r.id,
        label: `Rental ${r.agreement_number ?? r.id}`,
      };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Disambiguation answer
// ---------------------------------------------------------------------------

export function disambiguationAnswer(
  options: EntityRef[],
  intent: CopilotIntent,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(intent, asOf, perms, "derived");
  // Build #43 — natural disambiguation. "I found two customers named Marcus.
  // Do you mean Marcus Johnson or Marcus Williams?" instead of a robotic
  // "I found multiple matches: X, Y. Which one do you mean?"
  const noun = options[0]?.type === "vehicle" ? "vehicles" : "customers";
  const labels = options.map((o) => o.label);
  const list =
    labels.length === 2 ? `${labels[0]} or ${labels[1]}` : labels.join(", ");
  const summary = `I found ${labels.length === 1 ? "one" : labels.length} ${noun} matching that. Do you mean ${list}?`;
  return {
    ...base,
    answer_type: "disambiguation",
    summary,
    options: options.map((o) => ({
      entity_type: o.type,
      entity_id: o.id,
      label: o.label,
    })),
    caveats: ["Ambiguous entity — please select one to continue."],
  };
}

/** Help answer — supported categories. */
export function helpAnswer(
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("help", asOf, perms, "deterministic");
  return {
    ...base,
    answer_type: "help",
    summary:
      "I can answer questions about customers, rentals, payments, vehicles, maintenance, compliance, damage, violations, and today's operations.",
    facts: [
      {
        label: "Daily ops",
        value: "What should I focus on? · Today's summary · What changed?",
      },
      {
        label: "Money",
        value: "Who owes me today? · Who's late? · Broken arrangements",
      },
      {
        label: "Rentals",
        value: "Starting today · Returns today · Overdue returns",
      },
      {
        label: "Fleet",
        value: "Idle cars · Blocked vehicles · Why unavailable? · Utilization",
      },
      {
        label: "Customers",
        value: "Summary · Balance · Damage/violation history · Compliance",
      },
      {
        label: "Compliance",
        value: "Attention · Expiring documents · Blocked by compliance",
      },
      {
        label: "Staff",
        value: "My priorities · Needs assignment · Overdue tasks",
      },
    ],
    caveats: [
      "Phase 1 answers are deterministic and grounded in Fleet data — no LLM is called.",
    ],
  };
}

/** Unsupported-query fallback. Build #43 — conversational, not robotic.
 *  Instead of "I couldn't match X to a supported question", Fleet Copilot
 *  speaks like an operations manager: it acknowledges the ask and offers a
 *  couple of concrete things it CAN help with. This is the message users hear
 *  in Voice Mode when nothing routes — it must never sound like a hard error. */
export function unsupportedAnswer(
  query: string,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("unsupported", asOf, perms, "deterministic");
  return {
    ...base,
    answer_type: "fallback",
    summary:
      "I'm not quite sure how to help with that one yet. I can give you a rundown of the fleet, tell you who owes money, flag blocked or idle vehicles, or prep reminders and tasks. What would you like to look at?",
    facts: [],
    // Build #45 — no developer/debug text in the customer-facing answer. The
    // unmatched-query echo is internal-only; it is never shown or spoken.
    caveats: [],
  };
}

export { plural };
