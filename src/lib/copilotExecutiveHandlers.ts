// Connect Pro Fleet — Copilot executive intent handlers (Build #30).
//
// Deterministic answers that reuse the Executive Dashboard selectors. No LLM, no
// new formula. Health-score / money-left-on-table / utilization / collections
// answers are derived from the same composed dashboard the UI uses, so Copilot
// can never disagree with the dashboard. Financial/profitability values are
// permission-gated BEFORE forming (never leak to an unauthorized viewer).

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
  buildExecutiveOperationalContext,
} from "./executiveDashboardComposer";
import { DEFAULT_HEALTH_CONFIG } from "./executiveTypes";
import type { ExecutiveDashboardSources } from "./executiveDashboardComposer";
import type { ExecutiveViewerPermissions } from "./executiveTypes";
import { fmtMoney, fmtNumber, pct } from "./format";

function toExecSources(src: CopilotSources): {
  sources: ExecutiveDashboardSources;
  perms: ExecutiveViewerPermissions;
} {
  const vt = src.vehicleTwin;
  const sources: ExecutiveDashboardSources = {
    store: vt.store,
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

function buildSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
) {
  const { sources: execSources, perms: execPerms } = toExecSources(src);
  // Merge copilot perms into exec perms (financial visibility).
  const merged: ExecutiveViewerPermissions = {
    ...execPerms,
    canViewFinancials: perms.canViewFinancials ?? execPerms.canViewFinancials,
    canViewProfitability:
      perms.canViewProfitability ?? execPerms.canViewProfitability,
  };
  const range = resolveProfitabilityRange("this_month");
  const execRange = {
    preset: "this_month" as const,
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

export function answerExecutiveSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("executive_summary", asOf, perms, "derived");
  const { summary, merged } = buildSummary(src, asOf, perms);
  const f = summary.financial;
  const canMoney = merged.canViewFinancials;
  return {
    ...base,
    answer_type: "summary",
    summary: `Executive summary for ${summary.company_name}. Health score ${summary.health.overall_score} (${summary.health.grade}).`,
    facts: [
      {
        label: "Collections",
        value:
          canMoney && f.collections != null ? fmtMoney(f.collections) : "—",
      },
      {
        label: "Outstanding",
        value:
          canMoney && f.outstanding_balance != null
            ? fmtMoney(f.outstanding_balance)
            : "—",
      },
      { label: "Overdue accounts", value: f.overdue_count },
      {
        label: "Utilization",
        value: pct(summary.fleet_utilization.utilization_pct),
      },
      { label: "Health Score", value: `${summary.health.overall_score} / 100` },
      {
        label: "Known Recoverable",
        value:
          canMoney &&
          summary.money_left_on_table.known_recoverable_total != null
            ? fmtMoney(summary.money_left_on_table.known_recoverable_total)
            : "—",
      },
    ],
    sources: [
      {
        source_module: "dashboard",
        entity_type: "executive",
        entity_id: "summary",
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
  };
}

export function answerBusinessHealth(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("business_health", asOf, perms, "derived");
  const { summary } = buildSummary(src, asOf, perms);
  const h = summary.health;
  return {
    ...base,
    answer_type: "summary",
    summary: `Your business health score is ${h.overall_score} / 100 (${h.grade}). Formula version ${h.formula_version}.`,
    facts: h.components.map((c) => ({
      label: c.label,
      value: `${c.score} (${c.weight}%)`,
    })),
    sources: [
      {
        source_module: "dashboard",
        entity_type: "health",
        entity_id: "score",
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
  };
}

export function answerHealthScoreExplanation(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("health_score_explanation", asOf, perms, "derived");
  const { summary } = buildSummary(src, asOf, perms);
  const h = summary.health;
  return {
    ...base,
    answer_type: "summary",
    summary: `Your health score is ${h.overall_score} because:`,
    facts: h.components.map((c) => ({
      label: c.label,
      value: `${c.score} — ${c.explanation}`,
    })),
    sources: [
      {
        source_module: "dashboard",
        entity_type: "health",
        entity_id: "explanation",
        label: "Health Explanation",
        deep_link: "/executive",
      },
    ],
  };
}

export function answerMoneyLeftOnTable(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("money_left_on_table", asOf, perms, "derived");
  const { summary, merged } = buildSummary(src, asOf, perms);
  const m = summary.money_left_on_table;
  const canMoney = merged.canViewFinancials;
  const facts = [
    {
      label: "Known Recoverable",
      value:
        canMoney && m.known_recoverable_total != null
          ? fmtMoney(m.known_recoverable_total)
          : "—",
    },
    {
      label: "Idle vehicles (opportunity)",
      value: m.idle_opportunity.idle_count,
    },
    { label: "Total idle days", value: m.idle_opportunity.total_idle_days },
  ];
  return {
    ...base,
    answer_type: "summary",
    summary:
      canMoney && m.known_recoverable_total != null
        ? `Known recoverable: ${fmtMoney(m.known_recoverable_total)}. Idle opportunity: ${m.idle_opportunity.idle_count} vehicles, ${m.idle_opportunity.total_idle_days} idle days.`
        : `Idle opportunity: ${m.idle_opportunity.idle_count} vehicles, ${m.idle_opportunity.total_idle_days} idle days. (Financial amounts hidden.)`,
    facts,
    items: m.quantified.slice(0, 15).map((o) => ({
      id: o.entity_id,
      title: o.label,
      subtitle: canMoney ? fmtMoney(o.amount) : "—",
      status: o.category,
    })),
    sources: m.quantified.slice(0, 10).map((o) => ({
      source_module: o.source_module,
      entity_type: o.entity_type,
      entity_id: o.entity_id,
      label: o.label,
      deep_link: o.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Executive Dashboard",
        action_type: "view_dashboard",
        deep_link: "/executive",
      },
    ],
  };
}

export function answerFleetPerformance(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("fleet_performance", asOf, perms, "derived");
  const { summary, merged } = buildSummary(src, asOf, perms);
  const p = summary.profitability;
  const canProfit = merged.canViewProfitability;
  return {
    ...base,
    answer_type: "summary",
    summary:
      p.top_vehicle || p.bottom_vehicle
        ? `Highest operating profit: ${p.top_vehicle?.label ?? "—"}. Lowest operating profit: ${p.bottom_vehicle?.label ?? "—"}.`
        : "No vehicle performance data for this period.",
    facts: [
      { label: "Highest profit", value: p.top_vehicle?.label ?? "—" },
      { label: "Lowest profit", value: p.bottom_vehicle?.label ?? "—" },
    ],
    sources: [p.top_vehicle, p.bottom_vehicle].filter(Boolean).map((v) => ({
      source_module: "profitability",
      entity_type: "vehicle",
      entity_id: v!.id,
      label: v!.label,
      deep_link: `/vehicles/${v!.id}`,
    })),
    suggested_actions: [
      {
        label: "View Profitability",
        action_type: "view_profitability",
        deep_link: "/profitability",
      },
    ],
  };
}

export function answerUtilizationExplanation(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("utilization_explanation", asOf, perms, "derived");
  const { summary } = buildSummary(src, asOf, perms);
  const u = summary.fleet_utilization;
  const idle = summary.idle_fleet;
  return {
    ...base,
    answer_type: "summary",
    summary: `Utilization is ${pct(u.utilization_pct)}. ${u.blocked_days} blocked days, ${u.idle_available_days} idle days, ${idle.idle_count} idle vehicles.`,
    facts: [
      { label: "Utilization", value: pct(u.utilization_pct) },
      { label: "Rented days", value: fmtNumber(u.rented_days) },
      { label: "Rentable days", value: fmtNumber(u.rentable_days) },
      { label: "Blocked days", value: fmtNumber(u.blocked_days) },
      { label: "Idle days", value: fmtNumber(u.idle_available_days) },
      { label: "Idle vehicles", value: fmtNumber(idle.idle_count) },
    ],
    sources: [
      {
        source_module: "vehicle_twin",
        entity_type: "fleet",
        entity_id: "utilization",
        label: "Fleet Utilization",
        deep_link: "/executive",
      },
    ],
  };
}

export function answerCollectionsSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("collections_summary", asOf, perms, "derived");
  const { summary, merged } = buildSummary(src, asOf, perms);
  const f = summary.financial;
  const canMoney = merged.canViewFinancials;
  return {
    ...base,
    answer_type: "summary",
    summary: canMoney
      ? `Collections ${f.collections != null ? fmtMoney(f.collections) : "—"}, outstanding ${f.outstanding_balance != null ? fmtMoney(f.outstanding_balance) : "—"}, ${f.overdue_count} overdue accounts.`
      : `${f.overdue_count} overdue accounts. (Financial amounts hidden.)`,
    facts: [
      {
        label: "Collections",
        value:
          canMoney && f.collections != null ? fmtMoney(f.collections) : "—",
      },
      {
        label: "Billed revenue",
        value:
          canMoney && f.billed_revenue != null
            ? fmtMoney(f.billed_revenue)
            : "—",
      },
      {
        label: "Outstanding",
        value:
          canMoney && f.outstanding_balance != null
            ? fmtMoney(f.outstanding_balance)
            : "—",
      },
      {
        label: "Overdue balance",
        value:
          canMoney && f.overdue_balance != null
            ? fmtMoney(f.overdue_balance)
            : "—",
      },
      { label: "Overdue accounts", value: f.overdue_count },
      {
        label: "Collection rate",
        value: f.collection_rate != null ? pct(f.collection_rate) : "N/A",
      },
    ],
    sources: [
      {
        source_module: "billing",
        entity_type: "collections",
        entity_id: "summary",
        label: "Collections",
        deep_link: "/executive",
      },
    ],
  };
}

export function buildExecutiveCopilotContext(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
) {
  const { summary, merged } = buildSummary(src, asOf, perms);
  return buildExecutiveOperationalContext(summary, merged);
}
