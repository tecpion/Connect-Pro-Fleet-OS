// Connect Pro Fleet — Custom Menu Links repository adapter (Supabase).
//
// Concrete repository backed by the typed Supabase client. Delegates to the
// custom menu link mappers and normalizes errors. Used only when Supabase is
// configured; in memory mode the factory returns null. No component/page
// calls .from(table) directly — every query is scoped by organization_id and
// relies on RLS (is_org_member) as the final authority.

import type {
  CustomMenuLink,
  CustomMenuLinkCreateInput,
  CustomMenuLinkUpdateInput,
} from "../customMenuLinkTypes";
import {
  rowToCustomMenuLink,
  customMenuLinkToInsert,
  customMenuLinkToUpdate,
} from "./customMenuLinkMappers";
import type {
  CustomMenuLinkInsert,
  CustomMenuLinkRow,
  CustomMenuLinkUpdate,
} from "./dbTypesCustomMenuLinks";
import { normalizeError } from "./repository";
import type { getSupabase } from "./client";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

export interface CustomMenuLinkRepository {
  list(orgId: string): Promise<CustomMenuLink[]>;
  get(orgId: string, id: string): Promise<CustomMenuLink | null>;
  insert(
    orgId: string,
    input: CustomMenuLinkCreateInput,
  ): Promise<CustomMenuLink>;
  update(
    orgId: string,
    id: string,
    patch: CustomMenuLinkUpdateInput,
  ): Promise<CustomMenuLink>;
  delete(orgId: string, id: string): Promise<void>;
}

export class SupabaseCustomMenuLinkRepository implements CustomMenuLinkRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<CustomMenuLink[]> {
    const { data, error } = await this.db
      .from("custom_menu_links")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToCustomMenuLink);
  }

  async get(orgId: string, id: string): Promise<CustomMenuLink | null> {
    const { data, error } = await this.db
      .from("custom_menu_links")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToCustomMenuLink(data as CustomMenuLinkRow) : null;
  }

  async insert(
    orgId: string,
    input: CustomMenuLinkCreateInput,
  ): Promise<CustomMenuLink> {
    const row: CustomMenuLinkInsert = customMenuLinkToInsert(orgId, input);
    const res = await (
      this.db.from("custom_menu_links") as unknown as {
        insert: (r: CustomMenuLinkInsert) => {
          select: () => {
            single: () => Promise<{
              data: CustomMenuLinkRow | null;
              error: unknown;
            }>;
          };
        };
      }
    )
      .insert(row)
      .select()
      .single();
    if (res.error) throw normalizeError(res.error);
    return rowToCustomMenuLink(res.data as CustomMenuLinkRow);
  }

  async update(
    orgId: string,
    id: string,
    patch: CustomMenuLinkUpdateInput,
  ): Promise<CustomMenuLink> {
    const updateRow: CustomMenuLinkUpdate = customMenuLinkToUpdate(patch);
    const res = await (
      this.db.from("custom_menu_links") as unknown as {
        update: (r: CustomMenuLinkUpdate) => {
          eq: (
            col: string,
            val: string,
          ) => {
            eq: (
              col: string,
              val: string,
            ) => {
              select: () => {
                single: () => Promise<{
                  data: CustomMenuLinkRow | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      }
    )
      .update(updateRow)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw normalizeError(res.error);
    return rowToCustomMenuLink(res.data as CustomMenuLinkRow);
  }

  async delete(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("custom_menu_links")
      .delete()
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }
}
