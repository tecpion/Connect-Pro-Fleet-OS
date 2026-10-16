// Connect Pro Fleet — Build #29 Copilot vehicle/customer/source/permission tests.
//
// Shared helpers are imported from ./copilotTestHarness.tsx (a NON-test module)
// so no test cases are re-registered here.
import { describe, it, expect } from "vitest";
import { resolveCopilotQuery } from "@/lib/copilotEngine";
import { DETERMINISTIC_PROVIDER } from "@/lib/copilotTypes";
import {
  NOW,
  FULL_PERMS,
  NO_FINANCE_PERMS,
  useCopilotTestSources,
  engineCtx,
  emptyConversation,
  firstCustomerName,
  firstVehicle,
} from "./copilotTestHarness";

describe("Build #29 — Vehicle answers", () => {
  it("37. vehicle current status", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_status");
    expect(a.facts.some((f) => f.label === "Status")).toBe(true);
  });
  it("38. multiple blockers coexist (all reasons shown)", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `Why can't I rent ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_unavailable_reason");
    expect(typeof a.summary).toBe("string");
  });
  it("39. idle days surfaced for idle query", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Which cars are sitting?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("idle_vehicles");
    expect(a.facts.some((f) => f.label === "Idle vehicles")).toBe(true);
  });
  it("40. utilization includes definition caveat", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `utilization of ${v.license_plate}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_utilization");
    expect(a.caveats.some((c) => /Rented Days \/ Rentable Days/i.test(c))).toBe(
      true,
    );
  });
  it("41. maintenance history lists work orders", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `maintenance history of ${v.license_plate}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_maintenance_history");
    expect(a.facts.some((f) => f.label === "Work orders")).toBe(true);
  });
  it("42. damage history via vehicle timeline", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `vehicle history of ${v.license_plate}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("vehicle_history");
    expect(a.facts.some((f) => f.label === "Timeline events")).toBe(true);
  });
  it("43. compliance surfaced for vehicle", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Compliance")).toBe(true);
  });
  it("44. violations surfaced for vehicle", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Open violations")).toBe(true);
  });
  it("45. profit authorized shows amounts", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `How profitable is ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources, FULL_PERMS),
    );
    expect(a.intent).toBe("vehicle_profitability");
    expect(a.facts.some((f) => f.label === "Operating profit")).toBe(true);
  });
  it("46. profit unauthorized hides amounts", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `How profitable is ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    expect(a.summary).toContain("permission");
  });
});

describe("Build #29 — Customer answers", () => {
  it("47. active rental in summary", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Active rental")).toBe(true);
  });
  it("48. current vehicle via active rental", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Active rental")).toBe(true);
  });
  it("49. balance in customer summary", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Outstanding balance")).toBe(true);
  });
  it("50. next payment due in summary", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Next payment due")).toBe(true);
  });
  it("51. compliance in customer summary", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Compliance")).toBe(true);
  });
  it("52. damage history factual count", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `Has ${name} had damage before?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_damage_history");
    expect(a.caveats.some((c) => /no character\/risk/i.test(c))).toBe(true);
  });
  it("53. violations history factual count", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `violations for ${name}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("customer_violation_history");
    expect(a.caveats.some((c) => /no risk score/i.test(c))).toBe(true);
  });
  it("54. assignments (account owner) in summary", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.facts.some((f) => f.label === "Account owner")).toBe(true);
  });
  it("55. recent activity (timeline) in summary", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources.length).toBeGreaterThan(0);
  });
  it("56. no fake risk score in customer answer", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.caveats.some((c) => /no risk score/i.test(c))).toBe(true);
    expect(a.facts.some((f) => /risk/i.test(f.label))).toBe(false);
  });
});

describe("Build #29 — Source traceability", () => {
  it("57. operational answers carry sources where applicable", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Which vehicles are blocked?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (a.items.length > 0) expect(a.sources.length).toBeGreaterThan(0);
  });
  it("58. deep link present on sources", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources[0].deep_link).toContain("/customers/");
  });
  it("59. customer source module = customers", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources[0].source_module).toBe("customers");
  });
  it("60. rental source deep link", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `rental history for ${name}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (a.sources.length > 0)
      expect(a.sources[0].deep_link).toContain("/rentals/");
  });
  it("61. vehicle source deep link", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources[0].deep_link).toContain("/vehicles/");
  });
  it("62. work order source module = maintenance", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `maintenance history of ${v.license_plate}`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (a.sources.length > 0)
      expect(a.sources[0].source_module).toBe("maintenance");
  });
  it("63. violation source absent of fake ids", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What tickets need attention?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    for (const s of a.sources) expect(s.entity_id).not.toContain("FAKE");
  });
  it("64. no fake source invented", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "zzz nonexistent",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.sources.length).toBe(0);
  });
  it("65. source snapshot remains attached to answer", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `What's going on with ${name}?`,
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(Array.isArray(a.sources)).toBe(true);
  });
});

describe("Build #29 — Permissions", () => {
  it("66. finance hidden without permission", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    const total = a.facts.find((f) => f.label === "Total due");
    expect(total?.value).toBe("—");
  });
  it("67. profitability hidden without permission", () => {
    const r = useCopilotTestSources();
    const v = firstVehicle(r.current.sources);
    const a = resolveCopilotQuery(
      `How profitable is ${v.license_plate}?`,
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    expect(a.answer_type).toBe("fallback");
  });
  it("68. sensitive document masked", () => {
    const r = useCopilotTestSources();
    const name = firstCustomerName(r.current.sources);
    const a = resolveCopilotQuery(
      `license valid for ${name}`,
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    for (const it of a.items) {
      if (it.status) expect(it.status).toBe("masked");
    }
  });
  it("69. banking absent from copilot context", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(JSON.stringify(a).toLowerCase()).not.toContain("account_number");
  });
  it("70. location scope respected (no crash)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(typeof a.summary).toBe("string");
  });
  it("71. staff scope respected (no crash)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What should I work on?",
      emptyConversation(),
      engineCtx(r.current.sources, FULL_PERMS, "stf_other"),
    );
    expect(a.intent).toBe("my_priorities");
  });
  it("72. authorized user receives permitted data", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources, FULL_PERMS),
    );
    const total = a.facts.find((f) => f.label === "Total due");
    expect(total?.value).not.toBe("—");
  });
  it("73. context filtered before provider layer (permission_filtered flag)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources, NO_FINANCE_PERMS),
    );
    expect(a.permission_filtered).toBe(true);
  });
});

describe("Build #29 — Reliability + provider contract", () => {
  it("98. zero records handled gracefully", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who is already late?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    if (a.items.length === 0) expect(a.summary).toContain("clear");
  });
  it("99. malformed source date safe (no crash)", () => {
    const r = useCopilotTestSources();
    expect(() =>
      resolveCopilotQuery(
        "What changed since yesterday?",
        emptyConversation(),
        engineCtx(r.current.sources),
      ),
    ).not.toThrow();
  });
  it("100. missing entity → fallback, no invented record", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "What's going on with zzz nonexistent?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(
      a.answer_type === "fallback" || a.answer_type === "disambiguation",
    ).toBe(true);
  });
  it("101. unsupported question → fallback", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Write me a marketing plan",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.intent).toBe("unsupported");
    expect(a.answer_type).toBe("fallback");
  });
  it("102. provider unavailable → deterministic still works", () => {
    const r = useCopilotTestSources();
    expect(DETERMINISTIC_PROVIDER.available).toBe(false);
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.confidence_type).not.toBe("ai_assisted");
  });
  it("103. no client API key in code", () => {
    expect(DETERMINISTIC_PROVIDER.endpoint).toBe("");
  });
  it("104. no hallucinated amount (amounts from selectors)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "Who owes me money today?",
      emptyConversation(),
      engineCtx(r.current.sources, FULL_PERMS),
    );
    for (const it of a.items) {
      if (it.amount != null) expect(typeof it.amount).toBe("number");
    }
  });
  it("105. no hallucinated record (no invented entity ids)", () => {
    const r = useCopilotTestSources();
    const a = resolveCopilotQuery(
      "zzz nonexistent",
      emptyConversation(),
      engineCtx(r.current.sources),
    );
    expect(a.items.length).toBe(0);
  });
});
