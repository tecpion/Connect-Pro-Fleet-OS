// Connect Pro Fleet — Copilot fleet-wide utilization handler.
//
// "What's my utilization?" / "Of all my vehicles, what's the current
// utilization?" — uses the EXISTING authoritative fleet-level utilization
// selector (buildFleetUtilizationSnapshot in executiveFleetSelectors), which
// sums per-vehicle rented/rentable days with merged blockers so one
// vehicle-day counts once. It does NOT naively average vehicle percentages.
//
// Single-vehicle utilization stays in copilotVehicleHandlers.answerVehicleUtilization
// and is only reached when a specific vehicle is resolved (see copilotScope).
//
// Pure + deterministic. No network, no secrets, no new formula.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer } from "./copilotShared";
import { buildFleetUtilizationSnapshot } from "./executiveFleetSelectors";
import { resolveProfitabilityRange } from "./profitabilityHelpers";
import type { ExecutiveFleetSources } from "./executiveFleetSelectors";

function toFleetSources(src: CopilotSources): ExecutiveFleetSources {
  const vt = src.vehicleTwin;
  return {
    store: vt.store,
    damageClaims: vt.damageClaims,
    violations: vt.violations,
    documents: vt.documents,
    requirements: vt.requirements,
    overrides: vt.overrides,
  };
}

export function answerFleetUtilization(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("fleet_utilization", asOf, perms, "derived");
  const range = src.vehicleTwin.range ?? resolveProfitabilityRange("this_year");
  if (!range) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I can't compute fleet utilization right now — no date range is available.",
    };
  }
  const snap = buildFleetUtilizationSnapshot(toFleetSources(src), range, asOf);
  const pct = `${snap.utilization_pct}%`;
  return {
    ...base,
    answer_type: "summary",
    summary: `Your fleet utilization is ${pct} — ${snap.rented_days} of ${snap.rentable_days} rentable days were rented across all vehicles.`,
    facts: [
      { label: "Fleet utilization", value: pct },
      { label: "Rented days", value: snap.rented_days },
      { label: "Rentable days", value: snap.rentable_days },
      { label: "Blocked days", value: snap.blocked_days },
      { label: "Idle days", value: snap.idle_available_days },
      { label: "Available now", value: snap.available_now },
      { label: "Rented now", value: snap.rented_now },
      { label: "Blocked now", value: snap.blocked_now },
    ],
    sources: [],
    suggested_actions: [
      {
        label: "View Fleet Performance",
        action_type: "view_fleet_performance",
        deep_link: "/vehicles/performance",
      },
    ],
    caveats: [
      "Fleet utilization = total rented days / total rentable days across all vehicles (blocked days excluded). It's a fleet aggregate, not an average of per-vehicle percentages.",
    ],
  };
}
