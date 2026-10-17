// Customer Portal Lite — server-only helpers.
//
// The browser NEVER supplies a customer_id. A renter's portal identity is a real
// auth.users row linked to exactly one Fleet customer + organization through
// customer_auth_links. resolvePortalIdentity() resolves the authenticated user
// to that (org, customer) pair through the RLS-scoped resolver; every read/write
// in the portal flows through it.
//
// Email magic-link/OTP is the beta login method on top of this PERMANENT
// identity; the resolver is identity -> (org, customer), so password login can
// be added later without rebuilding the authorization architecture.

export interface PortalIdentity {
  organization_id: string;
  customer_id: string;
  email: string;
}

export interface PortalRequestRow {
  id: string;
  organization_id: string;
  customer_id: string;
  rental_id: string | null;
  request_number: string;
  request_type: string;
  status: string;
  subject: string;
  customer_note: string | null;
  staff_response: string | null;
  current_scheduled_end: string | null;
  requested_new_end: string | null;
  estimated_extension_charge: number | null;
  exchange_reason: string | null;
  exchange_issue_description: string | null;
  exchange_preferred_timing: string | null;
  requested_return_date: string | null;
  requested_return_location: string | null;
  assigned_staff_id: string | null;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  resolved_at: string | null;
}

import type { SupabaseClient } from "@supabase/supabase-js";

// The resolver touches tables/RPCs (customer_auth_links, portal_requests,
// resolve_customer_portal_auth, next_portal_request_number) that exist in the
// live Cloud DB but are not in the local `Database` aggregate type (which is a
// hand-maintained subset). Use an untyped SupabaseClient so a
// SupabaseClient<Database> from the auth middleware is assignable and the
// untyped .from()/.rpc() path resolves without `never` collapsing.
type Db = SupabaseClient;

/** Resolve the authenticated user to their linked (org, customer). Server-side,
 *  RLS-backed. Returns null when the user has no portal link (e.g. a staff-only
 *  user) so the portal can show its "no active rental" / unauthorized state. */
export async function resolvePortalIdentity(
  supabase: Db,
  userId: string,
): Promise<PortalIdentity | null> {
  const { data, error } = await supabase.rpc("resolve_customer_portal_auth", {
    p_user_id: userId,
  });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as {
    organization_id: string;
    customer_id: string;
    email: string;
  } | null;
  if (!row?.organization_id || !row?.customer_id) return null;
  return {
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    email: row.email,
  };
}

/** Mint a portal auth link for a customer: the staff action that grants a renter
 *  portal access. Idempotent on (customer_id, user_id). The caller MUST be an
 *  active member of the customer's organization — enforced by RLS. */
export async function provisionPortalAccess(
  supabase: Db,
  input: {
    customerId: string;
    organizationId: string;
    email: string;
    userId: string;
  },
): Promise<PortalIdentity | null> {
  const { data, error } = await supabase
    .from("customer_auth_links")
    .upsert(
      {
        user_id: input.userId,
        organization_id: input.organizationId,
        customer_id: input.customerId,
        email: input.email,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "customer_id" },
    )
    .select("organization_id, customer_id, email")
    .maybeSingle();
  if (error || !data) return null;
  return {
    organization_id: data.organization_id,
    customer_id: data.customer_id,
    email: data.email,
  };
}

/** Insert one portal request. The (org, customer) come from the resolved
 *  identity, NEVER the browser. Idempotent on (org, request_number). */
export async function createPortalRequestRow(
  supabase: Db,
  identity: PortalIdentity,
  input: {
    rental_id: string | null;
    request_type: string;
    subject: string;
    customer_note: string | null;
    current_scheduled_end?: string | null;
    requested_new_end?: string | null;
    estimated_extension_charge?: number | null;
    exchange_reason?: string | null;
    exchange_issue_description?: string | null;
    exchange_preferred_timing?: string | null;
    requested_return_date?: string | null;
    requested_return_location?: string | null;
  },
): Promise<PortalRequestRow | null> {
  const { data: numberRow } = await supabase.rpc("next_portal_request_number", {
    p_org_id: identity.organization_id,
  });
  const request_number = (numberRow as string) ?? `PR-${Date.now()}`;
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    organization_id: identity.organization_id,
    customer_id: identity.customer_id,
    rental_id: input.rental_id,
    request_number,
    request_type: input.request_type,
    status: "submitted",
    subject: input.subject,
    customer_note: input.customer_note,
    current_scheduled_end: input.current_scheduled_end ?? null,
    requested_new_end: input.requested_new_end ?? null,
    estimated_extension_charge: input.estimated_extension_charge ?? null,
    exchange_reason: input.exchange_reason ?? null,
    exchange_issue_description: input.exchange_issue_description ?? null,
    exchange_preferred_timing: input.exchange_preferred_timing ?? null,
    requested_return_date: input.requested_return_date ?? null,
    requested_return_location: input.requested_return_location ?? null,
    created_at: now,
    updated_at: now,
    last_activity_at: now,
  };
  const { data, error } = await supabase
    .from("portal_requests")
    .insert(payload)
    .select("*")
    .maybeSingle();
  if (error) {
    // On a unique-number collision, read it back (idempotent).
    const { data: existing } = await supabase
      .from("portal_requests")
      .select("*")
      .eq("organization_id", identity.organization_id)
      .eq("request_number", request_number)
      .maybeSingle();
    return (existing as PortalRequestRow) ?? null;
  }
  return data as PortalRequestRow | null;
}

/** List the resolved renter's own requests only. RLS also scopes to the link,
 *  so a cross-customer/cross-tenant fetch returns nothing. */
export async function listPortalRequests(
  supabase: Db,
  identity: PortalIdentity,
): Promise<PortalRequestRow[]> {
  const { data } = await supabase
    .from("portal_requests")
    .select("*")
    .eq("organization_id", identity.organization_id)
    .eq("customer_id", identity.customer_id)
    .order("last_activity_at", { ascending: false });
  return (data as PortalRequestRow[]) ?? [];
}
