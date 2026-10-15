// Connect Pro Fleet — Company policy store (Build #23).
//
// Owns the CompanyPolicies state + update methods + audit logging. Exposes a
// `useCompanyPolicies()` hook. Domain store methods read policies via the
// module-level ref (companyPolicyRef) so they can freeze snapshots at checkout
// without threading props through every build*() module.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CompanyPolicies } from "../companyPolicyTypes";
import { defaultCompanyPolicies } from "../companyPolicyDefaults";
import { companyPolicies as seedPolicies } from "./seedCompanyPolicies";
import {
  setCompanyPoliciesRef,
  clearCompanyPoliciesRef,
} from "./companyPolicyRef";
import { uid } from "./ids";

export interface CompanyPolicyMethods {
  companyPolicies: CompanyPolicies;
  updateCompanyPolicies: (patch: Partial<CompanyPolicies>) => void;
  replaceCompanyPolicies: (next: CompanyPolicies) => void;
  applyPreset: (patch: Partial<CompanyPolicies>, label?: string) => void;
}

const CompanyPolicyContext = createContext<CompanyPolicyMethods | null>(null);

export function CompanyPolicyProvider({ children }: { children: ReactNode }) {
  const [policies, setPolicies] = useState<CompanyPolicies>(
    () => seedPolicies ?? defaultCompanyPolicies(),
  );

  const methods = useMemo<CompanyPolicyMethods>(() => {
    const update = (patch: Partial<CompanyPolicies>) =>
      setPolicies((p) => ({
        ...p,
        ...patch,
        updated_at: new Date().toISOString(),
      }));
    return {
      companyPolicies: policies,
      updateCompanyPolicies: update,
      replaceCompanyPolicies: (next) =>
        setPolicies({ ...next, updated_at: new Date().toISOString() }),
      applyPreset: (patch, _label) =>
        setPolicies((p) => ({
          ...p,
          ...patch,
          updated_at: new Date().toISOString(),
        })),
    };
  }, [policies]);

  // Keep the module-level ref in sync so domain store methods can read the
  // current policies without importing React context.
  useMemo(() => setCompanyPoliciesRef(policies), [policies]);
  // Cleanup on unmount is handled by React keeping the last set value; the ref
  // is always valid (defaults when no provider). We expose a stable clear via
  // the provider lifecycle below.
  useMemo(() => () => clearCompanyPoliciesRef(), []);

  return (
    <CompanyPolicyContext.Provider value={methods}>
      {children}
    </CompanyPolicyContext.Provider>
  );
}

export function useCompanyPolicies(): CompanyPolicyMethods {
  const ctx = useContext(CompanyPolicyContext);
  if (!ctx)
    throw new Error(
      "useCompanyPolicies must be used within CompanyPolicyProvider",
    );
  return ctx;
}

/** Build a settings audit entry shape consistent with the existing audit log. */
export function makePolicyAuditEntry(
  action: string,
  detail?: string | null,
  old_value?: string | null,
  new_value?: string | null,
) {
  return {
    id: uid("aud"),
    at: new Date().toISOString(),
    action,
    detail: detail ?? null,
    old_value: old_value ?? null,
    new_value: new_value ?? null,
  };
}
