// Connect Pro Fleet — Executive Dashboard Money Left on the Table selectors
// (Build #30).
//
// This is an OPPORTUNITY TRACKER, not fake loss accounting. Only known
// quantified recoverable amounts are summed into the dollar total; idle fleet
// is shown as a non-dollar opportunity (no idle×rate multiplication). Every
// quantified opportunity retains source traceability (module + entity + id +
// deep link). Dedupes by stable source identity so the same obligation is
// never counted twice.
//
// Reuses Build #25 violation recovery, Build #17 damage recovery, the deposit
// ledger, and the billing/ledger for assessed late fees. Never invents
// hypothetical revenue or future late fees.

import type { FleetStore } from "./store/storeContext";
import type { FinancialTransaction } from "./chargeTypes";
import type { BillingPeriod } from "./billingTypes";
import type { Violation } from "./violationTypes";
import type { DamageClaim, DamageRecovery } from "./damageClaimTypes";
import type { RentalDeposit } from "./depositTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type {
  MoneyLeftOnTableSummary,
  QuantifiedOpportunity,
  IdleOpportunity,
} from "./executiveTypes";
import type { ExecutiveViewerPermissions } from "./executiveTypes";
import { getUnrecoveredViolationExposure } from "./violationSelectors";
import { getDamageClaimEconomics } from "./damageClaimSelectors";
import { DAMAGE_CLAIM_ACTIVE_STATUSES } from "./damageClaimTypes";
import { getDepositRefundDue } from "./deposit";
import { round2 } from "./profitabilityHelpers";

export interface ExecutiveOpportunitySources {
  store: FleetStore;
  violations: Violation[];
  damageClaims: DamageClaim[];
  damageRecoveries: DamageRecovery[];
  rentalDeposits: RentalDeposit[];
  expenses: ExpenseTransaction[];
  billingPeriods: BillingPeriod[];
}

/** Stable dedupe key for a quantified opportunity. */
function oppKey(o: {
  source_module: string;
  entity_id: string;
  category: string;
}): string {
  return `${o.source_module}:${o.category}:${o.entity_id}`;
}

/** Violation recovery — customer-responsible amount still recoverable.
 *  Reuses Build #25 getUnrecoveredViolationExposure (no double-count). */
function violationOpportunities(
  src: ExecutiveOpportunitySources,
): QuantifiedOpportunity[] {
  const s = src.store;
  const out: QuantifiedOpportunity[] = [];
  for (const v of src.violations) {
    if (v.status === "resolved" || v.status === "cancelled") continue;
    // Only company-paid customer-responsible violations have recoverable exposure.
    if (v.company_payment_status !== "paid") continue;
    if (v.responsibility !== "customer" && v.responsibility !== "shared")
      continue;
    const linkedPayments = s.transactions.filter(
      (t) =>
        t.metadata?.violation_id === v.id &&
        t.category === "payment" &&
        t.status === "posted",
    );
    const linkedExpenses = src.expenses.filter(
      (e) => e.metadata?.violation_id === v.id,
    );
    const exposure = getUnrecoveredViolationExposure(
      [v],
      linkedPayments,
      linkedExpenses,
    );
    if (exposure.stillRecoverable <= 0) continue;
    out.push({
      category: "violation_recovery",
      label: `${v.violation_number} — violation recovery`,
      amount: round2(exposure.stillRecoverable),
      source_module: "violations",
      entity_type: "violation",
      entity_id: v.id,
      deep_link: "/violations",
      detail: `Customer-responsible · ${v.responsibility}`,
    });
  }
  return out;
}

/** Damage recovery — outstanding customer damage balance for active claims.
 *  Reuses Build #17 getDamageClaimEconomics. */
function damageOpportunities(
  src: ExecutiveOpportunitySources,
): QuantifiedOpportunity[] {
  const s = src.store;
  const out: QuantifiedOpportunity[] = [];
  for (const c of src.damageClaims) {
    if (!DAMAGE_CLAIM_ACTIVE_STATUSES.includes(c.claim_status)) continue;
    const eco = getDamageClaimEconomics(c, {
      transactions: s.transactions,
      expenses: src.expenses,
      recoveries: src.damageRecoveries,
    });
    // Outstanding customer damage balance is the recoverable amount.
    if (eco.outstanding_customer_damage_balance <= 0) continue;
    out.push({
      category: "damage_recovery",
      label: `${c.claim_number} — damage recovery`,
      amount: round2(eco.outstanding_customer_damage_balance),
      source_module: "damage_claims",
      entity_type: "damage_claim",
      entity_id: c.id,
      deep_link: "/damage-claims",
      detail: `Outstanding customer damage balance`,
    });
  }
  return out;
}

/** Assessed late fees — already assessed (posted late_fee charges) but unpaid.
 *  Uses the authoritative ledger; never calculates theoretical future fees. */
function lateFeeOpportunities(
  src: ExecutiveOpportunitySources,
): QuantifiedOpportunity[] {
  const s = src.store;
  const out: QuantifiedOpportunity[] = [];
  // Group late-fee charges by rental to compute outstanding per rental.
  const byRental = new Map<string, { charges: number; payments: number }>();
  for (const t of s.transactions) {
    if (t.status !== "posted") continue;
    if (t.transaction_type !== "late_fee") continue;
    const cur = byRental.get(t.rental_id) ?? { charges: 0, payments: 0 };
    if (t.category === "charge") cur.charges += t.amount;
    if (t.category === "payment" || t.category === "credit")
      cur.payments += t.amount;
    byRental.set(t.rental_id, cur);
  }
  for (const [rentalId, { charges, payments }] of byRental) {
    const outstanding = Math.max(0, round2(charges - payments));
    if (outstanding <= 0) continue;
    const rental = s.rentals.find((r) => r.id === rentalId);
    out.push({
      category: "late_fees",
      label: `Late fees — ${rental?.agreement_number ?? rentalId}`,
      amount: outstanding,
      source_module: "billing",
      entity_type: "rental",
      entity_id: rentalId,
      deep_link: `/rentals/${rentalId}`,
      detail: `Assessed late fees unpaid`,
    });
  }
  return out;
}

/** Deposit exposure — unresolved deposit situations (refund due on completed
 *  rentals not yet issued). The held deposit itself is NOT recoverable revenue;
 *  only the operational exposure (refund due) is surfaced. 0 when none. */
function depositExposureOpportunities(
  src: ExecutiveOpportunitySources,
): QuantifiedOpportunity[] {
  const s = src.store;
  const out: QuantifiedOpportunity[] = [];
  for (const d of src.rentalDeposits) {
    const refundDue = getDepositRefundDue(d);
    if (refundDue <= 0) continue;
    // Only surface for completed rentals (unresolved refund on an active rental
    // is normal operations, not exposure).
    const rental = s.rentals.find((r) => r.id === d.rental_id);
    if (!rental || rental.status !== "completed") continue;
    out.push({
      category: "deposit_exposure",
      label: `Deposit refund due — ${rental.agreement_number ?? d.rental_id}`,
      amount: round2(refundDue),
      source_module: "deposits",
      entity_type: "rental_deposit",
      entity_id: d.id,
      deep_link: "/deposits",
      detail: `Refund due on completed rental`,
    });
  }
  return out;
}

/** Build the Money Left on the Table summary. Quantified recoverable total
 *  includes ONLY known amounts (violations + damage + late fees + deposit
 *  exposure). Idle fleet is a separate non-dollar opportunity. Permission-gated
 *  BEFORE forming. */
export function getMoneyLeftOnTableSummary(
  src: ExecutiveOpportunitySources,
  idleOpportunities: IdleOpportunity[],
  perms: ExecutiveViewerPermissions,
): MoneyLeftOnTableSummary {
  const canMoney = perms.canViewFinancials;

  const all: QuantifiedOpportunity[] = [
    ...violationOpportunities(src),
    ...damageOpportunities(src),
    ...lateFeeOpportunities(src),
    ...depositExposureOpportunities(src),
  ];

  // Dedupe by stable source identity (same obligation counted once).
  const seen = new Map<string, QuantifiedOpportunity>();
  for (const o of all) {
    const key = oppKey(o);
    if (!seen.has(key)) seen.set(key, o);
  }
  const quantified = [...seen.values()];

  const total = quantified.reduce((s, o) => s + o.amount, 0);

  const idleCount = idleOpportunities.length;
  const totalIdleDays = idleOpportunities.reduce((s, i) => s + i.idle_days, 0);
  const noFuture = idleOpportunities.filter(
    (i) => i.next_reservation_in_days === null,
  ).length;

  return {
    known_recoverable_total: canMoney ? round2(total) : null,
    quantified: canMoney ? quantified : [],
    idle_opportunity: {
      idle_count: idleCount,
      total_idle_days: totalIdleDays,
      vehicles_without_future_reservation: noFuture,
      items: idleOpportunities,
    },
  };
}
