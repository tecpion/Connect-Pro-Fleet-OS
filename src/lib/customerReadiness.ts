// Connect Pro Fleet — Customer readiness selectors (Build #38 — Customers V1).
//
// Customer "Ready to Rent" is a TRANSPARENT, EXPLAINABLE derived state — never
// an opaque score. It composes authoritative signals:
//   - Do Not Rent flag (authoritative customer status — always blocks)
//   - blocking outstanding balance (only if a tenant policy enables it)
//   - customer compliance blockers (from the authoritative compliance engine,
//     gated by the tenant's customer-verification mode)
//   - conflicting active rental (a customer may not rent a second vehicle if
//     the tenant disallows concurrent rentals — but V1 does not enforce this;
//     we only surface an informational attention item when an active rental
//     exists and the customer is being evaluated for a NEW rental)
//
// Verification participates ONLY when the tenant's customer_verification mode
// is "basic" (informational) or "required" (blocking). When the mode is "off",
// verification is ignored completely — a customer may be Ready even with no
// ID/license on file. Compliance remains the single authoritative blocker
// engine; this selector does NOT create a second one.
//
// Possible readiness states:
//   "ready"            → no blocking issue
//   "needs_attention"  → one or more non-blocking informational issues
//   "blocked"          → a configured/compliance rule prevents rental/checkout
//
// Each state carries a human-readable list of reasons so the UI never hides the
// cause behind a tooltip.

import type { Customer, RentalAgreement } from "./types";
import type { FleetStore } from "./store/storeContext";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "./complianceTypes";
import type { CompanyPolicies } from "./companyPolicyTypes";
import { getEntityComplianceStatus } from "./complianceStatus";
import { isVerificationOff } from "./verificationConfig";

export type CustomerReadinessState = "ready" | "needs_attention" | "blocked";

export interface CustomerReadinessReason {
  /** Stable machine key for the reason (used for de-duplication + tests). */
  key: string;
  /** Human-readable reason label. */
  label: string;
  /** Whether this reason blocks rental/checkout. */
  blocking: boolean;
}

export interface CustomerReadiness {
  state: CustomerReadinessState;
  reasons: CustomerReadinessReason[];
  /** Convenience: true when state === "ready". */
  ready: boolean;
  /** Convenience: true when state === "blocked". */
  blocked: boolean;
  /** Convenience: true when state === "needs_attention". */
  needsAttention: boolean;
}

export interface CustomerReadinessInputs {
  customer: Customer;
  rentals: RentalAgreement[];
  documents: DocumentRecord[];
  requirements: ComplianceRequirement[];
  overrides: ComplianceOverride[];
  policies: Pick<CompanyPolicies, "customer_verification" | "compliance">;
  /** True when the tenant policy treats an outstanding balance as a blocker. */
  balanceBlocksRental?: boolean;
}

/** Derive customer readiness from authoritative signals. Pure function. */
export function deriveCustomerReadiness(
  inputs: CustomerReadinessInputs,
): CustomerReadiness {
  const { customer, rentals, documents, requirements, overrides, policies } =
    inputs;
  const reasons: CustomerReadinessReason[] = [];
  const seen = new Set<string>();
  const add = (r: CustomerReadinessReason) => {
    if (!seen.has(r.key)) {
      seen.add(r.key);
      reasons.push(r);
    }
  };

  // 1. Do Not Rent — authoritative customer-status blocker. Independent of
  //    verification mode; DNR always blocks.
  if (customer.customer_status === "do_not_rent") {
    add({
      key: "do_not_rent",
      label: "Do Not Rent flag is set",
      blocking: true,
    });
  }

  // 2. Outstanding balance — only blocks if the tenant policy enables it.
  const balance = outstandingBalanceFor(customer.id, rentals);
  if (balance > 0 && inputs.balanceBlocksRental) {
    add({
      key: "blocking_balance",
      label: `Outstanding balance of ${balance.toFixed(2)}`,
      blocking: true,
    });
  } else if (balance > 0) {
    // Informational only (tenant policy does not block on balance).
    add({
      key: "outstanding_balance",
      label: `Outstanding balance of ${balance.toFixed(2)}`,
      blocking: false,
    });
  }

  // 3. Customer compliance blockers — ONLY when verification is not off.
  //    When off, compliance requirements for customers are not materialized, so
  //    verification never blocks. When basic, requirements are informational
  //    (non-blocking). When required, configured blocking applies.
  if (!isVerificationOff(policies)) {
    const result = getEntityComplianceStatus(
      "customer",
      customer.id,
      `${customer.first_name} ${customer.last_name}`,
      requirements,
      documents,
      overrides,
    );
    for (const reason of result.blockingReasons) {
      add({
        key: `compliance_block:${reason}`,
        label: reason.replace(/_/g, " "),
        blocking: true,
      });
    }
    // Non-blocking compliance issues surface as informational attention items.
    for (const issue of result.issues.filter((i) => !i.blocking)) {
      const label = `${issue.document_type.replace(/_/g, " ")} — ${issue.reason.replace(/_/g, " ")}`;
      add({
        key: `compliance_attention:${issue.document_type}:${issue.reason}`,
        label,
        blocking: false,
      });
    }
  }

  // 4. Conflicting active rental — informational in V1 (we don't hard-block
  //    concurrent rentals; the tenant may allow it). Surfaced so staff notice.
  const hasActive = rentals.some(
    (r) =>
      r.customer_id === customer.id &&
      (r.status === "active" ||
        r.status === "late" ||
        r.status === "overdue" ||
        r.status === "payment_due" ||
        r.status === "return_pending"),
  );
  if (hasActive) {
    add({
      key: "active_rental",
      label: "Currently has an active rental",
      blocking: false,
    });
  }

  const hasBlock = reasons.some((r) => r.blocking);
  const state: CustomerReadinessState = hasBlock
    ? "blocked"
    : reasons.length > 0
      ? "needs_attention"
      : "ready";

  return {
    state,
    reasons,
    ready: state === "ready",
    blocked: state === "blocked",
    needsAttention: state === "needs_attention",
  };
}

/** Outstanding (active/late/overdue/payment_due) balance for a customer. */
export function outstandingBalanceFor(
  customerId: string,
  rentals: RentalAgreement[],
): number {
  return rentals
    .filter(
      (r) =>
        r.customer_id === customerId &&
        (r.status === "active" ||
          r.status === "late" ||
          r.status === "overdue" ||
          r.status === "payment_due"),
    )
    .reduce((s, r) => s + r.balance_due, 0);
}

/** True when a customer currently has an active/late/overdue rental. */
export function hasActiveRental(
  customerId: string,
  rentals: RentalAgreement[],
): boolean {
  return rentals.some(
    (r) =>
      r.customer_id === customerId &&
      (r.status === "active" ||
        r.status === "late" ||
        r.status === "overdue" ||
        r.status === "payment_due" ||
        r.status === "return_pending"),
  );
}

/** True when a customer has at least one completed rental in their history. */
export function hasRentalHistory(
  customerId: string,
  rentals: RentalAgreement[],
): boolean {
  return rentals.some(
    (r) => r.customer_id === customerId && r.status === "completed",
  );
}

/** Resolve readiness for all customers in the store, keyed by customer id. */
export function deriveAllCustomerReadiness(
  store: FleetStore,
  documents: DocumentRecord[],
  requirements: ComplianceRequirement[],
  overrides: ComplianceOverride[],
  policies: Pick<CompanyPolicies, "customer_verification" | "compliance">,
  opts?: { balanceBlocksRental?: boolean },
): Record<string, CustomerReadiness> {
  const map: Record<string, CustomerReadiness> = {};
  for (const c of store.customers) {
    map[c.id] = deriveCustomerReadiness({
      customer: c,
      rentals: store.rentals,
      documents,
      requirements,
      overrides,
      policies,
      balanceBlocksRental: opts?.balanceBlocksRental ?? false,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Lifecycle + standing presentation (spec §4)
// ---------------------------------------------------------------------------

export type CustomerLifecycle =
  "prospect" | "current_renter" | "previous_renter";

export const LIFECYCLE_LABELS: Record<CustomerLifecycle, string> = {
  prospect: "Prospect",
  current_renter: "Current Renter",
  previous_renter: "Previous Renter",
};

/** Derive a customer's lifecycle (independent of their standing/flags). */
export function deriveLifecycle(
  customerId: string,
  rentals: RentalAgreement[],
): CustomerLifecycle {
  if (hasActiveRental(customerId, rentals)) return "current_renter";
  if (hasRentalHistory(customerId, rentals)) return "previous_renter";
  return "prospect";
}

/** Standing flags derived from the authoritative customer_status field. */
export function standingFlags(
  status: Customer["customer_status"],
): (
  "good_standing" | "pending_verification" | "watchlist" | "do_not_rent" | "vip"
)[] {
  const flags: (
    | "good_standing"
    | "pending_verification"
    | "watchlist"
    | "do_not_rent"
    | "vip"
  )[] = [];
  if (status === "do_not_rent") flags.push("do_not_rent");
  else if (status === "watchlist") flags.push("watchlist");
  else if (status === "pending_verification")
    flags.push("pending_verification");
  else if (status === "vip") flags.push("vip");
  else flags.push("good_standing");
  return flags;
}
