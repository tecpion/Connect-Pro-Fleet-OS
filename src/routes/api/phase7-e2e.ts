// Phase 7 staged E2E verification endpoint.
//
// The single-shot `runPhase7E2E` orchestrator exceeds the platform request
// deadline because it runs provisioning, record creation, hydration, 30
// isolation probes, and cleanup back-to-back before returning. This route
// dispatches the SAME verification across bounded `?stage=` stages that share
// a server-side run-state map (non-secret fixture IDs only):
//
//   POST /api/phase7-e2e?stage=setup-init       — generate runId, persist meta
//   POST /api/phase7-e2e?stage=setup-org-a      — provision/authenticate Org A
//   POST /api/phase7-e2e?stage=setup-org-b      — provision/authenticate Org B
//   POST /api/phase7-e2e?stage=setup-base       — customer/vehicle/rental base rows
//   POST /api/phase7-e2e?stage=setup-rental-core — ledger charge/payment, deposit
//   POST /api/phase7-e2e?stage=setup-booking    — booking request, inspection
//   POST /api/phase7-e2e?stage=setup-maintenance — vendor, work order, receipt
//   POST /api/phase7-e2e?stage=hydration         — fresh Org A session + hydration
//   POST /api/phase7-e2e?stage=isolation         — Org B cross-tenant probes
//   POST /api/phase7-e2e?stage=cleanup           — best-effort teardown (rerunnable)
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
  runPhase7SetupInit,
  runPhase7SetupOrgA,
  runPhase7SetupOrgB,
  runPhase7SetupBase,
  runPhase7SetupAuth,
  runPhase7SetupRentalCore,
  runPhase7SetupBooking,
  runPhase7SetupMaintenance,
  type Phase7StageResult,
} from "@/lib/auth/phase7-e2e.server";

type Stage =
  | "setup"
  | "setup-init"
  | "setup-org-a"
  | "setup-org-b"
  | "setup-base"
  | "setup-auth"
  | "setup-rental-core"
  | "setup-booking"
  | "setup-maintenance"
  | "hydration"
  | "isolation"
  | "cleanup";

function isStage(value: string | null): value is Stage {
  return (
    value === "setup" ||
    value === "setup-init" ||
    value === "setup-org-a" ||
    value === "setup-org-b" ||
    value === "setup-base" ||
    value === "setup-auth" ||
    value === "setup-rental-core" ||
    value === "setup-booking" ||
    value === "setup-maintenance" ||
    value === "hydration" ||
    value === "isolation" ||
    value === "cleanup"
  );
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
            const runId =
              new URL(request.url).searchParams.get("runId") ?? undefined;
            if (stageParam === "setup")
              return jsonResponse(await runPhase7Setup());
            if (stageParam === "setup-init")
              return jsonResponse(await runPhase7SetupInit());
            if (stageParam === "setup-org-a")
              return jsonResponse(await runPhase7SetupOrgA(runId));
            if (stageParam === "setup-org-b")
              return jsonResponse(await runPhase7SetupOrgB(runId));
            if (stageParam === "setup-base")
              return jsonResponse(await runPhase7SetupBase(runId));
            if (stageParam === "setup-auth")
              return jsonResponse(await runPhase7SetupAuth());
            if (stageParam === "setup-rental-core")
              return jsonResponse(await runPhase7SetupRentalCore(runId));
            if (stageParam === "setup-booking")
              return jsonResponse(await runPhase7SetupBooking(runId));
            if (stageParam === "setup-maintenance")
              return jsonResponse(await runPhase7SetupMaintenance(runId));
            if (stageParam === "hydration")
              return jsonResponse(await runPhase7Hydration(runId));
            if (stageParam === "isolation")
              return jsonResponse(await runPhase7Isolation(runId));
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
