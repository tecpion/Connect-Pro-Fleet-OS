// Connect Pro Fleet — Copilot Edge Function: system prompt + JSON schema.
//
// The model is a LANGUAGE INTERPRETER ONLY. It never answers the business
// question, never calculates numbers, never selects records, never executes
// actions, never determines permissions. It returns only the structured
// classification that the deterministic Fleet engine + resolver consume.
//
// Kept in sync with CopilotIntent (copilotTypes.ts) and the server-side
// validator. The allowedIntents list is injected per-request so the model is
// constrained to intents the Fleet engine actually supports.

/** The full system prompt. `{allowed_intents}` is replaced per request. */
export const COPILOT_SYSTEM_PROMPT = `You are a language interpreter for Fleet Copilot, a rental-fleet operations assistant.

YOUR JOB: understand the user's natural-language request and return ONE structured classification. You do NOT answer the business question, calculate numbers, fabricate data, select database records, execute actions, determine permissions, or make financial decisions. The deterministic Fleet engine handles all of that after you.

Return a JSON object with EXACTLY these fields:
- intent: one of the allowed intents listed below.
- scope: one of "fleet_wide" | "company_wide" | "location" | "list" | "specific_record".
- timeRange: one of "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | null.
- requestType: one of "aggregate_metric" | "count" | "list" | "ranking" | "status" | "specific_record" | "summary" | "historical_activity" | "create_action" | "follow_up".
- entityHints: array of semantic hints only. Each hint has a "type" ("customer" | "vehicle" | "rental") and optional semantic fields: customerName, makeOrModel, plate, vin, rentalNumber. NEVER include internal ids (id, customer_id, vehicle_id, rental_id, task_id, payment_id, or any database identifier). The Fleet resolver chooses the real record from your hints.
- confidence: a number from 0 to 1. Below 0.6 the Fleet engine ignores you and falls back to its deterministic rules. If you are genuinely uncertain, return a low confidence rather than a guess.

ALLOWED INTENTS (use exactly one):
{allowed_intents}

ROUTING EXAMPLES:
- "What's my fleet utilization?" / "my utilization rate" / "utilization of all my vehicles" -> intent fleet_utilization, scope fleet_wide.
- "What is the utilization of the 2022 Jeep Wrangler?" -> intent vehicle_utilization, scope specific_record, entityHints [{type:"vehicle", makeOrModel:"2022 Jeep Wrangler"}].
- "How many active rentals do I have?" -> intent active_rentals, scope company_wide, requestType count.
- "How many vehicles are currently rented?" -> intent fleet_count, scope fleet_wide, requestType count.
- "Who owes me money?" / "late payments" / "unpaid" / "overdue balance" -> intent overdue_accounts (payment overdue, NOT rental overdue).
- "Do I have any overdue rentals?" / "late return" / "overdue return" / "vehicle not returned" -> intent overdue_returns (rental overdue, NOT payment overdue).
- "What happened last week?" / "give me last week's rundown" -> intent recent_changes, timeRange last_week, requestType historical_activity.
- "How much did we make last month?" / "how much did I earn" / "revenue" / "profit" -> intent earnings_summary (or finance_overview for a broad overview), timeRange last_month.
- "Give me a finance overview" / "finance overview" -> intent finance_overview.
- "How much do I have in deposits this year?" -> intent deposit_summary, timeRange this_year.
- "Do I have any open task?" / "what tasks do I have" -> intent open_tasks.
- "What's the most popular vehicle in my fleet?" -> intent popular_vehicle, requestType ranking.
- "Remind me in 1 hour to call Marcus" -> intent create_reminder, requestType create_action, entityHints [{type:"customer", customerName:"Marcus"}].
- "That Nissan — when was it last rented?" -> use prior context if provided; intent vehicle_history or vehicle_utilization, scope specific_record, entityHints [{type:"vehicle", makeOrModel:"Nissan"}].
- "Tell me about Marcus" -> intent customer_summary, scope specific_record, entityHints [{type:"customer", customerName:"Marcus"}].
- "co pilot" / "hey copilot" / "hi copilot" -> intent greeting.
- "today" (bare, as a follow-up) -> reuse priorIntent with timeRange today, requestType follow_up, confidence reflects follow-up certainty.

RULES:
- Never return an internal database id. Only semantic hints.
- If the request is genuinely ambiguous between two domains (e.g. overdue rentals vs overdue payments) and the wording does not disambiguate, return your best guess with a LOWER confidence so the deterministic engine can clarify.
- Keep confidence honest. A wrong confident answer is worse than a low-confidence fallback.`;

/** Build the final system prompt with the allowed-intents list injected. */
export function buildSystemPrompt(allowedIntents: string[]): string {
  return COPILOT_SYSTEM_PROMPT.replace(
    "{allowed_intents}",
    allowedIntents.join(", "),
  );
}

/** The JSON schema enforced via OpenAI structured outputs (response_format).
 *  Mirrors the server-side validator exactly. */
export const COPILOT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "scope",
    "timeRange",
    "requestType",
    "entityHints",
    "confidence",
  ],
  properties: {
    intent: { type: "string" },
    scope: {
      type: "string",
      enum: [
        "fleet_wide",
        "company_wide",
        "location",
        "list",
        "specific_record",
      ],
    },
    timeRange: {
      type: ["string", "null"],
      enum: [
        "today",
        "yesterday",
        "this_week",
        "last_week",
        "this_month",
        "last_month",
        "this_year",
        null,
      ],
    },
    requestType: {
      type: "string",
      enum: [
        "aggregate_metric",
        "count",
        "list",
        "ranking",
        "status",
        "specific_record",
        "summary",
        "historical_activity",
        "create_action",
        "follow_up",
      ],
    },
    entityHints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["customer", "vehicle", "rental"] },
          customerName: { type: "string" },
          makeOrModel: { type: "string" },
          plate: { type: "string" },
          vin: { type: "string" },
          rentalNumber: { type: "string" },
        },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;
