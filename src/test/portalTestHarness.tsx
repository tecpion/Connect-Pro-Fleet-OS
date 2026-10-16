// Connect Pro Fleet — Build #32 Customer Portal test harness (NON-test module).
//
// Reusable harness helpers + provider wrapper shared across portal test files.
// NOT a `.test.tsx` file, so importing it never re-registers test cases.
// Assembles PortalSessionProvider + PortalRequestProvider + StoreProvider +
// BillingProvider + ComplianceProvider so portal selectors run against genuine
// seeded data.

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider, useBilling } from "@/lib/billingStore";
import {
  ComplianceProvider,
  useCompliance,
} from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import {
  PortalSessionProvider,
  usePortalSession,
} from "@/lib/portalSessionStore";
import {
  PortalRequestProvider,
  usePortalRequests,
} from "@/lib/portalRequestStore";

/** Deterministic "now" pinned to the 2026 seed timeline. */
export const NOW = new Date("2026-09-02T12:00:00Z");

/** Provider wrapper used by the portal hook + UI tests. */
export function portalWrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <CustomerNotesProvider>
            <ComplianceProvider>
              <PortalSessionProvider>
                <PortalRequestProvider>{children}</PortalRequestProvider>
              </PortalSessionProvider>
            </ComplianceProvider>
          </CustomerNotesProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Assemble the portal session + request store + main store from real providers. */
export function usePortalTestSources() {
  return renderHook(
    () => {
      const store = useStore();
      const billing = useBilling();
      const compliance = useCompliance();
      const session = usePortalSession();
      const requests = usePortalRequests();
      return { store, billing, compliance, session, requests };
    },
    { wrapper: portalWrapper },
  );
}

/** A second tenant id used to verify tenant isolation. */
export const OTHER_TENANT_ID = "tnt_other";
