// Connect Pro Fleet — AI Workforce workspace selectors (Build #47 UX polish).
//
// Pure presentation layer that DERIVES customer-facing workspace state from
// authoritative AgentRun / AgentAction / AgentConfig / AgentEntitlement data.
// It creates NO new records, NO second ledger, NO second task engine. It only
// interprets existing authoritative records for the tenant-facing workspace.
//
// Customer-facing statuses hide engineering "framework-only" terminology:
// working agents show Active/Paused/Disabled; non-working agents show
// Beta / Coming Soon / Upgrade Required based on entitlement + readiness.

import type {
  AgentAction,
  AgentActionStatus,
  AgentConfig,
  AgentEntitlement,
  AgentId,
  AgentMode,
  AgentRun,
  AgentUsageRecord,
} from "./agentTypes";
import {
  AGENT_LIST,
  WORKING_AGENTS,
  getAgentDefinition,
} from "./agentRegistry";
import { isAgentEntitled } from "./agentEntitlements";
import { buildUsageSummary } from "./agentEntitlements";
import { TENANT_ID } from "./store/ids";

/** Customer-facing agent status (never exposes "framework-only"). */
export type CustomerAgentStatus =
  | "Active"
  | "Paused"
  | "Disabled"
  | "Beta"
  | "Coming Soon"
  | "Upgrade Required";

/** A run that is considered "today" (same calendar day as now). */
function isToday(iso: string, now: Date): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** The customer-facing status for an agent given its config + entitlement. */
export function customerAgentStatus(
  agentId: AgentId,
  cfg: AgentConfig,
  entitlement: AgentEntitlement,
): CustomerAgentStatus {
  const def = getAgentDefinition(agentId);
  // Entitlement gate first — a non-entitled agent is upgrade-required.
  if (!isAgentEntitled(entitlement, agentId)) return "Upgrade Required";
  // Non-working agents are never "Active" — they are Beta (registered) or
  // Coming Soon depending on whether they have any implementation hooks.
  if (!def.v1_working) {
    return "Beta";
  }
  switch (cfg.enable_state) {
    case "enabled":
      return "Active";
    case "paused":
      return "Paused";
    case "disabled":
    default:
      return "Disabled";
  }
}

/** Whether an agent may be manually run now (working + entitled + enabled +
 *  not already running). Framework-only agents cannot be run. */
export function canRunAgentNow(
  agentId: AgentId,
  cfg: AgentConfig,
  entitlement: AgentEntitlement,
  runs: AgentRun[],
): boolean {
  const def = getAgentDefinition(agentId);
  if (!def.v1_working) return false;
  if (!isAgentEntitled(entitlement, agentId)) return false;
  if (cfg.enable_state !== "enabled") return false;
  // Prevent duplicate simultaneous runs: if the most recent run is still
  // running/queued, do not allow another.
  const last = runs.find((r) => r.agent_id === agentId);
  if (last && (last.status === "running" || last.status === "queued")) {
    return false;
  }
  return true;
}

/** The last run for an agent (runs are newest-first), or null. */
export function lastRunFor(
  agentId: AgentId,
  runs: AgentRun[],
): AgentRun | null {
  return runs.find((r) => r.agent_id === agentId) ?? null;
}

/** A human-readable "next run" label derived from the configured trigger.
 *  V1 has no production scheduler, so this is configuration-only. */
export function nextRunLabel(agentId: AgentId, cfg: AgentConfig): string {
  if (cfg.enable_state !== "enabled") return "—";
  const def = getAgentDefinition(agentId);
  // Map the default trigger to a friendly next-run hint.
  const trigger = def.default_trigger.toLowerCase();
  if (trigger.includes("morning")) return "Tomorrow morning";
  if (trigger.includes("evening")) return "Tonight";
  if (trigger.includes("settlement")) return "Settlement period end";
  if (trigger.includes("month")) return "Month-end";
  if (trigger.includes("daily")) return "Tomorrow";
  return def.default_trigger;
}

/** Summary KPIs for the AI Workforce overview header. */
export interface WorkforceSummaryKpis {
  activeAgents: number;
  approvalsWaiting: number;
  actionsPreparedToday: number;
  aiUsageThisPeriod: number;
  successfulActionsToday: number;
}

export function workforceSummaryKpis(
  configs: AgentConfig[],
  actions: AgentAction[],
  entitlement: AgentEntitlement,
  usageRecords: AgentUsageRecord[],
  now: Date = new Date(),
): WorkforceSummaryKpis {
  const activeAgents = configs.filter(
    (c) =>
      c.enable_state === "enabled" &&
      getAgentDefinition(c.agent_id).v1_working &&
      isAgentEntitled(entitlement, c.agent_id),
  ).length;

  const approvalsWaiting = actions.filter(
    (a) => a.status === "awaiting_approval",
  ).length;

  const actionsPreparedToday = actions.filter((a) =>
    isToday(a.created_at, now),
  ).length;

  const successfulActionsToday = actions.filter(
    (a) =>
      isToday(a.created_at, now) &&
      (a.status === "executed" || a.status === "approved"),
  ).length;

  const summary = buildUsageSummary(entitlement, usageRecords, TENANT_ID, now);
  return {
    activeAgents,
    approvalsWaiting,
    actionsPreparedToday,
    aiUsageThisPeriod: summary.used,
    successfulActionsToday,
  };
}

/** Compact plan / entitlement summary for the overview. */
export interface PlanSummary {
  planLabel: string;
  includedAllowance: number;
  usedThisPeriod: number;
  remainingAllowance: number;
  overageEnabled: boolean;
  spendingCap: number;
  isDev: boolean;
  saasBillingConnected: boolean;
}

export function planSummary(
  entitlement: AgentEntitlement,
  usageRecords: AgentUsageRecord[],
  now: Date = new Date(),
): PlanSummary {
  const summary = buildUsageSummary(entitlement, usageRecords, TENANT_ID, now);
  const planLabel = entitlement.agents_available
    ? entitlement.agents_addon_available
      ? "AI Workforce — Add-on"
      : "AI Workforce"
    : "Not included";
  return {
    planLabel,
    includedAllowance: entitlement.included_allowance,
    usedThisPeriod: summary.used,
    remainingAllowance: summary.remaining,
    overageEnabled: entitlement.overage_enabled,
    spendingCap: entitlement.spending_cap,
    isDev: entitlement.is_dev,
    saasBillingConnected: entitlement.saas_billing_connected,
  };
}

/** Per-agent card view model for the overview grid. */
export interface AgentCardVm {
  id: AgentId;
  name: string;
  goal: string;
  valueStatement: string;
  status: CustomerAgentStatus;
  modeLabel: string;
  lastRun: AgentRun | null;
  lastRunLabel: string;
  nextRunLabel: string;
  itemsReviewed: number;
  actionsPrepared: number;
  approvalsWaiting: number;
  usageThisPeriod: number;
  canRunNow: boolean;
  canManage: boolean;
  isWorking: boolean;
  isEntitled: boolean;
}

const MODE_LABELS: Record<string, string> = {
  observe: "Observe",
  prepare: "Prepare",
  execute_with_approval: "Prepare + Approval",
};

/** A concise value statement for each agent (business outcome, not tech). */
export function agentValueStatement(agentId: AgentId): string {
  const map: Record<AgentId, string> = {
    collections:
      "Finds overdue balances, prepares follow-up, and escalates broken payment arrangements.",
    fleet_readiness:
      "Checks upcoming rentals and identifies vehicles that are not ready.",
    rental_operations:
      "Spots rental lifecycle problems before they disrupt operations.",
    maintenance:
      "Flags overdue service and repeated maintenance patterns to reduce downtime.",
    finance_review:
      "Finds unmatched transactions, missing documentation, and possible duplicates.",
    compliance:
      "Catches expiring registrations and compliance blockers before they block rentals.",
    partner_settlement:
      "Prepares accurate partner/JV settlements for human review.",
  };
  return map[agentId];
}

export function agentCardVm(
  agentId: AgentId,
  cfg: AgentConfig,
  entitlement: AgentEntitlement,
  runs: AgentRun[],
  actions: AgentAction[],
  usageRecords: AgentUsageRecord[],
  canManage: boolean,
  now: Date = new Date(),
): AgentCardVm {
  const def = getAgentDefinition(agentId);
  const lastRun = lastRunFor(agentId, runs);
  const agentActions = actions.filter((a) => a.agent_id === agentId);
  const approvalsWaiting = agentActions.filter(
    (a) => a.status === "awaiting_approval",
  ).length;
  const usage = buildUsageSummary(entitlement, usageRecords, TENANT_ID, now);
  const agentUsage =
    usage.by_agent.find((b) => b.agent_type === agentId)?.billable_amount ?? 0;
  return {
    id: agentId,
    name: def.name,
    goal: def.goal,
    valueStatement: agentValueStatement(agentId),
    status: customerAgentStatus(agentId, cfg, entitlement),
    modeLabel: MODE_LABELS[cfg.max_mode] ?? MODE_LABELS[def.default_mode],
    lastRun,
    lastRunLabel: lastRun
      ? new Date(lastRun.completed_at ?? lastRun.started_at).toLocaleString(
          "en-US",
          {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          },
        )
      : "—",
    nextRunLabel: nextRunLabel(agentId, cfg),
    itemsReviewed: lastRun?.items_reviewed ?? 0,
    actionsPrepared: agentActions.length,
    approvalsWaiting,
    usageThisPeriod: agentUsage,
    canRunNow: canRunAgentNow(agentId, cfg, entitlement, runs),
    canManage,
    isWorking: def.v1_working,
    isEntitled: isAgentEntitled(entitlement, agentId),
  };
}

/** All agent card view models. */
export function allAgentCardVms(
  configs: AgentConfig[],
  entitlement: AgentEntitlement,
  runs: AgentRun[],
  actions: AgentAction[],
  usageRecords: AgentUsageRecord[],
  canManage: boolean,
  now: Date = new Date(),
): AgentCardVm[] {
  return AGENT_LIST.map((def) =>
    agentCardVm(
      def.id,
      configs.find((c) => c.agent_id === def.id) ?? {
        agent_id: def.id,
        enable_state: "disabled",
        max_mode: def.default_mode,
        location_ids: [],
        auto_create_internal_tasks: false,
        preferences: {},
        enabled_at: null,
        paused_at: null,
        disabled_at: null,
      },
      entitlement,
      runs,
      actions,
      usageRecords,
      canManage,
      now,
    ),
  );
}

// ---------------------------------------------------------------------------
// Outcome metrics — factual, authoritative, no opaque scores, no fake ROI.
// ---------------------------------------------------------------------------

export interface AgentOutcomeMetrics {
  agentId: AgentId;
  /** Total items reviewed across all runs. */
  itemsReviewed: number;
  /** Total actions prepared. */
  actionsPrepared: number;
  /** Actions executed (approved + executed). */
  actionsExecuted: number;
  /** Actions rejected. */
  actionsRejected: number;
  /** Actions failed. */
  actionsFailed: number;
  /** Runs completed. */
  runsCompleted: number;
}

export function agentOutcomeMetrics(
  agentId: AgentId,
  runs: AgentRun[],
  actions: AgentAction[],
): AgentOutcomeMetrics {
  const agentRuns = runs.filter((r) => r.agent_id === agentId);
  const agentActions = actions.filter((a) => a.agent_id === agentId);
  return {
    agentId,
    itemsReviewed: agentRuns.reduce((s, r) => s + r.items_reviewed, 0),
    actionsPrepared: agentActions.length,
    actionsExecuted: agentActions.filter(
      (a) => a.status === "executed" || a.status === "approved",
    ).length,
    actionsRejected: agentActions.filter((a) => a.status === "rejected").length,
    actionsFailed: agentActions.filter((a) => a.status === "failed").length,
    runsCompleted: agentRuns.filter((r) => r.status === "completed").length,
  };
}

// ---------------------------------------------------------------------------
// Activity tab — action-level activity rows (not just runs).
// ---------------------------------------------------------------------------

export type ActivityStatusFilter =
  | "all"
  | "reviewed"
  | "suggested"
  | "prepared"
  | "awaiting_approval"
  | "executed"
  | "rejected"
  | "failed";

/** Map an action status to the activity filter bucket. */
export function actionStatusToActivityFilter(
  status: AgentActionStatus,
): ActivityStatusFilter {
  switch (status) {
    case "awaiting_approval":
      return "awaiting_approval";
    case "executed":
      return "executed";
    case "approved":
      return "executed";
    case "rejected":
      return "rejected";
    case "failed":
      return "failed";
    case "drafted":
      return "prepared";
    case "suggested":
      return "suggested";
    default:
      return "prepared";
  }
}

export interface ActivityRow {
  action: AgentAction;
  agentName: string;
  statusLabel: string;
  approverLabel: string | null;
}

/** Build activity rows from actions, optionally filtered by agent + status. */
export function activityRows(
  actions: AgentAction[],
  agentFilter: AgentId | null,
  statusFilter: ActivityStatusFilter,
): ActivityRow[] {
  return actions
    .filter((a) => (agentFilter ? a.agent_id === agentFilter : true))
    .filter((a) =>
      statusFilter === "all"
        ? true
        : statusFilter === "reviewed"
          ? true // reviewed = all action rows (they all came from a review)
          : actionStatusToActivityFilter(a.status) === statusFilter,
    )
    .map((a) => ({
      action: a,
      agentName: getAgentDefinition(a.agent_id).name,
      statusLabel: a.status.replace(/_/g, " "),
      approverLabel: a.approved_by,
    }));
}

// ---------------------------------------------------------------------------
// Setup wizard state — whether the tenant has completed first-time setup.
// ---------------------------------------------------------------------------

/** Whether first-time AI Workforce setup is complete (at least one agent
 *  enabled). When false, the overview prompts the setup wizard. */
export function isSetupComplete(configs: AgentConfig[]): boolean {
  return configs.some((c) => c.enable_state === "enabled");
}

/** The recommended initial agents for setup (the three working agents). */
export function recommendedSetupAgents(): AgentId[] {
  return [...WORKING_AGENTS];
}

/** Valid operating modes for an agent (all agents support all three in V1,
 *  but high-risk execution is always approval-gated regardless of mode). */
export function validModesForAgent(_agentId: AgentId): AgentMode[] {
  return ["observe", "prepare", "execute_with_approval"];
}

/** Spending-cap UI presets (UI only — not hardcoded pricing logic). */
export const SPENDING_CAP_PRESETS: number[] = [25, 50, 100, 250];

/** Approval-preference options (high-risk actions always require approval
 *  regardless of preference — these never override safety). */
export type ApprovalPreference =
  "always_require" | "external_only" | "allow_internal_tasks";

/** Whether the AI Workforce is production-ready (honest V1 state). */
export function aiWorkforceProductionReady(): {
  architectureComplete: boolean;
  productionProviderConnected: boolean;
  liveOverageCharging: boolean;
} {
  return {
    architectureComplete: true,
    productionProviderConnected: false,
    liveOverageCharging: false,
  };
}

/** Which agents perform working actions today vs framework-only. */
export function agentReadinessReport(): {
  working: AgentId[];
  frameworkOnly: AgentId[];
} {
  return {
    working: [...WORKING_AGENTS],
    frameworkOnly: AGENT_LIST.filter((d) => !d.v1_working).map((d) => d.id),
  };
}
