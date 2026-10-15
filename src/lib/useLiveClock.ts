// Connect Pro Fleet — injectable runtime clock abstraction.
//
// Production UI must NEVER hardcode a frozen "now" (e.g.
// 2026-09-27T12:00:00Z). Stale-location / staleness calculations must change
// over REAL elapsed time. This hook returns a `Date` that re-evaluates on a
// fixed interval (default once per minute) so derived staleness stays live
// while a user has the page open.
//
// Tests inject their own clock via the underlying `now()` / `useLiveClock` is
// not used in selectors (selectors take `asOf` as a pure argument); this hook
// is the UI-layer source of `asOf`.

import { useEffect, useState } from "react";

/**
 * Returns a `Date` that ticks on an interval. Defaults to one minute — enough
 * granularity for GPS staleness (>60min threshold) and "due today" buckets
 * without thrashing re-renders. SSR/JSDOM-safe: the interval is cleared on
 * unmount and the first value is always `new Date()` at mount.
 */
export function useLiveClock(intervalMs = 60_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    // Immediately sync in case the component mounted a while ago.
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
