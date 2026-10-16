// Connect Pro Fleet — AI Damage Detection V1 acceptance tests (pure layer).
//
// Covers the provider abstraction, angle pairing, image-quality checks, the
// analysis runner, the finding model, staff review decisions, finding filters,
// report status, report builder, guardrails, attention/analytics, and private
// evidence handling. All deterministic — no real image AI is connected.
//
// PRODUCTION AI IS NOT CONNECTED. The deterministic dev adapter is exercised
// directly; these tests verify the WORKFLOW + GUARDRAILS, not real image AI.

import { describe, it, expect } from "vitest";
import {
  buildPhotoPairs,
  runAiAnalysis,
  applyStaffDecision,
  editFinding,
  pendingFindings,
  confirmedFindings,
  preExistingFindings,
  rejectedFindings,
  staffSummary,
  deriveReportStatus,
  buildReport,
  needsAiReview,
  needsPhotoRetake,
  computeAnalytics,
  canCreateClaimFrom,
  AI_GUARDRAILS,
  normalizeAngle,
  photosByAngle,
} from "@/lib/aiDamageSelectors";
import {
  getDamageDetectionProvider,
  isProductionAiConnected,
} from "@/lib/aiDamageProvider";
import { TENANT_ID } from "@/lib/store/ids";
import type { Inspection } from "@/lib/inspectionTypes";
import type { AiDamageFinding, PhotoPair } from "@/lib/aiDamageTypes";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "insp_checkin_1",
    reservation_id: "res_1",
    vehicle_id: "veh_1",
    inspection_type: "checkin",
    photos: ["front-1", "rear-1", "leftside-1", "rightside-1", "dashboard-1"],
    odometer_reading: 28500,
    fuel_level: 60,
    damage_notes: "",
    damage_detected: false,
    damage_ai_confidence: 0,
    damage_ai_flagged_regions: [],
    inspector_signature_url: "sig_1",
    timestamp: "2026-09-09T10:00:00Z",
    tenant_id: TENANT_ID,
    ...overrides,
  } as Inspection;
}

function makeCheckout(overrides: Partial<Inspection> = {}): Inspection {
  return makeInspection({
    id: "insp_checkout_1",
    inspection_type: "checkout",
    photos: ["front-0", "rear-0", "leftside-0", "rightside-0", "dashboard-0"],
    odometer_reading: 28000,
    fuel_level: 95,
    timestamp: "2026-09-08T10:00:00Z",
    ...overrides,
  });
}

function makeFinding(
  overrides: Partial<AiDamageFinding> = {},
): AiDamageFinding {
  return {
    finding_id: "aif_1",
    tenant_id: TENANT_ID,
    inspection_id: "insp_checkin_1",
    rental_id: "res_1",
    vehicle_id: "veh_1",
    checkout_photo_id: "front-0",
    checkin_photo_id: "front-1",
    angle: "Front",
    damage_type: "scratch",
    approximate_location: "front bumper",
    severity: "moderate",
    confidence: "high",
    description: "Possible new scratch near front not visible in checkout.",
    bounding_region: { x: 0.3, y: 0.4, w: 0.2, h: 0.15 },
    ai_status: "ai_flagged",
    staff_decision: "pending",
    staff_notes: "",
    created_at: "2026-09-09T10:05:00Z",
    reviewed_at: null,
    reviewed_by: null,
    pre_existing_note: null,
    ...overrides,
  };
}

// ===========================================================================
// Provider abstraction + connection flag
// ===========================================================================

describe("AI Damage Detection — provider abstraction", () => {
  it("exposes a provider with name + connected flag", () => {
    const p = getDamageDetectionProvider();
    expect(typeof p.name).toBe("string");
    expect(p.name.length).toBeGreaterThan(0);
    expect(typeof p.connected).toBe("boolean");
  });

  it("reports production AI is NOT connected in V1", () => {
    expect(isProductionAiConnected()).toBe(false);
  });

  it("analyzeQuality returns a structured PhotoQualityResult", async () => {
    const p = getDamageDetectionProvider();
    const r = await p.analyzeQuality({ angle: "Front", photo_id: "front-1" });
    expect(r.angle).toBe("Front");
    expect(typeof r.reliable).toBe("boolean");
    expect(typeof r.message).toBe("string");
  });

  it("comparePair returns null when either photo is missing", async () => {
    const p = getDamageDetectionProvider();
    const r = await p.comparePair({
      angle: "Front",
      checkout_photo_id: null,
      checkin_photo_id: "front-1",
      checkout_inspection_id: "insp_checkout_1",
      checkin_inspection_id: "insp_checkin_1",
      vehicle_id: "veh_1",
      rental_id: "res_1",
      tenant_id: TENANT_ID,
    });
    expect(r).toBeNull();
  });
});

// ===========================================================================
// Angle normalization + photo pairing
// ===========================================================================

describe("AI Damage Detection — angle pairing", () => {
  it("normalizes free-form angle tokens to canonical angles", () => {
    expect(normalizeAngle("front")).toBe("Front");
    expect(normalizeAngle("Front-Left")).toBe("Front Left");
    expect(normalizeAngle("left side")).toBe("Left Side");
    expect(normalizeAngle("rear")).toBe("Rear");
    expect(normalizeAngle("back")).toBe("Rear");
    expect(normalizeAngle("windshield")).toBe("Windshield");
  });

  it("returns null for non-angle tokens", () => {
    expect(normalizeAngle("random-photo-123")).toBeNull();
  });

  it("builds an angle→photo map from an inspection's photos", () => {
    const m = photosByAngle(makeCheckout());
    expect(m.get("Front")).toBe("front-0");
    expect(m.get("Rear")).toBe("rear-0");
    expect(m.get("Dashboard")).toBe("dashboard-0");
  });

  it("pairs equivalent angles only (Front vs Front, never Front vs Rear)", () => {
    const { pairs } = buildPhotoPairs({
      checkout: makeCheckout(),
      checkin: makeInspection(),
    });
    const front = pairs.find((p) => p.angle === "Front");
    expect(front).toBeTruthy();
    expect(front?.status).toBe("compared");
    expect(front?.checkout_photo_id).toBe("front-0");
    expect(front?.checkin_photo_id).toBe("front-1");
  });

  it("marks a pair missing_checkout when the checkout photo is absent", () => {
    const checkout = makeCheckout({ photos: ["rear-0"] });
    const { pairs } = buildPhotoPairs({ checkout, checkin: makeInspection() });
    const front = pairs.find((p) => p.angle === "Front");
    expect(front?.status).toBe("missing_checkout");
  });

  it("marks a pair missing_checkin when the check-in photo is absent", () => {
    const checkin = makeInspection({ photos: ["rear-1"] });
    const { pairs } = buildPhotoPairs({
      checkout: makeCheckout(),
      checkin,
    });
    const front = pairs.find((p) => p.angle === "Front");
    expect(front?.status).toBe("missing_checkin");
  });
});

// ===========================================================================
// Image quality checks
// ===========================================================================

describe("AI Damage Detection — image quality checks", () => {
  it("flags a too-dark image as unreliable", async () => {
    const p = getDamageDetectionProvider();
    const r = await p.analyzeQuality({ angle: "Rear", photo_id: "dark-1" });
    expect(r.reliable).toBe(false);
    expect(r.issue).toBe("too_dark");
    expect(r.message).toMatch(/too dark/i);
  });

  it("flags a blurry image as unreliable", async () => {
    const p = getDamageDetectionProvider();
    const r = await p.analyzeQuality({ angle: "Rear", photo_id: "blur-1" });
    expect(r.reliable).toBe(false);
  });

  it("marks a clean image as reliable", async () => {
    const p = getDamageDetectionProvider();
    const r = await p.analyzeQuality({ angle: "Front", photo_id: "front-1" });
    expect(r.reliable).toBe(true);
    expect(r.issue).toBe("none");
  });
});

// ===========================================================================
// Analysis runner (success / partial / failed / pending)
// ===========================================================================

describe("AI Damage Detection — analysis runner", () => {
  it("runs analysis and returns coverage + audit + providerConnected flag", async () => {
    const result = await runAiAnalysis(makeInspection(), makeCheckout(), {
      rental_id: "res_1",
    });
    expect(result.coverage.angles_analyzed).toBeGreaterThan(0);
    expect(result.audit.length).toBeGreaterThan(0);
    expect(result.providerConnected).toBe(false);
    expect(["success", "partial", "failed"]).toContain(result.outcome);
  });

  it("emits ai_analysis_requested + provider_started audit events", async () => {
    const result = await runAiAnalysis(makeInspection(), makeCheckout());
    const types = result.audit.map((a) => a.type);
    expect(types).toContain("ai_analysis_requested");
    expect(types).toContain("provider_started");
  });

  it("emits analysis_completed on success", async () => {
    const result = await runAiAnalysis(makeInspection(), makeCheckout());
    const types = result.audit.map((a) => a.type);
    expect(types).toContain("analysis_completed");
  });

  it("produces partial outcome when some angles have poor quality", async () => {
    // The Rear check-in photo token contains "dark" → insufficient quality.
    const checkin = makeInspection({
      photos: [
        "front-1",
        "rear-dark-1",
        "leftside-1",
        "rightside-1",
        "dashboard-1",
      ],
    });
    const result = await runAiAnalysis(checkin, makeCheckout());
    expect(result.failedAngles).toContain("Rear");
    expect(["partial", "failed"]).toContain(result.outcome);
  });

  it("returns no findings when checkout baseline is missing", async () => {
    const result = await runAiAnalysis(makeInspection(), null);
    expect(result.findings.length).toBe(0);
    expect(result.coverage.angles_analyzed).toBe(0);
  });

  it("findings always start as ai_flagged / pending (never auto-confirmed)", async () => {
    const result = await runAiAnalysis(makeInspection(), makeCheckout());
    for (const f of result.findings) {
      expect(f.ai_status).toBe("ai_flagged");
      expect(f.staff_decision).toBe("pending");
    }
  });

  it("emits finding_generated audit events for each finding", async () => {
    const result = await runAiAnalysis(makeInspection(), makeCheckout());
    if (result.findings.length > 0) {
      const types = result.audit.map((a) => a.type);
      expect(types).toContain("finding_generated");
    }
  });
});

// ===========================================================================
// Finding model fields
// ===========================================================================

describe("AI Damage Detection — finding model", () => {
  it("a finding carries damage_type, location, severity, confidence", () => {
    const f = makeFinding();
    expect(f.damage_type).toBe("scratch");
    expect(f.approximate_location).toBe("front bumper");
    expect(f.severity).toBe("moderate");
    expect(f.confidence).toBe("high");
  });

  it("a finding retains both checkout + check-in photo references", () => {
    const f = makeFinding();
    expect(f.checkout_photo_id).toBe("front-0");
    expect(f.checkin_photo_id).toBe("front-1");
  });

  it("a finding is tenant-scoped", () => {
    const f = makeFinding();
    expect(f.tenant_id).toBe(TENANT_ID);
  });

  it("a finding may carry an optional bounding region", () => {
    const f = makeFinding();
    expect(f.bounding_region).not.toBeNull();
    expect(f.bounding_region?.x).toBeGreaterThanOrEqual(0);
    expect(f.bounding_region?.w).toBeGreaterThan(0);
  });

  it("a finding without a bounding region stores null", () => {
    const f = makeFinding({ bounding_region: null });
    expect(f.bounding_region).toBeNull();
  });
});

// ===========================================================================
// Staff review decisions
// ===========================================================================

describe("AI Damage Detection — staff review decisions", () => {
  it("confirming a finding sets staff_confirmed + reviewed metadata", () => {
    const f = applyStaffDecision(makeFinding(), "confirmed", "staff_1");
    expect(f.staff_decision).toBe("confirmed");
    expect(f.ai_status).toBe("staff_confirmed");
    expect(f.reviewed_by).toBe("staff_1");
    expect(f.reviewed_at).not.toBeNull();
  });

  it("marking pre-existing sets staff_pre_existing", () => {
    const f = applyStaffDecision(makeFinding(), "pre_existing", "staff_1");
    expect(f.staff_decision).toBe("pre_existing");
    expect(f.ai_status).toBe("staff_pre_existing");
  });

  it("rejecting a finding sets staff_rejected", () => {
    const f = applyStaffDecision(makeFinding(), "not_damage", "staff_1");
    expect(f.staff_decision).toBe("not_damage");
    expect(f.ai_status).toBe("staff_rejected");
  });

  it("needs-review sets staff_needs_review", () => {
    const f = applyStaffDecision(makeFinding(), "needs_review", "staff_1");
    expect(f.staff_decision).toBe("needs_review");
    expect(f.ai_status).toBe("staff_needs_review");
  });

  it("a pending decision keeps ai_flagged status", () => {
    const f = applyStaffDecision(makeFinding(), "pending", null);
    expect(f.staff_decision).toBe("pending");
    expect(f.ai_status).toBe("ai_flagged");
  });

  it("staff can edit damage type / severity / description / notes", () => {
    const f = editFinding(
      makeFinding(),
      {
        damage_type: "dent",
        severity: "major",
        description: "Edited description",
        staff_notes: "Staff note here",
      },
      "staff_1",
    );
    expect(f.damage_type).toBe("dent");
    expect(f.severity).toBe("major");
    expect(f.description).toBe("Edited description");
    expect(f.staff_notes).toBe("Staff note here");
    expect(f.reviewed_by).toBe("staff_1");
  });
});

// ===========================================================================
// Finding filters + summary
// ===========================================================================

describe("AI Damage Detection — finding filters + summary", () => {
  const findings = [
    makeFinding({ finding_id: "1", staff_decision: "pending" }),
    makeFinding({ finding_id: "2", staff_decision: "confirmed" }),
    makeFinding({ finding_id: "3", staff_decision: "pre_existing" }),
    makeFinding({ finding_id: "4", staff_decision: "not_damage" }),
    makeFinding({ finding_id: "5", staff_decision: "confirmed" }),
  ];

  it("pendingFindings returns only pending", () => {
    expect(pendingFindings(findings).map((f) => f.finding_id)).toEqual(["1"]);
  });

  it("confirmedFindings returns only confirmed", () => {
    expect(confirmedFindings(findings).map((f) => f.finding_id)).toEqual([
      "2",
      "5",
    ]);
  });

  it("preExistingFindings returns only pre-existing", () => {
    expect(preExistingFindings(findings).map((f) => f.finding_id)).toEqual([
      "3",
    ]);
  });

  it("rejectedFindings returns only rejected", () => {
    expect(rejectedFindings(findings).map((f) => f.finding_id)).toEqual(["4"]);
  });

  it("staffSummary tallies all decision buckets", () => {
    const s = staffSummary(findings);
    expect(s.confirmed).toBe(2);
    expect(s.pre_existing).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.needs_review).toBe(1);
  });
});

// ===========================================================================
// Report status derivation
// ===========================================================================

describe("AI Damage Detection — report status", () => {
  const cov = {
    photos_compared: 5,
    angles_analyzed: 5,
    angles_not_analyzed: 0,
  };

  it("incomplete_evidence when analysis ran but no angles analyzed", () => {
    expect(
      deriveReportStatus(
        [],
        { photos_compared: 0, angles_analyzed: 0, angles_not_analyzed: 5 },
        true,
      ),
    ).toBe("incomplete_evidence");
  });

  it("analysis_pending when not yet run and no findings", () => {
    expect(deriveReportStatus([], cov, false)).toBe("analysis_pending");
  });

  it("staff_review_required when findings are still pending", () => {
    expect(
      deriveReportStatus(
        [makeFinding({ staff_decision: "pending" })],
        cov,
        true,
      ),
    ).toBe("staff_review_required");
  });

  it("confirmed_damage when at least one finding is confirmed", () => {
    expect(
      deriveReportStatus(
        [makeFinding({ staff_decision: "confirmed" })],
        cov,
        true,
      ),
    ).toBe("confirmed_damage");
  });

  it("no_confirmed_new_damage when all reviewed and none confirmed", () => {
    expect(
      deriveReportStatus(
        [makeFinding({ staff_decision: "not_damage" })],
        cov,
        true,
      ),
    ).toBe("no_confirmed_new_damage");
  });

  it("reviewed when no findings at all", () => {
    expect(deriveReportStatus([], cov, true)).toBe("reviewed");
  });
});

// ===========================================================================
// Report builder + AI-vs-human distinction
// ===========================================================================

describe("AI Damage Detection — report builder", () => {
  it("builds a report carrying vehicle, rental, coverage, findings", () => {
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [makeFinding()],
      pairs: [],
      coverage: {
        photos_compared: 5,
        angles_analyzed: 5,
        angles_not_analyzed: 0,
      },
      rentalId: "res_1",
      customerId: "cust_1",
      reviewerId: "staff_1",
      reviewerName: "Ava",
    });
    expect(report.vehicle_id).toBe("veh_1");
    expect(report.rental_id).toBe("res_1");
    expect(report.customer_id).toBe("cust_1");
    expect(report.reviewer_name).toBe("Ava");
    expect(report.findings.length).toBe(1);
    expect(report.staff_summary.confirmed).toBe(0);
  });

  it("report is tenant-scoped", () => {
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [],
      pairs: [],
      coverage: {
        photos_compared: 0,
        angles_analyzed: 0,
        angles_not_analyzed: 0,
      },
    });
    expect(report.tenant_id).toBe(TENANT_ID);
  });

  it("report records the provider name + connection flag (dev/mock)", () => {
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [],
      pairs: [],
      coverage: {
        photos_compared: 0,
        angles_analyzed: 0,
        angles_not_analyzed: 0,
      },
    });
    expect(report.provider).toBe("deterministic-dev");
    expect(report.provider_connected).toBe(false);
  });

  it("report preserves the AI-vs-human distinction per finding", () => {
    const f = makeFinding({
      staff_decision: "confirmed",
      ai_status: "staff_confirmed",
    });
    const report = buildReport({
      checkin: makeInspection(),
      checkout: makeCheckout(),
      findings: [f],
      pairs: [],
      coverage: {
        photos_compared: 1,
        angles_analyzed: 1,
        angles_not_analyzed: 0,
      },
    });
    const rf = report.findings[0];
    expect(rf.damage_type).toBe("scratch");
    expect(rf.staff_decision).toBe("confirmed");
    expect(rf.ai_status).toBe("staff_confirmed");
  });
});

// ===========================================================================
// Guardrails (no auto liability / billing / out-of-service / price)
// ===========================================================================

describe("AI Damage Detection — guardrails", () => {
  it("AI never determines liability", () => {
    expect(AI_GUARDRAILS.determinesLiability()).toBe(false);
  });

  it("AI never bills the customer", () => {
    expect(AI_GUARDRAILS.billsCustomer()).toBe(false);
  });

  it("AI never takes a vehicle out of service", () => {
    expect(AI_GUARDRAILS.takesVehicleOutOfService()).toBe(false);
  });

  it("AI never estimates repair cost", () => {
    expect(AI_GUARDRAILS.estimatesRepairCost()).toBe(false);
  });

  it("AI never declares a vehicle safe", () => {
    expect(AI_GUARDRAILS.declaresSafe()).toBe(false);
  });

  it("canCreateClaimFrom is false when no finding is confirmed", () => {
    expect(
      canCreateClaimFrom([makeFinding({ staff_decision: "pending" })]),
    ).toBe(false);
  });

  it("canCreateClaimFrom is true only when a finding is confirmed", () => {
    expect(
      canCreateClaimFrom([makeFinding({ staff_decision: "confirmed" })]),
    ).toBe(true);
  });
});

// ===========================================================================
// Action Center attention + analytics
// ===========================================================================

describe("AI Damage Detection — attention + analytics", () => {
  it("needsAiReview lists inspections with pending findings", () => {
    const map = new Map<string, AiDamageFinding[]>([
      ["insp_1", [makeFinding({ staff_decision: "pending" })]],
      ["insp_2", [makeFinding({ staff_decision: "confirmed" })]],
    ]);
    expect(needsAiReview(map)).toEqual(["insp_1"]);
  });

  it("needsPhotoRetake lists inspections with insufficient-quality pairs", () => {
    const pairs = new Map<string, PhotoPair[]>([
      [
        "insp_1",
        [
          {
            angle: "Rear",
            checkout_photo_id: "rear-0",
            checkin_photo_id: "dark-1",
            status: "insufficient_quality",
            quality: null,
            findings: [],
          },
        ],
      ],
      ["insp_2", []],
    ]);
    expect(needsPhotoRetake(pairs)).toEqual(["insp_1"]);
  });

  it("computeAnalytics tallies confirmation + rejection rates", () => {
    const fixed = [
      makeFinding({
        finding_id: "1",
        staff_decision: "confirmed",
        damage_type: "scratch",
      }),
      makeFinding({
        finding_id: "2",
        staff_decision: "not_damage",
        damage_type: "dent",
      }),
    ];
    const a = computeAnalytics(fixed, 1);
    expect(a.totalFindings).toBe(2);
    expect(a.confirmed).toBe(1);
    expect(a.rejected).toBe(1);
    expect(a.insufficientPhotoCount).toBe(1);
    expect(a.damageTypeCounts.scratch).toBe(1);
  });
});

// ===========================================================================
// Private evidence handling
// ===========================================================================

describe("AI Damage Detection — private evidence", () => {
  it("photo references are opaque ids, never public URLs", () => {
    const f = makeFinding();
    expect(f.checkout_photo_id).not.toMatch(/^https?:\/\//);
    expect(f.checkin_photo_id).not.toMatch(/^https?:\/\//);
  });

  it("findings do not embed raw vehicle/customer data", () => {
    const f = makeFinding();
    expect((f as unknown as Record<string, unknown>).make).toBeUndefined();
    expect(
      (f as unknown as Record<string, unknown>).license_plate,
    ).toBeUndefined();
    expect(
      (f as unknown as Record<string, unknown>).customer_name,
    ).toBeUndefined();
  });
});
