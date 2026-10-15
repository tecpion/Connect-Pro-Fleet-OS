// Connect Pro Fleet — Customer verification mode selector (Verification Optionalization).
//
// Pure helpers over CompanyPolicies.customer_verification. The verification
// MODE controls whether identity/driver verification participates at all in
// customer readiness, navigation, KPIs, filters, Action Center, Copilot, and
// checkout. It is a behaviour/presentation switch only — it NEVER deletes
// verification records, uploaded documents, or audit history. Changing the
// mode only changes what surfaces and what blocks.
//
//   off      → verification is hidden and never blocks; existing records remain.
//   basic    → verification + documents are tracked (informational); a missing
//              verification does NOT automatically block rentals or mark a
//              customer Blocked unless a separate configured compliance rule
//              (with blocks_operation) is active.
//   required → configured compliance requirements gate readiness/checkout.
//
// Compliance remains the authoritative blocker engine (see complianceStatus.ts).
// This module does NOT create a second blocker engine — it only reports the
// mode and exposes convenience predicates so UI code never hardcodes "off".

import type { CompanyPolicies } from "./companyPolicyTypes";
import type { CustomerVerificationMode } from "./companyPolicyTypes";

/** True when the tenant has verification fully disabled. */
export function isVerificationOff(
  policies: Pick<CompanyPolicies, "customer_verification">,
): boolean {
  return policies.customer_verification?.mode === "off";
}

/** True when the tenant uses Basic or Required verification (any enabled
 *  mode). Verification surfaces (nav, KPIs, filters) render only when true.
 *  When customer_verification is absent the effective mode defaults to Basic
 *  (see verificationMode), so this returns true for new/legacy tenants. */
export function isVerificationEnabled(
  policies: Pick<CompanyPolicies, "customer_verification">,
): boolean {
  const mode = verificationMode(policies);
  return mode === "basic" || mode === "required";
}

/** True only when the tenant requires verification (gates readiness/checkout). */
export function isVerificationRequired(
  policies: Pick<CompanyPolicies, "customer_verification">,
): boolean {
  return policies.customer_verification?.mode === "required";
}

export function verificationMode(
  policies: Pick<CompanyPolicies, "customer_verification">,
): CustomerVerificationMode {
  return policies.customer_verification?.mode ?? "basic";
}

export const VERIFICATION_MODE_LABELS: Record<
  CustomerVerificationMode,
  string
> = {
  off: "Off",
  basic: "Basic",
  required: "Required",
};

export const VERIFICATION_MODE_DESCRIPTIONS: Record<
  CustomerVerificationMode,
  string
> = {
  off: "Do not require or surface customer verification workflows.",
  basic:
    "Track verification and documents without automatically blocking rentals.",
  required:
    "Use configured verification requirements in customer readiness and rental checkout.",
};
