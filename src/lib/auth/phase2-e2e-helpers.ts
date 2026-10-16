// Phase 2 E2E — provisioning + cleanup helpers.
import type { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DbClient = SupabaseClient<Database>;

export interface Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface TestCtx {
  steps: Step[];
  admin: DbClient;
  createdUserIds: string[];
  createdRows: { table: string; id: string }[];
  uploadedPaths: { bucket: string; path: string }[];
  stamp: number;
}

export function makeCtx(stamp: number, admin: DbClient): TestCtx {
  return {
    steps: [],
    admin,
    createdUserIds: [],
    createdRows: [],
    uploadedPaths: [],
    stamp,
  };
}

interface ProvisionRow {
  organization_id: string;
  role_id: string;
  created_org: boolean;
}

export async function provisionOrg(
  ctx: TestCtx,
  email: string,
  pass: string,
  orgName: string,
  createStep: string,
  provisionStep: string,
): Promise<{ userId: string | null; orgId: string | null }> {
  const { admin } = ctx;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pass,
      email_confirm: true,
    });
    const userId = data.user?.id ?? null;
    if (userId) ctx.createdUserIds.push(userId);
    ctx.steps.push({
      step: createStep,
      ok: !error && !!userId,
      detail: error ? error.message : (userId ?? ""),
    });
    if (!userId) return { userId: null, orgId: null };
    const { data: rpc, error: rerr } = await admin.rpc("provision_account", {
      p_user_id: userId,
      p_email: email,
      p_org_name: orgName,
      p_first_name: "Owner",
      p_last_name: "Alpha",
    });
    const rows = (rpc ?? []) as ProvisionRow[];
    const row = rows[0] ?? null;
    const orgId = row?.organization_id ?? null;
    ctx.steps.push({
      step: provisionStep,
      ok: !rerr && !!orgId && row?.created_org === true,
      detail: rerr ? rerr.message : `org=${orgId} created=${row?.created_org}`,
    });
    return { userId, orgId };
  } catch (e) {
    ctx.steps.push({ step: createStep, ok: false, detail: String(e) });
    return { userId: null, orgId: null };
  }
}

export async function checkIdempotency(
  ctx: TestCtx,
  userId: string,
  email: string,
  orgA: string,
): Promise<void> {
  const { admin } = ctx;
  try {
    const { data: rpc, error: rerr } = await admin.rpc("provision_account", {
      p_user_id: userId,
      p_email: email,
      p_org_name: "E2E Org Alpha DUPLICATE",
    });
    const rows = (rpc ?? []) as ProvisionRow[];
    const row = rows[0] ?? null;
    ctx.steps.push({
      step: "5_provision_idempotent_a",
      ok: !rerr && row?.organization_id === orgA && row?.created_org === false,
      detail: `same_org=${row?.organization_id === orgA} created=${row?.created_org}`,
    });
  } catch (e) {
    ctx.steps.push({ step: "5_provision_idempotent_a", ok: false, detail: String(e) });
  }
}

export async function cleanup(ctx: TestCtx): Promise<void> {
  for (const row of ctx.createdRows) {
    try { await ctx.admin.from(row.table).delete().eq("id", row.id); } catch { /* ignore */ }
  }
  for (const up of ctx.uploadedPaths) {
    try { await ctx.admin.storage.from(up.bucket).remove([up.path]); } catch { /* ignore */ }
  }
  for (const uid of ctx.createdUserIds) {
    try { await ctx.admin.auth.admin.deleteUser(uid); } catch { /* ignore */ }
  }
}

export type { DbClient };
export type { createClient };
