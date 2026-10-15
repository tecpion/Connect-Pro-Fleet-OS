// Connect Pro Fleet — AI Agent store provider (Build #46).
//
// Thin React context that composes the config + runs hooks into the
// AgentStore interface. Agents operate THROUGH existing authoritative
// domains (Tasks, Expense, Investor settlement). Usage metering is separate
// from the rental operator's business Expense Ledger. Production AI provider
// is NOT connected in V1 (deterministic mock); reported honestly.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { AgentAuditEntry, AgentOverageRecord } from "./agentTypes";
import { isProductionAiConnected } from "./agentProvider";
import { useAgentConfigState, makeAuditEntry } from "./agentStoreConfig";
import {
  useAgentRunsState,
  buildTenantUsageSummary,
  isBillablePaused,
} from "./agentStoreRuns";
import { useStore } from "./store";
import type { AgentStore } from "./agentStoreInterface";

const AgentStoreContext = createContext<AgentStore | null>(null);

export function AgentStoreProvider({ children }: { children: ReactNode }) {
  const fleetStore = useStore();
  const [audit, setAudit] = useState<AgentAuditEntry[]>([]);
  const [overageRecords] = useState<AgentOverageRecord[]>([]);

  const logAudit = useCallback(
    (entry: Omit<AgentAuditEntry, "id" | "tenant_id" | "at">) => {
      setAudit((prev) => [makeAuditEntry(entry), ...prev]);
    },
    [],
  );

  const cfgState = useAgentConfigState(logAudit, fleetStore.currentStaffId);
  const runsState = useAgentRunsState(logAudit);

  const runAgent = useCallback(
    (input: {
      agentId: Parameters<AgentStore["runAgent"]>[0]["agentId"];
      trigger: Parameters<AgentStore["runAgent"]>[0]["trigger"];
      staffId: string | null;
    }) =>
      runsState.runAgent({
        agentId: input.agentId,
        trigger: input.trigger,
        staffId: input.staffId,
        cfg: cfgState.getConfig(input.agentId),
        entitlement: cfgState.entitlement,
        fleetStore,
      }),
    [runsState, cfgState, fleetStore],
  );

  const approveAction = useCallback(
    (actionId: string, staffId: string) =>
      runsState.approveAction(actionId, staffId, fleetStore),
    [runsState, fleetStore],
  );
  const batchApprove = useCallback(
    (actionIds: string[], staffId: string) =>
      runsState.batchApprove(actionIds, staffId, fleetStore),
    [runsState, fleetStore],
  );
  const executeAction = useCallback(
    (actionId: string, staffId: string) =>
      runsState.executeAction(actionId, staffId, fleetStore),
    [runsState, fleetStore],
  );
  const retryAction = useCallback(
    (actionId: string, staffId: string) =>
      runsState.retryAction(actionId, staffId, fleetStore),
    [runsState, fleetStore],
  );

  const usageForBillingPeriod = useCallback(
    (billingPeriod: string) => {
      const records = runsState.usageRecords.filter(
        (r) => r.billing_period === billingPeriod,
      );
      const totalBillable = records.reduce((s, r) => s + r.billable_amount, 0);
      const totalProviderCost = records.reduce(
        (s, r) => s + r.provider_cost,
        0,
      );
      const byAgent: Record<
        string,
        { billable: number; providerCost: number; actions: number }
      > = {};
      for (const r of records) {
        const key = r.agent_type;
        if (!byAgent[key])
          byAgent[key] = { billable: 0, providerCost: 0, actions: 0 };
        byAgent[key].billable += r.billable_amount;
        byAgent[key].providerCost += r.provider_cost;
        byAgent[key].actions += 1;
      }
      return { totalBillable, totalProviderCost, byAgent, records };
    },
    [runsState.usageRecords],
  );

  const tenantUsageSummary = useCallback(
    () => buildTenantUsageSummary(cfgState.entitlement, runsState.usageRecords),
    [cfgState.entitlement, runsState.usageRecords],
  );

  const billablePaused = useCallback(
    () => isBillablePaused(cfgState.entitlement, runsState.usageRecords),
    [cfgState.entitlement, runsState.usageRecords],
  );

  const store = useMemo<AgentStore>(
    () => ({
      runs: runsState.runs,
      actions: runsState.actions,
      audit,
      configs: cfgState.configs,
      entitlement: cfgState.entitlement,
      overageRecords,
      usageRecords: runsState.usageRecords,
      productionProviderConnected: isProductionAiConnected(),
      getConfig: cfgState.getConfig,
      setAgentEnableState: cfgState.setAgentEnableState,
      setAgentMaxMode: cfgState.setAgentMaxMode,
      setAgentLocations: cfgState.setAgentLocations,
      setAutoCreateInternalTasks: cfgState.setAutoCreateInternalTasks,
      setAgentPreference: cfgState.setAgentPreference,
      updateEntitlement: cfgState.updateEntitlement,
      setMonthlySpendingCap: cfgState.setMonthlySpendingCap,
      setOverageEnabled: cfgState.setOverageEnabled,
      runAgent,
      actionsForRun: runsState.actionsForRun,
      pendingApprovals: runsState.pendingApprovals,
      approveAction,
      rejectAction: runsState.rejectAction,
      editActionPayload: runsState.editActionPayload,
      batchApprove,
      executeAction,
      retryAction,
      usageForBillingPeriod,
      tenantUsageSummary,
      billablePaused,
      logAudit,
    }),
    [
      runsState.runs,
      runsState.actions,
      runsState.actionsForRun,
      runsState.pendingApprovals,
      runsState.rejectAction,
      runsState.editActionPayload,
      runsState.usageRecords,
      audit,
      cfgState.configs,
      cfgState.entitlement,
      cfgState.getConfig,
      cfgState.setAgentEnableState,
      cfgState.setAgentMaxMode,
      cfgState.setAgentLocations,
      cfgState.setAutoCreateInternalTasks,
      cfgState.setAgentPreference,
      cfgState.updateEntitlement,
      cfgState.setMonthlySpendingCap,
      cfgState.setOverageEnabled,
      overageRecords,
      runAgent,
      approveAction,
      batchApprove,
      executeAction,
      retryAction,
      usageForBillingPeriod,
      tenantUsageSummary,
      billablePaused,
      logAudit,
    ],
  );

  return (
    <AgentStoreContext.Provider value={store}>
      {children}
    </AgentStoreContext.Provider>
  );
}

export function useAgentStore(): AgentStore {
  const ctx = useContext(AgentStoreContext);
  if (!ctx)
    throw new Error("useAgentStore must be used within AgentStoreProvider");
  return ctx;
}
