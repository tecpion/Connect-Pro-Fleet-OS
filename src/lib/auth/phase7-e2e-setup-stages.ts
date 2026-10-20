// Phase 7 E2E — resumable setup sub-stages. The original single-request setup
// exceeded the platform deadline, so it is split into independent requests:
//   setup-init          — generate runId, persist empty non-secret metadata
//   setup-org-a         — provision/authenticate only Org A
//   setup-org-b         — provision/authenticate only Org B
//   setup-base          — create customer/vehicle/rental base fixtures
//   setup-rental-core   — ledger charge/payment, deposit, deposit history
//   setup-booking       — booking request, inspection
//   setup-maintenance   — vendor, work order, event, receipt, balances
//
// Each sub-stage reloads the persisted run meta, rebuilds a fresh authenticated
// runtime, runs its work, merges recordIds/fixtures + a stage-completion flag
// back into the meta, and re-saves it. A dependent stage refuses to run
// (fail closed) until its prerequisite stage is marked complete. Test-harness
// only — no product/domain logic changed. Service role is confined to
// provisioning; every assertion uses signed-in publishable-key clients.

import { createClient } from "@supabase/supabase-js";
import {
  provisionAndSetup,
  provisionOneOrg,
  createBaseFixtures,
} from "./phase7-e2e-provision";
import type { Phase4Context } from "./phase4-e2e-builders";
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
 *
 * `deriveRuntime` calls this factory with the sentinels "publishable" and
 * "service"; those are resolved to the real env keys so rebuilt clients can
 * actually authenticate. Direct calls with a real key pass through unchanged.
 */
function clientFactory(url: string): (apiKey: string) => Phase7Client {
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
    }) as unknown as Phase7Client;
  };
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

/** Stages a dependent stage can require before it runs. */
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

/** Stage setup-init — generate runId, persist empty non-secret metadata, return. */
export async function runPhase7SetupInit(): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const stamp = crypto.randomUUID();
  const password = `Phase7!${crypto.randomUUID()}`;
  const emailA = `e2e7-a-${stamp}@phase7.test`;
  const emailB = `e2e7-b-${stamp}@phase7.test`;
  const ctx: Phase4Context = {
    orgA: "",
    userAId: "",
    userBId: "",
    vehId: crypto.randomUUID(),
    custId: crypto.randomUUID(),
    rentalId: crypto.randomUUID(),
    now: new Date(),
    nowIso: new Date().toISOString(),
    stamp: Date.now(),
  };
  const meta: Phase7RunMeta = {
    runId: stamp,
    orgA: "",
    orgB: "",
    userAId: "",
    userBId: "",
    emailA,
    emailB,
    password,
    stamp,
    ctx,
    now: ctx.nowIso,
    date: ctx.nowIso.slice(0, 10),
    recordIds: {},
    phase7: {} as never,
    users: [],
    orgs: [],
    stages: { init: true },
  };
  saveRun(meta);
  return okResult(
    [{ step: "setup_init", ok: true, detail: "run metadata persisted" }],
    { runId: meta.runId },
  );
}

/** Stage setup-org-a — provision/authenticate only Org A; persist Org A IDs. */
export async function runPhase7SetupOrgA(
  runId?: string,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const guard = requireStage(runId, "init");
  if ("steps" in guard) return guard;
  const meta = guard.meta;

  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const a = client(process.env.SUPABASE_PUBLISHABLE_KEY!);

  const steps: Phase7Step[] = [];
  try {
    const result = await provisionOneOrg(
      admin,
      a,
      meta.emailA,
      meta.password,
      `Phase7 ${meta.stamp} 1`,
      "authenticated_org_a",
    );
    steps.push(...result.steps);
    const nextMeta: Phase7RunMeta = {
      ...meta,
      orgA: result.orgId,
      userAId: result.userId,
      ctx: { ...meta.ctx, orgA: result.orgId, userAId: result.userId },
      users: [...meta.users, result.userId],
      orgs: [...meta.orgs, result.orgId],
      stages: { ...meta.stages, "org-a": true },
    };
    saveRun(nextMeta);
    return okResult(steps, {
      runId: nextMeta.runId,
      orgA: nextMeta.orgA,
    });
  } catch (error) {
    steps.push({
      step: "setup_org_a_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(
      steps,
      "setup-org-a failed; dependent stages cannot pass",
      { runId: meta.runId },
    );
  }
}

/** Stage setup-org-b — provision/authenticate only Org B; persist Org B IDs. */
export async function runPhase7SetupOrgB(
  runId?: string,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const guard = requireStage(runId, "org-a");
  if ("steps" in guard) return guard;
  const meta = guard.meta;

  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const b = client(process.env.SUPABASE_PUBLISHABLE_KEY!);

  const steps: Phase7Step[] = [];
  try {
    const result = await provisionOneOrg(
      admin,
      b,
      meta.emailB,
      meta.password,
      `Phase7 ${meta.stamp} 2`,
      "authenticated_org_b",
    );
    steps.push(...result.steps);
    const nextMeta: Phase7RunMeta = {
      ...meta,
      orgB: result.orgId,
      userBId: result.userId,
      ctx: { ...meta.ctx, userBId: result.userId },
      users: [...meta.users, result.userId],
      orgs: [...meta.orgs, result.orgId],
      stages: { ...meta.stages, "org-b": true },
    };
    saveRun(nextMeta);
    return okResult(steps, {
      runId: nextMeta.runId,
      orgA: nextMeta.orgA,
      orgB: nextMeta.orgB,
    });
  } catch (error) {
    steps.push({
      step: "setup_org_b_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(
      steps,
      "setup-org-b failed; dependent stages cannot pass",
      { runId: meta.runId, orgA: meta.orgA },
    );
  }
}

/** Stage setup-base — create only the customer/vehicle/rental base fixtures. */
export async function runPhase7SetupBase(
  runId?: string,
): Promise<Phase7StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const guard = requireStage(runId, "org-b");
  if ("steps" in guard) return guard;
  const meta = guard.meta;

  const url = process.env.SUPABASE_URL!;
  const client = clientFactory(url);
  const a = client(process.env.SUPABASE_PUBLISHABLE_KEY!);

  const steps: Phase7Step[] = [];
  // Sign in Org A so the base-fixture inserts go through RLS as Org A.
  let signInOk = false;
  try {
    const sa = await a.auth.signInWithPassword({
      email: meta.emailA,
      password: meta.password,
    });
    signInOk = !sa.error && sa.data.user?.id === meta.userAId;
    if (!signInOk)
      steps.push({
        step: "setup_base_signin_org_a",
        ok: false,
        detail: sa.error?.message ?? "Org A sign-in failed",
      });
  } catch (error) {
    steps.push({
      step: "setup_base_signin_org_a",
      ok: false,
      detail: errorDetail(error),
    });
  }
  if (!signInOk)
    return failedResult(steps, "setup-base could not sign in Org A", {
      runId: meta.runId,
      orgA: meta.orgA,
    });

  try {
    const result = await createBaseFixtures(a, meta.ctx);
    steps.push(...result.steps);
    const nextMeta: Phase7RunMeta = {
      ...meta,
      stages: { ...meta.stages, base: true },
    };
    saveRun(nextMeta);
    return okResult(steps, {
      runId: nextMeta.runId,
      orgA: nextMeta.orgA,
      orgB: nextMeta.orgB,
    });
  } catch (error) {
    steps.push({
      step: "setup_base_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(steps, "setup-base failed", {
      runId: meta.runId,
      orgA: meta.orgA,
    });
  }
}

/** Stage setup-auth — legacy shortcut: provision both orgs + base fixtures in one shot. */
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
      stages: {
        init: true,
        "org-a": true,
        "org-b": true,
        base: true,
        auth: true,
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
    "base",
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
