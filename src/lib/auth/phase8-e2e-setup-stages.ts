// Phase 8 E2E — resumable setup sub-stages. The original single-request setup
// exceeded the platform deadline, so it is split into independent requests:
//   setup-init              — generate runId, persist empty non-secret metadata
//   setup-org-a             — provision/authenticate only Org A
//   setup-org-b             — provision/authenticate only Org B
//   setup-operational       — location, staff, operational assignment, driver
//   setup-tasks-notifications — task, task event, task note, notification,
//                               notification delivery, notification preference
//   setup-config            — company settings, vehicle class, addon category,
//                             addon catalog item
//
// Each sub-stage reloads the persisted run meta, rebuilds a fresh authenticated
// runtime, runs its work, merges recordIds/fixtures + a stage-completion flag
// back into the meta, and re-saves it. A dependent stage refuses to run
// (fail closed) until its prerequisite stage is marked complete. Test-harness
// only — no product/domain logic changed. Service role is confined to
// provisioning; every assertion uses signed-in publishable-key clients.

import { createClient } from "@supabase/supabase-js";
import { provisionOneOrg, createBaseFixtures } from "./phase7-e2e-provision";
import type { Phase4Context } from "./phase4-e2e-builders";
import {
  runOperationalRecords,
  runTasksNotificationsRecords,
  runConfigRecords,
} from "./phase8-e2e-records";
import {
  errorDetail,
  saveRun,
  loadRun,
  deriveRuntime,
  type Phase8RunMeta,
  type Phase8Runtime,
  type Phase8Client,
  type Phase8StageFlags,
} from "./phase8-e2e-runtime";
import type { Phase8Step, Phase8StageResult } from "./phase8-e2e.server";

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
 * `Authorization: Bearer <key>` the SDK adds (PostgREST rejects the jwt-shaped
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

/** Stages a dependent stage can require before it runs. */
type RecordStage = keyof Required<Phase8StageFlags>;

/** Re-load run meta, assert a prerequisite stage passed, else fail closed. */
function requireStage(
  runId: string | undefined,
  stage: RecordStage,
): Phase8StageResult | { ok: true; meta: Phase8RunMeta } {
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
  meta: Phase8RunMeta,
  runtime: Phase8Runtime,
  next: RecordStage,
): Phase8RunMeta {
  return {
    ...meta,
    recordIds: { ...meta.recordIds, ...runtime.recordIds },
    phase8: { ...meta.phase8, ...runtime.phase8 },
    stages: { ...meta.stages, [next]: true },
  };
}

async function runRecordSubStage(
  runId: string | undefined,
  stage: RecordStage,
  label: string,
  next: RecordStage,
  run: (runtime: Phase8Runtime) => Promise<{ steps: Phase8Step[] }>,
): Promise<Phase8StageResult> {
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
  let runtime: Phase8Runtime;
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
export async function runPhase8SetupInit(): Promise<Phase8StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const stamp = crypto.randomUUID();
  const password = `Phase8!${crypto.randomUUID()}`;
  const emailA = `e2e8-a-${stamp}@phase8.test`;
  const emailB = `e2e8-b-${stamp}@phase8.test`;
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
  const meta: Phase8RunMeta = {
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
    phase8: {} as never,
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
export async function runPhase8SetupOrgA(
  runId?: string,
): Promise<Phase8StageResult> {
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

  const steps: Phase8Step[] = [];
  try {
    const result = await provisionOneOrg(
      admin as never,
      a as never,
      meta.emailA,
      meta.password,
      `Phase8 ${meta.stamp} 1`,
      "authenticated_org_a_phase8",
    );
    steps.push(...result.steps);
    const nextMeta: Phase8RunMeta = {
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
export async function runPhase8SetupOrgB(
  runId?: string,
): Promise<Phase8StageResult> {
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

  const steps: Phase8Step[] = [];
  try {
    const result = await provisionOneOrg(
      admin as never,
      b as never,
      meta.emailB,
      meta.password,
      `Phase8 ${meta.stamp} 2`,
      "authenticated_org_b_phase8",
    );
    steps.push(...result.steps);
    const nextMeta: Phase8RunMeta = {
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

/**
 * Stage setup-operational — create the customer/vehicle/rental base fixtures
 * (so drivers can reference a reservation) then the operational Phase 8
 * records: location, staff, operational assignment, driver.
 */
export async function runPhase8SetupOperational(
  runId?: string,
): Promise<Phase8StageResult> {
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

  const steps: Phase8Step[] = [];
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
        step: "setup_operational_signin_org_a",
        ok: false,
        detail: sa.error?.message ?? "Org A sign-in failed",
      });
  } catch (error) {
    steps.push({
      step: "setup_operational_signin_org_a",
      ok: false,
      detail: errorDetail(error),
    });
  }
  if (!signInOk)
    return failedResult(steps, "setup-operational could not sign in Org A", {
      runId: meta.runId,
      orgA: meta.orgA,
    });

  try {
    // Base fixtures (customer/vehicle/rental) so drivers can reference a
    // reservation. Inserted as the signed-in Org A client (RLS gate).
    const base = await createBaseFixtures(a as never, meta.ctx);
    steps.push(...base.steps);
    if (!base.steps.every((s) => s.ok))
      return failedResult(steps, "setup-operational base fixtures failed", {
        runId: meta.runId,
        orgA: meta.orgA,
      });

    // Now run the operational Phase 8 records through the real repository path.
    // deriveRuntime rebuilds authenticated Org A repositories from the meta.
    const runtime = await deriveRuntime(meta, client);
    const result = await runOperationalRecords(runtime);
    steps.push(...result.steps);
    const nextMeta = mergeStage(meta, runtime, "operational");
    saveRun(nextMeta);
    return okResult(steps, {
      runId: nextMeta.runId,
      orgA: nextMeta.orgA,
      orgB: nextMeta.orgB,
      recordIds: nextMeta.recordIds,
    });
  } catch (error) {
    steps.push({
      step: "setup_operational_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(steps, "setup-operational failed", {
      runId: meta.runId,
      orgA: meta.orgA,
    });
  }
}

/** Stage setup-tasks-notifications — task, task event, task note, notification,
 *  notification delivery, notification preference. */
export function runPhase8SetupTasksNotifications(
  runId?: string,
): Promise<Phase8StageResult> {
  return runRecordSubStage(
    runId,
    "operational",
    "setup-tasks-notifications",
    "tasks-notifications",
    runTasksNotificationsRecords,
  );
}

/** Stage setup-config — company settings, vehicle class, addon category/item. */
export function runPhase8SetupConfig(
  runId?: string,
): Promise<Phase8StageResult> {
  return runRecordSubStage(
    runId,
    "tasks-notifications",
    "setup-config",
    "config",
    runConfigRecords,
  );
}

export { requireStage, mergeStage };
