// Connect Pro Fleet — Custom Menu Links domain types.
//
// A CustomMenuLink is a tenant-scoped external tool link that appears under
// "My Tools" in the Fleet OS sidebar. Each organization can create its own
// links (GPS Tracker, Insurance Portal, QuickBooks, Stripe, etc.) with
// visibility controls (all staff / selected roles / selected users) and safe
// open modes (new tab or embedded iframe with fallback for X-Frame-Options /
// CSP blocking). This feature is for navigation/access only — it never stores
// passwords, API keys, or third-party credentials.

export type CustomMenuLinkOpenMode = "new_tab" | "embedded";

export type CustomMenuLinkVisibility =
  "all_staff" | "selected_roles" | "selected_users";

export interface CustomMenuLink {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  /** Optional lucide icon name (e.g. "Satellite", "Wallet"). */
  icon: string | null;
  description: string | null;
  open_mode: CustomMenuLinkOpenMode;
  sort_order: number;
  is_enabled: boolean;
  visibility: CustomMenuLinkVisibility;
  /** Role IDs that can see this link when visibility = "selected_roles". */
  visible_role_ids: string[];
  /** User IDs that can see this link when visibility = "selected_users". */
  visible_user_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomMenuLinkCreateInput {
  name: string;
  url: string;
  icon?: string | null;
  description?: string | null;
  open_mode?: CustomMenuLinkOpenMode;
  sort_order?: number;
  is_enabled?: boolean;
  visibility?: CustomMenuLinkVisibility;
  visible_role_ids?: string[];
  visible_user_ids?: string[];
  created_by?: string | null;
}

export type CustomMenuLinkUpdateInput = Partial<CustomMenuLinkCreateInput>;

// ── URL safety ───────────────────────────────────────────────────────────
// Only https:// URLs are allowed. Rejects javascript:, data:, file:, and
// other unsafe/executable protocols.

const UNSAFE_PROTOCOLS = [
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "about:",
  "blob:",
  "ftp:",
  "ws:",
  "wss:",
];

export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  for (const proto of UNSAFE_PROTOCOLS) {
    if (lower.startsWith(proto)) return false;
  }
  // Must start with https:// — the only allowed scheme.
  if (!lower.startsWith("https://")) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ── Visibility resolution ─────────────────────────────────────────────────
// A user should only see a link if:
// 1. the link belongs to their organization (enforced by RLS + org-scoped
//    hydration)
// 2. the link is enabled
// 3. their role/user matches the visibility rule

export function isLinkVisibleToUser(
  link: CustomMenuLink,
  userId: string,
  roleId: string | null,
): boolean {
  if (!link.is_enabled) return false;
  switch (link.visibility) {
    case "all_staff":
      return true;
    case "selected_roles":
      return roleId ? link.visible_role_ids.includes(roleId) : false;
    case "selected_users":
      return link.visible_user_ids.includes(userId);
    default:
      return false;
  }
}

// Resolve the icon component name for display. Falls back to a default
// external-link icon when the stored icon name is empty/invalid.
export const DEFAULT_LINK_ICON = "ExternalLink";

export function resolveIconName(icon: string | null | undefined): string {
  if (!icon || typeof icon !== "string") return DEFAULT_LINK_ICON;
  const trimmed = icon.trim();
  return trimmed || DEFAULT_LINK_ICON;
}
