import { it, expect, vi } from "vitest";
import { runPhase5E2E } from "@/lib/auth/phase5-e2e.server";
it("Phase 5 live E2E reports not run when server credentials are missing", async () => {
  vi.stubEnv("SUPABASE_URL", "");
  try {
    const result = await runPhase5E2E();
    expect(result.ran).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.steps[0]).toMatchObject({ step: "server_config", ok: false });
  } finally {
    vi.unstubAllEnvs();
  }
});
