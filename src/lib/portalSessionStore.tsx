// Connect Pro Fleet — Customer Portal session store (Build #32).
//
// Development-mode portal authentication boundary. Production portal auth
// (magic link / SMS OTP / email OTP) belongs to Build #22 / a qualified
// developer. This store SIMULATES an authenticated customer context safely:
// it NEVER stores a password and is explicitly labeled development_mode. A
// portal session can only access the customer + tenant it was minted for.
// Access always goes through this session/context abstraction — never raw
// URL customer IDs alone.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uid } from "./store/ids";
import { TENANT_ID } from "./store/ids";
import type { PortalSession, PortalVerificationMode } from "./portalTypes";

interface PortalSessionState {
  session: PortalSession | null;
  startSession: (input: {
    customer_id: string;
    tenant_id: string;
    verification_mode?: PortalVerificationMode;
  }) => PortalSession;
  endSession: () => void;
  /** Validate that a session is active AND scoped to the given customer +
   *  tenant. Returns false for inactive, expired, cross-customer, or
   *  cross-tenant access. */
  canAccess: (tenantId: string, customerId: string) => boolean;
}

const PortalSessionContext = createContext<PortalSessionState | null>(null);

function isExpired(session: PortalSession | null, now: Date): boolean {
  if (!session) return true;
  if (!session.expires_at) return false;
  const exp = new Date(session.expires_at);
  return isNaN(exp.getTime()) ? false : exp.getTime() < now.getTime();
}

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);

  const startSession = useCallback(
    (input: {
      customer_id: string;
      tenant_id: string;
      verification_mode?: PortalVerificationMode;
    }): PortalSession => {
      const now = new Date();
      const s: PortalSession = {
        customer_id: input.customer_id,
        tenant_id: input.tenant_id,
        active: true,
        authenticated_at: now.toISOString(),
        expires_at: null, // dev sessions do not expire by default
        verification_mode: input.verification_mode ?? "development",
        development_mode: true,
      };
      setSession(s);
      return s;
    },
    [],
  );

  const endSession = useCallback(() => setSession(null), []);

  const canAccess = useCallback(
    (tenantId: string, customerId: string): boolean => {
      if (!session || !session.active) return false;
      if (isExpired(session, new Date())) return false;
      return (
        session.tenant_id === tenantId && session.customer_id === customerId
      );
    },
    [session],
  );

  const value = useMemo<PortalSessionState>(
    () => ({ session, startSession, endSession, canAccess }),
    [session, startSession, endSession, canAccess],
  );

  return (
    <PortalSessionContext.Provider value={value}>
      {children}
    </PortalSessionContext.Provider>
  );
}

export function usePortalSession(): PortalSessionState {
  const ctx = useContext(PortalSessionContext);
  if (!ctx)
    throw new Error(
      "usePortalSession must be used within PortalSessionProvider",
    );
  return ctx;
}

/** Throw a portal access-denied error when a session cannot access the
 *  requested customer. Used by selectors to enforce the boundary. */
export function assertPortalAccess(
  session: PortalSession | null,
  tenantId: string,
  customerId: string,
): void {
  if (!session || !session.active) {
    throw new Error("Portal access denied: no active session");
  }
  if (session.tenant_id !== tenantId || session.customer_id !== customerId) {
    throw new Error("Portal access denied: cross-customer or cross-tenant");
  }
}

/** Generate a stable portal request number. */
let portalReqSeq = 500;
export function nextPortalRequestNumber(): string {
  portalReqSeq += 1;
  return `PR-${portalReqSeq}`;
}

/** A second tenant id used to verify tenant isolation in tests. */
export const OTHER_TENANT_ID = "tnt_other";

/** Create a bare PortalSession (for tests / non-React callers). */
export function createPortalSession(
  customerId: string,
  tenantId: string = TENANT_ID,
  mode: PortalVerificationMode = "development",
): PortalSession {
  return {
    customer_id: customerId,
    tenant_id: tenantId,
    active: true,
    authenticated_at: new Date().toISOString(),
    expires_at: null,
    verification_mode: mode,
    development_mode: true,
  };
}

export { uid };
