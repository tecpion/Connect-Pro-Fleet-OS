// Connect Pro Fleet — Copilot fleet-count handler (Build #45).
//
// "How many cars do I have?" / "What's my fleet size?" — counts the
// authoritative vehicle store (no new store) and breaks the count down by
// status so the answer is informative, not just a bare number. Pure +
// deterministic; no network, no secrets.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, plural, humanizeStatus } from "./copilotShared";

export function answerFleetCount(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("fleet_count", asOf, perms, "derived");
  const s = src.briefing.store;
  const vehicles = s.vehicles;
  const total = vehicles.length;
  const byStatus = new Map<string, number>();
  for (const v of vehicles) {
    byStatus.set(v.status, (byStatus.get(v.status) ?? 0) + 1);
  }
  const statusBreakdown = [...byStatus.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${count} ${humanizeStatus(status)}`)
    .join(", ");
  return {
    ...base,
    answer_type: "summary",
    summary:
      total === 0
        ? "You don't have any vehicles in your fleet yet."
        : `You currently have ${total} ${plural(total, "vehicle")} in your fleet${statusBreakdown ? ` (${statusBreakdown})` : ""}.`,
    facts: [
      { label: "Total vehicles", value: total },
      ...[...byStatus.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({
          label: humanizeStatus(status),
          value: count,
        })),
    ],
    sources: vehicles.slice(0, 10).map((v) => ({
      source_module: "vehicles",
      entity_type: "vehicle",
      entity_id: v.id,
      label: `${v.year} ${v.make} ${v.model} (${v.license_plate})`,
      deep_link: `/vehicles/${v.id}`,
    })),
    suggested_actions: [
      {
        label: "View Vehicles",
        action_type: "view_vehicles",
        deep_link: "/vehicles",
      },
    ],
  };
}
