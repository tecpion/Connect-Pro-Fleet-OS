// Connect Pro Fleet — Copilot Edge Function: server-side validation.
//
// Mirrors src/lib/copilotLlmClassifier.ts validateLlmClassification. The server
// NEVER trusts model output simply because JSON parsing succeeded. Invalid
// classifications return null so the frontend falls back to the deterministic
// engine.
//
// This is a Deno module (runs in the Edge Function). It intentionally duplicates
// the validation sets rather than importing from the browser bundle — the
// browser bundle is not available in the Deno runtime, and keeping the validator
// standalone keeps the Edge Function deployable in isolation.

export type DomainTimeRange =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year";

export type LlmScope =
  | "fleet_wide"
  | "company_wide"
  | "location"
  | "list"
  | "specific_record";

export type LlmRequestType =
  | "aggregate_metric"
  | "count"
  | "list"
  | "ranking"
  | "status"
  | "specific_record"
  | "summary"
  | "historical_activity"
  | "create_action"
  | "follow_up";

export type LlmHintType = "customer" | "vehicle" | "rental";

export interface LlmEntityHint {
  type: LlmHintType;
  customerName?: string;
  makeOrModel?: string;
  plate?: string;
  vin?: string;
  rentalNumber?: string;
}

export interface LlmClassification {
  intent: string;
  entityHints: LlmEntityHint[];
  scope: LlmScope;
  timeRange: DomainTimeRange | null;
  requestType: LlmRequestType;
  confidence: number;
}

/** Minimum confidence the engine trusts. Below this, return null. */
export const LLM_CONFIDENCE_THRESHOLD = 0.6;

const VALID_SCOPES = new Set<LlmScope>([
  "fleet_wide",
  "company_wide",
  "location",
  "list",
  "specific_record",
]);

const VALID_REQUEST_TYPES = new Set<LlmRequestType>([
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
]);

const VALID_TIME_RANGES = new Set<DomainTimeRange>([
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
]);

const VALID_HINT_TYPES = new Set<LlmHintType>([
  "customer",
  "vehicle",
  "rental",
]);

/** Fields that look like internal database ids — always stripped. The LLM may
 *  never supply trusted ids; the deterministic Fleet resolver chooses records. */
const ID_FIELDS = new Set([
  "id",
  "entity_id",
  "customer_id",
  "vehicle_id",
  "rental_id",
  "task_id",
  "payment_id",
  "deposit_id",
  "invoice_id",
  "reservation_id",
]);

function sanitizeEntityHints(hints: unknown): LlmEntityHint[] {
  if (!Array.isArray(hints)) return [];
  const out: LlmEntityHint[] = [];
  for (const raw of hints) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const type = h.type;
    if (!type || !VALID_HINT_TYPES.has(type as LlmHintType)) continue;
    // Reject any hint carrying an internal id — drop the id field, keep semantic.
    const hint: LlmEntityHint = { type: type as LlmHintType };
    if (typeof h.customerName === "string" && h.customerName.trim())
      hint.customerName = h.customerName.trim();
    if (typeof h.makeOrModel === "string" && h.makeOrModel.trim())
      hint.makeOrModel = h.makeOrModel.trim();
    if (typeof h.plate === "string" && h.plate.trim())
      hint.plate = h.plate.trim();
    if (typeof h.vin === "string" && h.vin.trim()) hint.vin = h.vin.trim();
    if (typeof h.rentalNumber === "string" && h.rentalNumber.trim())
      hint.rentalNumber = h.rentalNumber.trim();
    // If the hint ONLY carried an id (no semantic fields), drop it entirely.
    const hasSemantic =
      !!hint.customerName ||
      !!hint.makeOrModel ||
      !!hint.plate ||
      !!hint.vin ||
      !!hint.rentalNumber;
    const onlyId = Object.keys(h).every(
      (k) => k === "type" || ID_FIELDS.has(k),
    );
    if (!hasSemantic && onlyId) continue;
    out.push(hint);
  }
  return out;
}

/** Validate a raw model response into a trusted classification, or null.
 *  `allowedIntents` constrains the intent to the set the Fleet engine supports. */
export function validateClassification(
  raw: unknown,
  allowedIntents: string[],
): LlmClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const intent = c.intent;
  if (typeof intent !== "string") return null;
  if (!allowedIntents.includes(intent)) return null;

  const scope = c.scope;
  if (typeof scope !== "string" || !VALID_SCOPES.has(scope as LlmScope))
    return null;

  const requestType = c.requestType;
  if (
    typeof requestType !== "string" ||
    !VALID_REQUEST_TYPES.has(requestType as LlmRequestType)
  )
    return null;

  const timeRange = c.timeRange;
  if (
    timeRange !== null &&
    timeRange !== undefined &&
    (typeof timeRange !== "string" ||
      !VALID_TIME_RANGES.has(timeRange as DomainTimeRange))
  )
    return null;

  const confidence = Number(c.confidence);
  if (!Number.isFinite(confidence)) return null;
  if (confidence < LLM_CONFIDENCE_THRESHOLD) return null;
  if (confidence > 1) return null;

  const entityHints = sanitizeEntityHints(c.entityHints);

  return {
    intent,
    entityHints,
    scope: scope as LlmScope,
    timeRange: (timeRange ?? null) as DomainTimeRange | null,
    requestType: requestType as LlmRequestType,
    confidence,
  };
}
