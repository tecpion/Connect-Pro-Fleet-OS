// Connect Pro Fleet — Build #20 date-safety helpers.
//
// The previous report build hit an "Invalid time value" runtime error caused
// by formatting missing/invalid dates. These helpers never throw: they return a
// safe fallback ("—") for invalid input instead of calling
// `new Date(undefined).toISOString()`. Use these (or the existing fmt helpers
// which now route through them) anywhere a date might be missing.

import { fmtDate, fmtDateShort, fmtDateTime } from "./format";

/** True when the value is a parseable, finite date. "" / null / undefined / NaN
 *  / "Invalid Date" all return false. */
export function isValidDateInput(v: unknown): v is string {
  if (v == null) return false;
  if (typeof v !== "string") return false;
  if (v.trim() === "") return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

/** Safe date formatter — returns fallback for invalid/missing dates. */
export function safeDate(
  iso: string | null | undefined,
  fallback = "—",
): string {
  if (!isValidDateInput(iso)) return fallback;
  return fmtDate(iso as string);
}

/** Safe short date formatter. */
export function safeDateShort(
  iso: string | null | undefined,
  fallback = "—",
): string {
  if (!isValidDateInput(iso)) return fallback;
  return fmtDateShort(iso as string);
}

/** Safe date+time formatter. */
export function safeDateTime(
  iso: string | null | undefined,
  fallback = "—",
): string {
  if (!isValidDateInput(iso)) return fallback;
  return fmtDateTime(iso as string);
}

/** Format a date + optional time-of-day ("HH:MM") as "Aug 30 · 2:00 PM".
 *  Either part may be missing without crashing. */
export function safeDateWithTime(
  iso: string | null | undefined,
  time: string | null | undefined,
  fallback = "—",
): string {
  if (!isValidDateInput(iso)) return fallback;
  const datePart = fmtDateShort(iso as string);
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return datePart;
  return `${datePart} · ${time}`;
}

/** Returns a normalized "YYYY-MM-DD" for grouping, or null when invalid. */
export function safeDayKey(iso: string | null | undefined): string | null {
  if (!isValidDateInput(iso)) return null;
  return new Date(iso as string).toISOString().slice(0, 10);
}
