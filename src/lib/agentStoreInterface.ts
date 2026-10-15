// Connect Pro Fleet — AI Agent store interface (Build #46).
//
// Standalone tenant-scoped context for the AI Agent Platform. Coordinates with
// existing authoritative domains: agent-created tasks use the existing Tasks
// domain; agent-prepared settlements use the existing Investor settlement
// domain; agent finance suggestions compose the Expense Ledger without
// creating duplicate financial truth.
//
// Usage metering is separate from the rental operator's business Expense
// Ledger — SaaS AI billing never becomes a rental expense automatically.

import type {
  AgentAction,
  AgentActionStatus,
  AgentActionType,
  AgentActionTargetType,
  AgentAuditEntry,
  AgentConfig,
  AgentEntitlement,
  AgentId,
  AgentOverageRecord,
  AgentRun,
  AgentUsageRecord,
  AgentEnableState,
  AgentMode,
} from "./agentTypes";

export interface AgentStore {
  // --- state ---------------------------------------------------------------
  runs: AgentRun[];
  actions: AgentAction[];
  audit: AgentAuditEntry[];
  configs: AgentConfig[];
  entitlement: AgentEntitlement;
  overageRecords: AgentOverageRecord[];
  /** Raw usage records (provider cost internal; never exposed to tenant UI). */
  usageRecords: AgentUsageRecord[];
  /** Whether a production AI provider is connected (honest V1 state). */
  productionProviderConnected: boolean;

  // --- config / entitlement ------------------------------------------------
  getConfig: (agentId: AgentId) => AgentConfig;
  setAgentEnableState: (agentId: AgentId, state: AgentEnableState) => void;
  setAgentMaxMode: (agentId: AgentId, mode: AgentMode) => void;
  setAgentLocations: (agentId: AgentId, locationIds: string[]) => void;
  setAutoCreateInternalTasks: (agentId: AgentId, enabled: boolean) => void;
  setAgentPreference: (agentId: AgentId, key: string, value: unknown) => void;
  updateEntitlement: (patch: Partial<AgentEntitlement>) => void;
  setMonthlySpendingCap: (cap: number | null) => void;
  setOverageEnabled: (enabled: boolean) => void;

  // --- runs ----------------------------------------------------------------
  /** Run an agent deterministically (manual or simulated trigger). Creates an
   *  authoritative AgentRun + prepared AgentActions through existing domains.
   *  Returns the run id. */
  runAgent: (input: {
    agentId: AgentId;
    trigger: AgentRun["trigger"];
    staffId: string | null;
  }) => string;

  // --- actions / approvals -------------------------------------------------
  actionsForRun: (runId: string) => AgentAction[];
  pendingApprovals: () => AgentAction[];
  approveAction: (actionId: string, staffId: string) => void;
  rejectAction: (actionId: string, staffId: string, reason: string) => void;
  editActionPayload: (
    actionId: string,
    staffId: string,
    patch: Record<string, unknown>,
  ) => void;
  /** Batch-approve low-risk similar actions. High-risk actions are refused. */
  batchApprove: (
    actionIds: string[],
    staffId: string,
  ) => {
    approved: string[];
    refused: string[];
  };
  /** Execute an approved action through the existing authoritative domain.
   *  Idempotent: a stable dedupe_key prevents duplicate execution. */
  executeAction: (actionId: string, staffId: string) => void;
  /** Retry a failed action (idempotent). */
  retryAction: (actionId: string, staffId: string) => void;

  // --- usage / metering ----------------------------------------------------
  usageForBillingPeriod: (billingPeriod: string) => {
    totalBillable: number;
    totalProviderCost: number;
    byAgent: Record<
      string,
      { billable: number; providerCost: number; actions: number }
    >;
    records: AgentUsageRecord[];
  };
  /** Tenant-facing usage summary (provider cost hidden). */
  tenantUsageSummary: () => {
    billingPeriod: string;
    includedAllowance: number;
    used: number;
    remaining: number;
    overage: number;
    capReached: boolean;
    byAgent: Record<string, number>;
  };
  /** Whether billable AI is currently paused (cap reached + pause behavior). */
  billablePaused: () => boolean;

  // --- audit ---------------------------------------------------------------
  logAudit: (entry: Omit<AgentAuditEntry, "id" | "tenant_id" | "at">) => void;
}

// Re-export trigger type for the interface signature.
import type { AgentRun as _Run } from "./agentTypes";
type _Trigger = _Run["trigger"];
export type { _Trigger as AgentTriggerInput };
