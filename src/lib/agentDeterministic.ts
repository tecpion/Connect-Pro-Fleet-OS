// Connect Pro Fleet — deterministic agent action planner (Build #AI).
//
// The V1 "provider brain". This is rule-based, deterministic logic that turns
// permission-filtered operational findings (already built from authoritative
// selectors by the agent store) into structured planned actions. It is NOT a
// production LLM — it produces honest, explainable, source-backed actions and
// is clearly labeled as the development provider.
//
// Every planned action carries:
//   - finding: what was found (the fact)
//   - reason: why it matters (operational evidence, NOT chain-of-thought)
//   - proposed_action: the suggested action (human-readable)
//   - payload: strict structured data validated before execution
//
// High-risk actions (e.g. send_external_message) are returned with the correct
// action_type so the store marks them approval-required. This planner NEVER
// executes anything — execution is gated by the store + human approval.

import type {
  AgentActionPayload,
  AgentActionType,
  AgentType,
} from "./agentTypes";
import { AGENT_REGISTRY } from "./agentRegistry";
import type { AgentFinding, PlannedAction } from "./agentProvider";

/** Allowlist check — a planner may only emit action types its agent permits. */
function allowed(agent: AgentType, action: AgentActionType): boolean {
  const def = AGENT_REGISTRY[agent];
  return (
    def.can_prepare.includes(action) || def.approval_actions.includes(action)
  );
}

/** Plan actions for a Collections Agent run. Findings come pre-filtered. */
function planCollections(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "overdue_balance") {
      const name = f.fields.customer_name ?? f.label;
      const amount = f.fields.amount ?? 0;
      const days = f.fields.days_late ?? 0;
      out.push({
        action_type: "create_task",
        finding: `${name} owes $${amount}, ${days} days overdue.`,
        reason:
          "Overdue balance with no payment recorded in the lookback window.",
        proposed_action: `Create a collections follow-up task for ${name}.`,
        payload: {
          task_title: `Follow up on overdue balance — ${name}`,
          task_description: `${name} owes $${amount} (${days} days overdue). No payment recorded recently. Call/email to arrange payment.`,
          task_category: "payment_collection",
          task_priority: days && Number(days) >= 7 ? "high" : "normal",
          task_due_date: new Date().toISOString().slice(0, 10),
        },
      });
      out.push({
        action_type: "prepare_message",
        finding: `${name} owes $${amount}, ${days} days overdue.`,
        reason: "A reminder message can prompt payment before escalation.",
        proposed_action: `Prepare a payment reminder message for ${name}.`,
        payload: {
          message_subject: `Payment reminder — outstanding balance of $${amount}`,
          message_body: `Hi ${name}, this is a reminder that you have an outstanding balance of $${amount} on your rental. Please contact us to arrange payment. Thank you.`,
        },
      });
    }
    if (f.finding_type === "broken_arrangement") {
      const name = f.fields.customer_name ?? f.label;
      out.push({
        action_type: "create_attention_item",
        finding: `${name} has a broken payment arrangement.`,
        reason:
          "A broken arrangement risks further delinquency and needs manager review.",
        proposed_action: `Flag ${name}'s broken arrangement for manager escalation.`,
        payload: {
          task_title: `Escalate broken payment arrangement — ${name}`,
          task_description: `${name}'s payment arrangement is broken. Manager review recommended before further collection action.`,
          task_category: "payment_arrangement",
          task_priority: "high",
        },
      });
    }
  }
  return out;
}

function planFleetReadiness(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "readiness_blocker") {
      const v = f.fields.vehicle_label ?? f.label;
      out.push({
        action_type: "readiness_task",
        finding: `${v} has a readiness blocker: ${f.fields.reason ?? "unspecified"}.`,
        reason:
          "A blocker on a vehicle needed for an upcoming rental risks a failed pickup.",
        proposed_action: `Create a readiness task for ${v}.`,
        payload: {
          task_title: `Resolve readiness blocker — ${v}`,
          task_description: `${v} has a readiness blocker: ${f.fields.reason ?? "unspecified"}. Must be resolved before the next pickup.`,
          task_category: "vehicle",
          task_priority: "high",
          task_due_date: new Date().toISOString().slice(0, 10),
        },
      });
    }
    if (f.finding_type === "no_ready_vehicle") {
      const when = f.fields.pickup_date ?? "an upcoming pickup";
      out.push({
        action_type: "create_attention_item",
        finding: `No operationally ready vehicle assigned for ${when}.`,
        reason:
          "A reservation has no ready vehicle, risking a failed or delayed pickup.",
        proposed_action: `Flag the reservation for vehicle assignment review.`,
        payload: {
          task_title: `Assign a ready vehicle — reservation ${when}`,
          task_description: `No operationally ready vehicle is assigned for ${when}. Alternate vehicle or turnaround needed.`,
          task_category: "reservation",
          task_priority: "high",
        },
      });
    }
  }
  return out;
}

function planFinanceReview(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "unallocated_expense") {
      out.push({
        action_type: "prepare_classification",
        finding: `Expense ${f.label} ($${f.fields.amount ?? 0}) is unallocated to a vehicle.`,
        reason: "Unallocated expenses reduce fleet cost accuracy.",
        proposed_action: `Suggest a vehicle/category classification for ${f.label}.`,
        payload: {
          suggested_category: String(f.fields.suggested_category ?? ""),
          task_title: `Allocate expense ${f.label}`,
          task_description: `Expense ${f.label} ($${f.fields.amount ?? 0}) is not allocated to a vehicle.`,
          task_category: "administrative",
        },
      });
    }
    if (f.finding_type === "missing_documentation") {
      out.push({
        action_type: "missing_document_task",
        finding: `Expense ${f.label} ($${f.fields.amount ?? 0}) is missing supporting documentation.`,
        reason:
          "Missing documentation can weaken financial confidence for review.",
        proposed_action: `Create a task to obtain supporting documentation for ${f.label}.`,
        payload: {
          task_title: `Obtain supporting documentation — ${f.label}`,
          task_description: `Expense ${f.label} ($${f.fields.amount ?? 0}) is missing supporting documentation. Follow up with the vendor or record a Cash Expense Record.`,
          task_category: "document",
        },
      });
    }
    if (f.finding_type === "unreviewed_bank_txn") {
      out.push({
        action_type: "prepare_bank_match",
        finding: `Bank transaction ${f.label} (${f.fields.direction ?? ""} $${f.fields.amount ?? 0}) needs review.`,
        reason:
          "Unreviewed bank transactions may represent unmatched revenue or expense.",
        proposed_action: `Prepare a match suggestion for ${f.label}.`,
        payload: {
          task_title: `Review bank transaction ${f.label}`,
          task_description: `Bank transaction ${f.label} (${f.fields.direction ?? ""} $${f.fields.amount ?? 0}) needs review or matching.`,
          task_category: "administrative",
        },
      });
    }
    if (f.finding_type === "duplicate_expense_candidate") {
      out.push({
        action_type: "flag_duplicate",
        finding: `Possible duplicate expense: ${f.label}.`,
        reason:
          "Duplicate expenses can double-count fleet cost if left uncorrected.",
        proposed_action: `Flag ${f.label} as a possible duplicate for review.`,
        payload: {
          task_title: `Review possible duplicate expense — ${f.label}`,
          task_description: `Possible duplicate expense detected: ${f.label}. Confirm whether it duplicates an existing posted expense.`,
          task_category: "administrative",
        },
      });
    }
  }
  return out;
}

function planMaintenance(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "overdue_maintenance") {
      out.push({
        action_type: "service_task",
        finding: `${f.label} has overdue maintenance: ${f.fields.reason ?? ""}.`,
        reason: "Overdue maintenance increases downtime risk.",
        proposed_action: `Create a service task for ${f.label}.`,
        payload: {
          task_title: `Service task — ${f.label}`,
          task_description: `${f.label} has overdue maintenance: ${f.fields.reason ?? ""}.`,
          task_category: "maintenance",
        },
      });
    }
  }
  return out;
}

function planCompliance(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "expiring_document") {
      out.push({
        action_type: "renewal_task",
        finding: `${f.label}: ${f.fields.document_type ?? "document"} expires soon.`,
        reason: "Expiring compliance documents can block rentals.",
        proposed_action: `Create a renewal task for ${f.label}.`,
        payload: {
          task_title: `Renew ${f.fields.document_type ?? "document"} — ${f.label}`,
          task_description: `${f.label}: ${f.fields.document_type ?? "document"} expires ${f.fields.expiry_date ?? "soon"}. Renew before it blocks rentals.`,
          task_category: "document",
        },
      });
    }
  }
  return out;
}

function planPartnerSettlement(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "settlement_period_open") {
      out.push({
        action_type: "prepare_settlement",
        finding: `Agreement ${f.label} has an open settlement period with no draft.`,
        reason:
          "An open settlement period without a draft delays partner payout review.",
        proposed_action: `Prepare a projected settlement draft for ${f.label}.`,
        payload: {
          agreement_id: String(f.fields.agreement_id ?? ""),
          period_start: String(f.fields.period_start ?? ""),
          period_end: String(f.fields.period_end ?? ""),
          task_title: `Prepare settlement — ${f.label}`,
          task_description: `Agreement ${f.label} has an open settlement period. Prepare a draft for human review.`,
          task_category: "administrative",
        },
      });
    }
  }
  return out;
}

function planRentalOperations(findings: AgentFinding[]): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const f of findings) {
    if (f.finding_type === "overdue_rental") {
      out.push({
        action_type: "create_task",
        finding: `Rental ${f.label} is overdue for return.`,
        reason: "Overdue rentals tie up fleet vehicles and need follow-up.",
        proposed_action: `Create a follow-up task for overdue rental ${f.label}.`,
        payload: {
          task_title: `Follow up on overdue rental — ${f.label}`,
          task_description: `Rental ${f.label} is overdue for return. Contact the customer to arrange return.`,
          task_category: "return",
          task_priority: "high",
        },
      });
    }
  }
  return out;
}

/** The deterministic planner entry point. */
export function planDeterministicActions(input: {
  agent_type: AgentType;
  context: { findings: AgentFinding[] };
}): PlannedAction[] {
  const { agent_type, context } = input;
  let planned: PlannedAction[] = [];
  switch (agent_type) {
    case "collections":
      planned = planCollections(context.findings);
      break;
    case "fleet_readiness":
      planned = planFleetReadiness(context.findings);
      break;
    case "finance_review":
      planned = planFinanceReview(context.findings);
      break;
    case "maintenance":
      planned = planMaintenance(context.findings);
      break;
    case "compliance":
      planned = planCompliance(context.findings);
      break;
    case "partner_settlement":
      planned = planPartnerSettlement(context.findings);
      break;
    case "rental_operations":
      planned = planRentalOperations(context.findings);
      break;
  }
  // Allowlist enforcement — never emit an action the agent can't perform.
  return planned.filter((a) => allowed(agent_type, a.action_type));
}

/** Helper to coerce a planned action's payload type. */
export type { AgentActionPayload };
