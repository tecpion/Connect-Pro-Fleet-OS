import { describe, it } from "vitest";

describe("window probe", () => {
  it("shows start under local NOW", () => {
    const DAY = 86_400_000;
    const rcw = (asOf: Date, daysBack = 1) => {
      const d = new Date(asOf); d.setHours(0, 0, 0, 0);
      return new Date(d.getTime() - daysBack * DAY);
    };
    const utcNoon = new Date("2026-09-02T12:00:00Z");
    const localNoon = new Date(2026, 8, 2, 12, 0, 0);
    // eslint-disable-next-line no-console
    console.log("TZ", Intl.DateTimeFormat().resolvedOptions().timeZone);
    // eslint-disable-next-line no-console
    console.log("utcNoon start", rcw(utcNoon).toISOString(), "ev 2026-09-01T00:00Z", new Date("2026-09-01T00:00:00Z").toISOString());
    // eslint-disable-next-line no-console
    console.log("localNoon start", rcw(localNoon).toISOString());
  });
});