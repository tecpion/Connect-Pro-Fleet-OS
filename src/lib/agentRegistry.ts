// Connect Pro Fleet — AI Agent registry (Build #46).
//
// First-party, vetted agents only. Each agent has a controlled responsibility
// model: what it can monitor, prepare, and (with approval) execute. Agents
// never get unrestricted database mutation access — they operate through an
// allowlist of approved internal action types (agentPermissions.ts).
//
// V1 working agents (actual observe/prepare implementations):
//   1. collections
//   2. fleet_readiness
//   3. finance_review
// Other agents are registered (framework-complete) but framework-only.

import type { AgentActionType, AgentId, AgentMode } from "./agentTypes";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  goal: string;
  description: string;
  /** Default operating mode. */
  default_mode: AgentMode;
  /** Permission modules the agent may read from. */
  data_access: string[];
  /** Actions this agent may prepare (allowlist). */
  can_prepare: AgentActionType[];
  /** Actions that always require human approval regardless of settings. */
  approval_actions: AgentActionType[];
  /** Actions this agent can NEVER perform. */
  cannot_perform: string[];
  /** Default trigger schedule description. */
  default_trigger: string;
  /** Whether this agent has a working V1 observe/prepare implementation. */
  v1_working: boolean;
}

export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  collections: {
    id: "collections",
    name: "Collections Agent",
    goal: "Reduce unresolved overdue balances and stay ahead of broken payment arrangements.",
    description:
      "Monitors overdue balances, due-today balances, and broken payment arrangements. Prepares follow-up tasks and reminder drafts. Sending external messages always requires approval.",
    default_mode: "prepare",
    data_access: [
      "Rentals",
      "Customers",
      "Payment Arrangements",
      "Collections",
    ],
    can_prepare: ["create_task", "prepare_message", "create_attention_item"],
    approval_actions: ["send_external_message"],
    cannot_perform: [
      "Charge customer cards",
      "Waive balances",
      "Apply deposits",
      "Issue refunds",
      "Repossess vehicles",
      "Modify customer balances",
    ],
    default_trigger: "Daily morning scan",
    v1_working: true,
  },
  fleet_readiness: {
    id: "fleet_readiness",
    name: "Fleet Readiness Agent",
    goal: "Ensure vehicles needed for upcoming rentals are operationally ready.",
    description:
      "Monitors upcoming reservations, blocked vehicles, maintenance, and compliance readiness. Prepares readiness attention items and tasks. Vehicle reassignment requires approval.",
    default_mode: "prepare",
    data_access: [
      "Vehicles",
      "Rentals",
      "Compliance",
      "Maintenance",
      "Inspections",
    ],
    can_prepare: [
      "create_task",
      "create_attention_item",
      "readiness_recommendation",
    ],
    approval_actions: ["vehicle_reassignment"],
    cannot_perform: [
      "Alter reservation vehicle assignment automatically",
      "Override compliance rules",
      "Approve repair spending",
    ],
    default_trigger: "Evening + before upcoming pickup window",
    v1_working: true,
  },
  rental_operations: {
    id: "rental_operations",
    name: "Rental Operations Agent",
    goal: "Identify rental lifecycle problems before they disrupt operations.",
    description:
      "Monitors pickups, returns, extensions, overdue rentals, missing agreements, and incomplete inspections. Prepares operational tasks and checklists.",
    default_mode: "prepare",
    data_access: ["Rentals", "Customers", "Vehicles", "Inspections"],
    can_prepare: ["create_task", "prepare_message", "create_attention_item"],
    approval_actions: ["change_rental_terms"],
    cannot_perform: [
      "Change rental contracts",
      "Change billing",
      "Issue refunds",
    ],
    default_trigger: "Daily + before pickup/return windows",
    v1_working: false,
  },
  maintenance: {
    id: "maintenance",
    name: "Maintenance Agent",
    goal: "Keep vehicles serviceable and reduce avoidable downtime.",
    description:
      "Monitors overdue maintenance, upcoming service, active work orders, and repeated maintenance patterns. Prepares service tasks and review items.",
    default_mode: "prepare",
    data_access: ["Maintenance", "Vehicles", "Expenses"],
    can_prepare: [
      "create_task",
      "create_attention_item",
      "readiness_recommendation",
    ],
    approval_actions: [],
    cannot_perform: [
      "Approve repair spending",
      "Create authoritative expense records",
      "Reverse expenses",
    ],
    default_trigger: "Daily",
    v1_working: false,
  },
  finance_review: {
    id: "finance_review",
    name: "Finance Review Agent",
    goal: "Keep operational financial records clean and ready for review.",
    description:
      "Monitors unallocated expenses, missing supporting documentation, unmatched bank transactions, duplicate candidates, and month-end checklist. Follows the Master Financial System Specification.",
    default_mode: "prepare",
    data_access: ["Expenses", "Banking", "Reconciliation", "Documents"],
    can_prepare: [
      "create_task",
      "prepare_classification",
      "prepare_bank_match",
      "flag_duplicate",
      "month_end_review",
      "create_attention_item",
    ],
    approval_actions: [],
    cannot_perform: [
      "Create authoritative financial records without duplicate check",
      "Reconcile statements",
      "Reverse expenses",
      "Apply deposits",
      "Issue refunds",
      "Change financial amounts",
      "Classify deposits as revenue",
    ],
    default_trigger: "Daily + month-end",
    v1_working: true,
  },
  compliance: {
    id: "compliance",
    name: "Compliance Agent",
    goal: "Prevent avoidable compliance blockers before they block rentals.",
    description:
      "Monitors registration, insurance, required documents, expirations, and blockers. Prepares renewal tasks and document requests.",
    default_mode: "prepare",
    data_access: ["Compliance", "Vehicles", "Customers"],
    can_prepare: ["create_task", "prepare_message", "create_attention_item"],
    approval_actions: ["compliance_override"],
    cannot_perform: [
      "Override compliance rules",
      "Remove blockers automatically",
    ],
    default_trigger: "Daily",
    v1_working: false,
  },
  partner_settlement: {
    id: "partner_settlement",
    name: "Partner Settlement Agent",
    goal: "Prepare accurate partner/JV settlements for human review.",
    description:
      "Monitors active agreements, settlement periods, revenue, included expenses, and recoveries. Prepares projected settlements and statement drafts. Settlement approval and payout recording always require human action.",
    default_mode: "prepare",
    data_access: [
      "Investor & Partner Management",
      "Vehicle Performance",
      "Expenses",
    ],
    can_prepare: [
      "prepare_settlement",
      "prepare_statement",
      "create_attention_item",
    ],
    approval_actions: ["approve_settlement", "record_payout"],
    cannot_perform: [
      "Approve settlement",
      "Record partner payout",
      "Send money",
      "Alter historical agreement terms",
    ],
    default_trigger: "Settlement period end",
    v1_working: false,
  },
};

export const ALL_AGENT_TYPES: AgentId[] = Object.keys(
  AGENT_REGISTRY,
) as AgentId[];

export const WORKING_AGENTS: AgentId[] = ALL_AGENT_TYPES.filter(
  (a) => AGENT_REGISTRY[a].v1_working,
);

export const FRAMEWORK_ONLY_AGENTS: AgentId[] = ALL_AGENT_TYPES.filter(
  (a) => !AGENT_REGISTRY[a].v1_working,
);

export function getAgentDefinition(id: AgentId): AgentDefinition {
  return AGENT_REGISTRY[id];
}

/** Whether an action type is allowed for an agent (prepare OR approval list). */
export function isActionAllowed(
  agentId: AgentId,
  actionType: AgentActionType,
): boolean {
  const def = AGENT_REGISTRY[agentId];
  if (!def) return false;
  return (
    def.can_prepare.includes(actionType) ||
    def.approval_actions.includes(actionType)
  );
}

export const AGENT_LIST: AgentDefinition[] = ALL_AGENT_TYPES.map(
  (id) => AGENT_REGISTRY[id],
);
