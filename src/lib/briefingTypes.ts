// Connect Pro Fleet — Daily Briefing domain types (Build #28).
//
// The Daily Briefing is an AGGREGATION + PRIORITIZATION layer — it is NOT a new
// source of truth. Money/overdue truth comes from billingSelectors + the exact-
// time late evaluator; rental lifecycle from the rental store; blocked vehicles
// from vehicleTwinSelectors; idle fleet from getAvailableIdleVehicles; tasks
// from the task store. The briefing DERIVES what deserves attention today from
// those authoritative modules using an explicit `asOf` instant so it is fully
// deterministic + testable (no buried `new Date()`).
//
// Priorities are factual levels (Critical/High/Medium/Informational) — never a
// fabricated AI risk score. Every Critical/High item carries a factual `reason`
// (e.g. "Payment overdue — due yesterday at 2:00 PM").

// ---------------------------------------------------------------------------
// As-of / deterministic time
// ---------------------------------------------------------------------------

export interface BriefingAsOf {
  /** The instant the briefing is evaluated for (deterministic). */
  as_of: string;
  /** Tenant id (scope). */
  tenant_id: string;
  /** Staff id the briefing is generated for (for My Priorities). */
  generated_for_user_id: string;
  /** When the briefing was generated. */
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export type BriefingPriority = "critical" | "high" | "medium" | "informational";

export const BRIEFING_PRIORITY_LABELS: Record<BriefingPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  informational: "Informational",
};

/** Numeric rank for sorting — Critical first. */
export const BRIEFING_PRIORITY_RANK: Record<BriefingPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  informational: 3,
};

export type BriefingCategory =
  | "money"
  | "rental"
  | "fleet"
  | "maintenance"
  | "damage"
  | "compliance"
  | "violation"
  | "task"
  | "idle";

export const BRIEFING_CATEGORY_LABELS: Record<BriefingCategory, string> = {
  money: "Money",
  rental: "Rentals",
  fleet: "Fleet",
  maintenance: "Maintenance",
  damage: "Damage",
  compliance: "Compliance",
  violation: "Violations",
  task: "Tasks",
  idle: "Idle Fleet",
};

// ---------------------------------------------------------------------------
// Briefing item
// ---------------------------------------------------------------------------

export interface BriefingItem {
  /** Stable id = attention_key (source_module:entity:issue). */
  id: string;
  category: BriefingCategory;
  priority: BriefingPriority;
  title: string;
  /** Factual, explainable reason — never an AI judgment. */
  reason: string | null;
  entity_type: string;
  entity_id: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  rental_id?: string | null;
  /** Money amount (permission-gated by the caller; null when not financial). */
  amount?: number | null;
  /** ISO datetime the obligation is due. */
  due_at?: string | null;
  /** ISO datetime the issue occurred. */
  occurred_at?: string | null;
  /** Age in days from asOf (negative = future). */
  age_days?: number | null;
  status?: string | null;
  action_type?: string | null;
  action_label?: string | null;
  /** Deep link to the authoritative entity. */
  deep_link: string | null;
  assigned_staff_id?: string | null;
  source_module: string;
  source_entity: string;
  source_id: string;
  sensitive?: boolean;
}

// ---------------------------------------------------------------------------
// Sources — the authoritative modules the briefing composes from.
// ---------------------------------------------------------------------------

import type { FleetStore } from "./store/storeContext";
import type { BillingPeriod } from "./billingTypes";
import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type { OperationalStaffAssignment } from "./staffTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "./paymentArrangementTypes";
import type { DateRange } from "./profitabilityHelpers";

export interface BriefingSources {
  store: FleetStore;
  billingPeriods?: BillingPeriod[];
  damageClaims?: DamageClaim[];
  violations?: Violation[];
  documents?: DocumentRecord[];
  requirements?: ComplianceRequirement[];
  overrides?: ComplianceOverride[];
  assignments?: OperationalStaffAssignment[];
  paymentArrangements?: PaymentArrangement[];
  arrangementInstallments?: PaymentArrangementInstallment[];
  range?: DateRange;
}

// ---------------------------------------------------------------------------
// Viewer permissions (reuse the Build #27 contract)
// ---------------------------------------------------------------------------

export interface BriefingViewerPermissions {
  canViewFinancials: boolean;
  canViewProfitability: boolean;
  canViewSensitiveDocs: boolean;
  canViewBanking: boolean;
}

// ---------------------------------------------------------------------------
// Briefing config (Settings → Daily Briefing)
// ---------------------------------------------------------------------------

export interface BriefingConfig {
  /** Idle-attention threshold in days (default 3). */
  idle_attention_threshold_days: number;
  /** High-attention idle threshold in days (default 7). */
  idle_high_attention_days: number;
  /** Show informational items in the briefing. */
  show_informational: boolean;
  /** Default location filter (null = all locations). */
  default_location_id: string | null;
  /** Default assignment filter ("all" | "mine" | "unassigned"). */
  default_assignment_filter: "all" | "mine" | "unassigned";
}

export const DEFAULT_BRIEFING_CONFIG: BriefingConfig = {
  idle_attention_threshold_days: 3,
  idle_high_attention_days: 7,
  show_informational: true,
  default_location_id: null,
  default_assignment_filter: "all",
};

// ---------------------------------------------------------------------------
// Summary aggregates
// ---------------------------------------------------------------------------

export interface TodaysPaymentSummary {
  due_count: number;
  due_amount: number;
  overdue_count: number;
  overdue_amount: number;
  arrangement_due_count: number;
  arrangement_broken_count: number;
  payments_received_today_count: number;
  payments_received_today_amount: number;
}

export interface OperationalSummary {
  critical_count: number;
  due_today_count: number;
  overdue_accounts_count: number;
  starts_today_count: number;
  returns_today_count: number;
  blocked_vehicles_count: number;
  idle_vehicles_count: number;
  /** Money totals are null when the viewer lacks financial permission. */
  due_today_amount: number | null;
  overdue_amount: number | null;
}

export interface IdleFleetRollup {
  idle_count: number;
  total_idle_days: number;
  idle_past_threshold_count: number;
  longest_idle_vehicle_id: string | null;
  longest_idle_days: number;
  classes_with_idle: string[];
  vehicles_without_future_reservation: number;
}

export interface DailyBriefing {
  as_of: BriefingAsOf;
  config: BriefingConfig;
  sections: BriefingSections;
  counts: Record<BriefingCategory, number>;
  priorities: BriefingItem[];
  operational_summary: OperationalSummary;
}

export interface BriefingSections {
  money: BriefingItem[];
  rentals: BriefingItem[];
  fleet: BriefingItem[];
  idle: BriefingItem[];
  my_priorities: BriefingItem[];
}
