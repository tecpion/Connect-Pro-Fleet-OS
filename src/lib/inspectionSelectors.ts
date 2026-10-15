// Connect Pro Fleet — Inspection selectors (Workspace enhancement).
//
// Pure derivation helpers over authoritative Inspection records. These do NOT
// mutate any domain state. `deriveInspectionStatus` maps existing fields
// (damage_detected, photos, signature, condition items, damage items) to an
// operational status label. `compareCheckInToCheckout` loads the authoritative
// checkout inspection for the same reservation and surfaces potential new
// damage. KPI helpers count authoritative records only — no invented activity.
//
// Final UX polish pass adds:
//   - `inspectionNumber()` — a human-friendly reference number (INSP-YYYY-NNNNN)
//     derived deterministically from the internal id. This is a PRESENTATION
//     layer only — the internal database id is never changed or migrated.
//   - `deriveAiReviewState()` — maps the persisted AI Damage Detection state
//     (findings/pairs/coverage/outcome) to a compact operational label. It
//     consumes the existing AI authority; it does NOT invent results or alter
//     guardrails.
//   - `attentionReason()` — a concise, transparent reason string for why an
//     inspection needs action (no opaque scores).
//   - `resumeStep()` — the most relevant incomplete wizard step for deep-linking.

import type { Inspection } from "./inspectionTypes";
import type {
  ConditionItem,
  DamageItem,
  DamageReviewDecision,
  InspectionConditionData,
  InspectionStatus,
} from "./inspectionWorkspaceTypes";
import { REQUIRED_PHOTO_ANGLES } from "./inspectionWorkspaceTypes";

/** Type guard: does this inspection carry the extended workspace data? */
function hasConditionData(
  i: Inspection,
): i is Inspection & InspectionConditionData {
  return (
    (i as Inspection & InspectionConditionData).condition_items !== undefined ||
    (i as Inspection & InspectionConditionData).damage_items !== undefined ||
    (i as Inspection & InspectionConditionData).ai_damage_findings !==
      undefined ||
    (i as Inspection & InspectionConditionData).ai_pairs !== undefined ||
    (i as Inspection & InspectionConditionData).ai_coverage !== undefined ||
    (i as Inspection & InspectionConditionData).ai_outcome !== undefined
  );
}

export function getConditionItems(i: Inspection): ConditionItem[] {
  return hasConditionData(i) ? (i.condition_items ?? []) : [];
}

export function getDamageItems(i: Inspection): DamageItem[] {
  return hasConditionData(i) ? (i.damage_items ?? []) : [];
}

export function getInspectionEvents(
  i: Inspection,
): InspectionConditionData["inspection_events"] {
  return hasConditionData(i) ? (i.inspection_events ?? []) : [];
}

export function getLinkedClaimIds(i: Inspection): string[] {
  return hasConditionData(i) ? (i.linked_damage_claim_ids ?? []) : [];
}

export function getLinkedWorkOrderIds(i: Inspection): string[] {
  return hasConditionData(i) ? (i.linked_work_order_ids ?? []) : [];
}

/** AI Damage Detection V1 — persisted findings (empty for legacy records). */
export function getAiFindings(
  i: Inspection,
): import("./aiDamageTypes").AiDamageFinding[] {
  return hasConditionData(i) ? (i.ai_damage_findings ?? []) : [];
}

/** AI photo pairs (empty for legacy records). */
export function getAiPairs(
  i: Inspection,
): import("./aiDamageTypes").PhotoPair[] {
  return hasConditionData(i) ? (i.ai_pairs ?? []) : [];
}

/** AI analysis coverage (null when analysis not run). */
export function getAiCoverage(i: Inspection): {
  photos_compared: number;
  angles_analyzed: number;
  angles_not_analyzed: number;
} | null {
  return hasConditionData(i) ? (i.ai_coverage ?? null) : null;
}

/** Whether AI analysis was run on this inspection. */
export function hasAiAnalysis(i: Inspection): boolean {
  return hasConditionData(i) && i.ai_outcome != null;
}

export function hasCustomerSignature(i: Inspection): boolean {
  if (hasConditionData(i) && i.customer_signature !== undefined)
    return i.customer_signature;
  return i.inspector_signature_url !== null;
}

export function hasStaffSignature(i: Inspection): boolean {
  return hasConditionData(i)
    ? !!i.staff_signature
    : i.inspector_signature_url !== null;
}

/** Count of required photo angles captured (from the photos array). */
export function requiredPhotosCaptured(i: Inspection): number {
  const photos = i.photos ?? [];
  return REQUIRED_PHOTO_ANGLES.filter((a) =>
    photos.some((p) =>
      p.toLowerCase().includes(a.toLowerCase().replace(" ", "")),
    ),
  ).length;
}

export const REQUIRED_PHOTO_COUNT = REQUIRED_PHOTO_ANGLES.length;

/** Whether all required photos are captured. */
export function hasAllRequiredPhotos(i: Inspection): boolean {
  return requiredPhotosCaptured(i) >= REQUIRED_PHOTO_COUNT;
}

/** Names of required angles still missing. */
export function missingRequiredPhotos(i: Inspection): string[] {
  const photos = i.photos ?? [];
  return REQUIRED_PHOTO_ANGLES.filter(
    (a) =>
      !photos.some((p) =>
        p.toLowerCase().includes(a.toLowerCase().replace(" ", "")),
      ),
  );
}

/** Damage items that are flagged for staff review (pending decision). */
export function pendingReviewDamage(i: Inspection): DamageItem[] {
  return getDamageItems(i).filter(
    (d) =>
      d.review_decision === "pending" || d.review_decision === "confirmed_new",
  );
}

/** Confirmed-new damage items (staff confirmed). */
export function confirmedNewDamage(i: Inspection): DamageItem[] {
  return getDamageItems(i).filter((d) => d.review_decision === "confirmed_new");
}

/** Condition items flagged attention or damaged. */
export function flaggedConditionItems(i: Inspection): ConditionItem[] {
  return getConditionItems(i).filter(
    (c) => c.state === "attention" || c.state === "damaged",
  );
}

/**
 * Derive the operational status of an inspection from authoritative fields.
 *
 * - incomplete      — missing required photos or signature
 * - damage_flagged  — damage detected / confirmed new damage
 * - needs_review    — pending review items or flagged condition items
 * - clear           — completed with no unresolved issue
 * - in_progress     — has no signature and no photos (not yet started)
 *
 * Order matters: incomplete is checked before needs_review because a missing
 * signature is a hard blocker regardless of condition state.
 */
export function deriveInspectionStatus(i: Inspection): InspectionStatus {
  const hasPhotos = (i.photos?.length ?? 0) > 0;
  const signed = hasCustomerSignature(i) || hasStaffSignature(i);

  // Not started: no photos and no signature.
  if (!hasPhotos && !signed) return "in_progress";

  // Incomplete: required photos or signature missing.
  if (!hasAllRequiredPhotos(i) || !signed) return "incomplete";

  // Damage flagged: authoritative damage_detected OR confirmed new damage.
  if (i.damage_detected || confirmedNewDamage(i).length > 0)
    return "damage_flagged";

  // Needs review: pending damage decisions or flagged condition items.
  if (pendingReviewDamage(i).length > 0 || flaggedConditionItems(i).length > 0)
    return "needs_review";

  return "clear";
}

/** Inspection status → display tone (matches the shared Tone system). */
export function inspectionStatusTone(
  s: InspectionStatus,
): "available" | "maintenance" | "out" | "rented" | "neutral" {
  switch (s) {
    case "clear":
      return "available";
    case "in_progress":
      return "rented";
    case "needs_review":
      return "maintenance";
    case "damage_flagged":
      return "out";
    case "incomplete":
      return "maintenance";
  }
}

// ---------------------------------------------------------------------------
// Checkout ↔ Check-In comparison
// ---------------------------------------------------------------------------

export interface ComparisonEntry {
  area: string;
  checkoutState: string;
  checkinState: string;
  changed: boolean;
}

/**
 * Load the authoritative checkout inspection for the same reservation as the
 * given check-in inspection. Returns null if none exists. Does NOT compare
 * against unrelated historical inspections.
 */
export function findCheckoutForCheckin(
  inspections: Inspection[],
  checkin: Inspection,
): Inspection | null {
  if (checkin.inspection_type !== "checkin") return null;
  return (
    inspections.find(
      (i) =>
        i.inspection_type === "checkout" &&
        i.reservation_id === checkin.reservation_id,
    ) ?? null
  );
}

/**
 * Compare a check-in inspection's condition checklist against its paired
 * checkout inspection. Returns items where the state differs (potential new
 * damage). Only compares items present in BOTH inspections by key.
 */
export function compareCheckInToCheckout(
  checkin: Inspection,
  checkout: Inspection | null,
): ComparisonEntry[] {
  if (!checkout) return [];
  const co = new Map(getConditionItems(checkout).map((c) => [c.key, c]));
  const entries: ComparisonEntry[] = [];
  for (const ci of getConditionItems(checkin)) {
    const coItem = co.get(ci.key);
    if (!coItem) continue;
    if (ci.state !== coItem.state) {
      entries.push({
        area: ci.label,
        checkoutState: coItem.state,
        checkinState: ci.state,
        changed: true,
      });
    }
  }
  return entries;
}

/** Mileage delta (return - checkout). Negative means return < checkout. */
export function mileageDelta(
  checkin: Inspection,
  checkout: Inspection | null,
): number | null {
  if (!checkout) return null;
  return checkin.odometer_reading - checkout.odometer_reading;
}

/** Fuel delta (return - checkout). Negative means fuel dropped. */
export function fuelDelta(
  checkin: Inspection,
  checkout: Inspection | null,
): number | null {
  if (!checkout) return null;
  return checkin.fuel_level - checkout.fuel_level;
}

// ---------------------------------------------------------------------------
// KPI helpers — authoritative counts only
// ---------------------------------------------------------------------------

export function isCompletedToday(
  i: Inspection,
  now: Date = new Date(),
): boolean {
  const d = new Date(i.timestamp);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === now.toDateString();
}

export interface InspectionKpis {
  completedToday: number;
  needsReview: number;
  damageFlagged: number;
  awaitingPhotos: number;
  missingSignature: number;
  inProgress: number;
  /** Inspections where AI analysis ran and findings still need staff review. */
  aiReviewNeeded: number;
}

/**
 * Compute authoritative KPI counts.
 *
 * KPI STATE CONSISTENCY (spec §2): an inspection that has started but is not
 * completed counts as In Progress. `deriveInspectionStatus` already returns
 * `in_progress` for not-started records and `incomplete` for started-but-
 * unfinished records. To make the "In Progress" KPI consistent with the
 * "In Progress" tab (which shows ALL unfinished inspections), we count BOTH
 * `in_progress` and `incomplete` statuses as In Progress here. This does NOT
 * change the derived status itself — it only changes which bucket the KPI
 * counts, so an inspection with Status=Incomplete / Photos=2/5 is correctly
 * counted as In Progress (not 0).
 *
 * `aiReviewNeeded` counts check-in inspections where AI analysis ran and at
 * least one finding is still pending a staff decision.
 */
export function computeInspectionKpis(
  inspections: Inspection[],
  now: Date = new Date(),
): InspectionKpis {
  let completedToday = 0;
  let needsReview = 0;
  let damageFlagged = 0;
  let awaitingPhotos = 0;
  let missingSignature = 0;
  let inProgress = 0;
  let aiReviewNeeded = 0;
  for (const i of inspections) {
    const status = deriveInspectionStatus(i);
    // Completed today = finished (clear or damage_flagged) and dated today.
    if (
      isCompletedToday(i, now) &&
      status !== "in_progress" &&
      status !== "incomplete"
    )
      completedToday++;
    if (status === "needs_review") needsReview++;
    if (status === "damage_flagged") damageFlagged++;
    // In Progress = started but not finished (in_progress OR incomplete).
    if (status === "in_progress" || status === "incomplete") inProgress++;
    // Awaiting photos = unfinished and missing required photos.
    if (
      (i.photos?.length ?? 0) < REQUIRED_PHOTO_COUNT &&
      (status === "in_progress" || status === "incomplete")
    )
      awaitingPhotos++;
    // Missing signature = unfinished and no customer signature.
    if (
      !hasCustomerSignature(i) &&
      (status === "in_progress" || status === "incomplete")
    )
      missingSignature++;
    if (needsAiDamageReview(i)) aiReviewNeeded++;
  }
  return {
    completedToday,
    needsReview,
    damageFlagged,
    awaitingPhotos,
    missingSignature,
    inProgress,
    aiReviewNeeded,
  };
}

/** Search inspections by vehicle, plate, customer, reservation, inspector. */
export function searchInspections(
  inspections: Inspection[],
  reservations: { id: string; renter_name: string }[],
  vehicles: {
    id: string;
    make: string;
    model: string;
    license_plate: string;
  }[],
  query: string,
): Inspection[] {
  const q = query.trim().toLowerCase();
  if (!q) return inspections;
  return inspections.filter((i) => {
    const v = vehicles.find((x) => x.id === i.vehicle_id);
    const r = reservations.find((x) => x.id === i.reservation_id);
    const haystack = [
      v?.make,
      v?.model,
      v?.license_plate,
      r?.renter_name,
      i.reservation_id,
      i.vehicle_id,
      i.id,
      inspectionNumber(i),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Decision label for a damage review decision. */
export function reviewDecisionLabel(d: DamageReviewDecision): string {
  switch (d) {
    case "pending":
      return "Needs Review";
    case "confirmed_new":
      return "Confirmed New Damage";
    case "marked_pre_existing":
      return "Pre-existing";
    case "marked_not_damage":
      return "Not Damage";
  }
}

// ---------------------------------------------------------------------------
// Human-friendly inspection reference number (presentation layer only)
// ---------------------------------------------------------------------------
//
// Internal ids are opaque dev tokens (e.g. "ins_1", "ins_abc123"). For the
// user-facing workspace we derive a stable, readable reference number of the
// form `INSP-YYYY-NNNNN` from a deterministic hash of the internal id. This
// NEVER mutates or replaces the authoritative id — it is a display alias only,
// consistent with how other Fleet entities present reference numbers. The same
// id always yields the same number.

const INSP_NUMBER_CACHE = new Map<string, string>();

/**
 * Derive a human-friendly inspection reference number from the internal id.
 * Format: INSP-2026-000041. Deterministic and stable across renders.
 */
export function inspectionNumber(i: Inspection): string {
  const cached = INSP_NUMBER_CACHE.get(i.id);
  if (cached) return cached;
  const year = new Date().getFullYear();
  // Stable 5-digit sequence from a hash of the id.
  let h = 0;
  for (let k = 0; k < i.id.length; k++) {
    h = (h * 31 + i.id.charCodeAt(k)) >>> 0;
  }
  const seq = (h % 100000) + 1; // 1..100000
  const num = `INSP-${year}-${String(seq).padStart(5, "0")}`;
  INSP_NUMBER_CACHE.set(i.id, num);
  return num;
}

// ---------------------------------------------------------------------------
// AI Review state (consumes existing AI Damage Detection authority)
// ---------------------------------------------------------------------------

export type AiReviewState =
  | "baseline" // checkout inspection — used as comparison baseline
  | "ready" // check-in has enough evidence, not yet analyzed
  | "analyzing" // analysis in progress (transient UI state)
  | "review_needed" // AI findings exist, some still pending staff decision
  | "no_new_damage" // analysis ran, no meaningful change detected
  | "potential_damage" // AI findings exist (unconfirmed) — potential damage
  | "reviewed" // all findings reviewed, none confirmed
  | "retake_needed" // insufficient evidence / poor quality
  | "unable_to_analyze" // analysis failed entirely
  | "not_applicable"; // no checkout baseline to compare against

export const AI_REVIEW_STATE_LABELS: Record<AiReviewState, string> = {
  baseline: "Baseline",
  ready: "Ready",
  analyzing: "Analyzing",
  review_needed: "Review Needed",
  no_new_damage: "No New Damage",
  potential_damage: "Potential Damage",
  reviewed: "Reviewed",
  retake_needed: "Retake Needed",
  unable_to_analyze: "Unable to Analyze",
  not_applicable: "Not Applicable",
};

/**
 * Derive the compact AI review state for an inspection from the persisted AI
 * Damage Detection fields. Consumes the EXISTING authority (ai_damage_findings,
 * ai_pairs, ai_coverage, ai_outcome) — it never invents results or alters the
 * AI guardrails. Checkout inspections are "baseline"; check-ins without a
 * checkout baseline are "not_applicable".
 */
export function deriveAiReviewState(i: Inspection): AiReviewState {
  // Checkout inspections serve as the comparison baseline.
  if (i.inspection_type === "checkout") return "baseline";

  const findings = getAiFindings(i);
  const pairs = getAiPairs(i);
  const coverage = getAiCoverage(i);
  const outcome = hasConditionData(i) ? (i.ai_outcome ?? null) : null;

  // Analysis never ran.
  if (!hasAiAnalysis(i)) {
    // If there are pairs with insufficient quality already, surface retake.
    if (pairs.some((p) => p.status === "insufficient_quality"))
      return "retake_needed";
    return "ready";
  }

  // Analysis ran but failed entirely.
  if (outcome === "failed") return "unable_to_analyze";

  // Analysis ran but no angles could be analyzed → insufficient evidence.
  if (coverage && coverage.angles_analyzed === 0) return "retake_needed";

  // Some pairs have insufficient quality (partial failure).
  if (pairs.some((p) => p.status === "insufficient_quality"))
    return "retake_needed";

  // Findings exist.
  if (findings.length > 0) {
    const pending = findings.filter(
      (f) => f.staff_decision === "pending",
    ).length;
    const confirmed = findings.filter(
      (f) => f.staff_decision === "confirmed",
    ).length;
    if (confirmed > 0) return "reviewed"; // staff confirmed → reviewed
    if (pending > 0) return "review_needed";
    // All reviewed, none confirmed.
    return "reviewed";
  }

  // No findings at all → no new damage detected.
  return "no_new_damage";
}

/** AI review state → display tone (matches the shared Tone system). */
export function aiReviewStateTone(
  s: AiReviewState,
): "available" | "maintenance" | "out" | "rented" | "neutral" {
  switch (s) {
    case "baseline":
      return "neutral";
    case "ready":
      return "neutral";
    case "analyzing":
      return "rented";
    case "review_needed":
      return "maintenance";
    case "no_new_damage":
      return "available";
    case "potential_damage":
      return "out";
    case "reviewed":
      return "available";
    case "retake_needed":
      return "maintenance";
    case "unable_to_analyze":
      return "out";
    case "not_applicable":
      return "neutral";
  }
}

/**
 * Whether an inspection needs AI damage review = AI analysis ran and one or
 * more findings are still pending a staff decision. This is the authoritative
 * definition behind the "AI Review Needed" KPI. It does NOT count clean,
 * already-reviewed, or checkout-baseline inspections.
 */
export function needsAiDamageReview(i: Inspection): boolean {
  if (i.inspection_type !== "checkin") return false;
  if (!hasAiAnalysis(i)) return false;
  const findings = getAiFindings(i);
  return findings.some((f) => f.staff_decision === "pending");
}

// ---------------------------------------------------------------------------
// Transparent attention reason (no opaque scores)
// ---------------------------------------------------------------------------

/**
 * A concise, explainable reason string for why an inspection needs action.
 * Returns null when the inspection needs no special attention. Never produces
 * a health/risk score — only a human-readable reason grounded in authoritative
 * fields.
 */
export function attentionReason(i: Inspection): string | null {
  const status = deriveInspectionStatus(i);
  const missing = missingRequiredPhotos(i);
  const signed = hasCustomerSignature(i);
  const aiFindings = getAiFindings(i);
  const pairs = getAiPairs(i);
  const confirmedDmg = confirmedNewDamage(i).length;
  const pendingDmg = pendingReviewDamage(i).length;

  // AI-driven reasons take priority for check-ins with analysis.
  if (i.inspection_type === "checkin" && hasAiAnalysis(i)) {
    const pendingAi = aiFindings.filter(
      (f) => f.staff_decision === "pending",
    ).length;
    if (pendingAi > 0)
      return `${pendingAi} AI finding${pendingAi === 1 ? "" : "s"} awaiting decision`;
    if (pairs.some((p) => p.status === "insufficient_quality"))
      return "Photo retake needed for AI comparison";
  }

  if (status === "in_progress") return "Inspection started — not yet complete";
  if (missing.length > 0)
    return `${missing.length} photo${missing.length === 1 ? "" : "s"} remaining`;
  if (!signed) return "Customer signature required";
  if (confirmedDmg > 0)
    return `${confirmedDmg} confirmed damage item${confirmedDmg === 1 ? "" : "s"}`;
  if (pendingDmg > 0)
    return `${pendingDmg} damage item${pendingDmg === 1 ? "" : "s"} awaiting decision`;
  if (status === "needs_review") return "Condition item needs review";
  return null;
}

// ---------------------------------------------------------------------------
// Resume deep-link — the most relevant incomplete wizard step
// ---------------------------------------------------------------------------

export type ResumeStep =
  "type" | "condition" | "photos" | "ai_review" | "signoff" | "review";

/**
 * Determine the most relevant incomplete wizard step to resume an inspection at.
 * Priority: missing required photos → AI findings pending → missing
 * mileage/signature → final review. Never forces staff back to Step 1.
 */
export function resumeStep(i: Inspection): ResumeStep {
  const missing = missingRequiredPhotos(i);
  if (missing.length > 0) return "photos";

  if (i.inspection_type === "checkin" && needsAiDamageReview(i))
    return "ai_review";

  const signed = hasCustomerSignature(i) || hasStaffSignature(i);
  if (!signed) return "signoff";

  return "review";
}

/** Map a ResumeStep to the wizard's numeric step index for a given type. */
export function resumeStepIndex(
  type: "checkout" | "checkin",
  step: ResumeStep,
): number {
  const checkoutSteps: ResumeStep[] = [
    "type",
    "condition",
    "photos",
    "signoff",
    "review",
  ];
  const checkinSteps: ResumeStep[] = [
    "type",
    "condition",
    "photos",
    "ai_review",
    "signoff",
    "review",
  ];
  const arr = type === "checkin" ? checkinSteps : checkoutSteps;
  return Math.max(0, arr.indexOf(step));
}
