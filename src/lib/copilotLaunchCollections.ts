// Connect Pro Fleet — Copilot collections ranking (Build #33).
//
// Deterministic collections follow-up ranking by overdue amount, age, and
// broken arrangement. No customer risk score. Permission-gated.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { getOverdueAccounts, getArrangementAttention } from "./briefingMoney";
import { baseAnswer, formatMoney, gateAmount, plural } from "./copilotShared";

interface CollectionsCandidate {
  customerId: string;
  customerName: string;
  rentalId: string;
  amount: number;
  daysLate: number;
  hasBrokenArrangement: boolean;
  weight: number;
}

/** "Who should collections follow up with first?" — deterministic ranking by
 *  overdue amount, age, and broken arrangement. No customer risk score. */
export function answerCollectionsRank(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("collections_rank", asOf, perms, "derived");
  const overdue = getOverdueAccounts(src.briefing, asOf);
  const broken = getArrangementAttention(src.briefing, asOf).filter(
    (i) => i.status === "broken" || /broken/i.test(i.reason ?? ""),
  );
  const brokenCustomerIds = new Set(
    broken.map((b) => b.customer_id).filter(Boolean) as string[],
  );

  const candidates: CollectionsCandidate[] = overdue.map((o) => {
    const amount = o.amount ?? 0;
    const daysLate = Math.max(0, o.age_days ?? 0);
    const hasBrokenArrangement = brokenCustomerIds.has(o.customer_id ?? "");
    let weight = 0;
    weight += Math.min(500, Math.round(amount / 10));
    weight += Math.min(300, daysLate * 10);
    if (hasBrokenArrangement) weight += 400;
    return {
      customerId: o.customer_id ?? o.entity_id,
      customerName: o.title,
      rentalId: o.rental_id ?? o.entity_id,
      amount,
      daysLate,
      hasBrokenArrangement,
      weight,
    };
  });

  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates.slice(0, 10);

  return {
    ...base,
    answer_type: "list",
    summary:
      top.length === 0
        ? "No overdue accounts to follow up on right now."
        : `${top.length} ${plural(top.length, "account")} ranked for collections follow-up.`,
    facts: [
      { label: "Accounts to follow up", value: top.length },
      {
        label: "Total overdue",
        value:
          gateAmount(
            candidates.reduce((s, c) => s + c.amount, 0),
            perms,
          ) ?? "—",
        financial: true,
      },
    ],
    items: top.map((c) => ({
      id: c.customerId,
      title: c.customerName,
      subtitle: perms.canViewFinancials
        ? `${formatMoney(c.amount)} · ${c.daysLate} days late${c.hasBrokenArrangement ? " · broken arrangement" : ""}`
        : `${c.daysLate} days late${c.hasBrokenArrangement ? " · broken arrangement" : ""}`,
      amount: gateAmount(c.amount, perms),
      status: c.hasBrokenArrangement ? "broken arrangement" : "overdue",
      deep_link: `/customers/${c.customerId}`,
    })),
    sources: top.slice(0, 10).map((c) => ({
      source_module: "billing",
      entity_type: "customer",
      entity_id: c.customerId,
      label: c.customerName,
      deep_link: `/customers/${c.customerId}`,
    })),
    suggested_actions: [
      {
        label: "View Payments Due",
        action_type: "view_payments",
        deep_link: "/payments",
      },
    ],
    caveats: [
      "Ranking uses disclosed facts (overdue amount, age, broken arrangement) — no hidden customer risk score.",
    ],
  };
}
