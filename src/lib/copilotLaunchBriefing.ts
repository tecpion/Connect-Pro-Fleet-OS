// Connect Pro Fleet — Copilot morning briefing + executive focus (Build #33).
//
// Reuses Build #28 Daily Briefing + attention items. No new priority formula.
// Permission filtering happens BEFORE answer formation.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { getOperationalAttentionItems } from "./briefingComposer";
import type { BriefingItem, BriefingSources } from "./briefingTypes";
import { baseAnswer, plural } from "./copilotShared";

/** Enrich a briefing item's title with record identity (customer name and/or
 *  vehicle year/make/model) when the authoritative data exists, so a briefing
 *  row reads "Marcus Johnson — 2021 Nissan Altima" instead of a bare
 *  "Overdue return". Never fabricates — only uses ids that resolve to real
 *  records. Falls back to the original title when no record is found. */
function enrichTitle(item: BriefingItem, src: BriefingSources): string {
  const s = src.store;
  const parts: string[] = [];
  if (item.customer_id) {
    const name = s.customerName(item.customer_id);
    if (name) parts.push(name);
  }
  if (item.vehicle_id) {
    const v = s.vehicles.find((x) => x.id === item.vehicle_id);
    if (v) parts.push(`${v.year} ${v.make} ${v.model}`);
  }
  if (parts.length === 0) return item.title;
  return `${parts.join(" — ")} — ${item.title}`;
}

/** "What do I need to know today?" — reuses Build #28 Daily Briefing, sectioned.
 *  Uses getOperationalAttentionItems (returns BriefingItem[] with deep_link +
 *  source_module/entity_type/entity_id) rather than the flattened context
 *  priority_items, which omit deep links. */
export function answerMorningOpsBriefing(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  _staffId: string,
): CopilotAnswer {
  const base = baseAnswer("morning_ops_briefing", asOf, perms, "derived");
  const items = getOperationalAttentionItems(src.briefing, asOf);

  const moneyItems = items.filter((i) =>
    ["money_due", "overdue_account", "broken_arrangement"].includes(i.category),
  );
  const rentalItems = items.filter((i) =>
    ["rental_starting", "rental_returning", "overdue_return"].includes(
      i.category,
    ),
  );
  const fleetItems = items.filter((i) =>
    ["blocked_vehicle", "idle_fleet"].includes(i.category),
  );
  const opsItems = items.filter((i) =>
    [
      "maintenance",
      "damage",
      "compliance",
      "violation",
      "task_due",
      "extension",
      "reservation",
    ].includes(i.category),
  );

  const critical = items.filter((i) => i.priority === "critical");
  const recommended = items.slice(0, 5);

  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "Nothing needs attention this morning — today looks clear."
        : `${critical.length} critical, ${items.length} total ${plural(items.length, "item")} need attention this morning.`,
    facts: [
      { label: "Critical", value: critical.length },
      { label: "Money items", value: moneyItems.length },
      { label: "Rental items", value: rentalItems.length },
      { label: "Fleet items", value: fleetItems.length },
      { label: "Operations items", value: opsItems.length },
    ],
    items: recommended.map((i) => ({
      id: i.id,
      title: enrichTitle(i, src.briefing),
      subtitle: i.reason,
      amount: i.amount,
      due_at: i.due_at,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: recommended.map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: enrichTitle(i, src.briefing),
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Action Center",
        action_type: "view_briefing",
        deep_link: "/action-center",
      },
    ],
    caveats: [
      "Morning briefing reuses the Action Center / Daily Briefing engine — the Copilot explains but never re-ranks priorities.",
    ],
  };
}

interface FocusCandidate {
  item: BriefingItem;
  weight: number;
  reason: string;
}

/** "What should I focus on?" — top 5 from real attention items, ranked by
 *  disclosed facts (priority, amount, age). No opaque AI risk score. */
export function answerExecutiveFocus(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("executive_focus", asOf, perms, "derived");
  const items = getOperationalAttentionItems(src.briefing, asOf);

  const candidates: FocusCandidate[] = items.map((item) => {
    let weight = 0;
    if (item.priority === "critical") weight += 1000;
    else if (item.priority === "high") weight += 500;
    else if (item.priority === "medium") weight += 200;
    else weight += 50;
    if (item.amount && item.amount > 0) {
      weight += Math.min(300, Math.round(item.amount / 10));
    }
    if ((item.age_days ?? 0) > 0) {
      weight += Math.min(150, (item.age_days ?? 0) * 5);
    }
    return { item, weight, reason: item.reason ?? item.title };
  });

  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates.slice(0, 5);

  return {
    ...base,
    answer_type: "list",
    summary:
      top.length === 0
        ? "No priorities right now — everything looks under control."
        : `Your top ${top.length} ${plural(top.length, "priority")} to focus on.`,
    facts: [{ label: "Top priorities", value: top.length }],
    items: top.map((c) => ({
      id: c.item.id,
      title: enrichTitle(c.item, src.briefing),
      subtitle: c.reason,
      amount: c.item.amount,
      due_at: c.item.due_at,
      status: c.item.priority,
      deep_link: c.item.deep_link,
    })),
    sources: top.map((c) => ({
      source_module: c.item.source_module,
      entity_type: c.item.entity_type,
      entity_id: c.item.entity_id,
      label: enrichTitle(c.item, src.briefing),
      deep_link: c.item.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Action Center",
        action_type: "view_briefing",
        deep_link: "/action-center",
      },
    ],
    caveats: [
      "Priorities are ranked by disclosed facts (priority, amount, age) — no hidden risk score.",
    ],
  };
}
