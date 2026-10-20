// Connect Pro Fleet — Organization timezone infrastructure (foundation).
//
// Business-calendar day/month/year boundaries must ultimately be evaluated in
// the organization's configured timezone (`CompanyInfo.timezone`), NOT the
// server/process/browser wall clock. Real timestamps stay stored and compared
// as UTC instants; only calendar interpretation (today, yesterday, this month,
// due-date day boundaries, reporting periods) uses the org timezone.
//
// This module is the pure, opt-in foundation. It introduces NO hard-coded
// timezone and NO global "force UTC" workaround: every boundary helper takes
// the org timezone explicitly. Threading these helpers through the existing
// per-module `startOfDay`/`resolve…Range` callers is the Phase 6 pre-launch
// task — until then the existing selectors keep their current machine-local
// behavior and this module proves the correct semantics in isolation.

/** Calendar parts in a target timezone (month is 1-based, like the platform). */
export interface ZonedDateTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
}

const DAY_MS = 86_400_000;

function partsFormatter(tz: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Read the wall-clock calendar parts of instant `d` as seen in `tz`. */
export function zonedDateTimeParts(d: Date, tz: string): ZonedDateTimeParts {
  const parts = partsFormatter(tz).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  // `hour12: false` can still surface "24" at midnight on some runtimes;
  // normalize to 0 so the arithmetic below stays correct.
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** Convert wall-clock parts (in `tz`) back to a UTC instant.
 *
 * Uses the round-trip offset technique so it is correct across DST
 * transitions: treat the wall parts as UTC, read them back in `tz`, and the
 * difference is the zone offset at that wall time. For inputs inside a
 * spring-forward gap this lands on the post-transition side (the conventional
 * "later" interpretation); midnight never falls in a gap for any US zone. */
function instantFromWallParts(wall: ZonedDateTimeParts, tz: string): Date {
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  const actual = zonedDateTimeParts(new Date(wallAsUtc), tz);
  const actualAsUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
    actual.second,
  );
  // Zone offset (ms) at the wall instant: local wall time is ahead of UTC by
  // (actualAsUtc - wallAsUtc). The true instant for the intended wall time is
  // wallAsUtc minus that offset, i.e. 2*wallAsUtc - actualAsUtc.
  return new Date(2 * wallAsUtc - actualAsUtc);
}

/** UTC instant of local midnight (00:00:00) in `tz` for the calendar day
 *  containing instant `d`. */
export function startOfDayInTz(d: Date, tz: string): Date {
  const p = zonedDateTimeParts(d, tz);
  return instantFromWallParts({ ...p, hour: 0, minute: 0, second: 0 }, tz);
}

/** UTC instant of local end-of-day (23:59:59.999) in `tz` for the calendar day
 *  containing instant `d`. 23:59:59 exists on every day (DST transitions are
 *  not at 23:59 in any US zone), so this is always a valid wall time. */
export function endOfDayInTz(d: Date, tz: string): Date {
  const p = zonedDateTimeParts(d, tz);
  return new Date(
    instantFromWallParts(
      { ...p, hour: 23, minute: 59, second: 59 },
      tz,
    ).getTime() + 999,
  );
}

/** UTC instant of local midnight on day 1 of the calendar month containing
 *  instant `d`, as seen in `tz`. */
export function startOfMonthInTz(d: Date, tz: string): Date {
  const p = zonedDateTimeParts(d, tz);
  return instantFromWallParts(
    { year: p.year, month: p.month, day: 1, hour: 0, minute: 0, second: 0 },
    tz,
  );
}

/** Exclusive end of the calendar month containing `d` in `tz`: local midnight
 *  on the 1st of the next month. Half-open [start, end) ranges match the
 *  existing `incidentsViolationsAnalytics` window convention. */
export function endOfMonthInTz(d: Date, tz: string): Date {
  const p = zonedDateTimeParts(d, tz);
  let nextMonth = p.month + 1;
  let nextYear = p.year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  return instantFromWallParts(
    { year: nextYear, month: nextMonth, day: 1, hour: 0, minute: 0, second: 0 },
    tz,
  );
}

/** UTC instant of local midnight on Jan 1 of the calendar year containing `d`
 *  in `tz`. */
export function startOfYearInTz(d: Date, tz: string): Date {
  const p = zonedDateTimeParts(d, tz);
  return instantFromWallParts(
    { year: p.year, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    tz,
  );
}

/** Exclusive end of the calendar year containing `d` in `tz`: local midnight
 *  on Jan 1 of the following year. */
export function endOfYearInTz(d: Date, tz: string): Date {
  const p = zonedDateTimeParts(d, tz);
  return instantFromWallParts(
    { year: p.year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    tz,
  );
}

/** UTC instant `daysBack` calendar days before the start of `d`'s day in `tz`.
 *  The "since yesterday" lower bound for recent-changes windows, evaluated in
 *  the org's business day rather than the server wall clock. */
export function startOfDayMinusInTz(d: Date, tz: string, daysBack = 1): Date {
  return new Date(startOfDayInTz(d, tz).getTime() - daysBack * DAY_MS);
}

export { DAY_MS };
