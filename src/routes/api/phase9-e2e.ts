// Phase 9D staged live Cloud E2E verification endpoint.
//
// The single-shot `runPhase9E2E` orchestrator exceeds the platform request
// deadline, so this route dispatches the SAME verification across bounded
// `?stage=` stages that share a server-side run-state map (non-secret fixture
// IDs only):
//
//   POST /api/phase9-e2e?stage=setup-init            — generate runId, persist meta
//   POST /api/phase9-e2e?stage=setup-org-a           — provision/authenticate Org A
//   POST /api/phase9-e2e?stage=setup-org-b           — provision/authenticate Org B
//   POST /api/phase9-e2e?stage=setup-financial-docs   — rental event + invoice + payment + receipt
//   POST /api/phase9-e2e?stage=setup-arrangements      — arrangement + installment + event
//   POST /api/phase9-e2e?stage=setup-agreements       — template + master + instance
//   POST /api/phase9-e2e?stage=setup-activity          — activity/audit entry
//   POST /api/phase9-e2e?stage=hydration              — fresh Org A session + Phase 9 hydration
//   POST /api/phase9-e2e?stage=isolation              — Org B cross-tenant probes
//   POST /api/phase9-e2e?stage=cleanup                — best-effort teardown (rerunnable)
//
// Every stage uses the authenticated Org A / Org B publishable-key clients so
// RLS is the real gate; the service-role admin is confined to auth-user
// creation + teardown. No credentials are returned. A failed setup stage
// returns no runId, so dependent stages cannot pretend to pass.

import { createFileRoute } from "@tanstack/react-router";
import {
  runPhase9Setup,
  runPhase9HydrationStage,
  runPhase9IsolationStage,
  runPhase9CleanupStage,
  runPhase9E2E,
  runPhase9SetupInit,
  runPhase9SetupOrgA,
  runPhase9SetupOrgB,
  runPhase9SetupFinancialDocs,
  runPhase9SetupArrangements,
  runPhase9SetupAgreements,
  runPhase9SetupActivity,
  type Phase9StageResult,
} from "@/lib/auth/phase9-e2e.server";

type Stage =
  | "setup"
  | "setup-init"
  | "setup-org-a"
  | "setup-org-b"
  | "setup-financial-docs"
  | "setup-arrangements"
  | "setup-agreements"
  | "setup-activity"
  | "hydration"
  | "isolation"
  | "cleanup";

function isStage(value: string | null): value is Stage {
  return (
    value === "setup" ||
    value === "setup-init" ||
    value === "setup-org-a" ||
    value === "setup-org-b" ||
    value === "setup-financial-docs" ||
    value === "setup-arrangements" ||
    value === "setup-agreements" ||
    value === "setup-activity" ||
    value === "hydration" ||
    value === "isolation" ||
    value === "cleanup"
  );
}

function jsonResponse(
  result: Phase9StageResult | Awaited<ReturnType<typeof runPhase9E2E>>,
): Response {
  return new Response(JSON.stringify(result), {
    status: result.passed ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/phase9-e2e")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const stageParam = url.searchParams.get("stage");
        const runId = url.searchParams.get("runId") ?? undefined;
        try {
          if (isStage(stageParam)) {
            if (stageParam === "setup")
              return jsonResponse(await runPhase9Setup());
            if (stageParam === "setup-init")
              return jsonResponse(await runPhase9SetupInit());
            if (stageParam === "setup-org-a")
              return jsonResponse(await runPhase9SetupOrgA(runId));
            if (stageParam === "setup-org-b")
              return jsonResponse(await runPhase9SetupOrgB(runId));
            if (stageParam === "setup-financial-docs")
              return jsonResponse(await runPhase9SetupFinancialDocs(runId));
            if (stageParam === "setup-arrangements")
              return jsonResponse(await runPhase9SetupArrangements(runId));
            if (stageParam === "setup-agreements")
              return jsonResponse(await runPhase9SetupAgreements(runId));
            if (stageParam === "setup-activity")
              return jsonResponse(await runPhase9SetupActivity(runId));
            if (stageParam === "hydration")
              return jsonResponse(await runPhase9HydrationStage(runId));
            if (stageParam === "isolation")
              return jsonResponse(await runPhase9IsolationStage(runId));
            return jsonResponse(await runPhase9CleanupStage(runId));
          }
          const result = await runPhase9E2E();
          return jsonResponse(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(
            JSON.stringify({
              ran: false,
              passed: false,
              stepCount: 0,
              steps: [],
              crashed: true,
              error: message,
              stack: err instanceof Error ? err.stack : undefined,
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
