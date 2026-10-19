import { createClient } from "@supabase/supabase-js";
import { provisionAndSetup } from "./phase5-e2e-provision";
import { runLedgerDeposit } from "./phase5-e2e-expense";
import { runBanking } from "./phase5-e2e-banking";
import { runInvestorSettlement } from "./phase5-e2e-investor";
import { runTenantIsolation } from "./phase5-e2e-tenant";
import { runHydrationProfitability } from "./phase5-e2e-hydration";
import { runCleanup } from "./phase5-e2e-cleanup";
import { errorDetail, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface Phase5Step {
  step: string;
  ok: boolean;
  detail?: string;
}
export interface Phase5E2EResult {
  passed: boolean;
  ran: boolean;
  steps: Phase5Step[];
  reason?: string;
  orgA?: string;
  orgB?: string;
  recordIds?: Record<string, string>;
}

// Phase 5 production runtime verification — Expense + Banking + Investor/JV.
// Proves the NEW Cloud-backed Phase 5 behavior against live Cloud tables using
// per-user authenticated clients (NOT the service-role admin) so RLS is the
// real gate. Admin client is used ONLY for auth-user creation + final cleanup.
//
// Service role is confined to provisioning and teardown. Every assertion uses
// signed-in publishable-key clients, including explicit forged-org writes.
//
// This file is the orchestrator. Step logic lives in focused modules:
//   phase5-e2e-provision.ts    — provisioning + base fixture setup
//   phase5-e2e-expense.ts      — ledger/deposit + expense + recovery checks
//   phase5-e2e-banking.ts      — banking evidence + reconciliation invariants
//   phase5-e2e-investor.ts     — investor/JV + settlement idempotency + payout
//   phase5-e2e-tenant.ts       — cross-tenant + private-document isolation
//   phase5-e2e-hydration.ts    — relogin hydration + profitability + reports
//   phase5-e2e-cleanup.ts      — best-effort teardown
//   phase5-e2e-runtime.ts      — shared runtime state + step/requireOk helpers
export async function runPhase5E2E(): Promise<Phase5E2EResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret)
    return {
      passed: false,
      ran: false,
      reason:
        "Cloud server configuration unavailable; execute POST /api/phase5-e2e in AI Studio.",
      steps: [
        {
          step: "server_config",
          ok: false,
          detail:
            "Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY",
        },
      ],
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
  const admin = client(secret),
    a = client(key),
    b = client(key);
  const steps: Phase5Step[] = [];
  let runtime: Phase5Runtime | undefined;
  try {
    const provision = await provisionAndSetup(admin, a, b);
    runtime = provision.runtime;
    steps.push(...provision.steps);
    const ledger = await runLedgerDeposit(runtime);
    steps.push(...ledger.steps);
    const banking = await runBanking(
      runtime,
      ledger.beforeLedger,
      ledger.payment.id,
    );
    steps.push(...banking.steps);
    const investor = await runInvestorSettlement(runtime);
    steps.push(...investor.steps);
    const tenant = await runTenantIsolation(runtime);
    steps.push(...tenant.steps);
    const hydration = await runHydrationProfitability(runtime);
    steps.push(...hydration.steps);
  } catch (error) {
    steps.push({
      step: "runner_prerequisite",
      ok: false,
      detail: errorDetail(error),
    });
  } finally {
    if (runtime) steps.push(...(await runCleanup(runtime)).steps);
  }
  return {
    passed: steps.length > 1 && steps.every((s) => s.ok),
    ran: true,
    steps,
    orgA: runtime?.orgA,
    orgB: runtime?.orgB,
    recordIds: runtime?.recordIds,
  };
}
