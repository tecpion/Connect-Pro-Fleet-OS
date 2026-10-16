// Connect Pro Fleet — Build #45 comprehension / normalization regression.
//
// Fleet Copilot must understand NATURAL VARIATIONS of supported questions
// instead of requiring exact programmed phrases. Speech-to-text is noisy:
// "longest idle vehicle" may arrive as "longest ideal Idol vehicle". This
// suite verifies the normalization + fuzzy intent layers route the exact
// queries from the spec to the correct supported intent, and that the
// answers carry real records (year/make/model, customer name, counts) rather
// than developer/debug text.

import { describe, it, expect } from "vitest";
import { resolveCopilotIntent } from "@/lib/copilotResolver";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  normalizeSpeechQuery,
  resolveFuzzyIntent,
} from "@/lib/copilotNormalizer";
import {
  NOW,
  FULL_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";

describe("Build #45 — Speech-to-text normalization", () => {
  it("repairs ideal/idol → idle", () => {
    expect(normalizeSpeechQuery("what is my longest ideal Idol vehicle")).toBe(
      "what is my longest idle idle vehicle",
    );
  });

  it("strips filler words", () => {
    expect(normalizeSpeechQuery("um uh what is my longest idle vehicle")).toBe(
      "what is my longest idle vehicle",
    );
  });

  it("preserves the core question when no STT errors", () => {
    expect(normalizeSpeechQuery("Who owes me money today?")).toBe(
      "who owes me money today",
    );
  });
});

describe("Build #45 — Exact query routing (intent)", () => {
  const cases: Array<[string, string]> = [
    // Idle vehicles — incl. STT garbles.
    ["what is my longest ideal Idol vehicle", "idle_vehicles"],
    ["what is my longest idle vehicle", "idle_vehicles"],
    ["which car has been sitting the longest", "idle_vehicles"],
    ["which vehicle hasn't rented", "idle_vehicles"],
    ["longest ideal vehicle", "idle_vehicles"],
    ["longest idol vehicle", "idle_vehicles"],
    // Late / overdue payments (collections).
    ["do I have any late payments", "overdue_accounts"],
    ["who hasn't paid", "overdue_accounts"],
    ["who owes me money", "money_due_today"],
    ["unpaid rentals", "overdue_accounts"],
    // Fleet count.
    ["how many cars do I currently have in my fleet", "fleet_count"],
    ["any cars do I currently have in my fleet", "fleet_count"],
    ["what's my fleet size", "fleet_count"],
    ["how many vehicles are in my fleet", "fleet_count"],
    // Briefing.
    ["briefing", "morning_ops_briefing"],
    ["give me a briefing", "morning_ops_briefing"],
    ["give me a rundown", "morning_ops_briefing"],
    ["rundown", "morning_ops_briefing"],
    ["what needs my attention today", "executive_focus"],
    // Recent changes.
    ["what changed since yesterday", "recent_changes"],
  ];

  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      expect(resolveCopilotIntent(query)).toBe(expected);
    });
  }
});

describe("Build #45 — Fuzzy fallback never over-reaches to unsupported", () => {
  it("a genuinely unsupported query stays unsupported", () => {
    expect(resolveCopilotIntent("Write me a marketing plan")).toBe(
      "unsupported",
    );
  });
  it("resolveFuzzyIntent returns unsupported for nonsense", () => {
    expect(resolveFuzzyIntent("xyzzy florp")).toBe("unsupported");
  });
});

describe("Build #45 — Answers carry real records, no debug text", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("idle-vehicles answer names the longest-idle vehicle + days", () => {
    const a = resolveCopilotQuery(
      "what is my longest ideal Idol vehicle",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("idle_vehicles");
    // The longest-idle fact must include a vehicle label (year/make/model +
    // plate), not just a bare day count.
    const longest = a.facts.find((f) => f.label === "Longest idle");
    expect(longest).toBeTruthy();
    expect(String(longest?.value)).not.toBe("—");
    // Summary mentions the longest vehicle + days.
    expect(/idle/i.test(a.summary)).toBe(true);
    // No developer/debug text in the customer-facing answer.
    expect(a.caveats.some((c) => /unmatched query/i.test(c))).toBe(false);
  });

  it("fleet-count answer reports the real vehicle total", () => {
    const a = resolveCopilotQuery(
      "how many cars do I currently have in my fleet",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("fleet_count");
    const total = a.facts.find((f) => f.label === "Total vehicles");
    expect(total).toBeTruthy();
    expect(Number(total?.value)).toBeGreaterThan(0);
    expect(/currently have/i.test(a.summary)).toBe(true);
  });

  it("briefing answer routes to the morning ops briefing", () => {
    const a = resolveCopilotQuery("briefing", emptyConversation(), ctx);
    expect(a.intent).toBe("morning_ops_briefing");
  });

  it("late-payments answer routes to overdue accounts", () => {
    const a = resolveCopilotQuery(
      "do I have any late payments",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("overdue_accounts");
  });

  it("greeting answer has no developer/debug caveat", () => {
    const a = resolveCopilotQuery("Hey Copilot", emptyConversation(), ctx);
    expect(a.intent).toBe("greeting");
    expect(a.caveats.some((c) => /no production AI provider/i.test(c))).toBe(
      false,
    );
  });

  it("unsupported answer has no 'Unmatched query' debug text", () => {
    const a = resolveCopilotQuery(
      "Write me a marketing plan",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("unsupported");
    expect(a.caveats.some((c) => /unmatched query/i.test(c))).toBe(false);
  });
});

describe("Build #45 — Intent resets each turn (no intent lock)", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("briefing then idle-vehicle question answers the idle question", () => {
    const briefing = resolveCopilotQuery(
      "give me my morning briefing",
      emptyConversation(),
      ctx,
    );
    expect(briefing.intent).toBe("morning_ops_briefing");
    const idle = resolveCopilotQuery(
      "what vehicle has been idle the longest",
      emptyConversation(),
      ctx,
    );
    expect(idle.intent).toBe("idle_vehicles");
  });

  it("briefing then 'what changed since yesterday' answers changes", () => {
    const changes = resolveCopilotQuery(
      "what changed since yesterday",
      emptyConversation(),
      ctx,
    );
    expect(changes.intent).toBe("recent_changes");
  });
});
