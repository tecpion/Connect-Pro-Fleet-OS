// Phase 9D E2E — resumable setup sub-stages. The original single-request setup
// exceeded the platform deadline, so it is split into independent requests:
//   setup-init           — generate runId, persist empty non-secret metadata
//   setup-org-a          — provision/authenticate only Org A
//   setup-org-b          — provision/authenticate only Org B
//   setup-financial-docs — rental event, invoice, payment txn, receipt
//   setup-arrangements   — arrangement, installment, arrangement event
//   setup-agreements     — agreement template, master agreement, instance
//   setup-activity       — activity/audit entry
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
  runFinancialDocsRecords,
  runArrangementsRecords,
  runAgreementsRecords,
  runActivityRecords,
} from "./phase9-e2e-records";
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
import type { Phase9Step, Phase9StageResult } from "./phase9-e2e.server";

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

function okResult(
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

type RecordStage = keyof Required<Phase9StageFlags>;

function requireStage(
  runId: string | undefined,
  stage: RecordStage,
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

function mergeStage(
  meta: Phase9RunMeta,
  runtime: Phase9Runtime,
  next: RecordStage,
): Phase9RunMeta {
  return {
    ...meta,
    recordIds: { ...meta.recordIds, ...runtime.recordIds },
    phase9: { ...meta.phase9, ...runtime.phase9 },
    stages: { ...meta.stages, [next]: true },
  };
}

async function runRecordSubStage(
  runId: string | undefined,
  stage: RecordStage,
  label: string,
  next: RecordStage,
  run: (runtime: Phase9Runtime) => Promise<{ steps: Phase9Step[] }>,
): Promise<Phase9StageResult> {
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
  let runtime: Phase9Runtime;
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
export async function runPhase9SetupInit(): Promise<Phase9StageResult> {
  if (!serverConfigured())
    return failedResult(
      [{ step: "server_config", ok: false, detail: REQUIRED_ENV }],
      MISSING_ENV_REASON,
    );
  const stamp = crypto.randomUUID();
  const password = `Phase9!${crypto.randomUUID()}`;
  const emailA = `e2e9-a-${stamp}@phase9.test`;
  const emailB = `e2e9-b-${stamp}@phase9.test`;
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
  const meta: Phase9RunMeta = {
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
    phase9: {} as never,
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
export async function runPhase9SetupOrgA(
  runId?: string,
): Promise<Phase9StageResult> {
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

  const steps: Phase9Step[] = [];
  try {
    const result = await provisionOneOrg(
      admin as never,
      a as never,
      meta.emailA,
      meta.password,
      `Phase9 ${meta.stamp} 1`,
      "authenticated_org_a_phase9",
    );
    steps.push(...result.steps);
    const nextMeta: Phase9RunMeta = {
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
export async function runPhase9SetupOrgB(
  runId?: string,
): Promise<Phase9StageResult> {
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

  const steps: Phase9Step[] = [];
  try {
    const result = await provisionOneOrg(
      admin as never,
      b as never,
      meta.emailB,
      meta.password,
      `Phase9 ${meta.stamp} 2`,
      "authenticated_org_b_phase9",
    );
    steps.push(...result.steps);
    const nextMeta: Phase9RunMeta = {
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

/** Stage setup-financial-docs — base fixtures + rental event + invoice + payment + receipt. */
export async function runPhase9SetupFinancialDocs(
  runId?: string,
): Promise<Phase9StageResult> {
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

  const steps: Phase9Step[] = [];
  let signInOk = false;
  try {
    const sa = await a.auth.signInWithPassword({
      email: meta.emailA,
      password: meta.password,
    });
    signInOk = !sa.error && sa.data.user?.id === meta.userAId;
    if (!signInOk)
      steps.push({
        step: "setup_financial_docs_signin_org_a",
        ok: false,
        detail: sa.error?.message ?? "Org A sign-in failed",
      });
  } catch (error) {
    steps.push({
      step: "setup_financial_docs_signin_org_a",
      ok: false,
      detail: errorDetail(error),
    });
  }
  if (!signInOk)
    return failedResult(steps, "setup-financial-docs could not sign in Org A", {
      runId: meta.runId,
      orgA: meta.orgA,
    });

  try {
    const base = await createBaseFixtures(a as never, meta.ctx);
    steps.push(...base.steps);
    if (!base.steps.every((s) => s.ok))
      return failedResult(steps, "setup-financial-docs base fixtures failed", {
        runId: meta.runId,
        orgA: meta.orgA,
      });
    const runtime = await deriveRuntime(meta, client);
    const result = await runFinancialDocsRecords(runtime);
    steps.push(...result.steps);
    const nextMeta = mergeStage(meta, runtime, "financial-docs");
    saveRun(nextMeta);
    return okResult(steps, {
      runId: nextMeta.runId,
      orgA: nextMeta.orgA,
      orgB: nextMeta.orgB,
      recordIds: nextMeta.recordIds,
    });
  } catch (error) {
    steps.push({
      step: "setup_financial_docs_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
    return failedResult(steps, "setup-financial-docs failed", {
      runId: meta.runId,
      orgA: meta.orgA,
    });
  }
}

/** Stage setup-arrangements — arrangement + installment + arrangement event. */
export function runPhase9SetupArrangements(
  runId?: string,
): Promise<Phase9StageResult> {
  return runRecordSubStage(
    runId,
    "financial-docs",
    "setup-arrangements",
    "arrangements",
    runArrangementsRecords,
  );
}

/** Stage setup-agreements — agreement template + master + instance. */
export function runPhase9SetupAgreements(
  runId?: string,
): Promise<Phase9StageResult> {
  return runRecordSubStage(
    runId,
    "arrangements",
    "setup-agreements",
    "agreements",
    runAgreementsRecords,
  );
}

/** Stage setup-activity — activity/audit entry. */
export function runPhase9SetupActivity(
  runId?: string,
): Promise<Phase9StageResult> {
  return runRecordSubStage(
    runId,
    "agreements",
    "setup-activity",
    "activity",
    runActivityRecords,
  );
}
