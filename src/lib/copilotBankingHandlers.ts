// Connect Pro Fleet — Copilot banking handlers (Build #42).
//
// Each handler calls authoritative banking selectors (Build #42 attention
// selectors) and returns STRUCTURED answer data — never just prose. Financial
// amounts are permission-gated (null when the viewer lacks financial
// permission). The Copilot MUST distinguish bank activity (evidence of money
// movement) from authoritative revenue/expense/payment records.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, formatMoney, gateAmount, plural } from "./copilotShared";
import {
  getBankingKpiSummary,
  getTransactionAttention,
  getStatementAttention,
  detectDuplicateTransactions,
  type TransactionAttentionItem,
} from "./bankingAttention";
import { getSuggestedTransactions } from "./reconciliationSelectors";

function storeOf(src: CopilotSources) {
  return src.briefing.store;
}

function accountName(src: CopilotSources) {
  return (id: string) => {
    const a = storeOf(src).financialAccountById(id);
    return a?.name ?? null;
  };
}

function staffName(src: CopilotSources) {
  return (id: string | null) => {
    if (!id) return null;
    const s = storeOf(src).staff.find((x) => x.id === id);
    return s ? s.full_name : null;
  };
}

/** "Which bank transactions still need review?" */
export function answerBankingNeedsReview(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("banking_needs_review", asOf, perms, "derived");
  if (!perms.canViewBanking) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Banking data is available to authorized users only.",
    };
  }
  const s = storeOf(src);
  const items = getTransactionAttention(
    s.importedTransactions,
    s.reconciliationMatches,
    accountName(src),
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No bank transactions need review."
        : `${items.length} ${plural(items.length, "bank transaction")} ${plural(items.length, "needs", "need")} review.`,
    facts: [{ label: "Transactions needing review", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.imported_transaction_id,
      title: i.description,
      subtitle: i.reasons.join(" · "),
      amount: gateAmount(i.amount, perms),
      occurred_at: i.transaction_date,
      status: i.match_status,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: "banking",
      entity_type: "imported_transaction",
      entity_id: i.imported_transaction_id,
      label: i.description,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Banking Inbox",
        action_type: "view_banking",
        deep_link: "/finance?tab=banking&subtab=inbox",
      },
    ],
    caveats: [
      "Imported bank activity is evidence of money movement — not revenue or expense until matched.",
    ],
  };
}

/** "How much money out is unmatched?" */
export function answerBankingUnmatchedOut(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("banking_unmatched_out", asOf, perms, "derived");
  if (!perms.canViewBanking) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Banking data is available to authorized users only.",
    };
  }
  const s = storeOf(src);
  const kpi = getBankingKpiSummary(s.importedTransactions, s.statements);
  const outItems = getTransactionAttention(
    s.importedTransactions,
    s.reconciliationMatches,
    accountName(src),
  ).filter((i) => i.direction === "money_out");
  return {
    ...base,
    answer_type: "list",
    summary:
      kpi.unmatched_out_count === 0
        ? "No unmatched money out."
        : `${kpi.unmatched_out_count} unmatched ${plural(kpi.unmatched_out_count, "outgoing transaction")} (${formatMoney(kpi.unmatched_out_amount) ?? "—"} total).`,
    facts: [
      { label: "Unmatched out (count)", value: kpi.unmatched_out_count },
      {
        label: "Unmatched out (amount)",
        value: gateAmount(kpi.unmatched_out_amount, perms) ?? "—",
        financial: true,
      },
    ],
    items: outItems.slice(0, 25).map((i) => ({
      id: i.imported_transaction_id,
      title: i.description,
      subtitle: i.reasons.join(" · "),
      amount: gateAmount(i.amount, perms),
      occurred_at: i.transaction_date,
      deep_link: i.deep_link,
    })),
    sources: outItems.slice(0, 10).map((i) => ({
      source_module: "banking",
      entity_type: "imported_transaction",
      entity_id: i.imported_transaction_id,
      label: i.description,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Banking Inbox",
        action_type: "view_banking",
        deep_link: "/finance?tab=banking&subtab=inbox",
      },
    ],
    caveats: [
      "Unmatched money out is bank activity — it is not an expense until matched or converted.",
    ],
  };
}

/** "How much money in is unmatched?" */
export function answerBankingUnmatchedIn(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("banking_unmatched_in", asOf, perms, "derived");
  if (!perms.canViewBanking) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Banking data is available to authorized users only.",
    };
  }
  const s = storeOf(src);
  const kpi = getBankingKpiSummary(s.importedTransactions, s.statements);
  const inItems = getTransactionAttention(
    s.importedTransactions,
    s.reconciliationMatches,
    accountName(src),
  ).filter((i) => i.direction === "money_in");
  return {
    ...base,
    answer_type: "list",
    summary:
      kpi.unmatched_in_count === 0
        ? "No unmatched money in."
        : `${kpi.unmatched_in_count} unmatched ${plural(kpi.unmatched_in_count, "incoming transaction")} (${formatMoney(kpi.unmatched_in_amount) ?? "—"} total).`,
    facts: [
      { label: "Unmatched in (count)", value: kpi.unmatched_in_count },
      {
        label: "Unmatched in (amount)",
        value: gateAmount(kpi.unmatched_in_amount, perms) ?? "—",
        financial: true,
      },
    ],
    items: inItems.slice(0, 25).map((i) => ({
      id: i.imported_transaction_id,
      title: i.description,
      subtitle: i.reasons.join(" · "),
      amount: gateAmount(i.amount, perms),
      occurred_at: i.transaction_date,
      deep_link: i.deep_link,
    })),
    sources: inItems.slice(0, 10).map((i) => ({
      source_module: "banking",
      entity_type: "imported_transaction",
      entity_id: i.imported_transaction_id,
      label: i.description,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Banking Inbox",
        action_type: "view_banking",
        deep_link: "/finance?tab=banking&subtab=inbox",
      },
    ],
    caveats: [
      "Unmatched money in is bank activity — it is not revenue or a customer payment until matched.",
    ],
  };
}

/** "Are there possible duplicate expenses?" */
export function answerBankingDuplicateExpenses(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("banking_duplicate_expenses", asOf, perms, "derived");
  if (!perms.canViewBanking) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Banking data is available to authorized users only.",
    };
  }
  const s = storeOf(src);
  const suspects = detectDuplicateTransactions(s.importedTransactions);
  return {
    ...base,
    answer_type: "list",
    summary:
      suspects.length === 0
        ? "No possible duplicate bank transactions detected."
        : `${suspects.length} possible ${plural(suspects.length, "duplicate pair")} detected.`,
    facts: [{ label: "Possible duplicate pairs", value: suspects.length }],
    items: suspects.slice(0, 25).map((d, idx) => ({
      id: `dup_${idx}`,
      title: d.existing.description,
      subtitle: d.signals.join(" · "),
      amount: gateAmount(d.existing.amount, perms),
      occurred_at: d.existing.transaction_date,
      deep_link: `/finance?tab=banking&subtab=inbox&txn=${d.existing.id}`,
    })),
    sources: suspects.slice(0, 10).map((d, idx) => ({
      source_module: "banking",
      entity_type: "imported_transaction",
      entity_id: d.existing.id,
      label: `Duplicate suspect ${idx + 1}`,
      deep_link: `/finance?tab=banking&subtab=inbox&txn=${d.existing.id}`,
    })),
    suggested_actions: [
      {
        label: "Open Banking Inbox",
        action_type: "view_banking",
        deep_link: "/finance?tab=banking&subtab=inbox",
      },
    ],
    caveats: [
      "Duplicate detection uses deterministic signals (same ID, fingerprint, amount/date). Legitimate duplicates are not blocked.",
    ],
  };
}

/** "Which statements need attention?" */
export function answerBankingStatementsAttention(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    "banking_statements_attention",
    asOf,
    perms,
    "derived",
  );
  if (!perms.canViewBanking) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Banking data is available to authorized users only.",
    };
  }
  const s = storeOf(src);
  const items = getStatementAttention(
    s.statements,
    s.importedTransactions,
    accountName(src),
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No statements need attention."
        : `${items.length} ${plural(items.length, "statement")} ${plural(items.length, "needs", "need")} attention.`,
    facts: [{ label: "Statements needing attention", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.statement_id,
      title: `${i.account_name ?? "Account"} · ${i.period_start} → ${i.period_end}`,
      subtitle: i.reasons.join(" · "),
      amount: gateAmount(i.difference, perms),
      status: i.status,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: "banking",
      entity_type: "statement",
      entity_id: i.statement_id,
      label: `${i.account_name ?? "Statement"} · ${i.period_start} → ${i.period_end}`,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "Open Statements",
        action_type: "view_banking_statements",
        deep_link: "/finance?tab=banking&subtab=statements",
      },
    ],
  };
}

/** "Which transactions have suggested expense matches?" */
export function answerBankingSuggestedMatches(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("banking_suggested_matches", asOf, perms, "derived");
  if (!perms.canViewBanking) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Banking data is available to authorized users only.",
    };
  }
  const s = storeOf(src);
  const suggested = getSuggestedTransactions(s.importedTransactions);
  return {
    ...base,
    answer_type: "list",
    summary:
      suggested.length === 0
        ? "No suggested matches awaiting confirmation."
        : `${suggested.length} ${plural(suggested.length, "transaction")} ${plural(suggested.length, "has", "have")} suggested matches awaiting confirmation.`,
    facts: [{ label: "Suggested matches", value: suggested.length }],
    items: suggested.slice(0, 25).map((t) => ({
      id: t.id,
      title: t.description,
      subtitle: `Suggested match · ${t.match_status}`,
      amount: gateAmount(t.amount, perms),
      occurred_at: t.transaction_date,
      deep_link: `/finance?tab=banking&subtab=inbox&txn=${t.id}`,
    })),
    sources: suggested.slice(0, 10).map((t) => ({
      source_module: "banking",
      entity_type: "imported_transaction",
      entity_id: t.id,
      label: t.description,
      deep_link: `/finance?tab=banking&subtab=inbox&txn=${t.id}`,
    })),
    suggested_actions: [
      {
        label: "Open Banking Inbox",
        action_type: "view_banking",
        deep_link: "/finance?tab=banking&subtab=inbox",
      },
    ],
    caveats: [
      "A suggested match is not a confirmed match — bank activity remains evidence until confirmed.",
    ],
  };
}
