// Connect Pro Fleet — Copilot vehicle + fleet handlers (Build #29).
//
// Each handler calls authoritative selectors (Build #27 Vehicle Digital Twin,
// Build #28 briefing fleet) and returns structured answer data. Profitability is
// gated by canViewProfitability; balances by canViewFinancials. No speculative
// revenue. Reuses existing ledger/expense selectors — no new profit formula.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
  EntityRef,
} from "./copilotTypes";
import {
  buildVehicleOperationalContext,
  type ViewerPermissions,
} from "./aiContextBuilders";
import { getVehicleDigitalTwinSummary } from "./vehicleTwinSelectors";
import { getVehicleTimeline } from "./timelineComposer";
import {
  getBlockedVehicles,
  getMaintenanceAttention,
  getDamageAttention,
  getComplianceAttention,
  getViolationAttention,
} from "./briefingFleet";
import {
  baseAnswer,
  formatMoney,
  gateAmount,
  humanizeStatus,
  plural,
} from "./copilotShared";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";

function toViewer(perms: CopilotViewerPermissions): ViewerPermissions {
  return { ...perms };
}

export function answerVehicleSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("vehicle_status", asOf, perms, "derived");
  const vehicleId = entity.type === "vehicle" ? entity.id : null;
  if (!vehicleId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which vehicle you mean.",
    };
  const range = src.vehicleTwin.range;
  if (!range)
    return {
      ...base,
      answer_type: "fallback",
      summary: "Vehicle context is unavailable (no date range).",
    };
  const ctx = buildVehicleOperationalContext(
    vehicleId,
    src.vehicleTwin,
    range,
    toViewer(perms),
    asOf,
  );
  const sum = ctx.summary;
  const blockers = sum.blockingReasons.length;
  return {
    ...base,
    answer_type: "entity",
    summary:
      blockers > 0
        ? `${ctx.vehicleLabel} — ${humanizeStatus(sum.currentStatus)}, blocked by: ${sum.blockingReasons.join(", ")}.`
        : `${ctx.vehicleLabel} — ${humanizeStatus(sum.currentStatus)}.`,
    facts: [
      { label: "Status", value: humanizeStatus(sum.currentStatus) },
      { label: "Current renter", value: sum.currentCustomerId ?? "—" },
      { label: "Utilization", value: `${sum.utilization.utilizationPct}%` },
      { label: "Idle days", value: sum.utilization.idleDays },
      { label: "Open violations", value: sum.openViolations },
      { label: "Compliance", value: humanizeStatus(sum.complianceStatus) },
      { label: "Blockers", value: blockers },
    ],
    items: ctx.attentionItems.map((a) => ({
      id: `${vehicleId}:${a.type}`,
      title: a.label,
      subtitle: a.detail,
      status: a.severity,
    })),
    sources: [
      {
        source_module: "vehicles",
        entity_type: "vehicle",
        entity_id: vehicleId,
        label: ctx.vehicleLabel,
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
    suggested_actions: [
      {
        label: "View Vehicle",
        action_type: "view_vehicle",
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
  };
}

export function answerVehicleUnavailableReason(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("vehicle_unavailable_reason", asOf, perms, "derived");
  const vehicleId = entity.type === "vehicle" ? entity.id : null;
  if (!vehicleId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which vehicle you mean.",
    };
  const range = src.vehicleTwin.range;
  if (!range)
    return {
      ...base,
      answer_type: "fallback",
      summary: "Vehicle context is unavailable.",
    };
  const ctx = buildVehicleOperationalContext(
    vehicleId,
    src.vehicleTwin,
    range,
    toViewer(perms),
    asOf,
  );
  const reasons = ctx.summary.blockingReasons;
  if (reasons.length === 0) {
    return {
      ...base,
      answer_type: "entity",
      summary: `${ctx.vehicleLabel} is not currently blocked — it should be available (subject to rental state).`,
      sources: [
        {
          source_module: "vehicles",
          entity_type: "vehicle",
          entity_id: vehicleId,
          label: ctx.vehicleLabel,
          deep_link: `/vehicles/${vehicleId}`,
        },
      ],
    };
  }
  return {
    ...base,
    answer_type: "entity",
    summary: `${ctx.vehicleLabel} is unavailable because: ${reasons.join(", ")}.`,
    facts: reasons.map((r, i) => ({ label: `Reason ${i + 1}`, value: r })),
    items: ctx.attentionItems.map((a) => ({
      id: `${vehicleId}:${a.type}`,
      title: a.label,
      subtitle: a.detail,
      status: a.severity,
    })),
    sources: [
      {
        source_module: "vehicles",
        entity_type: "vehicle",
        entity_id: vehicleId,
        label: ctx.vehicleLabel,
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
    suggested_actions: [
      {
        label: "View Vehicle",
        action_type: "view_vehicle",
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
  };
}

// Build #45 — answerIdleVehicles moved to a focused module
// (copilotIdleHandler.ts) so this file stays under the size limit. Re-exported
// here so existing import sites are unchanged.
export { answerIdleVehicles } from "./copilotIdleHandler";

export function answerBlockedVehicles(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getBlockedVehicles(src.briefing, asOf);
  const base = baseAnswer("blocked_vehicles", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No vehicles are currently blocked."
        : `${items.length} blocked ${plural(items.length, "vehicle")}.`,
    facts: [{ label: "Blocked vehicles", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
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

export function answerVehicleUtilization(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("vehicle_utilization", asOf, perms, "derived");
  const vehicleId = entity.type === "vehicle" ? entity.id : null;
  if (!vehicleId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which vehicle you mean.",
    };
  const range = src.vehicleTwin.range;
  if (!range)
    return {
      ...base,
      answer_type: "fallback",
      summary: "Utilization data is unavailable.",
    };
  const ctx = buildVehicleOperationalContext(
    vehicleId,
    src.vehicleTwin,
    range,
    toViewer(perms),
    asOf,
  );
  const u = ctx.summary.utilization;
  return {
    ...base,
    answer_type: "entity",
    summary: `${ctx.vehicleLabel} utilization: ${u.utilizationPct}% (${u.rentedDays} of ${u.rentableDays} rentable days).`,
    facts: [
      { label: "Calendar days", value: u.calendarDays },
      { label: "Blocked days", value: u.blockedDays },
      { label: "Rentable days", value: u.rentableDays },
      { label: "Rented days", value: u.rentedDays },
      { label: "Idle days", value: u.idleDays },
      { label: "Utilization", value: `${u.utilizationPct}%` },
    ],
    sources: [
      {
        source_module: "vehicles",
        entity_type: "vehicle",
        entity_id: vehicleId,
        label: ctx.vehicleLabel,
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
    caveats: [
      "Utilization = Rented Days / Rentable Days. Blocked days are excluded from the denominator.",
    ],
  };
}

export function answerVehicleProfitability(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("vehicle_profitability", asOf, perms, "derived");
  if (!perms.canViewProfitability) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "You don't have permission to view vehicle profitability.",
      caveats: ["Profitability is restricted to authorized users."],
    };
  }
  const vehicleId = entity.type === "vehicle" ? entity.id : null;
  if (!vehicleId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which vehicle you mean.",
    };
  const s = src.briefing.store;
  const v = s.vehicles.find((x) => x.id === vehicleId);
  if (!v)
    return {
      ...base,
      answer_type: "fallback",
      summary: `I couldn't find vehicle ${entity.label}.`,
    };
  let revenue = 0;
  let cost = 0;
  for (const t of s.transactions) {
    if (t.status !== "posted") continue;
    if (t.vehicle_id !== vehicleId) continue;
    if (t.category === "charge") revenue += t.amount;
    if (t.category === "refund") revenue -= t.amount;
  }
  for (const e of s.expenses) {
    if (e.vehicle_id !== vehicleId) continue;
    cost += e.amount;
  }
  const profit = revenue - cost;
  return {
    ...base,
    answer_type: "entity",
    summary: `${v.year} ${v.make} ${v.model} — revenue ${formatMoney(revenue)}, cost ${formatMoney(cost)}, operating profit ${formatMoney(profit)}.`,
    facts: [
      {
        label: "Revenue",
        value: gateAmount(revenue, perms) ?? "—",
        financial: true,
      },
      {
        label: "Operating cost",
        value: gateAmount(cost, perms) ?? "—",
        financial: true,
      },
      {
        label: "Operating profit",
        value: gateAmount(profit, perms) ?? "—",
        financial: true,
      },
    ],
    sources: [
      {
        source_module: "profitability",
        entity_type: "vehicle",
        entity_id: vehicleId,
        label: `${v.year} ${v.make} ${v.model}`,
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
    caveats: [
      "Reuses existing ledger/expense selectors — no new profitability formula.",
    ],
  };
}

export function answerVehicleHistory(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("vehicle_history", asOf, perms, "derived");
  const vehicleId = entity.type === "vehicle" ? entity.id : null;
  if (!vehicleId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which vehicle you mean.",
    };
  const events = getVehicleTimeline(vehicleId, src.timeline).slice(0, 20);
  return {
    ...base,
    answer_type: "list",
    summary: `${events.length} historical ${plural(events.length, "event")} for this vehicle.`,
    facts: [{ label: "Timeline events", value: events.length }],
    items: events.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.category,
      occurred_at: e.occurred_at,
      deep_link: e.deep_link,
    })),
    sources: [
      {
        source_module: "timeline",
        entity_type: "vehicle",
        entity_id: vehicleId,
        label: entity.label,
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
  };
}

export function answerMaintenanceAttention(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getMaintenanceAttention(src.briefing, asOf);
  const base = baseAnswer("maintenance_attention", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No maintenance attention items."
        : `${items.length} maintenance ${plural(items.length, "item")} need attention.`,
    facts: [{ label: "Maintenance items", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Maintenance",
        action_type: "view_maintenance",
        deep_link: "/maintenance",
      },
    ],
  };
}

export function answerVehicleMaintenanceHistory(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer(
    "vehicle_maintenance_history",
    asOf,
    perms,
    "derived",
  );
  const vehicleId = entity.type === "vehicle" ? entity.id : null;
  if (!vehicleId)
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which vehicle you mean.",
    };
  const s = src.briefing.store;
  const wos = s.workOrders.filter((w) => w.vehicle_id === vehicleId);
  return {
    ...base,
    answer_type: "list",
    summary: `${wos.length} work ${plural(wos.length, "order")} for this vehicle.`,
    facts: [{ label: "Work orders", value: wos.length }],
    items: wos.slice(0, 25).map((w) => ({
      id: w.id,
      title: w.title ?? w.id,
      subtitle: w.status,
      occurred_at: w.completed_at ?? w.created_at,
      status: w.status,
      deep_link: "/maintenance",
    })),
    sources: wos.slice(0, 10).map((w) => ({
      source_module: "maintenance",
      entity_type: "work_order",
      entity_id: w.id,
      label: w.title ?? w.id,
      deep_link: "/maintenance",
    })),
  };
}

export function answerOpenDamageClaims(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getDamageAttention(src.briefing, asOf);
  const base = baseAnswer("open_damage_claims", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No open damage claims needing attention."
        : `${items.length} damage ${plural(items.length, "claim")} need attention.`,
    facts: [{ label: "Damage claims", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Damage Claims",
        action_type: "view_damage",
        deep_link: "/damage-claims",
      },
    ],
  };
}

export function answerComplianceAttention(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getComplianceAttention(src.briefing, asOf);
  const base = baseAnswer("compliance_attention", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No compliance issues."
        : `${items.length} compliance ${plural(items.length, "issue")} need attention.`,
    facts: [{ label: "Compliance items", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Compliance",
        action_type: "view_compliance",
        deep_link: "/compliance",
      },
    ],
  };
}

export function answerExpiringDocuments(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getComplianceAttention(src.briefing, asOf).filter(
    (i) => /expir/i.test(i.reason ?? "") || /expir/i.test(i.title),
  );
  const base = baseAnswer("expiring_documents", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No documents expiring soon."
        : `${items.length} ${plural(items.length, "document")} expiring soon.`,
    facts: [{ label: "Expiring documents", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      due_at: i.due_at ?? null,
      deep_link: i.deep_link,
    })),
    sources: [],
    suggested_actions: [
      {
        label: "View Compliance",
        action_type: "view_compliance",
        deep_link: "/compliance",
      },
    ],
  };
}

export function answerViolationAttention(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getViolationAttention(src.briefing, asOf);
  const base = baseAnswer("violation_attention", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No violations needing attention."
        : `${items.length} ${plural(items.length, "violation")} need attention.`,
    facts: [{ label: "Violations", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Violations",
        action_type: "view_violations",
        deep_link: "/violations",
      },
    ],
  };
}

export function answerUnresolvedViolations(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const open = (src.customer360.violations ?? []).filter(
    (v) =>
      v.status === "disputed" ||
      (VIOLATION_OPEN_STATUSES as readonly string[]).includes(v.status),
  );
  const base = baseAnswer("unresolved_violations", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      open.length === 0
        ? "No unresolved violations."
        : `${open.length} unresolved ${plural(open.length, "violation")}.`,
    facts: [{ label: "Unresolved violations", value: open.length }],
    items: open.slice(0, 25).map((v) => ({
      id: v.id,
      title: v.violation_type ?? "Violation",
      subtitle: v.status,
      occurred_at: v.occurred_at,
      status: v.status,
      deep_link: "/violations",
    })),
    sources: [],
    suggested_actions: [
      {
        label: "View Violations",
        action_type: "view_violations",
        deep_link: "/violations",
      },
    ],
  };
}
