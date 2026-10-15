// Connect Pro Fleet — AI Agent run engine (Build #46).
//
// The run engine composes authoritative selectors to produce an agent's
// observations + prepared actions. It does NOT create a second analytics
// engine, second task system, or second financial ledger. Prepared actions
// flow through the existing Tasks domain (create_task) and existing
// Investor/Expense selectors (prepare_*).
//
// V1 working agents: Collections, Fleet Readiness, Finance Review.
// Other agents are registered but framework-only (their run returns an
// honest "framework-only" summary with no prepared actions).
//
// All output is source-backed + transparent. No hidden chain-of-thought.
// No opaque risk scores. High-risk actions are always approval-gated.

import type { BriefingSources } from "./briefingTypes";
import type { FleetStore } from "./store/storeContext";
import type {
  AgentAction,
  AgentActionRisk,
  AgentActionTargetType,
  AgentActionType,
  AgentId,
  AgentRun,
} from "./agentTypes";
import { actionRequiresApproval } from "./agentTypes";
import { agentCanPerform } from "./agentPermissions";
import { getAgentDefinition } from "./agentRegistry";
import { getAIProvider } from "./agentProvider";
import { getMoneyDueToday } from "./briefingMoney";
import { getOverdueAccounts } from "./briefingMoney";
import { getBrokenArrangements } from "./paymentArrangements";
import {
  getBlockedVehicles,
  getMaintenanceAttention,
  getComplianceAttention,
} from "./briefingFleet";
import {
  getUnallocatedExpenses,
  monthEndChecklist,
} from "./expenseWorkspaceSelectors";
import {
  getExpensesMissingReceipts,
  getOutstandingReimbursements,
} from "./expenseSelectors";
import {
  getTransactionAttention,
  detectDuplicateTransactions,
} from "./bankingAttention";
import { uid, TENANT_ID } from "./store/ids";

/** A prepared-action proposal produced by an agent run. The store turns these
 *  into authoritative AgentAction records (with dedupe + approval gating). */
export interface AgentActionProposal {
  action_type: AgentActionType;
  target_type: AgentActionTargetType;
  target_id: string;
  target_label: string;
  proposed_action: string;
  risk_level: AgentActionRisk;
  reasons: string[];
  impact: string | null;
  payload: Record<string, unknown>;
  deep_link: string | null;
  /** Occurrence discriminator for dedupe (e.g. period id). */
  occurrence: string;
}

/** The result of an agent run: observations + proposals + summary. */
export interface AgentRunResult {
  agent_id: AgentId;
  items_reviewed: number;
  recommendations: number;
  proposals: AgentActionProposal[];
  summary: string;
  errors: string[];
  /** Usage metadata from the provider call. */
  usage_cost: { provider_cost: number; billable_amount: number };
}

function nowIso(): string {
  return new Date().toISOString();
}

function currentMonthKey(): string {
  return nowIso().slice(0, 7);
}

/** Risk level for an action type. High-risk actions are always "high". */
function riskFor(type: AgentActionType): AgentActionRisk {
  return actionRequiresApproval(type) ? "high" : "low";
}

/** Validate a proposal against the action allowlist + schema. Invalid output
 *  is rejected safely — agents may only call approved internal actions. */
function validateProposal(agentId: AgentId, p: AgentActionProposal): boolean {
  if (!agentCanPerform(agentId, p.action_type)) return false;
  if (!p.target_id) return false;
  if (!p.proposed_action) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Collections Agent — monitors overdue/due-today/broken arrangements;
// prepares follow-up tasks + reminder drafts; approval-gated external sends.
// ---------------------------------------------------------------------------

function runCollections(
  store: FleetStore,
  src: BriefingSources,
  asOf: Date,
): AgentRunResult {
  const dueToday = getMoneyDueToday(src, asOf);
  const overdue = getOverdueAccounts(src, asOf);
  const broken = getBrokenArrangements(
    store.paymentArrangements,
    (id) =>
      store.arrangementInstallments.filter((i) => i.arrangement_id === id),
    store.transactions,
  );
  const itemsReviewed = dueToday.length + overdue.length + broken.length;
  const proposals: AgentActionProposal[] = [];

  // Prepare follow-up tasks for overdue accounts (low-risk, auto-creatable).
  for (const item of overdue.slice(0, 10)) {
    const customerId = item.customer_id ?? "";
    const rentalId = item.rental_id ?? "";
    proposals.push({
      action_type: "create_task",
      target_type: "rental",
      target_id: rentalId || customerId || "unknown",
      target_label: item.title,
      proposed_action: "Create overdue follow-up task",
      risk_level: riskFor("create_task"),
      reasons: [
        `Balance overdue — ${item.reason ?? "past due"}`,
        "No payment recorded for this obligation",
      ],
      impact: item.amount != null ? `$${item.amount.toFixed(2)} overdue` : null,
      payload: {
        title: `Follow up on overdue balance — ${item.title}`,
        category: "payment_collection",
        entity_type: "rental",
        entity_id: rentalId,
        entity_label: item.title,
        customer_id: customerId,
        priority: "high",
        due_date: asOf.toISOString().slice(0, 10),
      },
      deep_link: item.deep_link ?? `/rentals/${rentalId}`,
      occurrence: `overdue:${rentalId}:${asOf.toISOString().slice(0, 10)}`,
    });
  }

  // Prepare reminder message drafts for due-today (approval-gated to send).
  for (const item of dueToday.slice(0, 5)) {
    const customerId = item.customer_id ?? "";
    const rentalId = item.rental_id ?? "";
    const customerName = store.customerName(customerId);
    proposals.push({
      action_type: "prepare_message",
      target_type: "customer",
      target_id: customerId || rentalId,
      target_label: customerName,
      proposed_action: "Prepare payment reminder message",
      risk_level: riskFor("prepare_message"),
      reasons: [
        `Payment due today — ${item.reason ?? "due today"}`,
        "Reminder may help collect before overdue",
      ],
      impact:
        item.amount != null ? `$${item.amount.toFixed(2)} due today` : null,
      payload: {
        customer_id: customerId,
        customer_name: customerName,
        subject: "Payment reminder",
        body: `Hi ${customerName}, your rental payment is due today. Please reach out to arrange payment.`,
        template: "payment_reminder",
      },
      deep_link: item.deep_link ?? `/rentals/${rentalId}`,
      occurrence: `reminder:${rentalId}:${asOf.toISOString().slice(0, 10)}`,
    });
  }

  // Broken arrangements → escalation task.
  for (const b of broken.slice(0, 5)) {
    const customerName = store.customerName(b.customer_id);
    const amt = b.arrangement_amount;
    proposals.push({
      action_type: "create_task",
      target_type: "payment_arrangement",
      target_id: b.id,
      target_label: customerName || b.arrangement_number,
      proposed_action: "Create broken-arrangement escalation task",
      risk_level: riskFor("create_task"),
      reasons: ["Payment arrangement broken", "Escalation recommended"],
      impact: `$${amt.toFixed(2)}`,
      payload: {
        title: `Escalate broken payment arrangement — ${customerName}`,
        category: "payment_arrangement",
        entity_type: "payment_arrangement" as never,
        entity_id: b.id,
        entity_label: customerName || b.arrangement_number,
        priority: "urgent",
        due_date: asOf.toISOString().slice(0, 10),
      },
      deep_link: `/payment-arrangements`,
      occurrence: `broken:${b.id}`,
    });
  }

  const valid = proposals.filter((p) => validateProposal("collections", p));
  return {
    agent_id: "collections",
    items_reviewed: itemsReviewed,
    recommendations: valid.length,
    proposals: valid,
    summary: `Reviewed ${itemsReviewed} collection items: ${overdue.length} overdue, ${dueToday.length} due today, ${broken.length} broken arrangements. Prepared ${valid.length} actions.`,
    errors: [],
    usage_cost: { provider_cost: 0.01, billable_amount: 0.014 },
  };
}

// ---------------------------------------------------------------------------
// Fleet Readiness Agent — monitors blocked vehicles + upcoming reservations;
// prepares readiness tasks + alternate-vehicle recommendations.
// ---------------------------------------------------------------------------

function runFleetReadiness(
  store: FleetStore,
  src: BriefingSources,
  asOf: Date,
): AgentRunResult {
  const blocked = getBlockedVehicles(src, asOf);
  const maint = getMaintenanceAttention(src, asOf);
  const comp = getComplianceAttention(src, asOf);
  const itemsReviewed = blocked.length + maint.length + comp.length;
  const proposals: AgentActionProposal[] = [];

  for (const item of blocked.slice(0, 10)) {
    const vehicleId = item.entity_id ?? "";
    proposals.push({
      action_type: "create_task",
      target_type: "vehicle",
      target_id: vehicleId,
      target_label: item.title,
      proposed_action: "Create vehicle readiness task",
      risk_level: riskFor("create_task"),
      reasons: [
        `Vehicle blocked — ${item.reason ?? "readiness blocker"}`,
        "Action needed before upcoming rental",
      ],
      impact: null,
      payload: {
        title: `Resolve readiness blocker — ${item.title}`,
        category: "vehicle",
        entity_type: "vehicle",
        entity_id: vehicleId,
        entity_label: item.title,
        priority: "high",
        due_date: asOf.toISOString().slice(0, 10),
      },
      deep_link: item.deep_link ?? `/vehicles/${vehicleId}`,
      occurrence: `readiness:${vehicleId}:${asOf.toISOString().slice(0, 10)}`,
    });
  }

  for (const item of maint.slice(0, 5)) {
    const vehicleId = item.entity_id ?? "";
    proposals.push({
      action_type: "readiness_recommendation",
      target_type: "vehicle",
      target_id: vehicleId,
      target_label: item.title,
      proposed_action: "Recommend maintenance turnaround priority",
      risk_level: riskFor("readiness_recommendation"),
      reasons: [`Maintenance attention — ${item.reason ?? "service needed"}`],
      impact: null,
      payload: {
        vehicle_id: vehicleId,
        recommendation: "Prioritize turnaround to restore availability.",
      },
      deep_link: item.deep_link ?? `/vehicles/${vehicleId}`,
      occurrence: `maint:${vehicleId}:${asOf.toISOString().slice(0, 10)}`,
    });
  }

  const valid = proposals.filter((p) => validateProposal("fleet_readiness", p));
  return {
    agent_id: "fleet_readiness",
    items_reviewed: itemsReviewed,
    recommendations: valid.length,
    proposals: valid,
    summary: `Reviewed ${itemsReviewed} fleet items: ${blocked.length} blocked, ${maint.length} maintenance, ${comp.length} compliance. Prepared ${valid.length} actions.`,
    errors: [],
    usage_cost: { provider_cost: 0.008, billable_amount: 0.011 },
  };
}

// ---------------------------------------------------------------------------
// Finance Review Agent — monitors unallocated/missing-doc/unmatched/dupes;
// prepares classification suggestions + missing-doc tasks + month-end review.
// ---------------------------------------------------------------------------

function runFinanceReview(store: FleetStore): AgentRunResult {
  const monthKey = currentMonthKey();
  const unallocated = getUnallocatedExpenses(
    store.expenses,
    store.expenseLineItems,
  );
  const missingDocs = getExpensesMissingReceipts(
    store.expenses,
    store.expenseReceipts,
  );
  const reimbursements = getOutstandingReimbursements(
    store.expenseReimbursements,
  );
  const accountName = (id: string) =>
    store.financialAccounts.find((a) => a.id === id)?.name ?? null;
  const txnAttention = getTransactionAttention(
    store.importedTransactions,
    store.reconciliationMatches,
    accountName,
  );
  const duplicates = detectDuplicateTransactions(store.importedTransactions);
  const checklist = monthEndChecklist(
    monthKey,
    store.expenses,
    store.expenseLineItems,
    store.expenseReceipts,
    store.expenseReimbursements,
    store.importedTransactions,
    store.receiptInbox,
  );
  const itemsReviewed =
    unallocated.length +
    missingDocs.length +
    reimbursements.length +
    txnAttention.length +
    duplicates.length;
  const proposals: AgentActionProposal[] = [];

  for (const e of unallocated.slice(0, 8)) {
    proposals.push({
      action_type: "prepare_classification",
      target_type: "expense",
      target_id: e.id,
      target_label: e.description ?? e.expense_number,
      proposed_action: "Suggest expense allocation",
      risk_level: riskFor("prepare_classification"),
      reasons: ["Expense is unallocated", "Allocation needed before review"],
      impact: `$${e.amount.toFixed(2)}`,
      payload: {
        expense_id: e.id,
        expense_number: e.expense_number,
        amount: e.amount,
        suggestion: "Allocate to the relevant vehicle or overhead category.",
      },
      deep_link: `/finance?tab=expenses&expense=${e.id}`,
      occurrence: `unalloc:${e.id}`,
    });
  }

  for (const e of missingDocs.slice(0, 8)) {
    proposals.push({
      action_type: "create_task",
      target_type: "expense",
      target_id: e.id,
      target_label: e.description ?? e.expense_number,
      proposed_action: "Create missing-document task",
      risk_level: riskFor("create_task"),
      reasons: [
        "Expense requires supporting documentation",
        "No receipt on file",
      ],
      impact: `$${e.amount.toFixed(2)}`,
      payload: {
        title: `Obtain supporting documentation — ${e.expense_number}`,
        category: "document",
        entity_type: "expense",
        entity_id: e.id,
        entity_label: e.expense_number,
        priority: "normal",
      },
      deep_link: `/finance?tab=expenses&expense=${e.id}`,
      occurrence: `missingdoc:${e.id}`,
    });
  }

  for (const d of duplicates.slice(0, 5)) {
    const txnIds = [d.existing.id, d.candidate.id].filter(Boolean);
    proposals.push({
      action_type: "flag_duplicate",
      target_type: "bank_transaction",
      target_id: txnIds[0] ?? "",
      target_label: "Duplicate suspected",
      proposed_action: "Flag possible duplicate transaction",
      risk_level: riskFor("flag_duplicate"),
      reasons: [
        "Transactions appear to be duplicates",
        "Review before matching",
      ],
      impact: null,
      payload: { transaction_ids: txnIds },
      deep_link: `/finance?tab=banking`,
      occurrence: `dup:${txnIds.join(",")}`,
    });
  }

  // Month-end review summary (always prepared when issues exist).
  if (checklist.status === "needs_attention") {
    proposals.push({
      action_type: "month_end_review",
      target_type: "general",
      target_id: monthKey,
      target_label: `Month-end review — ${monthKey}`,
      proposed_action: "Prepare month-end review summary",
      risk_level: riskFor("month_end_review"),
      reasons: [
        `${checklist.missingReceipts} missing receipts`,
        `${checklist.unallocatedExpenses} unallocated expenses`,
        `${checklist.unmatchedBankTransactions} unmatched bank transactions`,
        `${checklist.reimbursementsOwed} reimbursements owed`,
      ],
      impact: null,
      payload: { monthKey, checklist },
      deep_link: `/finance`,
      occurrence: `monthend:${monthKey}`,
    });
  }

  const valid = proposals.filter((p) => validateProposal("finance_review", p));
  return {
    agent_id: "finance_review",
    items_reviewed: itemsReviewed,
    recommendations: valid.length,
    proposals: valid,
    summary: `Reviewed ${itemsReviewed} finance items: ${unallocated.length} unallocated, ${missingDocs.length} missing docs, ${txnAttention.length} bank attention, ${duplicates.length} duplicate suspects. Prepared ${valid.length} actions. Month-end status: ${checklist.status}.`,
    errors: [],
    usage_cost: { provider_cost: 0.012, billable_amount: 0.017 },
  };
}

// ---------------------------------------------------------------------------
// Framework-only agents (registered, configurable, but no working actions).
// ---------------------------------------------------------------------------

function runFrameworkOnly(agentId: AgentId): AgentRunResult {
  const def = getAgentDefinition(agentId);
  return {
    agent_id: agentId,
    items_reviewed: 0,
    recommendations: 0,
    proposals: [],
    summary: `${def.name} is registered and configurable (framework-only). Run logic is not yet production-executing for this agent.`,
    errors: [],
    usage_cost: { provider_cost: 0, billable_amount: 0 },
  };
}

/** Synchronously dispatch an agent run against authoritative sources WITHOUT
 *  calling the provider. Returns the run result (observations + proposals).
 *  The store uses this so `runAgent` stays synchronous; it records provider
 *  usage metadata separately. The pure runners compose real selectors. */
export function executeAgentRunSync(
  agentId: AgentId,
  store: FleetStore,
  src: BriefingSources,
  asOf: Date,
): AgentRunResult {
  switch (agentId) {
    case "collections":
      return runCollections(store, src, asOf);
    case "fleet_readiness":
      return runFleetReadiness(store, src, asOf);
    case "finance_review":
      return runFinanceReview(store);
    case "rental_operations":
    case "maintenance":
    case "compliance":
    case "partner_settlement":
      return runFrameworkOnly(agentId);
    default:
      return runFrameworkOnly(agentId);
  }
}

/** Execute an agent run against authoritative sources. Returns the run result
 *  (observations + proposals). The store turns proposals into actions. */
export async function executeAgentRun(
  agentId: AgentId,
  store: FleetStore,
  src: BriefingSources,
  asOf: Date,
): Promise<AgentRunResult> {
  // Exercise the provider abstraction (records usage metadata). The
  // deterministic provider does not call an LLM; agent logic composes output.
  const provider = getAIProvider();
  const req = {
    agent_id: agentId,
    task: `run_${agentId}`,
    context: { tenant: store.tenant.id, as_of: asOf.toISOString() },
    schema: { type: "object" },
  };
  const providerResult = await provider.generateStructured(req);

  const result = executeAgentRunSync(agentId, store, src, asOf);

  // Merge provider usage cost into the result (authoritative metering).
  if (providerResult.usage) {
    result.usage_cost = {
      provider_cost: providerResult.usage.provider_cost,
      billable_amount: providerResult.usage.billable_amount,
    };
  }
  return result;
}

/** Build the dedupe key for an agent action proposal (idempotency). */
export function agentActionDedupeKey(
  agentId: AgentId,
  proposal: AgentActionProposal,
): string {
  return `${agentId}:${proposal.action_type}:${proposal.target_id}:${proposal.occurrence}`;
}
