// Connect Pro Fleet — AI Agent Platform types (Build #46).
//
// Agents operate THROUGH existing authoritative domains (Tasks, Expense,
// Investor settlement, Compliance). They create NO shadow records. Every
// action carries transparent, source-backed reasons and a risk level that
// gates whether human approval is required before execution.
//
// High-risk actions (charges, refunds, waivers, deposit applications, external
// messages, partner payouts, settlement approval, compliance overrides) ALWAYS
// require human approval and are never auto-executed, regardless of agent or
// tenant settings.

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------

export type AgentType =
  | "collections"
  | "fleet_readiness"
  | "rental_operations"
  | "maintenance"
  | "finance_review"
  | "compliance"
  | "partner_settlement";

/** Alias kept for modules that use the shorter name. */
export type AgentId = AgentType;

export type AgentEnableState = "enabled" | "paused" | "disabled";

export type AgentMode = "observe" | "prepare" | "execute_with_approval";

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "needs_approval"
  | "partially_completed"
  | "failed"
  | "cancelled";

export type TriggerType = "schedule" | "system_event" | "manual";

export interface AgentRun {
  id: string;
  tenant_id: string;
  agent_id: AgentType;
  started_at: string;
  completed_at: string | null;
  trigger: TriggerType;
  status: AgentRunStatus;
  items_reviewed: number;
  recommendations: number;
  prepared_actions: number;
  executed_actions: number;
  approvals_requested: number;
  error: string | null;
  summary: string;
  /** Usage cost snapshot for this run (provider cost internal; billable external). */
  usage_cost: { provider_cost: number; billable_amount: number } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AgentActionType =
  | "create_task"
  | "readiness_task"
  | "service_task"
  | "renewal_task"
  | "missing_document_task"
  | "prepare_message"
  | "send_external_message"
  | "create_attention_item"
  | "readiness_recommendation"
  | "vehicle_reassignment"
  | "prepare_classification"
  | "prepare_bank_match"
  | "flag_duplicate"
  | "month_end_review"
  | "prepare_settlement"
  | "prepare_statement"
  | "approve_settlement"
  | "record_payout"
  | "compliance_override"
  | "change_rental_terms";

export type AgentActionRisk = "low" | "high";

export type AgentActionStatus =
  | "suggested"
  | "drafted"
  | "awaiting_approval"
  | "approved"
  | "executed"
  | "rejected"
  | "failed"
  | "cancelled";

export type AgentActionTargetType =
  | "rental"
  | "customer"
  | "vehicle"
  | "expense"
  | "bank_transaction"
  | "payment_arrangement"
  | "agreement"
  | "task"
  | "general";

export type AgentActionPayload = Record<string, unknown>;

export interface AgentAction {
  id: string;
  tenant_id: string;
  agent_id: AgentType;
  run_id: string;
  action_type: AgentActionType;
  target_type: AgentActionTargetType;
  target_id: string;
  target_label: string;
  proposed_action: string;
  risk_level: AgentActionRisk;
  approval_requirement: "none" | "required";
  status: AgentActionStatus;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  executed_at: string | null;
  result: string | null;
  /** Structured payload validated against schema before execution. */
  payload: AgentActionPayload;
  /** Stable dedupe key for idempotent execution. */
  dedupe_key: string;
  deep_link: string | null;
  /** Source-backed reasons (operational evidence, not chain-of-thought). */
  reasons: string[];
  impact: string | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AgentConfig {
  agent_id: AgentType;
  enable_state: AgentEnableState;
  /** Maximum operating mode the agent may use. */
  max_mode: AgentMode;
  /** Location scope: empty = All Locations. */
  location_ids: string[];
  /** Whether low-risk internal tasks may be auto-created without approval. */
  auto_create_internal_tasks: boolean;
  /** Safe business preferences (never overrides safety/permission boundaries). */
  preferences: Record<string, unknown>;
  enabled_at: string | null;
  paused_at: string | null;
  disabled_at: string | null;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AgentAuditEventType =
  | "agent_enabled"
  | "agent_paused"
  | "agent_disabled"
  | "settings_changed"
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "action_prepared"
  | "approval_requested"
  | "action_approved"
  | "action_edited"
  | "action_rejected"
  | "action_executed"
  | "action_failed"
  | "spending_cap_changed"
  | "overage_enabled"
  | "overage_disabled";

export interface AgentAuditEntry {
  id: string;
  tenant_id: string;
  at: string;
  event: AgentAuditEventType;
  agent_id: AgentType | null;
  actor_staff_id: string | null;
  detail: string;
}

// ---------------------------------------------------------------------------
// Usage / entitlements / billing
// ---------------------------------------------------------------------------

export interface AgentUsageRecord {
  id: string;
  tenant_id: string;
  agent_type: AgentType | "copilot";
  run_id: string | null;
  action_id: string | null;
  provider: string;
  model: string;
  input_units: number;
  output_units: number;
  /** Internal provider cost (Connect Pro pays). NEVER exposed to tenant. */
  provider_cost: number;
  /** Customer billable amount (tenant owes Connect Pro). */
  billable_amount: number;
  billing_period: string;
  timestamp: string;
}

/** Alias for modules using the AI-prefixed name. */
export type AIUsageRecord = AgentUsageRecord;

export type UsageAlertThreshold = 50 | 75 | 90 | 100;

export interface AgentEntitlement {
  copilot_available: boolean;
  agents_available: boolean;
  included_agents: AgentType[];
  agents_addon_available: boolean;
  included_allowance: number;
  overage_available: boolean;
  overage_enabled: boolean;
  /** Monthly spending cap in billable dollars (0 = no cap). */
  spending_cap: number;
  /** Whether live SaaS overage billing is connected. */
  saas_billing_connected: boolean;
  /** Clearly labels dev/demo entitlements. */
  is_dev: boolean;
}

/** Alias for modules using the AI-prefixed name. */
export type AIEntitlement = AgentEntitlement;

export interface AITenantUsageSummary {
  billing_period: string;
  included_allowance: number;
  used: number;
  remaining: number;
  overage: number;
  by_agent: { agent_type: AgentType | "copilot"; billable_amount: number }[];
  cap_reached: boolean;
  alert_threshold: UsageAlertThreshold | null;
  is_dev: boolean;
}

export interface AgentOverageRecord {
  id: string;
  tenant_id: string;
  billing_period: string;
  usage_amount: number;
  billable_overage: number;
  status: "pending" | "invoiced" | "waived";
  created_at: string;
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

/** Actions that ALWAYS require human approval, regardless of agent settings.
 *  High-impact financial/customer actions never execute automatically. */
export const HIGH_RISK_ACTION_TYPES: Set<AgentActionType> = new Set([
  "send_external_message",
  "vehicle_reassignment",
  "approve_settlement",
  "record_payout",
  "compliance_override",
  "change_rental_terms",
]);

/** Whether an action type requires human approval before execution. */
export function actionRequiresApproval(type: AgentActionType): boolean {
  return HIGH_RISK_ACTION_TYPES.has(type);
}

/** Risk level for an action type. */
export function actionRisk(type: AgentActionType): AgentActionRisk {
  return actionRequiresApproval(type) ? "high" : "low";
}
