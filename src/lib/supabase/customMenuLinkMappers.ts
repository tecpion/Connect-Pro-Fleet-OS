// Connect Pro Fleet — Custom Menu Links row ↔ domain mappers.
//
// Maps between CustomMenuLinkRow (dbTypesCustomMenuLinks) and the
// CustomMenuLink domain object (customMenuLinkTypes). Preserves IDs,
// organization ownership, timestamps, nullable fields, and visibility arrays.

import type {
  CustomMenuLink,
  CustomMenuLinkCreateInput,
  CustomMenuLinkOpenMode,
  CustomMenuLinkVisibility,
  CustomMenuLinkUpdateInput,
} from "../customMenuLinkTypes";
import type {
  CustomMenuLinkInsert,
  CustomMenuLinkRow,
  CustomMenuLinkUpdate,
} from "./dbTypesCustomMenuLinks";

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function toOpenMode(v: string): CustomMenuLinkOpenMode {
  return v === "embedded" ? "embedded" : "new_tab";
}

function toVisibility(v: string): CustomMenuLinkVisibility {
  if (v === "selected_roles") return "selected_roles";
  if (v === "selected_users") return "selected_users";
  return "all_staff";
}

export function rowToCustomMenuLink(r: CustomMenuLinkRow): CustomMenuLink {
  return {
    id: r.id,
    organization_id: r.organization_id,
    name: r.name,
    url: r.url,
    icon: r.icon,
    description: r.description,
    open_mode: toOpenMode(r.open_mode),
    sort_order: r.sort_order,
    is_enabled: r.is_enabled,
    visibility: toVisibility(r.visibility),
    visible_role_ids: toStringArray(r.visible_role_ids),
    visible_user_ids: toStringArray(r.visible_user_ids),
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function customMenuLinkToInsert(
  orgId: string,
  input: CustomMenuLinkCreateInput,
): CustomMenuLinkInsert {
  return {
    organization_id: orgId,
    name: input.name,
    url: input.url,
    icon: input.icon ?? null,
    description: input.description ?? null,
    open_mode: input.open_mode ?? "new_tab",
    sort_order: input.sort_order ?? 0,
    is_enabled: input.is_enabled ?? true,
    visibility: input.visibility ?? "all_staff",
    visible_role_ids: input.visible_role_ids ?? [],
    visible_user_ids: input.visible_user_ids ?? [],
    created_by: input.created_by ?? null,
  };
}

export function customMenuLinkToUpdate(
  patch: CustomMenuLinkUpdateInput,
): CustomMenuLinkUpdate {
  const row: CustomMenuLinkUpdate = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.open_mode !== undefined) row.open_mode = patch.open_mode;
  if (patch.sort_order !== undefined) row.sort_order = patch.sort_order;
  if (patch.is_enabled !== undefined) row.is_enabled = patch.is_enabled;
  if (patch.visibility !== undefined) row.visibility = patch.visibility;
  if (patch.visible_role_ids !== undefined)
    row.visible_role_ids = patch.visible_role_ids;
  if (patch.visible_user_ids !== undefined)
    row.visible_user_ids = patch.visible_user_ids;
  return row;
}
