// Phase 7 staged E2E verification endpoint.
//
// The single-shot `runPhase7E2E` orchestrator exceeds the platform request
// deadline because it runs provisioning, record creation, hydration, 30
// isolation probes, and cleanup back-to-back before returning. This route
// dispatches the SAME verification across bounded `?stage=` stages that share
// a server-side run-state map (non-secret fixture IDs only):
//
//   POST /api/phase7-e2e?stage=setup      — provision + create Phase 7 records
//   POST /api/phase7-e2e?stage=hydration   — fresh Org A session + hydration
//   POST /api/phase7-e2e?stage=isolation  — Org B cross-tenant probes
//   POST /api/phase7-e2e?stage=cleanup     — best-effort teardown (rerunnable)
//
// Every stage uses the authenticated Org A / Org B publishable-key clients so
// RLS is the real gate; the service-role admin is confined to auth-user
// creation + teardown. No credentials are returned. A failed setup stage
// returns no runId, so dependent stages cannot pretend to pass.

import { createFileRoute } from "@tanstack/react-router";
import {
  runPhase7Setup,
  runPhase7Hydration,
  runPhase7Isolation,
  runPhase7Cleanup,
  runPhase7E2E,
  type Phase7StageResult,
} from "@/lib/auth/phase7-e2e.server";

type Stage = "setup" | "hydration" | "isolation" | "cleanup";

function isStage(value: string | null): value is Stage {
  return value === "setup" || value === "hydration" || value === "isolation" || value === "cleanup";
}

function jsonResponse(
  result: Phase7StageResult | Awaited<ReturnType<typeof runPhase7E2E>>,
): Response {
  return new Response(JSON.stringify(result), {
    status: result.passed ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/phase7-e2e")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const stageParam = new URL(request.url).searchParams.get("stage");
        try {
          if (isStage(stageParam)) {
            const runId = new URL(request.url).searchParams.get("runId") ?? undefined;
            if (stageParam === "setup") return jsonResponse(await runPhase7Setup());
            if (stageParam === "hydration") return jsonResponse(await runPhase7Hydration(runId));
            if (stageParam === "isolation") return jsonResponse(await runPhase7Isolation(runId));
            return jsonResponse(await runPhase7Cleanup(runId));
          }
          // No stage: fall back to the legacy un-staged run (may exceed deadline).
          const result = await runPhase7E2E();
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