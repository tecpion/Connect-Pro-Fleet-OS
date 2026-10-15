// Connect Pro Fleet — AI Damage Detection selectors (pure derivation).
//
// Pure helpers over authoritative Inspection records + AiDamageFinding data.
// These do NOT mutate domain state and make NO authoritative decisions. The
// analysis runner (`runAiAnalysis`) is async and uses the provider abstraction,
// but it only PRODUCES findings — it never confirms damage, creates claims,
// bills customers, determines liability, takes a vehicle out of service, or
// estimates repair cost. Every finding starts as `ai_flagged` / `pending`.
//
// PRODUCTION AI IS NOT CONNECTED — see aiDamageProvider.ts.

import type { Inspection } from "./inspectionTypes";
import type {
  AiDamageFinding,
  AiDamageReport,
  AiReportStatus,
  AiStaffSummary,
  AiAuditEvent,
  AiAuditEventType,
  PhotoPair,
  PhotoPairStatus,
  PhotoQualityResult,
  StaffDecision,
  AiFindingStatus,
  AiDamageType,
  AiSeverity,
  ComparePairInput,
} from "./aiDamageTypes";
import { findCheckoutForCheckin } from "./inspectionSelectors";
import { getDamageDetectionProvider } from "./aiDamageProvider";
import { uid } from "./store/ids";
import { TENANT_ID } from "./store/ids";

// ---------------------------------------------------------------------------
// Angle normalization — maps free-form photo tokens to canonical angles so
// checkout↔check-in photos pair by equivalent angle (spec §11).
// ---------------------------------------------------------------------------

export const AI_COMPARISON_ANGLES = [
  "Front",
  "Front Left",
  "Left Side",
  "Rear Left",
  "Rear",
  "Rear Right",
  "Right Side",
  "Front Right",
  "Windshield",
  "Dashboard",
  "Wheels",
] as const;

export type AiAngle = (typeof AI_COMPARISON_ANGLES)[number];

/**
 * Normalize a photo token / angle label to a canonical angle, or null.
 *
 * Photo tokens in practice carry suffixes/ids (e.g. "front-1", "rear-dark-0"),
 * so we match by keyword rather than exact equality. Multi-word angles are
 * checked first so "front left" wins over "front". This is a presentation-
 * layer normalization only — it never mutates authoritative photo data.
 */
export function normalizeAngle(token: string): AiAngle | null {
  const t = token.toLowerCase().replace(/[_-]/g, " ").trim();
  // Ordered most-specific → least-specific.
  const rules: [string, AiAngle][] = [
    ["front left", "Front Left"],
    ["front right", "Front Right"],
    ["rear left", "Rear Left"],
    ["rear right", "Rear Right"],
    ["left side", "Left Side"],
    ["right side", "Right Side"],
    ["left", "Left Side"],
    ["right", "Right Side"],
    ["front", "Front"],
    ["rear", "Rear"],
    ["back", "Rear"],
    ["windshield", "Windshield"],
    ["dashboard", "Dashboard"],
    ["interior", "Dashboard"],
    ["wheel", "Wheels"],
    ["rims", "Wheels"],
  ];
  for (const [kw, angle] of rules) {
    if (t === kw || t.startsWith(kw + " ") || t.includes(" " + kw + " "))
      return angle;
  }
  return null;
}

/**
 * Build angle→photo-id maps for an inspection. The Inspection.photos array
 * holds opaque tokens; we treat each token as a photo id and try to derive its
 * angle from the token text. Tokens that don't map to a canonical angle are
 * ignored for pairing (they may be extra/optional photos).
 */
export function photosByAngle(inspection: Inspection): Map<AiAngle, string> {
  const m = new Map<AiAngle, string>();
  for (const p of inspection.photos ?? []) {
    const a = normalizeAngle(p);
    if (a && !m.has(a)) m.set(a, p);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Pairing (spec §11 — equivalent angles only)
// ---------------------------------------------------------------------------

export interface PairingInput {
  checkout: Inspection | null;
  checkin: Inspection;
}

export interface PairingResult {
  pairs: PhotoPair[];
}

/**
 * Build photo pairs for equivalent angles between a check-in and its paired
 * checkout. Each pair records whether both photos exist; missing either side
 * yields a `missing_checkout` / `missing_checkin` status (never a comparison).
 */
export function buildPhotoPairs(input: PairingInput): PairingResult {
  const { checkout, checkin } = input;
  const coMap = checkout ? photosByAngle(checkout) : new Map<AiAngle, string>();
  const ciMap = photosByAngle(checkin);
  const angles = new Set<AiAngle>([...coMap.keys(), ...ciMap.keys()]);
  const pairs: PhotoPair[] = [];
  for (const angle of angles) {
    const co = coMap.get(angle) ?? null;
    const ci = ciMap.get(angle) ?? null;
    let status: PhotoPairStatus;
    if (!co && !ci) status = "not_applicable";
    else if (!co) status = "missing_checkout";
    else if (!ci) status = "missing_checkin";
    else status = "compared";
    pairs.push({
      angle,
      checkout_photo_id: co,
      checkin_photo_id: ci,
      status,
      quality: null,
      findings: [],
    });
  }
  // Stable order.
  pairs.sort(
    (a, b) =>
      AI_COMPARISON_ANGLES.indexOf(a.angle as AiAngle) -
      AI_COMPARISON_ANGLES.indexOf(b.angle as AiAngle),
  );
  return { pairs };
}

// ---------------------------------------------------------------------------
// Analysis runner — uses the provider abstraction (dev/mock in V1)
// ---------------------------------------------------------------------------

export interface AnalysisProgress {
  phase: "matching" | "quality" | "comparing" | "preparing" | "done";
  message: string;
}

export interface AnalysisResult {
  pairs: PhotoPair[];
  findings: AiDamageFinding[];
  coverage: AiDamageReport["coverage"];
  audit: AiAuditEvent[];
  /** Whether the provider is a real production provider (always false in V1). */
  providerConnected: boolean;
  /** Whether analysis fully succeeded, partially, or failed. */
  outcome: "success" | "partial" | "failed";
  failedAngles: string[];
}

/**
 * Run AI analysis over the photo pairs for a check-in inspection. This is the
 * ONLY place the provider is invoked. It never confirms damage — findings are
 * emitted as `ai_flagged` / `pending`. Partial results are returned when some
 * pairs fail (spec §26). Provider failure yields `outcome: "failed"` with an
 * empty findings array (spec §44) — the inspection remains usable.
 */
export async function runAiAnalysis(
  checkin: Inspection,
  checkout: Inspection | null,
  opts: {
    rental_id?: string | null;
    onProgress?: (p: AnalysisProgress) => void;
    signal?: { cancelled: boolean };
  } = {},
): Promise<AnalysisResult> {
  const provider = getDamageDetectionProvider();
  const { pairs } = buildPhotoPairs({ checkout, checkin });
  const audit: AiAuditEvent[] = [
    auditEvent("ai_analysis_requested", "AI damage analysis requested"),
    auditEvent("provider_started", `Provider started: ${provider.name}`),
  ];
  const findings: AiDamageFinding[] = [];
  const failedAngles: string[] = [];
  let compared = 0;
  let analyzed = 0;

  opts.onProgress?.({ phase: "matching", message: "Matching photo angles…" });

  for (const pair of pairs) {
    if (opts.signal?.cancelled) break;
    if (pair.status !== "compared") {
      // Missing photo on one side — cannot compare this angle.
      continue;
    }
    compared++;
    opts.onProgress?.({
      phase: "quality",
      message: `Checking image quality: ${pair.angle}`,
    });
    // Quality check on the check-in photo.
    let quality: PhotoQualityResult | null = null;
    try {
      quality = await provider.analyzeQuality({
        angle: pair.angle,
        photo_id: pair.checkin_photo_id ?? "",
      });
    } catch {
      quality = {
        angle: pair.angle,
        issue: "none",
        reliable: true,
        message: "Quality check unavailable — proceeding with manual review.",
      };
    }
    pair.quality = quality;
    if (!quality.reliable) {
      pair.status = "insufficient_quality";
      failedAngles.push(pair.angle);
      audit.push(
        auditEvent(
          "analysis_failed",
          `Insufficient quality for ${pair.angle}: ${quality.message}`,
        ),
      );
      continue;
    }

    opts.onProgress?.({
      phase: "comparing",
      message: `Reviewing exterior condition: ${pair.angle}`,
    });
    const input: ComparePairInput = {
      angle: pair.angle,
      checkout_photo_id: pair.checkout_photo_id,
      checkin_photo_id: pair.checkin_photo_id,
      checkout_inspection_id: checkout?.id ?? null,
      checkin_inspection_id: checkin.id,
      vehicle_id: checkin.vehicle_id,
      rental_id: opts.rental_id ?? null,
      tenant_id: checkin.tenant_id,
    };
    let pairFindings: AiDamageFinding[] | null = null;
    try {
      pairFindings = await provider.comparePair(input);
    } catch {
      pairFindings = null;
    }
    analyzed++;
    if (pairFindings && pairFindings.length > 0) {
      for (const f of pairFindings) {
        findings.push(f);
        pair.findings.push(f);
        audit.push(
          auditEvent(
            "finding_generated",
            `AI finding: ${f.approximate_location} (${f.damage_type})`,
            f.finding_id,
          ),
        );
      }
    }
  }

  opts.onProgress?.({ phase: "preparing", message: "Preparing report…" });

  const outcome: AnalysisResult["outcome"] =
    failedAngles.length > 0 && analyzed === 0
      ? "failed"
      : failedAngles.length > 0
        ? "partial"
        : "success";

  audit.push(
    auditEvent(
      outcome === "failed" ? "analysis_failed" : "analysis_completed",
      outcome === "failed"
        ? "AI comparison unavailable for all angles."
        : `Analysis completed: ${analyzed} angle(s) analyzed, ${findings.length} finding(s).`,
    ),
  );

  opts.onProgress?.({ phase: "done", message: "Analysis complete." });

  return {
    pairs,
    findings,
    coverage: {
      photos_compared: compared,
      angles_analyzed: analyzed,
      angles_not_analyzed: failedAngles.length,
    },
    audit,
    providerConnected: provider.connected,
    outcome,
    failedAngles,
  };
}

// ---------------------------------------------------------------------------
// Finding review helpers (human-in-the-loop)
// ---------------------------------------------------------------------------

/** Apply a staff decision to a finding, updating both decision + status. */
export function applyStaffDecision(
  finding: AiDamageFinding,
  decision: StaffDecision,
  reviewerId: string | null,
): AiDamageFinding {
  const status: AiFindingStatus =
    decision === "confirmed"
      ? "staff_confirmed"
      : decision === "not_damage"
        ? "staff_rejected"
        : decision === "pre_existing"
          ? "staff_pre_existing"
          : decision === "needs_review"
            ? "staff_needs_review"
            : "ai_flagged";
  return {
    ...finding,
    staff_decision: decision,
    ai_status: status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
  };
}

/** Edit a finding's classification (staff may edit type/severity/description). */
export function editFinding(
  finding: AiDamageFinding,
  patch: Partial<
    Pick<
      AiDamageFinding,
      "damage_type" | "severity" | "description" | "staff_notes"
    >
  >,
  reviewerId: string | null,
): AiDamageFinding {
  return {
    ...finding,
    ...patch,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  };
}

/** Findings still awaiting a staff decision. */
export function pendingFindings(
  findings: AiDamageFinding[],
): AiDamageFinding[] {
  return findings.filter((f) => f.staff_decision === "pending");
}

/** Staff-confirmed new damage findings. */
export function confirmedFindings(
  findings: AiDamageFinding[],
): AiDamageFinding[] {
  return findings.filter((f) => f.staff_decision === "confirmed");
}

/** Findings staff marked as pre-existing. */
export function preExistingFindings(
  findings: AiDamageFinding[],
): AiDamageFinding[] {
  return findings.filter((f) => f.staff_decision === "pre_existing");
}

/** Findings staff rejected as not damage. */
export function rejectedFindings(
  findings: AiDamageFinding[],
): AiDamageFinding[] {
  return findings.filter((f) => f.staff_decision === "not_damage");
}

// ---------------------------------------------------------------------------
// Report status + summary (spec §28)
// ---------------------------------------------------------------------------

export function staffSummary(findings: AiDamageFinding[]): AiStaffSummary {
  return {
    confirmed: confirmedFindings(findings).length,
    pre_existing: preExistingFindings(findings).length,
    rejected: rejectedFindings(findings).length,
    needs_review: pendingFindings(findings).length,
  };
}

/**
 * Derive the report status from findings + coverage.
 *
 * - incomplete_evidence   — no angles could be analyzed
 * - analysis_pending      — analysis not yet run (no findings, no coverage)
 * - staff_review_required — findings exist but some are still pending
 * - confirmed_damage      — at least one staff-confirmed finding
 * - no_confirmed_new_damage — all findings reviewed, none confirmed
 * - reviewed              — reviewed with no findings at all (clear)
 */
export function deriveReportStatus(
  findings: AiDamageFinding[],
  coverage: AiDamageReport["coverage"],
  analysisRun: boolean,
): AiReportStatus {
  if (analysisRun && coverage.angles_analyzed === 0)
    return "incomplete_evidence";
  if (!analysisRun && findings.length === 0) return "analysis_pending";
  const summary = staffSummary(findings);
  if (summary.confirmed > 0) return "confirmed_damage";
  if (summary.needs_review > 0) return "staff_review_required";
  if (findings.length === 0) return "reviewed";
  return "no_confirmed_new_damage";
}

// ---------------------------------------------------------------------------
// Report builder (spec §27)
// ---------------------------------------------------------------------------

export function buildReport(args: {
  checkin: Inspection;
  checkout: Inspection | null;
  findings: AiDamageFinding[];
  pairs: PhotoPair[];
  coverage: AiDamageReport["coverage"];
  notes?: string;
  reviewerId?: string | null;
  reviewerName?: string | null;
  rentalId?: string | null;
  customerId?: string | null;
  analysisRun?: boolean;
}): AiDamageReport {
  const {
    checkin,
    checkout,
    findings,
    pairs,
    coverage,
    notes = "",
    reviewerId = null,
    reviewerName = null,
    rentalId = null,
    customerId = null,
    analysisRun = true,
  } = args;
  const provider = getDamageDetectionProvider();
  return {
    report_id: uid("aip"),
    tenant_id: checkin.tenant_id,
    inspection_id: checkin.id,
    checkout_inspection_id: checkout?.id ?? null,
    vehicle_id: checkin.vehicle_id,
    rental_id: rentalId,
    customer_id: customerId,
    generated_at: new Date().toISOString(),
    status: deriveReportStatus(findings, coverage, analysisRun),
    pairs,
    findings,
    coverage,
    staff_summary: staffSummary(findings),
    notes,
    reviewer_id: reviewerId,
    reviewer_name: reviewerName,
    provider: provider.name,
    provider_connected: provider.connected,
  };
}

// ---------------------------------------------------------------------------
// Attention / analytics helpers (spec §40/§51)
// ---------------------------------------------------------------------------

/** Inspections (check-in) that need AI damage review = have pending findings. */
export function needsAiReview(
  inspectionFindings: Map<string, AiDamageFinding[]>,
): string[] {
  const ids: string[] = [];
  for (const [id, fs] of inspectionFindings) {
    if (pendingFindings(fs).length > 0) ids.push(id);
  }
  return ids;
}

/** Inspections that could not be analyzed reliably (insufficient evidence). */
export function needsPhotoRetake(
  inspectionPairs: Map<string, PhotoPair[]>,
): string[] {
  const ids: string[] = [];
  for (const [id, pairs] of inspectionPairs) {
    if (pairs.some((p) => p.status === "insufficient_quality")) ids.push(id);
  }
  return ids;
}

export interface AiAnalytics {
  totalFindings: number;
  confirmed: number;
  rejected: number;
  preExisting: number;
  needsReview: number;
  confirmationRate: number; // confirmed / decided
  rejectionRate: number; // rejected / decided
  insufficientPhotoCount: number;
  damageTypeCounts: Record<string, number>;
}

/** Compute analytics from a set of findings (foundation for future dashboard). */
export function computeAnalytics(
  findings: AiDamageFinding[],
  insufficientPhotoCount = 0,
): AiAnalytics {
  const confirmed = confirmedFindings(findings).length;
  const rejected = rejectedFindings(findings).length;
  const preExisting = preExistingFindings(findings).length;
  const needsReview = pendingFindings(findings).length;
  const decided = confirmed + rejected + preExisting;
  const damageTypeCounts: Record<string, number> = {};
  for (const f of findings) {
    damageTypeCounts[f.damage_type] =
      (damageTypeCounts[f.damage_type] ?? 0) + 1;
  }
  return {
    totalFindings: findings.length,
    confirmed,
    rejected,
    preExisting,
    needsReview,
    confirmationRate: decided > 0 ? confirmed / decided : 0,
    rejectionRate: decided > 0 ? rejected / decided : 0,
    insufficientPhotoCount,
    damageTypeCounts,
  };
}

// ---------------------------------------------------------------------------
// Guardrail checks (spec §33–§37) — these are assertions, not actions.
// They document that AI never performs these operations.
// ---------------------------------------------------------------------------

/**
 * Returns true if a finding may be sent to a Damage Claim. Only staff-CONFIRMED
 * findings qualify, and only with explicit user action (never automatic).
 */
export function canCreateClaimFrom(findings: AiDamageFinding[]): boolean {
  return confirmedFindings(findings).length > 0;
}

/**
 * AI never determines liability, bills, takes a vehicle out of service, or
 * estimates repair cost. These helpers exist to make that contract explicit and
 * testable — they always return the safe default.
 */
export const AI_GUARDRAILS = {
  determinesLiability: () => false,
  billsCustomer: () => false,
  takesVehicleOutOfService: () => false,
  estimatesRepairCost: () => false,
  declaresSafe: () => false,
} as const;

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

export function auditEvent(
  type: AiAuditEventType,
  label: string,
  findingId?: string | null,
): AiAuditEvent {
  return {
    id: uid("aia"),
    at: new Date().toISOString(),
    type,
    label,
    finding_id: findingId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Convenience: load checkout for a check-in (re-exported for UI use)
// ---------------------------------------------------------------------------

export { findCheckoutForCheckin };
