// Connect Pro Fleet — AI Damage Detection provider abstraction + dev adapter.
//
// PRODUCTION AI DAMAGE DETECTION IS NOT YET CONNECTED.
//
// The `DamageDetectionProvider` interface (aiDamageTypes.ts) decouples the UI
// from any single vendor. The only implementation shipped in V1 is the
// `DeterministicDamageDetectionProvider` — a deterministic, offline dev/mock
// adapter. It does NOT call any real image-analysis model, holds NO secrets,
// and makes NO network requests. Its output is deterministic so it can be
// unit-tested, but it MUST NOT be treated as production AI capability.
//
// When a real server-backed provider is connected (future build), it will:
//   - live behind a protected backend (no client secrets)
//   - implement the same interface
//   - return the same structured fields (no hidden chain-of-thought)
//   - be verified against real before/after images (Test A–E, spec §59)
//
// Until then, `getDamageDetectionProvider()` returns the dev adapter and
// `isProductionAiConnected()` returns false.

import type {
  AiDamageFinding,
  AiSeverity,
  AiConfidence,
  AiDamageType,
  DamageDetectionProvider,
  PhotoQualityResult,
  ImageQualityIssue,
  ComparePairInput,
} from "./aiDamageTypes";
import { uid } from "./store/ids";

/**
 * Deterministic dev/mock adapter. It derives a *potential* finding from the
 * angle + photo ids using a stable hash so the same inputs always yield the
 * same output. This lets the full review workflow be exercised end-to-end in
 * dev/tests without a real model. The output is clearly labeled as AI-flagged
 * and NEVER auto-confirmed.
 *
 * The heuristic intentionally surfaces a finding only for a subset of pairs so
 * the "no potential new damage" state is also reachable and testable.
 */
class DeterministicDamageDetectionProvider implements DamageDetectionProvider {
  readonly name = "deterministic-dev";
  readonly connected = false;

  async analyzeQuality(photo: {
    angle: string;
    photo_id: string;
  }): Promise<PhotoQualityResult> {
    const id = photo.photo_id ?? "";
    // Deterministic quality signal derived from the photo id token.
    const issue = deriveQualityIssue(id);
    return {
      angle: photo.angle,
      issue,
      reliable: issue === "none",
      message: qualityMessage(issue),
    };
  }

  async comparePair(
    input: ComparePairInput,
  ): Promise<AiDamageFinding[] | null> {
    if (!input.checkout_photo_id || !input.checkin_photo_id) return null;
    const co = input.checkout_photo_id;
    const ci = input.checkin_photo_id;
    // Stable hash over the two photo ids + angle.
    const h = stableHash(`${co}|${ci}|${input.angle}`);
    // ~40% of comparable pairs surface a potential finding.
    if (h % 10 >= 4) return [];

    const damageType = pickDamageType(h);
    const severity = pickSeverity(h);
    const confidence = pickConfidence(h);
    const preExisting = h % 7 === 0; // some findings reference checkout baseline
    const finding: AiDamageFinding = {
      finding_id: uid("aif"),
      tenant_id: input.tenant_id,
      inspection_id: input.checkin_inspection_id,
      rental_id: input.rental_id,
      vehicle_id: input.vehicle_id,
      checkout_photo_id: co,
      checkin_photo_id: ci,
      angle: input.angle,
      damage_type: damageType,
      approximate_location: approximateLocation(input.angle),
      severity,
      confidence,
      description: preExisting
        ? `Possible worsening near ${input.angle.toLowerCase()} — similar mark visible at checkout.`
        : `Possible new ${damageTypeLabel(damageType).toLowerCase()} near ${input.angle.toLowerCase()} not clearly visible in checkout image.`,
      bounding_region: h % 3 === 0 ? { x: 0.3, y: 0.4, w: 0.2, h: 0.15 } : null,
      ai_status: "ai_flagged",
      staff_decision: "pending",
      staff_notes: "",
      created_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      pre_existing_note: preExisting
        ? "Similar mark present in checkout baseline."
        : null,
    };
    return [finding];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function deriveQualityIssue(id: string): ImageQualityIssue {
  const lower = id.toLowerCase();
  if (lower.includes("dark")) return "too_dark";
  if (lower.includes("blur")) return "too_blurry";
  if (lower.includes("obstruct")) return "obstructed";
  if (lower.includes("far")) return "too_far";
  if (lower.includes("dup")) return "duplicate";
  return "none";
}

function qualityMessage(issue: ImageQualityIssue): string {
  switch (issue) {
    case "none":
      return "Image quality acceptable for comparison.";
    case "too_dark":
      return "This image may be too dark for reliable damage comparison.";
    case "too_blurry":
      return "This image may be too blurry for reliable damage comparison.";
    case "vehicle_not_visible":
      return "Vehicle is not sufficiently visible.";
    case "obstructed":
      return "Vehicle appears obstructed.";
    case "wrong_orientation":
      return "Image orientation may be incorrect.";
    case "too_far":
      return "Vehicle may be too far away for reliable comparison.";
    case "duplicate":
      return "This image appears to be a duplicate.";
    case "unsupported_format":
      return "Unsupported image format.";
  }
}

function pickDamageType(h: number): AiDamageType {
  const types: AiDamageType[] = [
    "scratch",
    "dent",
    "crack",
    "bumper_damage",
    "body_panel_damage",
    "wheel_rim_damage",
  ];
  return types[h % types.length];
}

function pickSeverity(h: number): AiSeverity {
  const arr: AiSeverity[] = ["minor", "moderate", "major"];
  return arr[h % 3];
}

function pickConfidence(h: number): AiConfidence {
  const arr: AiConfidence[] = ["high", "medium", "low"];
  return arr[(h >> 2) % 3];
}

function damageTypeLabel(t: AiDamageType): string {
  // Avoid a circular import: labels are also exported from aiDamageTypes, but
  // duplicating here keeps the provider dependency-free.
  const m: Record<AiDamageType, string> = {
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
  return m[t];
}

function approximateLocation(angle: string): string {
  const a = angle.toLowerCase();
  if (a.includes("front") && a.includes("left")) return "front-left area";
  if (a.includes("front") && a.includes("right")) return "front-right area";
  if (a.includes("rear") && a.includes("left")) return "rear-left area";
  if (a.includes("rear") && a.includes("right")) return "rear-right area";
  if (a.includes("front")) return "front bumper";
  if (a.includes("rear")) return "rear bumper";
  if (a.includes("left")) return "driver-side area";
  if (a.includes("right")) return "passenger-side area";
  if (a.includes("wheel") || a.includes("rim")) return "wheel / rim";
  if (a.includes("windshield")) return "windshield";
  if (a.includes("dashboard") || a.includes("interior")) return "interior";
  return angle.toLowerCase();
}

// ---------------------------------------------------------------------------
// Singleton + connection flag
// ---------------------------------------------------------------------------

const DEV_PROVIDER = new DeterministicDamageDetectionProvider();

/** Returns the active provider. In V1 this is always the dev/mock adapter. */
export function getDamageDetectionProvider(): DamageDetectionProvider {
  return DEV_PROVIDER;
}

/**
 * TRUE only when a real production image-analysis provider has actually
 * compared real Checkout and Check-In images successfully. Always FALSE in V1.
 */
export function isProductionAiConnected(): boolean {
  return DEV_PROVIDER.connected;
}
