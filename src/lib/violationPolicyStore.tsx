// Connect Pro Fleet — Violation policy store (Build #25).
//
// Owns the ViolationPolicy state + update methods. Exposes a
// `useViolationPolicy()` hook. Kept as a small standalone context (mirrors
// the company policy store pattern) so the violation store can read policy
// without threading props.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ViolationPolicy } from "./violationPolicyTypes";
import { defaultViolationPolicy } from "./violationPolicyTypes";

export interface ViolationPolicyMethods {
  violationPolicy: ViolationPolicy;
  updateViolationPolicy: (patch: Partial<ViolationPolicy>) => void;
}

const ViolationPolicyContext = createContext<ViolationPolicyMethods | null>(
  null,
);

export function ViolationPolicyProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<ViolationPolicy>(defaultViolationPolicy);

  const methods = useMemo<ViolationPolicyMethods>(
    () => ({
      violationPolicy: policy,
      updateViolationPolicy: (patch) => setPolicy((p) => ({ ...p, ...patch })),
    }),
    [policy],
  );

  return (
    <ViolationPolicyContext.Provider value={methods}>
      {children}
    </ViolationPolicyContext.Provider>
  );
}

export function useViolationPolicy(): ViolationPolicyMethods {
  const ctx = useContext(ViolationPolicyContext);
  if (!ctx)
    throw new Error(
      "useViolationPolicy must be used within ViolationPolicyProvider",
    );
  return ctx;
}
