// Connect Pro Fleet — Phase 9D live Cloud E2E — orchestrator.
//
// Proves the Phase 9 Cloud-backed domains (rental events, invoices, receipts,
// payment arrangements + installments + events, agreement templates/master/
// instances, activity/audit) persist to Cloud and hydrate correctly through
// the real repository path, with Org A / Org B tenant isolation under RLS.
// Service role is confined to auth-user creation + provision_account RPC +
// teardown; every assertion uses the signed-in publishable-key Org A / Org B
// clients so RLS is the real gate.
//
// This file is the orchestrator. Step logic lives in focused modules:
//   phase9-e2e-provision.ts    — provisioning + base fixture setup
//   phase9-e2e-records.ts      — Phase 9 record creation through the repo path
//   phase9-e2e-hydration.ts    — relogin + Phase 9 hydration + stale-org proof
//   phase9-e2e-isolation.ts    — Org B cross-tenant isolation
//   phase9-e2e-cleanup.ts      — best-effort teardown
//   phase9-e2e-runtime.ts      — shared runtime state + step/requireOk helpers
//   phase9-e2e-setup-stages.ts — resumable setup sub-stages
//
// The staged `?stage=` route (src/routes/api/phase9-e2e.ts) is the primary
// entry point because a single-shot run exceeds the platform deadline.

import { createClient } from "@supabase/supabase-js";
import { provisionAndSetupPhase9 } from "./phase9-e2e-provision";
import { runCreatePhase9Records } from "./phase9-e2e-records";
import { runPhase9Hydration } from "./phase9-e2e-hydration";
import { runPhase9Isolation } from "./phase9-e2e-isolation";
import { runPhase9Cleanup } from "./phase9-e2e-cleanup";
import {
  errorDetail,
  saveRun,
  loadRun,
  deriveRuntime,
  type Phase9RunMeta,
  type Phase9Runtime,
  type Phase9Client,
  type Phase9StageFlags,
} from "./phase9-e2e-runtime";
// Re-export the resumable setup sub-stages so the route can dispatch to them.
export {
  runPhase9SetupInit,
  runPhase9SetupOrgA,
  runPhase9SetupOrgB,
  runPhase9SetupFinancialDocs,
  runPhase9SetupArrangements,
  runPhase9SetupAgreements,
  runPhase9SetupActivity,
} from "./phase9-e2e-setup-stages";

export interface Phase9Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface Phase9E2EResult {
  ran: boolean;
  passed: boolean;
  stepCount: number;
  steps: Phase9Step[];
  reason?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
  failedSteps?: string[];
}

/** Shared shape returned by each staged runner. */
export interface Phase9StageResult {
  ran: boolean;
  passed: boolean;
  stepCount: number;
  steps: Phase9Step[];
  failedSteps: string[];
  reason?: string;
  runId?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
  crashed?: boolean;
  error?: string;
  stack?: string;
}

const REQUIRED_ENV =
  "Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY";
const MISSING_ENV_REASON =
  "Cloud server configuration unavailable; execute POST /api/phase9-e2e?stage=… in AI Studio.";

function serverConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Build a per-stage Supabase client with the opaque sb_* key handling the
 * generated integrations already do: send the key in `apikey` and strip the
 * `Authorization: Bearer <key>` the SDK adds (PostgREST rejects the JWT-shaped
 * header for opaque keys). Publishable key → authenticated Org A/B clients;
 * service key → admin (auth-user creation + teardown only).
 */
function clientFactory(url: string): (apiKey: string) => Phase9Client {
  return (apiKey: string) => {
    const resolvedKey =
      apiKey === "publishable"
        ? process.env.SUPABASE_PUBLISHABLE_KEY!
        : apiKey === "service"
          ? process.env.SUPABASE_SERVICE_ROLE_KEY!
          : apiKey;
    return createClient(url, resolvedKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (
            headers.get("Authorization") === `Bearer ${resolvedKey}` &&
            resolvedKey.startsWith("sb_")
          )
            headers.delete("Authorization");
          headers.set("apikey", resolvedKey);
          return fetch(input, { ...init, headers });
        },
      },
    }) as unknown as Phase9Client;
  };
}

export function phase9ClientFactory(url: string): (apiKey: string) => Phase9Client {
  return clientFactory(url);
}

export function phase9ServerConfigured(): boolean {
  return serverConfigured();
}

export const PHASE9_REQUIRED_ENV = REQUIRED_ENV;
export const PHASE9_MISSING_ENV_REASON = MISSING_ENV_REASON;

function failedResult(
  steps: Phase9Step[],
  reason: string,
  extra: Partial<Phase9StageResult> = {},
): Phase9StageResult {
  const failedSteps = steps
    .filter((s) => !s.ok)
    .map((s) => `${s.step}${s.detail ? `: ${s.detail}` : ""}`);
  return {
    ran: true,
    passed: false,
    stepCount: steps.length,
    steps,
    failedSteps,
    reason,
    ...extra,
  };
}

export function phase9FailedResult(
  steps: Phase9Step[],
  reason: string,
  extra: Partial<Phase9StageResult> = {},
): Phase9StageResult {
  return failedResult(steps, reason, extra);
}

export function phase9OkResult(
  steps: Phase9Step[],
  extra: Partial<Phase9StageResult> = {},
): Phase9StageResult {
  const failedSteps = steps
    .filter((s) => !s.ok)
    .map((s) => `${s.step}${s.detail ? `: ${s.detail}` : ""}`);
  return {
    ran: true,
    passed: steps.length > 0 && steps.every((s) => s.ok),
    stepCount: steps.length,
    steps,
    failedSteps,
    ...extra,
  };
}

export function phase9ErrorDetail(error: unknown): string {
  return errorDetail(error);
}

export function phase9LoadRun(runId?: string): Phase9RunMeta | undefined {
  return runId ? loadRun(runId) : undefined;
}

export function phase9SaveRun(meta: Phase9RunMeta): void {
  saveRun(meta);
}

export function phase9RequireStage(
  runId: string | undefined,
  stage: keyof Required<Phase9StageFlags>,
): Phase9StageResult | { ok: true; meta: Phase9RunMeta } {
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta)
    return failedResult(
      [
        {
          step: `${stage}_no_run`,
          ok: false,
          detail: "No setup run; run setup-init first",
        },
      ],
      `No setup run for ${stage}; run ?stage=setup-init first`,
    );
  if (!meta.stages[stage])
    return failedResult(
      [
        {
          step: `${stage}_prerequisite`,
          ok: false,
          detail: `Prerequisite stage not completed: ${stage}`,
        },
      ],
      `${stage} prerequisite not satisfied; run the prior stage first`,
      { runId: meta.runId, orgA: meta.orgA, orgB: meta.orgB },
    );
  return { ok: true, meta };
}

/** Stage setup — provision/authenticate Org A + Org B and create Phase 9 records. */
export async function runPhase9Setup(): Promise<Phase9StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = clientFactory(url);
  const admin = client(secret);
  const a = client(key);
  const b = client(key);

  const steps: Phase9Step[] = [];
  let runtime: Phase9Runtime | undefined;
  try {
    const provision = await provisionAndSetupPhase9(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const records = await runCreatePhase9Records(runtime);
    steps.push(...records.steps);

    const meta: Phase9RunMeta = {
      runId: runtime.stamp,
      orgA: runtime.orgA,
      orgB: runtime.orgB,
      userAId: runtime.userAId,
      userBId: runtime.userBId,
      emailA: runtime.emailA,
      emailB: runtime.emailB,
      password: runtime.password,
      stamp: runtime.stamp,
      ctx: runtime.ctx,
      now: runtime.now,
      date: runtime.date,
      recordIds: { ...runtime.recordIds },
      phase9: { ...runtime.phase9 },
      users: [...runtime.users],
      orgs: [...runtime.orgs],
      stages: {
        init: true,
        "org-a": true,
        "org-b": true,
        "financial-docs": true,
        arrangements: true,
        agreements: true,
        activity: true,
      },
    };
    saveRun(meta);
    return phase9OkResult(steps, {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
      recordIds: meta.recordIds,
    });
  } catch (error) {
    steps.push({
      step: "setup_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    if (runtime) {
      try {
        steps.push(...(await runPhase9Cleanup(runtime)).steps);
      } catch {
        /* best-effort; surfaced by failedResult */
      }
    }
    return failedResult(steps, "setup failed; dependent stages cannot pass", {
      orgA: runtime?.orgA,
      orgB: runtime?.orgB,
      recordIds: runtime?.recordIds,
    });
  }
}

/** Stage hydration — fresh Org A session; Phase 9 hydration + re-assert. */
export async function runPhase9HydrationStage(
  runId?: string,
): Promise<Phase9StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta || !meta.stages.activity)
    return failedResult(
      [
        {
          step: "hydration_no_run",
          ok: false,
          detail: !meta
            ? "No setup run; run setup-activity first"
            : "Setup record stages incomplete; run setup-activity first",
        },
      ],
      "No complete setup run for hydration; run ?stage=setup-activity first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase9Step[] = [];
  let runtime: Phase9Runtime;
  try {
    runtime = await deriveRuntime(meta, client);
  } catch (error) {
    return failedResult(
      [{ step: "hydration_reauth", ok: false, detail: errorDetail(error) }],
      "Hydration could not re-authenticate the Org A/B clients",
      { runId: meta.runId, orgA: meta.orgA, orgB: meta.orgB },
    );
  }
  try {
    const hydration = await runPhase9Hydration(runtime);
    steps.push(...hydration.steps);
    return phase9OkResult(steps, {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
      recordIds: meta.recordIds,
    });
  } catch (error) {
    steps.push({
      step: "hydration_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(steps, "hydration failed", {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
      recordIds: meta.recordIds,
    });
  }
}

/** Stage isolation — Org B cross-tenant read/update/forged-insert probes. */
export async function runPhase9IsolationStage(
  runId?: string,
): Promise<Phase9StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta || !meta.stages.activity)
    return failedResult(
      [
        {
          step: "isolation_no_run",
          ok: false,
          detail: !meta
            ? "No setup run; run setup-activity first"
            : "Setup record stages incomplete; run setup-activity first",
        },
      ],
      "No complete setup run for isolation; run ?stage=setup-activity first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase9Step[] = [];
  let runtime: Phase9Runtime;
  try {
    runtime = await deriveRuntime(meta, client);
  } catch (error) {
    return failedResult(
      [{ step: "isolation_reauth", ok: false, detail: errorDetail(error) }],
      "Isolation could not re-authenticate the Org A/B clients",
      { runId: meta.runId, orgA: meta.orgA, orgB: meta.orgB },
    );
  }
  try {
    const isolation = await runPhase9Isolation(runtime);
    steps.push(...isolation.steps);
    return phase9OkResult(steps, {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
      recordIds: meta.recordIds,
    });
  } catch (error) {
    steps.push({
      step: "isolation_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(steps, "isolation failed", {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
      recordIds: meta.recordIds,
    });
  }
}

/** Stage cleanup — best-effort teardown; safe to rerun. */
export async function runPhase9CleanupStage(
  runId?: string,
): Promise<Phase9StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta)
    return failedResult(
      [
        {
          step: "cleanup_no_run",
          ok: false,
          detail: "No setup run; run setup first",
        },
      ],
      "No setup run for cleanup; run ?stage=setup first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase9Step[] = [];
  try {
    const admin = client(
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ) as Phase9Client;
    const a = client(process.env.SUPABASE_PUBLISHABLE_KEY!) as Phase9Client;
    const b = client(process.env.SUPABASE_PUBLISHABLE_KEY!) as Phase9Client;
    const runtime: Phase9Runtime = {
      a,
      b,
      admin,
      orgA: meta.orgA,
      orgB: meta.orgB,
      userAId: meta.userAId,
      userBId: meta.userBId,
      emailA: meta.emailA,
      emailB: meta.emailB,
      password: meta.password,
      stamp: meta.stamp,
      ctx: meta.ctx,
      now: meta.now,
      date: meta.date,
      rentalEvents: a as never,
      invoices: a as never,
      receipts: a as never,
      paymentArrangements: a as never,
      agreements: a as never,
      activityAudit: a as never,
      ledger: a as never,
      recordIds: meta.recordIds,
      phase9: meta.phase9,
      users: meta.users,
      orgs: meta.orgs,
    };
    const cleanup = await runPhase9Cleanup(runtime);
    steps.push(...cleanup.steps);
    return phase9OkResult(steps, {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
    });
  } catch (error) {
    steps.push({
      step: "cleanup_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(steps, "cleanup failed", {
      runId: meta.runId,
      orgA: meta.orgA,
      orgB: meta.orgB,
    });
  }
}

/**
 * Full in-process run (kept for the original un-staged POST path). Runs every
 * stage back-to-back; the staged `?stage=` route exists precisely because this
 * exceeds the platform request deadline.
 */
export async function runPhase9E2E(): Promise<Phase9E2EResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret)
    return {
      ran: false,
      passed: false,
      stepCount: 0,
      steps: [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      reason: MISSING_ENV_REASON,
    };

  const client = clientFactory(url);
  const admin = client(secret);
  const a = client(key);
  const b = client(key);
  const steps: Phase9Step[] = [];
  let runtime: Phase9Runtime | undefined;
  try {
    const provision = await provisionAndSetupPhase9(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const records = await runCreatePhase9Records(runtime);
    steps.push(...records.steps);
    const hydration = await runPhase9Hydration(runtime);
    steps.push(...hydration.steps);
    const isolation = await runPhase9Isolation(runtime);
    steps.push(...isolation.steps);
  } catch (error) {
    steps.push({
      step: "runner_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
  } finally {
    if (runtime) steps.push(...(await runPhase9Cleanup(runtime)).steps);
  }

  const failedSteps = steps
    .filter((s) => !s.ok)
    .map((s) => `${s.step}${s.detail ? `: ${s.detail}` : ""}`);

  return {
    ran: true,
    passed: steps.length > 1 && steps.every((s) => s.ok),
    stepCount: steps.length,
    steps,
    orgA: runtime?.orgA,
    orgB: runtime?.orgB,
    recordIds: runtime?.recordIds,
    failedSteps,
  };
}