import { createFileRoute } from "@tanstack/react-router";
import { runPhase3E2E } from "@/lib/auth/phase3-e2e.server";

export const Route = createFileRoute("/api/phase3-e2e")({
  server: {
    handlers: {
      POST: async () => {
        const result = await runPhase3E2E();
        return new Response(JSON.stringify(result), {
          status: result.passed ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
