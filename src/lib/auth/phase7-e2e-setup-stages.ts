// Phase 7 E2E — resumable setup sub-stages. The original single-request setup
// exceeded the platform deadline, so it is split into independent requests:
//   setup-auth          — provision/authenticate Org A + Org B, base fixtures
//   setup-rental-core   — ledger charge/payment, deposit, deposit history
//   setup-booking       — booking request, inspection
//   setup-maintenance   — vendor, work order, event, receipt, balances
//
// Each sub-stage reloads the persisted run meta, rebuilds a fresh authenticated
// runtime, runs its records, merges recordIds/fixtures + a stage-completion
// flag back into the meta, and re-saves it. A dependent stage refuses to run
// (fail closed) until its prerequisite stage is marked complete. Test-harness
// only — no product/domain logic changed. Service role is confined to
// provisioning; every assertion uses signed-in publishable-key clients.

import { createClient } from "@supabase/supabase-js";
import { provisionAndSetup } from "./phase7-e2e-provision";
import {
  runRentalCoreRecords,
  runBookingRecords,
  runMaintenanceRecords,
} from "./phase7-e2e-records";
import {
  errorDetail,
  saveRun,
  loadRun,
  deriveRuntime,
  type Phase7RunMeta,
  type Phase7Runtime,
  type Phase7Client,
  type Phase7StageFlags,
} from "./phase7-e2e-runtime";
import type { Phase7Step, Phase7StageResult } from "./phase7-e2e.server";

const REQUIRED_ENV =
  "Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY";
const MISSING_ENV_REASON =
  "Cloud server configuration unavailable; execute POST /api/phase7-e2e?stage=… in AI Studio.";

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
 * `Authorization: Bearer <key>` the SDK adds (PostgREST rejects the jwt-shaped
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

/** Stages a dependent record stage can require before it runs. */
type RecordStage = keyof Required<Phase7StageFlags>;

/** Re-load run meta, assert a prerequisite stage passed, else fail closed. */
function requireStage(
  runId: string | undefined,
  stage: RecordStage,
): Phase7StageResult | { ok: true; meta: Phase7RunMeta } {
  const meta = runId ? loadRun(runId) : undefined;
  if (!meta)
    return failedResult(
      [
        {
          step: `${stage}_no_run`,
          ok: false,
          detail: "No setup run; run setup-auth first",
        },
      ],
      `No setup run for ${stage}; run ?stage=setup-auth first`,
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

/** Merge a record sub-stage's recordIds/fixtures + completion flag into meta. */
function mergeStage(
  meta: Phase7RunMeta,
  runtime: Phase7Runtime,
  next: RecordStage,
): Phase7RunMeta {
  return {
    ...meta,
    recordIds: { ...meta.recordIds, ...runtime.recordIds },
    phase7: { ...meta.phase7, ...runtime.phase7 },
    stages: { ...meta.stages, [next]: true },
  };
}

async function runRecordSubStage(
  runId: string | undefined,
  stage: RecordStage,
  label: string,
  next: RecordStage,
  run: (runtime: Phase7Runtime) => Promise<{ steps: Phase7Step[] }>,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const guard = requireStage(runId, stage);
  if ("steps" in guard) return guard;
  const meta = guard.meta;

  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  let runtime: Phase7Runtime;
  try {
    runtime = await deriveRuntime(meta, client);
  } catch (error) {
    return failedResult(
      [{ step: `${label}_reauth`, ok: false, detail: errorDetail(error) }],
      `${label} could not re-authenticate the Org A/B clients`,
      { runId: meta.runId, orgA: meta.orgA, orgB: meta.orgB },
    );
  }
  try {
    const result = await run(runtime);
    const nextMeta = mergeStage(meta, runtime, next);
    saveRun(nextMeta);
    return okResult(result.steps, {
      runId: nextMeta.runId,
      orgA: nextMeta.orgA,
      orgB: nextMeta.orgB,
      recordIds: nextMeta.recordIds,
    });
  } catch (error) {
    return failedResult(
      [
        {
          step: `${label}_prerequisite`,
          ok: false,
          detail: errorDetail(error),
        },
      ],
      `${label} failed`,
      {
        runId: meta.runId,
        orgA: meta.orgA,
        orgB: meta.orgB,
        recordIds: meta.recordIds,
      },
    );
  }
}

/** Stage setup-auth — provision/authenticate Org A + Org B and base fixtures. */
export async function runPhase7SetupAuth(): Promise<Phase7StageResult> {
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
      phase7: { ...runtime.phase7 },
      users: [...runtime.users],
      orgs: [...runtime.orgs],
      stages: { auth: true },
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
      step: "setup_auth_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(
      steps,
      "setup-auth failed; dependent stages cannot pass",
      {
        orgA: runtime?.orgA,
        orgB: runtime?.orgB,
        recordIds: runtime?.recordIds,
      },
    );
  }
}

/** Stage setup-rental-core — ledger charge/payment, deposit, deposit history. */
export function runPhase7SetupRentalCore(
  runId?: string,
): Promise<Phase7StageResult> {
  return runRecordSubStage(
    runId,
    "auth",
    "setup-rental-core",
    "rental-core",
    runRentalCoreRecords,
  );
}

/** Stage setup-booking — booking request + inspection. */
export function runPhase7SetupBooking(
  runId?: string,
): Promise<Phase7StageResult> {
  return runRecordSubStage(
    runId,
    "rental-core",
    "setup-booking",
    "booking",
    runBookingRecords,
  );
}

/** Stage setup-maintenance — vendor, work order, event, receipt, balances. */
export function runPhase7SetupMaintenance(
  runId?: string,
): Promise<Phase7StageResult> {
  return runRecordSubStage(
    runId,
    "booking",
    "setup-maintenance",
    "maintenance",
    runMaintenanceRecords,
  );
}

export { requireStage, mergeStage };
