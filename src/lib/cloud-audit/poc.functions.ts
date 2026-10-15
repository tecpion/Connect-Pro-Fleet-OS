// Cloud audit proof-of-concept — thin server-function wrapper.
// Runtime logic lives in poc.server.ts (server-only, not in client bundle).
import { createServerFn } from "@tanstack/react-start";

export const runCloudAuditProof = createServerFn({ method: "GET" }).handler(
  async () => {
    const { runProof } = await import("./poc.server");
    return runProof();
  },
);
