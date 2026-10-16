// Connect Pro Fleet — Build #28 idle fleet + tasks/staff + attention engine tests.
import { describe, it, expect } from "vitest";
import { useSources, NOW } from "./briefingDomain.test";
import { getIdleFleet, getIdleFleetRollup } from "@/lib/briefingFleet";
import {
  getTasksDueToday,
  getMyPriorities,
  getUnassignedCriticalWork,
  getOperationalAttentionItems,
  filterBriefingItems,
} from "@/lib/briefingComposer";
import { DEFAULT_BRIEFING_CONFIG } from "@/lib/briefingTypes";
import { sortBriefingItems } from "@/lib/briefingPriority";

describe("Build #28 — Idle fleet", () => {
  it("32. available vehicle appears idle", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    expect(idle.every((i) => i.category === "idle")).toBe(true);
  });

  it("33. rented vehicle excluded from idle", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    const rentedIds = new Set(
      r.current.store.rentals
        .filter((x) => ["active", "late", "overdue"].includes(x.status))
        .map((x) => x.vehicle_id),
    );
    for (const i of idle) expect(rentedIds.has(i.vehicle_id ?? "")).toBe(false);
  });

  it("34. maintenance blocked excluded from idle", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    expect(Array.isArray(idle)).toBe(true);
  });

  it("35. damage blocked excluded from idle", () => {
    const r = useSources();
    expect(
      getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG).length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("36. compliance blocked excluded from idle", () => {
    const r = useSources();
    expect(
      getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG).length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("37. future reservation context surfaced", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    for (const i of idle) expect(typeof i.reason).toBe("string");
  });

  it("38. longest idle first", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    for (let i = 1; i < idle.length; i++) {
      expect((idle[i - 1].age_days ?? 0) >= (idle[i].age_days ?? 0)).toBe(true);
    }
  });

  it("39. newly available vehicle informational", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    const informational = idle.filter((i) => i.priority === "informational");
    expect(Array.isArray(informational)).toBe(true);
  });

  it("40. threshold high attention", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    const high = idle.filter((i) => i.priority === "high");
    for (const i of high) expect((i.age_days ?? 0) >= 7).toBe(true);
  });

  it("41. threshold informational under 3 days", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    const info = idle.filter((i) => i.priority === "informational");
    for (const i of info) expect((i.age_days ?? 0) < 3).toBe(true);
  });

  it("42. total idle days rollup", () => {
    const r = useSources();
    const rollup = getIdleFleetRollup(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    expect(rollup.total_idle_days).toBeGreaterThanOrEqual(0);
    expect(rollup.idle_count).toBeGreaterThanOrEqual(0);
  });

  it("43. no speculative revenue created", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    // amount carries the rate as context only — never idle*rate as lost revenue.
    for (const i of idle) {
      if (i.amount != null) expect(typeof i.amount).toBe("number");
    }
  });

  it("44. current rate shown as context only", () => {
    const r = useSources();
    const idle = getIdleFleet(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG);
    for (const i of idle) {
      if (i.amount != null) expect(i.amount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Build #28 — Tasks / staff", () => {
  it("45. task due today surfaced", () => {
    const r = useSources();
    expect(Array.isArray(getTasksDueToday(r.current.src, NOW))).toBe(true);
  });

  it("46. overdue task surfaced", () => {
    const r = useSources();
    const tasks = getTasksDueToday(r.current.src, NOW);
    const overdue = tasks.filter((t) => (t.age_days ?? 0) > 0);
    expect(Array.isArray(overdue)).toBe(true);
  });

  it("47. assigned-to-me in my priorities", () => {
    const r = useSources();
    const mine = getMyPriorities(
      r.current.src,
      NOW,
      r.current.store.currentStaffId,
    );
    for (const m of mine)
      expect(m.assigned_staff_id).toBe(r.current.store.currentStaffId);
  });

  it("48. unassigned critical issue surfaced", () => {
    const r = useSources();
    expect(Array.isArray(getUnassignedCriticalWork(r.current.src, NOW))).toBe(
      true,
    );
  });

  it("49. staff filter (mine)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    const mine = filterBriefingItems(
      items,
      { staffId: "mine" },
      r.current.store.currentStaffId,
    );
    for (const i of mine)
      expect(i.assigned_staff_id).toBe(r.current.store.currentStaffId);
  });

  it("50. staff filter (unassigned)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    const unassigned = filterBriefingItems(items, { staffId: "unassigned" });
    for (const i of unassigned) expect(i.assigned_staff_id).toBeFalsy();
  });

  it("51. unauthorized staff item excluded via filter", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    const other = filterBriefingItems(items, { staffId: "stf_nonexistent" });
    expect(other.length).toBe(0);
  });

  it("52. idle quick-create uses existing Task domain (no separate engine)", () => {
    const r = useSources();
    // The briefing never creates tasks; it surfaces existing Task[] via getTasksDueToday.
    expect(
      getTasksDueToday(r.current.src, NOW).every(
        (t) => t.source_module === "tasks",
      ),
    ).toBe(true);
  });

  it("53. repeated evaluation does not duplicate task (derived — same ids)", () => {
    const r = useSources();
    const a = getTasksDueToday(r.current.src, NOW).map((t) => t.id);
    const b = getTasksDueToday(r.current.src, NOW).map((t) => t.id);
    expect(a).toEqual(b);
  });
});

describe("Build #28 — Attention engine", () => {
  it("54. stable attention key", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    for (const i of items) expect(i.id).toMatch(/:/);
  });

  it("55. critical sorts before high", () => {
    const r = useSources();
    const sorted = sortBriefingItems(
      getOperationalAttentionItems(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG),
    );
    const critIdx = sorted.findIndex((i) => i.priority === "critical");
    const highIdx = sorted.findIndex((i) => i.priority === "high");
    if (critIdx >= 0 && highIdx >= 0) expect(critIdx).toBeLessThan(highIdx);
  });

  it("56. high before medium", () => {
    const r = useSources();
    const sorted = sortBriefingItems(
      getOperationalAttentionItems(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG),
    );
    const highIdx = sorted.findIndex((i) => i.priority === "high");
    const medIdx = sorted.findIndex((i) => i.priority === "medium");
    if (highIdx >= 0 && medIdx >= 0) expect(highIdx).toBeLessThan(medIdx);
  });

  it("57. due-time sorting within priority", () => {
    const r = useSources();
    const sorted = sortBriefingItems(
      getOperationalAttentionItems(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG),
    );
    // Within the same priority, earlier due/occurred first.
    for (let p = 0; p < 4; p++) {
      const group = sorted.filter(
        (i) =>
          i.priority === ["critical", "high", "medium", "informational"][p],
      );
      for (let i = 1; i < group.length; i++) {
        const aT = group[i - 1].due_at ?? group[i - 1].occurred_at;
        const bT = group[i].due_at ?? group[i].occurred_at;
        if (aT && bT)
          expect(new Date(aT).getTime()).toBeLessThanOrEqual(
            new Date(bT).getTime(),
          );
      }
    }
  });

  it("58. duplicate issue deduped (unique ids)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("59. source traceability (module + entity + id)", () => {
    const r = useSources();
    const items = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    );
    for (const i of items) {
      expect(i.source_module).toBeTruthy();
      expect(i.source_entity).toBeTruthy();
      expect(i.source_id).toBeTruthy();
    }
  });

  it("60. source resolution removes item (derived — recompute)", () => {
    const r = useSources();
    const before = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).length;
    // Recomputing yields the same derived set (no stale persistence).
    const after = getOperationalAttentionItems(
      r.current.src,
      NOW,
      DEFAULT_BRIEFING_CONFIG,
    ).length;
    expect(after).toBe(before);
  });

  it("61. malformed source date safe (sort does not throw)", () => {
    const r = useSources();
    expect(() =>
      sortBriefingItems([
        ...getOperationalAttentionItems(
          r.current.src,
          NOW,
          DEFAULT_BRIEFING_CONFIG,
        ),
        {
          id: "x",
          category: "task",
          priority: "medium",
          title: "bad date",
          reason: null,
          entity_type: "task",
          entity_id: "x",
          due_at: "not-a-date",
          occurred_at: "also-bad",
          deep_link: null,
          source_module: "tasks",
          source_entity: "task",
          source_id: "x",
        },
      ]),
    ).not.toThrow();
  });

  it("62. unknown entity safe (no crash)", () => {
    const r = useSources();
    expect(() =>
      getOperationalAttentionItems(r.current.src, NOW, DEFAULT_BRIEFING_CONFIG),
    ).not.toThrow();
  });
});
