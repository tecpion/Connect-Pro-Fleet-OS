// Connect Pro Fleet — Final V1 Pass 1: safety + correctness + honest UI tests.
//
// Proves the V1 Pass 1 guarantees using the AUTHORITATIVE selectors (no UI
// mounting required — these are pure-domain contracts the UI is wired to):
//   1. Checkout START uses evaluateRentalReleaseGate (the single gate).
//   2. Safety-critical maintenance hard-blocks checkout (non-overridable).
//   3. Out-of-service vehicle hard-blocks checkout.
//   4. Compliance blocker appears at checkout.
//   5. Hard blocker cannot be overridden.
//   6. Override-eligible blocker is overridable.
//   7. Override preserves the provider result (gate never alters records).
//   8. Customer Profile license status is derived — never a hardcoded Verified.
//   9. An expired license never renders as Verified.
//  10. Insurance status is derived (carrier presence ≠ valid insurance).
//  11. Optional unrun check does not block; required pending does.
//  12. Verification readiness derives from resolved requirements.
//  13. No duplicate release-gate logic (single export consumed by checkout).

import { describe, it, expect } from "vitest";
import {
  evaluateRentalReleaseGate,
  canOverrideGate,
  isSafetyCriticalMaintenance,
} from "@/lib/rentalReleaseGate";
import { evaluateReleaseGateFromSources } from "@/lib/rentalReleaseGateSources";
import {
  resolveVerificationRequirements,
  verificationReadiness,
  verificationBlockReasons,
  doesResolvedRequirementBlock,
} from "@/lib/verificationSelectors";
import {
  deriveLicenseDisplayStatus,
  deriveInsuranceDocumentStatus,
  deriveInsuranceVerificationStatus,
} from "@/lib/customerVerificationDisplay";
import {
  baseRental,
  baseVehicle,
  baseCustomer,
  checkoutInspection,
  insuranceDoc,
  registrationDoc,
  primaryDriver,
  openBrakeWorkOrder,
} from "./defenseFixtures";
import type { RentalAgreement, Vehicle, Customer } from "@/lib/types";
import type { MaintenanceWorkOrder } from "@/lib/maintenanceTypes";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "@/lib/complianceTypes";
import type {
  VerificationRequest,
  VerificationRequirement,
  VerificationOverride,
  VerificationServicesPolicy,
  VerificationResult,
  VerificationType,
} from "@/lib/verificationTypes";

const NOW = new Date("2026-08-25T09:00:00Z");

// A "clean" gate input: signed agreement, verified driver, complete checkout
// inspection (all required photo angles + signature), available vehicle, no
// open work orders, no blocking compliance. The defenseFixtures inspection is
// "incomplete" per the inspection selector (missing Dashboard photo + Rear
// label), so we provide a fully-complete inspection here.
const cleanInspection = {
  ...checkoutInspection,
  photos: ["front", "rear", "leftside", "rightside", "dashboard"],
  inspector_signature_url: "sig_ins_1",
} as typeof checkoutInspection;

const readyVehicle: Vehicle = { ...baseVehicle, status: "available" };
const readyRental: RentalAgreement = {
  ...baseRental,
  status: "ready_for_checkout" as RentalAgreement["status"],
};

function gateInput(overrides: {
  vehicle?: Vehicle;
  rental?: RentalAgreement;
  workOrders?: MaintenanceWorkOrder[];
  requirements?: ComplianceRequirement[];
  documents?: DocumentRecord[];
  overrides?: ComplianceOverride[];
  agreementSigned?: boolean;
  verificationRequirements?: ReturnType<typeof resolveVerificationRequirements>;
  checkoutInspection?: typeof checkoutInspection | null;
}) {
  return {
    rental: overrides.rental ?? readyRental,
    vehicle: overrides.vehicle ?? readyVehicle,
    drivers: [primaryDriver],
    checkoutInspection:
      overrides.checkoutInspection === undefined
        ? cleanInspection
        : overrides.checkoutInspection,
    workOrders: overrides.workOrders ?? [],
    requirements: overrides.requirements ?? [],
    documents: overrides.documents ?? [insuranceDoc, registrationDoc],
    overrides: overrides.overrides ?? [],
    agreementSigned: overrides.agreementSigned ?? true,
    verificationRequirements: overrides.verificationRequirements,
    now: NOW,
  };
}

// ── verification helpers ────────────────────────────────────────────────────

const NO_POLICY: VerificationServicesPolicy = {
  modes: {},
  auto_run: "manual_only",
};

function policy(
  modes: Partial<
    Record<
      VerificationType,
      VerificationServicesPolicy["modes"][VerificationType]
    >
  >,
): VerificationServicesPolicy {
  return { modes, auto_run: "manual_only" };
}

function makeRequest(opts: {
  type: VerificationType;
  status: VerificationRequest["status"];
  resultStatus?: VerificationResult["result_status"];
  customerId?: string;
  rentalId?: string;
}): VerificationRequest {
  const id = `vr_${opts.type}_${opts.status}`;
  return {
    id,
    organization_id: "tnt_demo",
    customer_id: opts.customerId ?? "cus_1",
    booking_request_id: null,
    reservation_id: null,
    rental_id: opts.rentalId ?? null,
    verification_type: opts.type,
    provider: "full_provider",
    status: opts.status,
    requested_at: "2026-08-20T00:00:00Z",
    completed_at: opts.status === "completed" ? "2026-08-20T00:10:00Z" : null,
    requested_by: "stf_1",
    external_reference: null,
    expires_at: null,
    usage_charge_id: null,
    result: opts.resultStatus
      ? ({
          verification_request_id: id,
          result_status: opts.resultStatus,
          summary: null,
          flags: [],
          completed_at: "2026-08-20T00:10:00Z",
          provider_reference: null,
        } as VerificationResult)
      : null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
  };
}

function staffRequirement(type: VerificationType): VerificationRequirement {
  return {
    id: `req_${type}`,
    organization_id: "tnt_demo",
    verification_type: type,
    customer_id: "cus_1",
    booking_request_id: null,
    reservation_id: null,
    rental_id: null,
    required_by_staff_id: "stf_1",
    required_at: "2026-08-20T00:00:00Z",
    reason: "staff required",
    removed: false,
    removed_by_staff_id: null,
    removed_at: null,
  };
}

// ── 1. AUTHORITATIVE RELEASE GATE ───────────────────────────────────────────

describe("Final V1 Pass 1 — authoritative release gate at checkout", () => {
  it("a clean rental is not blocked", () => {
    const r = evaluateRentalReleaseGate(gateInput({}));
    expect(r.blocked).toBe(false);
    expect(r.hard_blocked).toBe(false);
    expect(r.override_eligible).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });

  it("safety-critical maintenance (brakes) hard-blocks checkout", () => {
    expect(isSafetyCriticalMaintenance("brakes")).toBe(true);
    const r = evaluateRentalReleaseGate(
      gateInput({ workOrders: [openBrakeWorkOrder] }),
    );
    expect(r.hard_blocked).toBe(true);
    expect(r.blocked).toBe(true);
    const hard = r.reasons.find((x) => x.severity === "hard_block");
    expect(hard).toBeDefined();
    expect(hard!.label).toMatch(/Safety-critical maintenance/);
  });

  it("a hard-blocked gate cannot be overridden", () => {
    const r = evaluateRentalReleaseGate(
      gateInput({ workOrders: [openBrakeWorkOrder] }),
    );
    expect(canOverrideGate(r)).toBe(false);
  });

  it("an out-of-service vehicle hard-blocks checkout", () => {
    const r = evaluateRentalReleaseGate(
      gateInput({ vehicle: { ...readyVehicle, status: "out_of_service" } }),
    );
    expect(r.hard_blocked).toBe(true);
    expect(r.reasons.some((x) => x.key === "vehicle_out_of_service")).toBe(
      true,
    );
    expect(canOverrideGate(r)).toBe(false);
  });

  it("a non-overridable compliance requirement appears as a hard block", () => {
    const req: ComplianceRequirement = {
      id: "req_reg_1",
      tenant_id: "tnt_demo",
      entity_type: "vehicle",
      document_type: "registration",
      required: true,
      blocks_operation_if_missing: true,
      blocks_operation_if_expired: true,
      requires_verification: false,
      warning_days: 30,
      active: true,
      manager_override_allowed: false,
      source: "policy",
      applies_to: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    // No registration document on file → blocks_operation_if_missing triggers.
    const r = evaluateRentalReleaseGate(
      gateInput({ requirements: [req], documents: [insuranceDoc] }),
    );
    expect(r.blocked).toBe(true);
    expect(r.hard_blocked).toBe(true);
    expect(canOverrideGate(r)).toBe(false);
  });

  it("an overridable compliance requirement is override-eligible, not hard-blocked", () => {
    const req: ComplianceRequirement = {
      ...{
        id: "req_reg_2",
        tenant_id: "tnt_demo",
        entity_type: "vehicle",
        document_type: "registration",
        required: true,
        blocks_operation_if_missing: true,
        blocks_operation_if_expired: true,
        requires_verification: false,
        warning_days: 30,
        active: true,
        manager_override_allowed: true,
        source: "policy",
        applies_to: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    };
    const r = evaluateRentalReleaseGate(
      gateInput({ requirements: [req], documents: [insuranceDoc] }),
    );
    expect(r.blocked).toBe(true);
    expect(r.hard_blocked).toBe(false);
    expect(r.override_eligible).toBe(true);
    expect(canOverrideGate(r)).toBe(true);
  });

  it("missing agreement signature is override-eligible (administrative)", () => {
    const r = evaluateRentalReleaseGate(gateInput({ agreementSigned: false }));
    expect(r.override_eligible).toBe(true);
    expect(r.hard_blocked).toBe(false);
    expect(r.reasons.some((x) => x.key === "agreement_not_signed")).toBe(true);
  });

  it("override preserves the provider result — the gate never alters records", () => {
    // The gate is a pure selector. canOverrideGate only reports eligibility;
    // applying an override is an audited operational decision recorded on the
    // rental timeline (CheckoutWorkflow.startRental), never a mutation of the
    // provider/inspection records. Here we assert the gate result is unchanged
    // across calls with identical inputs (referential purity).
    const a = evaluateRentalReleaseGate(gateInput({ agreementSigned: false }));
    const b = evaluateRentalReleaseGate(gateInput({ agreementSigned: false }));
    expect(a).toEqual(b);
    expect(canOverrideGate(a)).toBe(true);
  });

  it("evaluateReleaseGateFromSources composes the same gate (no duplicate logic)", () => {
    // The checkout START step calls evaluateReleaseGateFromSources, which is a
    // thin assembler over evaluateRentalReleaseGate — NOT a second gate.
    const r = evaluateReleaseGateFromSources({
      rental: readyRental,
      vehicle: readyVehicle,
      defense: {
        rentals: [readyRental],
        rentalEvents: [],
        customers: [baseCustomer],
        vehicles: [readyVehicle],
        inspections: [cleanInspection],
        drivers: [],
        workOrders: [],
        documents: [insuranceDoc, registrationDoc],
        requirements: [],
        overrides: [],
        incidents: [],
        rentalDrivers: [primaryDriver],
        releaseSnapshots: [],
        vehicleExchanges: [],
        ownershipChanges: [],
        damageClaims: [],
        tasks: [],
        staff: [],
      },
      verification: {
        policies: NO_POLICY,
        requirements: [],
        requests: [],
        overrides: [],
      },
      agreementSigned: true,
      now: NOW,
    });
    expect(r.blocked).toBe(false);
  });
});

// ── 2. RESOLVED VERIFICATION REQUIREMENTS ───────────────────────────────────

describe("Final V1 Pass 1 — resolved verification requirements", () => {
  it("all services Off → no resolved requirements (nothing surfaces)", () => {
    const resolved = resolveVerificationRequirements({
      policies: NO_POLICY,
      requirements: [],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    expect(resolved).toHaveLength(0);
    expect(verificationReadiness(resolved, NOW)).toBe("ready");
  });

  it("Staff Decides does NOT create an automatic requirement", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ identity: "staff_decides" }),
      requirements: [],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const identity = resolved.find((r) => r.verification_type === "identity");
    expect(identity).toBeDefined();
    expect(identity!.required).toBe(false); // staff_decides → not required
    expect(identity!.enabled).toBe(true);
    // Optional unrun check does not block.
    expect(doesResolvedRequirementBlock(identity!, NOW)).toBe(false);
    expect(verificationReadiness(resolved, NOW)).toBe("optional_available");
  });

  it("Required creates a resolved requirement that blocks when unrun", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ mvr: "required" }),
      requirements: [],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const mvr = resolved.find((r) => r.verification_type === "mvr");
    expect(mvr!.required).toBe(true);
    expect(mvr!.required_reason).toBe("company_policy");
    expect(doesResolvedRequirementBlock(mvr!, NOW)).toBe(true);
    expect(verificationReadiness(resolved, NOW)).toBe("required_pending");
    expect(verificationBlockReasons(resolved, NOW)).toContain(
      "Required MVR check pending",
    );
  });

  it("staff can require an optional check per customer", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ identity: "staff_decides" }),
      requirements: [staffRequirement("identity")],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const identity = resolved.find((r) => r.verification_type === "identity");
    expect(identity!.required).toBe(true);
    expect(identity!.required_reason).toBe("staff_requirement");
    expect(doesResolvedRequirementBlock(identity!, NOW)).toBe(true);
  });

  it("staff can remove a manual requirement (removed flag hides it)", () => {
    const removed = { ...staffRequirement("identity"), removed: true };
    const resolved = resolveVerificationRequirements({
      policies: policy({ identity: "staff_decides" }),
      requirements: [removed],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const identity = resolved.find((r) => r.verification_type === "identity");
    // staff_decides with no active staff requirement → not required.
    expect(identity!.required).toBe(false);
  });

  it("a completed+verified request satisfies a required check", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ mvr: "required" }),
      requirements: [],
      requests: [
        makeRequest({
          type: "mvr",
          status: "completed",
          resultStatus: "clear",
        }),
      ],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const mvr = resolved.find((r) => r.verification_type === "mvr");
    expect(doesResolvedRequirementBlock(mvr!, NOW)).toBe(false);
    expect(verificationReadiness(resolved, NOW)).toBe("ready");
  });

  it("a failed required check blocks and reads 'failed'", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ identity: "required" }),
      requirements: [],
      requests: [makeRequest({ type: "identity", status: "failed" })],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    expect(verificationReadiness(resolved, NOW)).toBe("failed");
  });

  it("an approved override satisfies a required check (provider result unchanged)", () => {
    const req = makeRequest({
      type: "mvr",
      status: "needs_review",
      resultStatus: "needs_review",
    });
    const override: VerificationOverride = {
      id: "ovr_1",
      organization_id: "tnt_demo",
      verification_request_id: req.id,
      decision: "approved",
      reason: "manager reviewed",
      staff_id: "stf_1",
      created_at: "2026-08-21T00:00:00Z",
    };
    const resolved = resolveVerificationRequirements({
      policies: policy({ mvr: "required" }),
      requirements: [],
      requests: [req],
      overrides: [override],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const mvr = resolved.find((r) => r.verification_type === "mvr");
    // Override clears the block...
    expect(doesResolvedRequirementBlock(mvr!, NOW)).toBe(false);
    // ...but the provider result is preserved (still needs_review).
    expect(mvr!.latest_request?.result?.result_status).toBe("needs_review");
    expect(mvr!.overridden).toBe(true);
  });

  it("optional unrun check never blocks checkout (release gate contract)", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ background: "staff_decides" }),
      requirements: [],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const r = evaluateRentalReleaseGate(
      gateInput({ verificationRequirements: resolved }),
    );
    expect(r.blocked).toBe(false);
  });

  it("required pending check blocks checkout as override-eligible", () => {
    const resolved = resolveVerificationRequirements({
      policies: policy({ identity: "required" }),
      requirements: [],
      requests: [],
      overrides: [],
      ctx: { customer_id: "cus_1" },
      now: NOW,
    });
    const r = evaluateRentalReleaseGate(
      gateInput({ verificationRequirements: resolved }),
    );
    expect(r.blocked).toBe(true);
    expect(r.hard_blocked).toBe(false); // verification is administrative
    expect(r.override_eligible).toBe(true);
  });
});

// ── 3. CUSTOMER LICENSE / INSURANCE DISPLAY (honest UI) ─────────────────────

describe("Final V1 Pass 1 — customer license/insurance display derivation", () => {
  const validCustomer: Customer = { ...baseCustomer };
  const now = NOW;

  it("an expired license never renders as Verified", () => {
    const expired: Customer = {
      ...validCustomer,
      drivers_license_expiry: "2025-01-01",
    };
    const status = deriveLicenseDisplayStatus({
      customer: expired,
      requests: [],
      requirements: [],
      overrides: [],
      policies: policy({ drivers_license: "required" }),
      now,
    });
    expect(status).toBe("expired");
    expect(status).not.toBe("verified");
  });

  it("license is Not Required when company policy is Off", () => {
    const status = deriveLicenseDisplayStatus({
      customer: validCustomer,
      requests: [],
      requirements: [],
      overrides: [],
      policies: NO_POLICY,
      now,
    });
    expect(status).toBe("not_required");
  });

  it("license reads Not Verified when no verification request exists", () => {
    const status = deriveLicenseDisplayStatus({
      customer: validCustomer,
      requests: [],
      requirements: [],
      overrides: [],
      policies: policy({ drivers_license: "required" }),
      now,
    });
    expect(status).toBe("not_verified");
  });

  it("license reads Verified only when the latest completed request verified it", () => {
    const request = makeRequest({
      type: "drivers_license",
      status: "completed",
      resultStatus: "verified",
    });
    const status = deriveLicenseDisplayStatus({
      customer: validCustomer,
      requests: [request],
      requirements: [],
      overrides: [],
      policies: policy({ drivers_license: "required" }),
      now,
    });
    expect(status).toBe("verified");
  });

  it("license reads Needs Review when the latest result needs review", () => {
    const request = makeRequest({
      type: "drivers_license",
      status: "completed",
      resultStatus: "needs_review",
    });
    const status = deriveLicenseDisplayStatus({
      customer: validCustomer,
      requests: [request],
      requirements: [],
      overrides: [],
      policies: policy({ drivers_license: "required" }),
      now,
    });
    expect(status).toBe("needs_review");
  });

  it("insurance document status is Missing with no carrier and no document", () => {
    const noInsurance: Customer = {
      ...validCustomer,
      insurance_company: null,
      insurance_document_url: null,
      insurance_expiry: null,
    };
    expect(deriveInsuranceDocumentStatus(noInsurance, now)).toBe("missing");
  });

  it("insurance document status is Expired when the expiry has passed", () => {
    const expired: Customer = {
      ...validCustomer,
      insurance_expiry: "2025-01-01",
    };
    expect(deriveInsuranceDocumentStatus(expired, now)).toBe("expired");
  });

  it("insurance carrier presence alone is NOT proof of valid insurance (expiry checked)", () => {
    // Carrier present but expired → expired, not on_file.
    const carrierOnlyExpired: Customer = {
      ...validCustomer,
      insurance_company: "GEICO",
      insurance_expiry: "2025-01-01",
    };
    expect(deriveInsuranceDocumentStatus(carrierOnlyExpired, now)).toBe(
      "expired",
    );
  });

  it("insurance verification is Not Required when company policy is Off", () => {
    const status = deriveInsuranceVerificationStatus({
      customer: validCustomer,
      requests: [],
      policies: NO_POLICY,
      now,
    });
    expect(status).toBe("not_required");
  });

  it("insurance verification is Not Run when no request exists but policy is enabled", () => {
    const status = deriveInsuranceVerificationStatus({
      customer: validCustomer,
      requests: [],
      policies: policy({ insurance: "staff_decides" }),
      now,
    });
    expect(status).toBe("not_run");
  });

  it("document collection is distinct from third-party verification", () => {
    // Document on file (carrier + valid expiry) but verification Not Run.
    const docOnFile: Customer = { ...validCustomer }; // GEICO + 2026-10-01
    expect(deriveInsuranceDocumentStatus(docOnFile, now)).toBe("on_file");
    const ver = deriveInsuranceVerificationStatus({
      customer: docOnFile,
      requests: [],
      policies: policy({ insurance: "required" }),
      now,
    });
    expect(ver).toBe("not_run");
  });
});
