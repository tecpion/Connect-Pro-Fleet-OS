// Connect Pro Fleet — company policy injection (Build #23).
//
// The main store is built inside StoreProvider. To let domain store methods
// (rentalStore.startCheckout) freeze policy snapshots at checkout without
// threading new props through every build*() method or enlarging storeState,
// we use a module-level mutable ref that CompanyPolicyProvider populates on
// mount and clears on unmount — the same pattern as integrationEmitterRef.
//
// If no provider is mounted, the ref holds the default policies so financial
// actions never fail because of policy state.

import { defaultCompanyPolicies } from "../companyPolicyDefaults";
import type { CompanyPolicies } from "../companyPolicyTypes";

let current: CompanyPolicies = defaultCompanyPolicies();

/** Called by CompanyPolicyProvider on mount/Update with the live policies. */
export function setCompanyPoliciesRef(policies: CompanyPolicies) {
  current = policies;
}

/** Called by CompanyPolicyProvider on unmount to restore defaults. */
export function clearCompanyPoliciesRef() {
  current = defaultCompanyPolicies();
}

/** Read by domain store methods to freeze policy snapshots. Always returns a
 *  valid policies object (never null) — defaults when no provider is mounted. */
export function getCompanyPoliciesRef(): CompanyPolicies {
  return current;
}
