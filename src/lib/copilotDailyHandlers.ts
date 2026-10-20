// Connect Pro Fleet — Copilot daily-ops + end-of-day handlers (Build #29).
//
// "What should I focus on?" uses buildDailyBriefingContext (deterministic
// priority preserved — the Copilot never re-prioritizes). End-of-day recap is a
// deterministic structured summary derived from the unified timeline + briefing
// selectors — no fabricated conclusions, no scheduled delivery.
//
// Build #29 closure: the end-of-day delta (newOverdue / resolvedOverdue) is a
// TRUTHFUL day-over-day transition derived from the authoritative late evaluator
// (Build #21) — not a fake zero. An obligation is "newly overdue today" only
// when it was NOT late at the start of the tenant's day but IS late at asOf;
// "resolved" is the inverse. No new lateness formula is introduced.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import {
  buildDailyBriefingContext,
  buildOperationalSummary,
  getMyPriorities,
  getUnassignedCriticalWork,
  getTasksDueToday,
  resolveItemAmount,
} from "./briefingComposer";
import { DEFAULT_BRIEFING_CONFIG } from "./briefingTypes";
import { baseAnswer, plural } from "./copilotShared";
import { getPaymentObligations } from "./billingSelectors";
import { isObligationLate } from "./lateEvaluator";
import {
  getCompanyRecentChanges,
  recentChangesWindowStart,
  summarizeRecentChanges,
} from "./recentChangesComposer";
import {
  detectDomainTimeRange,
  resolveDomainRange,
  domainRangeLabel,
} from "./copilotDomainRouter";
import { startOfDayInTz, zonedDateTimeParts, getOrgTimezone } from "./timezone";

const DAY = 86_400_000;

/** The start of the tenant's calendar day containing `asOf`, evaluated in the
 *  organization's configured timezone (`tz`, resolved through `getOrgTimezone`
 *  → UTC safe default). The day-over-day delta compares lateness at this
 *  instant against lateness at `asOf`. Returns a real UTC instant. */
function startOfDayLocal(asOf: Date, tz?: string): Date {
  return startOfDayInTz(asOf, getOrgTimezone(tz));
}

/** Authoritative lateness of a single obligation at an instant. Returns the
 *  late flag using the centralized exact-time evaluator (cutoff + grace). */
function obligationLateAt(
  rentalId: string,
  periodDueAt: string,
  rentals: {
    id: string;
    payment_cutoff_time: string | null;
    grace_period: number;
  }[],
  when: Date,
): boolean {
  const r = rentals.find((x) => x.id === rentalId);
  return isObligationLate(
    {
      due_at: periodDueAt,
      cutoff_time: r?.payment_cutoff_time ?? null,
      grace_period: r?.grace_period ?? 0,
    },
    when,
  ).late;
}

/** Derive the truthful day-over-day overdue delta. An obligation is "newly
 *  overdue today" when it was NOT late at the start of the tenant's day but IS
 *  late at asOf. "Resolved" is the inverse (late at start, not late at asOf).
 *  Uses the authoritative late evaluator — no new lateness formula. */
function deriveOverdueDelta(
  src: CopilotSources,
  asOf: Date,
  tz?: string,
): { newOverdue: number; resolvedOverdue: number } {
  const z = getOrgTimezone(tz);
  const s = src.briefing.store;
  const obligations = getPaymentObligations(
    s.rentals,
    src.briefing.billingPeriods ?? [],
    s.transactions,
    asOf,
    z,
  );
  // Only outstanding obligations can be late (a paid period can never be overdue).
  const outstanding = obligations.filter((o) => o.amountDue > 0);
  const dayStart = startOfDayLocal(asOf, z);
  let newOverdue = 0;
  let resolvedOverdue = 0;
  for (const o of outstanding) {
    const lateAtStart = obligationLateAt(
      o.rentalId,
      o.period.due_at,
      s.rentals,
      dayStart,
    );
    const lateNow = obligationLateAt(
      o.rentalId,
      o.period.due_at,
      s.rentals,
      asOf,
    );
    if (!lateAtStart && lateNow) newOverdue++;
    if (lateAtStart && !lateNow) resolvedOverdue++;
  }
  return { newOverdue, resolvedOverdue };
}

/** "What should I focus on today?" — deterministic priorities, explained. */
export function answerDailyPriorities(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  staffId: string,
): CopilotAnswer {
  const ctx = buildDailyBriefingContext(
    src.briefing,
    asOf,
    DEFAULT_BRIEFING_CONFIG,
    perms,
    staffId,
    "tnt_demo",
  );
  const base = baseAnswer("daily_priorities", asOf, perms, "derived");
  const critical = ctx.priority_items.filter((i) => i.priority === "critical");
  const high = ctx.priority_items.filter((i) => i.priority === "high");
  return {
    ...base,
    summary:
      ctx.priority_items.length === 0
        ? "No critical issues right now. Today looks clear."
        : `${ctx.summary.critical_count} critical, ${high.length} high-priority ${plural(high.length, "item")} need attention today.`,
    answer_type: "list",
    facts: [
      { label: "Critical", value: ctx.summary.critical_count },
      { label: "High", value: high.length },
      { label: "Due today", value: ctx.summary.due_today_count },
      { label: "Overdue accounts", value: ctx.summary.overdue_accounts_count },
      { label: "Blocked vehicles", value: ctx.summary.blocked_vehicles_count },
      { label: "Idle vehicles", value: ctx.summary.idle_vehicles_count },
    ],
    items: ctx.priority_items.slice(0, 15).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      amount: i.amount,
      due_at: i.due_at,
      status: i.priority,
      deep_link: deepLinkForItem(i),
    })),
    sources: ctx.priority_items.slice(0, 15).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: deepLinkForItem(i),
    })),
    suggested_actions: [
      {
        label: "Open Action Center",
        action_type: "view_briefing",
        deep_link: "/action-center",
      },
    ],
    caveats: [
      "Priorities are deterministic — the Copilot explains but never re-ranks them.",
    ],
  };
}

function deepLinkForItem(i: {
  entity_type: string;
  entity_id: string;
  customer_id?: string | null;
  vehicle_id?: string | null;
  rental_id?: string | null;
}): string | null {
  if (i.rental_id) return `/rentals/${i.rental_id}`;
  if (i.vehicle_id) return `/vehicles/${i.vehicle_id}`;
  if (i.customer_id) return `/customers/${i.customer_id}`;
  if (i.entity_type === "rental") return `/rentals/${i.entity_id}`;
  if (i.entity_type === "vehicle") return `/vehicles/${i.entity_id}`;
  if (i.entity_type === "customer") return `/customers/${i.entity_id}`;
  if (i.entity_type === "work_order") return "/maintenance";
  if (i.entity_type === "violation") return "/violations";
  if (i.entity_type === "damage_claim") return "/damage-claims";
  if (i.entity_type === "reservation") return "/reservations";
  return null;
}

/** "Today's summary?" — morning summary (template-based, no AI prose). */
export function answerTodaysSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  staffId: string,
): CopilotAnswer {
  const s = buildOperationalSummary(src.briefing, asOf, perms);
  const base = baseAnswer("todays_summary", asOf, perms, "derived");
  const money =
    perms.canViewFinancials && s.due_today_amount != null
      ? `, ${s.due_today_amount} due`
      : "";
  return {
    ...base,
    summary: `${s.critical_count} ${plural(s.critical_count, "item")} need attention today. ${s.due_today_count} due${money}, ${s.overdue_accounts_count} overdue, ${s.starts_today_count} starting, ${s.returns_today_count} returning, ${s.blocked_vehicles_count} blocked, ${s.idle_vehicles_count} idle.`,
    answer_type: "summary",
    facts: [
      { label: "Critical", value: s.critical_count },
      { label: "Due today", value: s.due_today_count },
      {
        label: "Due today amount",
        value: s.due_today_amount ?? "—",
        financial: true,
      },
      { label: "Overdue accounts", value: s.overdue_accounts_count },
      {
        label: "Overdue amount",
        value: s.overdue_amount ?? "—",
        financial: true,
      },
      { label: "Starting today", value: s.starts_today_count },
      { label: "Returning today", value: s.returns_today_count },
      { label: "Blocked vehicles", value: s.blocked_vehicles_count },
      { label: "Idle vehicles", value: s.idle_vehicles_count },
    ],
    sources: [],
    suggested_actions: [
      {
        label: "Open Action Center",
        action_type: "view_briefing",
        deep_link: "/action-center",
      },
    ],
  };
}

/** "What changed since yesterday?" / "what happened last week?" — COMPANY-WIDE
 *  recent operational changes.
 *
 *  Composes actual timestamped events from every authoritative module across
 *  the tenant (rentals, reservations, payments, maintenance, damage, violations,
 *  compliance, tasks, assignments) via the Build #27 module-level normalizers —
 *  NOT a single customer's timeline. Dedupes by stable event id, filters by an
 *  explicit tenant-local date window + location/permission scope, sorts newest-
 *  first. Only actual timestamped events are surfaced — no state-inferred
 *  transitions are described as historical change.
 *
 *  The time range is detected from the query ("last week", "yesterday",
 *  "this month", …) via detectDomainTimeRange; defaults to "since yesterday"
 *  (the original 1-day window) when no explicit range is present. */
export function answerRecentChanges(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  allowedLocationIds: string[] = [],
  query = "",
  tz?: string,
): CopilotAnswer {
  const z = getOrgTimezone(tz);
  const rangeKey = detectDomainTimeRange(query);
  let start: Date;
  let rangeLabel: string;
  if (rangeKey) {
    const r = resolveDomainRange(rangeKey, asOf, z);
    start = r.start;
    rangeLabel = domainRangeLabel(rangeKey);
  } else {
    start = recentChangesWindowStart(asOf, 1, z);
    rangeLabel = "since yesterday";
  }
  const recent = getCompanyRecentChanges(src, {
    start,
    asOf,
    allowedLocationIds,
    perms,
  });
  const base = baseAnswer("recent_changes", asOf, perms, "derived");
  if (recent.length === 0) {
    return {
      ...base,
      summary: `No recorded operational changes were found ${rangeLabel}.`,
      answer_type: "list",
      facts: [
        { label: "Recent changes", value: 0 },
        { label: "Period", value: rangeLabel },
      ],
      items: [],
      sources: [],
      suggested_actions: [
        {
          label: "Open Action Center",
          action_type: "view_briefing",
          deep_link: "/action-center",
        },
      ],
      caveats: [
        "Only actual timestamped events are surfaced — no state-inferred transitions are described as historical change.",
      ],
    };
  }
  const summaryCounts = summarizeRecentChanges(recent);
  const summaryParts = summaryCounts
    .map((c) => `${c.count} ${categoryLabel(c.category)}`)
    .join(", ");
  return {
    ...base,
    summary: `${recent.length} ${plural(recent.length, "change")} ${rangeLabel}: ${summaryParts}.`,
    answer_type: "list",
    facts: [
      { label: "Recent changes", value: recent.length },
      { label: "Period", value: rangeLabel },
    ],
    items: recent.slice(0, 30).map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: categoryLabel(e.category),
      occurred_at: e.occurred_at,
      deep_link: e.deep_link,
    })),
    sources: recent.slice(0, 30).map((e) => ({
      source_module: e.source_module,
      entity_type: e.entity_type,
      entity_id: e.entity_id,
      label: e.title,
      deep_link: e.deep_link,
      occurred_at: e.occurred_at,
    })),
    suggested_actions: [
      {
        label: "Open Action Center",
        action_type: "view_briefing",
        deep_link: "/action-center",
      },
    ],
    caveats: [
      "Only actual timestamped events are surfaced — no state-inferred transitions are described as historical change.",
    ],
  };
}

/** Human-readable label for a timeline category in the summary line. */
function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    rental: "rental",
    reservation: "reservation",
    payment: "payment",
    billing: "billing",
    deposit: "deposit",
    damage: "damage claim",
    maintenance: "work order",
    violation: "violation",
    compliance: "compliance",
    document: "document",
    task: "task",
    assignment: "assignment",
    expense: "expense",
    note: "note",
    system: "system",
  };
  return labels[category] ?? category;
}

/** "What should I work on?" — my priorities. */
export function answerMyPriorities(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  staffId: string,
): CopilotAnswer {
  const mine = getMyPriorities(src.briefing, asOf, staffId);
  const base = baseAnswer("my_priorities", asOf, perms, "derived");
  return {
    ...base,
    summary:
      mine.length === 0
        ? "You have no open priorities right now."
        : `${mine.length} ${plural(mine.length, "item")} assigned to you.`,
    answer_type: "list",
    facts: [{ label: "My priorities", value: mine.length }],
    items: mine.slice(0, 20).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      due_at: i.due_at ?? null,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: [],
    suggested_actions: [
      { label: "Open Tasks", action_type: "view_tasks", deep_link: "/tasks" },
    ],
  };
}

/** "Needs assignment?" — unassigned critical work. */
export function answerNeedsAssignment(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const unassigned = getUnassignedCriticalWork(src.briefing, asOf);
  const base = baseAnswer("needs_assignment", asOf, perms, "derived");
  return {
    ...base,
    summary:
      unassigned.length === 0
        ? "No unassigned critical work."
        : `${unassigned.length} ${plural(unassigned.length, "item")} need assignment.`,
    answer_type: "list",
    facts: [{ label: "Needs assignment", value: unassigned.length }],
    items: unassigned.slice(0, 20).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      status: i.priority,
      deep_link: i.deep_link,
    })),
    sources: [],
    suggested_actions: [
      { label: "View Staff", action_type: "view_staff", deep_link: "/staff" },
    ],
  };
}

/** "Overdue tasks?" */
export function answerOverdueTasks(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const tasks = getTasksDueToday(src.briefing, asOf).filter(
    (t) => (t.age_days ?? 0) > 0,
  );
  const base = baseAnswer("overdue_tasks", asOf, perms, "derived");
  return {
    ...base,
    summary:
      tasks.length === 0
        ? "No overdue tasks."
        : `${tasks.length} overdue ${plural(tasks.length, "task")}.`,
    answer_type: "list",
    facts: [{ label: "Overdue tasks", value: tasks.length }],
    items: tasks.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: t.reason,
      due_at: t.due_at ?? null,
      status: t.status ?? null,
      deep_link: t.deep_link,
    })),
    sources: [],
    suggested_actions: [
      { label: "Open Tasks", action_type: "view_tasks", deep_link: "/tasks" },
    ],
  };
}

// ---------------------------------------------------------------------------
// End-of-day recap
// ---------------------------------------------------------------------------

export interface EndOfDayContext {
  as_of: string;
  payments_received_count: number;
  payments_received_amount: number | null;
  rentals_started_count: number;
  rentals_returned_count: number;
  /** Obligations that became newly overdue during the tenant's day (not late at
   *  day-start, late at asOf). Truthful day-over-day delta via the late evaluator. */
  new_overdue_count: number;
  /** Obligations that were overdue at day-start but are no longer overdue at
   *  asOf (e.g. payment received, reversal corrected). Truthful delta. */
  resolved_overdue_count: number;
  work_orders_completed_count: number;
  claims_opened_count: number;
  violations_created_count: number;
  compliance_changes_count: number;
  tasks_completed_count: number;
  tasks_open_count: number;
}

/** Build the deterministic end-of-day context (on demand, not scheduled). */
export function buildEndOfDayContext(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  tz?: string,
): EndOfDayContext {
  const z = getOrgTimezone(tz);
  const s = src.briefing.store;
  // "Today" as a YYYY-MM-DD date-only string in the org timezone, so the
  // effective_date / checkout_date / actual_return_date comparisons are
  // org-local business-day comparisons, not UTC/machine slices.
  const parts = zonedDateTimeParts(asOf, z);
  const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  // The compliance-changes window is the org-local day [dayStart, asOf].
  const dayStart = startOfDayInTz(asOf, z);

  let paymentsCount = 0;
  let paymentsAmount = 0;
  for (const t of s.transactions) {
    if (t.category !== "payment") continue;
    if (t.status !== "posted") continue;
    if (t.effective_date !== today) continue;
    paymentsCount++;
    paymentsAmount += t.amount;
  }

  const rentalsStarted = s.rentals.filter(
    (r) => r.checkout_date === today,
  ).length;
  const rentalsReturned = s.rentals.filter(
    (r) => r.actual_return_date === today,
  ).length;

  // Truthful day-over-day overdue delta (Build #29 closure). Derived from the
  // authoritative late evaluator comparing day-start vs asOf — never a stub.
  const { newOverdue, resolvedOverdue } = deriveOverdueDelta(src, asOf, z);

  let woCompleted = 0;
  for (const w of s.workOrders) {
    if (w.completed_at && w.completed_at.slice(0, 10) === today) woCompleted++;
  }

  const claimsOpened = (src.customer360.damageClaims ?? []).filter(
    (c) => (c.created_at ?? "").slice(0, 10) === today,
  ).length;

  const violationsCreated = (src.customer360.violations ?? []).filter(
    (v) => (v.occurred_at ?? "").slice(0, 10) === today,
  ).length;

  const complianceChanges = (src.customer360.documents ?? []).filter((d) => {
    const ts = new Date(d.created_at).getTime();
    return !isNaN(ts) && ts >= dayStart.getTime() && ts <= asOf.getTime();
  }).length;

  const tasksCompleted = s.tasks.filter(
    (t) =>
      t.status === "completed" && (t.completed_at ?? "").slice(0, 10) === today,
  ).length;
  const tasksOpen = s.tasks.filter(
    (t) => t.status === "open" || t.status === "in_progress",
  ).length;

  return {
    as_of: asOf.toISOString(),
    payments_received_count: paymentsCount,
    payments_received_amount: perms.canViewFinancials ? paymentsAmount : null,
    rentals_started_count: rentalsStarted,
    rentals_returned_count: rentalsReturned,
    new_overdue_count: newOverdue,
    resolved_overdue_count: resolvedOverdue,
    work_orders_completed_count: woCompleted,
    claims_opened_count: claimsOpened,
    violations_created_count: violationsCreated,
    compliance_changes_count: complianceChanges,
    tasks_completed_count: tasksCompleted,
    tasks_open_count: tasksOpen,
  };
}

/** "How did today go?" — deterministic structured recap (no conclusions). */
export function answerEndOfDayRecap(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  tz?: string,
): CopilotAnswer {
  const ctx = buildEndOfDayContext(src, asOf, perms, tz);
  const base = baseAnswer("end_of_day_recap", asOf, perms, "derived");
  const money =
    perms.canViewFinancials && ctx.payments_received_amount != null
      ? ` (${ctx.payments_received_amount} received)`
      : "";
  return {
    ...base,
    summary: `Today: ${ctx.payments_received_count} payments received${money}, ${ctx.rentals_started_count} rentals started, ${ctx.rentals_returned_count} returned, ${ctx.new_overdue_count} newly overdue, ${ctx.resolved_overdue_count} overdue resolved, ${ctx.work_orders_completed_count} work orders completed, ${ctx.claims_opened_count} damage claims opened, ${ctx.violations_created_count} violations created.`,
    answer_type: "summary",
    facts: [
      { label: "Payments received", value: ctx.payments_received_count },
      {
        label: "Received amount",
        value: ctx.payments_received_amount ?? "—",
        financial: true,
      },
      { label: "Rentals started", value: ctx.rentals_started_count },
      { label: "Rentals returned", value: ctx.rentals_returned_count },
      { label: "Newly overdue", value: ctx.new_overdue_count },
      { label: "Overdue resolved", value: ctx.resolved_overdue_count },
      {
        label: "Work orders completed",
        value: ctx.work_orders_completed_count,
      },
      { label: "Claims opened", value: ctx.claims_opened_count },
      { label: "Violations created", value: ctx.violations_created_count },
      { label: "Compliance changes", value: ctx.compliance_changes_count },
      { label: "Tasks completed", value: ctx.tasks_completed_count },
      { label: "Tasks still open", value: ctx.tasks_open_count },
    ],
    sources: [],
    suggested_actions: [
      {
        label: "Open Action Center",
        action_type: "view_briefing",
        deep_link: "/action-center",
      },
    ],
    caveats: [
      "Structured recap only — no fabricated conclusions. Not scheduled; available on demand.",
      "Newly/resolved overdue are truthful day-over-day transitions, not current-state snapshots.",
    ],
  };
}
