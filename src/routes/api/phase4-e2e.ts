import { createFileRoute } from "@tanstack/react-router";
import { runPhase4E2E } from "@/lib/auth/phase4-e2e.server";

export const Route = createFileRoute("/api/phase4-e2e")({
  server: {
    handlers: {
      POST: async () => {
        const result = await runPhase4E2E();
        return new Response(JSON.stringify(result), {
          status: result.passed ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
