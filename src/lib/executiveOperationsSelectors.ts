// Connect Pro Fleet — Executive Dashboard operational load + needs attention
// selectors (Build #30).
//
// DERIVED from the authoritative modules. Blocked fleet counts maintenance +
// damage + compliance blockers with an overlap-safe unique total (a vehicle
// blocked by multiple sources counts once). Maintenance/damage/violation/
// compliance loads reuse Build #13/#17/#25 selectors. Needs attention reuses
// Build #28 getOperationalAttentionItems (no new attention engine).

import type { FleetStore } from "./store/storeContext";
import type { Vehicle } from "./types";
import type { DamageClaim, DamageRecovery } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type {
  OperationalLoad,
  ExecutiveAttentionItem,
  PriorityDistribution,
} from "./executiveTypes";
import type { BriefingPriority } from "./briefingTypes";
import type { DateRange } from "./profitabilityHelpers";
import { getOperationalAttentionItems } from "./briefingComposer";
import type { BriefingSources } from "./briefingTypes";
import { DEFAULT_BRIEFING_CONFIG } from "./briefingTypes";
import {
  isWorkOrderBlocking,
  isWorkOrderActive,
  getWorkOrderCost,
} from "./maintenanceSelectors";
import { DAMAGE_CLAIM_ACTIVE_STATUSES } from "./damageClaimTypes";
import {
  isClaimBlocking,
  getDamageClaimEconomics,
} from "./damageClaimSelectors";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import { getUnrecoveredViolationExposure } from "./violationSelectors";
import { getComplianceDashboard } from "./complianceAggregates";
import { getComplianceBlock } from "./complianceAvailability";
import { round2 } from "./profitabilityHelpers";

export interface ExecutiveOperationsSources {
  store: FleetStore;
  damageClaims?: DamageClaim[];
  damageRecoveries?: DamageRecovery[];
  violations?: Violation[];
  expenses?: ExpenseTransaction[];
  documents?: DocumentRecord[];
  requirements?: ComplianceRequirement[];
  overrides?: ComplianceOverride[];
}

/** Blocked fleet — counts by source (maintenance/damage/compliance) with an
 *  overlap-safe unique total (a vehicle blocked by multiple sources counts
 *  once). */
export function buildBlockedFleet(
  src: ExecutiveOperationsSources,
  now: Date = new Date(),
): {
  maintenance: number;
  damage: number;
  compliance: number;
  total_unique: number;
} {
  const s = src.store;
  const maintenance = new Set<string>();
  const damage = new Set<string>();
  const compliance = new Set<string>();
  const all = new Set<string>();

  for (const wo of s.workOrders) {
    if (isWorkOrderBlocking(wo)) {
      maintenance.add(wo.vehicle_id);
      all.add(wo.vehicle_id);
    }
  }
  for (const c of src.damageClaims ?? []) {
    if (isClaimBlocking(c)) {
      damage.add(c.vehicle_id);
      all.add(c.vehicle_id);
    }
  }
  // Compliance blocking: per-vehicle compliance block (overlap-safe set).
  for (const v of s.vehicles) {
    const block = getComplianceBlock(
      v.id,
      `${v.year} ${v.make} ${v.model}`,
      src.requirements ?? [],
      src.documents ?? [],
      src.overrides ?? [],
      now,
    );
    if (block.blocked) {
      compliance.add(v.id);
      all.add(v.id);
    }
  }

  return {
    maintenance: maintenance.size,
    damage: damage.size,
    compliance: compliance.size,
    total_unique: all.size,
  };
}

/** Maintenance load — open/blocking/overdue work orders + period cost. */
export function buildMaintenanceLoad(
  src: ExecutiveOperationsSources,
  range: DateRange,
): {
  open_work_orders: number;
  blocking_work_orders: number;
  overdue_work_orders: number;
  maintenance_cost: number | null;
} {
  const s = src.store;
  const now = Date.now();
  let open = 0;
  let blocking = 0;
  let overdue = 0;
  let cost = 0;
  let hasCost = false;

  for (const wo of s.workOrders) {
    if (!isWorkOrderActive(wo)) continue;
    open++;
    if (isWorkOrderBlocking(wo)) blocking++;
    if (wo.expected_ready_at) {
      const ready = new Date(wo.expected_ready_at).getTime();
      if (!isNaN(ready) && ready < now) overdue++;
    }
    const c = getWorkOrderCost(wo);
    if (c != null) {
      cost += c;
      hasCost = true;
    }
  }
  return {
    open_work_orders: open,
    blocking_work_orders: blocking,
    overdue_work_orders: overdue,
    maintenance_cost: hasCost ? round2(cost) : null,
  };
}

/** Damage load — open/blocking claims + unresolved responsibility + unrecovered
 *  amount + period damage cost. */
export function buildDamageLoad(
  src: ExecutiveOperationsSources,
  range: DateRange,
): {
  open_claims: number;
  blocking_claims: number;
  unresolved_responsibility: number;
  unrecovered_amount: number | null;
  damage_cost: number | null;
} {
  const s = src.store;
  const claims = src.damageClaims ?? [];
  const open = claims.filter((c) =>
    DAMAGE_CLAIM_ACTIVE_STATUSES.includes(c.claim_status),
  );
  const blocking = open.filter((c) => c.blocks_vehicle_use);
  const unresolved = open.filter(
    (c) => c.responsibility_status === "undetermined",
  );

  let unrecovered = 0;
  let hasUnrecovered = false;
  let cost = 0;
  let hasCost = false;
  for (const c of open) {
    // Unrecovered amount + damage cost from authoritative economics.
    const eco = getDamageClaimEconomics(c, {
      transactions: s.transactions,
      expenses: src.expenses ?? s.expenses,
      recoveries: src.damageRecoveries ?? [],
    });
    if (eco.unrecovered_cost != null) {
      unrecovered += Math.max(0, eco.unrecovered_cost);
      hasUnrecovered = true;
    }
    if (eco.actual_cost != null) {
      cost += eco.actual_cost;
      hasCost = true;
    }
  }
  return {
    open_claims: open.length,
    blocking_claims: blocking.length,
    unresolved_responsibility: unresolved.length,
    unrecovered_amount: hasUnrecovered ? round2(unrecovered) : null,
    damage_cost: hasCost ? round2(cost) : null,
  };
}

/** Violation load — unresolved/disputed/overdue + customer-responsible outstanding. */
export function buildViolationLoad(
  src: ExecutiveOperationsSources,
  now: Date = new Date(),
): {
  unresolved: number;
  customer_outstanding: number | null;
  disputed: number;
  overdue: number;
} {
  const s = src.store;
  const violations = src.violations ?? [];
  const open = violations.filter((v) =>
    VIOLATION_OPEN_STATUSES.includes(v.status),
  );
  const disputed = violations.filter(
    (v) => v.dispute_status !== "not_disputed",
  );
  const nowTs = now.getTime();
  const overdue = open.filter((v) => {
    if (!v.due_at) return false;
    const due = new Date(v.due_at).getTime();
    return !isNaN(due) && due < nowTs;
  });

  // Customer-responsible outstanding recoverable.
  const companyPaid = open.filter((v) => v.company_payment_status === "paid");
  const linkedPayments = s.transactions.filter(
    (t) =>
      t.metadata?.violation_id &&
      t.category === "payment" &&
      t.status === "posted",
  );
  const linkedExpenses = (src.expenses ?? s.expenses).filter(
    (e) => e.metadata?.violation_id,
  );
  const exposure = getUnrecoveredViolationExposure(
    companyPaid,
    linkedPayments,
    linkedExpenses,
  );

  return {
    unresolved: open.length,
    customer_outstanding: round2(exposure.stillRecoverable),
    disputed: disputed.length,
    overdue: overdue.length,
  };
}

/** Compliance load — blocked vehicles + expired/expiring/missing docs. */
export function buildComplianceLoad(
  src: ExecutiveOperationsSources,
  now: Date = new Date(),
): {
  blocked_vehicles: number;
  expired_docs: number;
  expiring_soon: number;
  missing_required: number;
} {
  const s = src.store;
  const entities = s.vehicles.map((v) => ({
    type: "vehicle" as const,
    id: v.id,
    label: `${v.year} ${v.make} ${v.model}`,
  }));
  const dash = getComplianceDashboard(
    entities,
    src.requirements ?? [],
    src.documents ?? [],
    src.overrides ?? [],
    now,
  );
  return {
    blocked_vehicles: dash.blockedVehicles,
    expired_docs: dash.expired,
    expiring_soon: dash.expiringSoon,
    missing_required: dash.missingRequired,
  };
}

/** Build the full operational load. */
export function buildOperationalLoad(
  src: ExecutiveOperationsSources,
  range: DateRange,
  now: Date = new Date(),
): OperationalLoad {
  return {
    blocked_fleet: buildBlockedFleet(src, now),
    maintenance: buildMaintenanceLoad(src, range),
    damage: buildDamageLoad(src, range),
    violations: buildViolationLoad(src, now),
    compliance: buildComplianceLoad(src, now),
  };
}

/** Needs attention — reuses Build #28 getOperationalAttentionItems. Maps
 *  BriefingItem → ExecutiveAttentionItem (top N, bounded). */
export function buildNeedsAttention(
  src: ExecutiveOperationsSources,
  asOf: Date,
  range: DateRange,
  limit = 8,
): ExecutiveAttentionItem[] {
  const s = src.store;
  const briefingSources: BriefingSources = {
    store: s,
    billingPeriods: undefined,
    damageClaims: src.damageClaims,
    violations: src.violations,
    documents: src.documents,
    requirements: src.requirements,
    overrides: src.overrides,
    range,
  };
  const items = getOperationalAttentionItems(
    briefingSources,
    asOf,
    DEFAULT_BRIEFING_CONFIG,
  );
  return items.slice(0, limit).map((i) => ({
    id: i.id,
    priority: i.priority as BriefingPriority,
    title: i.title,
    reason: i.reason,
    category: i.category,
    deep_link: i.deep_link,
    assigned_staff_id: i.assigned_staff_id ?? null,
  }));
}

/** Priority distribution across needs-attention items. */
export function buildPriorityDistribution(
  items: ExecutiveAttentionItem[],
): PriorityDistribution {
  const dist: PriorityDistribution = {
    critical: 0,
    high: 0,
    medium: 0,
    informational: 0,
  };
  for (const i of items) {
    dist[i.priority]++;
  }
  return dist;
}

export type { Vehicle };
