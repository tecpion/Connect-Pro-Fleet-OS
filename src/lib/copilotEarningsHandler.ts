// Connect Pro Fleet — Copilot earnings / financial summary handler (Build #47).
//
// "How much did I earn this year?" / "How much revenue did I make?" / "How much
// did I collect?" — maps conversational financial wording to the AUTHORITATIVE
// executive dashboard metrics. It does NOT collapse revenue, cash collected, and
// operating contribution into one number — each is reported distinctly so the
// user understands the difference:
//   - Billed revenue  : charges generated this period (excl. held deposits)
//   - Cash collected  : posted payments actually received (excl. held deposits)
//   - Operating contribution : revenue − operating expenses (profitability)
//
// All amounts are permission-gated BEFORE forming (canViewFinancials /
// canViewProfitability). The time range is detected from the query ("this year"
// / "this month" / "this week" / "today"); defaults to "this_year" for an
// earnings question. Pure + deterministic; reuses the existing executive
// composer — no new formula, no new store.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, formatMoney, gateAmount } from "./copilotShared";
import { buildReportInputs } from "./reportInputs";
import {
  buildExecutiveDashboard,
  type ExecutiveDashboardSources,
} from "./executiveDashboardComposer";
import {
  DEFAULT_HEALTH_CONFIG,
  type ExecutiveViewerPermissions,
  type ExecutiveRange,
} from "./executiveTypes";
import {
  detectDomainTimeRange,
  resolveDomainRange,
  type DomainTimeRange,
} from "./copilotDomainRouter";

function toExecSources(src: CopilotSources): ExecutiveDashboardSources {
  const vt = src.vehicleTwin;
  return {
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
}

const RANGE_LABEL: Record<DomainTimeRange, string> = {
  today: "today",
  yesterday: "yesterday",
  this_week: "this week",
  last_week: "last week",
  this_month: "this month",
  last_month: "last month",
  this_year: "this year",
};

/** "How much did I earn?" — distinct revenue / cash / contribution metrics from
 *  the authoritative executive dashboard, scoped to the detected time range. */
export function answerEarningsSummary(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("earnings_summary", asOf, perms, "derived");
  const rangeKey = detectDomainTimeRange(query) ?? "this_year";
  const range = resolveDomainRange(rangeKey, asOf);

  const execPerms: ExecutiveViewerPermissions = {
    canViewFinancials: perms.canViewFinancials ?? false,
    canViewProfitability: perms.canViewProfitability ?? false,
    canViewSensitiveDocs: false,
    canViewBanking: false,
    allowedLocationIds: [],
  };
  const execRange: ExecutiveRange = {
    preset: "custom",
    start: range.start,
    end: range.end,
    as_of: asOf,
  };
  const summary = buildExecutiveDashboard(
    toExecSources(src),
    execRange,
    execPerms,
    DEFAULT_HEALTH_CONFIG,
    asOf,
  );

  const f = summary.financial;
  const p = summary.profitability;
  const canMoney = execPerms.canViewFinancials;
  const canProfit = execPerms.canViewProfitability;

  const revenue = gateAmount(f.billed_revenue, perms);
  const collected = gateAmount(f.collections, perms);
  const contribution = canProfit ? p.operating_profit : null;

  // Conversational summary that distinguishes the three metrics (only those the
  // viewer may see). Never collapses them into one undefined number.
  const parts: string[] = [];
  if (canMoney) {
    if (revenue != null)
      parts.push(`generated ${formatMoney(revenue) ?? "—"} in rental revenue`);
    if (collected != null)
      parts.push(`collected ${formatMoney(collected) ?? "—"} in cash`);
  }
  if (canProfit && contribution != null) {
    parts.push(`operating contribution is ${formatMoney(contribution) ?? "—"}`);
  }
  const summaryText =
    parts.length > 0
      ? `This ${RANGE_LABEL[rangeKey].replace("this ", "")} you ${parts.join(", ")}.`
      : canMoney
        ? `No revenue or cash collected ${RANGE_LABEL[rangeKey]} yet.`
        : "You don't have permission to view financial figures.";

  return {
    ...base,
    answer_type: "summary",
    summary: summaryText,
    facts: [
      {
        label: "Rental revenue",
        value: revenue != null ? (formatMoney(revenue) ?? "—") : "—",
        financial: true,
      },
      {
        label: "Cash collected",
        value: collected != null ? (formatMoney(collected) ?? "—") : "—",
        financial: true,
      },
      {
        label: "Operating contribution",
        value: contribution != null ? (formatMoney(contribution) ?? "—") : "—",
        financial: true,
      },
      {
        label: "Outstanding balance",
        value:
          gateAmount(f.outstanding_balance, perms) != null
            ? (formatMoney(f.outstanding_balance ?? 0) ?? "—")
            : "—",
        financial: true,
      },
      { label: "Period", value: RANGE_LABEL[rangeKey] },
    ],
    sources: [
      {
        source_module: "dashboard",
        entity_type: "financial",
        entity_id: "earnings",
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
      "Revenue, cash collected, and operating contribution are reported separately — they are not the same number.",
    ],
  };
}
