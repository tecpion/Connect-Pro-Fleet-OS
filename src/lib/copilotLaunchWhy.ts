// Connect Pro Fleet — Copilot "why?" follow-up + product help handoff (Build #33).
//
// "Why?" explains the prior answer using its authoritative sources — never
// re-derives a different conclusion. Product-help questions route to the KB.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, formatMoney, gateAmount, plural } from "./copilotShared";
import { getOverdueAccounts } from "./briefingMoney";
import { getBlockedVehicles } from "./briefingFleet";
import { resolveProfitabilityRange } from "./profitabilityHelpers";
import { buildReportInputs } from "./reportInputs";
import {
  buildExecutiveDashboard,
  type ExecutiveDashboardSources,
} from "./executiveDashboardComposer";
import { DEFAULT_HEALTH_CONFIG } from "./executiveTypes";
import type { ExecutiveViewerPermissions } from "./executiveTypes";
import { isProductHelpQuery, searchKnowledge } from "./supportKnowledgeBase";

function toExecSources(src: CopilotSources): {
  sources: ExecutiveDashboardSources;
  perms: ExecutiveViewerPermissions;
} {
  const vt = src.vehicleTwin;
  const sources: ExecutiveDashboardSources = {
    store: vt.store,
    // Build #33 — build profitability inputs from the store when not carried
    // on CopilotSources (degrades gracefully without investor/expense rules).
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

/** "Why?" — explains the prior answer using its sources/context. Never
 *  re-derives a different conclusion. */
export function answerWhy(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  conversation: {
    context_prior_intent?: string | null;
    context_customer_id?: string | null;
    context_vehicle_id?: string | null;
  },
): CopilotAnswer {
  const base = baseAnswer("why", asOf, perms, "derived");
  const priorIntent = conversation.context_prior_intent;

  if (!priorIntent || priorIntent === "unsupported") {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I don't have a prior answer to explain. Ask a question first, then ask 'why?' to understand the reasoning.",
    };
  }

  if (
    priorIntent === "vehicle_unavailable_reason" &&
    conversation.context_vehicle_id
  ) {
    return explainVehicleUnavailable(src, asOf, perms, conversation);
  }
  if (
    priorIntent === "overdue_accounts" ||
    priorIntent === "customer_balance"
  ) {
    return explainOverdue(src, asOf, perms, conversation);
  }
  if (
    priorIntent === "business_health" ||
    priorIntent === "health_score_explanation"
  ) {
    return explainHealth(src, asOf, perms);
  }

  return {
    ...base,
    answer_type: "summary",
    summary: `That answer came from the ${priorIntent.replace(/_/g, " ")} data. The underlying facts are from authoritative Fleet selectors — no AI judgment is involved.`,
    facts: [],
    sources: [],
    caveats: [
      "The Copilot explains existing facts — it never re-derives a different conclusion.",
    ],
  };
}

function explainVehicleUnavailable(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  conversation: { context_vehicle_id?: string | null },
): CopilotAnswer {
  const base = baseAnswer("why", asOf, perms, "derived");
  const vehicleId = conversation.context_vehicle_id;
  if (!vehicleId) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I don't have a vehicle in context to explain.",
    };
  }
  const v = src.briefing.store.vehicles.find((x) => x.id === vehicleId);
  if (!v) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't find that vehicle.",
    };
  }
  const blockers = getBlockedVehicles(src.briefing, asOf).filter(
    (b) => b.vehicle_id === vehicleId || b.entity_id === vehicleId,
  );
  if (blockers.length === 0) {
    return {
      ...base,
      answer_type: "entity",
      summary: `${v.year} ${v.make} ${v.model} isn't currently blocked — it should be available.`,
      sources: [
        {
          source_module: "vehicles",
          entity_type: "vehicle",
          entity_id: vehicleId,
          label: `${v.year} ${v.make} ${v.model}`,
          deep_link: `/vehicles/${vehicleId}`,
        },
      ],
    };
  }
  return {
    ...base,
    answer_type: "entity",
    summary: `${v.year} ${v.make} ${v.model} is unavailable because: ${blockers.map((b) => b.reason).join(", ")}.`,
    facts: blockers.map((b, i) => ({
      label: `Reason ${i + 1}`,
      value: b.reason ?? "—",
    })),
    sources: blockers.map((b) => ({
      source_module: b.source_module,
      entity_type: b.entity_type,
      entity_id: b.entity_id,
      label: b.title,
      deep_link: b.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Vehicle",
        action_type: "view_vehicle",
        deep_link: `/vehicles/${vehicleId}`,
      },
    ],
  };
}

function explainOverdue(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  conversation: { context_customer_id?: string | null },
): CopilotAnswer {
  const base = baseAnswer("why", asOf, perms, "derived");
  const custId = conversation.context_customer_id;
  if (!custId) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I don't have a customer in context to explain.",
    };
  }
  const overdue = getOverdueAccounts(src.briefing, asOf).filter(
    (o) => o.customer_id === custId,
  );
  if (overdue.length === 0) {
    return {
      ...base,
      answer_type: "summary",
      summary: "That customer isn't currently overdue.",
      caveats: ["Lateness is based on the due cutoff plus grace period."],
    };
  }
  const total = overdue.reduce((s, o) => s + (o.amount ?? 0), 0);
  return {
    ...base,
    answer_type: "list",
    summary: perms.canViewFinancials
      ? `This customer is overdue because ${overdue.length} ${plural(overdue.length, "obligation")} ${plural(overdue.length, "is", "are")} past the due cutoff (${formatMoney(total)} total).`
      : `This customer is overdue because ${overdue.length} ${plural(overdue.length, "obligation")} ${plural(overdue.length, "is", "are")} past the due cutoff.`,
    facts: [
      { label: "Overdue obligations", value: overdue.length },
      {
        label: "Total overdue",
        value: gateAmount(total, perms) ?? "—",
        financial: true,
      },
    ],
    items: overdue.map((o) => ({
      id: o.id,
      title: o.title,
      subtitle: o.reason,
      amount: gateAmount(o.amount, perms),
      due_at: o.due_at,
      deep_link: o.deep_link,
    })),
    sources: overdue.slice(0, 5).map((o) => ({
      source_module: o.source_module,
      entity_type: o.entity_type,
      entity_id: o.entity_id,
      label: o.title,
      deep_link: o.deep_link,
    })),
    caveats: ["Overdue status is based on the due cutoff plus grace period."],
  };
}

function explainHealth(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("why", asOf, perms, "derived");
  const { sources: execSources, perms: execPerms } = toExecSources(src);
  const merged: ExecutiveViewerPermissions = {
    ...execPerms,
    canViewFinancials: perms.canViewFinancials ?? execPerms.canViewFinancials,
  };
  const range = resolveProfitabilityRange("this_month");
  const summary = buildExecutiveDashboard(
    execSources,
    { preset: "this_month", start: range.start, end: range.end, as_of: asOf },
    merged,
    DEFAULT_HEALTH_CONFIG,
    asOf,
  );
  const h = summary.health;
  return {
    ...base,
    answer_type: "summary",
    summary: `Your health score is ${h.overall_score}/100 because of the weighted average of 5 components (formula ${h.formula_version}).`,
    facts: h.components.map((c) => ({
      label: c.label,
      value: `${c.score} — ${c.explanation}`,
    })),
    sources: [
      {
        source_module: "dashboard",
        entity_type: "health",
        entity_id: "why",
        label: "Health Explanation",
        deep_link: "/executive",
      },
    ],
  };
}

/** Routes a product-help question to the Knowledge Base. Never improvises. */
export function answerProductHelpHandoff(
  query: string,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("product_help_handoff", asOf, perms, "deterministic");
  if (!isProductHelpQuery(query)) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "That doesn't look like a product-help question. Try asking about your operation instead.",
    };
  }
  const results = searchKnowledge(query, 3);
  const matches = results.matches ?? [];
  if (matches.length === 0) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I couldn't find a help article for that. You can browse the Knowledge Base or report a problem.",
      suggested_actions: [
        {
          label: "Open Help & Support",
          action_type: "view_support",
          deep_link: "/support",
        },
        {
          label: "Report a Problem",
          action_type: "report_problem",
          deep_link: "/support",
        },
      ],
    };
  }
  return {
    ...base,
    answer_type: "list",
    summary: `This looks like a product-help question. Here ${plural(matches.length, "is", "are")} ${matches.length} relevant ${plural(matches.length, "article")} from the Knowledge Base:`,
    items: matches.map((a) => ({
      id: a.article_id,
      title: a.title,
      subtitle: a.summary,
      deep_link: `/support/articles/${a.slug}`,
    })),
    sources: matches.map((a) => ({
      source_module: "knowledge_base",
      entity_type: "article",
      entity_id: a.article_id,
      label: a.title,
      deep_link: `/support/articles/${a.slug}`,
    })),
    suggested_actions: [
      {
        label: "Open Help & Support",
        action_type: "view_support",
        deep_link: "/support",
      },
    ],
    caveats: [
      "Product-help questions route to the Knowledge Base — operational questions stay with Fleet Copilot.",
    ],
  };
}
