// Connect Pro Fleet — Copilot business-query + time-range routing regression.
//
// Verifies the domain-first routing fixes the wrong-intent / wrong-time-range
// failures: "what happened last week" (operational summary), "overview of
// income for last month" (finance), "any new cars added last month" (vehicle
// additions), "how many active rentals do I have" (rental count, not fleet
// count), "how many returns have I had last week" (historical returns, not
// returns due today), "give me Finance overview" (finance overview), a
// reminder/task-prep request (prepare, never auto-create), and "how many
// vehicles are currently rented" (vehicle-status count, not active-rental
// intent). Also asserts no customer-facing answer contains Build # /
// authoritative-evaluator / raw snake_case enum / internal debug wording.

import { describe, it, expect } from "vitest";
import { resolveCopilotIntent } from "@/lib/copilotResolver";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  FULL_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";

describe("Build #48 — intent routing (resolveCopilotIntent)", () => {
  const cases: Array<[string, string]> = [
    ["what happened last week", "recent_changes"],
    ["give me overview of income for last month", "finance_overview"],
    ["any new cars were added last month", "vehicle_additions"],
    ["how many active rentals do I have", "active_rentals"],
    ["how many returns have I had last week", "historical_returns"],
    ["give me Finance overview", "finance_overview"],
    ["I want you to remind me in 1 hour to call Marcus", "create_reminder"],
    ["how many vehicles are currently rented", "fleet_count"],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      expect(resolveCopilotIntent(query)).toBe(expected);
    });
  }
});

describe("Build #48 — active-rental vs rented-vehicle separation", () => {
  it("active rentals → active_rentals (rental domain, not fleet count)", () => {
    expect(resolveCopilotIntent("how many active rentals do I have")).toBe(
      "active_rentals",
    );
    expect(resolveCopilotIntent("how many rentals do I have")).toBe(
      "active_rentals",
    );
  });
  it("rented vehicles → fleet_count (vehicle status, not rental count)", () => {
    expect(resolveCopilotIntent("how many vehicles are currently rented")).toBe(
      "fleet_count",
    );
  });
});

describe("Build #48 — historical-return vs returns-due-today separation", () => {
  it("historical returns with a past range → historical_returns", () => {
    expect(resolveCopilotIntent("how many returns have I had last week")).toBe(
      "historical_returns",
    );
    expect(resolveCopilotIntent("returns did we have yesterday")).toBe(
      "historical_returns",
    );
  });
  it("returns due today → rentals_returning_today (not historical)", () => {
    expect(resolveCopilotIntent("what returns are due today")).toBe(
      "rentals_returning_today",
    );
    expect(resolveCopilotIntent("how many returns today")).toBe(
      "rentals_returning_today",
    );
  });
});

describe("Build #48 — answer-level routing + correctness", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("what happened last week → recent_changes scoped to last week", () => {
    const a = resolveCopilotQuery(
      "what happened last week",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("recent_changes");
  });

  it("income for last month → finance_overview with distinct metrics", () => {
    const a = resolveCopilotQuery(
      "give me overview of income for last month",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("finance_overview");
    expect(/revenue/i.test(a.summary)).toBe(true);
    expect(/collect/i.test(a.summary)).toBe(true);
  });

  it("new cars added last month → vehicle_additions", () => {
    const a = resolveCopilotQuery(
      "any new cars were added last month",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("vehicle_additions");
    expect(/added/i.test(a.summary)).toBe(true);
    expect(/last month/i.test(a.summary)).toBe(true);
  });

  it("active rentals → active_rentals count (not fleet count)", () => {
    const a = resolveCopilotQuery(
      "how many active rentals do I have",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("active_rentals");
    expect(a.intent).not.toBe("fleet_count");
    expect(/active/i.test(a.summary)).toBe(true);
  });

  it("returns last week → historical_returns (not 'returns due today')", () => {
    const a = resolveCopilotQuery(
      "how many returns have I had last week",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("historical_returns");
    expect(a.intent).not.toBe("rentals_returning_today");
    expect(/last week/i.test(a.summary)).toBe(true);
    // Must NOT say "returns due today".
    expect(/due today/i.test(a.summary)).toBe(false);
  });

  it("finance overview → finance_overview", () => {
    const a = resolveCopilotQuery(
      "give me Finance overview",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("finance_overview");
  });

  it("remind me in 1 hour → create_reminder with a prepared task preview", () => {
    const a = resolveCopilotQuery(
      "I want you to remind me in 1 hour to call Marcus",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("create_reminder");
    // A prepared preview must exist (never auto-created).
    expect(a.task_preview).toBeDefined();
    expect(a.task_preview!.length).toBeGreaterThanOrEqual(1);
    // The title should reflect the action.
    expect(/call marcus/i.test(a.task_preview![0].title)).toBe(true);
    // It must ask for approval, not claim it created the task.
    expect(/want me to create/i.test(a.summary)).toBe(true);
  });

  it("rented vehicles → fleet_count (vehicle status)", () => {
    const a = resolveCopilotQuery(
      "how many vehicles are currently rented",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("fleet_count");
    expect(a.intent).not.toBe("active_rentals");
  });
});

describe("Build #48 — customer-facing wording cleanup", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);
  const queries = [
    "what happened last week",
    "give me overview of income for last month",
    "any new cars were added last month",
    "how many active rentals do I have",
    "how many returns have I had last week",
    "give me Finance overview",
    "I want you to remind me in 1 hour to call Marcus",
    "how many vehicles are currently rented",
  ];
  for (const q of queries) {
    it(`no Build # / evaluator / raw enum in: "${q}"`, () => {
      const a = resolveCopilotQuery(q, emptyConversation(), ctx);
      const text = [
        a.summary,
        ...a.caveats,
        ...a.facts.map((f) => String(f.value)),
        ...a.facts.map((f) => f.label),
      ].join(" ");
      expect(text).not.toMatch(/Build #/i);
      expect(text).not.toMatch(/exact-time late evaluator/i);
      expect(text).not.toMatch(/authoritative.*evaluator/i);
      expect(text).not.toMatch(
        /\b(out_of_service|in_progress|return_pending|payment_due)\b/,
      );
    });
  }
});
