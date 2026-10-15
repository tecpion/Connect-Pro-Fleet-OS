// Connect Pro Fleet — Release Notes / Product Updates (Build #31).
//
// Seed release notes use ACTUAL builds as source, written in user-facing
// language (internal Build numbers are not exposed). Newest first by default.

import type { ReleaseNote } from "./supportTypes";

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "rn_executive_dashboard",
    version: "0.30",
    title: "Executive Dashboard & Business Health",
    summary:
      "A new owner's operating console with Business Health Score and Money Left on the Table.",
    published_at: "2026-08-28T00:00:00Z",
    changes: [
      {
        category: "new",
        summary:
          "Executive Dashboard with collections, utilization, and health at a glance.",
      },
      {
        category: "new",
        summary:
          "Business Health Score — a transparent 0–100 score from five weighted components.",
      },
      {
        category: "new",
        summary:
          "Money Left on the Table — known recoverable amounts separated from idle opportunity.",
      },
      {
        category: "improved",
        summary:
          "Copilot answers reuse dashboard selectors for deterministic explanations.",
      },
    ],
    categories: ["new", "improved"],
    featured: true,
    related_article_ids: [
      "kb_executive_dashboard",
      "kb_business_health",
      "kb_money_left_on_table",
    ],
    status: "published",
  },
  {
    id: "rn_fleet_copilot",
    version: "0.29",
    title: "Fleet Copilot",
    summary:
      "Ask operational questions in plain language with source-backed, deterministic answers.",
    published_at: "2026-08-20T00:00:00Z",
    changes: [
      {
        category: "new",
        summary:
          "Fleet Copilot answers operational questions across customers, vehicles, and daily priorities.",
      },
      {
        category: "new",
        summary:
          "Company-wide recent changes composed from authoritative timestamped events.",
      },
      {
        category: "improved",
        summary:
          "End-of-day recap distinguishes factual events from current-state metrics.",
      },
    ],
    categories: ["new", "improved"],
    featured: true,
    related_article_ids: ["kb_fleet_copilot"],
    status: "published",
  },
  {
    id: "rn_daily_briefing",
    version: "0.28",
    title: "Daily Briefing & Idle Fleet",
    summary:
      "A prioritized daily operations briefing plus idle-fleet attention.",
    published_at: "2026-08-12T00:00:00Z",
    changes: [
      {
        category: "new",
        summary:
          "Daily Briefing surfaces what needs attention today, prioritized.",
      },
      {
        category: "new",
        summary: "Idle fleet tracking by class and location.",
      },
    ],
    categories: ["new"],
    featured: false,
    related_article_ids: ["kb_daily_briefing", "kb_fleet_twin"],
    status: "published",
  },
  {
    id: "rn_customer360_twin",
    version: "0.27",
    title: "Customer 360 & Fleet Digital Twin",
    summary:
      "A unified customer view and a time-aware fleet availability model.",
    published_at: "2026-07-30T00:00:00Z",
    changes: [
      {
        category: "new",
        summary:
          "Customer 360 aggregates rentals, payments, damage, violations, and compliance.",
      },
      {
        category: "new",
        summary:
          "Fleet Digital Twin models utilization with overlap-safe blocked days.",
      },
    ],
    categories: ["new"],
    featured: false,
    related_article_ids: ["kb_customer_360", "kb_fleet_twin"],
    status: "published",
  },
  {
    id: "rn_compliance_violations",
    version: "0.26",
    title: "Documents, Compliance & Violations",
    summary:
      "Compliance center with document expiration and tolls/violations management.",
    published_at: "2026-07-15T00:00:00Z",
    changes: [
      {
        category: "new",
        summary:
          "Compliance center with required documents, expiration, and vehicle blocking.",
      },
      {
        category: "new",
        summary:
          "Tolls & violations import, responsibility assignment, and customer charging.",
      },
    ],
    categories: ["new"],
    featured: false,
    related_article_ids: ["kb_compliance", "kb_violations"],
    status: "published",
  },
];

/** Published release notes, newest first. */
export function publishedReleaseNotes(): ReleaseNote[] {
  return RELEASE_NOTES.filter((r) => r.status === "published").sort((a, b) =>
    b.published_at.localeCompare(a.published_at),
  );
}

/** Featured (What's New) release notes. */
export function featuredReleaseNotes(limit = 3): ReleaseNote[] {
  return publishedReleaseNotes()
    .filter((r) => r.featured)
    .slice(0, limit);
}

/** Find a release note by id. */
export function releaseNoteById(id: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find((r) => r.id === id);
}
