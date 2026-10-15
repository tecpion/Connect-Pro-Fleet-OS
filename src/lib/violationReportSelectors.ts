// Connect Pro Fleet — V1 Tolls & Violations Automation: derived reporting
// selectors.
//
// All metrics are DERIVED from authoritative violation records + linked ledger
// transactions. Nothing is seeded independently. No second ledger. These feed
// the Finance / Reports surface and the Copilot "how much have we paid /
// recovered" questions.

import type { Violation } from "./violationTypes";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import type { FinancialTransaction } from "./chargeTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type { MatchingConfidence } from "./violationTypes";

const DAY = 86_400_000;

export interface ViolationReportMetrics {
  total_violations: number;
  total_tolls: number;
  total_violations_non_toll: number;
  /** Authority cost the company paid (sum of posted linked expenses). */
  company_cost: number;
  /** Amount charged to customers (sum of charged violation totals). */
  amount_charged_to_customers: number;
  /** Cash actually recovered from customers (linked payments). */
  amount_recovered: number;
  /** Company cost not yet offset by customer charge or recovery. */
  unrecovered_amount: number;
  /** Disputed amount (total of disputed open violations). */
  disputed_amount: number;
  /** Fraction of ingested events that matched a rental (0..1). */
  match_rate: number;
  /** Average days from company payment to full customer recovery. */
  average_recovery_days: number | null;
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return isNaN(t) ? null : t;
}

/** Derive reporting metrics from authoritative records within an optional date
 *  range (by occurred_at). Range is inclusive; omit for all-time. */
export function deriveViolationReportMetrics(
  violations: Violation[],
  linkedPayments: FinancialTransaction[],
  linkedExpenses: ExpenseTransaction[],
  range?: { start: string; end: string },
): ViolationReportMetrics {
  const startTs = range ? parse(range.start) : null;
  const endTs = range ? parse(range.end) : null;
  const inRange = (v: Violation) => {
    if (startTs == null || endTs == null) return true;
    const t = parse(v.occurred_at);
    if (t == null) return false;
    return t >= startTs && t <= endTs;
  };

  const scoped = violations.filter(inRange);
  let companyCost = 0;
  let charged = 0;
  let recovered = 0;
  let disputed = 0;
  let matched = 0;
  let ingested = 0;

  for (const v of scoped) {
    if (v.violation_type === "toll") void 0; // counted below
    if (v.customer_charge_status === "charged") charged += v.total_amount;
    if (
      v.dispute_status !== "not_disputed" &&
      VIOLATION_OPEN_STATUSES.includes(v.status)
    )
      disputed += v.total_amount;
    // Match rate is over ingested (provider-sourced) records only.
    if (v.provider) {
      ingested++;
      if (v.matching_confidence === "matched") matched++;
    }
  }

  for (const p of linkedPayments) {
    if (p.category === "payment") recovered += p.amount;
  }
  for (const e of linkedExpenses) {
    if (e.status === "posted") companyCost += e.amount;
  }

  const unrecovered = Math.max(0, companyCost - Math.max(charged, recovered));
  const matchRate = ingested > 0 ? matched / ingested : 0;

  // Average recovery time: for each company-paid violation that is fully
  // recovered (charged + payment), days between company payment (expense date)
  // and the latest linked payment. Null when none recovered.
  let recoveryDaysSum = 0;
  let recoveryCount = 0;
  const expensesByViolation = new Map<string, ExpenseTransaction>();
  for (const e of linkedExpenses) {
    const vid = (e.metadata as { violation_id?: string } | null)?.violation_id;
    if (vid) expensesByViolation.set(vid, e);
  }
  const paymentsByViolation = new Map<string, FinancialTransaction[]>();
  for (const p of linkedPayments) {
    const vid = (p.metadata as { violation_id?: string } | null)?.violation_id;
    if (vid) {
      const arr = paymentsByViolation.get(vid) ?? [];
      arr.push(p);
      paymentsByViolation.set(vid, arr);
    }
  }
  for (const v of scoped) {
    if (v.company_payment_status !== "paid") continue;
    if (v.customer_charge_status !== "charged") continue;
    const exp = expensesByViolation.get(v.id);
    const pays = paymentsByViolation.get(v.id) ?? [];
    if (!exp || pays.length === 0) continue;
    const payStart = parse(exp.transaction_date);
    const lastPay = pays
      .map((p) => parse(p.effective_date))
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b)
      .pop();
    if (payStart == null || lastPay == null) continue;
    const days = Math.max(0, Math.round((lastPay - payStart) / DAY));
    recoveryDaysSum += days;
    recoveryCount++;
  }
  const averageRecoveryDays =
    recoveryCount > 0 ? Math.round(recoveryDaysSum / recoveryCount) : null;

  return {
    total_violations: scoped.length,
    total_tolls: scoped.filter((v) => v.violation_type === "toll").length,
    total_violations_non_toll: scoped.filter((v) => v.violation_type !== "toll")
      .length,
    company_cost: companyCost,
    amount_charged_to_customers: charged,
    amount_recovered: recovered,
    unrecovered_amount: unrecovered,
    disputed_amount: disputed,
    match_rate: matchRate,
    average_recovery_days: averageRecoveryDays,
  };
}

/** Count of violations by matching confidence (over ingested/provider records). */
export function matchConfidenceBreakdown(
  violations: Violation[],
): Record<MatchingConfidence, number> {
  const out: Record<MatchingConfidence, number> = {
    matched: 0,
    ambiguous: 0,
    company_possession: 0,
    unmatched: 0,
  };
  for (const v of violations) {
    if (v.provider && v.matching_confidence) out[v.matching_confidence]++;
  }
  return out;
}
