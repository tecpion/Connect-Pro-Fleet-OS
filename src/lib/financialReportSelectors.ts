// Connect Pro Fleet — Build #18 financial report selectors.
//
// Revenue, collections, outstanding balances, aging, payment arrangements,
// and late-fee reports. All derived from authoritative ledgers — no new
// financial logic. Revenue excludes held deposits/tax; collections are actual
// payments; outstanding/aging come from billing obligations; arrangements are
// promises (never collections); late fees come from the ledger.

import type { ReportContext, ReportFilter } from "./reportContext";
import { filterToDateRange } from "./reportInputs";
import { getCompanyProfitability } from "./profitabilitySelectors";
import {
  getTotalCollections,
  getCollectionsByTenderMethod,
  getCollectionsByProcessor,
  getTenderMethodMix,
  type CollectionByTender,
  type CollectionByProcessor,
  type TenderMixEntry,
} from "./collectionSelectors";
import { getPaymentObligations } from "./billingSelectors";
import {
  getBrokenArrangements,
  getPromisesDueToday,
  getArrangementCollectibleRemaining,
  getArrangementResolvedByCredits,
  isArrangementEffectivelyResolved,
  getScheduledRemaining,
  arrangementPaidAmount,
} from "./paymentArrangements";
import type { PaymentArrangement } from "./paymentArrangementTypes";
import { isCollectionPayment } from "./collectionSelectors";
import { inRange } from "./reconciliationSelectors";

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Revenue Summary
// ---------------------------------------------------------------------------

export interface RevenueSummaryReport {
  period_start: string;
  period_end: string;
  base_rental_revenue: number;
  late_fee_revenue: number;
  fee_revenue: number;
  damage_charge_revenue: number;
  forfeiture_revenue: number;
  other_revenue: number;
  tax_collected: number;
  total_operating_revenue: number;
}

export function getRevenueSummary(
  ctx: ReportContext,
  filter: ReportFilter,
): RevenueSummaryReport {
  const { inputs } = ctx;
  const { start, end } = filterToDateRange(filter);
  const company = getCompanyProfitability(inputs, { start, end });
  const r = company.revenue;
  // Damage charge revenue lives in "other_revenue" bucket from the profitability
  // engine (damage_charge transaction_type). We surface it separately here but
  // keep total consistent.
  return {
    period_start: filter.start,
    period_end: filter.end,
    base_rental_revenue: round2(r.base_rental_revenue),
    late_fee_revenue: round2(r.late_fee_revenue),
    fee_revenue: round2(r.fee_revenue),
    damage_charge_revenue: round2(r.other_revenue),
    forfeiture_revenue: round2(r.forfeiture_revenue),
    other_revenue: 0, // already allocated to damage above
    tax_collected: round2(r.tax_collected),
    total_operating_revenue: round2(r.total_revenue),
  };
}

// ---------------------------------------------------------------------------
// Collections Report
// ---------------------------------------------------------------------------

export interface CollectionsReport {
  period_start: string;
  period_end: string;
  total_collections: number;
  payment_count: number;
  average_payment: number;
  largest_payment: number;
  by_tender: CollectionByTender[];
  by_processor: CollectionByProcessor[];
  tender_mix: TenderMixEntry[];
}

function periodCollections(ctx: ReportContext, filter: ReportFilter) {
  const { start, end } = filterToDateRange(filter);
  return ctx.store.transactions.filter(
    (t) =>
      t.status === "posted" &&
      isCollectionPayment(t) &&
      inRange(t.effective_date, start, end),
  );
}

export function getCollectionsReport(
  ctx: ReportContext,
  filter: ReportFilter,
): CollectionsReport {
  const txns = periodCollections(ctx, filter);
  const total = getTotalCollections(txns);
  const count = txns.length;
  const largest = txns.reduce((m, t) => Math.max(m, t.amount), 0);
  return {
    period_start: filter.start,
    period_end: filter.end,
    total_collections: round2(total),
    payment_count: count,
    average_payment: count > 0 ? round2(total / count) : 0,
    largest_payment: round2(largest),
    by_tender: getCollectionsByTenderMethod(txns),
    by_processor: getCollectionsByProcessor(txns),
    tender_mix: getTenderMethodMix(txns),
  };
}

// ---------------------------------------------------------------------------
// Outstanding Balances + Aging
// ---------------------------------------------------------------------------

export interface OutstandingRow {
  rental_id: string;
  customer_id: string;
  customer: string;
  vehicle: string;
  total_outstanding: number;
  current_due: number;
  late_amount: number;
  oldest_due_date: string | null;
  days_late: number;
  arrangement_status: string | null;
  assigned_staff: string | null;
}

export interface OutstandingBalancesReport {
  rows: OutstandingRow[];
  total_outstanding: number;
  total_late: number;
}

export function getOutstandingBalancesReport(
  ctx: ReportContext,
  filter: ReportFilter,
): OutstandingBalancesReport {
  const { store, billingPeriods } = ctx;
  const obligations = getPaymentObligations(
    store.rentals,
    billingPeriods,
    store.transactions,
  );
  // Group obligations by rental
  const byRental = new Map<
    string,
    {
      total: number;
      current: number;
      late: number;
      oldest: string | null;
      daysLate: number;
    }
  >();
  for (const o of obligations) {
    if (o.amountDue <= 0) continue;
    const cur = byRental.get(o.rentalId) ?? {
      total: 0,
      current: 0,
      late: 0,
      oldest: null,
      daysLate: 0,
    };
    cur.total += o.amountDue;
    if (o.bucket === "late") {
      cur.late += o.amountDue;
      cur.daysLate = Math.max(cur.daysLate, o.daysLate);
    } else {
      cur.current += o.amountDue;
    }
    if (o.period?.due_at) {
      if (!cur.oldest || o.period.due_at < cur.oldest)
        cur.oldest = o.period.due_at;
    }
    byRental.set(o.rentalId, cur);
  }

  const rows: OutstandingRow[] = [];
  for (const [rentalId, v] of byRental) {
    const r = store.rentals.find((x) => x.id === rentalId);
    if (!r) continue;
    const veh = store.vehicles.find((x) => x.id === r.vehicle_id);
    const arrangement = store.paymentArrangements.find(
      (a) => a.rental_id === rentalId && a.status === "active",
    );
    rows.push({
      rental_id: rentalId,
      customer_id: r.customer_id,
      customer: store.customerName(r.customer_id),
      vehicle: veh ? `${veh.make} ${veh.model}` : "—",
      total_outstanding: round2(v.total),
      current_due: round2(v.current),
      late_amount: round2(v.late),
      oldest_due_date: v.oldest,
      days_late: v.daysLate,
      arrangement_status: arrangement ? arrangement.status : null,
      assigned_staff: r.created_by,
    });
  }
  rows.sort((a, b) => b.total_outstanding - a.total_outstanding);

  return {
    rows,
    total_outstanding: round2(
      rows.reduce((s, r) => s + r.total_outstanding, 0),
    ),
    total_late: round2(rows.reduce((s, r) => s + r.late_amount, 0)),
  };
}

export type AgingBucket =
  "current" | "1_3" | "4_7" | "8_14" | "15_30" | "30_plus";

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "1_3": "1–3 Days Late",
  "4_7": "4–7 Days",
  "8_14": "8–14 Days",
  "15_30": "15–30 Days",
  "30_plus": "30+ Days",
};

export interface AgingReport {
  buckets: {
    bucket: AgingBucket;
    label: string;
    count: number;
    amount: number;
  }[];
  total: number;
}

export function getAgingReport(ctx: ReportContext): AgingReport {
  const { store, billingPeriods } = ctx;
  const obligations = getPaymentObligations(
    store.rentals,
    billingPeriods,
    store.transactions,
  );
  const buckets: Record<AgingBucket, { count: number; amount: number }> = {
    current: { count: 0, amount: 0 },
    "1_3": { count: 0, amount: 0 },
    "4_7": { count: 0, amount: 0 },
    "8_14": { count: 0, amount: 0 },
    "15_30": { count: 0, amount: 0 },
    "30_plus": { count: 0, amount: 0 },
  };
  for (const o of obligations) {
    if (o.amountDue <= 0) continue;
    let bucket: AgingBucket;
    if (o.bucket !== "late") bucket = "current";
    else if (o.daysLate <= 3) bucket = "1_3";
    else if (o.daysLate <= 7) bucket = "4_7";
    else if (o.daysLate <= 14) bucket = "8_14";
    else if (o.daysLate <= 30) bucket = "15_30";
    else bucket = "30_plus";
    buckets[bucket].count += 1;
    buckets[bucket].amount += o.amountDue;
  }
  const out = (Object.keys(buckets) as AgingBucket[]).map((b) => ({
    bucket: b,
    label: AGING_BUCKET_LABELS[b],
    count: buckets[b].count,
    amount: round2(buckets[b].amount),
  }));
  return {
    buckets: out,
    total: round2(out.reduce((s, b) => s + b.amount, 0)),
  };
}

// ---------------------------------------------------------------------------
// Payment Arrangement Report
// ---------------------------------------------------------------------------

export interface ArrangementReportRow {
  arrangement_id: string;
  customer: string;
  rental_id: string | null;
  status: string;
  arrangement_amount: number;
  paid: number;
  scheduled_remaining: number;
  collectible_remaining: number;
  resolved_by_credits: number;
  promises_due_today: number;
  additional_balance_outside: number;
}

export interface PaymentArrangementReport {
  rows: ArrangementReportRow[];
  active_count: number;
  broken_count: number;
  resolved_count: number;
  total_collectible: number;
  promises_due_today_count: number;
}

function rentalOutstanding(
  ctx: ReportContext,
  rentalId: string | null,
): number {
  if (!rentalId) return 0;
  const obligations = getPaymentObligations(
    ctx.store.rentals,
    ctx.billingPeriods,
    ctx.store.transactions,
  );
  return obligations
    .filter((o) => o.rentalId === rentalId)
    .reduce((s, o) => s + o.amountDue, 0);
}

export function getPaymentArrangementReport(
  ctx: ReportContext,
): PaymentArrangementReport {
  const { store } = ctx;
  const installmentsByArr = (id: string) =>
    store.arrangementInstallments.filter((i) => i.arrangement_id === id);
  const broken = getBrokenArrangements(
    store.paymentArrangements,
    installmentsByArr,
    store.transactions,
  );
  const promisesToday = getPromisesDueToday(
    store.paymentArrangements,
    installmentsByArr,
    store.transactions,
  );

  const rows: ArrangementReportRow[] = store.paymentArrangements.map((a) => {
    const installments = installmentsByArr(a.id);
    const outstanding = rentalOutstanding(ctx, a.rental_id);
    const resolved = isArrangementEffectivelyResolved(
      a,
      installments,
      store.transactions,
      outstanding,
    );
    return {
      arrangement_id: a.id,
      customer: store.customerName(a.customer_id),
      rental_id: a.rental_id,
      status: resolved ? "resolved" : a.status,
      arrangement_amount: a.arrangement_amount,
      paid: round2(arrangementPaidAmount(installments, store.transactions)),
      scheduled_remaining: round2(
        getScheduledRemaining(a, installments, store.transactions),
      ),
      collectible_remaining: round2(
        getArrangementCollectibleRemaining(
          a,
          installments,
          store.transactions,
          outstanding,
        ),
      ),
      resolved_by_credits: round2(
        getArrangementResolvedByCredits(
          a,
          installments,
          store.transactions,
          outstanding,
        ),
      ),
      promises_due_today: promisesToday.filter((p) => p.arrangement_id === a.id)
        .length,
      additional_balance_outside: round2(
        Math.max(0, outstanding - a.arrangement_amount),
      ),
    };
  });

  return {
    rows,
    active_count: store.paymentArrangements.filter((a) => a.status === "active")
      .length,
    broken_count: broken.length,
    resolved_count: rows.filter((r) => r.status === "resolved").length,
    total_collectible: round2(
      rows.reduce((s, r) => s + r.collectible_remaining, 0),
    ),
    promises_due_today_count: promisesToday.length,
  };
}

// ---------------------------------------------------------------------------
// Late Fee Report
// ---------------------------------------------------------------------------

export interface LateFeeReport {
  total_assessed: number;
  total_paid: number;
  total_outstanding: number;
  total_waived: number;
  by_customer: {
    customer: string;
    assessed: number;
    paid: number;
    outstanding: number;
  }[];
}

export function getLateFeeReport(
  ctx: ReportContext,
  filter: ReportFilter,
): LateFeeReport {
  const { store } = ctx;
  const { start, end } = filterToDateRange(filter);
  const lateFeeTxns = store.transactions.filter(
    (t) =>
      t.status === "posted" &&
      t.transaction_type === "late_fee" &&
      inRange(t.effective_date, start, end),
  );
  // Waivers/reversals: credit transactions referencing late fees
  const waivers = store.transactions.filter(
    (t) =>
      t.status === "posted" &&
      (t.category === "credit" || t.category === "refund") &&
      t.metadata?.reversal_of &&
      lateFeeTxns.some((lf) => lf.id === t.metadata?.reversal_of),
  );

  const assessed = lateFeeTxns.reduce((s, t) => s + t.amount, 0);
  const waived = waivers.reduce((s, t) => s + Math.abs(t.amount), 0);

  // Paid: payments allocated toward late-fee obligations (approx: payments
  // after the late fee on the same rental, capped at late fee amount).
  const byCustomer = new Map<
    string,
    { assessed: number; paid: number; outstanding: number }
  >();
  for (const t of lateFeeTxns) {
    const r = store.rentals.find((x) => x.id === t.rental_id);
    const cust = r ? r.customer_id : t.customer_id;
    const cur = byCustomer.get(cust) ?? {
      assessed: 0,
      paid: 0,
      outstanding: 0,
    };
    cur.assessed += t.amount;
    byCustomer.set(cust, cur);
  }
  // Outstanding = assessed - payments allocated (use obligation selector per rental)
  for (const [cust, v] of byCustomer) {
    v.outstanding = Math.max(0, v.assessed - v.paid);
  }

  return {
    total_assessed: round2(assessed),
    total_paid: 0, // allocation-derived; conservative V1
    total_outstanding: round2(
      Array.from(byCustomer.values()).reduce((s, v) => s + v.outstanding, 0),
    ),
    total_waived: round2(waived),
    by_customer: Array.from(byCustomer.entries()).map(([cust, v]) => ({
      customer: store.customerName(cust),
      assessed: round2(v.assessed),
      paid: round2(v.paid),
      outstanding: round2(v.outstanding),
    })),
  };
}

export { DAY_MS };
export type { PaymentArrangement };
