// Phase 8 staged E2E verification endpoint.
//
// The single-shot `runPhase8E2E` orchestrator exceeds the platform request
// deadline because it runs provisioning, record creation, hydration, isolation
// probes, and cleanup back-to-back before returning. This route dispatches the
// SAME verification across bounded `?stage=` stages that share a server-side
// run-state map (non-secret fixture IDs only):
//
//   POST /api/phase8-e2e?stage=setup-init              — generate runId, persist meta
//   POST /api/phase8-e2e?stage=setup-org-a             — provision/authenticate Org A
//   POST /api/phase8-e2e?stage=setup-org-b             — provision/authenticate Org B
//   POST /api/phase8-e2e?stage=setup-operational        — base fixtures + location/staff/assignment/driver
//   POST /api/phase8-e2e?stage=setup-tasks-notifications — task/event/note + notification/delivery/preference
//   POST /api/phase8-e2e?stage=setup-config            — company settings, vehicle class, add-ons
//   POST /api/phase8-e2e?stage=hydration                — fresh Org A session + Phase 8 hydration
//   POST /api/phase8-e2e?stage=isolation                — Org B cross-tenant probes
//   POST /api/phase8-e2e?stage=cleanup                  — best-effort teardown (rerunnable)
//
// Every stage uses the authenticated Org A / Org B publishable-key clients so
// RLS is the real gate; the service-role admin is confined to auth-user
// creation + teardown. No credentials are returned. A failed setup stage
// returns no runId, so dependent stages cannot pretend to pass.

import { createFileRoute } from "@tanstack/react-router";
import {
  runPhase8Setup,
  runPhase8HydrationStage,
  runPhase8IsolationStage,
  runPhase8CleanupStage,
  runPhase8E2E,
  runPhase8SetupInit,
  runPhase8SetupOrgA,
  runPhase8SetupOrgB,
  runPhase8SetupOperational,
  runPhase8SetupTasksNotifications,
  runPhase8SetupConfig,
  type Phase8StageResult,
} from "@/lib/auth/phase8-e2e.server";

type Stage =
  | "setup"
  | "setup-init"
  | "setup-org-a"
  | "setup-org-b"
  | "setup-operational"
  | "setup-tasks-notifications"
  | "setup-config"
  | "hydration"
  | "isolation"
  | "cleanup";

function isStage(value: string | null): value is Stage {
  return (
    value === "setup" ||
    value === "setup-init" ||
    value === "setup-org-a" ||
    value === "setup-org-b" ||
    value === "setup-operational" ||
    value === "setup-tasks-notifications" ||
    value === "setup-config" ||
    value === "hydration" ||
    value === "isolation" ||
    value === "cleanup"
  );
}

function jsonResponse(
  result: Phase8StageResult | Awaited<ReturnType<typeof runPhase8E2E>>,
): Response {
  return new Response(JSON.stringify(result), {
    status: result.passed ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/phase8-e2e")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const stageParam = url.searchParams.get("stage");
        const runId = url.searchParams.get("runId") ?? undefined;
        try {
          if (isStage(stageParam)) {
            if (stageParam === "setup")
              return jsonResponse(await runPhase8Setup());
            if (stageParam === "setup-init")
              return jsonResponse(await runPhase8SetupInit());
            if (stageParam === "setup-org-a")
              return jsonResponse(await runPhase8SetupOrgA(runId));
            if (stageParam === "setup-org-b")
              return jsonResponse(await runPhase8SetupOrgB(runId));
            if (stageParam === "setup-operational")
              return jsonResponse(await runPhase8SetupOperational(runId));
            if (stageParam === "setup-tasks-notifications")
              return jsonResponse(
                await runPhase8SetupTasksNotifications(runId),
              );
            if (stageParam === "setup-config")
              return jsonResponse(await runPhase8SetupConfig(runId));
            if (stageParam === "hydration")
              return jsonResponse(await runPhase8HydrationStage(runId));
            if (stageParam === "isolation")
              return jsonResponse(await runPhase8IsolationStage(runId));
            return jsonResponse(await runPhase8CleanupStage(runId));
          }
          // No stage: fall back to the legacy un-staged run (may exceed deadline).
          const result = await runPhase8E2E();
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
