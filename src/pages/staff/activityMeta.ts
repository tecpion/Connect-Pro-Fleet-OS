// Connect Pro Fleet — activity metadata derivation (Build #24 enhancement).
//
// The store ActivityEntry carries a coarse `tone` and a free-text `label`.
// The Staff Activity feed must show structured fields: Actor, Action, Related
// Record, Category, and Source. Rather than mutate the authoritative activity
// log schema (which would ripple across the whole app), this module derives
// those fields from the label text using transparent keyword rules. This keeps
// the feed honest: a driver-verification task is categorized as Customer
// Service / Collections, never mislabeled as "maintenance".
//
// This is a presentation-layer enrichment. The authoritative activity log and
// audit architecture are unchanged.

import type { ActivityCategory } from "@/lib/staffActivityMeta";

export interface ActivityMeta {
  actor: string;
  action: string;
  related: string | null;
  category: ActivityCategory;
  source: "Manual" | "System" | "Automation";
}

const SYSTEM_PREFIXES = ["System ", "system "];
const AUTOMATION_HINTS = ["auto-generated", "automated", "scheduled scan"];

/** Derive the source (actor type) from a label. */
export function sourceFromLabel(label: string): ActivityMeta["source"] {
  const lower = label.toLowerCase();
  if (SYSTEM_PREFIXES.some((p) => label.startsWith(p))) {
    return AUTOMATION_HINTS.some((h) => lower.includes(h))
      ? "Automation"
      : "System";
  }
  if (AUTOMATION_HINTS.some((h) => lower.includes(h))) return "Automation";
  return "Manual";
}

/** Derive a human-readable actor string. */
export function actorFromLabel(label: string, staffNames: string[]): string {
  const src = sourceFromLabel(label);
  if (src === "System") return "System";
  if (src === "Automation") return "Automation";
  // Try to find a staff name mentioned in the label.
  for (const name of staffNames) {
    if (label.includes(name)) return name;
  }
  return "Staff";
}

/** Derive the action phrase (strip leading "System " if present). */
export function actionFromLabel(label: string): string {
  for (const p of SYSTEM_PREFIXES) {
    if (label.startsWith(p)) {
      const rest = label.slice(p.length);
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
  }
  return label;
}

const CATEGORY_KEYWORDS: { match: RegExp; category: ActivityCategory }[] = [
  {
    match: /rental|reservation|checkout|check-out|return/i,
    category: "Reservations",
  },
  { match: /payment|collect|charge|invoice|billing/i, category: "Collections" },
  { match: /arrangement|installment/i, category: "Payment Arrangement" },
  {
    match: /license|verification|driver|customer follow/i,
    category: "Customer Service",
  },
  {
    match: /maintenance|work order|repair|brake|oil|tire|service/i,
    category: "Maintenance",
  },
  { match: /inspection/i, category: "Inspection" },
  { match: /damage|claim|insurance/i, category: "Damage" },
  { match: /incident|accident/i, category: "Incident" },
  { match: /violation|toll|citation/i, category: "Violation" },
  { match: /document|compliance|registration|upload/i, category: "Document" },
  { match: /deposit/i, category: "Deposit" },
  { match: /vehicle|fleet/i, category: "Vehicle" },
  { match: /staff|role|permission|user/i, category: "Administrative" },
];

/** Derive a category from the label text. Falls back to "Other". */
export function categoryFromLabel(label: string): ActivityCategory {
  for (const { match, category } of CATEGORY_KEYWORDS) {
    if (match.test(label)) return category;
  }
  return "Other";
}

/** Derive a related-record hint from the label (e.g. an entity name/number). */
export function relatedFromLabel(label: string): string | null {
  // Match common entity identifiers: RNT-xxx, WO-xxx, CLM-xxx, etc.
  const idMatch = label.match(/\b(RNT|WO|CLM|DMG|TSK|INV|REC)-?\w+/i);
  if (idMatch) return idMatch[0];
  // Match a vehicle make/model-ish phrase after an em dash.
  const dashMatch = label.match(/—\s*(.+)$/);
  if (dashMatch) return dashMatch[1].trim();
  return null;
}

/** Full metadata derivation from a label. */
export function activityMetaFromLabel(
  label: string,
  staffNames: string[] = [],
): ActivityMeta {
  return {
    actor: actorFromLabel(label, staffNames),
    action: actionFromLabel(label),
    related: relatedFromLabel(label),
    category: categoryFromLabel(label),
    source: sourceFromLabel(label),
  };
}
