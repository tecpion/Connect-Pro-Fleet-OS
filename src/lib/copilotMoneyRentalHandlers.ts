// Connect Pro Fleet — Copilot money + rental handlers (Build #29).
//
// Each handler calls authoritative selectors (Build #28 briefing money/rentals)
// and returns STRUCTURED answer data — never just prose. Financial amounts are
// permission-gated (null when the viewer lacks financial permission). The late
// evaluator is reused — no new lateness logic.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
  EntityRef,
} from "./copilotTypes";
import {
  getMoneyDueToday,
  getOverdueAccounts,
  getArrangementAttention,
  getPaymentsReceivedToday,
} from "./briefingMoney";
import {
  getRentalsStartingToday,
  getRentalsReturningToday,
  getOverdueReturns,
  getRentalReadiness,
} from "./briefingRentals";
import { resolveItemAmount } from "./briefingComposer";
import { baseAnswer, formatMoney, gateAmount, plural } from "./copilotShared";

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function answerMoneyDueToday(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getMoneyDueToday(src.briefing, asOf);
  const base = baseAnswer("money_due_today", asOf, perms, "derived");
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const money = perms.canViewFinancials ? ` (${formatMoney(total)} total)` : "";
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No payments are due today."
        : `${items.length} ${plural(items.length, "customer")} ${plural(items.length, "has", "have")} payments due today${money}.`,
    facts: [
      { label: "Customers due", value: items.length },
      {
        label: "Total due",
        value: gateAmount(total, perms) ?? "—",
        financial: true,
      },
    ],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      amount: resolveItemAmount(i, perms),
      due_at: i.due_at ?? null,
      status: i.status ?? null,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Payments Due",
        action_type: "view_payments",
        deep_link: "/payments",
      },
    ],
  };
}

export function answerOverdueAccounts(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getOverdueAccounts(src.briefing, asOf);
  const base = baseAnswer("overdue_accounts", asOf, perms, "derived");
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const money = perms.canViewFinancials
    ? ` (${formatMoney(total)} overdue)`
    : "";
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "You're clear — no customers are currently overdue."
        : `${items.length} ${plural(items.length, "customer")} ${plural(items.length, "is", "are")} overdue${money}.`,
    facts: [
      { label: "Overdue customers", value: items.length },
      {
        label: "Overdue total",
        value: gateAmount(total, perms) ?? "—",
        financial: true,
      },
    ],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      amount: resolveItemAmount(i, perms),
      due_at: i.due_at ?? null,
      occurred_at: i.occurred_at ?? null,
      status: i.status ?? null,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Collections",
        action_type: "view_collections",
        deep_link: "/payments",
      },
    ],
    caveats: ["Overdue status is based on the due cutoff plus grace period."],
  };
}

export function answerCustomerBalance(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const s = src.briefing.store;
  const base = baseAnswer("customer_balance", asOf, perms, "derived");
  const custId = entity.type === "customer" ? entity.id : null;
  if (!custId) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which customer you mean.",
    };
  }
  // Sum posted charges minus payments for this customer's rentals.
  const rentalIds = new Set(
    s.rentals.filter((r) => r.customer_id === custId).map((r) => r.id),
  );
  let balance = 0;
  for (const t of s.transactions) {
    if (t.status !== "posted") continue;
    if (!rentalIds.has(t.rental_id)) continue;
    balance +=
      t.category === "payment" || t.category === "credit"
        ? -t.amount
        : t.amount;
  }
  return {
    ...base,
    answer_type: "summary",
    summary: perms.canViewFinancials
      ? `${entity.label} currently owes ${formatMoney(balance)}.`
      : `Balance for ${entity.label} is available to authorized users only.`,
    facts: [
      { label: "Customer", value: entity.label },
      {
        label: "Outstanding balance",
        value: gateAmount(balance, perms) ?? "—",
        financial: true,
      },
    ],
    sources: [
      {
        source_module: "billing",
        entity_type: "customer",
        entity_id: custId,
        label: entity.label,
        deep_link: `/customers/${custId}`,
      },
    ],
    suggested_actions: [
      {
        label: "View Customer",
        action_type: "view_customer",
        deep_link: `/customers/${custId}`,
      },
    ],
    caveats: [
      "Balance is derived from the posted ledger — never from timeline descriptions.",
    ],
  };
}

export function answerPaymentsReceivedToday(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const rec = getPaymentsReceivedToday(src.briefing, asOf);
  const base = baseAnswer("payments_received_today", asOf, perms, "derived");
  const money = perms.canViewFinancials
    ? ` (${formatMoney(rec.amount)} received)`
    : "";
  return {
    ...base,
    answer_type: "summary",
    summary:
      rec.count === 0
        ? "No payments received today yet."
        : `${rec.count} ${plural(rec.count, "payment")} received today${money}.`,
    facts: [
      { label: "Payments received", value: rec.count },
      {
        label: "Received amount",
        value: gateAmount(rec.amount, perms) ?? "—",
        financial: true,
      },
    ],
    items: [],
    sources: [],
    suggested_actions: [
      {
        label: "View Payments",
        action_type: "view_payments",
        deep_link: "/payments",
      },
    ],
    caveats: ["Reversed/voided payments are excluded from received totals."],
  };
}

export function answerBrokenArrangements(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getArrangementAttention(src.briefing, asOf).filter(
    (i) => i.status === "broken" || /broken/i.test(i.reason ?? ""),
  );
  const base = baseAnswer("broken_arrangements", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No broken payment arrangements."
        : `${items.length} broken ${plural(items.length, "arrangement")}.`,
    facts: [{ label: "Broken arrangements", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      amount: resolveItemAmount(i, perms),
      deep_link: i.deep_link,
    })),
    sources: [],
    suggested_actions: [
      {
        label: "View Arrangements",
        action_type: "view_arrangements",
        deep_link: "/arrangements",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rentals
// ---------------------------------------------------------------------------

export function answerRentalsStartingToday(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getRentalsStartingToday(src.briefing, asOf);
  const base = baseAnswer("rentals_starting_today", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No rentals starting today."
        : `${items.length} ${plural(items.length, "rental")} starting today.`,
    facts: [{ label: "Starting today", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      due_at: i.due_at ?? null,
      status: i.status ?? null,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Reservations",
        action_type: "view_reservations",
        deep_link: "/reservations",
      },
    ],
  };
}

export function answerRentalsReturningToday(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getRentalsReturningToday(src.briefing, asOf);
  const base = baseAnswer("rentals_returning_today", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No returns due today."
        : `${items.length} ${plural(items.length, "rental")} returning today.`,
    facts: [{ label: "Returning today", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      due_at: i.due_at ?? null,
      status: i.status ?? null,
      deep_link: i.deep_link,
    })),
    sources: items.slice(0, 10).map((i) => ({
      source_module: i.source_module,
      entity_type: i.entity_type,
      entity_id: i.entity_id,
      label: i.title,
      deep_link: i.deep_link,
    })),
    suggested_actions: [
      {
        label: "View Rentals",
        action_type: "view_rentals",
        deep_link: "/rentals",
      },
    ],
  };
}

export function answerOverdueReturns(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const items = getOverdueReturns(src.briefing, asOf);
  const base = baseAnswer("overdue_returns", asOf, perms, "derived");
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No overdue returns."
        : `${items.length} overdue ${plural(items.length, "return")}.`,
    facts: [{ label: "Overdue returns", value: items.length }],
    items: items.slice(0, 25).map((i) => ({
      id: i.id,
      title: i.title,
      subtitle: i.reason,
      occurred_at: i.occurred_at ?? null,
      status: i.status ?? null,
      deep_link: i.deep_link,
    })),
    sources: [],
    suggested_actions: [
      {
        label: "View Rentals",
        action_type: "view_rentals",
        deep_link: "/rentals",
      },
    ],
    caveats: [
      "Open-ended/long-term rentals are not flagged as overdue returns.",
    ],
  };
}

export function answerRentalReadiness(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  entity: EntityRef,
): CopilotAnswer {
  const base = baseAnswer("rental_status", asOf, perms, "derived");
  const s = src.briefing.store;
  const rentalId = entity.type === "rental" ? entity.id : null;
  if (!rentalId) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "I couldn't determine which rental you mean.",
    };
  }
  const rental = s.rentals.find((r) => r.id === rentalId);
  if (!rental) {
    return {
      ...base,
      answer_type: "fallback",
      summary: `I couldn't find rental ${entity.label}.`,
    };
  }
  const readiness = getRentalReadiness(rentalId, src.briefing, asOf);
  const label =
    readiness === "ready"
      ? "Ready for pickup"
      : readiness === "attention"
        ? "Attention needed"
        : "Blocked";
  return {
    ...base,
    answer_type: "entity",
    summary: `Rental ${rental.agreement_number ?? rental.id} — ${label}.`,
    facts: [
      { label: "Rental", value: rental.agreement_number ?? rental.id },
      { label: "Readiness", value: label },
      { label: "Status", value: rental.status },
    ],
    sources: [
      {
        source_module: "rentals",
        entity_type: "rental",
        entity_id: rental.id,
        label: `Rental ${rental.agreement_number ?? rental.id}`,
        deep_link: `/rentals/${rental.id}`,
      },
    ],
    suggested_actions: [
      {
        label: "View Rental",
        action_type: "view_rental",
        deep_link: `/rentals/${rental.id}`,
      },
    ],
  };
}
