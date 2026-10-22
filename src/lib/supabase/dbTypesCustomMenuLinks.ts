// Connect Pro Fleet — Custom Menu Links DB row types.
//
// Row types for the custom_menu_links table (Phase 10A migration
// 20261022201111). Organization-scoped with is_org_member RLS, no anon
// access. The table stores tenant-specific external tool links that appear
// under "My Tools" in the sidebar.

import type { Json } from "./dbTypesCore";

export interface CustomMenuLinkRow {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  icon: string | null;
  description: string | null;
  open_mode: string;
  sort_order: number;
  is_enabled: boolean;
  visibility: string;
  visible_role_ids: string[];
  visible_user_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomMenuLinkInsert = {
  id?: string;
  organization_id: string;
  name: string;
  url: string;
  icon?: string | null;
  description?: string | null;
  open_mode?: string;
  sort_order?: number;
  is_enabled?: boolean;
  visibility?: string;
  visible_role_ids?: string[];
  visible_user_ids?: string[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CustomMenuLinkUpdate = Partial<CustomMenuLinkInsert>;

// Re-export Json for downstream mapper ergonomics.
export type { Json };
