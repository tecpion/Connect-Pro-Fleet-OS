// Connect Pro Fleet — exact-time lateness evaluator (Build #21 cleanup).
//
// ONE centralized due-at evaluator. The billing engine (lateFeeEligibility,
// rentalLateStatus), Payments Due, and the integration layer all consume this
// same authoritative late result rather than re-implementing time comparison.
//
// Uses the rental's `payment_cutoff_time` ("HH:MM") + `grace_period` (hours)
// so a payment due "Monday 2:00 PM" is NOT late at 1:59 PM, NOT late at 2:00 PM
// (payable THROUGH the cutoff), and IS late at 2:01 PM — never using midnight
// turnover. When no cutoff time is configured the obligation is due at
// end-of-day (23:59) of the due date, preserving the legacy date-only behavior.
//
// Phase 6 — organization timezone: the cutoff is expressed in the org's local
// business time. `obligationDueInstant` / `isObligationLate` accept an optional
// `tz` (an IANA zone from `CompanyInfo.timezone`). The due date is interpreted
// as a wall time in that org zone (the returned instant is a real UTC instant,
// correct regardless of the machine's TZ); the `now` comparison uses the same
// wall-clock convention. When omitted the org timezone is resolved through
// `getOrgTimezone` (→ UTC), the documented safe path — never the machine clock.

import {
  startOfDayInTz,
  endOfDayInTz,
  getOrgTimezone,
} from "./timezone";

export interface ObligationLateInput {
  /** ISO date ("YYYY-MM-DD") the obligation is due. */
  due_at: string;
  /** "HH:MM" cutoff, or null for end-of-day. */
  cutoff_time: string | null;
  /** Grace window in hours (0 = no grace). */
  grace_period: number;
}

export interface ObligationLateResult {
  late: boolean;
  /** Instant (ms) the obligation is payable through (cutoff), local time. */
  due_at_ms: number;
  /** Instant (ms) lateness began (due_at_ms + grace). */
  late_since_ms: number;
  reason: string;
}

/** Build the wall-clock instant an obligation is payable through, applying the
 *  cutoff time in the tenant's local timezone (not UTC). Returns end-of-day
 *  when no cutoff time is configured. `tz` (org timezone) makes the wall time
 *  org-local; omitted resolves through `getOrgTimezone` (the documented UTC
 *  safe default), never the machine-local clock. */
export function obligationDueInstant(
  input: ObligationLateInput,
  tz?: string,
): number {
  const z = getOrgTimezone(tz);
  // Anchor to org-local midnight of the due day, then add the cutoff as a
  // wall-clock duration. This matches the legacy "local midnight + cutoff"
  // semantics in the org zone (cutoffs are business hours, never in the
  // 2am DST gap, so the wall duration is unambiguous).
  const midnight = startOfDayInTz(
    new Date(input.due_at + "T12:00:00Z"),
    z,
  ).getTime();
  if (input.cutoff_time && /^\d{1,2}:\d{2}$/.test(input.cutoff_time)) {
    const [h, m] = input.cutoff_time.split(":").map(Number);
    return midnight + (h ?? 0) * 3600_000 + (m ?? 0) * 60_000;
  }
  return endOfDayInTz(new Date(input.due_at + "T12:00:00Z"), z).getTime();
}

/**
 * Authoritative exact-time lateness check.
 *
 * With an EXPLICIT cutoff the obligation is payable THROUGH the cutoff, so it
 * is late only when `now` is STRICTLY AFTER the due instant + grace window:
 *
 *   due 2:00 PM, no grace → 1:59 PM not late, 2:00 PM not late, 2:01 PM late
 *   due 2:00 PM, 30m grace → 2:15 PM not late, 2:30 PM not late, 2:31 PM late
 *
 * With NO cutoff configured the legacy end-of-day fallback applies: the
 * obligation is due at 23:59 of the due date and is late AT OR AFTER that
 * instant + grace (preserving historical date-only rental behavior).
 */
export function isObligationLate(
  input: ObligationLateInput,
  now: Date = new Date(),
  tz?: string,
): ObligationLateResult {
  const dueMs = obligationDueInstant(input, tz);
  const graceMs = Math.max(0, input.grace_period ?? 0) * 3600_000;
  const lateSinceMs = dueMs + graceMs;
  const hasCutoff = !!input.cutoff_time;
  // Explicit cutoff: payable THROUGH the cutoff → strict >.
  // End-of-day fallback: legacy >= behavior.
  const late = hasCutoff
    ? now.getTime() > lateSinceMs
    : now.getTime() >= lateSinceMs;
  return {
    late,
    due_at_ms: dueMs,
    late_since_ms: lateSinceMs,
    reason: late
      ? "Past due beyond grace."
      : now.getTime() <= dueMs
        ? "Not yet due."
        : "Still within grace window.",
  };
}
