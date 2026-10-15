// Connect Pro Fleet — Daily Briefing priority + attention-key helpers (Build #28).
//
// Centralized priority resolution so colors/priority logic is never scattered
// across components. Priorities are factual levels, never a fabricated AI risk
// score. Every Critical/High item carries a factual `reason` derived from the
// authoritative source (billing selectors, exact-time late evaluator, etc.).
//
// The `attention_key` is a STABLE string id (source_module:entity:issue) used
// for dedupe, future automation, future AI citations, and notification
// correlation. The same underlying issue never produces two briefing cards.

import type { BriefingPriority } from "./briefingTypes";
import { BRIEFING_PRIORITY_RANK } from "./briefingTypes";

/** Build a stable attention key. The same root issue always maps to one key. */
export function attentionKey(
  sourceModule: string,
  entityType: string,
  entityId: string,
  issue: string,
): string {
  return `${sourceModule}:${entityType}:${entityId}:${issue}`;
}

/** Sort briefing items: by priority (Critical first), then by due/occurred time
 *  (most time-sensitive first), then by stable id. Malformed dates sort last. */
export function sortBriefingItems<
  T extends {
    priority: BriefingPriority;
    due_at?: string | null;
    occurred_at?: string | null;
    id: string;
  },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pr =
      BRIEFING_PRIORITY_RANK[a.priority] - BRIEFING_PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    // Earliest due/occurred first = most time-sensitive. Future dates (positive
    // epoch) sort after past due ones; malformed (NaN) sorts last.
    const at = (x?: string | null) => {
      if (!x) return NaN;
      const t = new Date(x).getTime();
      return isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    const aT = at(a.due_at ?? a.occurred_at);
    const bT = at(b.due_at ?? b.occurred_at);
    if (aT !== bT) {
      if (isNaN(aT) && isNaN(bT)) return 0;
      if (isNaN(aT)) return 1;
      if (isNaN(bT)) return -1;
      return aT - bT;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Resolve the priority for an overdue money obligation by age. Older = higher. */
export function overduePriority(ageDays: number): BriefingPriority {
  if (ageDays >= 7) return "critical";
  if (ageDays >= 1) return "high";
  return "medium";
}

/** Resolve idle priority from days idle + the configured thresholds. */
export function idlePriority(
  idleDays: number,
  attentionThreshold: number,
  highThreshold: number,
): BriefingPriority {
  if (idleDays >= highThreshold) return "high";
  if (idleDays >= attentionThreshold) return "medium";
  return "informational";
}
