// Connect Pro Fleet — Copilot idle-vehicles handler (Build #45).
//
// "Which cars are sitting?" / "What's my longest idle vehicle?" — reuses the
// authoritative getAvailableIdleVehicles selector (no new store). Build #45
// enriches the answer: names the longest-idle vehicle by year/make/model +
// plate (the authoritative identifier) and its idle days, instead of a bare
// "Longest idle: N days". Uses only real data; never fabricates.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { getAvailableIdleVehicles } from "./vehicleTwinSelectors";
import { baseAnswer, plural } from "./copilotShared";

export function answerIdleVehicles(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("idle_vehicles", asOf, perms, "derived");
  const range = src.vehicleTwin.range;
  if (!range)
    return {
      ...base,
      answer_type: "fallback",
      summary: "Idle fleet data is unavailable (no date range).",
    };
  const idle = getAvailableIdleVehicles(src.vehicleTwin, range, asOf);
  const longest = idle[0];
  const longestLine = longest
    ? ` Longest idle: ${longest.label}, ${longest.idleDays} days.`
    : "";
  return {
    ...base,
    answer_type: "list",
    summary:
      idle.length === 0
        ? "No idle vehicles found."
        : `${idle.length} ${plural(idle.length, "vehicle")} ${plural(idle.length, "is", "are")} available and idle.${longestLine}`,
    facts: [
      { label: "Idle vehicles", value: idle.length },
      {
        label: "Longest idle",
        value: longest ? `${longest.label} · ${longest.idleDays} days` : "—",
      },
    ],
    items: idle.slice(0, 25).map((v) => ({
      id: v.vehicleId,
      title: v.label,
      subtitle: `${v.idleDays} days idle`,
      status: v.status,
    })),
    sources: idle.slice(0, 10).map((v) => ({
      source_module: "vehicles",
      entity_type: "vehicle",
      entity_id: v.vehicleId,
      label: v.label,
      deep_link: `/vehicles/${v.vehicleId}`,
    })),
    suggested_actions: [
      {
        label: "View Vehicles",
        action_type: "view_vehicles",
        deep_link: "/vehicles",
      },
    ],
    caveats: [
      "Current rate is context only — no speculative lost-revenue figure.",
    ],
  };
}
