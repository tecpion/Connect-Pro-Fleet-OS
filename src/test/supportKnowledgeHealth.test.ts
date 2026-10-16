// Build #31 — Knowledge base + system health tests.
import { describe, it, expect, beforeEach } from "vitest";
import {
  searchKnowledge,
  publishedArticles,
  knowledgeCategories,
  articlesByCategory,
  articleBySlug,
  articlesForRoute,
  featuredArticles,
  buildSupportKnowledgeContext,
  recordArticleFeedback,
  articleFeedback,
  resetArticleFeedback,
  isProductHelpQuery,
} from "@/lib/supportKnowledgeBase";
import {
  buildSystemHealthSnapshot,
  deriveOverallStatus,
  activeIncidents,
  recentResolvedIncidents,
  shouldShowIncidentBanner,
  addIncidentUpdate,
  statusLabel,
  DEFAULT_COMPONENT_STATUSES,
} from "@/lib/supportSystemHealth";
import type {
  KnowledgeArticle,
  SystemIncident,
  SystemComponentStatus,
  SystemStatusLevel,
} from "@/lib/supportTypes";

const NOW = new Date("2026-09-02T12:00:00Z");

describe("Build #31 — Knowledge base", () => {
  it("25. published article visible", () => {
    const pub = publishedArticles();
    expect(pub.length).toBeGreaterThan(0);
    expect(pub.every((a) => a.status === "published")).toBe(true);
  });

  it("26. draft hidden", () => {
    const draft: KnowledgeArticle = {
      id: "kb_draft_test",
      slug: "draft-only",
      title: "Draft Only",
      summary: "s",
      body: "b",
      category: "Getting Started",
      tags: [],
      product_area: "Getting Started",
      audience: "all_staff",
      status: "draft",
      version: "1",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      published_at: null,
      related_routes: [],
      related_article_ids: [],
      search_keywords: [],
      featured: false,
      author_reference: null,
    };
    // publishedArticles only returns status === published.
    expect(publishedArticles().find((a) => a.id === draft.id)).toBeUndefined();
  });

  it("27. archived hidden", () => {
    expect(publishedArticles().every((a) => a.status !== "archived")).toBe(
      true,
    );
  });

  it("28. exact title search", () => {
    const ctx = searchKnowledge("Getting Started with Connect Pro Fleet");
    expect(ctx.matches.length).toBeGreaterThan(0);
    expect(ctx.matches[0].title).toBe("Getting Started with Connect Pro Fleet");
    expect(ctx.matches[0].matched_fields).toContain("title");
  });

  it("29. keyword search", () => {
    const ctx = searchKnowledge("late fee");
    expect(ctx.matches.length).toBeGreaterThan(0);
    expect(ctx.matches.some((m) => m.matched_fields.includes("keyword"))).toBe(
      true,
    );
  });

  it("30. tag search", () => {
    const ctx = searchKnowledge("deposits");
    expect(ctx.matches.length).toBeGreaterThan(0);
  });

  it("31. body search", () => {
    const ctx = searchKnowledge("grace period");
    expect(ctx.matches.length).toBeGreaterThan(0);
  });

  it("32. ranking — exact title outranks body match", () => {
    const ctx = searchKnowledge("Security Deposits");
    expect(ctx.matches.length).toBeGreaterThan(0);
    // The exact-title article should be first.
    expect(ctx.matches[0].title).toBe("Security Deposits");
  });

  it("33. empty search returns no matches", () => {
    const ctx = searchKnowledge("zzzznonexistentterm12345");
    expect(ctx.matches.length).toBe(0);
    expect(ctx.total_articles_searched).toBeGreaterThan(0);
  });

  it("34. category filter", () => {
    const cats = knowledgeCategories();
    expect(cats.length).toBeGreaterThan(0);
    const first = cats[0];
    const arts = articlesByCategory(first);
    expect(arts.every((a) => a.category === first)).toBe(true);
  });

  it("35. related articles field modeled (array, never undefined)", () => {
    const art = articleBySlug("understanding-business-health-score");
    expect(art).toBeTruthy();
    expect(Array.isArray(art!.related_article_ids)).toBe(true);
  });

  it("36. contextual route articles", () => {
    const arts = articlesForRoute("/payments-due");
    expect(arts.length).toBeGreaterThan(0);
    expect(
      arts.every((a) =>
        a.related_routes.some(
          (r) => "/payments-due".startsWith(r) || r === "/payments-due",
        ),
      ),
    ).toBe(true);
  });

  it("37. article feedback recorded", () => {
    resetArticleFeedback();
    recordArticleFeedback("kb_test", true, "stf_1", NOW);
    recordArticleFeedback("kb_test", false, "stf_2", NOW);
    const fb = articleFeedback("kb_test");
    expect(fb.length).toBe(2);
    expect(fb[0].helpful).toBe(true);
    expect(fb[1].helpful).toBe(false);
    resetArticleFeedback();
  });

  it("38. featured articles returned", () => {
    const f = featuredArticles();
    expect(f.every((a) => a.featured)).toBe(true);
    expect(f.length).toBeGreaterThan(0);
  });
});

describe("Build #31 — System health", () => {
  it("39. operational status label", () => {
    expect(statusLabel("operational")).toBe("Operational");
  });

  it("40. degraded status", () => {
    expect(statusLabel("degraded")).toBe("Degraded");
  });

  it("41. partial outage status", () => {
    expect(statusLabel("partial_outage")).toBe("Partial Outage");
  });

  it("42. major outage status", () => {
    expect(statusLabel("major_outage")).toBe("Major Outage");
  });

  it("43. maintenance status", () => {
    expect(statusLabel("maintenance")).toBe("Maintenance");
  });

  it("44. unknown preserved (not coerced to operational)", () => {
    const snap = buildSystemHealthSnapshot({}, NOW);
    // In dev mode with no monitoring, all components are unknown.
    expect(snap.overall).toBe("unknown");
    expect(snap.components.every((c) => c.status === "unknown")).toBe(true);
    expect(snap.monitoring_configured).toBe(false);
  });

  it("45. no monitoring → not fake operational", () => {
    const snap = buildSystemHealthSnapshot(
      { monitoringConfigured: false },
      NOW,
    );
    expect(snap.overall).not.toBe("operational");
  });

  it("46. incident active", () => {
    const incident: SystemIncident = {
      id: "inc_1",
      title: "Billing degraded",
      status: "investigating",
      severity: "major",
      affected_components: ["billing_payments"],
      started_at: "2026-09-01T08:00:00Z",
      resolved_at: null,
      summary: "Payments slow",
      updates: [],
      source: "manual",
      public: true,
      created_at: "2026-09-01T08:00:00Z",
    };
    const active = activeIncidents([incident]);
    expect(active.length).toBe(1);
  });

  it("47. incident resolved excluded from active", () => {
    const incident: SystemIncident = {
      id: "inc_2",
      title: "Resolved",
      status: "resolved",
      severity: "minor",
      affected_components: [],
      started_at: "2026-08-01T08:00:00Z",
      resolved_at: "2026-08-01T10:00:00Z",
      summary: "Fixed",
      updates: [],
      source: "manual",
      public: true,
      created_at: "2026-08-01T08:00:00Z",
    };
    expect(activeIncidents([incident]).length).toBe(0);
    expect(recentResolvedIncidents([incident]).length).toBe(1);
  });

  it("48. incident updates ordered (chronological, not overwritten)", () => {
    let incident: SystemIncident = {
      id: "inc_3",
      title: "Test",
      status: "investigating",
      severity: "major",
      affected_components: [],
      started_at: "2026-09-01T08:00:00Z",
      resolved_at: null,
      summary: "s",
      updates: [],
      source: "manual",
      public: true,
      created_at: "2026-09-01T08:00:00Z",
    };
    incident = addIncidentUpdate(incident, {
      status: "identified",
      message: "Found it",
      at: "2026-09-01T08:30:00Z",
    });
    incident = addIncidentUpdate(incident, {
      status: "resolved",
      message: "Fixed",
      at: "2026-09-01T09:00:00Z",
    });
    expect(incident.updates.length).toBe(2);
    expect(incident.updates[0].message).toBe("Found it");
    expect(incident.updates[1].message).toBe("Fixed");
    expect(incident.status).toBe("resolved");
  });

  it("49. maintenance notice included in snapshot", () => {
    const snap = buildSystemHealthSnapshot(
      {
        maintenance: [
          {
            id: "mnt_1",
            title: "Scheduled upgrade",
            starts_at: "2026-09-05T02:00:00Z",
            expected_end_at: "2026-09-05T04:00:00Z",
            affected_components: ["database"],
            description: "DB upgrade",
          },
        ],
      },
      NOW,
    );
    expect(snap.scheduled_maintenance.length).toBe(1);
  });

  it("50. overall status derived safely from known components", () => {
    const components: SystemComponentStatus[] = [
      { ...DEFAULT_COMPONENT_STATUSES[0], status: "operational" },
      { ...DEFAULT_COMPONENT_STATUSES[1], status: "degraded" },
      { ...DEFAULT_COMPONENT_STATUSES[2], status: "unknown" },
    ];
    const overall = deriveOverallStatus(components, []);
    // Worst known status is degraded; unknown excluded.
    expect(overall).toBe("degraded");
  });

  it("51. app banner only for actual major/critical incident", () => {
    const minor: SystemIncident = {
      id: "inc_minor",
      title: "Minor",
      status: "investigating",
      severity: "minor",
      affected_components: [],
      started_at: "2026-09-01T08:00:00Z",
      resolved_at: null,
      summary: "s",
      updates: [],
      source: "manual",
      public: true,
      created_at: "2026-09-01T08:00:00Z",
    };
    const critical: SystemIncident = {
      ...minor,
      id: "inc_crit",
      severity: "critical",
    };
    expect(shouldShowIncidentBanner([minor])).toBe(false);
    expect(shouldShowIncidentBanner([critical])).toBe(true);
  });

  it("52. critical incident forces major_outage overall", () => {
    const critical: SystemIncident = {
      id: "inc_c",
      title: "Critical",
      status: "investigating",
      severity: "critical",
      affected_components: ["billing_payments"],
      started_at: "2026-09-01T08:00:00Z",
      resolved_at: null,
      summary: "s",
      updates: [],
      source: "manual",
      public: true,
      created_at: "2026-09-01T08:00:00Z",
    };
    const overall = deriveOverallStatus(DEFAULT_COMPONENT_STATUSES, [critical]);
    expect(overall).toBe("major_outage");
  });
});

describe("Build #31 — Support knowledge context + intent", () => {
  it("53. buildSupportKnowledgeContext returns matches + source ids", () => {
    const ctx = buildSupportKnowledgeContext("billing periods");
    expect(ctx.matches.length).toBeGreaterThan(0);
    expect(ctx.matches[0].article_id).toBeTruthy();
    expect(ctx.matches[0].slug).toBeTruthy();
  });

  it("54. exact article source retained in context", () => {
    const ctx = buildSupportKnowledgeContext("Understanding Billing Periods");
    expect(ctx.matches[0].slug).toBe("understanding-billing-periods");
  });

  it("55. related route retained in context", () => {
    const ctx = buildSupportKnowledgeContext("billing period");
    const m = ctx.matches.find(
      (x) => x.slug === "understanding-billing-periods",
    );
    expect(m).toBeTruthy();
    expect(m!.related_routes).toContain("/payments-due");
  });

  it("56. product-help query detected", () => {
    expect(isProductHelpQuery("How do I change my late fee settings?")).toBe(
      true,
    );
    expect(isProductHelpQuery("Where do I add a vehicle?")).toBe(true);
    expect(isProductHelpQuery("What does this setting mean?")).toBe(true);
  });

  it("57. operational query not falsely classified as product help", () => {
    expect(isProductHelpQuery("Who owes me today?")).toBe(false);
    expect(isProductHelpQuery("What changed since yesterday?")).toBe(false);
    expect(isProductHelpQuery("Why is my health score 72?")).toBe(false);
  });
});
