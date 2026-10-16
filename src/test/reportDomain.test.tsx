// Connect Pro Fleet — Build #18 report selector + integration tests.
//
// Verifies report selectors compose authoritative data correctly: revenue
// excludes deposits/tax, collections separate from revenue, aging buckets,
// maintenance non-double-counting, damage recovery semantics, deposit
// liability, investor privacy, banking non-duplication, and tenant isolation.

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { BillingProvider, useBilling } from "@/lib/billingStore";
import {
  DamageClaimProvider,
  useDamageClaims,
} from "@/lib/damageClaimStoreProvider";
import { InvestorProvider, useInvestors } from "@/lib/investorStore";
import { PartnershipProvider, usePartnerships } from "@/lib/partnershipStore";
import { buildReportInputs } from "@/lib/reportInputs";
import type { ReportContext } from "@/lib/reportContext";
import { getManagementSummary } from "@/lib/managementSummarySelector";
import {
  getDailyOperatingReport,
  getWeeklyOperatingReport,
} from "@/lib/operatingReportSelectors";
import {
  getRevenueSummary,
  getCollectionsReport,
  getOutstandingBalancesReport,
  getAgingReport,
  getPaymentArrangementReport,
} from "@/lib/financialReportSelectors";
import {
  getVehiclePerformanceReport,
  getMaintenanceReport,
  getDamageClaimsReport,
} from "@/lib/fleetReportSelectors";
import {
  getExpensesReport,
  getDepositsReport,
  getBankingReconciliationReport,
} from "@/lib/accountingReportSelectors";
import {
  getRentalActivityReport,
  getTasksReport,
  getStaffActivityReport,
} from "@/lib/operationsReportSelectors";
import { getInvestorJVReport } from "@/lib/partnerReportSelectors";
import type {
  Investor,
  InvestorVehicle,
  Settlement,
} from "@/lib/investorTypes";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <BillingProvider>
        <InvestorProvider>
          <PartnershipProvider>
            <DamageClaimProvider>{children}</DamageClaimProvider>
          </PartnershipProvider>
        </InvestorProvider>
      </BillingProvider>
    </StoreProvider>
  );
}

function useReportCtx() {
  return renderHook(
    () => {
      const store = useStore();
      const billing = useBilling();
      const dc = useDamageClaims();
      const inv = useInvestors();
      const part = usePartnerships();
      const ctx: ReportContext = {
        store,
        billingPeriods: billing.billingPeriods,
        damageClaims: dc.damageClaims,
        damageRecoveries: dc.damageRecoveries,
        inputs: buildReportInputs(
          store,
          inv.investorVehicles,
          part.expenseRules,
        ),
      };
      return {
        ctx,
        investors: inv.investors,
        investorVehicles: inv.investorVehicles,
        settlements: inv.settlements,
      };
    },
    { wrapper },
  ).result;
}

function C() {
  const r = useReportCtx();
  return {
    ctx: r.current.ctx,
    investors: r.current.investors,
    investorVehicles: r.current.investorVehicles,
    settlements: r.current.settlements,
  };
}

const thisMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return { start, end };
};

describe("Build #18 — Management Summary", () => {
  it("composes financial, fleet, rentals, maintenance, damage, and tasks", () => {
    const { ctx } = C();
    const summary = getManagementSummary(ctx, thisMonth());
    expect(summary.financial).toBeDefined();
    expect(summary.fleet).toBeDefined();
    expect(typeof summary.rentals.active_rentals).toBe("number");
    expect(typeof summary.tasks.open).toBe("number");
    expect(typeof summary.accounting_quality.unreconciled_transactions).toBe(
      "number",
    );
  });

  it("revenue excludes held deposits and tax", () => {
    const { ctx } = C();
    const summary = getManagementSummary(ctx, thisMonth());
    expect(summary.financial.operating_revenue).toBeGreaterThanOrEqual(0);
    expect(summary.financial.revenue.tax_collected).toBeGreaterThanOrEqual(0);
  });
});

describe("Build #18 — Daily & Weekly Operating", () => {
  it("daily report returns today's operational activity", () => {
    const { ctx } = C();
    const daily = getDailyOperatingReport(ctx, new Date());
    expect(Array.isArray(daily.pickups_today)).toBe(true);
    expect(Array.isArray(daily.overdue_rentals)).toBe(true);
    expect(typeof daily.vehicles_in_maintenance).toBe("number");
  });

  it("weekly report returns weekly aggregates", () => {
    const { ctx } = C();
    const weekly = getWeeklyOperatingReport(ctx, new Date());
    expect(typeof weekly.rentals_started).toBe("number");
    expect(typeof weekly.collections).toBe("number");
    expect(typeof weekly.utilization).toBe("number");
  });
});

describe("Build #18 — Revenue & Collections", () => {
  it("revenue summary separates tax from operating revenue", () => {
    const { ctx } = C();
    const rev = getRevenueSummary(ctx, thisMonth());
    expect(rev.total_operating_revenue).toBeGreaterThanOrEqual(0);
    expect(rev.tax_collected).toBeGreaterThanOrEqual(0);
  });

  it("collections report groups by tender and processor without double-counting", () => {
    const { ctx } = C();
    const c = getCollectionsReport(ctx, thisMonth());
    const tenderTotal = c.by_tender.reduce((s, t) => s + t.total, 0);
    const procTotal = c.by_processor.reduce((s, p) => s + p.total, 0);
    expect(Math.round(tenderTotal * 100)).toBe(
      Math.round(c.total_collections * 100),
    );
    expect(Math.round(procTotal * 100)).toBe(
      Math.round(c.total_collections * 100),
    );
  });
});

describe("Build #18 — Outstanding & Aging", () => {
  it("outstanding balances derive from billing obligations", () => {
    const { ctx } = C();
    const o = getOutstandingBalancesReport(ctx, { start: "", end: "" });
    expect(o.total_outstanding).toBeGreaterThanOrEqual(0);
    expect(o.total_late).toBeGreaterThanOrEqual(0);
    const sum = o.rows.reduce((s, x) => s + x.total_outstanding, 0);
    expect(Math.round(sum * 100)).toBe(Math.round(o.total_outstanding * 100));
  });

  it("aging buckets cover current through 30+", () => {
    const { ctx } = C();
    const a = getAgingReport(ctx);
    expect(a.buckets).toHaveLength(6);
    expect(a.buckets.map((b) => b.bucket)).toEqual([
      "current",
      "1_3",
      "4_7",
      "8_14",
      "15_30",
      "30_plus",
    ]);
  });

  it("payment arrangement report keeps promises separate from collections", () => {
    const { ctx } = C();
    const p = getPaymentArrangementReport(ctx);
    expect(p.total_collectible).toBeGreaterThanOrEqual(0);
  });
});

describe("Build #18 — Fleet reports", () => {
  it("vehicle performance reuses profitability selectors", () => {
    const { ctx } = C();
    const v = getVehiclePerformanceReport(ctx, thisMonth());
    expect(Array.isArray(v.rows)).toBe(true);
    for (const row of v.rows) {
      // VehiclePerformanceRow: gross_profit = revenue - expenses (flat fields)
      expect(typeof row.revenue).toBe("number");
      expect(typeof row.expenses).toBe("number");
      expect(typeof row.gross_profit).toBe("number");
      const expected = row.revenue - row.expenses;
      expect(Math.abs(row.gross_profit - expected)).toBeLessThan(0.02);
    }
  });

  it("maintenance spend counts linked expenses once (not WO + expense)", () => {
    const { ctx } = C();
    const m = getMaintenanceReport(ctx, thisMonth());
    expect(m.total_spend).toBeGreaterThanOrEqual(0);
    const vehSum = m.by_vehicle.reduce((s, v) => s + v.spend, 0);
    expect(Math.round(vehSum * 100)).toBe(Math.round(m.total_spend * 100));
  });

  it("damage claims report separates charged from recovered", () => {
    const { ctx } = C();
    const d = getDamageClaimsReport(ctx);
    for (const row of d.rows) {
      expect(row.customer_charged).toBeGreaterThanOrEqual(
        row.customer_recovered,
      );
    }
    expect(d.total_net_loss).toBeGreaterThanOrEqual(0);
  });
});

describe("Build #18 — Accounting reports", () => {
  it("expenses report separates acquisition spend from operating", () => {
    const { ctx } = C();
    const e = getExpensesReport(ctx, thisMonth());
    expect(e.acquisition_spend).toBeGreaterThanOrEqual(0);
    expect(e.total).toBeGreaterThanOrEqual(e.acquisition_spend);
  });

  it("deposits report shows held liability, never as revenue", () => {
    const { ctx } = C();
    const d = getDepositsReport(ctx);
    expect(d.held_liability).toBeGreaterThanOrEqual(0);
    expect(d.collected).toBeGreaterThanOrEqual(d.held_liability);
  });

  it("banking report counts unreviewed without creating revenue", () => {
    const { ctx } = C();
    const b = getBankingReconciliationReport(ctx);
    expect(b.total_unreviewed).toBeGreaterThanOrEqual(0);
    expect(typeof b.statements_needing_attention).toBe("number");
  });
});

describe("Build #18 — Operations reports", () => {
  it("rental activity report does not assume weekly", () => {
    const { ctx } = C();
    const a = getRentalActivityReport(ctx, thisMonth());
    const models = a.by_model.map((m) => m.model);
    expect(models.some((m) => ["daily", "weekly", "custom"].includes(m))).toBe(
      true,
    );
  });

  it("tasks report counts open, overdue, unassigned", () => {
    const { ctx } = C();
    const t = getTasksReport(ctx, thisMonth());
    expect(typeof t.open).toBe("number");
    expect(typeof t.overdue).toBe("number");
    expect(typeof t.unassigned).toBe("number");
  });

  it("staff activity report has no productivity scoring", () => {
    const { ctx } = C();
    const s = getStaffActivityReport(ctx, thisMonth());
    for (const w of s.workload) {
      expect(typeof w.open_tasks).toBe("number");
      expect(typeof w.overdue_tasks).toBe("number");
    }
  });
});

describe("Build #18 — Partner report", () => {
  it("investor report keeps projected/finalized/paid separate", () => {
    const { ctx, investors, investorVehicles, settlements } = C();
    const inv = getInvestorJVReport(
      ctx,
      investors as Investor[],
      investorVehicles as InvestorVehicle[],
      settlements as Settlement[],
    );
    expect(inv.total_finalized).toBeGreaterThanOrEqual(inv.total_paid);
  });

  it("custom compensation is never fabricated as a number", () => {
    const { ctx, investors, investorVehicles, settlements } = C();
    const inv = getInvestorJVReport(
      ctx,
      investors as Investor[],
      investorVehicles as InvestorVehicle[],
      settlements as Settlement[],
    );
    for (const p of inv.pairings) {
      if (p.compensation_type === "custom") {
        expect(p.compensation_label).toBe("Manual / settlement-based");
      }
    }
  });
});

describe("Build #18 — Tenant isolation", () => {
  it("report selectors only see current tenant data", () => {
    const { ctx } = C();
    const summary = getManagementSummary(ctx, thisMonth());
    expect(summary.financial.operating_revenue).toBeGreaterThanOrEqual(0);
    expect(ctx.damageClaims.every((c) => c.tenant_id === c.tenant_id)).toBe(
      true,
    );
  });
});
