// Connect Pro Fleet — AuthProvider + session context (Build #22).
//
// Exposes session, user, profile, memberships, activeOrganization, loading,
// signIn, signOut. Pages consume `useAuth()` rather than querying auth
// independently. In memory mode (no Supabase config) it exposes a deterministic
// demo session so the existing app keeps working in dev/test without auth.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "./supabaseClientShim";
import type { Database } from "./database.types";
import { getSupabase, getBackendMode, hasSupabaseConfig } from "./client";

export interface AuthProfile {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
}

export interface AuthMembership {
  organization_id: string;
  organization_name: string;
  role_code: string;
  role_id: string | null;
  status: string;
}

export interface AuthSession {
  user: { id: string; email: string } | null;
  profile: AuthProfile | null;
  memberships: AuthMembership[];
  activeOrganizationId: string | null;
}

export interface AuthContextValue {
  session: AuthSession;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  setActiveOrganization: (orgId: string) => void;
  backendMode: "memory" | "supabase";
  configError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_SESSION: AuthSession = {
  user: { id: "demo-owner", email: "owner@connectprofleet.demo" },
  profile: {
    id: "demo-owner",
    first_name: "Ava",
    last_name: "Reyes",
    display_name: "Ava Reyes",
    email: "owner@connectprofleet.demo",
  },
  memberships: [
    {
      organization_id: "tnt_connectpro",
      organization_name: "Connect Pro Fleet Demo",
      role_code: "owner",
      role_id: null,
      status: "active",
    },
  ],
  activeOrganizationId: "tnt_connectpro",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const mode = getBackendMode();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount.
  useEffect(() => {
    let active = true;
    async function restore() {
      if (!supabase || mode === "memory") {
        // Memory mode: deterministic demo session keeps existing app working.
        if (active) {
          setSession(DEMO_SESSION);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        await loadProfile(
          supabase,
          data.session.user.id,
          data.session.user.email ?? "",
          setSession,
        );
      } else {
        setSession({
          user: null,
          profile: null,
          memberships: [],
          activeOrganizationId: null,
        });
      }
      setLoading(false);
    }
    restore();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to auth changes (sign in/out) in supabase mode.
  useEffect(() => {
    if (!supabase || mode === "memory") return;
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, sbSession) => {
        if (sbSession) {
          await loadProfile(
            supabase,
            sbSession.user.id,
            sbSession.user.email ?? "",
            setSession,
          );
        } else {
          setSession({
            user: null,
            profile: null,
            memberships: [],
            activeOrganizationId: null,
          });
        }
      },
    );
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, mode]);

  const value = useMemo<AuthContextValue>(() => {
    async function signIn(email: string, password: string) {
      if (!supabase || mode === "memory") {
        setSession(DEMO_SESSION);
        return { ok: true };
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { ok: false, error: error.message };
      if (data.user) {
        await loadProfile(
          supabase,
          data.user.id,
          data.user.email ?? email,
          setSession,
        );
      }
      return { ok: true };
    }
    async function signOut() {
      if (!supabase || mode === "memory") {
        setSession({
          user: null,
          profile: null,
          memberships: [],
          activeOrganizationId: null,
        });
        return;
      }
      await supabase.auth.signOut();
      setSession({
        user: null,
        profile: null,
        memberships: [],
        activeOrganizationId: null,
      });
    }
    function setActiveOrganization(orgId: string) {
      setSession((s) => (s ? { ...s, activeOrganizationId: orgId } : s));
    }
    const configError =
      mode === "supabase" && !hasSupabaseConfig()
        ? "Supabase backend mode is enabled but configuration is missing."
        : null;
    return {
      session: session ?? {
        user: null,
        profile: null,
        memberships: [],
        activeOrganizationId: null,
      },
      loading,
      signIn,
      signOut,
      setActiveOrganization,
      backendMode: mode,
      configError,
    };
  }, [session, loading, supabase, mode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function loadProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string,
  setSession: (s: AuthSession) => void,
) {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  const profile = (profileRow ?? null) as {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    email: string;
  } | null;
  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("organization_id, role_id, status")
    .eq("user_id", userId)
    .eq("status", "active");
  const orgIds = (memberships ?? []).map((m) => m.organization_id);
  let orgNames: Record<string, string> = {};
  if (orgIds.length) {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    orgNames = Object.fromEntries((orgs ?? []).map((o) => [o.id, o.name]));
  }
  let roles: { id: string; code: string }[] = [];
  if (orgIds.length) {
    const { data: roleRows } = await supabase
      .from("roles")
      .select("id, code")
      .in("organization_id", orgIds);
    roles = (roleRows ?? []) as { id: string; code: string }[];
  }
  const roleCode = (rid: string | null) =>
    roles.find((r) => r.id === rid)?.code ?? "user";
  const memList: AuthMembership[] = (memberships ?? []).map((m) => ({
    organization_id: m.organization_id,
    organization_name: orgNames[m.organization_id] ?? "Organization",
    role_code: roleCode(m.role_id),
    role_id: m.role_id,
    status: m.status,
  }));
  setSession({
    user: { id: userId, email },
    profile: profile
      ? {
          id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          display_name: profile.display_name,
          email: profile.email,
        }
      : {
          id: userId,
          first_name: "",
          last_name: "",
          display_name: email,
          email,
        },
    memberships: memList,
    activeOrganizationId: memList[0]?.organization_id ?? null,
  });
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
