// Connect Pro Fleet — organization timezone infrastructure correctness.
//
// These assertions are DELIBERATELY independent of the test runner's TZ: every
// boundary helper takes the org timezone explicitly and asserts an exact UTC
// instant, so the same file is green under TZ=UTC, TZ=America/New_York,
// TZ=America/Los_Angeles, and TZ=America/Phoenix. That is the whole point —
// calendar interpretation must follow the ORG timezone, not the machine.

import { describe, it, expect } from "vitest";
import {
  startOfDayInTz,
  endOfDayInTz,
  startOfMonthInTz,
  endOfMonthInTz,
  startOfYearInTz,
  endOfYearInTz,
  startOfDayMinusInTz,
  zonedDateTimeParts,
} from "@/lib/timezone";

describe("org timezone boundary helpers", () => {
  // 2026-09-01T14:30:00Z — same instant, read in four org timezones.
  const INST = new Date("2026-09-01T14:30:00Z");

  it("startOfDayInTz returns local midnight in the org timezone", () => {
    // UTC: midnight = 00:00:00Z
    expect(startOfDayInTz(INST, "UTC").toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    // America/New_York (EDT, UTC-4 in Sep): 14:30Z = 10:30 local → day Sep 1;
    // local midnight = 04:00Z.
    expect(startOfDayInTz(INST, "America/New_York").toISOString()).toBe(
      "2026-09-01T04:00:00.000Z",
    );
    // America/Los_Angeles (PDT, UTC-7 in Sep): 14:30Z = 07:30 local → day Sep 1;
    // local midnight = 07:00Z.
    expect(startOfDayInTz(INST, "America/Los_Angeles").toISOString()).toBe(
      "2026-09-01T07:00:00.000Z",
    );
    // America/Phoenix (MST, UTC-7 year-round, no DST): same as LA here.
    expect(startOfDayInTz(INST, "America/Phoenix").toISOString()).toBe(
      "2026-09-01T07:00:00.000Z",
    );
  });

  it("startOfDayInTz pins the local day even for a UTC-midnight instant", () => {
    // The classic bug source: a date-only business date parsed as UTC midnight.
    // In New York (UTC-4), 2026-09-01T00:00:00Z is the PRIOR local day (Aug 31
    // 20:00). The org-timezone helper reports the local-day boundary of that
    // instant — Aug 31 local midnight = 2026-08-31T04:00:00Z — NOT Sep 1.
    // (The machine-local `setHours(0,0,0,0)` helper would have returned
    // 2026-09-01T00:00:00Z only under TZ=UTC; under NY it shifts too.)
    const utcMidnight = new Date("2026-09-01T00:00:00Z");
    expect(startOfDayInTz(utcMidnight, "America/New_York").toISOString()).toBe(
      "2026-08-31T04:00:00.000Z",
    );
    expect(zonedDateTimeParts(utcMidnight, "America/New_York").day).toBe(31);
    expect(zonedDateTimeParts(utcMidnight, "America/New_York").month).toBe(8);
  });

  it("endOfDayInTz returns local 23:59:59.999 in the org timezone", () => {
    expect(endOfDayInTz(INST, "America/New_York").toISOString()).toBe(
      "2026-09-02T03:59:59.999Z",
    );
    expect(endOfDayInTz(INST, "America/Los_Angeles").toISOString()).toBe(
      "2026-09-02T06:59:59.999Z",
    );
  });

  it("startOfMonthInTz / endOfMonthInTz use the org calendar month", () => {
    expect(startOfMonthInTz(INST, "America/New_York").toISOString()).toBe(
      "2026-09-01T04:00:00.000Z",
    );
    // Exclusive end: local midnight Oct 1 = Oct 1 04:00Z (EDT UTC-4).
    expect(endOfMonthInTz(INST, "America/New_York").toISOString()).toBe(
      "2026-10-01T04:00:00.000Z",
    );
    expect(startOfMonthInTz(INST, "America/Los_Angeles").toISOString()).toBe(
      "2026-09-01T07:00:00.000Z",
    );
  });

  it("startOfYearInTz / endOfYearInTz use the org calendar year", () => {
    expect(startOfYearInTz(INST, "America/New_York").toISOString()).toBe(
      "2026-01-01T05:00:00.000Z",
    );
    expect(endOfYearInTz(INST, "America/New_York").toISOString()).toBe(
      "2027-01-01T05:00:00.000Z",
    );
    // Phoenix in January (MST, UTC-7): local midnight Jan 1 = 07:00Z.
    expect(startOfYearInTz(INST, "America/Phoenix").toISOString()).toBe(
      "2026-01-01T07:00:00.000Z",
    );
  });

  it("startOfDayMinusInTz yields the org-local 'yesterday' lower bound", () => {
    // 2026-09-02T12:00:00Z. As-of in NY (EDT): 08:00 local Sep 2.
    const asOf = new Date("2026-09-02T12:00:00Z");
    // startOfDay(Sep 2 NY) = Sep2 04:00Z; minus 1 day = Sep 1 04:00Z (local).
    expect(startOfDayMinusInTz(asOf, "America/New_York", 1).toISOString()).toBe(
      "2026-09-01T04:00:00.000Z",
    );
    // An event at 2026-09-01T14:00:00Z is at/after this bound and is in the
    // local Sep 1 day → included. The UTC-midnight event 2026-09-01T00:00:00Z
    // is Aug 31 20:00 local NY → BEFORE the bound → excluded. (This is the
    // behavior the copilotClosure fixture now asserts.)
  });

  it("is stable across a DST spring-forward boundary (NY 2026-03-08)", () => {
    // NY springs forward 2026-03-08 02:00→03:00 (EST→EDT).
    const before = new Date("2026-03-07T10:00:00Z"); // 05:00 EST Mar 7
    const after = new Date("2026-03-08T10:00:00Z"); // 06:00 EDT Mar 8
    expect(startOfDayInTz(before, "America/New_York").toISOString()).toBe(
      "2026-03-07T05:00:00.000Z",
    );
    expect(startOfDayInTz(after, "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    // The day length differs (23h), but each local midnight is well-defined.
  });

  it("is stable across a DST fall-back boundary (NY 2026-11-01)", () => {
    // NY falls back 2026-11-01 02:00→01:00 (EDT→EST). Day is 25h.
    const morning = new Date("2026-11-01T12:00:00Z"); // 07:00 EST Nov 1
    expect(startOfDayInTz(morning, "America/New_York").toISOString()).toBe(
      "2026-11-01T04:00:00.000Z", // local midnight Nov 1 is still EDT (UTC-4)
    );
    expect(endOfMonthInTz(morning, "America/New_York").toISOString()).toBe(
      "2026-12-01T05:00:00.000Z", // Dec 1 local midnight is EST (UTC-5)
    );
  });

  it("Phoenix ignores DST (no shift in November)", () => {
    const nov = new Date("2026-11-01T12:00:00Z"); // 05:00 MST Nov 1 (UTC-7)
    expect(startOfDayInTz(nov, "America/Phoenix").toISOString()).toBe(
      "2026-11-01T07:00:00.000Z",
    );
  });
});
