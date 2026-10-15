// Connect Pro Fleet — Inspection wizard resume-step helper.
//
// Maps a ResumeStep label (from the ?step= query param) to the numeric wizard
// step index for a given inspection type. Used by the wizard to deep-link to
// the most relevant incomplete step when resuming an inspection. Pure + tiny
// so the wizard file stays lean.

import type { ResumeStep } from "@/lib/inspectionSelectors";

const CHECKOUT_STEPS: ResumeStep[] = [
  "type",
  "condition",
  "photos",
  "signoff",
  "review",
];

const CHECKIN_STEPS: ResumeStep[] = [
  "type",
  "condition",
  "photos",
  "ai_review",
  "signoff",
  "review",
];

/**
 * Resolve a numeric step index from a resume-step label + inspection type.
 * Returns 0 (the Type step) for unknown/missing labels.
 */
export function resolveResumeStepIndex(
  type: "checkout" | "checkin",
  label: string | null,
): number {
  if (!label) return 0;
  const arr = type === "checkin" ? CHECKIN_STEPS : CHECKOUT_STEPS;
  const idx = arr.indexOf(label as ResumeStep);
  return idx > 0 ? idx : 0;
}
