// Connect Pro Fleet — Portal entry / session bootstrap (Build #32).
//
// In production, this would be the magic-link / OTP landing page. In
// development mode, it auto-starts a session for the default seeded customer
// so the portal is explorable. The session is explicitly labeled
// development_mode and never stores a password.

import { useEffect } from "react";
import { usePortalSession } from "@/lib/portalSessionStore";
import { useDefaultPortalCustomerId } from "@/lib/usePortalSources";
import { useStore } from "@/lib/store";
import { TENANT_ID } from "@/lib/store/ids";
import { CustomerPortalLayout } from "@/pages/portal/CustomerPortalLayout";
import { PortalHome } from "@/pages/portal/PortalHome";
import { ShieldCheck } from "lucide-react";

export function PortalEntry() {
  const { session, startSession } = usePortalSession();
  const defaultCustomerId = useDefaultPortalCustomerId();
  const store = useStore();

  // Auto-start a development session if none exists.
  useEffect(() => {
    if (!session && defaultCustomerId) {
      startSession({
        customer_id: defaultCustomerId,
        tenant_id: TENANT_ID,
        verification_mode: "development",
      });
    }
  }, [session, defaultCustomerId, startSession]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Starting your session…</p>
      </div>
    );
  }

  const customer = store.customers.find((c) => c.id === session.customer_id);
  const companyName =
    store.companyInfo.dba ||
    store.companyInfo.legal_name ||
    "Connect Pro Fleet";

  if (!customer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
      </div>
    );
  }

  // If the session is active, render the portal home directly.
  return (
    <CustomerPortalLayout
      companyName={companyName}
      customerName={`${customer.first_name} ${customer.last_name}`}
    >
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent/30 px-3 py-2">
        <ShieldCheck size={14} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Development mode — production authentication will be connected during
          setup.
        </span>
      </div>
      <PortalHome />
    </CustomerPortalLayout>
  );
}

/** A wrapper that renders portal children inside the layout, used by nested
 *  portal routes so they all share the same shell. */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session } = usePortalSession();
  const store = useStore();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Starting your session…</p>
      </div>
    );
  }

  const customer = store.customers.find((c) => c.id === session.customer_id);
  const companyName =
    store.companyInfo.dba ||
    store.companyInfo.legal_name ||
    "Connect Pro Fleet";

  if (!customer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
      </div>
    );
  }

  return (
    <CustomerPortalLayout
      companyName={companyName}
      customerName={`${customer.first_name} ${customer.last_name}`}
    >
      {children}
    </CustomerPortalLayout>
  );
}
