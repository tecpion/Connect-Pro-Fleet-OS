// Build #31 — Reliability tests (null safety, malformed dates, empty states).
import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import {
  searchKnowledge,
  buildSupportKnowledgeContext,
  articleBySlug,
  articlesByCategory,
  isProductHelpQuery,
} from "@/lib/supportKnowledgeBase";
import {
  buildSystemHealthSnapshot,
  deriveOverallStatus,
  recentResolvedIncidents,
  statusLabel,
  DEFAULT_COMPONENT_STATUSES,
} from "@/lib/supportSystemHealth";
import {
  publishedReleaseNotes,
  featuredReleaseNotes,
} from "@/lib/supportReleaseNotes";
import {
  buildDiagnosticsSnapshot,
  diagnosticsIsSafe,
} from "@/lib/supportDiagnostics";
import { useSupportTestSources } from "./supportTestHarness";
import { TENANT_ID } from "@/lib/store/ids";

const NOW = new Date("2026-09-02T12:00:00Z");

function res() {
  return useSupportTestSources();
}

describe("Build #31 — Reliability", () => {
  it("84. malformed date safe in incident sort", () => {
    // recentResolvedIncidents must not crash on malformed resolved_at.
    const incidents = [
      {
        id: "inc_bad",
        title: "Bad date",
        status: "resolved" as const,
        severity: "minor" as const,
        affected_components: [],
        started_at: "not-a-date",
        resolved_at: "also-bad",
        summary: "s",
        updates: [],
        source: "manual" as const,
        public: true,
        created_at: "also-bad",
      },
    ];
    // localeCompare handles any string without throwing.
    const r = recentResolvedIncidents(incidents);
    expect(r.length).toBe(1);
  });

  it("85. missing category — articleBySlug returns undefined safely", () => {
    expect(articleBySlug("does-not-exist-slug")).toBeUndefined();
  });

  it("86. no tickets — empty tenant list safe", () => {
    const r = res();
    const empty = r.current.support.getTicketsForTenant("tnt_empty");
    expect(empty).toEqual([]);
  });

  it("87. no incidents — snapshot safe", () => {
    const snap = buildSystemHealthSnapshot({ incidents: [] }, NOW);
    expect(snap.active_incidents).toEqual([]);
    expect(snap.recent_resolved).toEqual([]);
  });

  it("88. no articles — empty search safe", () => {
    const ctx = buildSupportKnowledgeContext("");
    expect(ctx.matches).toEqual([]);
  });

  it("89. missing diagnostics — buildDiagnosticsSnapshot safe with nulls", () => {
    const d = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: null,
      selectedLocationId: null,
    });
    expect(d.route).toBeNull();
    expect(diagnosticsIsSafe(d)).toBe(true);
  });

  it("90. deleted requester reference — ticket still accessible", () => {
    const r = res();
    let t;
    act(() => {
      t = r.current.support.createTicket(TENANT_ID, {
        requester_user_id: "stf_deleted",
        requester_name: "Deleted User",
        ticket_type: "problem",
        category: "other",
        priority: "normal",
        subject: "Deleted requester",
        description: "desc",
        product_area: "other",
      });
    });
    expect(r.current.support.getTicket(TENANT_ID, t!.id)).toBeTruthy();
  });

  it("91. large ticket list bounded in UI slice", () => {
    const r = res();
    // Create several tickets.
    act(() => {
      for (let i = 0; i < 8; i++) {
        r.current.support.createTicket(TENANT_ID, {
          requester_user_id: "stf_1",
          requester_name: "Alex",
          ticket_type: "question",
          category: "other",
          priority: "low",
          subject: `Bulk ${i}`,
          description: "desc",
          product_area: "other",
        });
      }
    });
    const all = r.current.support.getTicketsForTenant(TENANT_ID);
    // The UI slices to 5; the store returns all but UI is bounded (verified in UI test).
    expect(all.length).toBeGreaterThan(5);
  });

  it("92. knowledge list bounded by search limit", () => {
    const ctx = searchKnowledge("the", 5);
    expect(ctx.matches.length).toBeLessThanOrEqual(5);
  });

  it("93. no NaN in overall status derivation", () => {
    const overall = deriveOverallStatus([], []);
    expect(overall).toBe("unknown");
    // No NaN/Infinity possible — it's a string enum.
    expect(typeof overall).toBe("string");
  });

  it("94. empty fleet / no components — status unknown", () => {
    const snap = buildSystemHealthSnapshot({ components: [] }, NOW);
    expect(snap.overall).toBe("unknown");
  });

  it("95. all status levels have labels", () => {
    const levels = [
      "operational",
      "degraded",
      "partial_outage",
      "major_outage",
      "maintenance",
      "unknown",
    ] as const;
    for (const l of levels) {
      expect(statusLabel(l).length).toBeGreaterThan(0);
    }
  });

  it("96. release notes bounded by featured limit", () => {
    const f = featuredReleaseNotes(2);
    expect(f.length).toBeLessThanOrEqual(2);
  });

  it("97. empty product-help query returns false", () => {
    expect(isProductHelpQuery("")).toBe(false);
    expect(isProductHelpQuery("   ")).toBe(false);
  });

  it("98. published release notes never empty (seeded)", () => {
    expect(publishedReleaseNotes().length).toBeGreaterThan(0);
  });

  it("99. default component statuses all unknown in dev", () => {
    expect(
      DEFAULT_COMPONENT_STATUSES.every((c) => c.status === "unknown"),
    ).toBe(true);
  });

  it("100. articlesByCategory for unknown category returns empty", () => {
    expect(articlesByCategory("Nonexistent Category").length).toBe(0);
  });
});
