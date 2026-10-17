// Customer Portal Lite — production E2E route (raw HTTP). Not a server
// function because the orchestrator is a one-shot diagnostic that returns a
// plain JSON report via a raw Response. Uses server.handlers.POST exactly
// like the Phase 4 E2E route so the caller gets JSON, not SSR HTML.

import { createFileRoute } from "@tanstack/react-router";
import { runPortalE2E } from "@/lib/auth/portal-e2e.server";

export const Route = createFileRoute("/api/portal-e2e")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runPortalE2E();
          return new Response(JSON.stringify(result), {
            status: result.passed ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return new Response(
            JSON.stringify({
              passed: false,
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
