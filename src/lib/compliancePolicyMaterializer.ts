// Connect Pro Fleet — compliance policy → requirement materializer (Build #26).
// Company policy (CompliancePolicyConfig inside CompanyPolicies) is the SINGLE
// SOURCE OF TRUTH for which documents are required + the default warning window.
// This pure helper materializes that config into structured ComplianceRequirement
// records (source: "policy") so the compliance status evaluator can consume a
// uniform requirement list. Custom requirements (source: "custom") can be added
// on top without touching company policy.

import type {
  ComplianceRequirement,
  DocumentEntityType,
  DocumentType,
} from "./complianceTypes";
import { nowIso } from "./complianceMutationHelpers";

interface CompliancePolicyConfig {
  default_warning_days: number;
  require_signed_agreement_before_checkout: boolean;
  require_customer_dl: boolean;
  require_customer_insurance: boolean;
  require_vehicle_registration: boolean;
  require_vehicle_insurance: boolean;
  require_vehicle_inspection: boolean;
}

import type { CustomerVerificationMode } from "./companyPolicyTypes";

/** Build policy-derived requirements from the company CompliancePolicyConfig.
 *
 *  The `verificationMode` controls whether CUSTOMER identity/driver
 *  verification participates in compliance at all:
 *    - "off"      → customer driver_license + insurance_proof requirements are
 *                   NOT emitted, so verification never blocks or surfaces as a
 *                   compliance issue. Existing documents/records remain.
 *    - "basic"    → the requirements are emitted but marked non-blocking
 *                   (informational). Missing verification surfaces as a
 *                   compliance "attention" item, NOT a block, unless a custom
 *                   requirement with blocks_operation is active.
 *    - "required" → the requirements are emitted with their configured blocking
 *                   behaviour (gates readiness/checkout).
 *  Vehicle + rental requirements are unaffected by the customer verification
 *  mode. Compliance remains the single authoritative blocker engine. */
export function policyRequirements(
  cfg: CompliancePolicyConfig,
  tenantId: string,
  verificationMode: CustomerVerificationMode = "basic",
): ComplianceRequirement[] {
  const w = cfg.default_warning_days ?? 30;
  const now = nowIso();
  const make = (
    document_type: DocumentType,
    entity_type: DocumentEntityType,
    required: boolean,
    blocksMissing: boolean,
    blocksExpired: boolean,
    requiresVerification: boolean,
    blockBehavior: import("./complianceTypes").ComplianceBlockBehavior = entity_type ===
    "vehicle"
      ? "blocks_assignment"
      : entity_type === "customer"
        ? "blocks_checkout"
        : entity_type === "rental"
          ? "blocks_start"
          : "warning_only",
  ): ComplianceRequirement => ({
    id: `req_policy_${entity_type}_${document_type}`,
    tenant_id: tenantId,
    entity_type,
    document_type,
    required,
    blocks_operation_if_missing: required && blocksMissing,
    blocks_operation_if_expired: required && blocksExpired,
    requires_verification: requiresVerification,
    warning_days: w,
    active: true,
    block_behavior: blockBehavior,
    manager_override_allowed: true,
    source: "policy",
    applies_to: null,
    created_at: now,
    updated_at: now,
  });
  const out: ComplianceRequirement[] = [];
  if (cfg.require_vehicle_registration)
    out.push(make("registration", "vehicle", true, true, true, true));
  if (cfg.require_vehicle_insurance)
    out.push(make("insurance", "vehicle", true, true, true, true));
  if (cfg.require_vehicle_inspection)
    out.push(make("inspection", "vehicle", true, true, true, false));
  // Customer verification requirements participate only when verification is
  // enabled. Off → not emitted (verification never blocks). Basic → emitted
  // but non-blocking (informational). Required → configured blocking applies.
  if (verificationMode !== "off") {
    const basicNonBlocking = verificationMode === "basic";
    if (cfg.require_customer_dl)
      out.push(
        make(
          "driver_license",
          "customer",
          true,
          !basicNonBlocking,
          !basicNonBlocking,
          true,
        ),
      );
    if (cfg.require_customer_insurance)
      out.push(
        make(
          "insurance_proof",
          "customer",
          true,
          !basicNonBlocking,
          !basicNonBlocking,
          false,
        ),
      );
  }
  if (cfg.require_signed_agreement_before_checkout)
    out.push(make("rental_agreement", "rental", true, true, false, true));
  return out;
}
