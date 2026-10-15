// Connect Pro Fleet — Daily Briefing summary helpers (Build #36 UX cleanup).
//
// Pure DERIVED helpers used only for Daily Briefing presentation. They do NOT
// introduce a new source of truth: deposits-to-collect reuses the Build #8
// deposit selectors (getDepositCollectDue / depositBlocksCheckout); the
// needs-assignment category rollup reuses the Build #28 attention engine +
// Build #24 staff assignments. No business logic is changed — these only
// shape data for display.

import type { BriefingSources } from "./briefingTypes";
import type { BriefingItem } from "./briefingTypes";
import { getOperationalAttentionItems } from "./briefingComposer";
import { DEFAULT_BRIEFING_CONFIG } from "./briefingTypes";
import { getDepositCollectDue, depositBlocksCheckout } from "./deposit";

/** A deposit that still needs collection (required but not yet collected). */
export interface DepositCollectItem {
  id: string;
  deposit_id: string;
  customer_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  vehicle_id: string | null;
  amount_due: number;
}

/** Deposits to collect — required deposits not yet fully collected. Reuses
 *  the authoritative Build #8 deposit selectors; never re-computes balances. */
export function getDepositsToCollect(
  src: BriefingSources,
): DepositCollectItem[] {
  const deposits = src.store.rentalDeposits ?? [];
  const out: DepositCollectItem[] = [];
  for (const d of deposits) {
    if (!depositBlocksCheckout(d)) continue;
    const due = getDepositCollectDue(d);
    if (due <= 0) continue;
    out.push({
      id: `deposit:collect:${d.id}`,
      deposit_id: d.id,
      customer_id: d.customer_id,
      rental_id: d.rental_id,
      reservation_id: d.reservation_id,
      vehicle_id: d.vehicle_id,
      amount_due: due,
    });
  }
  return out;
}

/** Needs-assignment category counters. Derives the category of each
 *  unassigned critical/high item from the underlying BriefingItem.category and
 *  rolls them up into operational buckets (Fleet / Compliance / Maintenance /
 *  Returns / Other). Reuses the attention engine + staff assignments. */
export interface NeedsAssignmentSummary {
  total: number;
  categories: { label: string; key: string; count: number }[];
  items: BriefingItem[];
}

const CATEGORY_BUCKETS: { key: string; label: string; match: Set<string> }[] = [
  { key: "fleet", label: "Fleet", match: new Set(["damage", "violation"]) },
  { key: "compliance", label: "Compliance", match: new Set(["compliance"]) },
  { key: "maintenance", label: "Maintenance", match: new Set(["maintenance"]) },
  { key: "returns", label: "Returns", match: new Set(["rental"]) },
];

export function getNeedsAssignmentSummary(
  src: BriefingSources,
  asOf: Date,
): NeedsAssignmentSummary {
  // Reuse the composer's unassigned-critical selector logic by filtering the
  // attention items for critical/high priority + no staff owner + no covering
  // assignment. Mirrors getUnassignedCriticalWork without duplicating its
  // priority engine.
  const assignments = src.assignments ?? [];
  const items = getOperationalAttentionItems(src, asOf, {
    ...DEFAULT_BRIEFING_CONFIG,
    show_informational: false,
  })
    .filter((i) => i.priority === "critical" || i.priority === "high")
    .filter((i) => {
      if (i.assigned_staff_id) return false;
      if (!i.vehicle_id && !i.customer_id && !i.rental_id) return false;
      const covered = assignments.some(
        (a) =>
          a.status === "active" &&
          ((a.entity_type === "vehicle" && a.entity_id === i.vehicle_id) ||
            (a.entity_type === "customer" && a.entity_id === i.customer_id) ||
            (a.entity_type === "rental" && a.entity_id === i.rental_id)),
      );
      return !covered;
    });

  const counts: Record<string, number> = {};
  for (const i of items) {
    const bucket =
      CATEGORY_BUCKETS.find((b) => b.match.has(i.category))?.key ?? "other";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  const categories = [
    ...CATEGORY_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      count: counts[b.key] ?? 0,
    })),
    { key: "other", label: "Other", count: counts["other"] ?? 0 },
  ].filter((c) => c.count > 0);

  return { total: items.length, categories, items };
}
