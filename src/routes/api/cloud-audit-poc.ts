import { createServerFn } from "@tanstack/react-start";
import { json } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const runCloudAuditProof = createServerFn({ method: "GET" }).handler(
  async () => {
    const { runProof } = await import("@/lib/cloud-audit/poc.server");
    return runProof();
  },
);

export const Route = createFileRoute("/api/cloud-audit-poc")({
  server: {
    handlers: {
      GET: async () => {
        const result = await runCloudAuditProof();
        return json(result);
      },
    },
  },
});
