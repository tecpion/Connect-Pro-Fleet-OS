// Connect Pro Fleet — Copilot rental-history + vehicle-addition handlers.
//
// Three company-wide (non-entity) intents that were previously mis-routed:
//
//  - active_rentals      "How many active rentals do I have?"
//                        → RENTAL domain count (rentals whose status is active
//                          / payment_due / late / overdue / return_pending),
//                          NOT the count of vehicles currently rented.
//
//  - historical_returns  "How many returns have I had last week?"
//                        → COMPLETED returns (actual_return_date) within the
//                          detected time range. Distinct from "returns due
//                          today" (rentals_returning_today). The time range
//                          OVERRIDES the default — "last week" never returns
//                          "returns due today".
//
//  - vehicle_additions   "Any new cars added last month?"
//                        → Vehicles acquired/added within the time range, by
//                          purchase_date (the authoritative acquisition date).
//                          Returns count + vehicle identities.
//
// All three use the AUTHORITATIVE store (rentals / vehicles). No new store, no
// fabricated metrics. Pure + deterministic. Time ranges use resolveDomainRange
// so yesterday / last week / last month are handled correctly.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, plural } from "./copilotShared";
import {
  detectDomainTimeRange,
  resolveDomainRange,
  domainRangeLabel,
  type DomainTimeRange,
} from "./copilotDomainRouter";

const DAY = 86_400_000;

/** Rental statuses that represent an ACTIVE rental (vehicle is out with the
 *  customer). Excludes draft/ready_for_checkout (not yet started) and
 *  completed/cancelled (finished). */
const ACTIVE_RENTAL_STATUSES = new Set([
  "active",
  "payment_due",
  "late",
  "overdue",
  "return_pending",
]);

function parseDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

// ---------------------------------------------------------------------------
// Active rentals
// ---------------------------------------------------------------------------

/** "How many active rentals do I have?" — count of active rental agreements. */
export function answerActiveRentals(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("active_rentals", asOf, perms, "derived");
  const s = src.briefing.store;
  const active = s.rentals.filter((r) => ACTIVE_RENTAL_STATUSES.has(r.status));
  const byStatus = new Map<string, number>();
  for (const r of active) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }
  const breakdown = [...byStatus.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([st, n]) => `${n} ${humanStatus(st)}`)
    .join(", ");
  return {
    ...base,
    answer_type: "summary",
    summary:
      active.length === 0
        ? "You don't have any active rentals right now."
        : `You currently have ${active.length} active ${plural(active.length, "rental")}${breakdown ? ` (${breakdown})` : ""}.`,
    facts: [
      { label: "Active rentals", value: active.length },
      ...[...byStatus.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([st, n]) => ({ label: humanStatus(st), value: n })),
    ],
    items: active.slice(0, 25).map((r) => {
      const cust = s.customerName(r.customer_id);
      const veh = s.vehicles.find((v) => v.id === r.vehicle_id);
      return {
        id: r.id,
        title: cust
          ? `${cust} — ${r.agreement_number ?? r.id}`
          : `Rental ${r.agreement_number ?? r.id}`,
        subtitle: veh
          ? `${veh.year} ${veh.make} ${veh.model}`
          : humanStatus(r.status),
        due_at: r.scheduled_return_date ?? null,
        status: humanStatus(r.status),
        deep_link: `/rentals/${r.id}`,
      };
    }),
    sources: active.slice(0, 10).map((r) => ({
      source_module: "rentals",
      entity_type: "rental",
      entity_id: r.id,
      label: `Rental ${r.agreement_number ?? r.id}`,
      deep_link: `/rentals/${r.id}`,
    })),
    suggested_actions: [
      {
        label: "View Rentals",
        action_type: "view_rentals",
        deep_link: "/rentals",
      },
    ],
    caveats: [
      "Active rentals are rental agreements currently out — distinct from the count of vehicles currently rented.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Historical returns
// ---------------------------------------------------------------------------

/** "How many returns have I had last week?" — completed returns in a range. */
export function answerHistoricalReturns(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("historical_returns", asOf, perms, "derived");
  const s = src.briefing.store;
  // The time range OVERRIDES the default. A historical-returns question
  // without an explicit range defaults to "this week" (a sensible recent
  // window) — never "returns due today".
  const rangeKey: DomainTimeRange = detectDomainTimeRange(query) ?? "this_week";
  const range = resolveDomainRange(rangeKey, asOf);
  const start = range.start.getTime();
  const end = range.end.getTime();

  const completed = s.rentals.filter((r) => {
    if (r.status !== "completed") return false;
    const t = parseDate(r.actual_return_date);
    if (t == null) return false;
    return t >= start && t <= end;
  });

  const label = domainRangeLabel(rangeKey);
  return {
    ...base,
    answer_type: "list",
    summary:
      completed.length === 0
        ? `No completed returns ${label}.`
        : `You had ${completed.length} completed ${plural(completed.length, "return")} ${label}.`,
    facts: [
      { label: "Completed returns", value: completed.length },
      { label: "Period", value: label },
    ],
    items: completed
      .slice(0, 25)
      .sort((a, b) =>
        (b.actual_return_date ?? "").localeCompare(a.actual_return_date ?? ""),
      )
      .map((r) => {
        const cust = s.customerName(r.customer_id);
        const veh = s.vehicles.find((v) => v.id === r.vehicle_id);
        return {
          id: r.id,
          title: cust
            ? `${cust} — ${r.agreement_number ?? r.id}`
            : `Rental ${r.agreement_number ?? r.id}`,
          subtitle: veh ? `${veh.year} ${veh.make} ${veh.model}` : "Returned",
          occurred_at: r.actual_return_date ?? null,
          status: "Completed",
          deep_link: `/rentals/${r.id}`,
        };
      }),
    sources: completed.slice(0, 10).map((r) => ({
      source_module: "rentals",
      entity_type: "rental",
      entity_id: r.id,
      label: `Rental ${r.agreement_number ?? r.id}`,
      deep_link: `/rentals/${r.id}`,
      occurred_at: r.actual_return_date ?? null,
    })),
    suggested_actions: [
      {
        label: "View Rentals",
        action_type: "view_rentals",
        deep_link: "/rentals",
      },
    ],
    caveats: [
      "Counts rentals actually returned (completed) in the period — not returns due today.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Vehicle additions
// ---------------------------------------------------------------------------

/** "Any new cars added last month?" — vehicles acquired in a time range. */
export function answerVehicleAdditions(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("vehicle_additions", asOf, perms, "derived");
  const s = src.briefing.store;
  const rangeKey: DomainTimeRange =
    detectDomainTimeRange(query) ?? "this_month";
  const range = resolveDomainRange(rangeKey, asOf);
  const start = range.start.getTime();
  const end = range.end.getTime();

  const added = s.vehicles.filter((v) => {
    const t = parseDate(v.purchase_date);
    if (t == null) return false;
    return t >= start && t <= end;
  });

  const label = domainRangeLabel(rangeKey);
  return {
    ...base,
    answer_type: "list",
    summary:
      added.length === 0
        ? `No vehicles were added ${label}.`
        : `${added.length} ${plural(added.length, "vehicle")} ${plural(added.length, "was", "were")} added ${label}.`,
    facts: [
      { label: "Vehicles added", value: added.length },
      { label: "Period", value: label },
    ],
    items: added
      .slice(0, 25)
      .sort((a, b) =>
        (b.purchase_date ?? "").localeCompare(a.purchase_date ?? ""),
      )
      .map((v) => ({
        id: v.id,
        title: `${v.year} ${v.make} ${v.model}`,
        subtitle: `Unit ${v.license_plate}`,
        occurred_at: v.purchase_date ?? null,
        status: humanStatus(v.status),
        deep_link: `/vehicles/${v.id}`,
      })),
    sources: added.slice(0, 10).map((v) => ({
      source_module: "vehicles",
      entity_type: "vehicle",
      entity_id: v.id,
      label: `${v.year} ${v.make} ${v.model}`,
      deep_link: `/vehicles/${v.id}`,
      occurred_at: v.purchase_date ?? null,
    })),
    suggested_actions: [
      {
        label: "View Vehicles",
        action_type: "view_vehicles",
        deep_link: "/vehicles",
      },
    ],
    caveats: ["Vehicles are dated by their acquisition (purchase) date."],
  };
}

/** Human-readable status (reuses the shared humanizer logic inline to avoid a
 *  cross-module import cycle in this focused handler). */
function humanStatus(status: string | null | undefined): string {
  if (!status) return "—";
  if (!status.includes("_") && !status.includes("-")) return status;
  return status.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export { DAY };
