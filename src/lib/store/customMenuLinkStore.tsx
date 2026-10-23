// Connect Pro Fleet — Custom Menu Links store provider.
//
// Tenant-scoped external tool links that appear under "My Tools" in the
// sidebar. Hydrates from Cloud (custom_menu_links) in Supabase mode; in
// memory/demo mode starts empty (no seed data for real orgs). All CRUD goes
// through the registered repository adapter — no direct .from() calls from UI.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getBackendMode, getSupabase } from "../supabase/client";
import { useAuth } from "../supabase/authContext";
import {
  isLinkVisibleToUser,
  type CustomMenuLink,
  type CustomMenuLinkCreateInput,
  type CustomMenuLinkUpdateInput,
} from "../customMenuLinkTypes";
import type { CustomMenuLinkRepository } from "../supabase/customMenuLinkAdapters";

interface CustomMenuLinkContextValue {
  links: CustomMenuLink[];
  loading: boolean;
  visibleLinks: CustomMenuLink[];
  createLink: (input: CustomMenuLinkCreateInput) => Promise<CustomMenuLink | null>;
  updateLink: (id: string, patch: CustomMenuLinkUpdateInput) => Promise<CustomMenuLink | null>;
  deleteLink: (id: string) => Promise<boolean>;
  toggleLink: (id: string, enabled: boolean) => Promise<void>;
  reorderLink: (id: string, newOrder: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<CustomMenuLinkContextValue | null>(null);

export function useCustomMenuLinks() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCustomMenuLinks must be used within CustomMenuLinksProvider");
  return v;
}

export function CustomMenuLinksProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<CustomMenuLink[]>([]);
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();
  const orgId = session.activeOrganizationId;
  const userId = session.profile?.id ?? session.user?.id ?? "";
  const userRoleId = session.memberships?.[0]?.role_id ?? null;

  const repo = useMemo<CustomMenuLinkRepository | null>(() => {
    if (getBackendMode() !== "supabase") return null;
    const db = getSupabase();
    if (!db) return null;
    // Import the concrete adapter lazily to avoid pulling supabase into
    // memory-mode bundles unnecessarily.
    const { SupabaseCustomMenuLinkRepository } =
      require("../supabase/customMenuLinkAdapters") as typeof import("../supabase/customMenuLinkAdapters");
    return new SupabaseCustomMenuLinkRepository(db);
  }, []);

  const refresh = useMemo(
    () => async () => {
      if (!repo || !orgId) return;
      setLoading(true);
      try {
        const rows = await repo.list(orgId);
        setLinks(rows);
      } catch {
        // preserve existing state on error
      } finally {
        setLoading(false);
      }
    },
    [repo, orgId],
  );

  // Hydrate on org change; cancel stale async after switch.
  useEffect(() => {
    if (!orgId || !repo) return;
    let active = true;
    setLoading(true);
    void repo
      .list(orgId)
      .then((rows) => {
        if (active) setLinks(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId, repo]);

  const createLink = async (
    input: CustomMenuLinkCreateInput,
  ): Promise<CustomMenuLink | null> => {
    if (!repo || !orgId) return null;
    try {
      const created = await repo.insert(orgId, {
        ...input,
        created_by: userId || null,
      });
      setLinks((prev) =>
        [...prev, created].sort((a, b) => a.sort_order - b.sort_order),
      );
      return created;
    } catch {
      return null;
    }
  };

  const updateLink = async (
    id: string,
    patch: CustomMenuLinkUpdateInput,
  ): Promise<CustomMenuLink | null> => {
    if (!repo || !orgId) return null;
    try {
      const updated = await repo.update(orgId, id, patch);
      setLinks((prev) =>
        prev
          .map((l) => (l.id === id ? updated : l))
          .sort((a, b) => a.sort_order - b.sort_order),
      );
      return updated;
    } catch {
      return null;
    }
  };

  const deleteLink = async (id: string): Promise<boolean> => {
    if (!repo || !orgId) return false;
    try {
      await repo.delete(orgId, id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      return true;
    } catch {
      return false;
    }
  };

  const toggleLink = async (id: string, enabled: boolean): Promise<void> => {
    await updateLink(id, { is_enabled: enabled });
  };

  const reorderLink = async (id: string, newOrder: number): Promise<void> => {
    await updateLink(id, { sort_order: newOrder });
  };

  const visibleLinks = useMemo(
    () => links.filter((l) => isLinkVisibleToUser(l, userId, userRoleId)),
    [links, userId, userRoleId],
  );

  const value: CustomMenuLinkContextValue = {
    links,
    loading,
    visibleLinks,
    createLink,
    updateLink,
    deleteLink,
    toggleLink,
    reorderLink,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}