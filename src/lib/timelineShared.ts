// Connect Pro Fleet — shared timeline helpers (Build #27).
//
// Safe date parsing + masking reused across all timeline normalizers. A
// malformed/missing date returns 0 so it sorts to the bottom (newest-first)
// rather than crashing the timeline.

import { maskDocumentNumber } from "./complianceSelectors";

/** Parse an ISO date string to a timestamp; returns 0 for invalid/missing so
 *  malformed events sort last (newest-first) instead of crashing. */
export function safeParseDate(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

/** Mask a sensitive document number for timeline metadata. Reuses the Build #26
 *  masking rule (••••1234) so the timeline never leaks raw DL/policy numbers. */
export function maskForTimeline(num: string | null): string | null {
  return maskDocumentNumber(num);
}

/** Build a stable timeline event id from module + source id + event type. */
export function timelineId(
  module: string,
  sourceId: string,
  eventType: string,
): string {
  return `${module}:${sourceId}:${eventType}`;
}
