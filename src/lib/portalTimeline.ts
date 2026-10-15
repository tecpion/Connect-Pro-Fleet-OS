// Connect Pro Fleet — Customer Portal timeline projection (Build #32).
//
// Customer-safe timeline derived from the customer's own rental events,
// payments, and deposit history. Excludes internal events (staff assignments,
// internal tasks, private notes, profitability, internal incident
// investigation). Only customer-relevant categories surface. Financial events
// show the customer's own payments/charges/refunds/deposits with safe
// descriptions. Newest-first. Malformed dates never crash.

import type { FleetStore } from "./store/storeContext";
import type { PortalTimelineEvent, PortalSession } from "./portalTypes";
import { safeParseDate } from "./timelineShared";

const PORTAL_TIMELINE_CATEGORIES = new Set([
  "rental",
  "payment",
  "billing",
  "deposit",
  "document",
  "compliance",
  "agreement",
  "vehicle",
]);

export function portalTimeline(
  session: PortalSession,
  store: FleetStore,
): PortalTimelineEvent[] {
  const events: PortalTimelineEvent[] = [];
  const rentals = store.rentals.filter(
    (r) =>
      r.customer_id === session.customer_id &&
      r.tenant_id === session.tenant_id,
  );
  for (const r of rentals) {
    if (r.checkout_date) {
      events.push({
        id: `portal_rstart_${r.id}`,
        occurred_at: r.checkout_date,
        title: "Rental started",
        description: `Rental ${r.agreement_number} began.`,
        category: "rental",
        deep_link: "/portal/rental",
      });
    }
    for (const e of store.rentalEvents.filter((e) => e.rental_id === r.id)) {
      if (e.type === "signed") {
        events.push({
          id: `portal_signed_${e.id}`,
          occurred_at: e.at,
          title: "Agreement signed",
          description: e.label,
          category: "agreement",
          deep_link: "/portal/rental",
        });
      } else if (e.type === "extended") {
        events.push({
          id: `portal_ext_${e.id}`,
          occurred_at: e.at,
          title: "Rental extended",
          description: e.label,
          category: "rental",
          deep_link: "/portal/rental",
        });
      } else if (e.type === "exchanged") {
        events.push({
          id: `portal_exch_${e.id}`,
          occurred_at: e.at,
          title: "Vehicle exchanged",
          description: e.label,
          category: "vehicle",
          deep_link: "/portal/rental",
        });
      } else if (e.type === "closed") {
        events.push({
          id: `portal_closed_${e.id}`,
          occurred_at: e.at,
          title: "Rental completed",
          description: e.label,
          category: "rental",
          deep_link: "/portal/rental",
        });
      }
    }
    for (const t of store.transactions.filter(
      (t) =>
        t.rental_id === r.id &&
        t.category === "payment" &&
        t.status === "posted",
    )) {
      events.push({
        id: `portal_pay_${t.id}`,
        occurred_at: t.effective_date,
        title: "Payment received",
        description: t.description || "Payment",
        category: "payment",
        deep_link: "/portal/payments",
      });
    }
    const dep = store.rentalDeposits.find((d) => d.rental_id === r.id);
    if (dep) {
      for (const e of store.depositHistory.filter(
        (e) => e.deposit_id === dep.id,
      )) {
        events.push({
          id: `portal_dep_${e.id}`,
          occurred_at: e.at,
          title:
            e.event_type === "collected"
              ? "Deposit collected"
              : e.event_type === "held"
                ? "Deposit held"
                : e.event_type === "refunded"
                  ? "Deposit refunded"
                  : e.event_type === "applied"
                    ? "Deposit applied"
                    : "Deposit update",
          description: null,
          category: "deposit",
          deep_link: "/portal/rental",
        });
      }
    }
  }
  return events.sort((a, b) => {
    const ta = safeParseDate(a.occurred_at);
    const tb = safeParseDate(b.occurred_at);
    return tb - ta;
  });
}

/** Project a customer-safe timeline from a generic list of normalized events
 *  (used by tests that feed pre-normalized events). Filters to the customer's
 *  own events and customer-relevant categories only. */
export function projectTimeline(
  customerId: string,
  events: {
    occurred_at: string;
    title: string;
    description: string | null;
    category: string;
    deep_link: string | null;
    customer_id: string | null;
  }[],
): PortalTimelineEvent[] {
  return events
    .filter(
      (e) =>
        e.customer_id === customerId &&
        PORTAL_TIMELINE_CATEGORIES.has(e.category),
    )
    .map((e) => ({
      id: `${e.category}:${e.title}:${e.occurred_at}`,
      occurred_at: e.occurred_at,
      title: e.title,
      description: e.description,
      category: e.category,
      deep_link: e.deep_link,
    }))
    .sort((a, b) => {
      const ta = safeParseDate(a.occurred_at);
      const tb = safeParseDate(b.occurred_at);
      return tb - ta;
    });
}
