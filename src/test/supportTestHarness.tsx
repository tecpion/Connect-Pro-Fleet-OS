// Connect Pro Fleet — Build #31 Support Center test harness (NON-test module).
//
// Reusable harness helpers + provider wrapper shared across the Support Center
// test files. NOT a `.test.tsx` file, so importing it never re-registers test
// cases. No `describe`/`it`/`expect` live here. Mirrors the executive test
// harness pattern: assembles the SupportProvider + StoreProvider so support
// selectors run against genuine seeded data.

import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { SupportProvider, useSupport } from "@/lib/supportStore";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";

/** Deterministic "now" pinned to the 2026 seed timeline. */
export const NOW = new Date("2026-09-02T12:00:00Z");

/** Provider wrapper used by the support hook + UI tests. */
export function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <CustomerNotesProvider>
            <SupportProvider>{children}</SupportProvider>
          </CustomerNotesProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

/** Assemble the support store + main store from the real providers. */
export function useSupportTestSources() {
  return renderHook(
    () => {
      const store = useStore();
      const support = useSupport();
      return { store, support };
    },
    { wrapper },
  ).result;
}

/** A second tenant id used to verify tenant isolation. */
export const OTHER_TENANT_ID = "tnt_other";
