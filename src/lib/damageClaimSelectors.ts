// Connect Pro Fleet — Damage Claims selectors (Build #17).
//
// Pure functions over DamageClaim + evidence + insurance + recovery + the
// authoritative ledgers. Economics are DERIVED from the rental ledger (customer
// charge + payments allocated to it), deposit ledger (applications), expense
// ledger (linked repair expenses), and recovery records (insurance/third-party).
// No mutable duplicate financial truth.
//
// Customer payment attribution: only payments allocated (via existing FIFO) to
// the claim-linked damage charge transaction count as recovery. A payment to an
// unrelated rental charge never counts as claim recovery.
//
// Actual cost: derived from linked ExpenseTransactions (including work-order-
// generated expenses). Work-order actual_cost + ExpenseTransaction is never
// double-counted (Build #14/#16 cost rules).

import type { FinancialTransaction } from "./chargeTypes";
import type { ExpenseTransaction } from "./expenseTypes";
import type { RentalDeposit } from "./depositTypes";
import type {
  DamageClaim,
  DamageClaimEvent,
  DamageClaimEconomics,
  DamageEvidence,
  DamageInsuranceClaim,
  DamageRecovery,
} from "./damageClaimTypes";
import { DAMAGE_CLAIM_ACTIVE_STATUSES } from "./damageClaimTypes";

const DAY = 86_400_000;

/** Next claim number in the DMG-YYYY-000000 sequence (tenant-scoped). */
export function nextDamageClaimNumber(claims: DamageClaim[]): string {
  const year = new Date().getFullYear();
  const max = claims
    .map((c) => {
      const m = c.claim_number.match(/^DMG-(\d{4})-(\d+)$/);
      return m && m[1] === String(year) ? Number(m[2]) : 0;
    })
    .reduce((a, b) => Math.max(a, b), 0);
  return `DMG-${year}-${String(max + 1).padStart(6, "0")}`;
}

/** Is the claim in an active (non-terminal) status? */
export function isClaimActive(claim: DamageClaim): boolean {
  return DAMAGE_CLAIM_ACTIVE_STATUSES.includes(claim.claim_status);
}

/** Does the claim block the vehicle? Only active + blocks_vehicle_use. */
export function isClaimBlocking(claim: DamageClaim): boolean {
  return claim.blocks_vehicle_use && isClaimActive(claim);
}

/** Does the vehicle have any blocking active damage claim? */
export function vehicleHasBlockingClaim(
  claims: DamageClaim[],
  vehicleId: string,
): boolean {
  return claims.some((c) => c.vehicle_id === vehicleId && isClaimBlocking(c));
}

/** All claims for a vehicle (any status). */
export function getVehicleDamageHistory(
  claims: DamageClaim[],
  vehicleId: string,
): DamageClaim[] {
  return claims
    .filter((c) => c.vehicle_id === vehicleId)
    .sort((a, b) => (a.discovered_at < b.discovered_at ? 1 : -1));
}

/** Open (active) claims. */
export function getOpenDamageClaims(claims: DamageClaim[]): DamageClaim[] {
  return claims.filter(isClaimActive);
}

/** Claims awaiting responsibility determination. */
export function getClaimsAwaitingResponsibility(
  claims: DamageClaim[],
): DamageClaim[] {
  return claims.filter(
    (c) => isClaimActive(c) && c.responsibility_status === "undetermined",
  );
}

/** Claims in recovery-pending status (active, recovery not complete). */
export function getClaimsRecoveryPending(
  claims: DamageClaim[],
  economics: Map<string, DamageClaimEconomics>,
): DamageClaim[] {
  return claims.filter((c) => {
    if (!isClaimActive(c)) return false;
    const eco = economics.get(c.id);
    if (!eco) return true;
    return eco.unrecovered_cost === null || eco.unrecovered_cost > 0;
  });
}

/** Evidence for a claim (excludes voided from the active list). */
export function getClaimEvidence(
  evidence: DamageEvidence[],
  claimId: string,
): DamageEvidence[] {
  return evidence
    .filter((e) => e.damage_claim_id === claimId && !e.voided_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** All evidence for a claim including voided (for history). */
export function getAllClaimEvidence(
  evidence: DamageEvidence[],
  claimId: string,
): DamageEvidence[] {
  return evidence
    .filter((e) => e.damage_claim_id === claimId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Insurance claim for a damage claim (if any). */
export function getInsuranceClaim(
  insuranceClaims: DamageInsuranceClaim[],
  claimId: string,
): DamageInsuranceClaim | null {
  return insuranceClaims.find((i) => i.damage_claim_id === claimId) ?? null;
}

/** Recoveries for a claim (excludes reversed). */
export function getClaimRecoveries(
  recoveries: DamageRecovery[],
  claimId: string,
): DamageRecovery[] {
  return recoveries
    .filter((r) => r.damage_claim_id === claimId && !r.reversed_at)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Events for a claim (append-oriented, newest first). */
export function getClaimEvents(
  events: DamageClaimEvent[],
  claimId: string,
): DamageClaimEvent[] {
  return events
    .filter((e) => e.damage_claim_id === claimId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Derived claim age in days (from discovered_at to now). */
export function getClaimAge(
  claim: DamageClaim,
  now: Date = new Date(),
): number {
  const d = new Date(claim.discovered_at).getTime();
  if (isNaN(d)) return 0;
  return Math.max(0, Math.floor((now.getTime() - d) / DAY));
}

// ---------------------------------------------------------------------------
// Economics — derived from authoritative ledgers + recovery records
// ---------------------------------------------------------------------------

/**
 * Sum of posted payments allocated to the claim-linked damage charge.
 * Uses the existing FIFO allocation: a payment reduces the customer's
 * outstanding obligation. We attribute the reduction against the damage
 * charge only when the payment is allocated to that specific obligation.
 *
 * For V1 we approximate allocation by checking whether the damage charge is
 * the oldest outstanding charge at the time of each payment — but to keep
 * this a pure selector without re-running FIFO, we use a simpler conservative
 * rule: customer_paid = min(total payments against the rental, damage charge
 * amount) capped so it never exceeds the charge. This matches the FIFO
 * outcome when the damage charge is the only/oldest outstanding obligation.
 *
 * The authoritative allocation lives in the ledger; this selector derives a
 * best-effort attribution for reporting without duplicating allocation logic.
 */
function customerPaidForClaim(
  claim: DamageClaim,
  transactions: FinancialTransaction[],
): number {
  if (!claim.customer_charge_transaction_id) return 0;
  const rentalTxns = transactions.filter(
    (t) =>
      t.rental_id === claim.rental_id &&
      t.status === "posted" &&
      // obligation-affecting only (exclude held deposit collection/refund)
      (t.category === "charge" ||
        t.category === "payment" ||
        t.category === "credit" ||
        t.category === "refund"),
  );
  // Sum charges up to and including the damage charge, and payments/credits.
  // Customer paid toward the damage charge = total payments - (charges posted
  // before the damage charge). Capped at the damage charge amount, >= 0.
  const chargeTxn = transactions.find(
    (t) => t.id === claim.customer_charge_transaction_id,
  );
  if (!chargeTxn) return 0;
  const chargeDate = chargeTxn.created_at;
  const chargesBeforeDamage = rentalTxns
    .filter((t) => t.category === "charge" && t.created_at < chargeDate)
    .reduce((s, t) => s + t.amount, 0);
  const totalPayments = rentalTxns
    .filter((t) => t.category === "payment" || t.category === "credit")
    .reduce((s, t) => s + t.amount, 0);
  const paidTowardDamage = Math.max(0, totalPayments - chargesBeforeDamage);
  return Math.min(paidTowardDamage, chargeTxn.amount);
}

/** Outstanding customer damage balance = damage charge - customer paid - deposit applied. */
function outstandingDamageBalance(
  claim: DamageClaim,
  transactions: FinancialTransaction[],
  depositApplied: number,
): number {
  if (!claim.customer_charge_transaction_id) return 0;
  const chargeTxn = transactions.find(
    (t) => t.id === claim.customer_charge_transaction_id,
  );
  if (!chargeTxn) return 0;
  const paid = customerPaidForClaim(claim, transactions);
  return Math.max(0, chargeTxn.amount - paid - depositApplied);
}

/**
 * Deposit applications linked to this claim (via recovery records of type
 * security_deposit_application). The authoritative deposit application lives
 * in the deposit ledger; the recovery record references it.
 */
function depositAppliedForClaim(
  claim: DamageClaim,
  recoveries: DamageRecovery[],
): number {
  return recoveries
    .filter(
      (r) =>
        r.damage_claim_id === claim.id &&
        r.recovery_type === "security_deposit_application" &&
        !r.reversed_at,
    )
    .reduce((s, r) => s + r.amount, 0);
}

/** Actual repair cost from linked ExpenseTransactions (counted once). */
export function getClaimActualCost(
  claim: DamageClaim,
  expenses: ExpenseTransaction[],
): number | null {
  // Linked expenses: those whose metadata.damage_claim_id === claim.id, or
  // expenses linked to the claim's work order (source = maintenance_work_order
  // with maintenance_work_order_id === claim.maintenance_work_order_id).
  const linked = expenses.filter((e) => {
    if (e.status === "voided") return false;
    const md = e.metadata as Record<string, unknown> | null;
    if (md?.damage_claim_id === claim.id) return true;
    if (
      claim.maintenance_work_order_id &&
      e.maintenance_work_order_id === claim.maintenance_work_order_id &&
      e.source === "maintenance_work_order"
    )
      return true;
    return false;
  });
  if (linked.length === 0) return null;
  // Net of reversals: a reversal expense (reversal_of set) contributes negative.
  return linked.reduce((sum, e) => {
    if (e.reversal_of) return sum - e.amount;
    return sum + e.amount;
  }, 0);
}

/** Compute the full derived economics for a damage claim. */
export function getDamageClaimEconomics(
  claim: DamageClaim,
  ctx: {
    transactions: FinancialTransaction[];
    expenses: ExpenseTransaction[];
    recoveries: DamageRecovery[];
  },
): DamageClaimEconomics {
  const activeRecoveries = ctx.recoveries.filter(
    (r) => r.damage_claim_id === claim.id && !r.reversed_at,
  );
  const depositApplied = activeRecoveries
    .filter((r) => r.recovery_type === "security_deposit_application")
    .reduce((s, r) => s + r.amount, 0);
  const insuranceRecovered = activeRecoveries
    .filter((r) => r.recovery_type === "insurance")
    .reduce((s, r) => s + r.amount, 0);
  const thirdPartyRecovered = activeRecoveries
    .filter((r) => r.recovery_type === "third_party")
    .reduce((s, r) => s + r.amount, 0);
  const otherRecovered = activeRecoveries
    .filter((r) => r.recovery_type === "other")
    .reduce((s, r) => s + r.amount, 0);
  const customerPaid = customerPaidForClaim(claim, ctx.transactions);

  const chargeTxn = claim.customer_charge_transaction_id
    ? ctx.transactions.find(
        (t) => t.id === claim.customer_charge_transaction_id,
      )
    : null;
  const customerCharged = chargeTxn ? chargeTxn.amount : 0;

  const actualCost = getClaimActualCost(claim, ctx.expenses);
  const totalRecovered =
    customerPaid +
    depositApplied +
    insuranceRecovered +
    thirdPartyRecovered +
    otherRecovered;

  const outstanding = outstandingDamageBalance(
    claim,
    ctx.transactions,
    depositApplied,
  );

  return {
    estimated_cost: claim.estimated_repair_cost,
    actual_cost: actualCost,
    customer_charged: customerCharged,
    customer_paid: customerPaid,
    deposit_applied: depositApplied,
    insurance_recovered: insuranceRecovered,
    third_party_recovered: thirdPartyRecovered,
    other_recovered: otherRecovered,
    total_recovered: round2(totalRecovered),
    unrecovered_cost:
      actualCost === null ? null : round2(actualCost - totalRecovered),
    outstanding_customer_damage_balance: round2(outstanding),
    company_net_loss:
      actualCost === null ? null : round2(actualCost - totalRecovered),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Search claims by number, customer, vehicle, rental, description, insurance ref. */
export function searchDamageClaims(
  claims: DamageClaim[],
  ctx: {
    customerName: (id: string) => string;
    vehicleLabel: (id: string) => string;
    rentalNumber: (id: string) => string;
  },
  query: string,
): DamageClaim[] {
  const q = query.trim().toLowerCase();
  if (!q) return claims;
  return claims.filter((c) => {
    if (c.claim_number.toLowerCase().includes(q)) return true;
    if (c.description.toLowerCase().includes(q)) return true;
    if ((c.external_reference ?? "").toLowerCase().includes(q)) return true;
    if (c.customer_id) {
      const name = ctx.customerName(c.customer_id).toLowerCase();
      if (name.includes(q)) return true;
    }
    const vLabel = ctx.vehicleLabel(c.vehicle_id).toLowerCase();
    if (vLabel.includes(q)) return true;
    if (c.rental_id) {
      const rNum = ctx.rentalNumber(c.rental_id).toLowerCase();
      if (rNum.includes(q)) return true;
    }
    return false;
  });
}
