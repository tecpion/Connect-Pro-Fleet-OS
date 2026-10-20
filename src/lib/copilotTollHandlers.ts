// Connect Pro Fleet — Copilot toll/violation handlers (V1 Tolls & Violations
// Automation).
//
// Each handler answers from the AUTHORITATIVE violation store + canonical
// customer/rental/vehicle records — never a second source of truth. The
// bundle is OPTIONAL on CopilotSources: when the ViolationProvider is not
// mounted (e.g. older Copilot tests), handlers return a graceful fallback.
//
// CRITICAL: Copilot uses possession matching. It NEVER infers renter
// responsibility without possession evidence. The current renter is NEVER
// assumed responsible for a historical event. No provider secrets/credentials.
//
// Handlers prioritized over large brittle regex rule sets; the LLM layer
// handles free phrasing later.

import type {
  CopilotAnswer,
  CopilotAnswerItem,
  CopilotSources,
  CopilotIntent,
  CopilotViewerPermissions,
} from "./copilotTypes";
import type { Violation } from "./violationTypes";
import {
  VIOLATION_OPEN_STATUSES,
  VIOLATION_TYPE_LABELS,
  VIOLATION_STATUS_LABELS,
  MATCHING_CONFIDENCE_LABELS,
} from "./violationTypes";
import type { Customer, RentalAgreement, Vehicle } from "./types";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";
import { resolveVehiclePossessionAt } from "./violationPossession";
import { baseAnswer, plural } from "./copilotShared";
import { fmtMoney, fmtDateShort } from "./format";
import { startOfMonthInTz, getOrgTimezone } from "./timezone";

// ---------------------------------------------------------------------------
// Tolls Copilot sources (optional on CopilotSources).
// ---------------------------------------------------------------------------

export interface TollsCopilotSources {
  violations: Violation[];
  customers: Customer[];
  rentals: RentalAgreement[];
  vehicles: Vehicle[];
  exchanges: RentalVehicleExchange[];
}

const DAY = 86_400_000;

function tollSrc(src: CopilotSources): TollsCopilotSources | null {
  return src.tolls ?? null;
}

function tollFallback(
  intent: CopilotIntent,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(intent, asOf, perms, "derived");
  return {
    ...base,
    answer_type: "summary",
    summary:
      "I can pull that from the Tolls & Violations records. Open Case Center and ask again, and I'll show the records on file.",
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

function vehicleLabel(vs: TollsCopilotSources, id: string | null): string {
  if (!id) return "—";
  const v = vs.vehicles.find((x) => x.id === id);
  return v ? `${v.year} ${v.make} ${v.model}` : "—";
}

function customerName(
  vs: TollsCopilotSources,
  id: string | null,
): string | null {
  if (!id) return null;
  const c = vs.customers.find((x) => x.id === id);
  return c ? `${c.first_name} ${c.last_name}` : null;
}

function rentalNumber(
  vs: TollsCopilotSources,
  id: string | null,
): string | null {
  if (!id) return null;
  const r = vs.rentals.find((x) => x.id === id);
  return r?.agreement_number ?? null;
}

function violationItem(
  vs: TollsCopilotSources,
  v: Violation,
  perms: CopilotViewerPermissions,
): CopilotAnswerItem {
  const cust = customerName(vs, v.customer_id);
  const veh = vehicleLabel(vs, v.vehicle_id);
  const amount = perms.canViewFinancials
    ? ` · ${fmtMoney(v.total_amount)}`
    : "";
  return {
    id: v.id,
    title: `${v.violation_number} — ${VIOLATION_TYPE_LABELS[v.violation_type]}`,
    subtitle: `${veh}${cust ? ` · ${cust}` : ""}${amount} · ${VIOLATION_STATUS_LABELS[v.status]}`,
    deep_link: `/case-center`,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** "Which tolls are unmatched?" — tolls with no rental match or unmatched
 *  possession confidence. */
export function answerTollsUnmatched(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("tolls_unmatched", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("tolls_unmatched", asOf, perms);
  const unmatched = vs.violations.filter(
    (v) =>
      v.violation_type === "toll" &&
      VIOLATION_OPEN_STATUSES.includes(v.status) &&
      (!v.rental_id ||
        v.matching_confidence === "unmatched" ||
        v.matching_confidence === "ambiguous"),
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      unmatched.length === 0
        ? "No unmatched tolls right now."
        : `${unmatched.length} unmatched ${plural(unmatched.length, "toll")} need review.`,
    facts: [],
    items: unmatched.map((v) => violationItem(vs, v, perms)),
    sources: [],
    suggested_actions:
      unmatched.length > 0
        ? [
            {
              label: "Open Case Center",
              action_type: "navigate",
              deep_link: "/case-center",
            },
          ]
        : [],
    caveats: ["Responsibility is never inferred without possession evidence."],
  };
}

/** "Which violations need review?" — open violations with unknown
 *  responsibility, ambiguous match, or dispute. */
export function answerViolationsNeedReview(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("violations_need_review", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("violations_need_review", asOf, perms);
  const need = vs.violations.filter(
    (v) =>
      VIOLATION_OPEN_STATUSES.includes(v.status) &&
      (v.responsibility === "unknown" ||
        v.matching_confidence === "ambiguous" ||
        v.dispute_status === "customer_disputed" ||
        v.dispute_status === "under_review"),
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      need.length === 0
        ? "No violations need review right now."
        : `${need.length} ${plural(need.length, "violation")} need review.`,
    facts: [],
    items: need.map((v) => violationItem(vs, v, perms)),
    sources: [],
    suggested_actions:
      need.length > 0
        ? [
            {
              label: "Open Case Center",
              action_type: "navigate",
              deep_link: "/case-center",
            },
          ]
        : [],
    caveats: [],
  };
}

/** "What tolls belong to Sarah's rental?" — tolls linked to a named customer's
 *  rentals. Matches the customer by name from the raw query. */
export function answerTollsForCustomerRental(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  rawQuery?: string,
): CopilotAnswer {
  const base = baseAnswer("tolls_for_customer_rental", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("tolls_for_customer_rental", asOf, perms);
  if (!rawQuery) {
    return {
      ...base,
      answer_type: "summary",
      summary: "Which customer's rental tolls would you like to see?",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
    };
  }
  // Match a customer by first name appearing in the query.
  const q = rawQuery.toLowerCase();
  const customer = vs.customers.find((c) =>
    q.includes(c.first_name.toLowerCase()),
  );
  if (!customer) {
    return {
      ...base,
      answer_type: "summary",
      summary: "I couldn't find a customer by that name. Try the full name.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
    };
  }
  const rentalIds = vs.rentals
    .filter((r) => r.customer_id === customer.id)
    .map((r) => r.id);
  const tolls = vs.violations.filter(
    (v) =>
      v.violation_type === "toll" &&
      v.rental_id &&
      rentalIds.includes(v.rental_id),
  );
  const name = `${customer.first_name} ${customer.last_name}`;
  return {
    ...base,
    answer_type: "list",
    summary:
      tolls.length === 0
        ? `No tolls linked to ${name}'s rentals.`
        : `${tolls.length} ${plural(tolls.length, "toll")} linked to ${name}'s rentals.`,
    facts: [],
    items: tolls.map((v) => violationItem(vs, v, perms)),
    sources: [],
    suggested_actions: [],
    caveats: [
      "Tolls are matched by possession at event time, not the current rental.",
    ],
  };
}

/** "Who had vehicle 102 when this ticket occurred?" — resolves possession for
 *  a named vehicle + the most recent violation's occurred_at. Uses the
 *  exchange-aware possession resolver. */
export function answerTollPossessionAtEvent(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  rawQuery?: string,
): CopilotAnswer {
  const base = baseAnswer("toll_possession_at_event", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("toll_possession_at_event", asOf, perms);
  if (!rawQuery) {
    return {
      ...base,
      answer_type: "summary",
      summary: "Which vehicle's ticket would you like me to trace?",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
    };
  }
  // Match a vehicle by plate / vin / id in the query. (Vehicles in Fleet OS
  // are identified by plate/VIN, not a stock number.)
  const q = rawQuery.toLowerCase();
  const vehicle =
    vs.vehicles.find(
      (v) => v.license_plate && q.includes(v.license_plate.toLowerCase()),
    ) ??
    vs.vehicles.find((v) => v.vin && q.includes(v.vin.toLowerCase())) ??
    vs.vehicles.find((v) => v.id.toLowerCase() === q.replace(/\s/g, ""));
  if (!vehicle) {
    return {
      ...base,
      answer_type: "summary",
      summary: "I couldn't identify that vehicle. Try the plate or VIN.",
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
    };
  }
  // Most recent violation for this vehicle.
  const v = vs.violations
    .filter((x) => x.vehicle_id === vehicle.id)
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))[0];
  if (!v) {
    return {
      ...base,
      answer_type: "summary",
      summary: `No tickets on file for ${vehicle.license_plate ?? vehicle.id}.`,
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: [],
    };
  }
  const res = resolveVehiclePossessionAt(
    vehicle.id,
    v.occurred_at,
    vs.rentals,
    vs.exchanges,
  );
  const vehLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  if (res.status === "exact_match" && res.rental) {
    const cust = customerName(vs, res.rental.customer_id);
    return {
      ...base,
      answer_type: "summary",
      summary: `${vehLabel} was rented by ${cust} (${res.rental.agreement_number}) when the ${VIOLATION_TYPE_LABELS[v.violation_type]} occurred on ${fmtDateShort(v.occurred_at)}.`,
      facts: [],
      items: [],
      sources: [],
      suggested_actions: [],
      caveats: ["Possession is resolved by event time + exchange history."],
    };
  }
  const conf = v.matching_confidence
    ? MATCHING_CONFIDENCE_LABELS[v.matching_confidence]
    : "No match";
  return {
    ...base,
    answer_type: "summary",
    summary: `${vehLabel}: ${conf} for the ${VIOLATION_TYPE_LABELS[v.violation_type]} on ${fmtDateShort(v.occurred_at)}. No renter possessed the vehicle at that time.`,
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: [],
  };
}

/** "Which tolls haven't been recovered?" — company-paid tolls with no
 *  customer charge or no recovery. */
export function answerTollsUnrecovered(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("tolls_unrecovered", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("tolls_unrecovered", asOf, perms);
  const unrecovered = vs.violations.filter(
    (v) =>
      v.violation_type === "toll" &&
      VIOLATION_OPEN_STATUSES.includes(v.status) &&
      v.company_payment_status === "paid" &&
      v.customer_charge_status !== "charged",
  );
  return {
    ...base,
    answer_type: "list",
    summary:
      unrecovered.length === 0
        ? "No unrecovered tolls right now."
        : `${unrecovered.length} toll(s) paid by the company not yet recovered from customers.`,
    facts: [],
    items: unrecovered.map((v) => violationItem(vs, v, perms)),
    sources: [],
    suggested_actions:
      unrecovered.length > 0
        ? [
            {
              label: "Open Case Center",
              action_type: "navigate",
              deep_link: "/case-center",
            },
          ]
        : [],
    caveats: [],
  };
}

/** "How much have we paid in tolls this month?" — company cost this month. */
export function answerTollsPaidThisMonth(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  tz?: string,
): CopilotAnswer {
  const base = baseAnswer("tolls_paid_this_month", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("tolls_paid_this_month", asOf, perms);
  const monthStart = startOfMonthInTz(asOf, getOrgTimezone(tz)).getTime();
  const paid = vs.violations.filter(
    (v) =>
      v.violation_type === "toll" &&
      v.company_payment_status === "paid" &&
      new Date(v.occurred_at).getTime() >= monthStart,
  );
  const total = paid.reduce((s, v) => s + v.total_amount, 0);
  return {
    ...base,
    answer_type: "summary",
    summary: perms.canViewFinancials
      ? `Company paid ${fmtMoney(total)} in tolls this month (${paid.length} toll(s)).`
      : `${paid.length} company-paid toll(s) this month.`,
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: perms.canViewFinancials
      ? []
      : ["Amounts hidden — no financial permission."],
  };
}

/** "How much have we recovered?" — sum of charged tolls. */
export function answerTollsRecoveredAmount(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("tolls_recovered_amount", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("tolls_recovered_amount", asOf, perms);
  const charged = vs.violations.filter(
    (v) =>
      v.violation_type === "toll" && v.customer_charge_status === "charged",
  );
  const total = charged.reduce((s, v) => s + v.total_amount, 0);
  return {
    ...base,
    answer_type: "summary",
    summary: perms.canViewFinancials
      ? `Recovered ${fmtMoney(total)} from customers across ${charged.length} charged toll(s).`
      : `${charged.length} toll(s) charged to customers.`,
    facts: [],
    items: [],
    sources: [],
    suggested_actions: [],
    caveats: perms.canViewFinancials
      ? []
      : ["Amounts hidden — no financial permission."],
  };
}

/** "Show violations due this week." — open violations due within 7 days. */
export function answerViolationsDueThisWeek(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("violations_due_this_week", asOf, perms, "derived");
  const vs = tollSrc(src);
  if (!vs) return tollFallback("violations_due_this_week", asOf, perms);
  const nowTs = asOf.getTime();
  const horizon = nowTs + 7 * DAY;
  const due = vs.violations.filter((v) => {
    if (!VIOLATION_OPEN_STATUSES.includes(v.status)) return false;
    if (!v.due_at) return false;
    const dueTs = new Date(v.due_at).getTime();
    return !isNaN(dueTs) && dueTs >= nowTs && dueTs <= horizon;
  });
  return {
    ...base,
    answer_type: "list",
    summary:
      due.length === 0
        ? "No violations due this week."
        : `${due.length} ${plural(due.length, "violation")} due within the next 7 days.`,
    facts: [],
    items: due.map((v) => violationItem(vs, v, perms)),
    sources: [],
    suggested_actions:
      due.length > 0
        ? [
            {
              label: "Open Case Center",
              action_type: "navigate",
              deep_link: "/case-center",
            },
          ]
        : [],
    caveats: [],
  };
}

/** "Which customers have disputed violations?" — distinct customers with an
 *  open/active dispute on a toll or violation. Uses the authoritative
 *  violation store + possession resolver; never infers responsibility without
 *  a linked customer record. */
export function answerCustomersDisputedViolations(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    "customers_disputed_violations",
    asOf,
    perms,
    "derived",
  );
  const vs = tollSrc(src);
  if (!vs) return tollFallback("customers_disputed_violations", asOf, perms);
  const disputed = vs.violations.filter(
    (v) => v.dispute_status !== "not_disputed",
  );
  // Group by customer — only resolved customers surface (possession-evidence
  // required; an unmatched violation has no responsible customer).
  const byCustomer = new Map<string, Violation[]>();
  for (const v of disputed) {
    if (!v.customer_id) continue;
    const arr = byCustomer.get(v.customer_id) ?? [];
    arr.push(v);
    byCustomer.set(v.customer_id, arr);
  }
  const items: CopilotAnswerItem[] = [];
  for (const [cid, vlist] of byCustomer) {
    const name = customerName(vs, cid);
    items.push({
      id: cid,
      title: name ?? cid,
      subtitle: `${vlist.length} ${plural(vlist.length, "disputed violation")}`,
      deep_link: `/customers/${cid}`,
    });
  }
  return {
    ...base,
    answer_type: "list",
    summary:
      items.length === 0
        ? "No customers have disputed violations."
        : `${items.length} ${plural(items.length, "customer")} with disputed violations.`,
    facts: [],
    items,
    sources: [],
    suggested_actions:
      items.length > 0
        ? [
            {
              label: "Open Case Center",
              action_type: "navigate",
              deep_link: "/case-center",
            },
          ]
        : [],
    caveats: [],
  };
}
