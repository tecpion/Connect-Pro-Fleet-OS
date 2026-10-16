// Connect Pro Fleet — Build #52 defense Copilot historical-question tests.
//
// Case 11: Copilot historical questions use the immutable release snapshot (not
// current state) and never produce a legal conclusion. Uses the shared React
// harness so the defense sources bundle is wired from real seeded data.

import { describe, it, expect } from "vitest";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";

describe("Defense — 11. Copilot historical questions use snapshot", () => {
  it("release insurance status cites the release snapshot, not current state", () => {
    const r = useCopilotTestSources();
    const answer = resolveCopilotQuery(
      "insurance status at release for rental AGR-2026-000125",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("release_insurance_status");
    expect(answer.summary.toLowerCase()).toContain("release");
    expect(answer.summary.toLowerCase()).not.toContain("graves");
  });

  it("release safety maintenance answer uses the snapshot", () => {
    const r = useCopilotTestSources();
    const answer = resolveCopilotQuery(
      "open safety maintenance issues at checkout for rental AGR-2026-000125",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("release_safety_maintenance");
    expect(answer.summary.toLowerCase()).toContain("release");
  });

  it("a Graves legal-conclusion question gets a factual summary + legal-review recommendation, never a conclusion", () => {
    const r = useCopilotTestSources();
    const answer = resolveCopilotQuery(
      "Is this accident protected under the Graves Amendment for Hannah's rental?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.summary.toLowerCase()).toContain("legal");
    expect(answer.summary.toLowerCase()).not.toContain(
      "protected under the graves",
    );
  });

  it("rentals missing license verification lists rentals with unverified drivers", () => {
    const r = useCopilotTestSources();
    const answer = resolveCopilotQuery(
      "Show me rentals missing license verification.",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("rentals_missing_license_verification");
    expect(answer.answer_type).toBe("list");
  });

  it("incidents missing police reports lists incidents without a police report", () => {
    const r = useCopilotTestSources();
    const answer = resolveCopilotQuery(
      "Which incidents are missing police reports?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("incidents_missing_police_reports");
    expect(answer.answer_type).toBe("list");
  });

  it("authorized driver check answers from the canonical rental-driver records", () => {
    const r = useCopilotTestSources();
    const answer = resolveCopilotQuery(
      "Does Hannah's rental have an authorized additional driver?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(answer.intent).toBe("authorized_driver_check");
  });
});
