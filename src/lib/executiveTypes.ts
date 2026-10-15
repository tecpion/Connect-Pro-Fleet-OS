// Connect Pro Fleet — Executive Dashboard domain types (Build #30).
//
// The Executive Dashboard is a DERIVED management intelligence layer — it is
// NOT a new financial/accounting source of truth. Collections, outstanding,
// overdue, profitability, utilization, idle, blocked, maintenance, damage,
// violations, compliance, and tasks all come from the existing authoritative
// selectors. This module aggregates and explains them for an owner/manager.
//
// Money Left on the Table is an OPPORTUNITY TRACKER, not fake loss accounting:
// only known quantified recoverable amounts are summed into a dollar total;
// idle fleet is shown as a non-dollar opportunity (no idle×rate multiplication).
//
// The Business Health Score is deterministic, transparent, explainable, and
// configurable — never a mysterious AI score. Component weights total 100%.

import type { DateRange } from "./profitabilityHelpers";
import type { BriefingPriority } from "./briefingTypes";

// ---------------------------------------------------------------------------
// Date range + scope
// ---------------------------------------------------------------------------

export type ExecutiveDatePreset =
  | "today"
  | "this_week"
  | "this_month"
  | "last_30_days"
  | "last_month"
  | "custom";

export interface ExecutiveRange {
  preset: ExecutiveDatePreset;
  start: Date;
  end: Date;
  as_of: Date;
}

// ---------------------------------------------------------------------------
// Dashboard metric
// ---------------------------------------------------------------------------

export type TrendDirection = "up" | "down" | "flat" | "unavailable";

export type MetricStatus =
  "good" | "warning" | "critical" | "neutral" | "unavailable";

export interface DashboardMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  comparison_value?: number | null;
  trend_direction?: TrendDirection;
  trend_percent?: number | null;
  status?: MetricStatus;
  permission_required?: "financial" | "profitability" | null;
  source_module: string;
  deep_link?: string | null;
  explanation?: string | null;
}

// ---------------------------------------------------------------------------
// Financial snapshot
// ---------------------------------------------------------------------------

export interface FinancialSnapshot {
  collections: number | null;
  billed_revenue: number | null;
  outstanding_balance: number | null;
  overdue_balance: number | null;
  overdue_count: number;
  oldest_overdue_age_days: number;
  collection_rate: number | null;
  arrangement_active_count: number;
  arrangement_broken_count: number;
  arrangement_balance: number | null;
  payments_received_today_count: number;
  payments_received_today_amount: number | null;
  prior_collections: number | null;
  collections_trend: TrendDirection;
  collections_trend_percent: number | null;
}

// ---------------------------------------------------------------------------
// Profitability
// ---------------------------------------------------------------------------

export interface ProfitabilitySnapshot {
  operating_revenue: number | null;
  operating_expenses: number | null;
  operating_profit: number | null;
  margin_percent: number | null;
  top_vehicle: { id: string; label: string; profit: number | null } | null;
  bottom_vehicle: { id: string; label: string; profit: number | null } | null;
  prior_profit: number | null;
  profit_trend: TrendDirection;
}

// ---------------------------------------------------------------------------
// Fleet health
// ---------------------------------------------------------------------------

export interface FleetUtilizationSnapshot {
  rented_days: number;
  rentable_days: number;
  blocked_days: number;
  idle_available_days: number;
  utilization_pct: number;
  available_now: number;
  rented_now: number;
  blocked_now: number;
  reserved_now: number;
  prior_utilization_pct: number | null;
  utilization_trend: TrendDirection;
}

export interface IdleByClass {
  class_name: string;
  idle_count: number;
  total_idle_days: number;
}

export interface IdleByLocation {
  location_name: string;
  idle_count: number;
  total_idle_days: number;
}

export interface IdleFleetSnapshot {
  idle_count: number;
  total_idle_days: number;
  idle_past_threshold_count: number;
  longest_idle_vehicle_id: string | null;
  longest_idle_days: number;
  longest_idle_label: string | null;
  classes_with_idle: string[];
  vehicles_without_future_reservation: number;
  by_class: IdleByClass[];
  by_location: IdleByLocation[];
  top_idle: {
    vehicle_id: string;
    label: string;
    idle_days: number;
    daily_rate: number;
    next_reservation_in_days: number | null;
  }[];
}

// ---------------------------------------------------------------------------
// Money Left on the Table
// ---------------------------------------------------------------------------

export type OpportunityCategory =
  | "violation_recovery"
  | "damage_recovery"
  | "late_fees"
  | "deposit_exposure"
  | "extension_opportunity";

export interface QuantifiedOpportunity {
  category: OpportunityCategory;
  label: string;
  amount: number;
  source_module: string;
  entity_type: string;
  entity_id: string;
  deep_link: string | null;
  detail: string | null;
}

export interface IdleOpportunity {
  vehicle_id: string;
  label: string;
  idle_days: number;
  daily_rate: number;
  next_reservation_in_days: number | null;
  location: string | null;
}

export interface MoneyLeftOnTableSummary {
  known_recoverable_total: number | null;
  quantified: QuantifiedOpportunity[];
  idle_opportunity: {
    idle_count: number;
    total_idle_days: number;
    vehicles_without_future_reservation: number;
    items: IdleOpportunity[];
  };
}

// ---------------------------------------------------------------------------
// Business Health Score
// ---------------------------------------------------------------------------

export type HealthGrade = "excellent" | "good" | "needs_attention" | "critical";

export interface HealthComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  explanation: string;
  source_module: string;
}

export interface BusinessHealthScore {
  overall_score: number;
  grade: HealthGrade;
  components: HealthComponent[];
  explanation: string;
  as_of: string;
  range: { start: string; end: string };
  formula_version: string;
  prior_score: number | null;
  trend: TrendDirection;
}

export interface HealthConfig {
  utilization_target_pct: number;
  idle_attention_threshold_days: number;
  weights: {
    collections: number;
    utilization: number;
    availability: number;
    compliance: number;
    operations: number;
  };
}

export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  utilization_target_pct: 80,
  idle_attention_threshold_days: 3,
  weights: {
    collections: 30,
    utilization: 25,
    availability: 15,
    compliance: 15,
    operations: 15,
  },
};

export const HEALTH_FORMULA_VERSION = "v1";

// ---------------------------------------------------------------------------
// Operational load
// ---------------------------------------------------------------------------

export interface OperationalLoad {
  blocked_fleet: {
    maintenance: number;
    damage: number;
    compliance: number;
    total_unique: number;
  };
  maintenance: {
    open_work_orders: number;
    blocking_work_orders: number;
    overdue_work_orders: number;
    maintenance_cost: number | null;
  };
  damage: {
    open_claims: number;
    blocking_claims: number;
    unresolved_responsibility: number;
    unrecovered_amount: number | null;
    damage_cost: number | null;
  };
  violations: {
    unresolved: number;
    customer_outstanding: number | null;
    disputed: number;
    overdue: number;
  };
  compliance: {
    blocked_vehicles: number;
    expired_docs: number;
    expiring_soon: number;
    missing_required: number;
  };
}

// ---------------------------------------------------------------------------
// Needs attention (reuse Daily Briefing)
// ---------------------------------------------------------------------------

export interface ExecutiveAttentionItem {
  id: string;
  priority: BriefingPriority;
  title: string;
  reason: string | null;
  category: string;
  deep_link: string | null;
  assigned_staff_id: string | null;
}

export interface PriorityDistribution {
  critical: number;
  high: number;
  medium: number;
  informational: number;
}

// ---------------------------------------------------------------------------
// Executive summary (the composed whole)
// ---------------------------------------------------------------------------

export interface ExecutiveDashboardSummary {
  range: {
    preset: ExecutiveDatePreset;
    start: string;
    end: string;
    as_of: string;
  };
  company_name: string;
  generated_at: string;
  financial: FinancialSnapshot;
  profitability: ProfitabilitySnapshot;
  fleet_utilization: FleetUtilizationSnapshot;
  idle_fleet: IdleFleetSnapshot;
  money_left_on_table: MoneyLeftOnTableSummary;
  health: BusinessHealthScore;
  operational_load: OperationalLoad;
  needs_attention: ExecutiveAttentionItem[];
  priority_distribution: PriorityDistribution;
  trends: {
    collections: TrendDirection;
    utilization: TrendDirection;
    profit: TrendDirection;
    health: TrendDirection;
  };
}

// ---------------------------------------------------------------------------
// Viewer permissions (reuse the Build #27/#28 contract)
// ---------------------------------------------------------------------------

export interface ExecutiveViewerPermissions {
  canViewFinancials: boolean;
  canViewProfitability: boolean;
  canViewSensitiveDocs: boolean;
  canViewBanking: boolean;
  allowedLocationIds: string[];
}
