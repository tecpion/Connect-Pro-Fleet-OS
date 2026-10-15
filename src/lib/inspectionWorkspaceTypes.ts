// Connect Pro Fleet — Inspection domain types (Workspace enhancement).
//
// Extends the base Inspection record with an optional condition-checklist +
// damage-item presentation layer. All new fields are OPTIONAL so existing
// seed data and the authoritative `addInspection` store method continue to
// work unchanged. This is a presentation/UX layer — it does NOT alter the
// rental lifecycle, reservation authority, vehicle status engine, damage
// claim authority, or tenant scoping.
//
// Inspection "status" here is a DERIVED presentation value computed by
// `deriveInspectionStatus()` in inspectionSelectors.ts — it is not a new
// persisted domain field. It maps the existing authoritative fields
// (damage_detected, photos, signature, condition flags) to an operational
// status label.

export type InspectionType = "checkout" | "checkin";

/** Quick condition state for a single checklist item. */
export type ConditionState = "good" | "attention" | "damaged" | "n/a";

/** A single vehicle-condition checklist item (e.g. "Front bumper"). */
export interface ConditionItem {
  /** Stable key, e.g. "exterior_front". */
  key: string;
  /** Group label, e.g. "Exterior". */
  group: string;
  /** Display label, e.g. "Front". */
  label: string;
  state: ConditionState;
}

/** Damage type classification (presentation only). */
export type DamageType =
  | "scratch"
  | "dent"
  | "crack"
  | "broken_glass"
  | "wheel_tire"
  | "interior"
  | "mechanical"
  | "cleanliness"
  | "other";

export type DamageSeverity = "minor" | "moderate" | "major";

/** Whether a damage item is new vs. pre-existing relative to checkout. */
export type DamageProvenance =
  "pre_existing" | "new" | "unknown" | "not_damage";

/** Staff review decision on a potential-new-damage item. */
export type DamageReviewDecision =
  "pending" | "confirmed_new" | "marked_pre_existing" | "marked_not_damage";

/** A structured damage finding captured during an inspection. */
export interface DamageItem {
  /** Stable id within the inspection. */
  id: string;
  /** Which area/angle, e.g. "Rear bumper". */
  area: string;
  damage_type: DamageType;
  severity: DamageSeverity;
  note: string;
  provenance: DamageProvenance;
  review_decision: DamageReviewDecision;
  /** Optional linked photo angle key. */
  photo_angle?: string | null;
}

/**
 * Extended inspection payload captured by the wizard. The base `Inspection`
 * record (inspectionTypes.ts) stores the authoritative summary fields; these
 * richer fields are persisted alongside via the same `addInspection` call by
 * spreading them onto the record. They are all optional so legacy records
 * remain valid.
 */
export interface InspectionConditionData {
  /** Structured condition checklist. */
  condition_items?: ConditionItem[];
  /** Structured damage findings. */
  damage_items?: DamageItem[];
  /** Inspector staff id (if captured). */
  inspector_id?: string | null;
  /** Inspector display name snapshot. */
  inspector_name?: string | null;
  /** Whether customer signature was captured. */
  customer_signature?: boolean;
  /** Whether staff/inspector sign-off was captured. */
  staff_signature?: boolean;
  /** Linked damage claim ids created from this inspection. */
  linked_damage_claim_ids?: string[];
  /** Linked maintenance work-order ids created from this inspection. */
  linked_work_order_ids?: string[];
  /** Audit timeline events (presentation). */
  inspection_events?: InspectionEvent[];
  // AI Damage Detection V1 — persisted findings + report metadata (optional).
  ai_damage_findings?: import("./aiDamageTypes").AiDamageFinding[];
  ai_pairs?: import("./aiDamageTypes").PhotoPair[];
  ai_coverage?: {
    photos_compared: number;
    angles_analyzed: number;
    angles_not_analyzed: number;
  };
  ai_provider_connected?: boolean;
  ai_outcome?: "success" | "partial" | "failed" | null;
}

/** A lightweight audit-timeline event for an inspection. */
export interface InspectionEvent {
  id: string;
  at: string;
  label: string;
  tone: "neutral" | "available" | "maintenance" | "out";
}

/** Derived operational status (presentation only — not persisted). */
export type InspectionStatus =
  "in_progress" | "clear" | "needs_review" | "damage_flagged" | "incomplete";

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  in_progress: "In Progress",
  clear: "Clear",
  needs_review: "Needs Review",
  damage_flagged: "Damage Flagged",
  incomplete: "Incomplete",
};

export const CONDITION_STATE_LABELS: Record<ConditionState, string> = {
  good: "Good",
  attention: "Attention",
  damaged: "Damaged",
  "n/a": "N/A",
};

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  scratch: "Scratch",
  dent: "Dent",
  crack: "Crack",
  broken_glass: "Broken Glass",
  wheel_tire: "Wheel / Tire",
  interior: "Interior",
  mechanical: "Mechanical Concern",
  cleanliness: "Cleanliness",
  other: "Other",
};

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

export const DAMAGE_PROVENANCE_LABELS: Record<DamageProvenance, string> = {
  pre_existing: "Pre-existing",
  new: "New",
  unknown: "Unknown",
  not_damage: "Not Damage",
};

/** Required photo angles for a standard vehicle walkaround. */
export const REQUIRED_PHOTO_ANGLES = [
  "Front",
  "Rear",
  "Left side",
  "Right side",
  "Dashboard",
] as const;

/** All captureable angles (Cargo/bed is optional, vehicle-type dependent). */
export const ALL_PHOTO_ANGLES = [
  "Front",
  "Rear",
  "Left side",
  "Right side",
  "Dashboard",
  "Cargo/bed",
] as const;

/** The default condition checklist template (groups + items). */
export const CONDITION_TEMPLATE: Omit<ConditionItem, "state">[] = [
  // Exterior
  { key: "ext_front", group: "Exterior", label: "Front" },
  { key: "ext_rear", group: "Exterior", label: "Rear" },
  { key: "ext_left", group: "Exterior", label: "Left side" },
  { key: "ext_right", group: "Exterior", label: "Right side" },
  { key: "ext_roof", group: "Exterior", label: "Roof" },
  { key: "ext_bumpers", group: "Exterior", label: "Bumpers" },
  // Wheels / Tires
  { key: "wheel_fl", group: "Wheels / Tires", label: "Front left" },
  { key: "wheel_fr", group: "Wheels / Tires", label: "Front right" },
  { key: "wheel_rl", group: "Wheels / Tires", label: "Rear left" },
  { key: "wheel_rr", group: "Wheels / Tires", label: "Rear right" },
  // Glass / Lights
  { key: "glass_windshield", group: "Glass / Lights", label: "Windshield" },
  { key: "glass_windows", group: "Glass / Lights", label: "Windows" },
  { key: "glass_mirrors", group: "Glass / Lights", label: "Mirrors" },
  { key: "glass_headlights", group: "Glass / Lights", label: "Headlights" },
  { key: "glass_taillights", group: "Glass / Lights", label: "Taillights" },
  // Interior
  { key: "int_seats", group: "Interior", label: "Seats" },
  { key: "int_dashboard", group: "Interior", label: "Dashboard" },
  { key: "int_flooring", group: "Interior", label: "Flooring" },
  { key: "int_odor", group: "Interior", label: "Odor / Smoking" },
  { key: "int_cleanliness", group: "Interior", label: "Cleanliness" },
  // Equipment / Accessories
  { key: "equip_keys", group: "Equipment / Accessories", label: "Key(s)" },
  { key: "equip_charger", group: "Equipment / Accessories", label: "Charger" },
  {
    key: "equip_spare",
    group: "Equipment / Accessories",
    label: "Spare tire / tools",
  },
];

/** Build a fresh condition checklist (all items default to "good"). */
export function freshConditionItems(): ConditionItem[] {
  return CONDITION_TEMPLATE.map((t) => ({ ...t, state: "good" }));
}
