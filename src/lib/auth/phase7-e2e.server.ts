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
import { errorDetail, type Phase7Runtime } from "./phase7-e2e-runtime";

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

export async function runPhase7E2E(): Promise<Phase7E2EResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret)
    return {
      ran: false,
      passed: false,
      stepCount: 0,
      steps: [
        {
          step: "server_config",
          ok: false,
          detail:
            "Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY",
        },
      ],
      reason:
        "Cloud server configuration unavailable; execute POST /api/phase7-e2e in AI Studio.",
    };

  function client(apiKey: string) {
    return createClient(url!, apiKey, {
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
    });
  }

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
