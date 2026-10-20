// Connect Pro Fleet — Copilot verification handlers (V1 Customer Verification).
//
// Each handler answers from the AUTHORITATIVE verification store (V1 mock) +
// canonical customer/rental records — never a second source of truth. The
// bundle is OPTIONAL on CopilotSources: when the VerificationProvider is not
// mounted (e.g. older Copilot tests), handlers return a graceful fallback.
//
// CRITICAL: Copilot distinguishes OPTIONAL vs REQUIRED. An optional unrun check
// is NEVER reported as a missing requirement. Only resolved REQUIRED items that
// block are surfaced as actionable. No proprietary Fleet risk score is created —
// only normalized provider result statuses are reported.
//
// Handlers prioritized over large brittle regex rule sets; the LLM layer
// handles free phrasing later.

import type {
  CopilotAnswer,
  CopilotSources,
  CopilotViewerPermissions,
} from "./copilotTypes";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationServicesPolicy,
  VerificationType,
  VerificationUsageCharge,
} from "./verificationTypes";
import {
  VERIFICATION_TYPE_LABELS,
  VERIFICATION_RESULT_LABELS,
  VERIFICATION_REQUEST_STATUS_LABELS,
} from "./verificationTypes";
import {
  resolveVerificationRequirements,
  doesResolvedRequirementBlock,
  companyModeForType,
} from "./verificationSelectors";
import type { Customer, RentalAgreement } from "./types";
import { baseAnswer, plural } from "./copilotShared";
import { fmtDateShort, fmtDateTime } from "./format";
import { startOfMonthInTz, getOrgTimezone } from "./timezone";

// ---------------------------------------------------------------------------
// Verification Copilot sources (optional on CopilotSources).
// ---------------------------------------------------------------------------

export interface VerificationCopilotSources {
  requests: VerificationRequest[];
  requirements: VerificationRequirement[];
  overrides: VerificationOverride[];
  usageCharges: VerificationUsageCharge[];
  policies: VerificationServicesPolicy | null | undefined;
  customers: Customer[];
  rentals: RentalAgreement[];
}

function verSrc(src: CopilotSources): VerificationCopilotSources | null {
  return src.verification ?? null;
}

function customerName(
  src: VerificationCopilotSources,
  id: string | null,
): string | null {
  if (!id) return null;
  const c = src.customers.find((x) => x.id === id);
  return c ? `${c.first_name} ${c.last_name}` : null;
}

function rentalNumber(
  src: VerificationCopilotSources,
  id: string | null,
): string | null {
  if (!id) return null;
  const r = src.rentals.find((x) => x.id === id);
  return r?.agreement_number ?? null;
}

/** "Which booking requests have required verification pending?" / "Which
 *  reservations are blocked by verification?" — lists required checks that
 *  block release across active + ready-for-checkout rentals. */
export function answerVerificationBlocked(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("verification_blocked", asOf, perms, "derived");
  const vs = verSrc(src);
  if (!vs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Customer Verification is available in the full workspace. Open a rental or customer to view verification status.",
    };
  }
  const blocking: {
    rental: RentalAgreement;
    type: VerificationType;
    reason: string;
  }[] = [];
  for (const rental of vs.rentals) {
    if (rental.status === "completed" || rental.status === "cancelled")
      continue;
    const resolved = resolveVerificationRequirements({
      policies: vs.policies,
      requirements: vs.requirements,
      requests: vs.requests,
      overrides: vs.overrides,
      ctx: { customer_id: rental.customer_id, rental_id: rental.id },
      now: asOf,
    });
    for (const r of resolved) {
      if (!doesResolvedRequirementBlock(r, asOf)) continue;
      const latest = r.latest_request;
      const label = VERIFICATION_TYPE_LABELS[r.verification_type];
      let reason = `Required ${label} pending`;
      if (latest?.status === "failed") reason = `Required ${label} failed`;
      else if (latest?.status === "needs_review")
        reason = `Required ${label} needs review`;
      else if (latest?.status === "expired")
        reason = `Required ${label} expired`;
      blocking.push({ rental, type: r.verification_type, reason });
    }
  }
  return {
    ...base,
    answer_type: "list",
    summary:
      blocking.length === 0
        ? "No rentals are blocked by required verification."
        : `${blocking.length} ${plural(
            blocking.length,
            "rental",
          )} ${blocking.length === 1 ? "is" : "are"} blocked by required verification.`,
    facts: [
      { label: "Rentals blocked by verification", value: blocking.length },
    ],
    items: blocking.slice(0, 25).map((b) => ({
      id: `${b.rental.id}:${b.type}`,
      title: customerName(vs, b.rental.customer_id) ?? "—",
      subtitle: `${rentalNumber(vs, b.rental.id) ?? b.rental.id} · ${b.reason}`,
      status: b.reason,
      deep_link: `/rentals/${b.rental.id}`,
    })),
    sources: blocking.slice(0, 10).map((b) => ({
      source_module: "verification",
      entity_type: "rental",
      entity_id: b.rental.id,
      label: customerName(vs, b.rental.customer_id) ?? b.rental.id,
      deep_link: `/rentals/${b.rental.id}`,
    })),
    caveats: [
      "Only REQUIRED checks block. Optional unrun checks are not listed.",
    ],
  };
}

/** "Which required checks still need staff review?" */
export function answerVerificationNeedsReview(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("verification_needs_review", asOf, perms, "derived");
  const vs = verSrc(src);
  if (!vs) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Customer Verification is available in the full workspace.",
    };
  }
  const review = vs.requests.filter((r) => r.status === "needs_review");
  return {
    ...base,
    answer_type: "list",
    summary:
      review.length === 0
        ? "No verification checks need staff review."
        : `${review.length} ${plural(
            review.length,
            "verification check",
          )} need${review.length === 1 ? "s" : ""} staff review.`,
    facts: [{ label: "Checks needing review", value: review.length }],
    items: review.slice(0, 25).map((r) => ({
      id: r.id,
      title: customerName(vs, r.customer_id) ?? "—",
      subtitle: `${VERIFICATION_TYPE_LABELS[r.verification_type]} · ${
        r.result?.summary ?? VERIFICATION_REQUEST_STATUS_LABELS[r.status]
      }`,
      status: VERIFICATION_REQUEST_STATUS_LABELS[r.status],
      occurred_at: r.completed_at ?? r.requested_at,
      deep_link: r.rental_id
        ? `/rentals/${r.rental_id}`
        : `/customers/${r.customer_id}`,
    })),
    sources: review.slice(0, 10).map((r) => ({
      source_module: "verification",
      entity_type: "verification_request",
      entity_id: r.id,
      label: VERIFICATION_TYPE_LABELS[r.verification_type],
      deep_link: r.rental_id
        ? `/rentals/${r.rental_id}`
        : `/customers/${r.customer_id}`,
      occurred_at: r.completed_at ?? r.requested_at,
    })),
    caveats: [
      "Includes both required and optional checks that returned needs_review.",
    ],
  };
}

/** "Which customers have expired driver's licenses?" — checks the canonical
 *  Customer drivers_license_expiry field (NOT a second license domain). */
export function answerVerificationExpiredLicenses(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    "verification_expired_licenses",
    asOf,
    perms,
    "derived",
  );
  const vs = verSrc(src);
  if (!vs) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Customer Verification is available in the full workspace.",
    };
  }
  const expired = vs.customers.filter((c) => {
    if (!c.drivers_license_expiry) return false;
    const exp = new Date(c.drivers_license_expiry);
    if (Number.isNaN(exp.getTime())) return false;
    return exp.getTime() < asOf.getTime();
  });
  return {
    ...base,
    answer_type: "list",
    summary:
      expired.length === 0
        ? "No customers have expired driver's licenses."
        : `${expired.length} ${plural(
            expired.length,
            "customer",
          )} ${expired.length === 1 ? "has" : "have"} an expired driver's license.`,
    facts: [{ label: "Expired licenses", value: expired.length }],
    items: expired.slice(0, 25).map((c) => ({
      id: c.id,
      title: `${c.first_name} ${c.last_name}`,
      subtitle: `Expired ${fmtDateShort(c.drivers_license_expiry!)}`,
      status: "Expired",
      deep_link: `/customers/${c.id}`,
    })),
    sources: expired.slice(0, 10).map((c) => ({
      source_module: "customers",
      entity_type: "customer",
      entity_id: c.id,
      label: `${c.first_name} ${c.last_name}`,
      deep_link: `/customers/${c.id}`,
    })),
  };
}

/** "How much verification usage do we have this month?" — mock usage totals. */
export function answerVerificationUsage(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  tz?: string,
): CopilotAnswer {
  const base = baseAnswer("verification_usage", asOf, perms, "derived");
  const vs = verSrc(src);
  if (!vs) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Customer Verification usage is available in the full workspace.",
    };
  }
  const monthStart = startOfMonthInTz(asOf, getOrgTimezone(tz));
  const monthCharges = vs.usageCharges.filter(
    (u) => new Date(u.created_at) >= monthStart,
  );
  const total = monthCharges.reduce(
    (sum, u) => sum + (u.platform_price_mock ?? 0),
    0,
  );
  const byType: Record<string, number> = {};
  for (const u of monthCharges) {
    byType[u.service_type] = (byType[u.service_type] ?? 0) + 1;
  }
  const facts = [
    { label: "Checks this month", value: monthCharges.length },
    {
      label: "Estimated usage total",
      value: `$${total.toFixed(2)}`,
      financial: true,
    },
  ];
  return {
    ...base,
    answer_type: "summary",
    summary:
      monthCharges.length === 0
        ? "No verification checks have been run this month."
        : `${monthCharges.length} ${plural(
            monthCharges.length,
            "verification check",
          )} run this month · estimated usage $${total.toFixed(2)}.`,
    facts,
    items: Object.entries(byType).map(([type, count]) => ({
      id: type,
      title: VERIFICATION_TYPE_LABELS[type as VerificationType] ?? type,
      subtitle: `${count} ${plural(count, "check")} run`,
    })),
    caveats: [
      "Mock usage estimates only — no real pricing or billing connected.",
    ],
  };
}

/** "Does Sarah need identity verification?" / "Has MVR been run for this
 *  renter?" / "When was this customer's last verification?" — customer-scoped
 *  verification summary. Distinguishes optional vs required. Matches a customer
 *  by name from the raw query text (mirrors the booking summary handler). */
export function answerVerificationCustomerSummary(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
  query?: string,
): CopilotAnswer {
  const base = baseAnswer(
    "verification_customer_summary",
    asOf,
    perms,
    "derived",
  );
  const vs = verSrc(src);
  if (!vs) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Customer Verification is available in the full workspace.",
    };
  }
  if (!query || !query.trim()) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "Which customer would you like verification details for? Tell me a name.",
    };
  }
  const q = query.toLowerCase();
  // Match by first name, last name, or full name.
  const matches = vs.customers.filter((c) => {
    const full = `${c.first_name} ${c.last_name}`.toLowerCase();
    return (
      full.includes(q) ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q)
    );
  });
  if (matches.length === 0) {
    return {
      ...base,
      answer_type: "fallback",
      summary:
        "I couldn't find a customer matching that name for verification.",
    };
  }
  const customer = matches[0];
  const customerId = customer.id;
  const name = `${customer.first_name} ${customer.last_name}`;
  const resolved = resolveVerificationRequirements({
    policies: vs.policies,
    requirements: vs.requirements,
    requests: vs.requests,
    overrides: vs.overrides,
    ctx: { customer_id: customerId },
    now: asOf,
  });
  const required = resolved.filter((r) => r.required);
  const optional = resolved.filter((r) => !r.required && r.enabled);
  const customerRequests = vs.requests.filter(
    (r) => r.customer_id === customerId,
  );
  const latest = customerRequests[0] ?? null;
  const facts: { label: string; value: string | number }[] = [
    { label: "Required checks", value: required.length },
    { label: "Optional checks available", value: optional.length },
  ];
  if (latest) {
    facts.push({
      label: "Last verification",
      value: VERIFICATION_TYPE_LABELS[latest.verification_type],
    });
    facts.push({
      label: "Last result",
      value: latest.result
        ? VERIFICATION_RESULT_LABELS[latest.result.result_status]
        : VERIFICATION_REQUEST_STATUS_LABELS[latest.status],
    });
    facts.push({ label: "Last run", value: fmtDateTime(latest.requested_at) });
  }
  const requiredPending = required.filter((r) =>
    doesResolvedRequirementBlock(r, asOf),
  );
  return {
    ...base,
    answer_type: "entity",
    summary:
      requiredPending.length > 0
        ? `${name} has ${requiredPending.length} required ${plural(
            requiredPending.length,
            "check",
          )} pending.`
        : latest
          ? `${name}'s last verification was ${VERIFICATION_TYPE_LABELS[latest.verification_type]} (${latest.result ? VERIFICATION_RESULT_LABELS[latest.result.result_status] : VERIFICATION_REQUEST_STATUS_LABELS[latest.status]}).`
          : `${name} has no verification history yet.`,
    facts,
    items: resolved.map((r) => ({
      id: r.verification_type,
      title: VERIFICATION_TYPE_LABELS[r.verification_type],
      subtitle: r.required
        ? `Required · ${r.latest_request ? VERIFICATION_REQUEST_STATUS_LABELS[r.latest_request.status] : "not started"}`
        : `Optional · ${r.latest_request ? VERIFICATION_REQUEST_STATUS_LABELS[r.latest_request.status] : "not run"}`,
      status: r.required ? "Required" : "Optional",
      deep_link: `/customers/${customerId}`,
    })),
    sources: [
      {
        source_module: "verification",
        entity_type: "customer",
        entity_id: customerId,
        label: name,
        deep_link: `/customers/${customerId}`,
      },
    ],
    caveats: [
      "Optional unrun checks are not missing requirements — they are available if staff choose to run them.",
    ],
  };
}

/** "Which vehicles have no GPS device installed?" style — for verification,
 *  "Which customers have no verification history?" */
export function answerVerificationNoHistory(
  src: CopilotSources,
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer("verification_no_history", asOf, perms, "derived");
  const vs = verSrc(src);
  if (!vs) {
    return {
      ...base,
      answer_type: "fallback",
      summary: "Customer Verification is available in the full workspace.",
    };
  }
  const withHistory = new Set(
    vs.requests.map((r) => r.customer_id).filter(Boolean) as string[],
  );
  const noHistory = vs.customers.filter((c) => !withHistory.has(c.id));
  return {
    ...base,
    answer_type: "list",
    summary:
      noHistory.length === 0
        ? "All customers have at least one verification record."
        : `${noHistory.length} ${plural(
            noHistory.length,
            "customer",
          )} ${noHistory.length === 1 ? "has" : "have"} no verification history.`,
    facts: [
      {
        label: "Customers without verification history",
        value: noHistory.length,
      },
    ],
    items: noHistory.slice(0, 25).map((c) => ({
      id: c.id,
      title: `${c.first_name} ${c.last_name}`,
      deep_link: `/customers/${c.id}`,
    })),
    sources: noHistory.slice(0, 10).map((c) => ({
      source_module: "customers",
      entity_type: "customer",
      entity_id: c.id,
      label: `${c.first_name} ${c.last_name}`,
      deep_link: `/customers/${c.id}`,
    })),
    caveats: [
      "No verification history does NOT mean a requirement is missing — only required checks block.",
    ],
  };
}

/** Fallback for re-dispatch without a customer name. */
export function answerVerificationCustomerSummaryFallback(
  asOf: Date,
  perms: CopilotViewerPermissions,
): CopilotAnswer {
  const base = baseAnswer(
    "verification_customer_summary",
    asOf,
    perms,
    "derived",
  );
  return {
    ...base,
    answer_type: "fallback",
    summary:
      "Which customer would you like verification details for? Tell me a name.",
  };
}

/** Whether a verification type is required for a customer (used by tests). */
export function isVerificationRequiredForCustomer(
  src: CopilotSources,
  customerId: string,
  type: VerificationType,
  asOf: Date,
): boolean {
  const vs = verSrc(src);
  if (!vs) return false;
  const resolved = resolveVerificationRequirements({
    policies: vs.policies,
    requirements: vs.requirements,
    requests: vs.requests,
    overrides: vs.overrides,
    ctx: { customer_id: customerId },
    now: asOf,
  });
  const r = resolved.find((x) => x.verification_type === type);
  return r?.required ?? false;
}

/** Whether a verification type is enabled (not Off) for the company. */
export function isVerificationEnabled(
  src: CopilotSources,
  type: VerificationType,
): boolean {
  const vs = verSrc(src);
  if (!vs) return false;
  return companyModeForType(vs.policies, type) !== "off";
}
