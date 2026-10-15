// Connect Pro Fleet — Customer Profile document/verification status helpers.
//
// Derives the Driver's License and Insurance display states for the Customer
// Profile from AUTHORITATIVE data — the verification store (latest third-party
// verification request) and the customer record (document on file + expiry).
//
// Document collection and third-party verification are DISTINCT: an uploaded
// license/insurance document does NOT imply it has been verified. Presence of
// an insurance carrier name is NEVER treated as proof of valid insurance.
//
// Company policy is respected: when license/insurance verification is OFF the
// third-party status reads "Not Required" (it is not a gap). Insurance is
// optional — it is never implied to be globally required.

import type { Customer } from "./types";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationServicesPolicy,
  VerificationType,
  VerificationRequestStatus,
} from "./verificationTypes";
import { latestRequestFor, companyModeForType } from "./verificationSelectors";

export type LicenseDisplayStatus =
  | "verified"
  | "pending"
  | "needs_review"
  | "failed"
  | "expired"
  | "not_verified"
  | "not_required";

export type InsuranceDocumentStatus = "on_file" | "expired" | "missing";

export type InsuranceVerificationStatus =
  | "verified"
  | "pending"
  | "needs_review"
  | "failed"
  | "not_run"
  | "not_required";

export const LICENSE_STATUS_LABELS: Record<LicenseDisplayStatus, string> = {
  verified: "Verified",
  pending: "Pending",
  needs_review: "Needs Review",
  failed: "Failed",
  expired: "Expired",
  not_verified: "Not Verified",
  not_required: "Not Required",
};

export const INSURANCE_DOC_LABELS: Record<InsuranceDocumentStatus, string> = {
  on_file: "On File",
  expired: "Expired",
  missing: "Missing",
};

export const INSURANCE_VERIFICATION_LABELS: Record<
  InsuranceVerificationStatus,
  string
> = {
  verified: "Verified",
  pending: "Pending",
  needs_review: "Needs Review",
  failed: "Failed",
  not_run: "Not Run",
  not_required: "Not Required",
};

function licenseExpired(customer: Customer, now: Date): boolean {
  return (
    !!customer.drivers_license_expiry &&
    new Date(customer.drivers_license_expiry) <= now
  );
}

/** Derive the Driver's License display status for a customer. Reuses
 *  `latestRequestFor` so the same authority as the release gate decides. An
 *  expired license is NEVER "Verified" — it overrides any provider result. */
export function deriveLicenseDisplayStatus(input: {
  customer: Customer;
  requests: VerificationRequest[];
  requirements: VerificationRequirement[];
  overrides: VerificationOverride[];
  policies: VerificationServicesPolicy | null | undefined;
  now?: Date;
}): LicenseDisplayStatus {
  const now = input.now ?? new Date();
  const { customer, requests, policies } = input;

  // Expired license document always dominates — never render as Verified.
  if (licenseExpired(customer, now)) return "expired";

  const mode = companyModeForType(
    policies,
    "drivers_license" as VerificationType,
  );
  if (mode === "off") return "not_required";

  const latest = latestRequestFor(
    requests,
    "drivers_license" as VerificationType,
    { customer_id: customer.id },
    now,
  );
  if (!latest) return "not_verified";
  const status: VerificationRequestStatus = latest.status;
  if (status === "completed") {
    const rs = latest.result?.result_status;
    if (rs === "verified" || rs === "clear") return "verified";
    if (rs === "needs_review") return "needs_review";
    if (rs === "failed") return "failed";
    if (rs === "expired") return "expired";
    return "needs_review";
  }
  if (status === "pending") return "pending";
  if (status === "needs_review") return "needs_review";
  if (status === "failed" || status === "provider_error") return "failed";
  if (status === "expired") return "expired";
  return "not_verified";
}

/** Derive the Insurance DOCUMENT status from real fields. Presence of an
 *  insurance carrier name is NOT proof of validity — expiry is checked. */
export function deriveInsuranceDocumentStatus(
  customer: Customer,
  now?: Date,
): InsuranceDocumentStatus {
  const t = now ?? new Date();
  const hasDoc =
    !!customer.insurance_company || !!customer.insurance_document_url;
  if (!hasDoc) return "missing";
  if (customer.insurance_expiry && new Date(customer.insurance_expiry) <= t)
    return "expired";
  return "on_file";
}

/** Derive the Insurance third-party VERIFICATION status (distinct from the
 *  document status). Respects company policy — OFF means "Not Required". */
export function deriveInsuranceVerificationStatus(input: {
  customer: Customer;
  requests: VerificationRequest[];
  policies: VerificationServicesPolicy | null | undefined;
  now?: Date;
}): InsuranceVerificationStatus {
  const now = input.now ?? new Date();
  const mode = companyModeForType(
    input.policies,
    "insurance" as VerificationType,
  );
  if (mode === "off") return "not_required";
  const latest = latestRequestFor(
    input.requests,
    "insurance" as VerificationType,
    { customer_id: input.customer.id },
    now,
  );
  if (!latest) return "not_run";
  const status = latest.status;
  if (status === "completed") {
    const rs = latest.result?.result_status;
    if (rs === "verified" || rs === "clear") return "verified";
    if (rs === "needs_review") return "needs_review";
    if (rs === "failed") return "failed";
    return "needs_review";
  }
  if (status === "pending") return "pending";
  if (status === "needs_review") return "needs_review";
  if (status === "failed" || status === "provider_error") return "failed";
  if (status === "expired") return "not_run";
  return "not_run";
}
