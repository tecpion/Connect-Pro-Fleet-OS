// Connect Pro Fleet — Verification attention selector (V1).
//
// Surfaces ONLY actionable REQUIRED verification issues into Action Center.
// Optional unrun checks NEVER create noisy attention items unless staff
// explicitly required them. This is NOT a second task queue — it feeds the same
// prioritized Action Center surface.
//
// High priority:
//  - required identity/license verification failed
//  - required verification mismatch
//  - expired required driver's license near checkout
// Medium priority:
//  - required verification pending near checkout
//  - required MVR needs review
//  - required screening expired
//
// All records are org-scoped by construction (store holds only org-scoped seed
// data; backend RLS enforces this later).

import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationServicesPolicy,
  VerificationType,
} from "./verificationTypes";
import {
  resolveVerificationRequirements,
  doesResolvedRequirementBlock,
} from "./verificationSelectors";
import type { Customer, RentalAgreement } from "./types";

export interface VerificationAttentionItem {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  rental_id: string | null;
  rental_number: string | null;
  verification_type: VerificationType;
  /** "high" | "medium" — never low (low items don't surface). */
  priority: "high" | "medium";
  reason: string;
  /** Deep link into the rental / customer / booking request. */
  deep_link: string;
}

interface StoreLike {
  customers: Customer[];
  rentals: RentalAgreement[];
}

function customerName(
  store: StoreLike,
  customerId: string | null,
): string | null {
  if (!customerId) return null;
  const c = store.customers.find((x) => x.id === customerId);
  return c ? `${c.first_name} ${c.last_name}` : null;
}

function rentalNumber(
  store: StoreLike,
  rentalId: string | null,
): string | null {
  if (!rentalId) return null;
  const r = store.rentals.find((x) => x.id === rentalId);
  return r?.agreement_number ?? null;
}

const TYPE_LABELS: Record<VerificationType, string> = {
  identity: "identity verification",
  drivers_license: "license verification",
  insurance: "insurance verification",
  mvr: "MVR check",
  background: "background screening",
};

/** Select actionable REQUIRED verification attention items. Only required +
 *  unsatisfied + not-overridden checks surface. Optional unrun checks are
 *  ignored. Resolved/dismissed/overridden items do not appear. */
export function selectVerificationAttention(args: {
  store: StoreLike;
  policies: VerificationServicesPolicy | null | undefined;
  requirements: VerificationRequirement[];
  requests: VerificationRequest[];
  overrides: VerificationOverride[];
  /** Rentals to evaluate (typically active + ready-for-checkout). If omitted,
   *  all rentals in the store are evaluated. */
  rentalIds?: string[];
  now?: Date;
}): VerificationAttentionItem[] {
  const {
    store,
    policies,
    requirements,
    requests,
    overrides,
    now = new Date(),
  } = args;
  const items: VerificationAttentionItem[] = [];
  const rentalIds = args.rentalIds ?? store.rentals.map((r) => r.id);

  for (const rentalId of rentalIds) {
    const rental = store.rentals.find((r) => r.id === rentalId);
    if (!rental) continue;
    const resolved = resolveVerificationRequirements({
      policies,
      requirements,
      requests,
      overrides,
      ctx: {
        customer_id: rental.customer_id,
        rental_id: rentalId,
      },
      now,
    });
    for (const r of resolved) {
      if (!doesResolvedRequirementBlock(r, now)) continue;
      const latest = r.latest_request;
      const label = TYPE_LABELS[r.verification_type];
      const custName = customerName(store, rental.customer_id);
      const rnum = rentalNumber(store, rentalId);
      // Priority: failed/mismatch = high; pending/needs_review/expired = medium
      // (near-checkout). Expired driver's license near checkout = high.
      let priority: "high" | "medium" = "medium";
      let reason = `Required ${label} pending`;
      if (latest) {
        if (latest.status === "failed") {
          priority = "high";
          reason = `Required ${label} failed`;
          if (latest.result?.flags.includes("document_mismatch")) {
            reason = `Required ${label} mismatch`;
          }
        } else if (latest.status === "needs_review") {
          priority = "medium";
          reason = `Required ${label} needs review`;
        } else if (latest.status === "expired") {
          priority =
            r.verification_type === "drivers_license" ? "high" : "medium";
          reason = `Required ${label} expired`;
        } else if (latest.status === "provider_error") {
          priority = "medium";
          reason = `Required ${label} provider error`;
        } else if (latest.status === "pending") {
          priority = "medium";
          reason = `Required ${label} pending`;
        }
      }
      const who = custName ? ` — ${custName}` : "";
      const rn = rnum ? ` (${rnum})` : "";
      items.push({
        id: `verification:${rentalId}:${r.verification_type}`,
        customer_id: rental.customer_id,
        customer_name: custName,
        rental_id: rentalId,
        rental_number: rnum,
        verification_type: r.verification_type,
        priority,
        reason: `${reason}${who}${rn}`,
        deep_link: `/rentals/${rentalId}`,
      });
    }
  }
  return items.sort(
    (a, b) =>
      (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1),
  );
}
