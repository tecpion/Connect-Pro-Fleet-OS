// Connect Pro Fleet — Phase 10B Lead repository adapter (Supabase).
//
// Concrete repository backed by the typed Supabase client. Delegates to the
// Phase 10B Lead mapper and normalizes errors. Used only when Supabase is
// configured; in memory mode the factory returns null. No component/page calls
// .from(table) directly — every query is scoped by organization_id and relies
// on RLS (is_org_member) as the final authority.

import type { Lead } from "../leadTypes";
import { rowToLead, leadToRow, leadPatchToRow } from "./phase10Mappers";
import type { LeadRow } from "./dbTypesPhase10";
import { normalizeError } from "./repository";
import { normalizePhone, normalizeEmail } from "../bookingRequestCustomerMatch";
import type { getSupabase } from "./client";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

export interface LeadRepository {
  list(orgId: string): Promise<Lead[]>;
  get(orgId: string, id: string): Promise<Lead | null>;
  insert(l: Lead): Promise<Lead>;
  update(orgId: string, id: string, patch: Partial<Lead>): Promise<Lead>;
  /** Secondary fallback matching by normalized phone/email. NEVER the primary
   *  CRM identity (that lives in external_entity_references). */
  lookupByPhoneOrEmail(
    orgId: string,
    phone: string,
    email: string,
  ): Promise<Lead[]>;
}

export class SupabaseLeadRepository implements LeadRepository {
  constructor(private db: Db) {}

  async list(orgId: string): Promise<Lead[]> {
    const { data, error } = await this.db
      .from("leads")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToLead);
  }

  async get(orgId: string, id: string): Promise<Lead | null> {
    const { data, error } = await this.db
      .from("leads")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToLead(data) : null;
  }

  async insert(l: Lead): Promise<Lead> {
    const res = await (
      this.db.from("leads") as unknown as {
        insert: (r: LeadRow) => {
          select: () => {
            single: () => Promise<{ data: LeadRow | null; error: unknown }>;
          };
        };
      }
    )
      .insert(leadToRow(l))
      .select()
      .single();
    if (res.error) throw normalizeError(res.error);
    return rowToLead(res.data as LeadRow);
  }

  async update(orgId: string, id: string, patch: Partial<Lead>): Promise<Lead> {
    const res = await (
      this.db.from("leads") as unknown as {
        update: (r: Partial<LeadRow>) => {
          eq: (
            col: string,
            val: string,
          ) => {
            eq: (
              col: string,
              val: string,
            ) => {
              select: () => {
                single: () => Promise<{ data: LeadRow | null; error: unknown }>;
              };
            };
          };
        };
      }
    )
      .update(leadPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw normalizeError(res.error);
    return rowToLead(res.data as LeadRow);
  }

  async lookupByPhoneOrEmail(
    orgId: string,
    phone: string,
    email: string,
  ): Promise<Lead[]> {
    const phoneN = normalizePhone(phone);
    const emailN = normalizeEmail(email);
    let q = this.db.from("leads").select("*").eq("organization_id", orgId);
    // OR across phone/email. PostgREST or-filter via separate conditions.
    const orParts: string[] = [];
    if (phoneN) orParts.push(`phone.eq.${phone}`);
    if (emailN) orParts.push(`email.eq.${email}`);
    if (orParts.length === 0) return [];
    q = q.or(orParts.join(","));
    const { data, error } = await q.order("created_at", {
      ascending: false,
    });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToLead);
  }
}
