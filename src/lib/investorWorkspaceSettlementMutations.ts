// Connect Pro Fleet — Investor V1 settlement mutation helpers.
//
// Settlement lifecycle: generate → recalculate → review → approve → paid.
// Reuses calculateSettlementBreakdown + evaluateSettlementReview. Payouts
// are distributions, never operating expenses. Locked settlements cannot be
// silently changed — reopen requires explicit reason.

import { TENANT_ID } from "./store/ids";
import { padSeq } from "./format";
import type {
  PartnerPaymentPreference,
  PartnerTimelineEventType,
  PartnershipAgreement,
  SettlementStatus,
  SettlementV1,
} from "./investorWorkspaceTypes";
import {
  calculateSettlementBreakdown,
  evaluateSettlementReview,
  hasExistingPayout,
  isSettlementLocked,
  type SettlementReviewContext,
} from "./investorWorkspaceSelectors";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

export interface SettlementMutationDeps {
  agreements: PartnershipAgreement[];
  settlements: SettlementV1[];
  staffId: string | null;
  nextSettlementNumber: () => string;
  logTimeline: (event: {
    investor_id: string;
    event_type: PartnerTimelineEventType;
    detail?: string | null;
    vehicle_id?: string | null;
    settlement_id?: string | null;
    agreement_id?: string | null;
  }) => void;
}

export function buildGenerateSettlement(deps: SettlementMutationDeps) {
  return (input: {
    investor_id: string;
    vehicle_id: string;
    pairing_id: string;
    agreement_id: string;
    period_start: string;
    period_end: string;
    gross_revenue: number;
    cash_collected: number;
    included_expenses: number;
    recoveries: number;
    manual_adjustments?: number;
    manual_adjustment_note?: string | null;
  }): { settlement: SettlementV1; errors: string[] } => {
    const errors: string[] = [];
    const agreement = deps.agreements.find((a) => a.id === input.agreement_id);
    if (!agreement) {
      errors.push("Agreement not found for this settlement.");
      return { settlement: null as never, errors };
    }
    const breakdown = calculateSettlementBreakdown({
      investorId: input.investor_id,
      vehicleId: input.vehicle_id,
      pairingId: input.pairing_id,
      agreement,
      periodStart: input.period_start,
      periodEnd: input.period_end,
      grossRevenue: input.gross_revenue,
      cashCollected: input.cash_collected,
      includedExpenses: input.included_expenses,
      recoveries: input.recoveries,
      manualAdjustments: input.manual_adjustments ?? 0,
      manualAdjustmentNote: input.manual_adjustment_note ?? null,
    });
    const settlement: SettlementV1 = {
      id: uid("stl"),
      tenant_id: TENANT_ID,
      settlement_number: deps.nextSettlementNumber(),
      investor_id: input.investor_id,
      vehicle_id: input.vehicle_id,
      pairing_id: input.pairing_id,
      agreement_id: input.agreement_id,
      agreement_version: agreement.version,
      period_start: input.period_start,
      period_end: input.period_end,
      gross_revenue: input.gross_revenue,
      cash_collected: input.cash_collected,
      included_expenses: input.included_expenses,
      recoveries_adjustments: input.recoveries,
      net_vehicle_contribution: breakdown.net_vehicle_contribution,
      company_share_pct: agreement.company_share_pct,
      partner_share_pct: agreement.partner_share_pct,
      manual_adjustments: input.manual_adjustments ?? 0,
      manual_adjustment_note: input.manual_adjustment_note ?? null,
      final_partner_payout: breakdown.final_partner_payout,
      company_retained: breakdown.company_retained,
      status: "calculated",
      paid_date: null,
      payment_method: null,
      payment_reference: null,
      approved_at: null,
      approved_by: null,
      locked: false,
      reopened_reason: null,
      reopened_at: null,
      reopened_by: null,
      voided_reason: null,
      voided_at: null,
      statement_doc_id: null,
      created_at: new Date().toISOString(),
      created_by: deps.staffId,
    };
    deps.logTimeline({
      investor_id: input.investor_id,
      event_type: "settlement_generated",
      detail: `${settlement.settlement_number} — ${settlement.period_start} → ${settlement.period_end}`,
      vehicle_id: input.vehicle_id,
      settlement_id: settlement.id,
      agreement_id: input.agreement_id,
    });
    return { settlement, errors };
  };
}

export function buildRecalculate(deps: SettlementMutationDeps) {
  return (
    settlementId: string,
    input: {
      gross_revenue: number;
      cash_collected: number;
      included_expenses: number;
      recoveries: number;
      manual_adjustments?: number;
      manual_adjustment_note?: string | null;
    },
  ): { settlement: SettlementV1 | null; errors: string[] } => {
    const existing = deps.settlements.find((s) => s.id === settlementId);
    if (!existing)
      return { settlement: null, errors: ["Settlement not found."] };
    if (isSettlementLocked(existing)) {
      return {
        settlement: null,
        errors: ["Settlement is locked. Reopen it before recalculating."],
      };
    }
    const agreement = deps.agreements.find(
      (a) => a.id === existing.agreement_id,
    );
    if (!agreement)
      return { settlement: null, errors: ["Agreement not found."] };
    const breakdown = calculateSettlementBreakdown({
      investorId: existing.investor_id,
      vehicleId: existing.vehicle_id,
      pairingId: existing.pairing_id,
      agreement,
      periodStart: existing.period_start,
      periodEnd: existing.period_end,
      grossRevenue: input.gross_revenue,
      cashCollected: input.cash_collected,
      includedExpenses: input.included_expenses,
      recoveries: input.recoveries,
      manualAdjustments: input.manual_adjustments ?? 0,
      manualAdjustmentNote: input.manual_adjustment_note ?? null,
    });
    const updated: SettlementV1 = {
      ...existing,
      gross_revenue: input.gross_revenue,
      cash_collected: input.cash_collected,
      included_expenses: input.included_expenses,
      recoveries_adjustments: input.recoveries,
      manual_adjustments: input.manual_adjustments ?? 0,
      manual_adjustment_note: input.manual_adjustment_note ?? null,
      net_vehicle_contribution: breakdown.net_vehicle_contribution,
      final_partner_payout: breakdown.final_partner_payout,
      company_retained: breakdown.company_retained,
      status: "calculated" as SettlementStatus,
    };
    deps.logTimeline({
      investor_id: existing.investor_id,
      event_type: "settlement_recalculated",
      detail: existing.settlement_number,
      vehicle_id: existing.vehicle_id,
      settlement_id: settlementId,
    });
    return { settlement: updated, errors: [] };
  };
}

export function buildApprove(deps: SettlementMutationDeps) {
  return (
    settlementId: string,
    reviewCtx: SettlementReviewContext,
  ): { settlement: SettlementV1 | null; errors: string[] } => {
    const existing = deps.settlements.find((s) => s.id === settlementId);
    if (!existing)
      return { settlement: null, errors: ["Settlement not found."] };
    const warnings = evaluateSettlementReview(reviewCtx);
    const hasBlocker = warnings.some((w) => w.severity === "blocker");
    if (hasBlocker) {
      return {
        settlement: null,
        errors: warnings
          .filter((w) => w.severity === "blocker")
          .map((w) => w.reason),
      };
    }
    const approved: SettlementV1 = {
      ...existing,
      status: "approved" as SettlementStatus,
      approved_at: new Date().toISOString(),
      approved_by: deps.staffId,
      locked: true,
    };
    deps.logTimeline({
      investor_id: existing.investor_id,
      event_type: "settlement_approved",
      detail: existing.settlement_number,
      vehicle_id: existing.vehicle_id,
      settlement_id: settlementId,
    });
    return { settlement: approved, errors: [] };
  };
}

export function buildRecordPayout(deps: SettlementMutationDeps) {
  return (
    settlementId: string,
    input: {
      paid_date: string;
      payment_method: PartnerPaymentPreference;
      payment_reference?: string | null;
    },
  ): { settlement: SettlementV1 | null; errors: string[] } => {
    const existing = deps.settlements.find((s) => s.id === settlementId);
    if (!existing)
      return { settlement: null, errors: ["Settlement not found."] };
    if (hasExistingPayout(existing)) {
      return {
        settlement: null,
        errors: ["This settlement already has a recorded payout."],
      };
    }
    if (existing.status !== "approved") {
      return {
        settlement: null,
        errors: ["Settlement must be approved before recording a payout."],
      };
    }
    const paid: SettlementV1 = {
      ...existing,
      status: "paid" as SettlementStatus,
      paid_date: input.paid_date,
      payment_method: input.payment_method,
      payment_reference: input.payment_reference ?? null,
    };
    deps.logTimeline({
      investor_id: existing.investor_id,
      event_type: "payout_recorded",
      detail: `${existing.settlement_number} — ${input.payment_method}`,
      vehicle_id: existing.vehicle_id,
      settlement_id: settlementId,
    });
    return { settlement: paid, errors: [] };
  };
}

export function buildReopen(deps: SettlementMutationDeps) {
  return (
    settlementId: string,
    reason: string,
  ): { settlement: SettlementV1 | null; errors: string[] } => {
    const existing = deps.settlements.find((s) => s.id === settlementId);
    if (!existing)
      return { settlement: null, errors: ["Settlement not found."] };
    if (!reason.trim()) {
      return { settlement: null, errors: ["A reopen reason is required."] };
    }
    const reopened: SettlementV1 = {
      ...existing,
      status: "needs_review" as SettlementStatus,
      locked: false,
      reopened_reason: reason,
      reopened_at: new Date().toISOString(),
      reopened_by: deps.staffId,
    };
    deps.logTimeline({
      investor_id: existing.investor_id,
      event_type: "settlement_reopened",
      detail: `${existing.settlement_number} — ${reason}`,
      vehicle_id: existing.vehicle_id,
      settlement_id: settlementId,
    });
    return { settlement: reopened, errors: [] };
  };
}

export function buildVoid(deps: SettlementMutationDeps) {
  return (
    settlementId: string,
    reason: string,
  ): { settlement: SettlementV1 | null; errors: string[] } => {
    const existing = deps.settlements.find((s) => s.id === settlementId);
    if (!existing)
      return { settlement: null, errors: ["Settlement not found."] };
    if (!reason.trim()) {
      return { settlement: null, errors: ["A void reason is required."] };
    }
    const voided: SettlementV1 = {
      ...existing,
      status: "voided" as SettlementStatus,
      voided_reason: reason,
      voided_at: new Date().toISOString(),
      locked: true,
    };
    deps.logTimeline({
      investor_id: existing.investor_id,
      event_type: "settlement_voided",
      detail: `${existing.settlement_number} — ${reason}`,
      vehicle_id: existing.vehicle_id,
      settlement_id: settlementId,
    });
    return { settlement: voided, errors: [] };
  };
}

/** Statement numbering — tenant + year scoped, immutable once issued. */
export function makeNextSettlementNumber(
  seqMap: Map<string, number>,
  setSeqMap: (fn: (prev: Map<string, number>) => Map<string, number>) => void,
): () => string {
  return () => {
    const year = new Date().getFullYear();
    const key = `${TENANT_ID}-${year}`;
    const next = (seqMap.get(key) ?? 0) + 1;
    setSeqMap((prev) => new Map(prev).set(key, next));
    return `SET-${year}-${padSeq(next)}`;
  };
}
