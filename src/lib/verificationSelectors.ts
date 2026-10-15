// Connect Pro Fleet — Verification resolved-requirement selector (V1).
//
// THE single authoritative function that resolves the actual verification
// requirements for a rental context. Combines:
//   COMPANY POLICY (per-type Off / Staff Decides / Required)
//   +
//   CUSTOMER / RENTAL-SPECIFIC REQUIREMENTS (staff-added)
//   =
//   RESOLVED VERIFICATION REQUIREMENTS
//
// Screens do NOT duplicate this logic. The release gate, Booking Request,
// Customer, Reservation, and Copilot all read from here.
//
// Critical rule: the release gate ONLY blocks on RESOLVED REQUIRED items. A
// service set to Off, or a Staff-Decides service that staff never required,
// or an optional check, NEVER blocks checkout.

import type {
  VerificationRequirement,
  VerificationRequest,
  VerificationOverride,
  VerificationType,
  VerificationServicesPolicy,
  VerificationPolicyMode,
  ResolvedVerificationRequirement,
  VerificationReadiness,
  VerificationUsageCharge,
} from "./verificationTypes";
import { VERIFICATION_TYPE_LABELS } from "./verificationTypes";

const ALL_TYPES: VerificationType[] = [
  "identity",
  "drivers_license",
  "insurance",
  "mvr",
  "background",
];

export function companyModeForType(
  policies: VerificationServicesPolicy | null | undefined,
  type: VerificationType,
): VerificationPolicyMode {
  return policies?.modes?.[type] ?? "off";
}

/** True when company policy enables a service (not Off). */
export function isServiceEnabled(
  policies: VerificationServicesPolicy | null | undefined,
  type: VerificationType,
): boolean {
  return companyModeForType(policies, type) !== "off";
}

/** Active (non-removed) staff requirements for a context. */
export function activeRequirementsFor(
  requirements: VerificationRequirement[],
  ctx: {
    customer_id?: string | null;
    rental_id?: string | null;
    reservation_id?: string | null;
    booking_request_id?: string | null;
  },
): VerificationRequirement[] {
  return requirements.filter(
    (r) =>
      !r.removed &&
      (r.customer_id === ctx.customer_id || r.customer_id === null) &&
      (r.rental_id === ctx.rental_id || r.rental_id === null) &&
      (r.reservation_id === ctx.reservation_id || r.reservation_id === null) &&
      (r.booking_request_id === ctx.booking_request_id ||
        r.booking_request_id === null),
  );
}

function staffRequires(
  requirements: VerificationRequirement[],
  type: VerificationType,
  ctx: {
    customer_id?: string | null;
    rental_id?: string | null;
    reservation_id?: string | null;
    booking_request_id?: string | null;
  },
): boolean {
  return activeRequirementsFor(requirements, ctx).some(
    (r) => r.verification_type === type,
  );
}

/** Resolve requirements for a single context (customer/rental/reservation/
 *  booking). Returns one entry per verification type the company has enabled
 *  OR staff has required. Services set to Off are omitted entirely. */
export function resolveVerificationRequirements(input: {
  policies: VerificationServicesPolicy | null | undefined;
  requirements: VerificationRequirement[];
  requests: VerificationRequest[];
  overrides: VerificationOverride[];
  ctx: {
    customer_id?: string | null;
    rental_id?: string | null;
    reservation_id?: string | null;
    booking_request_id?: string | null;
  };
  now?: Date;
}): ResolvedVerificationRequirement[] {
  const {
    policies,
    requirements,
    requests,
    overrides,
    ctx,
    now = new Date(),
  } = input;
  const out: ResolvedVerificationRequirement[] = [];
  for (const type of ALL_TYPES) {
    const companyMode = companyModeForType(policies, type);
    const staffReq = staffRequires(requirements, type, ctx);
    const enabled = companyMode !== "off" || staffReq;
    if (!enabled) continue; // Off + no staff requirement → hidden
    const required = companyMode === "required" || staffReq;
    const requiredReason: ResolvedVerificationRequirement["required_reason"] =
      companyMode === "required"
        ? "company_policy"
        : staffReq
          ? "staff_requirement"
          : null;
    const latest = latestRequestFor(requests, type, ctx, now);
    const overridden = latest
      ? overrides.some(
          (o) =>
            o.verification_request_id === latest.id &&
            o.decision === "approved",
        )
      : false;
    out.push({
      verification_type: type,
      required,
      required_reason: requiredReason,
      enabled,
      company_mode: companyMode,
      latest_request: latest,
      overridden,
    });
  }
  return out;
}

/** Latest verification request for a type + context. Considers only requests
 *  scoped to the same customer OR the same rental/reservation/booking. */
export function latestRequestFor(
  requests: VerificationRequest[],
  type: VerificationType,
  ctx: {
    customer_id?: string | null;
    rental_id?: string | null;
    reservation_id?: string | null;
    booking_request_id?: string | null;
  },
  now: Date,
): VerificationRequest | null {
  const matching = requests.filter((r) => {
    if (r.verification_type !== type) return false;
    if (r.status === "cancelled") return false;
    if (ctx.rental_id && r.rental_id === ctx.rental_id) return true;
    if (ctx.reservation_id && r.reservation_id === ctx.reservation_id)
      return true;
    if (
      ctx.booking_request_id &&
      r.booking_request_id === ctx.booking_request_id
    )
      return true;
    if (ctx.customer_id && r.customer_id === ctx.customer_id) return true;
    return false;
  });
  if (matching.length === 0) return null;
  matching.sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1));
  // Drop expired results unless they're the only record (callers can see
  // expiry). Keep the latest regardless so history is visible.
  return matching[0];
}

/** Whether a resolved requirement is satisfied (does not block). A required
 *  check is satisfied when its latest result is verified/clear, OR an approved
 *  override applies. */
export function isResolvedRequirementSatisfied(
  req: ResolvedVerificationRequirement,
  now: Date,
): boolean {
  if (!req.required) return true; // optional/unrequired never blocks
  if (req.overridden) return true;
  const latest = req.latest_request;
  if (!latest) return false;
  const status = latest.status;
  if (status === "completed") {
    const resultStatus = latest.result?.result_status;
    if (resultStatus === "verified" || resultStatus === "clear") return true;
    return false;
  }
  return false;
}

/** Whether a resolved requirement currently BLOCKS release. Only required +
 *  unsatisfied + not overridden items block. */
export function doesResolvedRequirementBlock(
  req: ResolvedVerificationRequirement,
  now: Date,
): boolean {
  if (!req.required) return false;
  if (req.overridden) return false;
  return !isResolvedRequirementSatisfied(req, now);
}

/** Block labels for required checks that block release. Used by the release
 *  gate + Action Center. */
export function verificationBlockReasons(
  resolved: ResolvedVerificationRequirement[],
  now: Date,
): string[] {
  const reasons: string[] = [];
  for (const r of resolved) {
    if (!doesResolvedRequirementBlock(r, now)) continue;
    const label = labelForBlock(r);
    if (label) reasons.push(label);
  }
  return reasons;
}

function labelForBlock(r: ResolvedVerificationRequirement): string {
  const t = r.verification_type;
  const names: Record<VerificationType, string> = {
    identity: "identity verification",
    drivers_license: "license verification",
    insurance: "insurance verification",
    mvr: "MVR check",
    background: "background screening",
  };
  const latest = r.latest_request;
  if (!latest) return `Required ${names[t]} pending`;
  if (latest.status === "failed") return `Required ${names[t]} failed`;
  if (latest.status === "needs_review")
    return `Required ${names[t]} needs review`;
  if (latest.status === "expired") return `Required ${names[t]} expired`;
  if (latest.status === "provider_error")
    return `Required ${names[t]} provider error`;
  if (latest.status === "pending") return `Required ${names[t]} pending`;
  return `Required ${names[t]} pending`;
}

/** Overall verification readiness for a context (used by Reservation UI). */
export function verificationReadiness(
  resolved: ResolvedVerificationRequirement[],
  now: Date,
): VerificationReadiness {
  let hasOptional = false;
  for (const r of resolved) {
    if (doesResolvedRequirementBlock(r, now)) {
      const latest = r.latest_request;
      if (latest?.status === "failed") return "failed";
      if (latest?.status === "needs_review") return "needs_review";
      if (latest?.status === "expired") return "expired";
      return "required_pending";
    }
    if (!r.required && r.enabled) hasOptional = true;
  }
  return hasOptional ? "optional_available" : "ready";
}

// ───────────────────────── Usage summary ─────────────────────────

export interface VerificationUsageSummary {
  /** Total mock usage charges in the period (platform_price_mock sum). */
  totalEstimated: number;
  /** Count of usage charges. */
  count: number;
  /** Per-service-type breakdown. */
  byService: {
    service_type: VerificationType;
    label: string;
    count: number;
    estimated: number;
  }[];
  /** Most recent charge date (ISO) or null. */
  latestAt: string | null;
}

/** Derive a mock verification usage summary for the usage view surfaced from
 *  Customer Verification settings. Pure over the passed usage charges. Range
 *  is optional (inclusive by created_at). Values are MOCK estimates only — no
 *  real pricing or billing. */
export function deriveVerificationUsageSummary(
  charges: VerificationUsageCharge[],
  range?: { start: string; end: string },
): VerificationUsageSummary {
  const startTs = range ? Date.parse(range.start) : null;
  const endTs = range ? Date.parse(range.end) : null;
  const inRange = (c: VerificationUsageCharge) => {
    if (startTs == null || endTs == null) return true;
    const t = Date.parse(c.created_at);
    if (Number.isNaN(t)) return false;
    return t >= startTs && t <= endTs;
  };
  const scoped = charges.filter(inRange);
  let total = 0;
  let latest: number | null = null;
  const by: Record<string, { count: number; estimated: number }> = {};
  for (const c of scoped) {
    total += c.platform_price_mock;
    const t = Date.parse(c.created_at);
    if (!Number.isNaN(t) && (latest == null || t > latest)) latest = t;
    const key = c.service_type;
    if (!by[key]) by[key] = { count: 0, estimated: 0 };
    by[key].count++;
    by[key].estimated += c.platform_price_mock;
  }
  const byService = Object.entries(by).map(([service_type, v]) => ({
    service_type: service_type as VerificationType,
    label:
      VERIFICATION_TYPE_LABELS[service_type as VerificationType] ??
      service_type,
    count: v.count,
    estimated: v.estimated,
  }));
  return {
    totalEstimated: total,
    count: scoped.length,
    byService,
    latestAt: latest == null ? null : new Date(latest).toISOString(),
  };
}
