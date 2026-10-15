// Connect Pro Fleet — agent action execution helper (Build #46).
//
// Turns an AgentActionProposal into a real record THROUGH the existing
// authoritative Tasks domain (store.createTask). Agents never create shadow
// task records — they route through the same Task store staff use. The actor
// is always labeled as the AI agent so audit history distinguishes Staff /
// System Automation / AI Agent.

import type { FleetStore } from "./store/storeContext";
import type { TaskCategory, TaskEntityType, TaskPriority } from "./taskTypes";
import type { AgentActionTargetType, AgentActionType } from "./agentTypes";
import type { AgentActionProposal } from "./agentRunEngine";
import { getAgentDefinition } from "./agentRegistry";

/** Action types that create a task (routed through the Tasks domain). */
export const TASK_CREATING_ACTIONS: ReadonlySet<AgentActionType> = new Set([
  "create_task",
  "readiness_task",
  "service_task",
  "renewal_task",
  "missing_document_task",
  "create_attention_item",
]);

export function isTaskCreatingAction(type: AgentActionType): boolean {
  return TASK_CREATING_ACTIONS.has(type);
}

/** Map an agent target type to the Task domain's entity type.
 *  "task" has no matching TaskEntityType (a task cannot be the primary entity
 *  of another task), so it resolves to null and the payload's entity_type wins. */
function taskEntityType(t: AgentActionTargetType): TaskEntityType | null {
  switch (t) {
    case "rental":
      return "rental";
    case "customer":
      return "customer";
    case "vehicle":
      return "vehicle";
    case "expense":
      return "expense";
    case "payment_arrangement":
      return "payment_arrangement";
    default:
      return null;
  }
}

interface TaskPayload {
  title?: string;
  task_title?: string;
  description?: string;
  task_description?: string;
  category?: TaskCategory;
  task_category?: TaskCategory;
  priority?: TaskPriority;
  task_priority?: TaskPriority;
  due_date?: string;
  task_due_date?: string;
  entity_type?: TaskEntityType;
  entity_id?: string;
  entity_label?: string;
}

/** Execute a task-creating proposal through the existing Tasks domain.
 *  Returns the new task id. Throws on failure (caller marks action failed). */
export function executeProposalAsTask(
  proposal: AgentActionProposal,
  store: FleetStore,
  agentId: string,
): string {
  const def = getAgentDefinition(agentId as never);
  const actorLabel = `AI — ${def.name}`;
  const p = proposal.payload as TaskPayload;
  const title = p.title ?? p.task_title ?? proposal.proposed_action;
  const description =
    p.description ??
    p.task_description ??
    `${proposal.reasons.join("; ")}. Prepared by AI Agent — ${actorLabel}.`;
  const taskId = store.createTask({
    title,
    description: `${description}. Source-backed: ${proposal.reasons.join("; ")}.`,
    category: (p.category ??
      p.task_category ??
      "administrative") as TaskCategory,
    priority: (p.priority ?? p.task_priority ?? "normal") as TaskPriority,
    dueDate: p.due_date ?? p.task_due_date ?? null,
    entityType: p.entity_type ?? taskEntityType(proposal.target_type),
    entityId: p.entity_id ?? proposal.target_id,
    entityLabel: p.entity_label ?? proposal.target_label,
    notes: `AI Agent action — ${proposal.action_type}. Agent: ${actorLabel}.`,
  });
  return taskId;
}
