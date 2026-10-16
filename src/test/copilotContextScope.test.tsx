// Connect Pro Fleet — Copilot context + query-scope regression.
//
// Verifies the scope model (fleet-wide vs single-record), conversational
// follow-ups, time modifiers, "most popular vehicle" clarification, wake
// phrases, and customer-facing wording cleanup (no Build #, no raw enums, no
// debug text).

import { describe, it, expect } from "vitest";
import { resolveCopilotIntent } from "@/lib/copilotResolver";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { resolveVehicleScope } from "@/lib/copilotScope";
import { detectTimeModifier } from "@/lib/copilotTimeModifier";
import {
  NOW,
  FULL_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";

describe("Copilot context — wake phrases", () => {
  it('"co pilot" is treated as a greeting', () => {
    const r = useCopilotTestSources();
    const ctx = engineCtx(r.current.sources, FULL_PERMS);
    const a = resolveCopilotQuery("co pilot", emptyConversation(), ctx);
    expect(a.intent).toBe("greeting");
  });

  it('"hey copilot" is a greeting', () => {
    const r = useCopilotTestSources();
    const ctx = engineCtx(r.current.sources, FULL_PERMS);
    const a = resolveCopilotQuery("hey copilot", emptyConversation(), ctx);
    expect(a.intent).toBe("greeting");
  });
});

describe("Copilot context — fleet-wide vs single-record utilization", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it('"what is my utilization rate" → fleet-wide utilization', () => {
    const a = resolveCopilotQuery(
      "what is my utilization rate",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("fleet_utilization");
    expect(/fleet utilization/i.test(a.summary)).toBe(true);
  });

  it('"of all of my vehicles what is the current utilization" → fleet-wide', () => {
    const a = resolveCopilotQuery(
      "of all of my vehicles what is the current utilization",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("fleet_utilization");
  });

  it('"what is the utilization of the 2022 Jeep Wrangler" → single vehicle', () => {
    const a = resolveCopilotQuery(
      "what is the utilization of the 2022 Jeep Wrangler",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("vehicle_utilization");
  });

  it("scope model: fleet phrasing with no named vehicle is fleet_wide", () => {
    expect(
      resolveVehicleScope(
        "what is my utilization rate",
        emptyConversation(),
        r.current.sources,
      ),
    ).toBe("fleet_wide");
  });

  it("scope model: a named vehicle is single_record", () => {
    const v = r.current.sources.briefing.store.vehicles[0];
    const label = `${v.year} ${v.make} ${v.model}`;
    expect(
      resolveVehicleScope(
        `what is the utilization of the ${label}`,
        emptyConversation(),
        r.current.sources,
      ),
    ).toBe("single_record");
  });
});

describe("Copilot context — 'tell me more about that' after a multi-item answer", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("after a morning briefing, 'tell me more about that' clarifies (not unsupported)", () => {
    // First turn: morning briefing (multi-item answer).
    const briefing = resolveCopilotQuery(
      "morning briefing",
      emptyConversation(),
      ctx,
    );
    expect(briefing.intent).toBe("morning_ops_briefing");
    // Carry the prior context forward (as updateConversationContext would).
    const conv = {
      ...emptyConversation(),
      context_prior_intent: "morning_ops_briefing" as const,
      context_prior_result_ids: briefing.items.map((i) => i.id),
    };
    const follow = resolveCopilotQuery("tell me more about that", conv, ctx);
    // Must NOT be the generic unsupported message — it offers the prior items.
    expect(follow.summary).not.toMatch(/not quite sure how to help/i);
    // It offers the prior items to dig into.
    expect(follow.items.length).toBeGreaterThan(0);
  });
});

describe("Copilot context — 'most popular vehicle'", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("ambiguous metric → natural clarification, not unsupported", () => {
    const a = resolveCopilotQuery(
      "what's the most popular vehicle in my fleet",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("popular_vehicle");
    expect(a.answer_type).toBe("fallback");
    expect(/do you mean/i.test(a.summary)).toBe(true);
  });

  it("named metric (most rented) → answers with a vehicle", () => {
    const a = resolveCopilotQuery(
      "what's the most rented vehicle in my fleet",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("popular_vehicle");
    expect(a.answer_type).toBe("entity");
  });
});

describe("Copilot context — time-modifier follow-up", () => {
  const r = useCopilotTestSources();

  it("bare 'today' after a popular-vehicle question is a modifier", () => {
    const conv = {
      ...emptyConversation(),
      context_prior_intent: "popular_vehicle" as const,
      context_prior_result_ids: ["x1"],
    };
    expect(detectTimeModifier("today", conv)).toBe("today");
  });

  it("'what's due today' is NOT a modifier (new question)", () => {
    const conv = {
      ...emptyConversation(),
      context_prior_intent: "popular_vehicle" as const,
      context_prior_result_ids: ["x1"],
    };
    expect(detectTimeModifier("what's due today", conv)).toBeNull();
  });

  it("bare 'today' with no prior intent is not a modifier", () => {
    expect(detectTimeModifier("today", emptyConversation())).toBeNull();
  });
});

describe("Copilot context — customer-facing wording cleanup", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("no answer exposes 'Build #' to the customer", () => {
    const queries = [
      "how did today go",
      "give me my morning briefing",
      "what should I focus on",
      "what is my utilization rate",
    ];
    for (const q of queries) {
      const a = resolveCopilotQuery(q, emptyConversation(), ctx);
      const text = [
        a.summary,
        ...a.caveats,
        ...a.facts.map((f) => String(f.value)),
      ].join(" ");
      expect(text).not.toMatch(/Build #/i);
    }
  });

  it("no answer exposes raw snake_case enums", () => {
    const a = resolveCopilotQuery("how did today go", emptyConversation(), ctx);
    const text = [a.summary, ...a.caveats].join(" ");
    expect(text).not.toMatch(
      /out_of_service|in_progress|return_pending|payment_due/,
    );
  });

  it("vehicle status answer humanizes the status enum", () => {
    const v = r.current.sources.briefing.store.vehicles[0];
    const label = `${v.year} ${v.make} ${v.model}`;
    const a = resolveCopilotQuery(
      `what's going on with the ${label}`,
      emptyConversation(),
      ctx,
    );
    // The status fact must not contain a raw snake_case enum.
    const statusFact = a.facts.find((f) => f.label === "Status");
    expect(statusFact).toBeTruthy();
    expect(String(statusFact?.value)).not.toMatch(/_/);
  });
});
