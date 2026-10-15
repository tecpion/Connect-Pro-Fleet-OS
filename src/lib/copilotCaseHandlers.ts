// Connect Pro Fleet — Copilot Case Center handlers (Build #54).
//
// Factual Case Center questions answered from authoritative records via the
// caseCenterSelectors. Copilot NEVER produces a legal conclusion. These are
// fleet-wide (non-entity) list/summary intents. Pure delegation to existing
// selectors — no new store, no new calculations, no secrets.
//
// Historical questions (release insurance / safety maintenance / driver auth)
// remain handled by the defense entity handlers using the immutable Release
// Snapshot. Case handlers here answer operational case-management questions.

import type {
  CopilotAnswer,
  CopilotAnswerItem,
  CopilotIntent,
  CopilotViewerPermissions,
  EntityRef,
} from "./copilotTypes";
import type { CopilotEngineContext } from "./copilotEngine";
import { baseAnswer } from "./copilotShared";
import {
  deriveCaseCenterMetrics,
  getOpenCases,
  getCasesByCategory,
  deriveCaseFinancialSummary,
} from "./caseCenterSelectors";
import type { CaseCenterSources, CaseRecord } from "./caseCenterTypes";
import { CASE_CATEGORY_LABELS } from "./caseCenterTypes";
import { fmtMoney } from "./format";

/** Resolve the Case Center sources bundle from the engine context. Returns null
 *  when case sources are not attached (non-case tests) — handlers then return
 *  a graceful fallback. */
export function getCaseCenterSources(
  ctx: CopilotEngineContext,
): CaseCenterSources | null {
  return ctx.src.caseCenter ?? null;
}

function caseFallback(
  intent: CopilotIntent,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(intent, asOf, perms, "derived");
  return {
    ...base,
    answer_type: "summary",
    summary:
      "I can pull that from Case Center. Open Case Center and ask again, and I'll show the cases on file.",
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [
      {
        label: "Open Case Center",
        action_type: "navigate",
        deep_link: "/case-center",
      },
    ],
    caveats: [],
  };
}

function caseItem(c: CaseRecord, src: CaseCenterSources): CopilotAnswerItem {
  const customer = src.customers.find((x) => x.id === c.customer_id);
  const vehicle = src.vehicles.find((x) => x.id === c.vehicle_id);
  return {
    id: c.id,
    title: `${c.case_number} — ${c.title}`,
    subtitle: `${
      customer ? `${customer.first_name} ${customer.last_name}` : "—"
    } · ${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "—"} · ${fmtMoney(c.amount_at_issue)}`,
    deep_link: `/case-center/${c.id}`,
  };
}

function caseSources(
  cases: CaseRecord[],
): import("./copilotTypes").CopilotSource[] {
  return cases.slice(0, 10).map((c) => ({
    source_module: "Case Center",
    entity_type: "case",
    entity_id: c.id,
    label: c.case_number,
    deep_link: `/case-center/${c.id}`,
  }));
}

const OPEN_CASE_CENTER_ACTION = {
  label: "Open Case Center",
  action_type: "navigate" as const,
  deep_link: "/case-center",
};

/** "What cases need my attention?" — open cases needing review/action. */
export function answerCasesNeedAttention(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src) return caseFallback("cases_need_attention", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "cases_need_attention",
    ctx.asOf,
    ctx.perms,
    "derived",
  );
  const open = getOpenCases(src.cases);
  const attention = open.filter(
    (c) =>
      c.status === "new" ||
      c.status === "needs_review" ||
      c.status === "action_required" ||
      c.status === "awaiting_documentation",
  );
  const items = attention.map((c) => caseItem(c, src));
  return {
    ...base,
    answer_type: attention.length ? "list" : "summary",
    summary:
      attention.length === 0
        ? "No cases need your attention right now — everything open is either awaiting the customer or in recovery."
        : `${attention.length} case${attention.length === 1 ? "" : "s"} need your attention.`,
    items,
    sources: caseSources(attention),
    suggested_actions: [OPEN_CASE_CENTER_ACTION],
    caveats: [],
  };
}

/** "Do I have unresolved tolls?" — open toll/ticket cases. */
export function answerUnresolvedTolls(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src) return caseFallback("unresolved_tolls", ctx.asOf, ctx.perms);
  const base = baseAnswer("unresolved_tolls", ctx.asOf, ctx.perms, "derived");
  const open = getCasesByCategory(getOpenCases(src.cases), "tolls_tickets");
  const items = open.map((c) => caseItem(c, src));
  return {
    ...base,
    answer_type: open.length ? "list" : "summary",
    summary:
      open.length === 0
        ? "No open tolls or tickets right now."
        : `${open.length} open toll/ticket case${open.length === 1 ? "" : "s"}.`,
    items,
    sources: caseSources(open),
    suggested_actions: [OPEN_CASE_CENTER_ACTION],
    caveats: [],
  };
}

/** "Which customers owe toll reimbursements?" — open toll cases with customer
 *  responsibility. */
export function answerTollReimbursementsOwed(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src)
    return caseFallback("toll_reimbursements_owed", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "toll_reimbursements_owed",
    ctx.asOf,
    ctx.perms,
    "derived",
  );
  const openTolls = getCasesByCategory(
    getOpenCases(src.cases),
    "tolls_tickets",
  );
  const owe = openTolls.filter(
    (c) => c.responsibility.determination === "customer",
  );
  const items = owe.map((c) => caseItem(c, src));
  return {
    ...base,
    answer_type: owe.length ? "list" : "summary",
    summary:
      owe.length === 0
        ? "No customers owe outstanding toll reimbursements."
        : `${owe.length} customer toll reimbursement${owe.length === 1 ? "" : "s"} outstanding.`,
    items,
    sources: caseSources(owe),
    suggested_actions: [],
    caveats: [],
  };
}

/** "Show me disputed charges." — open dispute cases. */
export function answerDisputedCharges(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src) return caseFallback("disputed_charges", ctx.asOf, ctx.perms);
  const base = baseAnswer("disputed_charges", ctx.asOf, ctx.perms, "derived");
  const open = getOpenCases(src.cases);
  const disputed = open.filter(
    (c) => c.status === "disputed" || c.category === "disputes",
  );
  const items = disputed.map((c) => caseItem(c, src));
  return {
    ...base,
    answer_type: disputed.length ? "list" : "summary",
    summary:
      disputed.length === 0
        ? "No disputed charges right now."
        : `${disputed.length} disputed case${disputed.length === 1 ? "" : "s"}.`,
    items,
    sources: caseSources(disputed),
    suggested_actions: [],
    caveats: [
      "Disputes preserve the original charge — adjustments are audited, never deleted.",
    ],
  };
}

/** "How much is unrecovered?" — derived from authoritative ledger links. */
export function answerUnrecoveredAmount(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src) return caseFallback("unrecovered_amount", ctx.asOf, ctx.perms);
  const base = baseAnswer("unrecovered_amount", ctx.asOf, ctx.perms, "derived");
  const metrics = deriveCaseCenterMetrics(src);
  return {
    ...base,
    answer_type: "summary",
    summary: `Unrecovered amount across open cases: ${fmtMoney(metrics.unrecovered_amount)} (total at issue: ${fmtMoney(metrics.total_amount_at_issue)}).`,
    facts: [
      { label: "Unrecovered", value: fmtMoney(metrics.unrecovered_amount) },
      {
        label: "Total at issue",
        value: fmtMoney(metrics.total_amount_at_issue),
      },
      { label: "Open cases", value: String(metrics.open_cases) },
    ],
    items: [],
    sources: [
      {
        source_module: "Case Center",
        entity_type: "aggregate",
        entity_id: "unrecovered",
        label: "Derived from ledger links",
        deep_link: "/case-center",
      },
    ],
    suggested_actions: [OPEN_CASE_CENTER_ACTION],
    caveats: [
      "Recovery totals are derived from linked authoritative ledger transactions — Case Center is not a second ledger.",
    ],
  };
}

/** "Which deposits are waiting for review?" — open deposit/refund cases. */
export function answerDepositsWaitingReview(
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src) return caseFallback("deposits_waiting_review", ctx.asOf, ctx.perms);
  const base = baseAnswer(
    "deposits_waiting_review",
    ctx.asOf,
    ctx.perms,
    "derived",
  );
  const open = getCasesByCategory(getOpenCases(src.cases), "deposits_refunds");
  const items = open.map((c) => caseItem(c, src));
  return {
    ...base,
    answer_type: open.length ? "list" : "summary",
    summary:
      open.length === 0
        ? "No deposits waiting for review."
        : `${open.length} deposit/refund case${open.length === 1 ? "" : "s"} waiting for review.`,
    items,
    sources: caseSources(open),
    suggested_actions: [],
    caveats: [
      "Deposit authority stays in the Security Deposit domain — Case Center only coordinates.",
    ],
  };
}

/** "Tell me about Hannah's accident." / "Show me Hannah's Rental Record." —
 *  entity-scoped: resolves a customer/rental and surfaces linked cases +
 *  incidents. Delegates historical questions to the defense handlers. */
export function answerCaseForEntity(
  entity: EntityRef,
  ctx: CopilotEngineContext,
): CopilotAnswer {
  const src = getCaseCenterSources(ctx);
  if (!src) return caseFallback("case_for_entity", ctx.asOf, ctx.perms);
  const base = baseAnswer("case_for_entity", ctx.asOf, ctx.perms, "derived");
  let cases: CaseRecord[] = [];
  let incidents: CaseCenterSources["incidents"] = [];
  if (entity.type === "customer") {
    cases = src.cases.filter((c) => c.customer_id === entity.id);
    incidents = src.incidents.filter((i) => {
      const r = src.rentals.find((rr) => rr.id === i.reservation_id);
      return r?.customer_id === entity.id;
    });
  } else if (entity.type === "rental") {
    cases = src.cases.filter((c) => c.rental_id === entity.id);
    incidents = src.incidents.filter((i) => i.reservation_id === entity.id);
  }
  const openCases = getOpenCases(cases);
  const items = openCases.map((c) => caseItem(c, src));
  const incidentLines = incidents
    .map((i) => {
      const driver = i.incident_driver;
      return `• ${i.incident_type} on ${i.occurred_at}${
        driver ? ` — driver: ${driver.actual_driver_name}` : ""
      }`;
    })
    .join("\n");
  const caseLines = openCases
    .map(
      (c) =>
        `• ${c.case_number} (${CASE_CATEGORY_LABELS[c.category]}) — ${fmtMoney(c.amount_at_issue)}`,
    )
    .join("\n");
  const summaryParts: string[] = [`Records for ${entity.label}:`];
  summaryParts.push(
    `${openCases.length} open case${openCases.length === 1 ? "" : "s"}.`,
  );
  if (incidents.length > 0)
    summaryParts.push(
      `${incidents.length} incident${incidents.length === 1 ? "" : "s"} on file.`,
    );
  if (caseLines) summaryParts.push(caseLines);
  if (incidentLines) summaryParts.push(incidentLines);
  return {
    ...base,
    answer_type: items.length || incidents.length ? "list" : "summary",
    summary: summaryParts.join("\n"),
    items,
    sources: caseSources(openCases),
    suggested_actions:
      entity.type === "rental"
        ? [
            {
              label: "View Rental Record",
              action_type: "navigate",
              deep_link: `/rentals/${entity.id}`,
            },
          ]
        : [],
    caveats: [
      "Driver authorization shown is the historical status as of the incident date.",
    ],
  };
}

/** Re-export the financial summary selector for the case Copilot tests. */
export { deriveCaseFinancialSummary };
