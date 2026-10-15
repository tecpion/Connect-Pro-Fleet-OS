// Connect Pro Fleet — Executive Dashboard composer + operational context builder
// (Build #30).
//
// Single composition pass: buildExecutiveDashboard assembles the financial,
// profitability, fleet, idle, opportunity, health, operational load, and
// needs-attention snapshots ONCE so child components don't recompute P&L /
// utilization / opportunity / health independently. All sub-selectors are
// permission-gated BEFORE forming. buildExecutiveOperationalContext produces a
// structured (no-LLM) context for Copilot + future weekly reports.

import type { FleetStore } from "./store/storeContext";
import type { DamageClaim, DamageRecovery } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type { BillingPeriod } from "./billingTypes";
import type {
  PaymentArrangement,
  PaymentArrangementInstallment,
} from "./paymentArrangementTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type {
  ExecutiveDashboardSummary,
  ExecutiveRange,
  ExecutiveViewerPermissions,
  HealthConfig,
} from "./executiveTypes";
import type { DateRange } from "./profitabilityHelpers";
import type { ProfitabilityInputs } from "./profitabilitySelectors";
import { buildFinancialSnapshot } from "./executiveFinancialSelectors";
import { buildProfitabilitySnapshot } from "./executiveProfitabilitySelectors";
import {
  buildFleetUtilizationSnapshot,
  buildIdleFleetSnapshot,
  buildIdleOpportunities,
} from "./executiveFleetSelectors";
import { getMoneyLeftOnTableSummary } from "./executiveOpportunitySelectors";
import {
  calculateBusinessHealthScore,
  calculatePriorHealthScore,
} from "./businessHealthSelectors";
import {
  buildOperationalLoad,
  buildNeedsAttention,
  buildPriorityDistribution,
} from "./executiveOperationsSelectors";
import { DEFAULT_HEALTH_CONFIG } from "./executiveTypes";
import { precedingRange } from "./executiveFinancialSelectors";

export interface ExecutiveDashboardSources {
  store: FleetStore;
  inputs: ProfitabilityInputs;
  damageClaims?: DamageClaim[];
  damageRecoveries?: DamageRecovery[];
  violations?: Violation[];
  expenses?: ExpenseTransaction[];
  billingPeriods?: BillingPeriod[];
  paymentArrangements?: PaymentArrangement[];
  arrangementInstallments?: PaymentArrangementInstallment[];
  rentalDeposits?: import("./depositTypes").RentalDeposit[];
  documents?: DocumentRecord[];
  requirements?: ComplianceRequirement[];
  overrides?: ComplianceOverride[];
}

/** Resolve an ExecutiveRange into a plain DateRange (start/end). */
export function resolveExecutiveRange(range: ExecutiveRange): DateRange {
  return { start: range.start, end: range.end };
}

/** Coerce a possibly-malformed date into a finite Date, falling back to `now`
 *  when invalid so downstream `.toISOString()` / `.getTime()` never throw. */
function safeDate(d: Date, fallback: Date): Date {
  const t = d.getTime();
  return isNaN(t) || !isFinite(t) ? fallback : d;
}

/** Build the full Executive Dashboard summary in a single composition pass. */
export function buildExecutiveDashboard(
  src: ExecutiveDashboardSources,
  range: ExecutiveRange,
  perms: ExecutiveViewerPermissions,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG,
  now: Date = new Date(),
): ExecutiveDashboardSummary {
  const s = src.store;
  // Sanitize range dates — malformed/NaN dates fall back to `now` so the
  // composition never throws (spec §65: malformed date safe).
  const safeStart = safeDate(range.start, now);
  const safeEnd = safeDate(range.end, now);
  const safeAsOf = safeDate(range.as_of, now);
  const dateRange: DateRange = { start: safeStart, end: safeEnd };

  // Financial snapshot.
  const financial = buildFinancialSnapshot(
    s.transactions,
    s.maintenance,
    s.rentals,
    src.billingPeriods ?? [],
    src.paymentArrangements ?? [],
    src.arrangementInstallments ?? [],
    { start: dateRange.start, end: dateRange.end, as_of: safeAsOf },
    perms,
  );

  // Profitability.
  const profitability = buildProfitabilitySnapshot(
    { store: s, inputs: src.inputs },
    dateRange,
    perms,
  );

  // Fleet utilization + idle.
  const fleetSources = {
    store: s,
    damageClaims: src.damageClaims,
    violations: src.violations,
    documents: src.documents,
    requirements: src.requirements,
    overrides: src.overrides,
  };
  const fleetUtilization = buildFleetUtilizationSnapshot(
    fleetSources,
    dateRange,
    now,
  );
  const idleFleet = buildIdleFleetSnapshot(
    fleetSources,
    dateRange,
    config.idle_attention_threshold_days,
    now,
  );

  // Money left on the table.
  const idleOps = buildIdleOpportunities(fleetSources, dateRange, now);
  const moneyLeftOnTable = getMoneyLeftOnTableSummary(
    {
      store: s,
      violations: src.violations ?? [],
      damageClaims: src.damageClaims ?? [],
      damageRecoveries: src.damageRecoveries ?? [],
      rentalDeposits: src.rentalDeposits ?? s.rentalDeposits,
      expenses: src.expenses ?? s.expenses,
      billingPeriods: src.billingPeriods ?? [],
    },
    idleOps,
    perms,
  );

  // Operational load + needs attention.
  const opsSources = {
    store: s,
    damageClaims: src.damageClaims,
    damageRecoveries: src.damageRecoveries,
    violations: src.violations,
    expenses: src.expenses,
    documents: src.documents,
    requirements: src.requirements,
    overrides: src.overrides,
  };
  const operationalLoad = buildOperationalLoad(opsSources, dateRange, now);
  const needsAttention = buildNeedsAttention(
    opsSources,
    safeAsOf,
    dateRange,
    8,
  );
  const priorityDistribution = buildPriorityDistribution(needsAttention);

  // Business health score (current + prior for trend).
  const health = calculateBusinessHealthScore({
    financial,
    fleet: fleetUtilization,
    idle: idleFleet,
    load: operationalLoad,
    attention: needsAttention,
    store: s,
    config,
    range: dateRange,
    asOf: safeAsOf,
  });

  // Prior-period health score for trend (same formula/config).
  const priorRange = precedingRange(dateRange.start, dateRange.end);
  const priorHealth = calculatePriorHealthScore({
    financial,
    fleet: fleetUtilization,
    idle: idleFleet,
    load: operationalLoad,
    attention: needsAttention,
    store: s,
    config,
    range: priorRange,
    asOf: safeAsOf,
  });
  // Recompute health with the prior score for an accurate trend.
  const healthWithTrend = calculateBusinessHealthScore({
    financial,
    fleet: fleetUtilization,
    idle: idleFleet,
    load: operationalLoad,
    attention: needsAttention,
    store: s,
    config,
    range: dateRange,
    asOf: safeAsOf,
    priorScore: priorHealth,
  });

  return {
    range: {
      preset: range.preset,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
      as_of: safeAsOf.toISOString(),
    },
    company_name: s.companyInfo.dba || s.companyInfo.legal_name,
    generated_at: now.toISOString(),
    financial,
    profitability,
    fleet_utilization: fleetUtilization,
    idle_fleet: idleFleet,
    money_left_on_table: moneyLeftOnTable,
    health: healthWithTrend,
    operational_load: operationalLoad,
    needs_attention: needsAttention,
    priority_distribution: priorityDistribution,
    trends: {
      collections: financial.collections_trend,
      utilization: fleetUtilization.utilization_trend,
      profit: profitability.profit_trend,
      health: healthWithTrend.trend,
    },
  };
}

/** Structured (no-LLM) operational context for Copilot + future weekly reports.
 *  Permission-filtered BEFORE context formation. */
export interface ExecutiveOperationalContext {
  company_name: string;
  as_of: string;
  range: { start: string; end: string };
  health: {
    overall_score: number;
    grade: string;
    formula_version: string;
    components: {
      label: string;
      score: number;
      weight: number;
      explanation: string;
    }[];
    explanation: string;
  };
  financial: {
    collections: number | null;
    billed_revenue: number | null;
    outstanding_balance: number | null;
    overdue_balance: number | null;
    overdue_count: number;
    collection_rate: number | null;
  };
  profitability: {
    operating_revenue: number | null;
    operating_profit: number | null;
    margin_percent: number | null;
  };
  fleet_utilization: {
    utilization_pct: number;
    rented_days: number;
    rentable_days: number;
    blocked_days: number;
    idle_days: number;
  };
  money_left_on_table: {
    known_recoverable_total: number | null;
    quantified_count: number;
    idle_count: number;
    total_idle_days: number;
  };
  needs_attention: {
    title: string;
    priority: string;
    deep_link: string | null;
  }[];
  operational_load: {
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
    };
    damage: { open_claims: number; blocking_claims: number };
    violations: { unresolved: number; overdue: number };
    compliance: {
      blocked_vehicles: number;
      expired_docs: number;
      missing_required: number;
    };
  };
}

/** Build the structured executive operational context (no LLM). */
export function buildExecutiveOperationalContext(
  summary: ExecutiveDashboardSummary,
  perms: ExecutiveViewerPermissions,
): ExecutiveOperationalContext {
  return {
    company_name: summary.company_name,
    as_of: summary.range.as_of,
    range: { start: summary.range.start, end: summary.range.end },
    health: {
      overall_score: summary.health.overall_score,
      grade: summary.health.grade,
      formula_version: summary.health.formula_version,
      components: summary.health.components.map((c) => ({
        label: c.label,
        score: c.score,
        weight: c.weight,
        explanation: c.explanation,
      })),
      explanation: summary.health.explanation,
    },
    financial: {
      collections: perms.canViewFinancials
        ? summary.financial.collections
        : null,
      billed_revenue: perms.canViewFinancials
        ? summary.financial.billed_revenue
        : null,
      outstanding_balance: perms.canViewFinancials
        ? summary.financial.outstanding_balance
        : null,
      overdue_balance: perms.canViewFinancials
        ? summary.financial.overdue_balance
        : null,
      overdue_count: summary.financial.overdue_count,
      collection_rate: perms.canViewFinancials
        ? summary.financial.collection_rate
        : null,
    },
    profitability: {
      operating_revenue: perms.canViewProfitability
        ? summary.profitability.operating_revenue
        : null,
      operating_profit: perms.canViewProfitability
        ? summary.profitability.operating_profit
        : null,
      margin_percent: perms.canViewProfitability
        ? summary.profitability.margin_percent
        : null,
    },
    fleet_utilization: {
      utilization_pct: summary.fleet_utilization.utilization_pct,
      rented_days: summary.fleet_utilization.rented_days,
      rentable_days: summary.fleet_utilization.rentable_days,
      blocked_days: summary.fleet_utilization.blocked_days,
      idle_days: summary.fleet_utilization.idle_available_days,
    },
    money_left_on_table: {
      known_recoverable_total: perms.canViewFinancials
        ? summary.money_left_on_table.known_recoverable_total
        : null,
      quantified_count: summary.money_left_on_table.quantified.length,
      idle_count: summary.money_left_on_table.idle_opportunity.idle_count,
      total_idle_days:
        summary.money_left_on_table.idle_opportunity.total_idle_days,
    },
    needs_attention: summary.needs_attention.map((i) => ({
      title: i.title,
      priority: i.priority,
      deep_link: i.deep_link,
    })),
    operational_load: {
      blocked_fleet: summary.operational_load.blocked_fleet,
      maintenance: {
        open_work_orders: summary.operational_load.maintenance.open_work_orders,
        blocking_work_orders:
          summary.operational_load.maintenance.blocking_work_orders,
        overdue_work_orders:
          summary.operational_load.maintenance.overdue_work_orders,
      },
      damage: {
        open_claims: summary.operational_load.damage.open_claims,
        blocking_claims: summary.operational_load.damage.blocking_claims,
      },
      violations: {
        unresolved: summary.operational_load.violations.unresolved,
        overdue: summary.operational_load.violations.overdue,
      },
      compliance: {
        blocked_vehicles: summary.operational_load.compliance.blocked_vehicles,
        expired_docs: summary.operational_load.compliance.expired_docs,
        missing_required: summary.operational_load.compliance.missing_required,
      },
    },
  };
}
