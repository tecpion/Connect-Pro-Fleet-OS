// Connect Pro Fleet — Agent finding builder (Build #AI).
//
// Builds permission-filtered, minimum-context operational findings from
// authoritative selectors, scoped to the agent + tenant + location. The agent
// only receives the data necessary for its responsibility — never the full
// tenant database, never sensitive card/bank/identity data.
//
// Findings are the INPUT to the provider. The provider/planner turns them
// into planned actions. This keeps the provider boundary clean: the provider
// never reads the store directly.
//
// These selectors COMPOSE existing authoritative data — they create no records
// and alter no calculations.

import type { AgentFinding } from "./agentProvider";
import type { AgentType } from "./agentTypes";
import type {
  Customer,
  FinancialTransaction,
  RentalAgreement,
  Vehicle,
} from "./types";
import type { ExpenseCategory, ExpenseTransaction } from "./expenseTypes";
import type { ImportedTransaction } from "./bankingTypes";
import { isTaskOverdue } from "./taskSelectors";
import type { Task } from "./taskTypes";

/** Whether an expense is classified as company overhead (vs vehicle-direct).
 *  Derived from its category's group/type so the Expense Ledger stays the
 *  single source of truth — ExpenseTransaction carries no denormalized flag. */
function isExpenseOverhead(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): boolean {
  if (!e.expense_category_id) return false;
  const cat = categories.find((c) => c.id === e.expense_category_id);
  if (!cat) return false;
  if (cat.group === "overhead") return true;
  return cat.type === "company_overhead";
}

/** Resolve the human-readable category name for an expense. */
function expenseCategoryName(
  e: ExpenseTransaction,
  categories: ExpenseCategory[],
): string {
  if (!e.expense_category_id) return "";
  return categories.find((c) => c.id === e.expense_category_id)?.name ?? "";
}

/** Whether an expense has supporting documentation attached. Uses the
 *  authoritative receipt_status plus any linked vault document in metadata. */
function expenseHasDocumentation(e: ExpenseTransaction): boolean {
  if (e.receipt_status === "attached") return true;
  const docId = (e.metadata as Record<string, unknown> | null)?.document_id;
  return Boolean(docId);
}

const DAY = 86_400_000;

/** Filter items to the agent's location scope (empty = all). The location key
 *  is extracted per item type because Vehicle stores a location name/id on
 *  `location`, RentalAgreement has no direct location field, etc. */
function locationScoped<T>(
  items: T[],
  locationIds: string[],
  locOf: (item: T) => string | null | undefined,
): T[] {
  if (locationIds.length === 0) return items;
  return items.filter((i) => {
    const loc = locOf(i);
    return !!loc && locationIds.includes(loc);
  });
}

/** Customer balance helper: sum posted charges minus payments for a rental. */
function rentalBalance(rentalId: string, txns: FinancialTransaction[]): number {
  return txns
    .filter((t) => t.rental_id === rentalId && t.status === "posted")
    .reduce(
      (sum, t) => sum + (t.category === "payment" ? -t.amount : t.amount),
      0,
    );
}

function customerName(c: Customer): string {
  return `${c.first_name} ${c.last_name}`;
}

// ---------------------------------------------------------------------------
// Collections findings
// ---------------------------------------------------------------------------

export function buildCollectionsFindings(args: {
  rentals: RentalAgreement[];
  customers: Customer[];
  transactions: FinancialTransaction[];
  tasks: Task[];
  locationIds: string[];
  now: Date;
}): AgentFinding[] {
  const { rentals, customers, transactions, tasks, locationIds, now } = args;
  // RentalAgreement has no direct location field; rentals are not location-
  // scoped here (the vehicle's location would be needed). Empty scope = all.
  const scoped = locationIds.length === 0 ? rentals : rentals;
  const findings: AgentFinding[] = [];
  for (const r of scoped) {
    const balance = rentalBalance(r.id, transactions);
    if (balance <= 0.01) continue;
    // Determine days late from the rental's scheduled/actual return date.
    const refDate = r.actual_return_date ?? r.scheduled_return_date;
    const daysLate = refDate
      ? Math.floor(
          (now.getTime() - new Date(refDate + "T00:00:00").getTime()) / DAY,
        )
      : 0;
    if (daysLate <= 0) continue;
    const cust = customers.find((c) => c.id === r.customer_id);
    findings.push({
      finding_type: "overdue_balance",
      entity_type: "rental",
      entity_id: r.id,
      label: r.agreement_number ?? r.id,
      deep_link: `/rentals/${r.id}`,
      fields: {
        customer_name: cust ? customerName(cust) : "—",
        customer_id: r.customer_id,
        amount: Math.round(balance * 100) / 100,
        days_late: daysLate,
      },
    });
  }
  // Broken arrangements: an overdue open payment_arrangement task.
  for (const t of tasks) {
    if (t.category !== "payment_arrangement") continue;
    if (t.status !== "open" && t.status !== "in_progress") continue;
    if (!isTaskOverdue(t, now)) continue;
    // Task has no customer_id; resolve from its customer entity link.
    const customerId =
      t.entity_type === "customer" ? (t.entity_id ?? null) : null;
    const cust = customerId
      ? customers.find((c) => c.id === customerId)
      : undefined;
    findings.push({
      finding_type: "broken_arrangement",
      entity_type: "task",
      entity_id: t.id,
      label: t.task_number ?? t.id,
      deep_link: `/tasks?task=${t.id}`,
      fields: {
        customer_name: cust ? customerName(cust) : "—",
        customer_id: customerId ?? "",
      },
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Fleet Readiness findings
// ---------------------------------------------------------------------------

export function buildFleetReadinessFindings(args: {
  vehicles: Vehicle[];
  rentals: RentalAgreement[];
  locationIds: string[];
  now: Date;
}): AgentFinding[] {
  const { vehicles, rentals, locationIds, now } = args;
  const scoped = locationScoped(vehicles, locationIds, (v) => v.location);
  const findings: AgentFinding[] = [];
  // Readiness blockers: vehicles not available needed for upcoming rentals.
  const upcoming = rentals.filter(
    (r) =>
      (r.status === "ready_for_checkout" || r.status === "active") &&
      r.vehicle_id,
  );
  for (const r of upcoming) {
    const v = scoped.find((x) => x.id === r.vehicle_id);
    if (!v) continue;
    if (v.status !== "available" && v.status !== "rented") {
      findings.push({
        finding_type: "readiness_blocker",
        entity_type: "vehicle",
        entity_id: v.id,
        label: `${v.year} ${v.make} ${v.model}`,
        deep_link: `/vehicles/${v.id}`,
        fields: {
          vehicle_label: `${v.year} ${v.make} ${v.model}`,
          reason: `Vehicle status: ${v.status}`,
          rental_id: r.id,
        },
      });
    }
  }
  // Rentals needing a ready vehicle soon (next 2 days from checkout date).
  const horizon = now.getTime() + 2 * DAY;
  for (const r of upcoming) {
    const start = r.checkout_date
      ? new Date(r.checkout_date + "T00:00:00")
      : null;
    if (!start || start.getTime() > horizon) continue;
    if (!r.vehicle_id) {
      findings.push({
        finding_type: "no_ready_vehicle",
        entity_type: "rental",
        entity_id: r.id,
        label: r.agreement_number ?? r.id,
        deep_link: `/rental-management?rental=${r.id}`,
        fields: {
          pickup_date: r.checkout_date ?? "",
        },
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Finance Review findings
// ---------------------------------------------------------------------------

export function buildFinanceReviewFindings(args: {
  expenses: ExpenseTransaction[];
  expenseCategories: ExpenseCategory[];
  importedTransactions: ImportedTransaction[];
  locationIds: string[];
}): AgentFinding[] {
  const { expenses, expenseCategories, importedTransactions } = args;
  const findings: AgentFinding[] = [];
  // Unallocated expenses (no vehicle_id) that are posted.
  for (const e of expenses) {
    if (e.status !== "posted" || e.reversal_of) continue;
    if (isExpenseOverhead(e, expenseCategories)) continue; // overhead is intentionally unallocated
    if (!e.vehicle_id) {
      findings.push({
        finding_type: "unallocated_expense",
        entity_type: "expense",
        entity_id: e.id,
        label: e.expense_number ?? e.id,
        deep_link: `/finance?tab=expenses&expense=${e.id}`,
        fields: {
          amount: e.amount,
          suggested_category: expenseCategoryName(e, expenseCategories),
        },
      });
    }
  }
  // Missing documentation: posted expense with no receipt/document link.
  for (const e of expenses) {
    if (e.status !== "posted" || e.reversal_of) continue;
    const hasDoc = expenseHasDocumentation(e);
    if (!hasDoc) {
      findings.push({
        finding_type: "missing_documentation",
        entity_type: "expense",
        entity_id: e.id,
        label: e.expense_number ?? e.id,
        deep_link: `/finance?tab=expenses&expense=${e.id}`,
        fields: {
          amount: e.amount,
        },
      });
    }
  }
  // Unreviewed bank transactions.
  for (const t of importedTransactions) {
    if (t.review_status !== "unreviewed") continue;
    if (t.match_status === "matched" || t.match_status === "split_matched")
      continue;
    if (t.transfer_status === "transfer") continue;
    findings.push({
      finding_type: "unreviewed_bank_txn",
      entity_type: "bank_transaction",
      entity_id: t.id,
      label: t.description ?? t.id,
      deep_link: `/finance?tab=banking&subtab=inbox&txn=${t.id}`,
      fields: {
        amount: t.amount,
        direction: t.direction,
      },
    });
  }
  // Duplicate candidates: same amount, same date, same merchant, both posted.
  for (let i = 0; i < expenses.length; i++) {
    const a = expenses[i];
    if (a.status !== "posted" || a.reversal_of) continue;
    for (let j = i + 1; j < expenses.length; j++) {
      const b = expenses[j];
      if (b.status !== "posted" || b.reversal_of) continue;
      if (
        Math.abs(a.amount - b.amount) < 0.005 &&
        a.transaction_date === b.transaction_date &&
        (a.vendor_id ?? a.description) === (b.vendor_id ?? b.description)
      ) {
        findings.push({
          finding_type: "duplicate_expense_candidate",
          entity_type: "expense",
          entity_id: b.id,
          label: b.expense_number ?? b.id,
          deep_link: `/finance?tab=expenses&expense=${b.id}`,
          fields: { amount: b.amount },
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Maintenance findings
// ---------------------------------------------------------------------------

export function buildMaintenanceFindings(args: {
  vehicles: Vehicle[];
  locationIds: string[];
  now: Date;
}): AgentFinding[] {
  const { vehicles, locationIds, now } = args;
  const scoped = locationScoped(vehicles, locationIds, (v) => v.location);
  const findings: AgentFinding[] = [];
  for (const v of scoped) {
    if (v.status === "maintenance" || v.status === "out_of_service") {
      findings.push({
        finding_type: "overdue_maintenance",
        entity_type: "vehicle",
        entity_id: v.id,
        label: `${v.year} ${v.make} ${v.model}`,
        deep_link: `/vehicles/${v.id}`,
        fields: {
          reason: `Vehicle status: ${v.status}`,
          vehicle_label: `${v.year} ${v.make} ${v.model}`,
        },
      });
    }
    void now;
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Compliance findings
// ---------------------------------------------------------------------------

export function buildComplianceFindings(args: {
  vehicles: Vehicle[];
  locationIds: string[];
  now: Date;
}): AgentFinding[] {
  const { vehicles, locationIds, now } = args;
  const scoped = locationScoped(vehicles, locationIds, (v) => v.location);
  const findings: AgentFinding[] = [];
  const horizon = now.getTime() + 14 * DAY;
  for (const v of scoped) {
    const ins = v.insurance_expiry;
    if (ins) {
      const d = new Date(ins + "T00:00:00").getTime();
      if (d >= now.getTime() && d <= horizon) {
        findings.push({
          finding_type: "expiring_document",
          entity_type: "vehicle",
          entity_id: v.id,
          label: `${v.year} ${v.make} ${v.model}`,
          deep_link: `/vehicles/${v.id}`,
          fields: {
            document_type: "Insurance",
            expiry_date: ins,
          },
        });
      }
    }
    const reg = v.registration_expiry;
    if (reg) {
      const d = new Date(reg + "T00:00:00").getTime();
      if (d >= now.getTime() && d <= horizon) {
        findings.push({
          finding_type: "expiring_document",
          entity_type: "vehicle",
          entity_id: v.id,
          label: `${v.year} ${v.make} ${v.model}`,
          deep_link: `/vehicles/${v.id}`,
          fields: {
            document_type: "Registration",
            expiry_date: reg,
          },
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Partner Settlement findings
// ---------------------------------------------------------------------------

export function buildPartnerSettlementFindings(args: {
  agreements: { id: string; label: string; partner_name?: string }[];
  period_start: string;
  period_end: string;
}): AgentFinding[] {
  const { agreements, period_start, period_end } = args;
  const findings: AgentFinding[] = [];
  for (const a of agreements) {
    findings.push({
      finding_type: "settlement_period_open",
      entity_type: "agreement",
      entity_id: a.id,
      label: a.label,
      deep_link: `/investors?agreement=${a.id}`,
      fields: {
        agreement_id: a.id,
        period_start,
        period_end,
      },
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Rental Operations findings
// ---------------------------------------------------------------------------

export function buildRentalOperationsFindings(args: {
  rentals: RentalAgreement[];
  locationIds: string[];
  now: Date;
}): AgentFinding[] {
  const { rentals, locationIds, now } = args;
  // RentalAgreement has no direct location field; cannot location-scope.
  // (Scope would require the rental's vehicle location.) Empty scope = all.
  void locationIds;
  const scoped = rentals;
  const findings: AgentFinding[] = [];
  for (const r of scoped) {
    if (r.status !== "overdue" && r.status !== "late") continue;
    findings.push({
      finding_type: "overdue_rental",
      entity_type: "rental",
      entity_id: r.id,
      label: r.agreement_number ?? r.id,
      deep_link: `/rental-management?rental=${r.id}`,
      fields: {},
    });
  }
  return findings;
}

/** Build findings for an agent from authoritative store data. */
export function buildAgentFindings(args: {
  agent_type: AgentType;
  rentals: RentalAgreement[];
  customers: Customer[];
  vehicles: Vehicle[];
  transactions: FinancialTransaction[];
  expenses: ExpenseTransaction[];
  expenseCategories: ExpenseCategory[];
  importedTransactions: ImportedTransaction[];
  tasks: Task[];
  agreements: { id: string; label: string; partner_name?: string }[];
  locationIds: string[];
  now: Date;
  period_start: string;
  period_end: string;
}): AgentFinding[] {
  switch (args.agent_type) {
    case "collections":
      return buildCollectionsFindings({
        rentals: args.rentals,
        customers: args.customers,
        transactions: args.transactions,
        tasks: args.tasks,
        locationIds: args.locationIds,
        now: args.now,
      });
    case "fleet_readiness":
      return buildFleetReadinessFindings({
        vehicles: args.vehicles,
        rentals: args.rentals,
        locationIds: args.locationIds,
        now: args.now,
      });
    case "finance_review":
      return buildFinanceReviewFindings({
        expenses: args.expenses,
        expenseCategories: args.expenseCategories,
        importedTransactions: args.importedTransactions,
        locationIds: args.locationIds,
      });
    case "maintenance":
      return buildMaintenanceFindings({
        vehicles: args.vehicles,
        locationIds: args.locationIds,
        now: args.now,
      });
    case "compliance":
      return buildComplianceFindings({
        vehicles: args.vehicles,
        locationIds: args.locationIds,
        now: args.now,
      });
    case "partner_settlement":
      return buildPartnerSettlementFindings({
        agreements: args.agreements,
        period_start: args.period_start,
        period_end: args.period_end,
      });
    case "rental_operations":
      return buildRentalOperationsFindings({
        rentals: args.rentals,
        locationIds: args.locationIds,
        now: args.now,
      });
    default:
      return [];
  }
}
