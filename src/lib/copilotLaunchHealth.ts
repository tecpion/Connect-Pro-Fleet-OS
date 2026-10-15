// Connect Pro Fleet — Copilot health + weekly review (Build #33).
//
// Reuses the Executive Dashboard composer. No new health/profitability formula.
// Permission-gated BEFORE formation.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer } from "./copilotShared";
import { resolveProfitabilityRange } from "./profitabilityHelpers";
import { buildReportInputs } from "./reportInputs";
import {
  buildExecutiveDashboard,
  type ExecutiveDashboardSources,
} from "./executiveDashboardComposer";
import {
  DEFAULT_HEALTH_CONFIG,
  type ExecutiveViewerPermissions,
  type ExecutiveDatePreset,
  type ExecutiveRange,
} from "./executiveTypes";
import { fmtMoney, pct } from "./format";

function toExecSources(src: CopilotSources): {
  sources: ExecutiveDashboardSources;
  perms: ExecutiveViewerPermissions;
} {
  const vt = src.vehicleTwin;
  const sources: ExecutiveDashboardSources = {
    store: vt.store,
    // Build #33 — profitability inputs are not carried on CopilotSources, so
    // build them from the store (investor/expense-rule arrays default to
    // empty; the executive composer degrades gracefully without them).
    inputs: vt.inputs ?? buildReportInputs(vt.store, [], []),
    damageClaims: vt.damageClaims,
    damageRecoveries: undefined,
    violations: vt.violations,
    expenses: vt.store.expenses,
    billingPeriods: src.briefing.billingPeriods,
    paymentArrangements: vt.store.paymentArrangements,
    arrangementInstallments: vt.store.arrangementInstallments,
    rentalDeposits: vt.store.rentalDeposits,
    documents: vt.documents,
    requirements: vt.requirements,
    overrides: vt.overrides,
  };
  const perms: ExecutiveViewerPermissions = {
    canViewFinancials:
      (src as unknown as { canSeeMoney?: boolean }).canSeeMoney ?? false,
    canViewProfitability: false,
    canViewSensitiveDocs: false,
    canViewBanking: false,
    allowedLocationIds: [],
  };
  return { sources, perms };
}

function buildExecSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  preset: ExecutiveDatePreset = "this_month",
) {
  const { sources: execSources, perms: execPerms } = toExecSources(src);
  const merged: ExecutiveViewerPermissions = {
    ...execPerms,
    canViewFinancials: perms.canViewFinancials ?? execPerms.canViewFinancials,
    canViewProfitability:
      perms.canViewProfitability ?? execPerms.canViewProfitability,
  };
  const range = resolveProfitabilityRange(preset);
  const execRange: ExecutiveRange = {
    preset,
    start: range.start,
    end: range.end,
    as_of: asOf,
  };
  const summary = buildExecutiveDashboard(
    execSources,
    execRange,
    merged,
    DEFAULT_HEALTH_CONFIG,
    asOf,
  );
  return { summary, merged };
}

/** "How do I improve my Health Score?" — uses real component deficiencies,
 *  never generic coaching. Links to the actual issues. */
export function answerImproveHealth(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("improve_health", asOf, perms, "derived");
  const { summary } = buildExecSummary(src, asOf, perms);
  const h = summary.health;
  const sorted = [...h.components].sort((a, b) => a.score - b.score);
  const lowest = sorted[0];

  return {
    ...base,
    answer_type: "summary",
    summary: lowest
      ? `Your lowest component is ${lowest.label} (${lowest.score}/100). ${lowest.explanation}`
      : `Your health score is ${h.overall_score}/100 (${h.grade}).`,
    facts: sorted.map((c) => ({
      label: c.label,
      value: `${c.score}/100`,
    })),
    items: sorted.slice(0, 3).map((c) => ({
      id: `health:${c.key}`,
      title: `${c.label}: ${c.score}/100`,
      subtitle: c.explanation,
      status: c.score < 60 ? "critical" : c.score < 75 ? "attention" : "ok",
    })),
    sources: [
      {
        source_module: "dashboard",
        entity_type: "health",
        entity_id: "improve",
        label: "Business Health",
        deep_link: "/executive",
      },
    ],
    suggested_actions: [
      {
        label: "Open Executive Dashboard",
        action_type: "view_dashboard",
        deep_link: "/executive",
      },
    ],
    caveats: [
      "Improvement suggestions are based on real component deficiencies — no generic business coaching.",
    ],
  };
}

/** "Give me my weekly owner report." — composed period summary with prior
 *  7-day comparison where the architecture supports it. All derived, no
 *  forecast. */
export function answerWeeklyReview(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("weekly_review", asOf, perms, "derived");
  const { summary, merged } = buildExecSummary(src, asOf, perms, "this_week");
  const canMoney = merged.canViewFinancials;

  const f = summary.financial;
  const u = summary.fleet_utilization;
  const idle = summary.idle_fleet;
  const m = summary.money_left_on_table;
  const h = summary.health;

  const priorUtil = summary.fleet_utilization.prior_utilization_pct;
  const utilDelta =
    priorUtil != null && u.utilization_pct != null
      ? u.utilization_pct - priorUtil
      : null;

  return {
    ...base,
    answer_type: "summary",
    summary: `Weekly review for ${summary.company_name}. Health ${h.overall_score}/100 (${h.grade}), utilization ${pct(u.utilization_pct)}.`,
    facts: [
      {
        label: "Billed revenue",
        value:
          canMoney && f.billed_revenue != null
            ? fmtMoney(f.billed_revenue)
            : "—",
      },
      {
        label: "Collections",
        value:
          canMoney && f.collections != null ? fmtMoney(f.collections) : "—",
      },
      {
        label: "Overdue",
        value:
          canMoney && f.overdue_balance != null
            ? fmtMoney(f.overdue_balance)
            : "—",
      },
      {
        label: "Operating profit",
        value:
          canMoney && merged.canViewProfitability
            ? summary.profitability.operating_profit != null
              ? fmtMoney(summary.profitability.operating_profit)
              : "—"
            : "—",
      },
      { label: "Utilization", value: pct(u.utilization_pct) },
      {
        label: "Utilization vs last week",
        value:
          utilDelta != null
            ? `${utilDelta >= 0 ? "+" : ""}${utilDelta.toFixed(1)} pts`
            : "—",
      },
      { label: "Idle vehicles", value: idle.idle_count },
      {
        label: "Blocked vehicles",
        value: summary.operational_load.blocked_fleet.total_unique,
      },
      { label: "Health Score", value: `${h.overall_score}/100` },
      {
        label: "Known recoverable",
        value:
          canMoney && m.known_recoverable_total != null
            ? fmtMoney(m.known_recoverable_total)
            : "—",
      },
    ],
    sources: [
      {
        source_module: "dashboard",
        entity_type: "executive",
        entity_id: "weekly",
        label: "Executive Dashboard",
        deep_link: "/executive",
      },
    ],
    suggested_actions: [
      {
        label: "Open Executive Dashboard",
        action_type: "view_dashboard",
        deep_link: "/executive",
      },
    ],
    caveats: [
      "Weekly review is derived from authoritative period selectors — no forecast.",
      "Prior-period comparison uses the same formula version/config (v1).",
    ],
  };
}
