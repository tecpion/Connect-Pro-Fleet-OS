// Connect Pro Fleet — Phase 6 organization-timezone cutover tests.
//
// PROVES: business-calendar boundaries depend on the ORG's configured timezone
// (`CompanyInfo.timezone`), NOT the machine/process timezone. The same stored
// UTC records produce different org-local business results for different orgs
// in the SAME runtime — regardless of process.env.TZ. Also covers DST
// spring-forward/fall-back and the UTC-midnight-boundary case that broke the
// pre-hardening suite.
//
// These tests import the org-aware entry points (resolveProfitabilityRange,
// resolveAnalyticsRange, recentChangesWindowStart, isObligationLate,
// obligationDueInstant) and pass an explicit `tz`. The assertions compare exact
// UTC instants, so the file is green under TZ=UTC, America/New_York,
// America/Los_Angeles, and America/Phoenix — the whole point of Phase 6.

import { describe, it, expect } from "vitest";
import { resolveProfitabilityRange } from "@/lib/profitabilityHelpers";
import {
  resolveAnalyticsRange,
  priorWindow,
} from "@/lib/incidentsViolationsAnalytics";
import { recentChangesWindowStart } from "@/lib/recentChangesComposer";
import { isObligationLate, obligationDueInstant } from "@/lib/lateEvaluator";

// A single instant read in several org zones. 2026-09-01T14:30:00Z:
//   UTC              → 14:30 Tue Sep 1
//   America/New_York (EDT -4)  → 10:30 Tue Sep 1
//   America/Los_Angeles (PDT -7) → 07:30 Tue Sep 1
//   America/Phoenix (MST -7, no DST) → 07:30 Tue Sep 1
const AS_OF = new Date("2026-09-01T14:30:00Z");

describe("Phase 6 — org timezone is authoritative for business-calendar logic", () => {
  it("the same as-of instant yields org-specific month-start boundaries", () => {
    // September local midnight in each org zone (as a UTC instant):
    //   UTC:           2026-09-01T00:00:00.000Z
    //   New_York:      2026-09-01T04:00:00.000Z (EDT -4)
    //   Los_Angeles:   2026-09-01T07:00:00.000Z (PDT -7)
    //   Phoenix:       2026-09-01T07:00:00.000Z (MST -7, same as LA in Sep)
    expect(
      resolveProfitabilityRange(
        "this_month",
        undefined,
        AS_OF,
        "UTC",
      ).start.toISOString(),
    ).toBe("2026-09-01T00:00:00.000Z");
    expect(
      resolveProfitabilityRange(
        "this_month",
        undefined,
        AS_OF,
        "America/New_York",
      ).start.toISOString(),
    ).toBe("2026-09-01T04:00:00.000Z");
    expect(
      resolveProfitabilityRange(
        "this_month",
        undefined,
        AS_OF,
        "America/Los_Angeles",
      ).start.toISOString(),
    ).toBe("2026-09-01T07:00:00.000Z");
    expect(
      resolveProfitabilityRange(
        "this_month",
        undefined,
        AS_OF,
        "America/Phoenix",
      ).start.toISOString(),
    ).toBe("2026-09-01T07:00:00.000Z");
  });

  it("two orgs with different timezones disagree on the org-local day boundary", () => {
    // The SAME stored UTC instant is Sep 1 in New York but the boundary
    // instant for "start of this month" differs by 3 hours between NY and LA.
    // This is the crux: the org timezone — not the machine — decides the day.
    const ny = resolveProfitabilityRange(
      "this_month",
      undefined,
      AS_OF,
      "America/New_York",
    );
    const la = resolveProfitabilityRange(
      "this_month",
      undefined,
      AS_OF,
      "America/Los_Angeles",
    );
    expect(ny.start.getTime()).not.toBe(la.start.getTime());
    expect(la.start.getTime() - ny.start.getTime()).toBe(3 * 3600_000);
  });

  it("a UTC-midnight date-only event is bucketed by the org-local day, not UTC", () => {
    // The classic pre-hardening bug: a date-only "2026-09-01" fixture parsed as
    // UTC midnight is Aug 31 20:00 in New York → wrong month/day. With the org
    // timezone supplied, the analytics window's start follows the org month.
    const utcMidnight = new Date("2026-09-01T00:00:00Z");
    const nyWindow = resolveAnalyticsRange(
      "this_month",
      utcMidnight,
      undefined,
      "America/New_York",
    );
    // In New York that instant is Aug 31 20:00 → the org-local month is Aug,
    // so the window STARTS at Aug 1 local midnight = 2026-08-01T04:00:00Z.
    expect(nyWindow.start.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    // And the same instant in UTC is Sep 1 → the UTC window starts Sep 1.
    const utcWindow = resolveAnalyticsRange(
      "this_month",
      utcMidnight,
      undefined,
      "UTC",
    );
    expect(utcWindow.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    // The two orgs DISAGREE on which month the instant belongs to. The result
    // depends on the ORG timezone, not process.env.TZ.
    expect(utcWindow.start.getTime()).not.toBe(nyWindow.start.getTime());
  });

  it("recent-changes 'since yesterday' uses the org business day, not the machine", () => {
    // 2026-09-02T12:00:00Z is 08:00 local NY on Sep 2. "Since yesterday" (1 day)
    // in New York starts at Sep 1 local midnight = 2026-09-01T04:00:00Z.
    const asOf = new Date("2026-09-02T12:00:00Z");
    expect(
      recentChangesWindowStart(asOf, 1, "America/New_York").toISOString(),
    ).toBe("2026-09-01T04:00:00.000Z");
    expect(
      recentChangesWindowStart(asOf, 1, "America/Los_Angeles").toISOString(),
    ).toBe("2026-09-01T07:00:00.000Z");
    expect(
      recentChangesWindowStart(asOf, 1, "America/Phoenix").toISOString(),
    ).toBe("2026-09-01T07:00:00.000Z");
    expect(recentChangesWindowStart(asOf, 1, "UTC").toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    // The seeded copilot event at 2026-09-01T14:00:00Z is AFTER the NY lower
    // bound (04:00Z) and is in local Sep 1 → INCLUDED. (Boundary behavior the
    // copilotClosure fixture asserts.)
    const bound = recentChangesWindowStart(
      asOf,
      1,
      "America/New_York",
    ).getTime();
    const event = new Date("2026-09-01T14:00:00Z").getTime();
    expect(event).toBeGreaterThanOrEqual(bound);
  });

  it("late-fee cutoff is evaluated in the org business timezone", () => {
    // Due 2026-09-02 at 14:00 local, 0 grace. The due instant in each org:
    //   UTC:        2026-09-02T14:00:00Z
    //   New_York:   2026-09-02T18:00:00Z (14:00 EDT = 18:00Z)
    //   Los_Angeles: 2026-09-02T21:00:00Z (14:00 PDT = 21:00Z)
    //   Phoenix:    2026-09-02T21:00:00Z (14:00 MST = 21:00Z)
    const input = {
      due_at: "2026-09-02",
      cutoff_time: "14:00",
      grace_period: 0,
    };
    expect(obligationDueInstant(input, "UTC")).toBe(
      new Date("2026-09-02T14:00:00Z").getTime(),
    );
    expect(obligationDueInstant(input, "America/New_York")).toBe(
      new Date("2026-09-02T18:00:00Z").getTime(),
    );
    expect(obligationDueInstant(input, "America/Los_Angeles")).toBe(
      new Date("2026-09-02T21:00:00Z").getTime(),
    );
    expect(obligationDueInstant(input, "America/Phoenix")).toBe(
      new Date("2026-09-02T21:00:00Z").getTime(),
    );
    // At 17:00Z the NY obligation (due 18:00Z) is NOT late; the UTC obligation
    // (due 14:00Z) IS late. Same instant, different org → different verdict.
    const at17 = new Date("2026-09-02T17:00:00Z");
    expect(isObligationLate(input, at17, "America/New_York").late).toBe(false);
    expect(isObligationLate(input, at17, "UTC").late).toBe(true);
  });

  it("no-cutoff end-of-day due uses the org-local end of the due day", () => {
    // No cutoff → end-of-day 23:59:59.999 local. In New York (EDT) the due
    // day 2026-09-02 ends at 2026-09-03T03:59:59.999Z.
    const input = { due_at: "2026-09-02", cutoff_time: null, grace_period: 0 };
    expect(obligationDueInstant(input, "America/New_York")).toBe(
      new Date("2026-09-03T03:59:59.999Z").getTime(),
    );
    expect(obligationDueInstant(input, "America/Los_Angeles")).toBe(
      new Date("2026-09-03T06:59:59.999Z").getTime(),
    );
  });

  it("prior-window trend compares the same-length org-local prior period", () => {
    // AS_OF is Sep 1 in New York. "This month" (Sep, 30 days) in New York is
    // [2026-09-01T04:00Z .. 2026-10-01T04:00Z). The prior window is the same
    // SPAN shifted back 30 days: [2026-08-02T04:00Z .. 2026-09-01T04:00Z). The
    // span-shift (not a calendar-month shift) matches the existing trend
    // semantics; the point here is that the boundaries are ORG-local.
    const ny = priorWindow("this_month", AS_OF, undefined, "America/New_York");
    expect(ny).not.toBeNull();
    expect(ny!.start.toISOString()).toBe("2026-08-02T04:00:00.000Z");
    expect(ny!.end.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  it("DST spring-forward (NY 2026-03-08) keeps each local midnight well-defined", () => {
    // NY springs forward 2026-03-08 02:00→03:00 (EST→EDT). Mar 7 is EST (-5),
    // Mar 8 is EDT (-4). Local midnight Mar 8 = 2026-03-08T05:00:00Z (the 2am
    // gap is well after midnight, so midnight is unambiguous).
    const mar7 = new Date("2026-03-07T10:00:00Z");
    const mar8 = new Date("2026-03-08T10:00:00Z");
    expect(
      resolveProfitabilityRange(
        "today",
        undefined,
        mar7,
        "America/New_York",
      ).start.toISOString(),
    ).toBe("2026-03-07T05:00:00.000Z");
    expect(
      resolveProfitabilityRange(
        "today",
        undefined,
        mar8,
        "America/New_York",
      ).start.toISOString(),
    ).toBe("2026-03-08T05:00:00.000Z");
  });

  it("DST fall-back (NY 2026-11-01) keeps local midnight unambiguous", () => {
    // NY falls back 2026-11-01 02:00→01:00 (EDT→EST). Nov 1 local midnight is
    // still EDT (UTC-4) = 2026-11-01T04:00:00Z (the 2am repeat is after midnight).
    const nov1 = new Date("2026-11-01T12:00:00Z");
    expect(
      resolveProfitabilityRange(
        "today",
        undefined,
        nov1,
        "America/New_York",
      ).start.toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
    // The "this_month" start (Nov 1 local) is the same instant.
    expect(
      resolveProfitabilityRange(
        "this_month",
        undefined,
        nov1,
        "America/New_York",
      ).start.toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
  });

  it("Phoenix has no DST: Jan and Jul local midnight are both UTC-7", () => {
    const jan = new Date("2026-01-15T12:00:00Z");
    const jul = new Date("2026-07-15T12:00:00Z");
    expect(
      resolveProfitabilityRange(
        "today",
        undefined,
        jan,
        "America/Phoenix",
      ).start.toISOString(),
    ).toBe("2026-01-15T07:00:00.000Z");
    expect(
      resolveProfitabilityRange(
        "today",
        undefined,
        jul,
        "America/Phoenix",
      ).start.toISOString(),
    ).toBe("2026-07-15T07:00:00.000Z");
  });

  it("results are independent of process.env.TZ (org timezone wins)", () => {
    // Whatever the runner's TZ is, passing an explicit org tz must yield the
    // ORG-local boundary. We assert exact UTC instants that hold in ANY runner
    // TZ because the helpers derive from the org zone, not the machine.
    const ny = resolveProfitabilityRange(
      "this_month",
      undefined,
      AS_OF,
      "America/New_York",
    ).start.toISOString();
    const la = resolveProfitabilityRange(
      "this_month",
      undefined,
      AS_OF,
      "America/Los_Angeles",
    ).start.toISOString();
    expect(ny).toBe("2026-09-01T04:00:00.000Z");
    expect(la).toBe("2026-09-01T07:00:00.000Z");
  });
});
