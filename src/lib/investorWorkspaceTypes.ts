// Connect Pro Fleet — Investor & Partner Management V1 workspace types.
//
// Extends the existing Build #6/#7 investor domain with the V1 workspace model:
//   - Partner types (Individual / Business) + relationship classifications
//   - Partner status (Pending / Active / Paused / Ended)
//   - Authoritative Partnership Agreement with versioning
//   - Settlement lifecycle (Draft → Calculated → Needs Review → Approved → Paid)
//   - Settlement statement numbering + storage references
//   - Partner timeline / audit events
//
// These types COMPOSE onto the existing Investor / InvestorVehicle /
// CompensationArrangement / Partnership entities. They do NOT duplicate the
// Expense Ledger, Payment Ledger, Vehicle Performance, or Profitability
// engines. Partner payouts are distributions, never operating expenses.

import type { CompensationArrangement } from "./ownershipTypes";
import type { VehicleOwnershipType } from "./ownershipTypes";
import type {
  ContributionType,
  ExpenseCategory,
  ExpenseTreatment,
} from "./partnershipTypes";

// ---------------------------------------------------------------------------
// Partner types & status
// ---------------------------------------------------------------------------

export type PartnerEntityType = "individual" | "business";

export const PARTNER_ENTITY_TYPE_LABELS: Record<PartnerEntityType, string> = {
  individual: "Individual",
  business: "Business",
};

// Descriptive relationship classification — NOT ownership logic.
export type PartnerRelationshipClass =
  "family" | "external" | "internal" | "other";

export const PARTNER_RELATIONSHIP_LABELS: Record<
  PartnerRelationshipClass,
  string
> = {
  family: "Family",
  external: "External",
  internal: "Internal / Related Party",
  other: "Other",
};

export type PartnerStatus = "pending" | "active" | "paused" | "ended";

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
};

export const PARTNER_STATUS_TONES: Record<
  PartnerStatus,
  "available" | "maintenance" | "out" | "neutral"
> = {
  pending: "maintenance",
  active: "available",
  paused: "neutral",
  ended: "out",
};

// Extended partner profile metadata (composes onto the existing Investor).
export interface PartnerProfileMeta {
  investor_id: string;
  tenant_id: string;
  entity_type: PartnerEntityType;
  contact_name: string | null; // for businesses
  relationship_class: PartnerRelationshipClass;
  status: PartnerStatus;
  payment_preference: PartnerPaymentPreference | null;
}

export type PartnerPaymentPreference =
  "cash" | "check" | "ach" | "zelle" | "other";

export const PARTNER_PAYMENT_PREFERENCE_LABELS: Record<
  PartnerPaymentPreference,
  string
> = {
  cash: "Cash",
  check: "Check",
  ach: "ACH / Bank Transfer",
  zelle: "Zelle",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Authoritative Partnership Agreement (versioned)
// ---------------------------------------------------------------------------

export type CompensationBasisLabel =
  "gross_revenue" | "net_vehicle_contribution" | "custom";

export const COMPENSATION_BASIS_LABELS_V1: Record<
  CompensationBasisLabel,
  string
> = {
  gross_revenue: "Gross Revenue",
  net_vehicle_contribution: "Net Vehicle Contribution",
  custom: "Custom",
};

export type SettlementFrequency = "weekly" | "biweekly" | "monthly" | "manual";

export const SETTLEMENT_FREQUENCY_LABELS: Record<SettlementFrequency, string> =
  {
    weekly: "Weekly",
    biweekly: "Biweekly",
    monthly: "Monthly",
    manual: "Manual / Custom",
  };

/**
 * The authoritative partnership agreement record. Versioned — a term change
 * creates a NEW version with a new effective date; the old version becomes
 * historical. Settlements reference the version effective during their period.
 */
export interface PartnershipAgreement {
  id: string;
  tenant_id: string;
  investor_id: string;
  vehicle_id: string;
  pairing_id: string; // -> InvestorVehicle.id
  version: number; // 1-based; increments on term change
  // Ownership
  ownership_type: VehicleOwnershipType;
  // Compensation
  compensation: CompensationArrangement;
  basis: CompensationBasisLabel;
  company_share_pct: number; // 0..100
  partner_share_pct: number; // 0..100
  // Expense responsibility (references categories; does NOT create expenses)
  expense_rules: AgreementExpenseRule[];
  // Settlement
  settlement_frequency: SettlementFrequency;
  payment_preference: PartnerPaymentPreference | null;
  // Lifecycle
  effective_start: string; // ISO date
  effective_end: string | null; // null = ongoing
  status: AgreementStatus;
  notes: string | null;
  // Audit
  created_at: string;
  created_by: string | null;
  superseded_by: string | null; // -> newer agreement version id
}

export type AgreementStatus = "active" | "superseded" | "ended";

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  active: "Active",
  superseded: "Superseded",
  ended: "Ended",
};

export interface AgreementExpenseRule {
  category: ExpenseCategory;
  treatment: ExpenseTreatment;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Settlement lifecycle (V1)
// ---------------------------------------------------------------------------

export type SettlementStatus =
  "draft" | "calculated" | "needs_review" | "approved" | "paid" | "voided";

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  draft: "Draft",
  calculated: "Calculated",
  needs_review: "Needs Review",
  approved: "Approved",
  paid: "Paid",
  voided: "Voided",
};

export const SETTLEMENT_STATUS_TONES: Record<
  SettlementStatus,
  "available" | "maintenance" | "out" | "neutral" | "rented"
> = {
  draft: "neutral",
  calculated: "neutral",
  needs_review: "maintenance",
  approved: "rented",
  paid: "available",
  voided: "out",
};

/**
 * A V1 settlement record. Extends the legacy Settlement with the full
 * lifecycle, agreement version reference, transparent breakdown, and
 * locking. The legacy Settlement (investorTypes.ts) remains for backward
 * compatibility; V1 settlements carry the richer model.
 */
export interface SettlementV1 {
  id: string;
  tenant_id: string;
  settlement_number: string; // SET-YYYY-000001
  investor_id: string;
  vehicle_id: string;
  pairing_id: string;
  agreement_id: string; // -> PartnershipAgreement.id (version used)
  agreement_version: number;
  // Period
  period_start: string;
  period_end: string;
  // Economic breakdown (authoritative values)
  gross_revenue: number;
  cash_collected: number;
  included_expenses: number;
  recoveries_adjustments: number;
  net_vehicle_contribution: number;
  company_share_pct: number;
  partner_share_pct: number;
  manual_adjustments: number;
  manual_adjustment_note: string | null;
  final_partner_payout: number;
  company_retained: number;
  // Lifecycle
  status: SettlementStatus;
  // Payment (when paid)
  paid_date: string | null;
  payment_method: PartnerPaymentPreference | null;
  payment_reference: string | null;
  // Locking — when approved, snapshot the inputs so later edits don't
  // silently change an approved settlement.
  approved_at: string | null;
  approved_by: string | null;
  locked: boolean;
  // Reopen audit
  reopened_reason: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  // Void
  voided_reason: string | null;
  voided_at: string | null;
  // Statement reference (document relationship — one file, not duplicated)
  statement_doc_id: string | null;
  created_at: string;
  created_by: string | null;
}

// ---------------------------------------------------------------------------
// Settlement review warnings
// ---------------------------------------------------------------------------

export type ReviewWarningSeverity = "warning" | "blocker";

export interface SettlementReviewWarning {
  severity: ReviewWarningSeverity;
  reason: string;
  detail: string | null;
}

// ---------------------------------------------------------------------------
// Statement numbering
// ---------------------------------------------------------------------------

export interface StatementNumberState {
  tenant_id: string;
  year: number;
  next_seq: number;
}

// ---------------------------------------------------------------------------
// Partner timeline / audit
// ---------------------------------------------------------------------------

export type PartnerTimelineEventType =
  | "partner_created"
  | "contribution_recorded"
  | "contribution_edited"
  | "vehicle_assigned"
  | "agreement_started"
  | "agreement_terms_changed"
  | "agreement_ended"
  | "settlement_generated"
  | "settlement_recalculated"
  | "settlement_approved"
  | "settlement_reopened"
  | "settlement_voided"
  | "payout_recorded"
  | "vehicle_removed"
  | "relationship_ended"
  | "status_changed";

export const PARTNER_TIMELINE_EVENT_LABELS: Record<
  PartnerTimelineEventType,
  string
> = {
  partner_created: "Partner created",
  contribution_recorded: "Contribution recorded",
  contribution_edited: "Contribution edited",
  vehicle_assigned: "Vehicle assigned",
  agreement_started: "Agreement started",
  agreement_terms_changed: "Agreement terms changed",
  agreement_ended: "Agreement ended",
  settlement_generated: "Settlement generated",
  settlement_recalculated: "Settlement recalculated",
  settlement_approved: "Settlement approved",
  settlement_reopened: "Settlement reopened",
  settlement_voided: "Settlement voided",
  payout_recorded: "Payout recorded",
  vehicle_removed: "Vehicle removed",
  relationship_ended: "Relationship ended",
  status_changed: "Status changed",
};

export interface PartnerTimelineEvent {
  id: string;
  tenant_id: string;
  investor_id: string;
  event_type: PartnerTimelineEventType;
  label: string;
  detail: string | null;
  vehicle_id: string | null;
  settlement_id: string | null;
  agreement_id: string | null;
  at: string;
  staff_id: string | null;
}

// ---------------------------------------------------------------------------
// Contribution (V1 extended — adds down payment / repair capital / other)
// ---------------------------------------------------------------------------

export type ContributionTypeV1 =
  "vehicle" | "cash" | "down_payment" | "repair_setup_capital" | "other";

export const CONTRIBUTION_TYPE_V1_LABELS: Record<ContributionTypeV1, string> = {
  vehicle: "Vehicle Contributed",
  cash: "Cash Contributed",
  down_payment: "Down Payment Contributed",
  repair_setup_capital: "Repair / Setup Capital",
  other: "Other Contribution",
};

// ---------------------------------------------------------------------------
// Overview KPIs
// ---------------------------------------------------------------------------

export interface InvestorOverviewKpis {
  active_partners: number;
  active_agreements: number;
  projected_partner_payout: number | null; // null = no data, NOT $0
  pending_settlements: number;
  paid_this_period: number;
  settlements_needing_review: number;
}

// ---------------------------------------------------------------------------
// Partner list row
// ---------------------------------------------------------------------------

export interface PartnerListRow {
  investor_id: string;
  name: string;
  entity_type: PartnerEntityType;
  relationship_class: PartnerRelationshipClass;
  status: PartnerStatus;
  active_vehicles: number;
  active_agreements: number;
  projected_payout: number | null;
  pending_settlements: number;
  lifetime_paid: number;
}

// ---------------------------------------------------------------------------
// Agreement list row
// ---------------------------------------------------------------------------

export interface AgreementListRow {
  agreement_id: string;
  investor_id: string;
  investor_name: string;
  vehicle_id: string;
  vehicle_label: string;
  ownership_type: VehicleOwnershipType;
  company_share_pct: number;
  partner_share_pct: number;
  basis: CompensationBasisLabel;
  settlement_frequency: SettlementFrequency;
  effective_start: string;
  effective_end: string | null;
  status: AgreementStatus;
  version: number;
}

// ---------------------------------------------------------------------------
// Settlement list row
// ---------------------------------------------------------------------------

export interface SettlementListRow {
  settlement_id: string;
  settlement_number: string;
  investor_id: string;
  investor_name: string;
  vehicle_id: string;
  vehicle_label: string;
  period_start: string;
  period_end: string;
  net_vehicle_contribution: number;
  final_partner_payout: number;
  status: SettlementStatus;
  paid_date: string | null;
}

// Re-export the contribution type from partnershipTypes for convenience so
// the workspace has a single import surface for V1 + legacy types.
export type { ContributionType, ExpenseCategory, ExpenseTreatment };
