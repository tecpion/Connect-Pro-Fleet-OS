// Connect Pro Fleet — Case Center selectors (Build #54).
//
// Pure functions over CaseCenterSources. Case Center metrics are DERIVED from
// authoritative records — never seeded independently. Financial totals come
// from the linked ledger transactions (customer charges, payments, deposits,
// expenses), not from a second balance.
//
// Possession matching REUSES the existing violationPossession resolver — no
// duplicate matching logic. Case Center never silently assigns responsibility.

import type {
  CaseRecord,
  CaseStatus,
  CaseCategory,
  CaseCenterSources,
  CaseEvent,
} from "./caseCenterTypes";
import { CASE_OPEN_STATUSES } from "./caseCenterTypes";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";
import {
  resolveVehiclePossessionAt,
  type PossessionResult,
} from "./violationPossession";
import {
  CASE_EVIDENCE_REQUIREMENTS,
  resolveEvidenceStatus,
  type EvidenceResolutionInputs,
} from "./caseCenterEvidence";

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function getOpenCases(cases: CaseRecord[]): CaseRecord[] {
  return cases.filter((c) => CASE_OPEN_STATUSES.includes(c.status));
}

export function getCasesByCategory(
  cases: CaseRecord[],
  category: CaseCategory,
): CaseRecord[] {
  return cases.filter((c) => c.category === category);
}

export function getCasesDueSoon(
  cases: CaseRecord[],
  now: Date = new Date(),
  withinDays = 7,
): CaseRecord[] {
  const nowTs = now.getTime();
  const horizon = nowTs + withinDays * DAY;
  return cases.filter((c) => {
    if (!CASE_OPEN_STATUSES.includes(c.status)) return false;
    if (!c.due_date) return false;
    const due = new Date(c.due_date).getTime();
    if (isNaN(due)) return false;
    return due >= nowTs && due <= horizon;
  });
}

export function getOverdueCases(
  cases: CaseRecord[],
  now: Date = new Date(),
): CaseRecord[] {
  const nowTs = now.getTime();
  return cases.filter((c) => {
    if (!CASE_OPEN_STATUSES.includes(c.status)) return false;
    if (!c.due_date) return false;
    const due = new Date(c.due_date).getTime();
    if (isNaN(due)) return false;
    return due < nowTs;
  });
}

// ---------------------------------------------------------------------------
// Derived metrics (from authoritative records — never seeded independently)
// ---------------------------------------------------------------------------

export interface CaseCenterMetrics {
  open_cases: number;
  needs_review: number;
  awaiting_customer: number;
  disputed: number;
  recovery_pending: number;
  due_soon: number;
  total_amount_at_issue: number;
  unrecovered_amount: number;
}

/** Derive Case Center metrics from authoritative case records. Financial totals
 *  are computed from the case's amount_at_issue minus recovered amounts linked
 *  via authoritative ledger transactions. */
export function deriveCaseCenterMetrics(
  src: CaseCenterSources,
): CaseCenterMetrics {
  const open = getOpenCases(src.cases);
  const totalAmount = open.reduce(
    (sum, c) => sum + (c.amount_at_issue || 0),
    0,
  );

  // Unrecovered = amount at issue minus payments + deposit applications +
  // insurance recoveries linked via authoritative ledger transactions.
  const unrecovered = open.reduce((sum, c) => {
    const charged = c.amount_at_issue || 0;
    const payments = sumLinkedAmount(
      src.payments,
      c.financial_links.payment_ids,
    );
    const deposits = sumLinkedAmount(
      src.deposits
        .filter((d) => c.financial_links.deposit_application_ids.includes(d.id))
        .flatMap(
          (d) =>
            (d as unknown as { applications?: { amount: number }[] })
              .applications ?? [],
        ),
      [],
    );
    const recovered = payments + deposits + (c.outcome?.amount_recovered || 0);
    return sum + Math.max(0, charged - recovered);
  }, 0);

  return {
    open_cases: open.length,
    needs_review: open.filter(
      (c) => c.status === "needs_review" || c.status === "new",
    ).length,
    awaiting_customer: open.filter((c) => c.status === "awaiting_customer")
      .length,
    disputed: open.filter((c) => c.status === "disputed").length,
    recovery_pending: open.filter((c) => c.status === "recovery_pending")
      .length,
    due_soon: getCasesDueSoon(src.cases).length,
    total_amount_at_issue: totalAmount,
    unrecovered_amount: unrecovered,
  };
}

function sumLinkedAmount(txns: { amount?: number }[], ids: string[]): number {
  return txns
    .filter((t) => ids.includes((t as unknown as { id?: string }).id ?? ""))
    .reduce((s, t) => s + (t.amount || 0), 0);
}

// ---------------------------------------------------------------------------
// Case financial summary (derived from authoritative ledger links)
// ---------------------------------------------------------------------------

export interface CaseFinancialSummary {
  customer_charges_total: number;
  payments_total: number;
  deposit_applications_total: number;
  refunds_total: number;
  expenses_total: number;
  insurance_recovery_total: number;
  outstanding_amount: number;
}

/** Derive a case's financial summary from its authoritative ledger links.
 *  Case Center is NOT a second ledger — this is a read-only aggregation. */
export function deriveCaseFinancialSummary(
  caseRecord: CaseRecord,
  src: CaseCenterSources,
): CaseFinancialSummary {
  const charges = sumLinkedAmount(
    src.customerCharges as unknown as { amount?: number }[],
    caseRecord.financial_links.customer_charge_ids,
  );
  const payments = sumLinkedAmount(
    src.payments as unknown as { amount?: number }[],
    caseRecord.financial_links.payment_ids,
  );
  const deposits = caseRecord.financial_links.deposit_application_ids.reduce(
    (s, id) => {
      const dep = src.deposits.find((d) => d.id === id) as unknown as {
        applications?: { amount: number }[];
      };
      return s + (dep?.applications?.reduce((a, x) => a + x.amount, 0) || 0);
    },
    0,
  );
  const refunds = sumLinkedAmount(
    src.payments as unknown as { amount?: number }[],
    caseRecord.financial_links.refund_ids,
  );
  const expenses = sumLinkedAmount(
    src.expenses as unknown as { amount?: number }[],
    caseRecord.financial_links.expense_ids,
  );
  const insurance = caseRecord.financial_links.insurance_claim_refs.length
    ? caseRecord.outcome?.amount_recovered || 0
    : 0;
  const outstanding = Math.max(0, charges - payments - deposits - insurance);
  return {
    customer_charges_total: charges,
    payments_total: payments,
    deposit_applications_total: deposits,
    refunds_total: refunds,
    expenses_total: expenses,
    insurance_recovery_total: insurance,
    outstanding_amount: outstanding,
  };
}

// ---------------------------------------------------------------------------
// Case-aware financial lines (Build #57)
// ---------------------------------------------------------------------------

/** A single derived financial line shown in the Financials tab. Only lines
 *  relevant to the case category are produced — irrelevant lines are omitted
 *  rather than shown as misleading $0. Amounts come from authoritative ledger
 *  links; Case Center is NOT a second ledger. */
export interface CaseFinancialLine {
  key: string;
  label: string;
  amount: number;
  /** When true the line is a headline figure (e.g. outstanding / refund
   *  pending) and rendered with emphasis. */
  emphasis?: boolean;
  /** Optional helper hint explaining what the figure means for this case. */
  hint?: string;
}

/** Resolve the linked customer-charge transactions (authoritative ledger). */
export function linkedCustomerCharges(
  c: CaseRecord,
  src: CaseCenterSources,
): import("./chargeTypes").FinancialTransaction[] {
  return src.customerCharges.filter((t) =>
    c.financial_links.customer_charge_ids.includes(t.id),
  );
}

/** Resolve linked payment transactions (authoritative ledger). */
export function linkedPayments(
  c: CaseRecord,
  src: CaseCenterSources,
): import("./chargeTypes").FinancialTransaction[] {
  return src.payments.filter((t) =>
    c.financial_links.payment_ids.includes(t.id),
  );
}

/** Resolve linked refund transactions (authoritative ledger). */
export function linkedRefunds(
  c: CaseRecord,
  src: CaseCenterSources,
): import("./chargeTypes").FinancialTransaction[] {
  return src.payments.filter((t) =>
    c.financial_links.refund_ids.includes(t.id),
  );
}

/** Resolve linked expense transactions (authoritative expense ledger). */
export function linkedExpenses(
  c: CaseRecord,
  src: CaseCenterSources,
): import("./expenseTypes").ExpenseTransaction[] {
  return src.expenses.filter((e) =>
    c.financial_links.expense_ids.includes(e.id),
  );
}

/** Sum deposit applications from linked deposit ids (authoritative deposit
 *  ledger). */
export function linkedDepositApplicationsTotal(
  c: CaseRecord,
  src: CaseCenterSources,
): number {
  return c.financial_links.deposit_application_ids.reduce((sum, id) => {
    const dep = src.deposits.find((d) => d.id === id);
    if (!dep) return sum;
    return sum + (dep.applied_amount || 0);
  }, 0);
}

/** Derive the case-aware financial lines for the Financials tab. Only lines
 *  relevant to the case category are returned — no misleading $0 fields for
 *  irrelevant categories. All amounts are derived from authoritative ledger
 *  links; Case Center is a derived view, not a ledger. */
export function deriveCaseFinancialLines(
  c: CaseRecord,
  src: CaseCenterSources,
): CaseFinancialLine[] {
  const charges = linkedCustomerCharges(c, src);
  const payments = linkedPayments(c, src);
  const refunds = linkedRefunds(c, src);
  const expenses = linkedExpenses(c, src);
  const depositApplied = linkedDepositApplicationsTotal(c, src);
  const insuranceRefs = c.financial_links.insurance_claim_refs;

  const sum = (xs: { amount: number }[]) =>
    xs.reduce((s, x) => s + (x.amount || 0), 0);

  const lines: CaseFinancialLine[] = [];

  switch (c.category) {
    case "deposits_refunds": {
      // Refund / overcharge case: explain the refund obligation.
      const originalCharge = c.amount_at_issue;
      const approvedRefund = sum(refunds);
      const alreadyRefunded = refunds
        .filter((r) => r.status === "posted")
        .reduce((s, r) => s + r.amount, 0);
      const pending = Math.max(0, approvedRefund - alreadyRefunded);
      lines.push(
        {
          key: "original_charge",
          label: "Original Charge / Overcharge",
          amount: originalCharge,
        },
        {
          key: "approved_refund",
          label: "Approved Refund Amount",
          amount: approvedRefund,
        },
        {
          key: "already_refunded",
          label: "Amount Already Refunded",
          amount: alreadyRefunded,
        },
        {
          key: "refund_pending",
          label: "Refund Still Pending",
          amount: pending,
          emphasis: true,
        },
      );
      break;
    }
    case "damage_claims": {
      const repairExpense = sum(expenses);
      const customerCharge = sum(charges);
      const paymentsReceived = sum(payments);
      const insuranceRecovery = insuranceRefs.length
        ? c.outcome?.amount_recovered || 0
        : 0;
      const unrecovered = Math.max(
        0,
        customerCharge - paymentsReceived - depositApplied - insuranceRecovery,
      );
      lines.push(
        {
          key: "repair_expense",
          label: "Repair Expense",
          amount: repairExpense,
        },
        {
          key: "customer_charge",
          label: "Customer Charge",
          amount: customerCharge,
        },
        {
          key: "deposit_application",
          label: "Deposit Application",
          amount: depositApplied,
        },
        {
          key: "insurance_recovery",
          label: "Insurance Recovery",
          amount: insuranceRecovery,
        },
        {
          key: "payments",
          label: "Payments Received",
          amount: paymentsReceived,
        },
        {
          key: "unrecovered",
          label: "Unrecovered Amount",
          amount: unrecovered,
          emphasis: true,
        },
      );
      break;
    }
    case "tolls_tickets": {
      const td = c.toll_detail;
      const authorityAmount = td ? td.authority_amount : 0;
      const adminFee = td ? td.admin_fee + td.late_penalty : 0;
      const customerCharge = sum(charges);
      const recovered = sum(payments) + depositApplied;
      const unrecovered = Math.max(0, customerCharge - recovered);
      lines.push(
        {
          key: "authority_amount",
          label: "Authority Amount",
          amount: authorityAmount,
        },
        { key: "admin_fee", label: "Administrative Fee", amount: adminFee },
        {
          key: "customer_charge",
          label: "Customer Charge",
          amount: customerCharge,
        },
        { key: "recovered", label: "Amount Recovered", amount: recovered },
        {
          key: "unrecovered",
          label: "Unrecovered Amount",
          amount: unrecovered,
          emphasis: true,
        },
      );
      break;
    }
    case "disputes": {
      const dd = c.dispute_detail;
      const originalAmount = dd ? dd.original_amount : sum(charges);
      const adjusted = dd?.adjusted_amount ?? null;
      const customerCharge = sum(charges);
      const paymentsReceived = sum(payments);
      lines.push(
        {
          key: "original_charge",
          label: "Original Charge",
          amount: originalAmount,
        },
        {
          key: "current_charge",
          label: "Current Customer Charge",
          amount: customerCharge,
        },
        {
          key: "payments",
          label: "Payments Received",
          amount: paymentsReceived,
        },
      );
      if (adjusted !== null) {
        lines.push({
          key: "adjusted_amount",
          label: "Approved Adjustment",
          amount: adjusted,
          hint: "Original charge preserved — adjustment is separate.",
        });
      }
      break;
    }
    case "roadside_recovery": {
      const recoveryExpense = sum(expenses);
      const customerCharge = sum(charges);
      const paymentsReceived = sum(payments);
      const unrecovered = Math.max(0, customerCharge - paymentsReceived);
      lines.push(
        {
          key: "recovery_expense",
          label: "Recovery / Tow Expense",
          amount: recoveryExpense,
        },
        {
          key: "customer_charge",
          label: "Customer Charge",
          amount: customerCharge,
        },
        {
          key: "payments",
          label: "Payments Received",
          amount: paymentsReceived,
        },
        {
          key: "unrecovered",
          label: "Unrecovered Amount",
          amount: unrecovered,
          emphasis: true,
        },
      );
      break;
    }
    case "customer_violations": {
      const customerCharge = sum(charges);
      const paymentsReceived = sum(payments);
      const outstanding = Math.max(0, customerCharge - paymentsReceived);
      lines.push(
        {
          key: "customer_charge",
          label: "Customer Charge",
          amount: customerCharge,
        },
        {
          key: "payments",
          label: "Payments Received",
          amount: paymentsReceived,
        },
        {
          key: "outstanding",
          label: "Outstanding",
          amount: outstanding,
          emphasis: true,
        },
      );
      break;
    }
    default: {
      // general — show only what is linked.
      const customerCharge = sum(charges);
      const paymentsReceived = sum(payments);
      if (customerCharge || paymentsReceived) {
        lines.push(
          {
            key: "customer_charge",
            label: "Customer Charges",
            amount: customerCharge,
          },
          {
            key: "payments",
            label: "Payments Received",
            amount: paymentsReceived,
          },
        );
      }
      break;
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Resolution readiness (Build #57)
// ---------------------------------------------------------------------------

export interface ResolutionReadinessItem {
  key: string;
  label: string;
  ready: boolean;
  /** Why it is not ready (only when !ready). */
  blocker: string | null;
}

export interface ResolutionReadiness {
  items: ResolutionReadinessItem[];
  blockers: string[];
  eligible: boolean;
}

/** Derive resolution readiness for a case. Lists each requirement, whether it
 *  is met, and the exact blocker text when it is not. Closing/resolving a case
 *  must NOT erase linked balances or financial records — readiness is a gate,
 *  not a mutation. */
export function deriveResolutionReadiness(
  c: CaseRecord,
  src: CaseCenterSources,
  caseTasks: import("./taskTypes").Task[],
): ResolutionReadiness {
  const items: ResolutionReadinessItem[] = [];

  // Responsibility determined (not unreviewed/unknown).
  const respReady =
    c.responsibility.determination !== "unreviewed" &&
    c.responsibility.determination !== "unknown";
  items.push({
    key: "responsibility",
    label: "Responsibility determined",
    ready: respReady,
    blocker: respReady
      ? null
      : "Responsibility has not been determined (currently Unreviewed).",
  });

  // Required evidence complete — reuses the evidence requirements.
  const reqs = CASE_EVIDENCE_REQUIREMENTS[c.category] ?? [];
  const requiredKeys = reqs
    .filter((r) => r.tier === "required")
    .map((r) => r.key);
  const fl = c.financial_links;
  const links = c.evidence_links;
  const violation = links.violation_id
    ? src.violations.find((v) => v.id === links.violation_id)
    : null;
  const incident = links.incident_id
    ? src.incidents.find((i) => i.id === links.incident_id)
    : null;
  const damageClaim = links.damage_claim_id
    ? src.damageClaims.find((d) => d.id === links.damage_claim_id)
    : null;
  const inputs: EvidenceResolutionInputs = {
    rental_id: links.rental_id,
    customer_charge_ids: fl.customer_charge_ids,
    payment_ids: fl.payment_ids,
    deposit_application_ids: fl.deposit_application_ids,
    refund_ids: fl.refund_ids,
    expense_ids: fl.expense_ids,
    insurance_claim_refs: fl.insurance_claim_refs,
    violation_present: !!violation,
    violation_number: violation?.violation_number ?? null,
    incident_present: !!incident,
    damage_claim_present: !!damageClaim,
    damage_claim_number: damageClaim?.claim_number ?? null,
    inspection_ids: links.inspection_ids,
    vault_doc_refs: links.vault_doc_refs,
    uploaded_file_refs: links.uploaded_file_refs,
    possession_match: c.toll_detail?.possession_match ?? null,
    maintenance_work_order_id:
      c.roadside_detail?.maintenance_work_order_id ?? null,
  };
  const missingEvidence = requiredKeys
    .map((k) => ({ k, r: resolveEvidenceStatus(k, inputs) }))
    .filter((x) => x.r.status === "missing");
  const evidenceReady = missingEvidence.length === 0;
  items.push({
    key: "evidence",
    label: "Required evidence complete",
    ready: evidenceReady,
    blocker: evidenceReady
      ? null
      : `Missing required evidence: ${missingEvidence.map((m) => m.k).join(", ")}.`,
  });

  // Financial action complete — category-specific.
  const charges = linkedCustomerCharges(c, src);
  const payments = linkedPayments(c, src);
  const refunds = linkedRefunds(c, src);
  let finReady: boolean;
  let finBlocker: string | null;
  if (c.category === "deposits_refunds") {
    // Refund case: an approved refund must be processed. A posted refund
    // transaction represents the approval; the case is financially complete
    // only once it is no longer awaiting processing (i.e. the case has moved
    // past awaiting_customer/action_required). This matches the founder
    // example: "Cannot resolve yet — approved refund has not been processed."
    const approved = refunds.reduce((s, r) => s + r.amount, 0);
    const processed = refunds
      .filter((r) => r.status === "posted")
      .reduce((s, r) => s + r.amount, 0);
    const awaitingProcessing =
      c.status === "awaiting_customer" || c.status === "action_required";
    finReady = approved > 0 && processed >= approved && !awaitingProcessing;
    finBlocker = finReady
      ? null
      : "Cannot resolve yet — approved refund has not been processed.";
  } else if (c.category === "tolls_tickets" || c.category === "damage_claims") {
    // Recovery cases: customer charge must exist and be recovered (or written
    // off via outcome). Outstanding > 0 blocks unless responsibility is company.
    const chargeTotal = charges.reduce((s, x) => s + x.amount, 0);
    const recovered =
      payments.reduce((s, x) => s + x.amount, 0) +
      linkedDepositApplicationsTotal(c, src) +
      (c.outcome?.amount_recovered || 0);
    const outstanding = Math.max(0, chargeTotal - recovered);
    const companyResp =
      c.responsibility.determination === "company" ||
      c.responsibility.determination === "insurance";
    finReady = chargeTotal === 0 || outstanding === 0 || companyResp;
    finBlocker = finReady
      ? null
      : `Cannot resolve yet — $${outstanding.toFixed(2)} outstanding on linked customer charge.`;
  } else {
    // For disputes/violations/roadside/general: no required financial action
    // beyond what is linked; ready if there is no pending charge action. We
    // treat it as ready (financial action is optional / not blocking) unless a
    // charge exists with no payment and customer responsibility.
    const chargeTotal = charges.reduce((s, x) => s + x.amount, 0);
    finReady = true;
    finBlocker = null;
    void chargeTotal;
  }
  items.push({
    key: "financial",
    label: "Financial action complete",
    ready: finReady,
    blocker: finBlocker,
  });

  // Open tasks remaining.
  const openTasks = caseTasks.filter(
    (t) => t.status === "open" || t.status === "in_progress",
  );
  const tasksReady = openTasks.length === 0;
  items.push({
    key: "tasks",
    label: "No open tasks remaining",
    ready: tasksReady,
    blocker: tasksReady
      ? null
      : `${openTasks.length} open task(s) linked to this case.`,
  });

  // Customer communication complete — a customer_notified or customer_disputed
  // event must exist for cases that require customer interaction.
  const events = src.caseEvents.filter((e) => e.case_id === c.id);
  const needsComms =
    c.status === "awaiting_customer" || c.status === "disputed";
  const hasComms = events.some(
    (e) => e.type === "customer_notified" || e.type === "customer_disputed",
  );
  const commsReady = !needsComms || hasComms;
  items.push({
    key: "communication",
    label: "Customer communication complete",
    ready: commsReady,
    blocker: commsReady
      ? null
      : "Customer has not been notified for this case.",
  });

  const blockers = items
    .filter((i) => !i.ready)
    .map((i) => i.blocker)
    .filter((b): b is string => !!b);

  return { items, blockers, eligible: blockers.length === 0 };
}

/** Suggest a rental for a toll/ticket event using authoritative rental
 *  possession history. If exactly one rental possessed the vehicle → suggest.
 *  If multiple may match → require review. If none → leave unassigned.
 *  NEVER silently assigns responsibility. */
export function suggestRentalForTollEvent(
  vehicleId: string,
  occurredAt: string,
  rentals: CaseCenterSources["rentals"],
  exchanges: RentalVehicleExchange[],
): PossessionResult {
  return resolveVehiclePossessionAt(vehicleId, occurredAt, rentals, exchanges);
}

// ---------------------------------------------------------------------------
// Case timeline (append-only — chronological)
// ---------------------------------------------------------------------------

export function getCaseTimeline(
  caseId: string,
  events: CaseEvent[],
): CaseEvent[] {
  return events
    .filter((e) => e.case_id === caseId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Case ↔ Rental Record integration
// ---------------------------------------------------------------------------

/** Cases linked to a rental (for the Rental Record's "Incidents & Cases"
 *  section). */
export function casesForRental(
  rentalId: string,
  cases: CaseRecord[],
): CaseRecord[] {
  return cases.filter((c) => c.rental_id === rentalId);
}

/** Cases linked to a customer. */
export function casesForCustomer(
  customerId: string,
  cases: CaseRecord[],
): CaseRecord[] {
  return cases.filter((c) => c.customer_id === customerId);
}

/** Cases linked to a vehicle. */
export function casesForVehicle(
  vehicleId: string,
  cases: CaseRecord[],
): CaseRecord[] {
  return cases.filter((c) => c.vehicle_id === vehicleId);
}

// ---------------------------------------------------------------------------
// Status transitions (audit-guarded)
// ---------------------------------------------------------------------------

/** Valid forward status transitions. Closing a case does NOT erase linked
 *  balances or financial records. */
export function canTransitionStatus(from: CaseStatus, to: CaseStatus): boolean {
  if (from === to) return false;
  if (from === "closed") return false; // closed is terminal
  if (to === "closed" && from !== "resolved") return false; // must resolve first
  return true;
}
