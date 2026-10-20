// Connect Pro Fleet — Phase 8 production runtime verification — orchestrator.
//
// Proves the Phase 8 Cloud-backed domains (Locations, Staff/Assignments/Drivers,
// Tasks + events/notes, Notifications + deliveries/preferences, Company
// Settings, Vehicle Classes/Pricing, Add-ons) persist to Cloud and hydrate
// correctly through the real repository path, with Org A / Org B tenant
// isolation under RLS. Service role is confined to auth-user creation +
// provision_account RPC + teardown; every assertion uses the signed-in
// publishable-key Org A / Org B clients so RLS is the real gate.
//
// This file is the orchestrator. Step logic lives in focused modules:
//   phase8-e2e-provision.ts   — provisioning + base fixture setup
//   phase8-e2e-records.ts     — Phase 8 record creation through the repo path
//   phase8-e2e-hydration.ts    — relogin + Phase 8 hydration + stale-org proof
//   phase8-e2e-isolation.ts   — Org B cross-tenant isolation
//   phase8-e2e-cleanup.ts      — best-effort teardown
//   phase8-e2e-runtime.ts     — shared runtime state + step/requireOk helpers
//   phase8-e2e-setup-stages.ts — resumable setup sub-stages
//
// Phase 7 proved a single monolithic Cloud E2E run exceeds the platform
// deadline, so the staged `?stage=` route (src/routes/api/phase8-e2e.ts) is the
// primary entry point. The un-staged `runPhase8E2E` is kept for the legacy
// single-shot POST path (may exceed the deadline).

import { createClient } from "@supabase/supabase-js";
import { provisionAndSetupPhase8 } from "./phase8-e2e-provision";
import { runCreatePhase8Records } from "./phase8-e2e-records";
import { runPhase8Hydration } from "./phase8-e2e-hydration";
import { runPhase8Isolation } from "./phase8-e2e-isolation";
import { runPhase8Cleanup } from "./phase8-e2e-cleanup";
import {
  errorDetail,
  saveRun,
  loadRun,
  deriveRuntime,
  type Phase8RunMeta,
  type Phase8Runtime,
  type Phase8Client,
} from "./phase8-e2e-runtime";
// Re-export the resumable setup sub-stages so the route can dispatch to them.
export {
  runPhase8SetupInit,
  runPhase8SetupOrgA,
  runPhase8SetupOrgB,
  runPhase8SetupOperational,
  runPhase8SetupTasksNotifications,
  runPhase8SetupConfig,
} from "./phase8-e2e-setup-stages";

export interface Phase8Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface Phase8E2EResult {
  ran: boolean;
  passed: boolean;
  stepCount: number;
  steps: Phase8Step[];
  reason?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
  failedSteps?: string[];
}

/** Shared shape returned by each staged runner. */
export interface Phase8StageResult {
  ran: boolean;
  passed: boolean;
  stepCount: number;
  steps: Phase8Step[];
  failedSteps: string[];
  reason?: string;
  runId?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
  crashed?: boolean;
}

const REQUIRED_ENV =
  "Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY";
const MISSING_ENV_REASON =
  "Cloud server configuration unavailable; execute POST /api/phase8-e2e?stage=… in AI Studio.";

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
function clientFactory(url: string): (apiKey: string) => Phase8Client {
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
    }) as unknown as Phase8Client;
  };
}

function failedResult(
  steps: Phase8Step[],
  reason: string,
  extra: Partial<Phase8StageResult> = {},
): Phase8StageResult {
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

function okResult(
  steps: Phase8Step[],
  extra: Partial<Phase8StageResult> = {},
): Phase8StageResult {
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

/** Stage setup — provision/authenticate Org A + Org B and create Phase 8 records. */
export async function runPhase8Setup(): Promise<Phase8StageResult> {
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

  const steps: Phase8Step[] = [];
  let runtime: Phase8Runtime | undefined;
  try {
    const provision = await provisionAndSetupPhase8(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const records = await runCreatePhase8Records(runtime);
    steps.push(...records.steps);

    const meta: Phase8RunMeta = {
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
      phase8: { ...runtime.phase8 },
      users: [...runtime.users],
      orgs: [...runtime.orgs],
      stages: {
        init: true,
        "org-a": true,
        "org-b": true,
        operational: true,
        "tasks-notifications": true,
        config: true,
      },
    };
    saveRun(meta);
    return okResult(steps, {
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
        steps.push(...(await runPhase8Cleanup(runtime)).steps);
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

/** Stage hydration — fresh Org A session; Phase 8 hydration + re-assert. */
export async function runPhase8HydrationStage(
  runId?: string,
): Promise<Phase8StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta || !meta.stages.config)
    return failedResult(
      [
        {
          step: "hydration_no_run",
          ok: false,
          detail: !meta
            ? "No setup run; run setup-config first"
            : "Setup record stages incomplete; run setup-config first",
        },
      ],
      "No complete setup run for hydration; run ?stage=setup-config first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase8Step[] = [];
  let runtime: Phase8Runtime;
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
    const hydration = await runPhase8Hydration(runtime);
    steps.push(...hydration.steps);
    return okResult(steps, {
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
export async function runPhase8IsolationStage(
  runId?: string,
): Promise<Phase8StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta || !meta.stages.config)
    return failedResult(
      [
        {
          step: "isolation_no_run",
          ok: false,
          detail: !meta
            ? "No setup run; run setup-config first"
            : "Setup record stages incomplete; run setup-config first",
        },
      ],
      "No complete setup run for isolation; run ?stage=setup-config first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase8Step[] = [];
  let runtime: Phase8Runtime;
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
    const isolation = await runPhase8Isolation(runtime);
    steps.push(...isolation.steps);
    return okResult(steps, {
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
export async function runPhase8CleanupStage(
  runId?: string,
): Promise<Phase8StageResult> {
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
  const steps: Phase8Step[] = [];
  try {
    // Cleanup is admin-only: the admin client bypasses RLS to delete the rows
    // the setup stage created. Re-auth is not needed (service key), but we
    // still build the full runtime shape the cleanup module expects.
    const admin = client(
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ) as Phase8Client;
    const a = client(process.env.SUPABASE_PUBLISHABLE_KEY!) as Phase8Client;
    const b = client(process.env.SUPABASE_PUBLISHABLE_KEY!) as Phase8Client;
    const runtime: Phase8Runtime = {
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
      locations: a as never,
      staffAssignments: a as never,
      tasks: a as never,
      notifications: a as never,
      companySettings: a as never,
      vehicleClasses: a as never,
      addons: a as never,
      recordIds: meta.recordIds,
      phase8: meta.phase8,
      users: meta.users,
      orgs: meta.orgs,
    };
    const cleanup = await runPhase8Cleanup(runtime);
    steps.push(...cleanup.steps);
    return okResult(steps, {
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
export async function runPhase8E2E(): Promise<Phase8E2EResult> {
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
  const steps: Phase8Step[] = [];
  let runtime: Phase8Runtime | undefined;
  try {
    const provision = await provisionAndSetupPhase8(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const records = await runCreatePhase8Records(runtime);
    steps.push(...records.steps);
    const hydration = await runPhase8Hydration(runtime);
    steps.push(...hydration.steps);
    const isolation = await runPhase8Isolation(runtime);
    steps.push(...isolation.steps);
  } catch (error) {
    steps.push({
      step: "runner_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
  } finally {
    if (runtime) steps.push(...(await runPhase8Cleanup(runtime)).steps);
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
