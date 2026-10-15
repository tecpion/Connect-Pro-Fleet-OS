// Connect Pro Fleet — Investor & Partner Management V1 workspace selectors.
//
// Pure functions deriving workspace data from authoritative records:
//   - Investors / InvestorVehicle pairings (Build #6)
//   - Partnership agreements + expense rules (V1)
//   - Settlements (V1 lifecycle)
//   - Vehicle Performance / profitability selectors (for projected payouts)
//
// No duplicate financial logic. Projected payouts reuse the existing
// projectedPartnerCompensation selector. Settlement calculations reuse the
// existing settlement engine rules. Partner payouts are NEVER operating
// expenses.

import type { Investor, InvestorVehicle, Settlement } from "./investorTypes";
import type { Vehicle } from "./types";
import type { FinancialTransaction } from "./chargeTypes";
import type { PartnershipExpenseRule } from "./partnershipTypes";
import type { CompensationArrangement } from "./ownershipTypes";
import type { VehicleExpenseBreakdown } from "./profitabilityTypes";
import { round2, type DateRange } from "./profitabilityHelpers";
import { projectedPartnerCompensation } from "./profitabilityInvestor";
import { pairingForVehicle } from "./profitabilityInvestor";
import type {
  AgreementListRow,
  AgreementStatus,
  CompensationBasisLabel,
  InvestorOverviewKpis,
  PartnerListRow,
  PartnerProfileMeta,
  PartnerTimelineEvent,
  PartnerTimelineEventType,
  SettlementFrequency,
  SettlementListRow,
  SettlementReviewWarning,
  SettlementStatus,
  SettlementV1,
  PartnershipAgreement,
  AgreementExpenseRule,
} from "./investorWorkspaceTypes";
import { PARTNER_TIMELINE_EVENT_LABELS } from "./investorWorkspaceTypes";

// ---------------------------------------------------------------------------
// Partner profile meta helpers
// ---------------------------------------------------------------------------

/** Resolve partner profile meta, defaulting safely for legacy investors. */
export function resolvePartnerMeta(
  investor: Investor,
  metaMap: Map<string, PartnerProfileMeta>,
): PartnerProfileMeta {
  const existing = metaMap.get(investor.id);
  if (existing) return existing;
  // Legacy investor — derive defaults from the existing fields.
  return {
    investor_id: investor.id,
    tenant_id: investor.tenant_id,
    entity_type: investor.full_name.match(/LLC|Inc|Corp|LLP|Ltd/i)
      ? "business"
      : "individual",
    contact_name: null,
    relationship_class:
      investor.relationship === "family" ? "family" : "external",
    status: investor.status === "active" ? "active" : "ended",
    payment_preference: null,
  };
}

// ---------------------------------------------------------------------------
// Agreement helpers
// ---------------------------------------------------------------------------

/** The active (non-superseded, non-ended) agreement for a pairing. */
export function activeAgreementForPairing(
  pairingId: string,
  agreements: PartnershipAgreement[],
): PartnershipAgreement | null {
  return (
    agreements.find(
      (a) => a.pairing_id === pairingId && a.status === "active",
    ) ?? null
  );
}

/** All agreement versions for a pairing, newest version first. */
export function agreementHistoryForPairing(
  pairingId: string,
  agreements: PartnershipAgreement[],
): PartnershipAgreement[] {
  return agreements
    .filter((a) => a.pairing_id === pairingId)
    .sort((a, b) => b.version - a.version);
}

/**
 * Resolve the agreement version effective on a given date. Settlements must
 * use the version effective during the settlement period — never a later one.
 */
export function agreementEffectiveOn(
  pairingId: string,
  date: string,
  agreements: PartnershipAgreement[],
): PartnershipAgreement | null {
  const matching = agreements
    .filter((a) => a.pairing_id === pairingId)
    .filter((a) => {
      if (a.effective_start > date) return false;
      if (a.effective_end && a.effective_end < date) return false;
      return true;
    })
    .sort((a, b) => b.version - a.version);
  return matching[0] ?? null;
}

/** Validate share totals equal 100%. */
export function validateShareTotal(
  companyPct: number,
  partnerPct: number,
): string | null {
  const total = companyPct + partnerPct;
  if (total !== 100)
    return `Company and partner shares must total 100% (currently ${total}%).`;
  if (companyPct < 0 || companyPct > 100)
    return "Company share must be between 0 and 100.";
  if (partnerPct < 0 || partnerPct > 100)
    return "Partner share must be between 0 and 100.";
  return null;
}

/**
 * Detect overlapping active ownership agreements for the same vehicle.
 * V1 supports one active agreement per vehicle — overlap is a conflict.
 */
export function detectAgreementOverlap(
  vehicleId: string,
  agreements: PartnershipAgreement[],
  excludeAgreementId?: string,
): PartnershipAgreement | null {
  return (
    agreements.find(
      (a) =>
        a.vehicle_id === vehicleId &&
        a.status === "active" &&
        a.id !== excludeAgreementId,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Projected payout (reuses existing profitabilityInvestor selector)
// ---------------------------------------------------------------------------

export interface ProjectedPayoutInputs {
  transactions: FinancialTransaction[];
  expenses: VehicleExpenseBreakdown;
  range: DateRange;
  rentedDays: number;
  expenseRules: PartnershipExpenseRule[] | null;
}

/** Projected partner payout for a vehicle over a range. Reuses the existing
 *  projectedPartnerCompensation — never duplicates the calculation. */
export function projectedPayoutForVehicle(
  vehicleId: string,
  investorVehicles: InvestorVehicle[],
  inputs: ProjectedPayoutInputs,
): {
  compensation: number | null;
  type: CompensationArrangement["type"] | null;
} {
  const pairing = pairingForVehicle(vehicleId, investorVehicles);
  return projectedPartnerCompensation(
    pairing,
    inputs.expenses.total_direct_expenses > 0
      ? inputs.expenses.total_direct_expenses // gross revenue passed separately
      : 0,
    inputs.expenses,
    inputs.range,
    inputs.rentedDays,
    inputs.expenseRules,
  );
}

// ---------------------------------------------------------------------------
// Settlement calculation (reuses existing engine rules)
// ---------------------------------------------------------------------------

export interface SettlementCalcInputs {
  investorId: string;
  vehicleId: string;
  pairingId: string;
  agreement: PartnershipAgreement;
  periodStart: string;
  periodEnd: string;
  grossRevenue: number;
  cashCollected: number;
  includedExpenses: number;
  recoveries: number;
  manualAdjustments: number;
  manualAdjustmentNote: string | null;
}

/** Compute the transparent settlement breakdown from authoritative values.
 *  Does NOT create expenses — the caller passes authoritative totals. */
export function calculateSettlementBreakdown(inputs: SettlementCalcInputs): {
  net_vehicle_contribution: number;
  final_partner_payout: number;
  company_retained: number;
} {
  const net = round2(
    inputs.grossRevenue - inputs.includedExpenses + inputs.recoveries,
  );
  const partnerPayout = round2(
    net * (inputs.agreement.partner_share_pct / 100) + inputs.manualAdjustments,
  );
  const companyRetained = round2(net - partnerPayout);
  return {
    net_vehicle_contribution: net,
    final_partner_payout: partnerPayout,
    company_retained: companyRetained,
  };
}

// ---------------------------------------------------------------------------
// Settlement review warnings
// ---------------------------------------------------------------------------

export interface SettlementReviewContext {
  unallocatedExpenses: number;
  expensesAwaitingReview: number;
  unresolvedDamageRecovery: boolean;
  agreementAmbiguity: boolean;
  missingAgreementVersion: boolean;
  invalidShareTotal: boolean;
  overlappingAgreement: boolean;
  missingSettlementInputs: boolean;
}

/** Evaluate review warnings before approval. Differentiates warnings from
 *  blockers — not every missing receipt blocks payout. */
export function evaluateSettlementReview(
  ctx: SettlementReviewContext,
): SettlementReviewWarning[] {
  const warnings: SettlementReviewWarning[] = [];

  if (ctx.invalidShareTotal) {
    warnings.push({
      severity: "blocker",
      reason: "Invalid share total",
      detail: "Company and partner shares do not total 100%.",
    });
  }
  if (ctx.missingAgreementVersion) {
    warnings.push({
      severity: "blocker",
      reason: "Missing agreement version",
      detail: "No agreement version effective during this settlement period.",
    });
  }
  if (ctx.overlappingAgreement) {
    warnings.push({
      severity: "blocker",
      reason: "Overlapping agreement",
      detail: "Vehicle has overlapping active ownership agreements.",
    });
  }
  if (ctx.missingSettlementInputs) {
    warnings.push({
      severity: "blocker",
      reason: "Missing required settlement inputs",
      detail: "Gross revenue or expense data is unavailable for this period.",
    });
  }
  if (ctx.agreementAmbiguity) {
    warnings.push({
      severity: "warning",
      reason: "Agreement ambiguity",
      detail: "Agreement terms may need clarification before finalizing.",
    });
  }
  if (ctx.unallocatedExpenses > 0) {
    warnings.push({
      severity: "warning",
      reason: "Unallocated expenses",
      detail: `${ctx.unallocatedExpenses} unallocated expense(s) may affect accuracy.`,
    });
  }
  if (ctx.expensesAwaitingReview > 0) {
    warnings.push({
      severity: "warning",
      reason: "Expenses awaiting review",
      detail: `${ctx.expensesAwaitingReview} expense(s) are awaiting review.`,
    });
  }
  if (ctx.unresolvedDamageRecovery) {
    warnings.push({
      severity: "warning",
      reason: "Pending damage recovery",
      detail: "A damage recovery is pending for this vehicle.",
    });
  }

  return warnings;
}

/** Whether a settlement has any blocking warnings. */
export function hasSettlementBlocker(
  warnings: SettlementReviewWarning[],
): boolean {
  return warnings.some((w) => w.severity === "blocker");
}

// ---------------------------------------------------------------------------
// Duplicate payout safety
// ---------------------------------------------------------------------------

/** Check whether a settlement already has a paid distribution. */
export function hasExistingPayout(settlement: SettlementV1): boolean {
  return settlement.status === "paid" || settlement.paid_date != null;
}

// ---------------------------------------------------------------------------
// Settlement locking
// ---------------------------------------------------------------------------

/** Once approved, a settlement is locked — later expense edits must not
 *  silently change it. Reopen requires explicit action. */
export function isSettlementLocked(settlement: SettlementV1): boolean {
  return (
    settlement.locked ||
    settlement.status === "approved" ||
    settlement.status === "paid"
  );
}

// ---------------------------------------------------------------------------
// Partial-period handling
// ---------------------------------------------------------------------------

/** Days the agreement is active within the settlement period. Pre-agreement
 *  revenue/expenses are NOT allocated to the partner. */
export function agreementActiveDaysInPeriod(
  agreement: PartnershipAgreement,
  periodStart: string,
  periodEnd: string,
): number {
  const DAY = 86_400_000;
  const eff = new Date(agreement.effective_start + "T00:00:00");
  const start = new Date(periodStart + "T00:00:00");
  const end = new Date(periodEnd + "T00:00:00");
  const activeStart = eff > start ? eff : start;
  const endRaw = agreement.effective_end
    ? new Date(agreement.effective_end + "T00:00:00")
    : null;
  const activeEnd = endRaw && endRaw < end ? endRaw : end;
  if (activeEnd < activeStart) return 0;
  return Math.floor((activeEnd.getTime() - activeStart.getTime()) / DAY) + 1;
}

// ---------------------------------------------------------------------------
// Overview KPIs
// ---------------------------------------------------------------------------

export function getInvestorOverviewKpis(params: {
  investors: Investor[];
  partnerMeta: Map<string, PartnerProfileMeta>;
  agreements: PartnershipAgreement[];
  settlements: SettlementV1[];
  projectedPayouts: number[]; // per active pairing (null excluded)
  periodStart: string;
  periodEnd: string;
}): InvestorOverviewKpis {
  const { investors, partnerMeta, agreements, settlements, projectedPayouts } =
    params;

  const activePartners = investors.filter((inv) => {
    const meta = resolvePartnerMeta(inv, partnerMeta);
    return meta.status === "active";
  }).length;

  const activeAgreements = agreements.filter(
    (a) => a.status === "active",
  ).length;

  const projectedPayout =
    projectedPayouts.length > 0
      ? round2(projectedPayouts.reduce((s, x) => s + x, 0))
      : null;

  const pendingSettlements = settlements.filter(
    (s) =>
      s.status === "draft" ||
      s.status === "calculated" ||
      s.status === "needs_review",
  ).length;

  const paidThisPeriod = settlements
    .filter(
      (s) =>
        s.status === "paid" &&
        s.paid_date &&
        s.paid_date >= params.periodStart &&
        s.paid_date <= params.periodEnd,
    )
    .reduce((sum, s) => sum + s.final_partner_payout, 0);

  const settlementsNeedingReview = settlements.filter(
    (s) => s.status === "needs_review",
  ).length;

  return {
    active_partners: activePartners,
    active_agreements: activeAgreements,
    projected_partner_payout: projectedPayout,
    pending_settlements: pendingSettlements,
    paid_this_period: round2(paidThisPeriod),
    settlements_needing_review: settlementsNeedingReview,
  };
}

// ---------------------------------------------------------------------------
// Partner list rows
// ---------------------------------------------------------------------------

export function getPartnerListRows(params: {
  investors: Investor[];
  partnerMeta: Map<string, PartnerProfileMeta>;
  investorVehicles: InvestorVehicle[];
  agreements: PartnershipAgreement[];
  settlements: SettlementV1[];
  projectedPayouts: Map<string, number | null>; // investor_id -> projected
}): PartnerListRow[] {
  const {
    investors,
    partnerMeta,
    investorVehicles,
    agreements,
    settlements,
    projectedPayouts,
  } = params;

  return investors.map((inv) => {
    const meta = resolvePartnerMeta(inv, partnerMeta);
    const pairings = investorVehicles.filter(
      (iv) => iv.investor_id === inv.id && iv.active,
    );
    const activeAgreements = agreements.filter(
      (a) => a.investor_id === inv.id && a.status === "active",
    );
    const invSettlements = settlements.filter((s) => s.investor_id === inv.id);
    const lifetimePaid = invSettlements
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + s.final_partner_payout, 0);
    const pendingSettlements = invSettlements.filter(
      (s) =>
        s.status === "draft" ||
        s.status === "calculated" ||
        s.status === "needs_review",
    ).length;

    return {
      investor_id: inv.id,
      name: inv.full_name,
      entity_type: meta.entity_type,
      relationship_class: meta.relationship_class,
      status: meta.status,
      active_vehicles: pairings.length,
      active_agreements: activeAgreements.length,
      projected_payout: projectedPayouts.get(inv.id) ?? null,
      pending_settlements: pendingSettlements,
      lifetime_paid: round2(lifetimePaid),
    };
  });
}

// ---------------------------------------------------------------------------
// Agreement list rows
// ---------------------------------------------------------------------------

export function getAgreementListRows(params: {
  agreements: PartnershipAgreement[];
  investors: Investor[];
  vehicles: Vehicle[];
}): AgreementListRow[] {
  const { agreements, investors, vehicles } = params;
  return agreements
    .filter((a) => a.status === "active")
    .map((a) => {
      const inv = investors.find((i) => i.id === a.investor_id);
      const veh = vehicles.find((v) => v.id === a.vehicle_id);
      return {
        agreement_id: a.id,
        investor_id: a.investor_id,
        investor_name: inv?.full_name ?? "—",
        vehicle_id: a.vehicle_id,
        vehicle_label: veh ? `${veh.year} ${veh.make} ${veh.model}` : "—",
        ownership_type: a.ownership_type,
        company_share_pct: a.company_share_pct,
        partner_share_pct: a.partner_share_pct,
        basis: a.basis,
        settlement_frequency: a.settlement_frequency,
        effective_start: a.effective_start,
        effective_end: a.effective_end,
        status: a.status,
        version: a.version,
      };
    });
}

// ---------------------------------------------------------------------------
// Settlement list rows
// ---------------------------------------------------------------------------

export function getSettlementListRows(params: {
  settlements: SettlementV1[];
  investors: Investor[];
  vehicles: Vehicle[];
}): SettlementListRow[] {
  const { settlements, investors, vehicles } = params;
  return settlements
    .filter((s) => s.status !== "voided")
    .sort((a, b) => (a.period_start < b.period_start ? 1 : -1))
    .map((s) => {
      const inv = investors.find((i) => i.id === s.investor_id);
      const veh = vehicles.find((v) => v.id === s.vehicle_id);
      return {
        settlement_id: s.id,
        settlement_number: s.settlement_number,
        investor_id: s.investor_id,
        investor_name: inv?.full_name ?? "—",
        vehicle_id: s.vehicle_id,
        vehicle_label: veh ? `${veh.year} ${veh.make} ${veh.model}` : "—",
        period_start: s.period_start,
        period_end: s.period_end,
        net_vehicle_contribution: s.net_vehicle_contribution,
        final_partner_payout: s.final_partner_payout,
        status: s.status,
        paid_date: s.paid_date,
      };
    });
}

// ---------------------------------------------------------------------------
// Vehicle ownership / partnership history
// ---------------------------------------------------------------------------

export interface OwnershipHistoryEntry {
  agreement_id: string;
  investor_id: string;
  investor_name: string;
  ownership_type: PartnershipAgreement["ownership_type"];
  company_share_pct: number;
  partner_share_pct: number;
  effective_start: string;
  effective_end: string | null;
  status: AgreementStatus;
  version: number;
}

/** Ownership/partnership history for a vehicle (all agreement versions). */
export function vehicleOwnershipHistory(
  vehicleId: string,
  agreements: PartnershipAgreement[],
  investors: Investor[],
): OwnershipHistoryEntry[] {
  return agreements
    .filter((a) => a.vehicle_id === vehicleId)
    .sort((a, b) => (a.effective_start < b.effective_start ? -1 : 1))
    .map((a) => {
      const inv = investors.find((i) => i.id === a.investor_id);
      return {
        agreement_id: a.id,
        investor_id: a.investor_id,
        investor_name: inv?.full_name ?? "—",
        ownership_type: a.ownership_type,
        company_share_pct: a.company_share_pct,
        partner_share_pct: a.partner_share_pct,
        effective_start: a.effective_start,
        effective_end: a.effective_end,
        status: a.status,
        version: a.version,
      };
    });
}

// ---------------------------------------------------------------------------
// Timeline event builder
// ---------------------------------------------------------------------------

export function makeTimelineEvent(params: {
  tenant_id: string;
  investor_id: string;
  event_type: PartnerTimelineEventType;
  detail?: string | null;
  vehicle_id?: string | null;
  settlement_id?: string | null;
  agreement_id?: string | null;
  staff_id?: string | null;
  at?: string;
}): PartnerTimelineEvent {
  return {
    id: `ptl_${Math.random().toString(36).slice(2, 10)}`,
    tenant_id: params.tenant_id,
    investor_id: params.investor_id,
    event_type: params.event_type,
    label: PARTNER_TIMELINE_EVENT_LABELS[params.event_type],
    detail: params.detail ?? null,
    vehicle_id: params.vehicle_id ?? null,
    settlement_id: params.settlement_id ?? null,
    agreement_id: params.agreement_id ?? null,
    at: params.at ?? new Date().toISOString(),
    staff_id: params.staff_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Legacy settlement compatibility
// ---------------------------------------------------------------------------

/** Map a legacy Settlement (pending/paid) to a V1 status. */
export function legacySettlementStatus(s: Settlement): SettlementStatus {
  if (s.payout_status === "paid") return "paid";
  return "calculated";
}

// ---------------------------------------------------------------------------
// No-data vs zero
// ---------------------------------------------------------------------------

/** Distinguish "no data" (null) from "$0" (authoritative zero). */
export function formatPayoutOrNoData(
  amount: number | null,
  formatter: (n: number) => string,
): string {
  if (amount == null) return "No data";
  return formatter(amount);
}

// ---------------------------------------------------------------------------
// Settlement frequency from compensation (for agreement creation)
// ---------------------------------------------------------------------------

export function settlementFrequencyFromComp(
  comp: CompensationArrangement,
): SettlementFrequency {
  if (comp.type === "fixed") {
    if (comp.fixed_frequency === "weekly") return "weekly";
    if (comp.fixed_frequency === "biweekly") return "biweekly";
    if (comp.fixed_frequency === "monthly") return "monthly";
    return "manual";
  }
  return "monthly"; // default for percentage/custom
}

/** Derive the V1 basis label from a compensation arrangement. */
export function basisFromComp(
  comp: CompensationArrangement,
): CompensationBasisLabel {
  if (comp.type === "percentage") {
    return comp.basis === "gross"
      ? "gross_revenue"
      : "net_vehicle_contribution";
  }
  return "custom";
}

/** Convert legacy PartnershipExpenseRule[] to AgreementExpenseRule[]. */
export function toAgreementExpenseRules(
  rules: PartnershipExpenseRule[],
): AgreementExpenseRule[] {
  return rules.map((r) => ({
    category: r.category,
    treatment: r.treatment,
    notes: r.notes,
  }));
}
