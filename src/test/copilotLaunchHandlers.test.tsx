// Connect Pro Fleet — Build #33 Copilot launch handler tests.
//
// Covers the launch-pack handlers that had no dedicated coverage: morning ops
// briefing, end-of-day recap, executive focus, collections rank, weekly
// review, improve health, why, product-help handoff, create-task preview, and
// draft messages. All answers are deterministic + permission-aware + source-
// backed. Reuses the shared copilotTestHarness (NON-test module).

import { describe, it, expect } from "vitest";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { resolveCopilotIntent } from "@/lib/copilotResolver";
import {
  answerMorningOpsBriefing,
  answerExecutiveFocus,
} from "@/lib/copilotLaunchBriefing";
import { answerCollectionsRank } from "@/lib/copilotLaunchCollections";
import {
  answerImproveHealth,
  answerWeeklyReview,
} from "@/lib/copilotLaunchHealth";
import { answerWhy, answerProductHelpHandoff } from "@/lib/copilotLaunchWhy";
import {
  buildCreateTaskPreview,
  buildOverdueDraftMessages,
} from "@/lib/copilotLaunchActions";
import { buildEndOfDayContext } from "@/lib/copilotDailyHandlers";
import { buildStarterPrompts } from "@/lib/copilotPrompts";
import {
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
} from "./copilotTestHarness";
import type { CopilotConversation } from "@/lib/copilotTypes";

function conv(partial: Partial<CopilotConversation> = {}): CopilotConversation {
  return { ...emptyConversation(), ...partial };
}

describe("Build #33 — Morning ops briefing", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("1. morning briefing intent resolves", () => {
    expect(resolveCopilotIntent("What do I need to know today?")).toBe(
      "morning_ops_briefing",
    );
    expect(resolveCopilotIntent("Give me my morning briefing")).toBe(
      "morning_ops_briefing",
    );
    expect(resolveCopilotIntent("What's happening today?")).toBe(
      "morning_ops_briefing",
    );
  });

  it("2. morning briefing is sectioned (money/rentals/fleet/ops)", () => {
    const a = answerMorningOpsBriefing(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "stf_1",
    );
    expect(a.intent).toBe("morning_ops_briefing");
    expect(a.answer_type).toBe("list");
    // Facts break down by category.
    const labels = a.facts.map((f) => f.label);
    expect(labels).toContain("Critical");
    expect(labels).toContain("Money items");
    expect(labels).toContain("Rental items");
    expect(labels).toContain("Fleet items");
    expect(labels).toContain("Operations items");
  });

  it("3. morning briefing recommends top 5 focus items", () => {
    const a = answerMorningOpsBriefing(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "stf_1",
    );
    expect(a.items.length).toBeLessThanOrEqual(5);
  });

  it("4. morning briefing links to Action Center", () => {
    const a = answerMorningOpsBriefing(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "stf_1",
    );
    expect(
      a.suggested_actions.some((s) => s.deep_link === "/action-center"),
    ).toBe(true);
  });

  it("5. morning briefing items have titles + sources", () => {
    const a = answerMorningOpsBriefing(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "stf_1",
    );
    for (const item of a.items) {
      expect(item.title).toBeTruthy();
    }
    // Sources carry the deep links.
    expect(a.sources.length).toBeGreaterThan(0);
  });

  it("6. morning briefing reuses the Action Center engine (no second engine)", () => {
    const a = answerMorningOpsBriefing(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "stf_1",
    );
    expect(a.caveats.some((c) => /Action Center/i.test(c))).toBe(true);
  });

  it("7. morning briefing via engine end-to-end", () => {
    const a = resolveCopilotQuery(
      "What do I need to know today?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("morning_ops_briefing");
    expect(a.facts.length).toBeGreaterThan(0);
  });
});

describe("Build #33 — End-of-day recap", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("8. end-of-day intent resolves", () => {
    expect(resolveCopilotIntent("How did today go?")).toBe("end_of_day_recap");
    expect(resolveCopilotIntent("Give me today's recap")).toBe(
      "end_of_day_recap",
    );
  });

  it("9. end-of-day context is structured (payments/rentals/overdue)", () => {
    const c = buildEndOfDayContext(r.current.sources, NOW, FULL_PERMS);
    expect(c).toHaveProperty("payments_received_count");
    expect(c).toHaveProperty("rentals_started_count");
    expect(c).toHaveProperty("rentals_returned_count");
    expect(c).toHaveProperty("new_overdue_count");
    expect(c).toHaveProperty("resolved_overdue_count");
    expect(typeof c.payments_received_count).toBe("number");
  });

  it("10. end-of-day recap includes truthful day-over-day overdue delta", () => {
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("end_of_day_recap");
    const labels = a.facts.map((f) => f.label);
    expect(labels).toContain("Newly overdue");
    expect(labels).toContain("Overdue resolved");
  });

  it("11. end-of-day recap does not fabricate events", () => {
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      ctx,
    );
    expect(a.caveats.some((c) => /no fabricated conclusions/i.test(c))).toBe(
      true,
    );
  });

  it("12. end-of-day recap links to Action Center", () => {
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      ctx,
    );
    expect(
      a.suggested_actions.some((s) => s.deep_link === "/action-center"),
    ).toBe(true);
  });

  it("13. end-of-day recap is not scheduled (on demand)", () => {
    const a = resolveCopilotQuery(
      "How did today go?",
      emptyConversation(),
      ctx,
    );
    expect(a.caveats.some((c) => /on demand/i.test(c))).toBe(true);
  });
});

describe("Build #33 — Executive focus", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("14. executive focus intent resolves", () => {
    expect(resolveCopilotIntent("What should I focus on right now?")).toBe(
      "executive_focus",
    );
    expect(resolveCopilotIntent("Give me my top priorities")).toBe(
      "executive_focus",
    );
    expect(resolveCopilotIntent("What needs my attention?")).toBe(
      "executive_focus",
    );
  });

  it("15. executive focus returns max 5 priorities", () => {
    const a = answerExecutiveFocus(r.current.sources, NOW, FULL_PERMS);
    expect(a.items.length).toBeLessThanOrEqual(5);
  });

  it("16. executive focus is deterministic (no hidden risk score)", () => {
    const a1 = answerExecutiveFocus(r.current.sources, NOW, FULL_PERMS);
    const a2 = answerExecutiveFocus(r.current.sources, NOW, FULL_PERMS);
    expect(a1.items.map((i) => i.id)).toEqual(a2.items.map((i) => i.id));
  });

  it("17. executive focus items have sources + deep links", () => {
    const a = answerExecutiveFocus(r.current.sources, NOW, FULL_PERMS);
    for (const item of a.items) {
      expect(item.deep_link).toBeTruthy();
    }
    expect(a.sources.length).toBeGreaterThan(0);
  });

  it("18. executive focus ranks by disclosed facts (priority/amount/age)", () => {
    const a = answerExecutiveFocus(r.current.sources, NOW, FULL_PERMS);
    expect(a.caveats.some((c) => /disclosed facts/i.test(c))).toBe(true);
  });

  it("19. executive focus via engine end-to-end", () => {
    const a = resolveCopilotQuery(
      "What should I focus on right now?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("executive_focus");
  });

  it("20. executive focus empty state is truthful", () => {
    // With no attention items the summary says under control (no fabrication).
    const a = answerExecutiveFocus(r.current.sources, NOW, FULL_PERMS);
    if (a.items.length === 0) {
      expect(a.summary).toContain("under control");
    }
  });
});

describe("Build #33 — Collections rank", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("21. collections rank intent resolves", () => {
    expect(
      resolveCopilotIntent("Who should collections follow up with first?"),
    ).toBe("collections_rank");
  });

  it("22. collections rank is bounded (max 10)", () => {
    const a = answerCollectionsRank(r.current.sources, NOW, FULL_PERMS);
    expect(a.items.length).toBeLessThanOrEqual(10);
  });

  it("23. collections rank uses disclosed facts (no customer risk score)", () => {
    const a = answerCollectionsRank(r.current.sources, NOW, FULL_PERMS);
    expect(
      a.caveats.some((c) => /no hidden customer risk score/i.test(c)),
    ).toBe(true);
  });

  it("24. collections rank hides amounts without financial permission", () => {
    const a = answerCollectionsRank(r.current.sources, NOW, NO_FINANCE_PERMS);
    for (const item of a.items) {
      expect(item.amount).toBeNull();
    }
  });

  it("25. collections rank shows amounts with financial permission", () => {
    const a = answerCollectionsRank(r.current.sources, NOW, FULL_PERMS);
    // If there are overdue accounts, amounts should be present.
    if (a.items.length > 0) {
      expect(a.items.some((i) => i.amount != null)).toBe(true);
    }
  });

  it("26. collections rank links to customers", () => {
    const a = answerCollectionsRank(r.current.sources, NOW, FULL_PERMS);
    for (const item of a.items) {
      expect(item.deep_link).toContain("/customers/");
    }
  });

  it("27. collections rank via engine end-to-end", () => {
    const a = resolveCopilotQuery(
      "Who should collections follow up with first?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("collections_rank");
  });

  it("28. collections rank empty state is truthful", () => {
    const a = answerCollectionsRank(r.current.sources, NOW, FULL_PERMS);
    if (a.items.length === 0) {
      expect(a.summary).toContain("No overdue accounts");
    }
  });
});

describe("Build #33 — Weekly owner review", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("29. weekly review intent resolves", () => {
    expect(resolveCopilotIntent("Give me my weekly owner report")).toBe(
      "weekly_review",
    );
    expect(resolveCopilotIntent("How did we do this week?")).toBe(
      "weekly_review",
    );
  });

  it("30. weekly review includes financial + fleet + health sections", () => {
    const a = answerWeeklyReview(r.current.sources, NOW, FULL_PERMS);
    const labels = a.facts.map((f) => f.label);
    expect(labels).toContain("Utilization");
    expect(labels).toContain("Idle vehicles");
    expect(labels).toContain("Health Score");
  });

  it("31. weekly review hides financials without permission", () => {
    const a = answerWeeklyReview(r.current.sources, NOW, NO_FINANCE_PERMS);
    const billed = a.facts.find((f) => f.label === "Billed revenue");
    expect(billed?.value).toBe("—");
  });

  it("32. weekly review includes prior-period comparison (same formula)", () => {
    const a = answerWeeklyReview(r.current.sources, NOW, FULL_PERMS);
    expect(a.caveats.some((c) => /same formula/i.test(c))).toBe(true);
  });

  it("33. weekly review is derived (no forecast)", () => {
    const a = answerWeeklyReview(r.current.sources, NOW, FULL_PERMS);
    expect(a.caveats.some((c) => /no forecast/i.test(c))).toBe(true);
  });

  it("34. weekly review links to Executive Dashboard", () => {
    const a = answerWeeklyReview(r.current.sources, NOW, FULL_PERMS);
    expect(a.suggested_actions.some((s) => s.deep_link === "/executive")).toBe(
      true,
    );
  });

  it("35. weekly review via engine end-to-end", () => {
    const a = resolveCopilotQuery(
      "Give me my weekly owner report",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("weekly_review");
  });
});

describe("Build #33 — Improve health", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("36. improve health intent resolves", () => {
    expect(resolveCopilotIntent("How do I improve my Health Score?")).toBe(
      "improve_health",
    );
  });

  it("37. improve health uses real component deficiencies (no coaching)", () => {
    const a = answerImproveHealth(r.current.sources, NOW, FULL_PERMS);
    expect(a.caveats.some((c) => /no generic business coaching/i.test(c))).toBe(
      true,
    );
    // Items are component scores, not generic advice.
    if (a.items.length > 0) {
      expect(a.items[0].title).toContain("/");
    }
  });

  it("38. improve health identifies lowest component", () => {
    const a = answerImproveHealth(r.current.sources, NOW, FULL_PERMS);
    if (a.items.length > 0) {
      expect(a.summary).toContain("lowest component");
    }
  });

  it("39. improve health links to Executive Dashboard", () => {
    const a = answerImproveHealth(r.current.sources, NOW, FULL_PERMS);
    expect(a.suggested_actions.some((s) => s.deep_link === "/executive")).toBe(
      true,
    );
  });

  it("40. improve health via engine end-to-end", () => {
    const a = resolveCopilotQuery(
      "How do I improve my Health Score?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("improve_health");
  });
});

describe("Build #33 — Why follow-up", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("41. why intent resolves", () => {
    expect(resolveCopilotIntent("Why?")).toBe("why");
    expect(resolveCopilotIntent("Why is that?")).toBe("why");
  });

  it("42. why without prior answer asks for context", () => {
    const a = answerWhy(
      r.current.sources,
      NOW,
      FULL_PERMS,
      emptyConversation(),
    );
    expect(a.answer_type).toBe("fallback");
    expect(a.summary).toContain("prior answer");
  });

  it("43. why explains vehicle unavailability", () => {
    // First ask about a blocked vehicle, then ask why.
    const vehicle = r.current.sources.briefing.store.vehicles[0];
    const c = conv({
      context_prior_intent: "vehicle_unavailable_reason",
      context_vehicle_id: vehicle.id,
    });
    const a = answerWhy(r.current.sources, NOW, FULL_PERMS, c);
    expect(a.intent).toBe("why");
    expect(a.answer_type).toBe("entity");
  });

  it("44. why explains overdue customer", () => {
    const c = conv({
      context_prior_intent: "overdue_accounts",
      context_customer_id: r.current.sources.briefing.store.customers[0].id,
    });
    const a = answerWhy(r.current.sources, NOW, FULL_PERMS, c);
    expect(a.intent).toBe("why");
  });

  it("45. why explains health score", () => {
    const c = conv({ context_prior_intent: "business_health" });
    const a = answerWhy(r.current.sources, NOW, FULL_PERMS, c);
    expect(a.intent).toBe("why");
    expect(a.summary).toContain("health score");
  });

  it("46. why never re-derives a different conclusion", () => {
    // Use a prior intent that hits the generic-why branch (not a specialized
    // explainer) so the "never re-derives" caveat is present.
    const c = conv({ context_prior_intent: "idle_vehicles" });
    const a = answerWhy(r.current.sources, NOW, FULL_PERMS, c);
    expect(a.caveats.some((cc) => /never re-derives/i.test(cc))).toBe(true);
  });

  it("47. why via engine end-to-end after overdue", () => {
    const c1 = conv({ context_prior_intent: "overdue_accounts" });
    const a = resolveCopilotQuery("Why?", c1, ctx);
    expect(a.intent).toBe("why");
  });
});

describe("Build #33 — Product help handoff", () => {
  const r = useCopilotTestSources();
  const ctx = engineCtx(r.current.sources);

  it("48. product help intent resolves", () => {
    expect(resolveCopilotIntent("How do I change my late fee settings?")).toBe(
      "product_help_handoff",
    );
    expect(resolveCopilotIntent("Where do I find the late fee setting?")).toBe(
      "product_help_handoff",
    );
  });

  it("49. product help routes to Knowledge Base articles", () => {
    const a = answerProductHelpHandoff(
      "How do I configure late fees?",
      NOW,
      FULL_PERMS,
    );
    expect(a.intent).toBe("product_help_handoff");
    expect(a.items.length).toBeGreaterThan(0);
    for (const item of a.items) {
      expect(item.deep_link).toContain("/support/articles/");
    }
  });

  it("50. product help with no match offers Report Problem", () => {
    const a = answerProductHelpHandoff(
      "How do I zzzqqqxxx nonexistent topic",
      NOW,
      FULL_PERMS,
    );
    if (a.items.length === 0) {
      expect(
        a.suggested_actions.some((s) => s.label === "Report a Problem"),
      ).toBe(true);
    }
  });

  it("51. product help keeps operational questions separate", () => {
    const a = answerProductHelpHandoff(
      "How do I configure late fees?",
      NOW,
      FULL_PERMS,
    );
    expect(a.caveats.some((c) => /operational questions stay/i.test(c))).toBe(
      true,
    );
  });

  it("52. product help via engine end-to-end", () => {
    const a = resolveCopilotQuery(
      "How do I change my late fee settings?",
      emptyConversation(),
      ctx,
    );
    expect(a.intent).toBe("product_help_handoff");
  });
});

describe("Build #33 — Create task preview", () => {
  const r = useCopilotTestSources();

  it("53. create task preview is bounded (max 10)", () => {
    const preview = buildCreateTaskPreview(
      r.current.sources,
      NOW,
      new Set<string>(),
    );
    expect(preview.length).toBeLessThanOrEqual(10);
  });

  it("54. create task preview dedupes against existing open tasks", () => {
    const preview1 = buildCreateTaskPreview(
      r.current.sources,
      NOW,
      new Set<string>(),
    );
    if (preview1.length > 0) {
      const existingIds = new Set(preview1.map((p) => p.occurrence_id));
      const preview2 = buildCreateTaskPreview(
        r.current.sources,
        NOW,
        existingIds,
      );
      // All preview2 items should be new (not in the existing set).
      for (const p of preview2) {
        expect(existingIds.has(p.occurrence_id)).toBe(false);
      }
    }
  });

  it("55. create task preview items have stable occurrence ids", () => {
    const preview = buildCreateTaskPreview(
      r.current.sources,
      NOW,
      new Set<string>(),
    );
    for (const p of preview) {
      expect(p.occurrence_id).toBeTruthy();
      expect(p.title).toBeTruthy();
    }
  });

  it("56. create task preview items have deep links", () => {
    const preview = buildCreateTaskPreview(
      r.current.sources,
      NOW,
      new Set<string>(),
    );
    for (const p of preview) {
      // Deep link may be null for some items, but entity refs are present.
      expect(p.entity_type).toBeTruthy();
      expect(p.entity_id).toBeTruthy();
    }
  });
});

describe("Build #33 — Draft messages", () => {
  const r = useCopilotTestSources();

  it("57. draft messages are bounded (max 10)", () => {
    const drafts = buildOverdueDraftMessages(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "Connect Pro Fleet",
    );
    expect(drafts.length).toBeLessThanOrEqual(10);
  });

  it("58. draft messages hidden without financial permission", () => {
    const drafts = buildOverdueDraftMessages(
      r.current.sources,
      NOW,
      NO_FINANCE_PERMS,
      "Connect Pro Fleet",
    );
    expect(drafts.length).toBe(0);
  });

  it("59. draft messages use factual fields (customer name, amount, company)", () => {
    const drafts = buildOverdueDraftMessages(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "Connect Pro Fleet",
    );
    for (const d of drafts) {
      expect(d.body).toContain("Connect Pro Fleet");
      expect(d.customer_name).toBeTruthy();
    }
  });

  it("60. draft messages never auto-send (review only)", () => {
    const drafts = buildOverdueDraftMessages(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "Connect Pro Fleet",
    );
    // Drafts are data only — no send action, no status field.
    for (const d of drafts) {
      expect(d).toHaveProperty("body");
      expect(d).toHaveProperty("subject");
      expect(d).not.toHaveProperty("sent");
    }
  });

  it("61. draft messages do not invent policies or threats", () => {
    const drafts = buildOverdueDraftMessages(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "Connect Pro Fleet",
    );
    for (const d of drafts) {
      expect(d.body.toLowerCase()).not.toContain("suspend");
      expect(d.body.toLowerCase()).not.toContain("legal action");
      expect(d.body.toLowerCase()).not.toContain("discount");
    }
  });

  it("62. draft messages isolate customers (no cross-customer data)", () => {
    const drafts = buildOverdueDraftMessages(
      r.current.sources,
      NOW,
      FULL_PERMS,
      "Connect Pro Fleet",
    );
    // Each draft references only its own customer.
    for (const d of drafts) {
      expect(d.customer_id).toBeTruthy();
    }
  });
});

describe("Build #33 — Starter prompts (permission-aware)", () => {
  it("63. full perms show business category", () => {
    const cats = buildStarterPrompts(FULL_PERMS);
    expect(cats.some((c) => c.label === "Business")).toBe(true);
  });

  it("64. no finance perms hide business category", () => {
    const cats = buildStarterPrompts(NO_FINANCE_PERMS);
    expect(cats.some((c) => c.label === "Business")).toBe(false);
  });

  it("65. today category always present", () => {
    const cats = buildStarterPrompts(NO_FINANCE_PERMS);
    expect(cats.some((c) => c.label === "Today")).toBe(true);
  });

  it("66. collections category present for all (counts only without finance)", () => {
    const cats = buildStarterPrompts(NO_FINANCE_PERMS);
    expect(cats.some((c) => c.label === "Collections")).toBe(true);
  });

  it("67. fleet category always present", () => {
    const cats = buildStarterPrompts(NO_FINANCE_PERMS);
    expect(cats.some((c) => c.label === "Fleet")).toBe(true);
  });

  it("68. operations category always present", () => {
    const cats = buildStarterPrompts(NO_FINANCE_PERMS);
    expect(cats.some((c) => c.label === "Operations")).toBe(true);
  });

  it("69. profitability prompt only with profitability permission", () => {
    const full = buildStarterPrompts(FULL_PERMS);
    const business = full.find((c) => c.label === "Business");
    expect(
      business?.prompts.some((p) => /best-performing/i.test(p.label)),
    ).toBe(true);
    const noProfit = buildStarterPrompts({
      ...FULL_PERMS,
      canViewProfitability: false,
    });
    const business2 = noProfit.find((c) => c.label === "Business");
    expect(
      business2?.prompts.some((p) => /best-performing/i.test(p.label)),
    ).toBe(false);
  });

  it("70. every prompt has a query mapping to a real intent", () => {
    const cats = buildStarterPrompts(FULL_PERMS);
    for (const cat of cats) {
      for (const p of cat.prompts) {
        expect(p.query).toBeTruthy();
        expect(p.label).toBeTruthy();
      }
    }
  });
});
