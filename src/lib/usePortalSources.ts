// Connect Pro Fleet — Portal sources hook (Build #32).
//
// Assembles the PortalSources bundle from the real providers (StoreProvider,
// BillingProvider, ComplianceProvider, PortalRequestProvider) so the portal
// composer runs against genuine seeded data. Memoizes the composed view.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/billingStore";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { usePortalRequests } from "@/lib/portalRequestStore";
import { buildCustomerPortal } from "@/lib/portalComposer";
import type { PortalSession, CustomerPortalView } from "@/lib/portalTypes";

/** Compose the full customer portal view from all providers. */
export function usePortalView(
  session: PortalSession | null,
  now?: Date,
): CustomerPortalView | null {
  const store = useStore();
  const billing = useBilling();
  const compliance = useCompliance();
  const { requests } = usePortalRequests();

  return useMemo(() => {
    if (!session) return null;
    try {
      return buildCustomerPortal(
        session,
        { store, billing, compliance, requests },
        now ?? new Date(),
      );
    } catch {
      return null;
    }
  }, [store, billing, compliance, requests, session, now]);
}

/** Resolve the default seeded customer for the portal (first active renter). */
export function useDefaultPortalCustomerId(): string | null {
  const store = useStore();
  return useMemo(() => {
    const activeRenter = store.customers.find(
      (c) => c.customer_status === "active_renter",
    );
    return activeRenter?.id ?? store.customers[0]?.id ?? null;
  }, [store.customers]);
}
