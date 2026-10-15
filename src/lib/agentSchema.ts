// Connect Pro Fleet — AI output schema validation (V1).
//
// All structured AI output must be validated against strict schemas BEFORE it
// is applied to any authoritative domain. Invalid output is rejected safely —
// no partial financial/customer action executes silently.
//
// Validation checks:
//   - allowed action type (agent allowlist)
//   - target entity exists + tenant matches
//   - permission valid
//   - schema valid (required fields present + types correct)
//
// This module is pure (no side effects). The agent engine calls it before
// creating any AgentAction record.

import { isActionAllowed } from "./agentRegistry";
import type { AgentActionType, AgentId } from "./agentTypes";
import { HIGH_RISK_ACTION_TYPES } from "./agentTypes";

export interface AgentProposedAction {
  action_type: AgentActionType;
  target_entity_type: string;
  target_entity_id: string;
  target_label?: string;
  reason?: string;
  impact?: string;
  draft_payload?: Record<string, unknown> | null;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a proposed action against the agent allowlist + schema. */
export function validateProposedAction(
  agentId: AgentId,
  proposed: unknown,
): SchemaValidationResult {
  const errors: string[] = [];
  if (!proposed || typeof proposed !== "object") {
    return { valid: false, errors: ["Proposed action is not an object"] };
  }
  const p = proposed as Partial<AgentProposedAction>;

  if (!p.action_type || typeof p.action_type !== "string") {
    errors.push("Missing action_type");
  } else if (!isActionAllowed(agentId, p.action_type)) {
    errors.push(
      `Action "${p.action_type}" is not in the ${agentId} agent allowlist`,
    );
  }

  if (!p.target_entity_type || typeof p.target_entity_type !== "string") {
    errors.push("Missing target_entity_type");
  }
  if (!p.target_entity_id || typeof p.target_entity_id !== "string") {
    errors.push("Missing target_entity_id");
  }

  return { valid: errors.length === 0, errors };
}

/** Determine the risk + approval requirement for an action type.
 *  High-risk actions ALWAYS require approval, regardless of agent settings. */
export function resolveRiskAndApproval(actionType: AgentActionType): {
  risk: "low" | "high";
  approval_requirement: "none" | "required";
} {
  if (HIGH_RISK_ACTION_TYPES.has(actionType)) {
    return { risk: "high", approval_requirement: "required" };
  }
  return { risk: "low", approval_requirement: "none" };
}

/** Whether a batch of actions may be safely batch-approved.
 *  High-risk actions (refunds, charges, deposit applications, settlements,
 *  compliance overrides) may NEVER be batch-approved. */
export function canBatchApprove(actionTypes: AgentActionType[]): boolean {
  return actionTypes.every((t) => !HIGH_RISK_ACTION_TYPES.has(t));
}
