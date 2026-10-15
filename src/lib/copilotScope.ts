// Connect Pro Fleet — Copilot query-scope resolution.
//
// Before dispatching an intent, the engine determines the SCOPE of a vehicle
// question: fleet-wide aggregate vs a single record. The classic failure is a
// generic "What's my utilization?" silently resolving to the first matching
// vehicle. This module makes that decision explicit + deterministic.
//
// Scope rules:
//   - A specific vehicle is named (make/model/year/plate/VIN in the query) OR
//     the active conversation context clearly identifies one → SINGLE_RECORD.
//   - Fleet-wide phrasing ("my utilization", "fleet utilization", "all
//     vehicles", "overall utilization", "current utilization") with no named
//     vehicle → FLEET_WIDE.
//   - Otherwise → AMBIGUOUS (the caller falls back to the existing behavior).
//
// Pure + deterministic. No network, no secrets, no LLM.

import type { CopilotSources, EntityRef } from "./copilotTypes";
import { resolveEntities } from "./copilotResolver";

export type QueryScope = "fleet_wide" | "single_record" | "ambiguous";

/** Phrases that explicitly request a FLEET-WIDE aggregate. When present (and no
 *  specific vehicle is named), the scope is fleet-wide. */
const FLEET_WIDE_PHRASES: RegExp[] = [
  /\bmy (utilization|fleet utilization|overall utilization|current utilization)\b/i,
  /\bfleet utilization\b/i,
  /\boverall utilization\b/i,
  /\bcurrent utilization\b/i,
  /\b(all of|all my|all of my) (the )?vehicles\b/i,
  /\bof all of my vehicles\b/i,
  /\bfleet[- ]wide\b/i,
  /\bthe (whole|entire) fleet\b/i,
  /\bfleet (size|performance|health|utilization)\b/i,
];

/** Determine the scope of a vehicle question.
 *  - `query`: the user's question (already wake-stripped by the caller).
 *  - `conversation`: the active conversation (for single-vehicle context).
 *  - `src`: sources (to detect a named vehicle).
 *  Returns SINGLE_RECORD only when a specific vehicle is resolvable; otherwise
 *  FLEET_WIDE when fleet phrasing is present; otherwise AMBIGUOUS. */
export function resolveVehicleScope(
  query: string,
  conversation: { context_vehicle_id?: string | null },
  src: CopilotSources,
): QueryScope {
  // 1. Is a specific vehicle named in the query?
  const { refs } = resolveEntities(query, src);
  const vehicle = refs.find((r) => r.type === "vehicle") as
    EntityRef | undefined;
  if (vehicle) return "single_record";

  // 2. Is there active single-vehicle context AND a pronoun/this-vehicle
  //    reference? ("what's its utilization", "this vehicle's utilization").
  //    Only bind to context when the query clearly refers to "it"/"this".
  if (conversation.context_vehicle_id) {
    const q = query.toLowerCase();
    if (
      /\b(its|this vehicle'?s?|that vehicle'?s?|the vehicle'?s?)\b/i.test(q)
    ) {
      return "single_record";
    }
  }

  // 3. Fleet-wide phrasing with no named vehicle → fleet-wide.
  if (FLEET_WIDE_PHRASES.some((p) => p.test(query))) return "fleet_wide";

  // 4. A bare "utilization" with no vehicle + no fleet phrase is ambiguous.
  return "ambiguous";
}
