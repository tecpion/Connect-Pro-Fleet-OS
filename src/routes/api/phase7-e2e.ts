import { createFileRoute } from "@tanstack/react-router";
import { runPhase7E2E } from "@/lib/auth/phase7-e2e.server";

export const Route = createFileRoute("/api/phase7-e2e")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runPhase7E2E();
          return new Response(JSON.stringify(result), {
            status: result.passed ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
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
