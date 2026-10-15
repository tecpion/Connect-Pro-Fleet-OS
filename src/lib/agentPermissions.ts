// Connect Pro Fleet — AI Agent permissions (Build #46).
//
// Agents have their OWN defined permission scope. An agent cannot access data
// simply because the tenant Owner can. Each agent is scoped to the modules it
// needs (read access by default) plus a bounded action allowlist. Agents never
// receive unrestricted database mutation ability.

import type { AgentId, AgentActionType } from "./agentTypes";
import { HIGH_RISK_ACTION_TYPES } from "./agentTypes";

/** Permission keys an agent is granted (read-scoped to its responsibility). */
export const AGENT_PERMISSION_SCOPE: Record<AgentId, string[]> = {
  collections: [
    "payments.view",
    "payment_arrangements.view",
    "customers.view",
    "rentals.view",
    "tasks.view_own",
  ],
  fleet_readiness: [
    "vehicles.view",
    "vehicles.view_documents",
    "reservations.view",
    "rentals.view",
    "maintenance.view",
    "inspections.view",
    "compliance.view",
    "documents.view",
    "tasks.view_own",
  ],
  rental_operations: [
    "rentals.view",
    "reservations.view",
    "vehicles.view",
    "inspections.view",
    "payments.view",
    "tasks.view_own",
  ],
  maintenance: ["maintenance.view", "vehicles.view", "tasks.view_own"],
  finance_review: [
    "expenses.view",
    "expenses.view_vehicle_expenses",
    "banking.view",
    "banking.review",
    "tasks.view_own",
  ],
  compliance: [
    "compliance.view",
    "documents.view",
    "vehicles.view",
    "customers.view",
    "tasks.view_own",
  ],
  partner_settlement: [
    "investors.view",
    "investors.view_financials",
    "investors.view_statements",
    "tasks.view_own",
  ],
};

/** Bounded action allowlist per agent. Agents may ONLY invoke these internal
 *  tools — never arbitrary_update_database. */
export const AGENT_ACTION_ALLOWLIST: Record<AgentId, AgentActionType[]> = {
  collections: [
    "create_task",
    "prepare_message",
    "create_attention_item",
    "send_external_message",
  ],
  fleet_readiness: [
    "create_task",
    "create_attention_item",
    "readiness_recommendation",
    "vehicle_reassignment",
  ],
  rental_operations: [
    "create_task",
    "prepare_message",
    "create_attention_item",
    "change_rental_terms",
  ],
  maintenance: [
    "create_task",
    "create_attention_item",
    "readiness_recommendation",
  ],
  finance_review: [
    "create_task",
    "prepare_classification",
    "prepare_bank_match",
    "flag_duplicate",
    "month_end_review",
    "create_attention_item",
  ],
  compliance: [
    "create_task",
    "prepare_message",
    "create_attention_item",
    "compliance_override",
  ],
  partner_settlement: [
    "prepare_settlement",
    "prepare_statement",
    "create_attention_item",
    "approve_settlement",
    "record_payout",
  ],
};

/** Whether an agent is permitted to invoke a given action type (allowlist). */
export function agentCanPerform(
  agentId: AgentId,
  actionType: AgentActionType,
): boolean {
  return AGENT_ACTION_ALLOWLIST[agentId]?.includes(actionType) ?? false;
}

/** Whether an action is auto-executable (low-risk AND not high-risk). */
export function isAutoExecutable(actionType: AgentActionType): boolean {
  return !HIGH_RISK_ACTION_TYPES.has(actionType);
}
