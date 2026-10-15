// Phase 1 — production auth server functions.
//
// provisionAccount: called from the client after a successful signup (or first
// login for an existing user with no org). Runs the idempotent
// public.provision_account() RPC as the signed-in caller so the new rows are
// created under RLS. Returns the resulting organization_id + role_id so the
// client can refresh the session profile/memberships.
//
// This is a thin wrapper around the RPC; all logic lives in the database
// function (supabase/migrations/...phase_1...). Keep this file free of runtime
// helpers so the server-fn splitter does not drop siblings.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ProvisionResult {
  ok: boolean;
  organizationId: string | null;
  roleId: string | null;
  createdOrg: boolean;
  error?: string;
}

export const provisionAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        orgName: z.string().min(1).max(120).optional(),
        firstName: z.string().max(80).optional(),
        lastName: z.string().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ProvisionResult> => {
    const { supabase, userId, claims } = context;
    const email = claims.email ?? "";
    const { data: rpc, error } = await supabase.rpc("provision_account", {
      p_user_id: userId,
      p_email: email,
      p_org_name: data.orgName ?? null,
      p_first_name: data.firstName ?? "",
      p_last_name: data.lastName ?? "",
    });
    if (error) {
      return {
        ok: false,
        organizationId: null,
        roleId: null,
        createdOrg: false,
        error: error.message,
      };
    }
    const row = (
      Array.isArray(rpc) ? rpc[0] : rpc
    ) as {
      organization_id: string | null;
      role_id: string | null;
      created_org: boolean;
    } | null;
    return {
      ok: true,
      organizationId: row?.organization_id ?? null,
      roleId: row?.role_id ?? null,
      createdOrg: Boolean(row?.created_org),
    };
  });
