// Connect Pro Fleet — Copilot finance-overview handler.
//
// "Give me a finance overview" / "overview of income for last month" — a broad
// request for the financial picture, scoped to the detected time range. Distinct
// from earnings_summary (which answers "how much did I earn"): the finance
// overview presents the four key figures together — Gross Revenue Generated,
// Cash Collected, Expenses, and Operating Contribution — so the user gets the
// whole picture without the metrics collapsing into one ambiguous "income"
// number.
//
// Uses the AUTHORITATIVE executive dashboard composer (no new formula, no new
// store). Time range detected from the query (last month / last week / this
// year / today / etc.) via resolveDomainRange so past ranges work. All amounts
// are permission-gated BEFORE forming. Pure + deterministic.

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
} from "./executiveTypes";
import {
  detectDomainTimeRange,
  resolveDomainRange,
  domainRangeLabel,
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

/** "Give me a finance overview" — revenue / cash / expenses / contribution. */
export function answerFinanceOverview(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("finance_overview", asOf, perms, "derived");
  const rangeKey: DomainTimeRange =
    detectDomainTimeRange(query) ?? "this_month";
  const range = resolveDomainRange(rangeKey, asOf);

  const execPerms: ExecutiveViewerPermissions = {
    canViewFinancials: perms.canViewFinancials ?? false,
    canViewProfitability: perms.canViewProfitability ?? false,
    canViewSensitiveDocs: false,
    canViewBanking: false,
    allowedLocationIds: [],
  };
  const execRange = {
    preset: "custom" as const,
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
  const label = domainRangeLabel(rangeKey);

  const revenue = gateAmount(f.billed_revenue, perms);
  const collected = gateAmount(f.collections, perms);
  // Operating expenses + contribution live on the profitability snapshot
  // (gated by canViewProfitability), not the financial snapshot.
  const expenses = canProfit ? p.operating_expenses : null;
  const contribution = canProfit ? p.operating_profit : null;

  const parts: string[] = [];
  if (canMoney) {
    if (revenue != null)
      parts.push(`generated ${formatMoney(revenue) ?? "—"} in rental revenue`);
    if (collected != null)
      parts.push(`collected ${formatMoney(collected) ?? "—"} in cash`);
  }
  if (canProfit) {
    if (expenses != null)
      parts.push(`spent ${formatMoney(expenses)} on operating expenses`);
    if (contribution != null)
      parts.push(
        `for an operating contribution of ${formatMoney(contribution) ?? "—"}`,
      );
  }
  const summaryText =
    parts.length > 0
      ? `Here's your financial overview for ${label}: you ${parts.join(", ")}.`
      : canMoney
        ? `No financial activity recorded ${label}.`
        : "You don't have permission to view financial figures.";

  return {
    ...base,
    answer_type: "summary",
    summary: summaryText,
    facts: [
      {
        label: "Gross revenue generated",
        value: revenue != null ? (formatMoney(revenue) ?? "—") : "—",
        financial: true,
      },
      {
        label: "Cash collected",
        value: collected != null ? (formatMoney(collected) ?? "—") : "—",
        financial: true,
      },
      {
        label: "Operating expenses",
        value: expenses != null ? (formatMoney(expenses) ?? "—") : "—",
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
      { label: "Period", value: label },
    ],
    sources: [
      {
        source_module: "dashboard",
        entity_type: "financial",
        entity_id: "finance_overview",
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
      "Revenue, cash collected, expenses, and operating contribution are reported separately — they are not the same number.",
    ],
  };
}
