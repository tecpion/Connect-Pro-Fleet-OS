// Connect Pro Fleet — Organization timezone infrastructure (Phase 6).
//
// Business-calendar day/month/year boundaries must ultimately be evaluated in
// the organization's configured timezone (`CompanyInfo.timezone`), NOT the
// server/process/browser wall clock. Real timestamps stay stored and compared
// as UTC instants; only calendar interpretation (today, yesterday, this month,
// due-date day boundaries, reporting periods) uses the org timezone.
//
// The omitted-tz fallback is the DOCUMENTED safe path: `getOrgTimezone` resolves
// a missing/invalid zone to **UTC** — never the machine wall-clock zone — so a
// caller that forgets to thread the org timezone gets a stable, reproducible
// UTC business day rather than an environment-dependent one. Every business-
// calendar selector resolves its `tz` through `getOrgTimezone`; the optional
// parameter is a convenience, not a silent machine-local switch.

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

/** Day-of-week (1=Mon..7=Sun) of a {year,month,day} calendar date. A calendar
 *  date's weekday is timezone-independent once the date is known. */
function weekdayOf(year: number, month: number, day: number): number {
  // Date.UTC month is 0-based; getUTCDay() returns 0=Sun..6=Sat.
  const jsDow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // Convert 0=Sun..6=Sat → 1=Mon..7=Sun.
  return jsDow === 0 ? 7 : jsDow;
}

/** UTC instant of local midnight (00:00:00) on the Monday of the week
 *  containing `d` in `tz`. Weeks are Monday-start to match the existing
 *  `startOfWeek` convention. */
export function startOfWeekInTz(d: Date, tz: string): Date {
  const dayStart = startOfDayInTz(d, tz);
  const p = zonedDateTimeParts(d, tz);
  const dow = weekdayOf(p.year, p.month, p.day); // 1=Mon..7=Sun
  const offset = dow - 1; // days back to Monday
  return new Date(dayStart.getTime() - offset * DAY_MS);
}

/** UTC instant of local 23:59:59.999 on the Sunday ending the week containing
 *  `d` in `tz` (inclusive end of a 7-day Monday→Sunday window). */
export function endOfWeekInTz(d: Date, tz: string): Date {
  const dayEnd = endOfDayInTz(d, tz);
  const p = zonedDateTimeParts(d, tz);
  const dow = weekdayOf(p.year, p.month, p.day); // 1=Mon..7=Sun
  const remaining = 7 - dow; // days forward to Sunday
  return new Date(dayEnd.getTime() + remaining * DAY_MS);
}

/** Validate an IANA timezone string against the runtime's known zones. */
export function isValidTimezone(timezone: string): boolean {
  try {
    const known = Intl.supportedValuesOf?.("timeZone");
    if (known) return known.includes(timezone);
    // Fallback: ask the runtime to format in the zone; invalid zones throw.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Resolve the authoritative organization timezone from a CompanyInfo value.
 *
 * `CompanyInfo.timezone` is the source of truth (an IANA zone string). It is a
 * required field on the persisted model, but legacy/in-flight records may be
 * empty or malformed, and edge runtimes have no machine-local business zone.
 * We validate it and fall back to **UTC** — never the server wall-clock zone —
 * so missing/invalid data never silently makes business days follow the
 * process timezone. The fallback is a safe pre-launch default only;
 * onboarding seeds a real IANA zone.
 *
 * This is the ONE function callers use to resolve an org timezone. It is the
 * omitted-`tz` path for every business-calendar selector: the fallback is the
 * documented UTC safe default, NOT the machine-local clock. */
export function getOrgTimezone(timezone?: string | null): string {
  if (timezone && isValidTimezone(timezone)) return timezone;
  return "UTC";
}

export { DAY_MS };
