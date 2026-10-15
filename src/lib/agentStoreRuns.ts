// Connect Pro Fleet — agent runs + actions + approvals hook (Build #46).
//
// Owns the AgentRun[] / AgentAction[] / AgentUsageRecord[] state and the
// run/approve/reject/execute logic. Agents operate THROUGH existing
// authoritative domains: task-creating actions route through store.createTask
// (Tasks domain); finance suggestions compose the Expense Ledger without
// duplicate financial truth. High-risk actions always require human approval
// and are never auto-executed. Idempotency is enforced via stable dedupe keys.

import { useCallback, useRef, useState } from "react";
import type {
  AgentAction,
  AgentActionStatus,
  AgentAuditEntry,
  AgentConfig,
  AgentEntitlement,
  AgentId,
  AgentRun,
  AgentRunStatus,
  AgentUsageRecord,
} from "./agentTypes";
import { actionRequiresApproval } from "./agentTypes";
import { agentCanPerform, isAutoExecutable } from "./agentPermissions";
import { validateProposedAction, resolveRiskAndApproval } from "./agentSchema";
import {
  executeAgentRunSync,
  agentActionDedupeKey,
  type AgentActionProposal,
} from "./agentRunEngine";
import {
  isTaskCreatingAction,
  executeProposalAsTask,
} from "./agentActionExecution";
import {
  buildUsageSummary,
  shouldPauseBillableAI,
  currentBillingPeriod,
  isAgentEntitled,
} from "./agentEntitlements";
import { getAgentDefinition } from "./agentRegistry";
import type { BriefingSources } from "./briefingTypes";
import { resolvePerformanceRange } from "./vehiclePerformanceRanges";
import { TENANT_ID, uid } from "./store/ids";
import type { FleetStore } from "./store/storeContext";

const nowIso = () => new Date().toISOString();

export interface AgentRunsState {
  runs: AgentRun[];
  actions: AgentAction[];
  usageRecords: AgentUsageRecord[];
  runAgent: (input: {
    agentId: AgentId;
    trigger: AgentRun["trigger"];
    staffId: string | null;
    cfg: AgentConfig;
    entitlement: AgentEntitlement;
    fleetStore: FleetStore;
  }) => string;
  actionsForRun: (runId: string) => AgentAction[];
  pendingApprovals: () => AgentAction[];
  approveAction: (
    actionId: string,
    staffId: string,
    fleetStore: FleetStore,
  ) => void;
  rejectAction: (actionId: string, staffId: string, reason: string) => void;
  editActionPayload: (
    actionId: string,
    staffId: string,
    patch: Record<string, unknown>,
  ) => void;
  batchApprove: (
    actionIds: string[],
    staffId: string,
    fleetStore: FleetStore,
  ) => { approved: string[]; refused: string[] };
  executeAction: (
    actionId: string,
    staffId: string,
    fleetStore: FleetStore,
  ) => void;
  retryAction: (
    actionId: string,
    staffId: string,
    fleetStore: FleetStore,
  ) => void;
}

function executeActionThroughDomain(
  action: AgentAction,
  fleetStore: FleetStore,
  staffId: string,
): { status: AgentActionStatus; result: string } {
  if (isTaskCreatingAction(action.action_type)) {
    try {
      const proposal: AgentActionProposal = {
        action_type: action.action_type,
        target_type: action.target_type,
        target_id: action.target_id,
        target_label: action.target_label,
        proposed_action: action.proposed_action,
        risk_level: action.risk_level,
        reasons: action.reasons,
        impact: action.impact,
        payload: action.payload,
        deep_link: action.deep_link,
        occurrence: action.dedupe_key,
      };
      const taskId = executeProposalAsTask(
        proposal,
        fleetStore,
        action.agent_id,
      );
      return {
        status: "executed",
        result: `Created task ${taskId} via existing Tasks domain. Approved by ${fleetStore.creatorLabel(staffId)}.`,
      };
    } catch {
      return { status: "failed", result: "Execution failed" };
    }
  }
  return { status: "approved", result: action.result ?? "Approved" };
}

export function useAgentRunsState(
  logAudit: (entry: Omit<AgentAuditEntry, "id" | "tenant_id" | "at">) => void,
): AgentRunsState {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [usageRecords, setUsageRecords] = useState<AgentUsageRecord[]>([]);
  const dedupeKeysRef = useRef<Set<string>>(new Set());

  const runAgent = useCallback(
    (input: Parameters<AgentRunsState["runAgent"]>[0]): string => {
      const { agentId, trigger, staffId, cfg, entitlement, fleetStore } = input;
      const def = getAgentDefinition(agentId);
      const startedAt = nowIso();
      const runId = uid("run");

      if (!isAgentEntitled(entitlement, agentId)) {
        const run: AgentRun = {
          id: runId,
          tenant_id: TENANT_ID,
          agent_id: agentId,
          started_at: startedAt,
          completed_at: nowIso(),
          trigger,
          status: "failed",
          items_reviewed: 0,
          recommendations: 0,
          prepared_actions: 0,
          executed_actions: 0,
          approvals_requested: 0,
          error: "Agent not available on current plan",
          summary: `${def.name} is not available on the current plan.`,
          usage_cost: null,
        };
        setRuns((prev) => [run, ...prev]);
        logAudit({
          event: "run_failed",
          agent_id: agentId,
          actor_staff_id: staffId,
          detail: "Entitlement gate: agent not on plan",
        });
        return runId;
      }

      const asOf = new Date();
      const range = resolvePerformanceRange("ytd", asOf);
      const src: BriefingSources = {
        store: fleetStore,
        paymentArrangements: fleetStore.paymentArrangements,
        arrangementInstallments: fleetStore.arrangementInstallments,
        range,
      };
      const runResult = executeAgentRunSync(agentId, fleetStore, src, asOf);

      const newActions: AgentAction[] = [];
      let approvalsRequested = 0;
      let executedActions = 0;

      for (const proposal of runResult.proposals) {
        if (!agentCanPerform(agentId, proposal.action_type)) continue;
        const validation = validateProposedAction(agentId, {
          action_type: proposal.action_type,
          target_entity_type: proposal.target_type,
          target_entity_id: proposal.target_id,
        });
        if (!validation.valid) continue;

        const dedupeKey = agentActionDedupeKey(agentId, proposal);
        if (dedupeKeysRef.current.has(dedupeKey)) continue;
        dedupeKeysRef.current.add(dedupeKey);

        const { risk, approval_requirement } = resolveRiskAndApproval(
          proposal.action_type,
        );
        const needsApproval = approval_requirement === "required";
        let status: AgentActionStatus = needsApproval
          ? "awaiting_approval"
          : "drafted";
        if (needsApproval) approvalsRequested++;

        let executedAt: string | null = null;
        let result: string | null = null;

        if (
          cfg.auto_create_internal_tasks &&
          !needsApproval &&
          isAutoExecutable(proposal.action_type) &&
          isTaskCreatingAction(proposal.action_type)
        ) {
          try {
            const taskId = executeProposalAsTask(proposal, fleetStore, agentId);
            status = "executed";
            executedAt = nowIso();
            result = `Created task ${taskId} via existing Tasks domain.`;
            executedActions++;
          } catch {
            status = "failed";
            result = "Execution failed";
          }
        }

        newActions.push({
          id: uid("act"),
          tenant_id: TENANT_ID,
          agent_id: agentId,
          run_id: runId,
          action_type: proposal.action_type,
          target_type: proposal.target_type,
          target_id: proposal.target_id,
          target_label: proposal.target_label,
          proposed_action: proposal.proposed_action,
          risk_level: risk as AgentAction["risk_level"],
          approval_requirement,
          status,
          created_at: nowIso(),
          approved_by: null,
          approved_at: null,
          rejected_by: null,
          rejected_at: null,
          executed_at: executedAt,
          result,
          payload: proposal.payload,
          dedupe_key: dedupeKey,
          deep_link: proposal.deep_link,
          reasons: proposal.reasons,
          impact: proposal.impact,
        });
      }

      setActions((prev) => [...newActions, ...prev]);

      if (runResult.usage_cost) {
        setUsageRecords((prev) => [
          {
            id: uid("usage"),
            tenant_id: TENANT_ID,
            agent_type: agentId,
            run_id: runId,
            action_id: null,
            provider: "mock-deterministic",
            model: "dev-v1",
            input_units: 0,
            output_units: 0,
            provider_cost: runResult.usage_cost.provider_cost,
            billable_amount: runResult.usage_cost.billable_amount,
            billing_period: currentBillingPeriod(),
            timestamp: nowIso(),
          },
          ...prev,
        ]);
      }

      const runFailed = runResult.errors.length > 0 && newActions.length === 0;
      const runStatus: AgentRunStatus = runFailed
        ? "failed"
        : approvalsRequested > 0
          ? "needs_approval"
          : "completed";

      const run: AgentRun = {
        id: runId,
        tenant_id: TENANT_ID,
        agent_id: agentId,
        started_at: startedAt,
        completed_at: nowIso(),
        trigger,
        status: runStatus,
        items_reviewed: runResult.items_reviewed,
        recommendations: runResult.recommendations,
        prepared_actions: newActions.length,
        executed_actions: executedActions,
        approvals_requested: approvalsRequested,
        error: runResult.errors[0] ?? null,
        summary: runResult.summary,
        usage_cost: runResult.usage_cost,
      };
      setRuns((prev) => [run, ...prev]);
      logAudit({
        event: runStatus === "failed" ? "run_failed" : "run_completed",
        agent_id: agentId,
        actor_staff_id: staffId,
        detail: run.summary,
      });
      return runId;
    },
    [logAudit],
  );

  const actionsForRun = useCallback(
    (runId: string) => actions.filter((a) => a.run_id === runId),
    [actions],
  );

  const pendingApprovals = useCallback(
    () => actions.filter((a) => a.status === "awaiting_approval"),
    [actions],
  );

  const approveAction = useCallback(
    (actionId: string, staffId: string, fleetStore: FleetStore) => {
      setActions((prev) =>
        prev.map((a) => {
          if (a.id !== actionId || a.status !== "awaiting_approval") return a;
          const { status, result } = executeActionThroughDomain(
            a,
            fleetStore,
            staffId,
          );
          logAudit({
            event:
              status === "executed" ? "action_executed" : "action_approved",
            agent_id: a.agent_id,
            actor_staff_id: staffId,
            detail: `Approved action ${a.action_type} on ${a.target_label}`,
          });
          return {
            ...a,
            status,
            approved_by: staffId,
            approved_at: nowIso(),
            executed_at: status === "executed" ? nowIso() : a.executed_at,
            result,
          };
        }),
      );
    },
    [logAudit],
  );

  const rejectAction = useCallback(
    (actionId: string, staffId: string, reason: string) => {
      setActions((prev) =>
        prev.map((a) => {
          if (a.id !== actionId) return a;
          logAudit({
            event: "action_rejected",
            agent_id: a.agent_id,
            actor_staff_id: staffId,
            detail: `Rejected: ${reason}`,
          });
          return {
            ...a,
            status: "rejected" as AgentActionStatus,
            rejected_by: staffId,
            rejected_at: nowIso(),
            result: reason,
          };
        }),
      );
    },
    [logAudit],
  );

  const editActionPayload = useCallback(
    (actionId: string, staffId: string, patch: Record<string, unknown>) => {
      setActions((prev) =>
        prev.map((a) => {
          if (a.id !== actionId || a.status !== "awaiting_approval") return a;
          logAudit({
            event: "action_edited",
            agent_id: a.agent_id,
            actor_staff_id: staffId,
            detail: `Edited payload for ${a.action_type}`,
          });
          return { ...a, payload: { ...a.payload, ...patch } };
        }),
      );
    },
    [logAudit],
  );

  const batchApprove = useCallback(
    (actionIds: string[], staffId: string, fleetStore: FleetStore) => {
      // Compute approved/refused from the current state so the return value is
      // correct synchronously (the setActions updater does not run eagerly).
      const idSet = new Set(actionIds);
      const approved: string[] = [];
      const refused: string[] = [];
      const updates = new Map<string, AgentAction>();
      for (const a of actions) {
        if (!idSet.has(a.id)) continue;
        if (a.status !== "awaiting_approval") {
          refused.push(a.id);
          continue;
        }
        if (actionRequiresApproval(a.action_type)) {
          refused.push(a.id);
          continue;
        }
        const { status, result } = executeActionThroughDomain(
          a,
          fleetStore,
          staffId,
        );
        approved.push(a.id);
        logAudit({
          event: status === "executed" ? "action_executed" : "action_approved",
          agent_id: a.agent_id,
          actor_staff_id: staffId,
          detail: `Batch-approved ${a.action_type}`,
        });
        updates.set(a.id, {
          ...a,
          status,
          approved_by: staffId,
          approved_at: nowIso(),
          executed_at: status === "executed" ? nowIso() : a.executed_at,
          result,
        });
      }
      if (updates.size > 0) {
        setActions((prev) => prev.map((a) => updates.get(a.id) ?? a));
      }
      return { approved, refused };
    },
    [actions, logAudit],
  );

  const executeAction = useCallback(
    (actionId: string, staffId: string, fleetStore: FleetStore) => {
      setActions((prev) =>
        prev.map((a) => {
          if (a.id !== actionId || a.status !== "approved") return a;
          const { status, result } = executeActionThroughDomain(
            a,
            fleetStore,
            staffId,
          );
          logAudit({
            event:
              status === "executed" ? "action_executed" : "action_approved",
            agent_id: a.agent_id,
            actor_staff_id: staffId,
            detail: `Executed ${a.action_type}`,
          });
          return {
            ...a,
            status,
            executed_at: status === "executed" ? nowIso() : a.executed_at,
            result,
          };
        }),
      );
    },
    [logAudit],
  );

  const retryAction = useCallback(
    (actionId: string, staffId: string, fleetStore: FleetStore) => {
      setActions((prev) =>
        prev.map((a) => {
          if (a.id !== actionId || a.status !== "failed") return a;
          const { status, result } = executeActionThroughDomain(
            a,
            fleetStore,
            staffId,
          );
          logAudit({
            event: status === "executed" ? "action_executed" : "action_failed",
            agent_id: a.agent_id,
            actor_staff_id: staffId,
            detail: `Retried ${a.action_type}`,
          });
          return {
            ...a,
            status,
            executed_at: status === "executed" ? nowIso() : a.executed_at,
            result,
          };
        }),
      );
    },
    [logAudit],
  );

  return {
    runs,
    actions,
    usageRecords,
    runAgent,
    actionsForRun,
    pendingApprovals,
    approveAction,
    rejectAction,
    editActionPayload,
    batchApprove,
    executeAction,
    retryAction,
  };
}

/** Tenant-facing usage summary (provider cost hidden). */
export function buildTenantUsageSummary(
  entitlement: AgentEntitlement,
  usageRecords: AgentUsageRecord[],
) {
  const summary = buildUsageSummary(entitlement, usageRecords, TENANT_ID);
  return {
    billingPeriod: summary.billing_period,
    includedAllowance: summary.included_allowance,
    used: summary.used,
    remaining: summary.remaining,
    overage: summary.overage,
    capReached: summary.cap_reached,
    byAgent: Object.fromEntries(
      summary.by_agent.map((a) => [a.agent_type, a.billable_amount]),
    ),
  };
}

/** Whether billable AI is currently paused (cap reached + pause behavior). */
export function isBillablePaused(
  entitlement: AgentEntitlement,
  usageRecords: AgentUsageRecord[],
): boolean {
  return shouldPauseBillableAI(
    entitlement,
    buildUsageSummary(entitlement, usageRecords, TENANT_ID),
  );
}
