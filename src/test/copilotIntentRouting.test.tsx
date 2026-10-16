// Connect Pro Fleet — Build #47 intent-routing correction regression.
//
// Verifies the domain-first routing layer fixes the wrong-intent failures:
// fleet-wide utilization, earnings, popular-vehicle ranking, overdue-rental vs
// overdue-payment separation, deposits, open tasks, fleet count, and that no
// customer-facing answer exposes Build # / authoritative-evaluator / raw
// snake_case enum / internal debug wording.

import { describe, it, expect } from "vitest";
import { resolveCopilotIntent } from "@/lib/copilotResolver";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  FULL_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";

describe("Build #47 — domain-first intent routing (resolveCopilotIntent)", () => {
  const cases: Array<[string, string]> = [
    ["what is my utilization rate", "fleet_utilization"],
    ["my fleet utilization rate", "fleet_utilization"],
    ["how much did I earn this year", "earnings_summary"],
    ["what is the most popular vehicle in my fleet", "popular_vehicle"],
    ["do I have any overdue rentals", "overdue_returns"],
    ["how much do I have in deposits this year", "deposit_summary"],
    ["do I have any late payments", "overdue_accounts"],
    ["do I have any open task", "open_tasks"],
    [
      "how many vehicles do I currently have rented versus what's available",
      "fleet_count",
    ],
  ];
  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      expect(resolveCopilotIntent(query)).toBe(expected);
    });
  }
});

describe("Build #47 — overdue rental vs overdue payment separation", () => {
  it("rental-overdue phrases route to overdue_returns", () => {
    expect(resolveCopilotIntent("do I have any overdue rentals")).toBe(
      "overdue_returns",
    );
    expect(resolveCopilotIntent("any overdue rental")).toBe("overdue_returns");
    expect(resolveCopilotIntent("late return")).toBe("overdue_returns");
    expect(resolveCopilotIntent("vehicle not returned")).toBe(
      "overdue_returns",
    );
  });
  it("payment-overdue phrases route to overdue_accounts", () => {
    expect(resolveCopilotIntent("do I have any late payments")).toBe(
      "overdue_accounts",
    );
    expect(resolveCopilotIntent("who hasn't paid")).toBe("overdue_accounts");
    expect(resolveCopilotIntent("unpaid rentals")).toBe("overdue_accounts");
  });
});

describe("Build #47 — answer-level routing + richness", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);

  it("utilization rate → fleet-wide utilization (not a single vehicle)", () => {
    const a = resolveCopilotQuery(
      "what is my utilization rate",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("fleet_utilization");
    expect(/fleet utilization/i.test(a.summary)).toBe(true);
  });

  it("earnings → distinct revenue / cash / contribution", () => {
    const a = resolveCopilotQuery(
      "how much did I earn this year",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("earnings_summary");
    expect(/revenue/i.test(a.summary)).toBe(true);
    expect(/collect/i.test(a.summary)).toBe(true);
  });

  it("most popular vehicle → ranking clarification, not fleet count", () => {
    const a = resolveCopilotQuery(
      "what is the most popular vehicle in my fleet",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("popular_vehicle");
    expect(a.intent).not.toBe("fleet_count");
    expect(/do you mean/i.test(a.summary)).toBe(true);
  });

  it("overdue rentals → overdue_returns (rental domain, not payments)", () => {
    const a = resolveCopilotQuery(
      "do I have any overdue rentals",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("overdue_returns");
    expect(a.intent).not.toBe("overdue_accounts");
  });

  it("deposits → deposit_summary (not fleet count)", () => {
    const a = resolveCopilotQuery(
      "how much do I have in deposits this year",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("deposit_summary");
    expect(a.intent).not.toBe("fleet_count");
    expect(/hold/i.test(a.summary)).toBe(true);
  });

  it("late payments → overdue_accounts", () => {
    const a = resolveCopilotQuery(
      "do I have any late payments",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("overdue_accounts");
  });

  it("open task → open_tasks (not fleet count)", () => {
    const a = resolveCopilotQuery(
      "do I have any open task",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("open_tasks");
    expect(a.intent).not.toBe("fleet_count");
  });

  it("rented vs available → fleet_count status breakdown", () => {
    const a = resolveCopilotQuery(
      "how many vehicles do I currently have rented versus what's available",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("fleet_count");
  });
});

describe("Build #47 — customer-facing wording cleanup", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources, FULL_PERMS);
  const queries = [
    "what is my utilization rate",
    "how much did I earn this year",
    "what is the most popular vehicle in my fleet",
    "do I have any overdue rentals",
    "how much do I have in deposits this year",
    "do I have any late payments",
    "do I have any open task",
    "how many vehicles do I currently have rented versus what's available",
    "who is already late",
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
      // Raw snake_case status enums must not appear.
      expect(text).not.toMatch(
        /\b(out_of_service|in_progress|return_pending|payment_due)\b/,
      );
    });
  }
});
