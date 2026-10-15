// Connect Pro Fleet — AI Damage Detection V1 domain types.
//
// This is a presentation/analysis layer over authoritative Inspection records.
// It does NOT alter rental lifecycle, reservation authority, vehicle status
// engine, damage-claim authority, maintenance authority, document permissions,
// or tenant scoping. AI findings are NEVER treated as confirmed renter damage
// automatically — every finding requires explicit human review.
//
// IMPORTANT: There is NO production image-analysis provider connected in V1.
// The `DamageDetectionProvider` interface + deterministic dev adapter live in
// aiDamageProvider.ts. Real image comparison must be verified separately.

// ---------------------------------------------------------------------------
// Damage categories (visible damage only — no hidden mechanical inference)
// ---------------------------------------------------------------------------

export type AiDamageType =
  | "scratch"
  | "dent"
  | "crack"
  | "chipped_glass"
  | "broken_glass"
  | "bumper_damage"
  | "body_panel_damage"
  | "light_damage"
  | "mirror_damage"
  | "wheel_rim_damage"
  | "tire_damage"
  | "interior_damage"
  | "missing_broken_accessory"
  | "other_visible";

export const AI_DAMAGE_TYPE_LABELS: Record<AiDamageType, string> = {
  scratch: "Scratch",
  dent: "Dent",
  crack: "Crack",
  chipped_glass: "Chipped Glass",
  broken_glass: "Broken Glass",
  bumper_damage: "Bumper Damage",
  body_panel_damage: "Body Panel Damage",
  light_damage: "Light Damage",
  mirror_damage: "Mirror Damage",
  wheel_rim_damage: "Wheel / Rim Damage",
  tire_damage: "Tire Damage",
  interior_damage: "Interior Damage",
  missing_broken_accessory: "Missing / Broken Accessory",
  other_visible: "Other Visible Damage",
};

export const AI_DAMAGE_TYPES: AiDamageType[] = [
  "scratch",
  "dent",
  "crack",
  "chipped_glass",
  "broken_glass",
  "bumper_damage",
  "body_panel_damage",
  "light_damage",
  "mirror_damage",
  "wheel_rim_damage",
  "tire_damage",
  "interior_damage",
  "missing_broken_accessory",
  "other_visible",
];

// ---------------------------------------------------------------------------
// Severity / confidence (AI-estimated, clearly labeled, staff-editable)
// ---------------------------------------------------------------------------

export type AiSeverity = "minor" | "moderate" | "major";

export const AI_SEVERITY_LABELS: Record<AiSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

export type AiConfidence = "high" | "medium" | "low";

export const AI_CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
};

// ---------------------------------------------------------------------------
// Staff review decisions (human-in-the-loop)
// ---------------------------------------------------------------------------

export type StaffDecision =
  "pending" | "confirmed" | "pre_existing" | "not_damage" | "needs_review";

export const STAFF_DECISION_LABELS: Record<StaffDecision, string> = {
  pending: "Needs Review",
  confirmed: "Confirmed Damage",
  pre_existing: "Pre-existing",
  not_damage: "Not Damage",
  needs_review: "Needs Review",
};

/**
 * The lifecycle status of a single finding — distinguishes AI-flagged from
 * human-confirmed. This distinction is preserved in the audit trail and never
 * collapsed into a single statement.
 */
export type AiFindingStatus =
  | "ai_flagged"
  | "staff_confirmed"
  | "staff_rejected"
  | "staff_pre_existing"
  | "staff_needs_review";

export const AI_FINDING_STATUS_LABELS: Record<AiFindingStatus, string> = {
  ai_flagged: "AI Finding",
  staff_confirmed: "Staff Confirmed",
  staff_rejected: "Staff Rejected",
  staff_pre_existing: "Staff: Pre-existing",
  staff_needs_review: "Staff: Needs Review",
};

// ---------------------------------------------------------------------------
// Bounding region (optional, provider-supplied, never alters original photo)
// ---------------------------------------------------------------------------

export interface BoundingRegion {
  x: number; // 0..1 normalized
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------------------
// Structured finding model (spec §12). No duplicate raw vehicle/customer data.
// ---------------------------------------------------------------------------

export interface AiDamageFinding {
  finding_id: string;
  tenant_id: string;
  inspection_id: string; // the check-in inspection
  rental_id: string | null;
  vehicle_id: string;
  checkout_photo_id: string | null;
  checkin_photo_id: string | null;
  angle: string;
  damage_type: AiDamageType;
  approximate_location: string;
  severity: AiSeverity;
  confidence: AiConfidence;
  description: string;
  bounding_region: BoundingRegion | null;
  ai_status: AiFindingStatus;
  staff_decision: StaffDecision;
  staff_notes: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Context when similar damage existed at checkout (pre-existing baseline). */
  pre_existing_note: string | null;
}

// ---------------------------------------------------------------------------
// Image quality checks (spec §8)
// ---------------------------------------------------------------------------

export type ImageQualityIssue =
  | "none"
  | "too_dark"
  | "too_blurry"
  | "vehicle_not_visible"
  | "obstructed"
  | "wrong_orientation"
  | "too_far"
  | "duplicate"
  | "unsupported_format";

export const IMAGE_QUALITY_ISSUE_LABELS: Record<ImageQualityIssue, string> = {
  none: "OK",
  too_dark: "Too dark",
  too_blurry: "Too blurry",
  vehicle_not_visible: "Vehicle not sufficiently visible",
  obstructed: "Obstructed",
  wrong_orientation: "Wrong orientation",
  too_far: "Too far away",
  duplicate: "Duplicate image",
  unsupported_format: "Unsupported format",
};

export interface PhotoQualityResult {
  angle: string;
  issue: ImageQualityIssue;
  reliable: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Photo pairing (spec §11 — equivalent angles only)
// ---------------------------------------------------------------------------

export type PhotoPairStatus =
  | "compared"
  | "missing_checkout"
  | "missing_checkin"
  | "insufficient_quality"
  | "not_applicable";

export interface PhotoPair {
  angle: string;
  checkout_photo_id: string | null;
  checkin_photo_id: string | null;
  status: PhotoPairStatus;
  quality: PhotoQualityResult | null;
  findings: AiDamageFinding[];
}

// ---------------------------------------------------------------------------
// Report status (spec §28)
// ---------------------------------------------------------------------------

export type AiReportStatus =
  | "analysis_pending"
  | "staff_review_required"
  | "reviewed"
  | "no_confirmed_new_damage"
  | "confirmed_damage"
  | "incomplete_evidence";

export const AI_REPORT_STATUS_LABELS: Record<AiReportStatus, string> = {
  analysis_pending: "Analysis Pending",
  staff_review_required: "Staff Review Required",
  reviewed: "Reviewed",
  no_confirmed_new_damage: "No Confirmed New Damage",
  confirmed_damage: "Confirmed Damage",
  incomplete_evidence: "Incomplete Evidence",
};

// ---------------------------------------------------------------------------
// AI Damage Report (spec §27)
// ---------------------------------------------------------------------------

export interface AiReportCoverage {
  photos_compared: number;
  angles_analyzed: number;
  angles_not_analyzed: number;
}

export interface AiStaffSummary {
  confirmed: number;
  pre_existing: number;
  rejected: number;
  needs_review: number;
}

export interface AiDamageReport {
  report_id: string;
  tenant_id: string;
  inspection_id: string; // the check-in inspection
  checkout_inspection_id: string | null;
  vehicle_id: string;
  rental_id: string | null;
  customer_id: string | null;
  generated_at: string;
  status: AiReportStatus;
  pairs: PhotoPair[];
  findings: AiDamageFinding[];
  coverage: AiReportCoverage;
  staff_summary: AiStaffSummary;
  notes: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  /** Provider name — "deterministic-dev" for the mock adapter. */
  provider: string;
  /** FALSE for the dev/mock adapter. Real production AI is NOT connected. */
  provider_connected: boolean;
}

// ---------------------------------------------------------------------------
// Audit trail (spec §48 — structured output + user actions only, no CoT)
// ---------------------------------------------------------------------------

export type AiAuditEventType =
  | "ai_analysis_requested"
  | "provider_started"
  | "analysis_completed"
  | "analysis_failed"
  | "finding_generated"
  | "staff_confirmed"
  | "staff_rejected"
  | "marked_pre_existing"
  | "finding_edited"
  | "report_finalized"
  | "damage_claim_created"
  | "maintenance_work_order_created";

export interface AiAuditEvent {
  id: string;
  at: string;
  type: AiAuditEventType;
  label: string;
  finding_id?: string | null;
}

// ---------------------------------------------------------------------------
// Provider abstraction (spec §9/§10)
// ---------------------------------------------------------------------------

export interface ComparePairInput {
  angle: string;
  checkout_photo_id: string | null;
  checkin_photo_id: string | null;
  checkout_inspection_id: string | null;
  checkin_inspection_id: string;
  vehicle_id: string;
  rental_id: string | null;
  tenant_id: string;
}

export interface DamageDetectionProvider {
  readonly name: string;
  /** FALSE for the dev/mock adapter. Real production AI is NOT connected. */
  readonly connected: boolean;
  analyzeQuality(photo: {
    angle: string;
    photo_id: string;
  }): Promise<PhotoQualityResult>;
  /** Returns findings for one angle pair, or null if comparison not possible. */
  comparePair(input: ComparePairInput): Promise<AiDamageFinding[] | null>;
}
