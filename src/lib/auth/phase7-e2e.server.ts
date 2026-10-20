// Phase 7 production runtime verification — Phase 2 cut-over domains
// (rentals, rental ledger transactions, security deposits, deposit history,
// booking requests, inspections) + Maintenance (work orders, events, vendors,
// receipts). Proves the NEW Cloud-backed Phase 7 behavior against live Cloud
// tables using per-user authenticated clients (NOT the service-role admin) so
// RLS is the real gate. Admin client is used ONLY for auth-user creation +
// final cleanup.
//
// Service role is confined to provisioning and teardown. Every assertion uses
// signed-in publishable-key clients, including the forged-org isolation probes.
//
// This file is the orchestrator. Step logic lives in focused modules:
//   phase7-e2e-provision.ts  — provisioning + base fixture setup
//   phase7-e2e-records.ts    — Phase 7 record creation through the repo path
//   phase7-e2e-hydration.ts — relogin + Phase 2 + Maintenance hydration
//   phase7-e2e-isolation.ts  — Org B cross-tenant isolation
//   phase7-e2e-cleanup.ts    — best-effort teardown
//   phase7-e2e-runtime.ts    — shared runtime state + step/requireOk helpers

import { createClient } from "@supabase/supabase-js";
import { provisionAndSetup } from "./phase7-e2e-provision";
import { runCreatePhase7Records } from "./phase7-e2e-records";
import { runHydration } from "./phase7-e2e-hydration";
import { runIsolation } from "./phase7-e2e-isolation";
import { runCleanup } from "./phase7-e2e-cleanup";
import {
  errorDetail,
  saveRun,
  loadRun,
  deriveRuntime,
  type Phase7RunMeta,
  type Phase7Runtime,
  type Phase7Client,
} from "./phase7-e2e-runtime";

export interface Phase7Step {
  step: string;
  ok: boolean;
  detail?: string;
}

export interface Phase7E2EResult {
  ran: boolean;
  passed: boolean;
  stepCount: number;
  steps: Phase7Step[];
  reason?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
  failedSteps?: string[];
}

/** Shared shape returned by each staged runner. */
export interface Phase7StageResult {
  ran: boolean;
  passed: boolean;
  stepCount: number;
  steps: Phase7Step[];
  failedSteps: string[];
  reason?: string;
  runId?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
  crashed?: boolean;
}

const REQUIRED_ENV = "Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY";
const MISSING_ENV_REASON = "Cloud server configuration unavailable; execute POST /api/phase7-e2e?stage=… in AI Studio.";

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
function clientFactory(url: string): (apiKey: string) => Phase7Client {
  return (apiKey: string) =>
    createClient(url, apiKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (
            headers.get("Authorization") === `Bearer ${apiKey}` &&
            apiKey.startsWith("sb_")
          )
            headers.delete("Authorization");
          headers.set("apikey", apiKey);
          return fetch(input, { ...init, headers });
        },
      },
    }) as unknown as Phase7Client;
}

function failedResult(
  steps: Phase7Step[],
  reason: string,
  extra: Partial<Phase7StageResult> = {},
): Phase7StageResult {
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
  steps: Phase7Step[],
  extra: Partial<Phase7StageResult> = {},
): Phase7StageResult {
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

/** Stage 1 — provision/authenticate Org A + Org B and create Phase 7 records. */
export async function runPhase7Setup(): Promise<Phase7StageResult> {
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

  const steps: Phase7Step[] = [];
  let runtime: Phase7Runtime | undefined;
  try {
    const provision = await provisionAndSetup(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const records = await runCreatePhase7Records(runtime);
    steps.push(...records.steps);

    const meta: Phase7RunMeta = {
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
      phase7: runtime.phase7,
      users: [...runtime.users],
      orgs: [...runtime.orgs],
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
        steps.push(...(await runCleanup(runtime)).steps);
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

/** Stage 2 — fresh Org A session; Phase 2 + Maintenance hydration + re-assert. */
export async function runPhase7Hydration(
  runId?: string,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta)
    return failedResult(
      [{ step: "hydration_no_run", ok: false, detail: "No setup run; run setup first" }],
      "No setup run for hydration; run ?stage=setup first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase7Step[] = [];
  let runtime: Phase7Runtime;
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
    const hydration = await runHydration(runtime);
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

/** Stage 3 — Org B cross-tenant read/update/forged-insert isolation probes. */
export async function runPhase7Isolation(
  runId?: string,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta)
    return failedResult(
      [{ step: "isolation_no_run", ok: false, detail: "No setup run; run setup first" }],
      "No setup run for isolation; run ?stage=setup first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase7Step[] = [];
  let runtime: Phase7Runtime;
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
    const isolation = await runIsolation(runtime);
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

/** Stage 4 — best-effort teardown; safe to rerun. */
export async function runPhase7Cleanup(
  runId?: string,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta)
    return failedResult(
      [{ step: "cleanup_no_run", ok: false, detail: "No setup run; run setup first" }],
      "No setup run for cleanup; run ?stage=setup first",
    );
  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const steps: Phase7Step[] = [];
  try {
    // Cleanup is admin-only: the admin client bypasses RLS to delete the rows
    // the setup stage created. Re-auth is not needed (service key), but we
    // still build the full runtime shape the cleanup module expects.
    const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY!) as Phase7Client;
    const a = client(process.env.SUPABASE_PUBLISHABLE_KEY!) as Phase7Client;
    const b = client(process.env.SUPABASE_PUBLISHABLE_KEY!) as Phase7Client;
    const runtime: Phase7Runtime = {
      a,
      b,
      admin,
      orgA: meta.orgA,
      orgB: meta.orgB,
      userAId: meta.userAId,
      userBId: meta.userBId,
      emailA: meta.emailA,
      password: meta.password,
      stamp: meta.stamp,
      ctx: meta.ctx,
      now: meta.now,
      date: meta.date,
      rentals: a as never,
      ledger: a as never,
      deposits: a as never,
      bookingRequests: a as never,
      inspections: a as never,
      maintenance: a as never,
      recordIds: meta.recordIds,
      phase7: meta.phase7,
      users: meta.users,
      orgs: meta.orgs,
    };
    const cleanup = await runCleanup(runtime);
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
export async function runPhase7E2E(): Promise<Phase7E2EResult> {
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
  const steps: Phase7Step[] = [];
  let runtime: Phase7Runtime | undefined;
  try {
    const provision = await provisionAndSetup(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const records = await runCreatePhase7Records(runtime);
    steps.push(...records.steps);
    const hydration = await runHydration(runtime);
    steps.push(...hydration.steps);
    const isolation = await runIsolation(runtime);
    steps.push(...isolation.steps);
  } catch (error) {
    steps.push({
      step: "runner_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
  } finally {
    if (runtime) steps.push(...(await runCleanup(runtime)).steps);
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
