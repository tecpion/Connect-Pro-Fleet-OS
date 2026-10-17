// Customer Portal Lite — client auth context.
//
// The renter's portal identity is a REAL auth.users row linked to exactly one
// Fleet customer + organization. The browser NEVER supplies customer_id; the
// resolved (org, customer) pair comes from the server via resolvePortalIdentityFn.
// Email magic-link/OTP is the beta login method on top of this permanent
// identity; password login can be added later without changing the resolver.
//
// In memory/dev mode (no Cloud config) this falls back to the existing
// development session shape so the portal stays explorable without a backend.
// In supabase mode, signInWithOtp establishes the real session and the identity
// is resolved server-side.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSupabase, getBackendMode, hasSupabaseConfig } from "./client";
import {
  resolvePortalIdentityFn,
  createPortalRequestFn,
  type PortalIdentity,
  type PortalRequestRow,
} from "@/lib/auth/portal.functions";
import { TENANT_ID } from "../store/ids";

export interface PortalAuthState {
  loading: boolean;
  identity: PortalIdentity | null;
  requests: PortalRequestRow[];
  signInWithEmailOtp: (
    email: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  submitRequest: (input: {
    rental_id: string | null;
    request_type:
      | "extension"
      | "return"
      | "exchange"
      | "document_help"
      | "billing_question"
      | "other";
    subject: string;
    customer_note?: string | null;
    current_scheduled_end?: string | null;
    requested_new_end?: string | null;
    estimated_extension_charge?: number | null;
    exchange_reason?: string | null;
    exchange_issue_description?: string | null;
    exchange_preferred_timing?: string | null;
    requested_return_date?: string | null;
    requested_return_location?: string | null;
  }) => Promise<PortalRequestRow | null>;
  backendMode: "memory" | "supabase";
}

const PortalAuthCtx = createContext<PortalAuthState | null>(null);

// Dev fallback identity (memory mode): the first seeded customer, so the portal
// stays explorable without a backend. Never used in supabase mode.
const DEV_IDENTITY: PortalIdentity = {
  organization_id: TENANT_ID,
  customer_id: "cus_1",
  email: "hannah.ortiz@connectprofleet.demo",
};

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const mode = getBackendMode();
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<PortalIdentity | null>(null);
  const [requests, setRequests] = useState<PortalRequestRow[]>([]);

  const refresh = useMemo(
    () =>
      async function refresh() {
        if (!supabase || mode === "memory") {
          setIdentity(DEV_IDENTITY);
          setLoading(false);
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user) {
          setIdentity(null);
          setRequests([]);
          setLoading(false);
          return;
        }
        try {
          const res = await resolvePortalIdentityFn();
          setIdentity(res.identity);
          setRequests(res.requests);
        } catch {
          setIdentity(null);
          setRequests([]);
        }
        setLoading(false);
      },
    [supabase, mode],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase || mode === "memory") {
        if (active) {
          setIdentity(DEV_IDENTITY);
          setLoading(false);
        }
        return;
      }
      await refresh();
      if (!active) return;
      const { data: sub } = supabase.auth.onAuthStateChange(() => {
        void refresh();
      });
      return () => sub.subscription.unsubscribe();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, mode]);

  const value = useMemo<PortalAuthState>(() => {
    async function signInWithEmailOtp(email: string) {
      if (!supabase || mode === "memory") {
        setIdentity(DEV_IDENTITY);
        return { ok: true };
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/portal` },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    async function signOut() {
      if (!supabase || mode === "memory") {
        setIdentity(null);
        return;
      }
      await supabase.auth.signOut();
      setIdentity(null);
      setRequests([]);
    }
    async function submitRequest(
      input: Parameters<PortalAuthState["submitRequest"]>[0],
    ) {
      if (!supabase || mode === "memory") {
        // Dev fallback keeps the in-memory store usable for exploration.
        const id = `pr_dev_${Date.now()}`;
        const now = new Date().toISOString();
        const row: PortalRequestRow = {
          id,
          organization_id: DEV_IDENTITY.organization_id,
          customer_id: DEV_IDENTITY.customer_id,
          rental_id: input.rental_id,
          request_number: `PR-${Math.floor(Math.random() * 9000) + 1000}`,
          request_type: input.request_type,
          status: "submitted",
          subject: input.subject,
          customer_note: input.customer_note ?? null,
          staff_response: null,
          current_scheduled_end: input.current_scheduled_end ?? null,
          requested_new_end: input.requested_new_end ?? null,
          estimated_extension_charge: input.estimated_extension_charge ?? null,
          exchange_reason: input.exchange_reason ?? null,
          exchange_issue_description: input.exchange_issue_description ?? null,
          exchange_preferred_timing: input.exchange_preferred_timing ?? null,
          requested_return_date: input.requested_return_date ?? null,
          requested_return_location: input.requested_return_location ?? null,
          assigned_staff_id: null,
          linked_task_id: null,
          created_at: now,
          updated_at: now,
          last_activity_at: now,
          resolved_at: null,
        };
        setRequests((prev) => [row, ...prev]);
        return row;
      }
      const row = await createPortalRequestFn({ data: input });
      if (row) setRequests((prev) => [row, ...prev]);
      return row;
    }
    return {
      loading,
      identity,
      requests,
      signInWithEmailOtp,
      signOut,
      refresh,
      submitRequest,
      backendMode: mode,
    };
  }, [loading, identity, requests, supabase, mode, refresh]);

  return (
    <PortalAuthCtx.Provider value={value}>{children}</PortalAuthCtx.Provider>
  );
}

export function usePortalAuth(): PortalAuthState {
  const ctx = useContext(PortalAuthCtx);
  if (!ctx)
    throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return ctx;
}

export function hasPortalConfig(): boolean {
  return hasSupabaseConfig();
}
