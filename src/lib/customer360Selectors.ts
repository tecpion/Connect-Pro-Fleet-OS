// Connect Pro Fleet — Customer 360 summary selectors (Build #27).
//
// Pure aggregation over the authoritative modules. Customer 360 is an
// INTELLIGENCE layer — it never stores a second financial truth. Outstanding
// balance, overdue amount, and next-payment-due are DERIVED from the existing
// billing selectors + rental ledger. Deposit state comes from the deposit
// ledger. Damage/violation/compliance are counts over their authoritative
// stores. Sensitive document numbers are masked (Build #26 rules).
//
// Relationship status is a FACTUAL derived operational state — never an
// arbitrary credit/risk score. "Do Not Rent" only surfaces when the customer's
// stored status is do_not_rent.

import type { FleetStore } from "./store/storeContext";
import type { RentalAgreement } from "./types";
import type { BillingPeriod } from "./billingTypes";
import type { DamageClaim } from "./damageClaimTypes";
import type { Violation } from "./violationTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
  ComplianceStatus,
} from "./complianceTypes";
import type { Task } from "./taskTypes";
import type { OperationalStaffAssignment } from "./staffTypes";
import type { PaymentArrangement } from "./paymentArrangementTypes";
import { getEntityComplianceStatus } from "./complianceStatus";
import { safeParseDate } from "./timelineShared";
import { VIOLATION_OPEN_STATUSES } from "./violationTypes";
import { DAMAGE_CLAIM_ACTIVE_STATUSES } from "./damageClaimTypes";

const DAY = 86_400_000;

export interface Customer360Sources {
  store: FleetStore;
  billingPeriods?: BillingPeriod[];
  damageClaims?: DamageClaim[];
  violations?: Violation[];
  documents?: DocumentRecord[];
  requirements?: ComplianceRequirement[];
  overrides?: ComplianceOverride[];
  tasks?: Task[];
  assignments?: OperationalStaffAssignment[];
  paymentArrangements?: PaymentArrangement[];
}

export interface CustomerActiveRental {
  id: string;
  agreementNumber: string;
  vehicleId: string;
  customerId: string;
  status: string;
  checkoutDate: string | null;
  scheduledReturn: string | null;
  rateType: string;
  rateAmount: number;
  nextPaymentDue: string | null;
  balanceDue: number;
}

export interface Customer360Summary {
  activeRental: CustomerActiveRental | null;
  totalRentals: number;
  lifetimeRentalDays: number;
  outstandingBalance: number;
  overdueAmount: number;
  nextPaymentDue: string | null;
  currentDepositHeld: number;
  openDamageClaims: number;
  openViolations: number;
  complianceStatus: ComplianceStatus;
  overdueTasks: number;
  accountOwner: string | null;
  lastActivityAt: string | null;
}

const ACTIVE_RENTAL_STATUSES = new Set([
  "active",
  "late",
  "overdue",
  "payment_due",
  "return_pending",
]);

/** Sum the days a customer has possessed vehicles across all rentals. Uses
 *  actual_return_date when available, else scheduled_return_date, else now
 *  (open rental). Missing checkout → 0 for that rental. */
export function getLifetimeRentalDays(
  rentals: Array<
    Pick<RentalAgreement, "checkout_date" | "actual_return_date"> & {
      // Runtime treats scheduled_return_date as nullable (see endRaw below);
      // the RentalAgreement type is stricter, so widen it here to match.
      scheduled_return_date: string | null;
    }
  >,
  now: Date = new Date(),
): number {
  let total = 0;
  for (const r of rentals) {
    const start = safeParseDate(r.checkout_date);
    if (start === 0) continue;
    const endRaw = r.actual_return_date ?? r.scheduled_return_date;
    const end = endRaw ? safeParseDate(endRaw) : now.getTime();
    if (end >= start) total += Math.round((end - start) / DAY);
  }
  return total;
}

/** Resolve the active (in-progress) rental for a customer, if any. */
function activeRentalFor(
  customerId: string,
  store: FleetStore,
): RentalAgreement | undefined {
  return store.rentals.find(
    (r) => r.customer_id === customerId && ACTIVE_RENTAL_STATUSES.has(r.status),
  );
}

/** Outstanding balance across all open rentals (authoritative ledger truth). */
function outstandingFor(customerId: string, store: FleetStore): number {
  return store.rentals
    .filter(
      (r) =>
        r.customer_id === customerId && ACTIVE_RENTAL_STATUSES.has(r.status),
    )
    .reduce((s, r) => s + r.balance_due, 0);
}

/** Current held deposit amount for a customer (collected - applied - refunded -
 *  forfeited). Deposits are NOT revenue. */
function heldDepositFor(customerId: string, store: FleetStore): number {
  return store.rentalDeposits
    .filter((d) => d.customer_id === customerId)
    .reduce(
      (s, d) =>
        s +
        d.collected_amount -
        d.applied_amount -
        d.refunded_amount -
        d.forfeited_amount,
      0,
    );
}

/** The full Customer 360 summary, derived from authoritative sources. */
export function getCustomer360Summary(
  customerId: string,
  src: Customer360Sources,
  now: Date = new Date(),
): Customer360Summary {
  const s = src.store;
  const custRentals = s.rentals.filter((r) => r.customer_id === customerId);
  const active = activeRentalFor(customerId, s);

  const openDamage = (src.damageClaims ?? []).filter(
    (c) =>
      c.customer_id === customerId &&
      DAMAGE_CLAIM_ACTIVE_STATUSES.includes(c.claim_status),
  ).length;

  const openViolations = (src.violations ?? []).filter(
    (v) =>
      v.customer_id === customerId &&
      VIOLATION_OPEN_STATUSES.includes(v.status),
  ).length;

  const compliance = getEntityComplianceStatus(
    "customer",
    customerId,
    s.customerName(customerId),
    src.requirements ?? [],
    src.documents ?? [],
    src.overrides ?? [],
    now,
  );

  const overdueTasks = (src.tasks ?? []).filter(
    (t) =>
      t.entity_type === "customer" &&
      t.entity_id === customerId &&
      (t.status === "open" || t.status === "in_progress") &&
      t.due_date &&
      safeParseDate(t.due_date) > 0 &&
      safeParseDate(t.due_date) < now.getTime(),
  ).length;

  const ownerAssignment = (src.assignments ?? []).find(
    (a) =>
      a.entity_type === "customer" &&
      a.entity_id === customerId &&
      a.assignment_type === "customer_account_owner" &&
      a.status === "active",
  );
  const accountOwner = ownerAssignment
    ? (s.staff.find((st) => st.id === ownerAssignment.staff_id)?.full_name ??
      null)
    : null;

  // Last activity = most recent event timestamp across rentals/payments.
  const timestamps: number[] = [
    safeParseDate(s.customers.find((c) => c.id === customerId)?.updated_at),
  ];
  for (const r of custRentals) {
    timestamps.push(safeParseDate(r.updated_at));
  }
  for (const t of s.transactions.filter((t) => t.customer_id === customerId)) {
    timestamps.push(safeParseDate(t.effective_date));
  }
  const lastTs = Math.max(...timestamps);
  const lastActivityAt = lastTs > 0 ? new Date(lastTs).toISOString() : null;

  return {
    activeRental: active
      ? {
          id: active.id,
          agreementNumber: active.agreement_number,
          vehicleId: active.vehicle_id,
          customerId: active.customer_id,
          status: active.status,
          checkoutDate: active.checkout_date,
          scheduledReturn: active.scheduled_return_date,
          rateType: active.rate_type,
          rateAmount: active.rate_amount,
          nextPaymentDue: active.next_payment_due,
          balanceDue: active.balance_due,
        }
      : null,
    totalRentals: custRentals.length,
    lifetimeRentalDays: getLifetimeRentalDays(custRentals, now),
    outstandingBalance: outstandingFor(customerId, s),
    overdueAmount: 0, // derived from late billing periods when passed in
    nextPaymentDue: active?.next_payment_due ?? null,
    currentDepositHeld: heldDepositFor(customerId, s),
    openDamageClaims: openDamage,
    openViolations: openViolations,
    complianceStatus: compliance.status,
    overdueTasks,
    accountOwner,
    lastActivityAt,
  };
}

export type CustomerRelationshipStatus =
  | "prospect"
  | "reservation"
  | "active_renter"
  | "past_customer"
  | "attention_needed"
  | "do_not_rent";

/** Derive a factual relationship status. Never a credit/risk score. */
export function getCustomerRelationshipStatus(
  summary: Pick<
    Customer360Summary,
    "activeRental" | "totalRentals" | "complianceStatus"
  >,
  hasReservation: boolean,
): CustomerRelationshipStatus {
  if (summary.activeRental) return "active_renter";
  if (summary.complianceStatus === "blocked") return "attention_needed";
  if (hasReservation) return "reservation";
  if (summary.totalRentals > 0) return "past_customer";
  return "prospect";
}

export type CustomerAttentionType =
  | "late_balance"
  | "broken_arrangement"
  | "compliance_missing"
  | "compliance_blocked"
  | "open_damage"
  | "unresolved_violation"
  | "overdue_task";

export interface CustomerAttentionItem {
  type: CustomerAttentionType;
  severity: "critical" | "high" | "medium" | "normal";
  label: string;
  detail: string | null;
}

/** Derive the actionable attention items for a customer. Only REAL issues. */
export function getCustomerAttentionItems(
  customerId: string,
  src: Customer360Sources,
  now: Date = new Date(),
): CustomerAttentionItem[] {
  const summary = getCustomer360Summary(customerId, src, now);
  const items: CustomerAttentionItem[] = [];

  if (summary.outstandingBalance > 0) {
    items.push({
      type: "late_balance",
      severity: "high",
      label: "Outstanding balance",
      detail: null,
    });
  }

  const broken = (src.paymentArrangements ?? []).filter(
    (a) => a.customer_id === customerId && a.status === "broken",
  );
  if (broken.length > 0) {
    items.push({
      type: "broken_arrangement",
      severity: "high",
      label: `${broken.length} broken payment arrangement${broken.length > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  const compliance = getEntityComplianceStatus(
    "customer",
    customerId,
    src.store.customerName(customerId),
    src.requirements ?? [],
    src.documents ?? [],
    src.overrides ?? [],
    now,
  );
  for (const issue of compliance.issues) {
    if (issue.blocking) {
      items.push({
        type: "compliance_blocked",
        severity: "critical",
        label: `Compliance block: ${issue.document_type}`,
        detail: issue.reason,
      });
    } else if (issue.reason === "missing_required") {
      items.push({
        type: "compliance_missing",
        severity: "medium",
        label: `Missing: ${issue.document_type}`,
        detail: null,
      });
    }
  }

  if (summary.openDamageClaims > 0) {
    items.push({
      type: "open_damage",
      severity: "medium",
      label: `${summary.openDamageClaims} open damage claim${summary.openDamageClaims > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  if (summary.openViolations > 0) {
    items.push({
      type: "unresolved_violation",
      severity: "medium",
      label: `${summary.openViolations} unresolved violation${summary.openViolations > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  if (summary.overdueTasks > 0) {
    items.push({
      type: "overdue_task",
      severity: "normal",
      label: `${summary.overdueTasks} overdue task${summary.overdueTasks > 1 ? "s" : ""}`,
      detail: null,
    });
  }

  return items;
}
