// Connect Pro Fleet — Daily Briefing composer + attention engine (Build #28).
//
// Aggregation + prioritization layer — NOT a new source of truth. Composes the
// Build #28 briefing selectors (money/rentals/fleet/tasks) into a single deduped
// priority queue using stable `attentionKey` ids, so a root issue (e.g. expired
// registration → compliance block + vehicle block + reservation block) never
// produces duplicate cards. `asOf` is explicit + deterministic — no buried
// new Date(). When the source condition resolves, the derived item disappears
// automatically (no persistent stale "open" attention).

import type {
  BriefingItem,
  BriefingSources,
  BriefingConfig,
  BriefingCategory,
  OperationalSummary,
  DailyBriefing,
  BriefingSections,
  BriefingViewerPermissions,
} from "./briefingTypes";
import { DEFAULT_BRIEFING_CONFIG } from "./briefingTypes";
import {
  getMoneyDueToday,
  getOverdueAccounts,
  getArrangementAttention,
  getTodaysPaymentSummary,
} from "./briefingMoney";
import {
  getRentalsStartingToday,
  getRentalsReturningToday,
  getOverdueReturns,
  getExtensionAttention,
  getReservationAttention,
} from "./briefingRentals";
import {
  getBlockedVehicles,
  getMaintenanceAttention,
  getDamageAttention,
  getComplianceAttention,
  getViolationAttention,
  getIdleFleet,
  getIdleFleetRollup,
} from "./briefingFleet";
import { sortBriefingItems } from "./briefingPriority";
import type { OperationalStaffAssignment } from "./staffTypes";
import type { DateRange } from "./profitabilityHelpers";

const DAY = 86_400_000;

/** Tasks due today + overdue. Reuses the Build #11 Task model. */
export function getTasksDueToday(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const s = src.store;
  const today = asOf.toISOString().slice(0, 10);
  const todayTs = new Date(today + "T00:00:00").getTime();
  const items: BriefingItem[] = [];
  for (const t of s.tasks) {
    if (t.status !== "open" && t.status !== "in_progress") continue;
    if (!t.due_date) continue;
    const dueTs = new Date(t.due_date + "T00:00:00").getTime();
    if (isNaN(dueTs)) continue;
    const isOverdue = dueTs < todayTs;
    const isToday = t.due_date === today;
    if (!isOverdue && !isToday) continue;
    const ageDays = isOverdue
      ? Math.max(1, Math.round((todayTs - dueTs) / DAY))
      : 0;
    items.push({
      id: `tasks:task:${t.id}:due`,
      category: "task",
      priority: isOverdue ? (ageDays >= 3 ? "high" : "medium") : "medium",
      title: isOverdue ? "Overdue task" : "Task due today",
      reason: `${t.title}${t.due_date ? ` · due ${t.due_date}` : ""}`,
      entity_type: t.entity_type ?? "task",
      entity_id: t.id,
      customer_id: t.entity_type === "customer" ? (t.entity_id ?? null) : null,
      vehicle_id: t.entity_type === "vehicle" ? (t.entity_id ?? null) : null,
      rental_id: t.entity_type === "rental" ? (t.entity_id ?? null) : null,
      due_at: t.due_date,
      age_days: ageDays,
      status: t.status,
      action_type: "open_task",
      action_label: "Open Task",
      deep_link: "/tasks",
      assigned_staff_id: t.assigned_to_user_id ?? null,
      source_module: "tasks",
      source_entity: "task",
      source_id: t.id,
      sensitive: false,
    });
  }
  return items;
}

/** Resolve the staff name for an assigned-staff id (null when unassigned). */
function staffName(
  src: BriefingSources,
  staffId: string | null | undefined,
): string | null {
  if (!staffId) return null;
  return src.store.staff.find((s) => s.id === staffId)?.full_name ?? null;
}

/** Unassigned critical work — high-priority operational issues (overdue money,
 *  blocked vehicles, overdue returns) without an active staff owner. Reuses
 *  Build #24 staff assignments. */
export function getUnassignedCriticalWork(
  src: BriefingSources,
  asOf: Date,
): BriefingItem[] {
  const assignments = src.assignments ?? [];
  const high = getOperationalAttentionItems(src, asOf, {
    ...DEFAULT_BRIEFING_CONFIG,
    show_informational: false,
  }).filter((i) => i.priority === "critical" || i.priority === "high");
  return high
    .filter((i) => {
      // An item is "unassigned" when no active staff assignment covers its entity.
      if (i.assigned_staff_id) return false;
      if (!i.vehicle_id && !i.customer_id && !i.rental_id) return false;
      const covered = assignments.some(
        (a) =>
          a.status === "active" &&
          ((a.entity_type === "vehicle" && a.entity_id === i.vehicle_id) ||
            (a.entity_type === "customer" && a.entity_id === i.customer_id) ||
            (a.entity_type === "rental" && a.entity_id === i.rental_id)),
      );
      return !covered;
    })
    .map((i) => ({
      ...i,
      id: `${i.id}:unassigned`,
      title: `${i.title} — needs assignment`,
      reason: i.reason
        ? `${i.reason} · no active staff assignment`
        : "No active staff assignment",
      action_type: "assign_staff",
      action_label: "Assign Staff",
    }));
}

/** My Priorities — tasks assigned to me + entities I own that have attention.
 *  Reuses Build #24 staff assignments + the attention engine. */
export function getMyPriorities(
  src: BriefingSources,
  asOf: Date,
  staffId: string,
): BriefingItem[] {
  const out: BriefingItem[] = [];
  // My open tasks (Build #11).
  for (const t of src.store.tasks) {
    if (t.assigned_to_user_id !== staffId) continue;
    if (t.status !== "open" && t.status !== "in_progress") continue;
    out.push({
      id: `mine:task:${t.id}`,
      category: "task",
      priority:
        t.priority === "urgent"
          ? "critical"
          : t.priority === "high"
            ? "high"
            : t.priority === "normal"
              ? "medium"
              : "informational",
      title: t.title,
      reason: t.description ?? "Assigned to you",
      entity_type: t.entity_type ?? "task",
      entity_id: t.id,
      customer_id: t.entity_type === "customer" ? (t.entity_id ?? null) : null,
      vehicle_id: t.entity_type === "vehicle" ? (t.entity_id ?? null) : null,
      rental_id: t.entity_type === "rental" ? (t.entity_id ?? null) : null,
      due_at: t.due_date ?? null,
      status: t.status,
      action_type: "open_task",
      action_label: "Open Task",
      deep_link: "/tasks",
      assigned_staff_id: staffId,
      source_module: "tasks",
      source_entity: "task",
      source_id: t.id,
      sensitive: false,
    });
  }
  // Entities I own (Build #24) that currently have a Critical/High attention item.
  const mine = (src.assignments ?? []).filter(
    (a) => a.staff_id === staffId && a.status === "active",
  );
  const attention = getOperationalAttentionItems(src, asOf, {
    ...DEFAULT_BRIEFING_CONFIG,
    show_informational: false,
  }).filter((i) => i.priority === "critical" || i.priority === "high");
  for (const a of mine) {
    const relevant = attention.filter(
      (i) =>
        (a.entity_type === "vehicle" && i.vehicle_id === a.entity_id) ||
        (a.entity_type === "customer" && i.customer_id === a.entity_id) ||
        (a.entity_type === "rental" && i.rental_id === a.entity_id),
    );
    for (const r of relevant) {
      out.push({
        ...r,
        id: `mine:${r.id}`,
        assigned_staff_id: staffId,
      });
    }
  }
  return sortBriefingItems(out);
}

/** Compose ALL attention items across money + rentals + fleet + tasks. Dedupes
 *  by stable id so a root issue never produces two cards (spec §65). */
export function getOperationalAttentionItems(
  src: BriefingSources,
  asOf: Date,
  config: BriefingConfig = DEFAULT_BRIEFING_CONFIG,
): BriefingItem[] {
  const all: BriefingItem[] = [];
  all.push(...getMoneyDueToday(src, asOf));
  all.push(...getOverdueAccounts(src, asOf));
  all.push(...getArrangementAttention(src, asOf));
  all.push(...getRentalsStartingToday(src, asOf));
  all.push(...getRentalsReturningToday(src, asOf));
  all.push(...getOverdueReturns(src, asOf));
  all.push(...getExtensionAttention(src, asOf));
  all.push(...getReservationAttention(src, asOf));
  all.push(...getBlockedVehicles(src, asOf));
  all.push(...getMaintenanceAttention(src, asOf));
  all.push(...getDamageAttention(src, asOf));
  all.push(...getComplianceAttention(src, asOf));
  all.push(...getViolationAttention(src, asOf));
  all.push(...getTasksDueToday(src, asOf));
  if (src.range) all.push(...getIdleFleet(src, asOf, config));

  // Dedupe by stable id (attention_key). A root issue collapses to one card.
  const seen = new Map<string, BriefingItem>();
  for (const item of all) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  const deduped = [...seen.values()];
  return config.show_informational
    ? deduped
    : deduped.filter((i) => i.priority !== "informational");
}

/** Filter briefing items by category + priority + staff (spec §59–62). */
export function filterBriefingItems(
  items: BriefingItem[],
  filters: {
    category?: BriefingCategory | "all";
    priority?: "all" | "critical" | "high" | "medium" | "informational";
    staffId?: string | "all" | "mine" | "unassigned";
  },
  mineStaffId?: string,
): BriefingItem[] {
  return items.filter((i) => {
    if (
      filters.category &&
      filters.category !== "all" &&
      i.category !== filters.category
    )
      return false;
    if (
      filters.priority &&
      filters.priority !== "all" &&
      i.priority !== filters.priority
    )
      return false;
    if (filters.staffId === "mine") {
      if (i.assigned_staff_id !== (mineStaffId ?? null)) return false;
    } else if (filters.staffId === "unassigned") {
      if (i.assigned_staff_id) return false;
    } else if (
      filters.staffId &&
      filters.staffId !== "all" &&
      i.assigned_staff_id !== filters.staffId
    ) {
      return false;
    }
    return true;
  });
}

/** Gate a financial amount by viewer permission (null when no financial perm). */
export function resolveItemAmount(
  item: BriefingItem,
  perms: BriefingViewerPermissions,
): number | null {
  if (item.amount == null) return null;
  return perms.canViewFinancials ? item.amount : null;
}

/** Count returns due today (scheduled return today, active). */
function countReturnsToday(src: BriefingSources, asOf: Date): number {
  return getRentalsReturningToday(src, asOf).length;
}

/** Count rentals starting today (confirmed reservations starting today). */
function countStartsToday(src: BriefingSources, asOf: Date): number {
  return getRentalsStartingToday(src, asOf).length;
}

/** Build the operational summary (counts + money totals; money null when the
 *  viewer lacks financial permission). */
export function buildOperationalSummary(
  src: BriefingSources,
  asOf: Date,
  perms: BriefingViewerPermissions,
): OperationalSummary {
  const pay = getTodaysPaymentSummary(src, asOf);
  const attention = getOperationalAttentionItems(
    src,
    asOf,
    DEFAULT_BRIEFING_CONFIG,
  );
  return {
    critical_count: attention.filter((i) => i.priority === "critical").length,
    due_today_count: pay.due_count,
    overdue_accounts_count: pay.overdue_count,
    starts_today_count: countStartsToday(src, asOf),
    returns_today_count: countReturnsToday(src, asOf),
    blocked_vehicles_count: getBlockedVehicles(src, asOf).length,
    idle_vehicles_count: src.range
      ? getIdleFleet(src, asOf, DEFAULT_BRIEFING_CONFIG).length
      : 0,
    due_today_amount: perms.canViewFinancials ? pay.due_amount : null,
    overdue_amount: perms.canViewFinancials ? pay.overdue_amount : null,
  };
}

/** Compose the full Daily Briefing. Explicit `asOf` (deterministic). */
export function buildDailyBriefing(
  src: BriefingSources,
  asOf: Date,
  config: BriefingConfig = DEFAULT_BRIEFING_CONFIG,
  perms: BriefingViewerPermissions = {
    canViewFinancials: true,
    canViewProfitability: true,
    canViewSensitiveDocs: true,
    canViewBanking: true,
  },
  staffId = "stf_1",
  tenantId = "tnt_demo",
): DailyBriefing {
  const items = getOperationalAttentionItems(src, asOf, config);
  const myPriorities = getMyPriorities(src, asOf, staffId);
  const priorities = sortBriefingItems(items);
  const sections: BriefingSections = {
    money: sortBriefingItems(items.filter((i) => i.category === "money")),
    rentals: sortBriefingItems(items.filter((i) => i.category === "rental")),
    fleet: sortBriefingItems(
      items.filter(
        (i) =>
          i.category === "maintenance" ||
          i.category === "damage" ||
          i.category === "compliance" ||
          i.category === "violation",
      ),
    ),
    idle: sortBriefingItems(items.filter((i) => i.category === "idle")),
    my_priorities: myPriorities,
  };
  const counts: Record<BriefingCategory, number> = {
    money: sections.money.length,
    rental: sections.rentals.length,
    fleet: sections.fleet.length,
    maintenance: items.filter((i) => i.category === "maintenance").length,
    damage: items.filter((i) => i.category === "damage").length,
    compliance: items.filter((i) => i.category === "compliance").length,
    violation: items.filter((i) => i.category === "violation").length,
    task: items.filter((i) => i.category === "task").length,
    idle: sections.idle.length,
  };
  return {
    as_of: {
      as_of: asOf.toISOString(),
      tenant_id: tenantId,
      generated_for_user_id: staffId,
      generated_at: new Date().toISOString(),
    },
    config,
    sections,
    counts,
    priorities,
    operational_summary: buildOperationalSummary(src, asOf, perms),
  };
}

/** Daily briefing AI context — structured data for a future AI Ops Manager. No
 *  LLM, no prose. Permission-filtered: balances null without financial perm. */
export interface DailyBriefingContext {
  as_of: string;
  tenant_id: string;
  generated_for_user_id: string;
  summary: OperationalSummary;
  priority_items: Array<{
    id: string;
    category: BriefingCategory;
    priority: string;
    title: string;
    reason: string | null;
    entity_type: string;
    entity_id: string;
    customer_id?: string | null;
    vehicle_id?: string | null;
    rental_id?: string | null;
    amount: number | null;
    due_at: string | null;
    assigned_staff_id: string | null;
    source_module: string;
    source_entity: string;
    source_id: string;
  }>;
  idle_rollup: ReturnType<typeof getIdleFleetRollup> | null;
}

/** Build structured Daily Briefing context for future AI (spec §79–82). No LLM. */
export function buildDailyBriefingContext(
  src: BriefingSources,
  asOf: Date,
  config: BriefingConfig = DEFAULT_BRIEFING_CONFIG,
  perms: BriefingViewerPermissions = {
    canViewFinancials: true,
    canViewProfitability: true,
    canViewSensitiveDocs: true,
    canViewBanking: true,
  },
  staffId = "stf_1",
  tenantId = "tnt_demo",
): DailyBriefingContext {
  const briefing = buildDailyBriefing(
    src,
    asOf,
    config,
    perms,
    staffId,
    tenantId,
  );
  return {
    as_of: briefing.as_of.as_of,
    tenant_id: briefing.as_of.tenant_id,
    generated_for_user_id: briefing.as_of.generated_for_user_id,
    summary: briefing.operational_summary,
    priority_items: briefing.priorities.map((i) => ({
      id: i.id,
      category: i.category,
      priority: i.priority,
      title: i.title,
      reason: i.reason,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      customer_id: i.customer_id ?? null,
      vehicle_id: i.vehicle_id ?? null,
      rental_id: i.rental_id ?? null,
      amount: resolveItemAmount(i, perms),
      due_at: i.due_at ?? null,
      assigned_staff_id: i.assigned_staff_id ?? null,
      source_module: i.source_module,
      source_entity: i.source_entity,
      source_id: i.source_id,
    })),
    idle_rollup: src.range
      ? getIdleFleetRollup(src, asOf, {
          idle_attention_threshold_days: config.idle_attention_threshold_days,
        })
      : null,
  };
}

/** Recent operational changes — derives from unified-timeline-shaped events so
 *  no event is copied into a second store (spec §83). Safe date handling. */
export function getRecentOperationalChanges(
  events: { occurred_at: string; category: string; title: string }[],
  asOf: Date,
  withinDays = 1,
): { occurred_at: string; category: string; title: string }[] {
  const cutoff = asOf.getTime() - withinDays * DAY;
  const parsed = events
    .map((e) => ({
      ...e,
      ts: new Date(e.occurred_at).getTime(),
    }))
    .filter(
      (e) => !isNaN(e.ts) && e.ts >= cutoff && e.ts <= asOf.getTime() + DAY,
    );
  return parsed.sort((a, b) => b.ts - a.ts).map(({ ts: _ts, ...rest }) => rest);
}

export type { OperationalStaffAssignment, DateRange };
export { DEFAULT_BRIEFING_CONFIG, sortBriefingItems, staffName };
