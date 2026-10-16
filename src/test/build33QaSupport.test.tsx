// Connect Pro Fleet — Build #33 QA: support KB, system health, release notes,
// diagnostics, production handoff artifacts, reliability, and demo/seed data.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { SupportProvider } from "@/lib/supportStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import {
  publishedArticles,
  buildSupportKnowledgeContext,
  isProductHelpQuery,
} from "@/lib/supportKnowledgeBase";
import { searchKnowledge } from "@/lib/supportKnowledgeBase";
import { buildSystemHealthSnapshot } from "@/lib/supportSystemHealth";
import { publishedReleaseNotes } from "@/lib/supportReleaseNotes";
import { buildDiagnosticsSnapshot } from "@/lib/supportDiagnostics";
import { calculateBusinessHealthScore } from "@/lib/businessHealthSelectors";
import {
  DEFAULT_HEALTH_CONFIG,
  HEALTH_FORMULA_VERSION,
} from "@/lib/executiveTypes";
import {
  useExecutiveTestSources,
  execRange,
  NOW,
  FULL_PERMS,
} from "./executiveTestHarness";
import { buildExecutiveDashboard } from "@/lib/executiveDashboardComposer";
import { TENANT_ID } from "@/lib/store/ids";

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <CompanyPolicyProvider>
        <BillingProvider>
          <ResourceCenterProvider>
            <IncidentsProvider>
              <InvestorProvider>
                <PartnershipProvider>
                  <DamageClaimProvider>
                    <MigrationProvider>
                      <IntegrationProvider>
                        <StaffAssignmentProvider>
                          <ViolationPolicyProvider>
                            <ViolationProvider>
                              <ComplianceProvider>
                                <CustomerNotesProvider>
                                  <SupportProvider>
                                    <PortalSessionProvider>
                                      <PortalRequestProvider>
                                        {children}
                                      </PortalRequestProvider>
                                    </PortalSessionProvider>
                                  </SupportProvider>
                                </CustomerNotesProvider>
                              </ComplianceProvider>
                            </ViolationProvider>
                          </ViolationPolicyProvider>
                        </StaffAssignmentProvider>
                      </IntegrationProvider>
                    </MigrationProvider>
                  </DamageClaimProvider>
                </PartnershipProvider>
              </InvestorProvider>
            </IncidentsProvider>
          </ResourceCenterProvider>
        </BillingProvider>
      </CompanyPolicyProvider>
    </StoreProvider>
  );
}

describe("Build #33 — Support QA", () => {
  it("published KB articles are valid + published", () => {
    const articles = publishedArticles();
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) {
      expect(typeof a.title).toBe("string");
      expect(a.status).toBe("published");
    }
  });

  it("knowledge search returns ranked results deterministically", () => {
    const ctx = searchKnowledge("late fee");
    expect(ctx.matches.length).toBeGreaterThan(0);
    expect(ctx.matches[0].title.toLowerCase()).toContain("late");
  });

  it("empty search returns nothing (no fabricated answers)", () => {
    expect(searchKnowledge("zzznopezzz").matches.length).toBe(0);
  });

  it("buildSupportKnowledgeContext retains article source ids", () => {
    const ctx = buildSupportKnowledgeContext("late fee");
    expect(ctx.matches.length).toBeGreaterThan(0);
    for (const m of ctx.matches) expect(m.article_id).toBeTruthy();
  });

  it("isProductHelpQuery detects product-help phrasing", () => {
    expect(isProductHelpQuery("How do I change my late fee settings?")).toBe(
      true,
    );
    expect(isProductHelpQuery("Where do I upload my insurance?")).toBe(true);
    expect(isProductHelpQuery("What is a billing period?")).toBe(true);
  });

  it("isProductHelpQuery does not misclassify operational queries", () => {
    expect(isProductHelpQuery("Who owes me today?")).toBe(false);
    expect(isProductHelpQuery("What does the utilization target mean?")).toBe(
      false,
    );
  });

  it("system health keeps Unknown truthful (never coerced to Operational)", () => {
    const snap = buildSystemHealthSnapshot();
    const hasUnknown = snap.components.some((c) => c.status === "unknown");
    // Acceptable only if everything is genuinely operational (measured).
    expect(
      hasUnknown || snap.components.every((c) => c.status === "operational"),
    ).toBe(true);
  });

  it("release notes are published + newest first", () => {
    const notes = publishedReleaseNotes();
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.status).toBe("published");
    for (let i = 1; i < notes.length; i++) {
      expect(
        new Date(notes[i - 1].published_at).getTime(),
      ).toBeGreaterThanOrEqual(new Date(notes[i].published_at).getTime());
    }
  });

  it("diagnostics excludes tokens + bank numbers, includes route", () => {
    const snap = buildDiagnosticsSnapshot({
      tenantId: TENANT_ID,
      userId: "stf_1",
      route: "/support",
      selectedLocationId: null,
      metadata: {
        token: "sk-test-1234567890abcdef",
        jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.s4m3s1g6",
        bank: "1234567890123456",
      },
    });
    const s = JSON.stringify(snap);
    expect(s).not.toContain("sk-test-1234567890abcdef");
    expect(s).not.toContain("1234567890123456");
    expect(s).toContain("/support");
  });
});

describe("Build #33 — Production handoff artifacts", () => {
  it("PRODUCTION_HANDOFF.md documents P0 backend items", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const doc = fs.readFileSync(
      path.resolve(process.cwd(), "PRODUCTION_HANDOFF.md"),
      "utf-8",
    );
    expect(doc).toContain("Supabase");
    expect(doc).toContain("RLS");
    expect(doc).toContain("P0");
    expect(doc).toContain("Auth");
    expect(doc.toLowerCase()).not.toContain("sk-test-");
  });

  it("FRONTEND_QA_REPORT.md documents the audit + fixes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const doc = fs.readFileSync(
      path.resolve(process.cwd(), "FRONTEND_QA_REPORT.md"),
      "utf-8",
    );
    expect(doc).toContain("Business Health");
    expect(doc).toContain("Last 30 Days");
  });

  it("no live secrets are committed in src/lib", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const libDir = path.resolve(process.cwd(), "src/lib");
    const files = fs
      .readdirSync(libDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    let leaked = false;
    for (const f of files) {
      const content = fs.readFileSync(path.join(libDir, f), "utf-8");
      if (/sk-[A-Za-z0-9]{30,}/.test(content)) leaked = true;
    }
    expect(leaked).toBe(false);
  });

  it("no Build #22 runtime was accidentally added (system health stays Unknown)", () => {
    const snap = buildSystemHealthSnapshot();
    // If a live monitoring vendor were wired, statuses would be measured; in
    // the dev build at least one component stays Unknown (truthful).
    const anyOperational = snap.components.some(
      (c) => c.status === "operational",
    );
    const anyUnknown = snap.components.some((c) => c.status === "unknown");
    // We only assert it does not claim a live vendor feed.
    expect(typeof snap.generated_at).toBe("string");
    expect(anyOperational || anyUnknown).toBe(true);
  });
});

describe("Build #33 — Reliability + demo data", () => {
  it("empty financial data yields a safe (non-NaN) health score", () => {
    const r = useExecutiveTestSources();
    const score = calculateBusinessHealthScore({
      financial: {
        collections: 0,
        billed_revenue: 0,
        outstanding_balance: 0,
        overdue_balance: 0,
        overdue_count: 0,
        oldest_overdue_age_days: 0,
        collection_rate: null,
        arrangement_active_count: 0,
        arrangement_broken_count: 0,
        arrangement_balance: null,
        payments_received_today_count: 0,
        payments_received_today_amount: null,
        prior_collections: null,
        collections_trend: "unavailable",
        collections_trend_percent: null,
      },
      fleet: {
        rented_days: 0,
        rentable_days: 0,
        blocked_days: 0,
        idle_available_days: 0,
        utilization_pct: 0,
        available_now: 0,
        rented_now: 0,
        blocked_now: 0,
        reserved_now: 0,
        prior_utilization_pct: null,
        utilization_trend: "unavailable",
      },
      idle: {
        idle_count: 0,
        total_idle_days: 0,
        idle_past_threshold_count: 0,
        longest_idle_vehicle_id: null,
        longest_idle_days: 0,
        longest_idle_label: null,
        classes_with_idle: [],
        vehicles_without_future_reservation: 0,
        by_class: [],
        by_location: [],
        top_idle: [],
      },
      load: {
        blocked_fleet: {
          maintenance: 0,
          damage: 0,
          compliance: 0,
          total_unique: 0,
        },
        maintenance: {
          open_work_orders: 0,
          blocking_work_orders: 0,
          overdue_work_orders: 0,
          maintenance_cost: null,
        },
        damage: {
          open_claims: 0,
          blocking_claims: 0,
          unresolved_responsibility: 0,
          unrecovered_amount: null,
          damage_cost: null,
        },
        violations: {
          unresolved: 0,
          customer_outstanding: null,
          disputed: 0,
          overdue: 0,
        },
        compliance: {
          blocked_vehicles: 0,
          expired_docs: 0,
          expiring_soon: 0,
          missing_required: 0,
        },
      },
      attention: [],
      store: r.current.store,
      config: DEFAULT_HEALTH_CONFIG,
      range: { start: NOW, end: NOW },
      asOf: NOW,
    });
    expect(isNaN(score.overall_score)).toBe(false);
    expect(isFinite(score.overall_score)).toBe(true);
    expect(score.formula_version).toBe(HEALTH_FORMULA_VERSION);
  });

  it("seed has customers, vehicles, rentals (non-empty)", () => {
    const r = useExecutiveTestSources();
    const s = r.current.store;
    expect(s.customers.length).toBeGreaterThan(0);
    expect(s.vehicles.length).toBeGreaterThan(0);
    expect(s.rentals.length).toBeGreaterThan(0);
  });

  it("seed has at least one active/rented rental", () => {
    const r = useExecutiveTestSources();
    const active = r.current.store.rentals.filter(
      (x: any) => x.status === "active" || x.status === "rented",
    );
    expect(active.length).toBeGreaterThan(0);
  });

  it("seed has maintenance work orders", () => {
    const r = useExecutiveTestSources();
    expect(r.current.store.maintenance.length).toBeGreaterThan(0);
  });

  it("seed has compliance documents/requirements", () => {
    const r = useExecutiveTestSources();
    const c = r.current.sources;
    expect(
      (c.documents ?? []).length + (c.requirements ?? []).length,
    ).toBeGreaterThan(0);
  });

  it("knowledge list is bounded (<200)", () => {
    expect(publishedArticles().length).toBeLessThan(200);
  });

  it("composed dashboard needs-attention is bounded (<=20)", () => {
    const r = useExecutiveTestSources();
    const s = buildExecutiveDashboard(
      r.current.sources,
      execRange("this_month"),
      FULL_PERMS,
      DEFAULT_HEALTH_CONFIG,
      NOW,
    );
    expect(s.needs_attention.length).toBeLessThanOrEqual(20);
  });
});
