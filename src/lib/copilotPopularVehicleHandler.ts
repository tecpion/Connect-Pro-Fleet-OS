// Connect Pro Fleet — Copilot "most popular vehicle" handler.
//
// "What's the most popular vehicle in my fleet?" — "popular" has several valid
// definitions (most completed rentals, most rental days, highest utilization).
// Rather than silently picking one, this handler:
//   - When the query pins a single metric ("most rented", "most rental days",
//     "highest utilization"), answers with that metric from authoritative data.
//   - When the metric is ambiguous, asks a natural clarification listing the
//     supported definitions — never returns a generic "unsupported".
//
// Pure + deterministic. No network, no secrets, no invented metric.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, plural } from "./copilotShared";
import { getVehicleUtilization } from "./vehicleTwinSelectors";
import { resolveProfitabilityRange } from "./profitabilityHelpers";

type PopularMetric = "completed_rentals" | "rental_days" | "utilization";

/** Detect which "popular" metric the user named, if any. */
function detectMetric(query: string): PopularMetric | null {
  const q = query.toLowerCase();
  if (
    /\b(most rented|rented most|most rentals|most often|completed rentals|rented the most)\b/i.test(
      q,
    )
  )
    return "completed_rentals";
  if (
    /\b(most rental days|most days rented|most days|longest rented)\b/i.test(q)
  )
    return "rental_days";
  if (
    /\b(highest utilization|best utilization|most utilized|most used)\b/i.test(
      q,
    )
  )
    return "utilization";
  return null;
}

interface VehicleScore {
  vehicleId: string;
  label: string;
  score: number;
  metric: PopularMetric;
}

function scoreVehicles(
  src: CopilotSources,
  asOf: Date,
  metric: PopularMetric,
): VehicleScore[] {
  const s = src.briefing.store;
  const range = src.vehicleTwin.range ?? resolveProfitabilityRange("this_year");
  const out: VehicleScore[] = [];
  for (const v of s.vehicles) {
    const label = `${v.year} ${v.make} ${v.model} (${v.license_plate})`;
    if (metric === "completed_rentals") {
      const count = s.rentals.filter(
        (r) => r.vehicle_id === v.id && r.status === "completed",
      ).length;
      out.push({ vehicleId: v.id, label, score: count, metric });
    } else if (metric === "rental_days") {
      const util = getVehicleUtilization(v.id, src.vehicleTwin, range, asOf);
      out.push({ vehicleId: v.id, label, score: util.rentedDays, metric });
    } else {
      const util = getVehicleUtilization(v.id, src.vehicleTwin, range, asOf);
      out.push({ vehicleId: v.id, label, score: util.utilizationPct, metric });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function metricLabel(metric: PopularMetric): string {
  switch (metric) {
    case "completed_rentals":
      return "completed rentals";
    case "rental_days":
      return "rental days";
    case "utilization":
      return "utilization";
  }
}

export function answerPopularVehicle(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("popular_vehicle", asOf, perms, "derived");
  const metric = detectMetric(query);

  // Ambiguous metric → natural clarification (never unsupported).
  if (!metric) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "By most popular, do you mean the vehicle rented most often, the one with the most rental days, or the highest utilization?",
      facts: [
        { label: "Most completed rentals", value: "rented most often" },
        { label: "Most rental days", value: "most days rented" },
        { label: "Highest utilization", value: "best utilization %" },
      ],
      caveats: [],
    };
  }

  const ranked = scoreVehicles(src, asOf, metric);
  const top = ranked[0];
  if (!top || top.score <= 0) {
    return {
      ...base,
      answer_type: "fallback",
      summary: `No vehicle has any ${metricLabel(metric)} on record yet.`,
      caveats: [],
    };
  }
  const scoreText =
    metric === "utilization"
      ? `${top.score}%`
      : `${top.score} ${plural(top.score, metricLabel(metric).replace(/most /, "").trim())}`;

  return {
    ...base,
    answer_type: "entity",
    summary: `Your most popular vehicle by ${metricLabel(metric)} is the ${top.label}, with ${scoreText}.`,
    facts: [
      { label: "Vehicle", value: top.label },
      { label: metricLabel(metric), value: top.score },
    ],
    items: ranked.slice(0, 5).map((r) => ({
      id: r.vehicleId,
      title: r.label,
      subtitle: `${r.score} ${metricLabel(r.metric)}`,
      deep_link: `/vehicles/${r.vehicleId}`,
    })),
    sources: [
      {
        source_module: "vehicles",
        entity_type: "vehicle",
        entity_id: top.vehicleId,
        label: top.label,
        deep_link: `/vehicles/${top.vehicleId}`,
      },
    ],
    suggested_actions: [
      {
        label: "View Vehicles",
        action_type: "view_vehicles",
        deep_link: "/vehicles",
      },
    ],
    caveats: [],
  };
}
