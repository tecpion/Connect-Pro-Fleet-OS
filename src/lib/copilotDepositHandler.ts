// Connect Pro Fleet — Copilot deposit summary handler (Build #47).
//
// "How much do I have in deposits?" / "deposits held" / "deposits collected" /
// "deposits refunded" / "deposits applied" — uses the AUTHORITATIVE
// RentalDeposit records + the deposit domain helpers (getDepositHeldBalance,
// etc.). "How much do I have in deposits" most naturally means currently HELD
// deposits, so that is the headline; the other totals (collected / applied /
// refunded / forfeited) are provided as supporting facts.
//
// A time-range phrase ("this year") scopes the COLLECTED total to deposits
// collected within that window (by collected_at). Held/applied/refunded are
// current-state snapshots (not time-scoped) because "how much do I have" asks
// about the present. All amounts are permission-gated BEFORE forming. Pure +
// deterministic; no new store.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import { baseAnswer, formatMoney, gateAmount, plural } from "./copilotShared";
import { getDepositHeldBalance, getDepositRefundDue } from "./deposit";
import {
  detectDomainTimeRange,
  resolveDomainRange,
  domainRangeLabel,
} from "./copilotDomainRouter";

/** "How much do I have in deposits?" — headline = currently held; supporting
 *  totals for collected / applied / refunded / forfeited. */
export function answerDepositSummary(
  query: string,
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("deposit_summary", asOf, perms, "derived");
  const deposits = src.briefing.store.rentalDeposits ?? [];

  // Current-state snapshots (not time-scoped).
  let held = 0;
  let applied = 0;
  let refunded = 0;
  let forfeited = 0;
  let refundDue = 0;
  for (const d of deposits) {
    held += getDepositHeldBalance(d);
    applied += d.applied_amount;
    refunded += d.refunded_amount;
    forfeited += d.forfeited_amount;
    refundDue += getDepositRefundDue(d);
  }

  // Time-scoped "collected this year/month/week/today" — by collected_at.
  const rangeKey = detectDomainTimeRange(query);
  let collectedTotal = 0;
  let collectedLabel = "Collected (all time)";
  if (rangeKey) {
    const range = resolveDomainRange(rangeKey, asOf);
    for (const d of deposits) {
      if (!d.collected_at) continue;
      const dt = new Date(d.collected_at);
      if (dt >= range.start && dt <= range.end)
        collectedTotal += d.collected_amount;
    }
    collectedLabel = `Collected ${domainRangeLabel(rangeKey)}`;
  } else {
    for (const d of deposits) collectedTotal += d.collected_amount;
  }

  const canMoney = perms.canViewFinancials;
  const heldVal = gateAmount(held, perms);
  const headline = canMoney
    ? deposits.length === 0
      ? "You don't have any security deposits on file yet."
      : `You currently hold ${formatMoney(held)} in security deposits across ${deposits.length} ${plural(deposits.length, "rental")}.`
    : `You have ${deposits.length} ${plural(deposits.length, "deposit")} on file. (Amounts are visible to authorized users only.)`;

  return {
    ...base,
    answer_type: "summary",
    summary: headline,
    facts: [
      {
        label: "Held now",
        value: heldVal != null ? formatMoney(held) : "—",
        financial: true,
      },
      {
        label: collectedLabel,
        value: canMoney ? formatMoney(collectedTotal ?? 0) : "—",
        financial: true,
      },
      {
        label: "Applied to charges",
        value: canMoney ? formatMoney(applied ?? 0) : "—",
        financial: true,
      },
      {
        label: "Refunded",
        value: canMoney ? formatMoney(refunded ?? 0) : "—",
        financial: true,
      },
      {
        label: "Forfeited",
        value: canMoney ? formatMoney(forfeited ?? 0) : "—",
        financial: true,
      },
      {
        label: "Refund due",
        value: canMoney ? formatMoney(refundDue ?? 0) : "—",
        financial: true,
      },
      { label: "Deposit records", value: deposits.length },
    ],
    items: deposits.slice(0, 15).map((d) => {
      const rental = src.briefing.store.rentals.find(
        (r) => r.id === d.rental_id,
      );
      return {
        id: d.id,
        title: rental
          ? `Rental ${rental.agreement_number ?? d.rental_id}`
          : `Deposit ${d.id}`,
        subtitle: canMoney
          ? `Held ${formatMoney(getDepositHeldBalance(d))}`
          : "—",
        status: d.status,
        deep_link: "/deposits",
      };
    }),
    sources: [
      {
        source_module: "deposits",
        entity_type: "rental_deposit",
        entity_id: "summary",
        label: "Security Deposits",
        deep_link: "/deposits",
      },
    ],
    suggested_actions: [
      {
        label: "View Deposits",
        action_type: "view_deposits",
        deep_link: "/deposits",
      },
    ],
    caveats: [
      "Held deposits are held money, not rental revenue. They become revenue only when applied to a charge or forfeited.",
    ],
  };
}
