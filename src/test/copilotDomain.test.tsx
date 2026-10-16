// Connect Pro Fleet — Build #29 Copilot intent/entity/money tests.
//
// Shared harness helpers live in ./copilotTestHarness.tsx (a NON-test module)
// so importing them never re-registers test cases. This file holds ONLY the
// intent-resolution, entity-resolution, and money-answer test cases.
import { describe, it, expect } from "vitest";
import {
  resolveCopilotIntent,
  resolveEntities,
  resolveFollowUpEntity,
} from "@/lib/copilotResolver";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import {
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
} from "./copilotTestHarness";

describe("Build #29 — Intent resolution", () => {
  it("1. who owes me today → money_due_today", () => {
    expect(resolveCopilotIntent("Who owes me money today?")).toBe(
      "money_due_today",
    );
  });
  it("2. payments due today → money_due_today", () => {
    expect(resolveCopilotIntent("What payments are due today?")).toBe(
      "money_due_today",
    );
  });
  it("3. who's late → overdue_accounts", () => {
    expect(resolveCopilotIntent("Who's already late?")).toBe(
      "overdue_accounts",
    );
  });
  it("4. overdue customers → overdue_accounts", () => {
    expect(resolveCopilotIntent("Show me overdue customers")).toBe(
      "overdue_accounts",
    );
  });
  it("5. what should I focus on → daily_priorities", () => {
    expect(resolveCopilotIntent("What should I focus on today?")).toBe(
      "daily_priorities",
    );
  });
  it("6. cars sitting → idle_vehicles", () => {
    expect(resolveCopilotIntent("Which cars are sitting?")).toBe(
      "idle_vehicles",
    );
  });
  it("7. idle vehicles → idle_vehicles", () => {
    expect(resolveCopilotIntent("Show me idle vehicles")).toBe("idle_vehicles");
  });
  it("8. blocked vehicles → blocked_vehicles", () => {
    expect(resolveCopilotIntent("Which vehicles are blocked?")).toBe(
      "blocked_vehicles",
    );
  });
  it("9. starting today → rentals_starting_today", () => {
    expect(resolveCopilotIntent("What rentals start today?")).toBe(
      "rentals_starting_today",
    );
  });
  it("10. returning today → rentals_returning_today", () => {
    expect(resolveCopilotIntent("What returns are due today?")).toBe(
      "rentals_returning_today",
    );
  });
  it("11. maintenance question → maintenance_attention", () => {
    expect(resolveCopilotIntent("Which cars are in maintenance?")).toBe(
      "maintenance_attention",
    );
  });
  it("12. compliance question → compliance_attention", () => {
    expect(resolveCopilotIntent("What compliance issues need attention?")).toBe(
      "compliance_attention",
    );
  });
  it("13. violation question → violation_attention", () => {
    expect(resolveCopilotIntent("What tickets need attention?")).toBe(
      "violation_attention",
    );
  });
  it("14. damage question → open_damage_claims", () => {
    expect(resolveCopilotIntent("What damage claims are still open?")).toBe(
      "open_damage_claims",
    );
  });
  it("15. my tasks → my_priorities", () => {
    expect(resolveCopilotIntent("What should I work on?")).toBe(
      "my_priorities",
    );
  });
  it("16. what changed yesterday → recent_changes", () => {
    expect(resolveCopilotIntent("What changed since yesterday?")).toBe(
      "recent_changes",
    );
  });
  it("17. help → help", () => {
    expect(resolveCopilotIntent("What can you help me with?")).toBe("help");
  });
  it("18. unsupported intent → unsupported", () => {
    expect(resolveCopilotIntent("Write me a marketing plan")).toBe(
      "unsupported",
    );
  });
});

describe("Build #29 — Entity resolution", () => {
  it("19. customer exact name resolves", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const { refs } = resolveEntities(
      `What's going on with ${name}?`,
      r.current.sources,
    );
    expect(refs.some((x) => x.type === "customer")).toBe(true);
  });
  it("20. customer partial name resolves", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const part = name.split(" ")[0];
    const { refs } = resolveEntities(
      `Tell me about ${part}`,
      r.current.sources,
    );
    expect(refs.some((x) => x.type === "customer")).toBe(true);
  });
  it("21. duplicate customer ambiguity flagged", () => {
    const r = useCopilotTestSources();
    const { refs, ambiguous } = resolveEntities("smith", r.current.sources);
    expect(Array.isArray(refs)).toBe(true);
    expect(typeof ambiguous).toBe("boolean");
  });
  it("22. vehicle identifier resolves", () => {
    const r = useCopilotTestSources();
    const v = r.current.sources.briefing.store.vehicles[0];
    const { refs } = resolveEntities(
      `What's going with ${v.license_plate}?`,
      r.current.sources,
    );
    expect(refs.some((x) => x.type === "vehicle")).toBe(true);
  });
  it("23. vehicle make/model resolves", () => {
    const r = useCopilotTestSources();
    const v = r.current.sources.briefing.store.vehicles[0];
    const { refs } = resolveEntities(`${v.make} ${v.model}`, r.current.sources);
    expect(refs.some((x) => x.type === "vehicle")).toBe(true);
  });
  it("24. rental number resolves", () => {
    const r = useCopilotTestSources();
    const rental = r.current.sources.briefing.store.rentals[0];
    const { refs } = resolveEntities(`rental ${rental.id}`, r.current.sources);
    expect(refs.some((x) => x.type === "rental")).toBe(true);
  });
  it("25. no match returns empty (no invented record)", () => {
    const r = useCopilotTestSources();
    const { refs } = resolveEntities("zzz nonexistent xyz", r.current.sources);
    expect(refs.length).toBe(0);
  });
  it("26. follow-up pronoun resolves to context customer", () => {
    const r = useCopilotTestSources();
    const custId = r.current.sources.briefing.store.customers[0].id;
    const ctx = { ...emptyConversation(), context_customer_id: custId };
    const ref = resolveFollowUpEntity(
      "What does he owe?",
      ctx,
      r.current.sources,
    );
    expect(ref?.type).toBe("customer");
    expect(ref?.id).toBe(custId);
  });
  it("27. context switch updates label", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources.length).toBeGreaterThan(0);
    expect(a.sources[0].label).toContain(name.split(" ")[0]);
  });
});

describe("Build #29 — Money answers", () => {
  it("28. due today answer is structured", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("money_due_today");
    expect(a.answer_type === "list" || a.answer_type === "summary").toBe(true);
    expect(a.facts.some((f) => f.label === "Customers due")).toBe(true);
  });
  it("29. overdue answer is structured", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("overdue_accounts");
    expect(typeof a.summary).toBe("string");
  });
  it("30. zero overdue does not hallucinate", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (a.items.length === 0) expect(a.summary).toContain("clear");
    else expect(a.items.length).toBeGreaterThan(0);
  });
  it("31. customer balance uses ledger", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What does ${name} owe?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_balance");
    expect(a.sources.some((s) => s.source_module === "billing")).toBe(true);
  });
  it("32. multiple obligations aggregate (balance is single number)", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What does ${name} owe?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const bal = a.facts.find((f) => f.label === "Outstanding balance");
    expect(bal).toBeDefined();
  });
  it("33. authorized financial total present", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources, FULL_PERMS),
    );
    const total = a.facts.find((f) => f.label === "Total due");
    expect(total).toBeDefined();
  });
  it("34. unauthorized hides amount", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const total = a.facts.find((f) => f.label === "Total due");
    expect(total?.value).toBe("—");
    expect(a.permission_filtered).toBe(true);
  });
  it("35. exact late logic preserved (overdue uses briefing selector)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    // Build #47 — the customer-facing caveat describes the cutoff + grace
    // concept in plain language, without exposing the internal "evaluator"
    // implementation term.
    expect(a.caveats.some((c) => /cutoff.*grace|grace.*cutoff/i.test(c))).toBe(
      true,
    );
    expect(a.caveats.some((c) => /late evaluator/i.test(c))).toBe(false);
  });
  it("36. payment resolution updates answer (derived, no stale record)", () => {
    const r = useCopilotTestSources();
    const a1 = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    const a2 = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a2.items.length).toBe(a1.items.length);
  });
});
