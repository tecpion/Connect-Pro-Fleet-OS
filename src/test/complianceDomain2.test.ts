// Connect Pro Fleet — Build #26 compliance domain tests (part 2).
// Legacy-field fallback, policy materializer (single source of truth),
// sensitive-data masking, overrides, and null-safety. Pure functions only.

import { describe, it, expect } from "vitest";
import {
  maskDocumentNumber,
  safeDocumentNumber,
} from "@/lib/complianceSelectors";
import { evaluateRequirement, activeOverrideFor } from "@/lib/complianceStatus";
import { isSensitiveDoc, maskNumber } from "@/lib/complianceMutationHelpers";
import { policyRequirements } from "@/lib/compliancePolicyMaterializer";
import {
  legacyVehicleDocuments,
  legacyCustomerDocuments,
  mergeLegacyDocuments,
} from "@/lib/complianceLegacyFallback";
import { defaultCompliancePolicy } from "@/lib/companyPolicyDefaults";
import type {
  DocumentRecord,
  ComplianceRequirement,
  ComplianceOverride,
} from "@/lib/complianceTypes";
import { TENANT_ID } from "@/lib/store/ids";

const NOW = new Date("2026-09-02T12:00:00Z");
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number) => iso(new Date(NOW.getTime() + n * DAY));

function baseDoc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  const now = iso(NOW);
  return {
    id: "doc_x",
    tenant_id: TENANT_ID,
    document_type: "registration",
    entity_type: "vehicle",
    entity_id: "veh_x",
    entity_label: "Test Vehicle",
    document_number: null,
    issuer: null,
    state_jurisdiction: null,
    effective_date: null,
    expiration_date: null,
    status: "uploaded",
    verification_status: "not_reviewed",
    file_reference: "mem://docs/x.pdf",
    original_filename: "x.pdf",
    mime_type: "application/pdf",
    notes: null,
    source: "upload",
    uploaded_by: "stf_1",
    uploaded_at: now,
    reviewed_by: null,
    reviewed_at: null,
    rejected_reason: null,
    archived_at: null,
    supersedes_document_id: null,
    superseded_by_document_id: null,
    location_id: null,
    assigned_staff_id: null,
    created_by: "stf_1",
    created_at: now,
    updated_at: now,
    ...over,
  };
}

const req = (
  over: Partial<ComplianceRequirement> = {},
): ComplianceRequirement => ({
  id: "req_x",
  tenant_id: TENANT_ID,
  entity_type: "vehicle",
  document_type: "registration",
  required: true,
  blocks_operation_if_missing: true,
  blocks_operation_if_expired: true,
  requires_verification: true,
  warning_days: 30,
  active: true,
  source: "policy",
  applies_to: null,
  created_at: iso(NOW),
  updated_at: iso(NOW),
  ...over,
});

function legacyVehicle(over: Record<string, unknown> = {}) {
  return {
    id: "veh_l",
    vin: "VIN123",
    make: "Honda",
    model: "Civic",
    year: 2022,
    license_plate: "FL-LEG1",
    registration_expiry: null,
    insurance_expiry: null,
    insurance_policy_number: null,
    ...over,
  } as never;
}
function legacyCustomer(over: Record<string, unknown> = {}) {
  return {
    id: "cus_l",
    first_name: "Jane",
    last_name: "Roe",
    drivers_license_expiry: null,
    drivers_license_number: null,
    drivers_license_state: null,
    insurance_expiry: null,
    insurance_policy_number: null,
    insurance_company: null,
    ...over,
  } as never;
}

// 5. LEGACY FIELD FALLBACK ---------------------------------------------------

describe("Build #26 — legacy field fallback (no dual-truth drift)", () => {
  it("34. vehicle with only legacy registration participates in compliance", () => {
    const docs = legacyVehicleDocuments(
      legacyVehicle({ registration_expiry: daysFromNow(-10) }),
    );
    expect(docs.length).toBe(1);
    expect(docs[0].document_type).toBe("registration");
    expect(docs[0].status).toBe("missing");
    expect(docs[0].file_reference).toBeNull();
  });

  it("35. no fake uploaded DocumentRecord created (status=missing, file=null, source=migration)", () => {
    const docs = legacyVehicleDocuments(
      legacyVehicle({ registration_expiry: daysFromNow(30) }),
    );
    expect(docs[0].status).toBe("missing");
    expect(docs[0].file_reference).toBeNull();
    expect(docs[0].source).toBe("migration");
  });

  it("36. structured Registration overrides legacy expiration once present", () => {
    const virtual = legacyVehicleDocuments(
      legacyVehicle({ registration_expiry: daysFromNow(-10) }),
    );
    const real = baseDoc({
      id: "real",
      entity_id: "veh_l",
      verification_status: "verified",
      status: "verified",
      expiration_date: daysFromNow(120),
    });
    const merged = mergeLegacyDocuments([real], virtual);
    const forType = merged.filter(
      (d) => d.entity_id === "veh_l" && d.document_type === "registration",
    );
    expect(forType.length).toBe(1);
    expect(forType[0].id).toBe("real");
  });

  it("37. structured expired doc beats stale valid legacy field", () => {
    const virtual = legacyVehicleDocuments(
      legacyVehicle({ registration_expiry: daysFromNow(120) }),
    );
    const real = baseDoc({
      id: "real",
      entity_id: "veh_l",
      verification_status: "verified",
      status: "verified",
      expiration_date: daysFromNow(-10),
    });
    const merged = mergeLegacyDocuments([real], virtual);
    const ev = evaluateRequirement(
      req(),
      merged.filter((d) => d.entity_id === "veh_l"),
      [],
      NOW,
    );
    expect(ev.reason).toBe("expired");
    expect(ev.blocking).toBe(true);
  });

  it("38. structured valid doc beats stale expired legacy field", () => {
    const virtual = legacyVehicleDocuments(
      legacyVehicle({ registration_expiry: daysFromNow(-10) }),
    );
    const real = baseDoc({
      id: "real",
      entity_id: "veh_l",
      verification_status: "verified",
      status: "verified",
      expiration_date: daysFromNow(120),
    });
    const merged = mergeLegacyDocuments([real], virtual);
    const ev = evaluateRequirement(
      req(),
      merged.filter((d) => d.entity_id === "veh_l"),
      [],
      NOW,
    );
    expect(ev.satisfied).toBe(true);
  });

  it("39. legacy customer DL participates when only expiration known", () => {
    const docs = legacyCustomerDocuments(
      legacyCustomer({ drivers_license_expiry: daysFromNow(-5) }),
    );
    expect(docs.length).toBe(1);
    expect(docs[0].document_type).toBe("driver_license");
    expect(docs[0].status).toBe("missing");
  });

  it("40. mergeLegacyDocuments suppresses virtual when real exists for entity+type", () => {
    const virtual = legacyVehicleDocuments(
      legacyVehicle({
        registration_expiry: daysFromNow(30),
        insurance_expiry: daysFromNow(30),
      }),
    );
    const realReg = baseDoc({
      id: "real",
      entity_id: "veh_l",
      document_type: "registration",
      verification_status: "verified",
      status: "verified",
      expiration_date: daysFromNow(120),
    });
    const merged = mergeLegacyDocuments([realReg], virtual);
    const types = merged.filter((d) => d.entity_id === "veh_l");
    expect(
      types.some((d) => d.document_type === "registration" && d.id === "real"),
    ).toBe(true);
    expect(
      types.some(
        (d) => d.document_type === "insurance" && d.id.startsWith("virt_"),
      ),
    ).toBe(true);
  });
});

// POLICY MATERIALIZER --------------------------------------------------------

describe("Build #26 — policy materializer (single source of truth)", () => {
  it("41. default policy materializes registration+insurance+DL+agreement", () => {
    const types = policyRequirements(defaultCompliancePolicy(), TENANT_ID).map(
      (r) => r.document_type,
    );
    expect(types).toContain("registration");
    expect(types).toContain("insurance");
    expect(types).toContain("driver_license");
    expect(types).toContain("rental_agreement");
    expect(types).not.toContain("inspection");
    expect(types).not.toContain("insurance_proof");
  });

  it("42. all materialized requirements are source='policy' and active", () => {
    const reqs = policyRequirements(defaultCompliancePolicy(), TENANT_ID);
    expect(reqs.every((r) => r.source === "policy")).toBe(true);
    expect(reqs.every((r) => r.active)).toBe(true);
  });

  it("43. toggling policy flags adds/removes requirements", () => {
    expect(
      policyRequirements(
        { ...defaultCompliancePolicy(), require_vehicle_inspection: true },
        TENANT_ID,
      ).some((r) => r.document_type === "inspection"),
    ).toBe(true);
    expect(
      policyRequirements(
        { ...defaultCompliancePolicy(), require_vehicle_registration: false },
        TENANT_ID,
      ).some((r) => r.document_type === "registration"),
    ).toBe(false);
  });
});

// SENSITIVE DATA MASKING ------------------------------------------------------

describe("Build #26 — sensitive data masking", () => {
  it("44. maskDocumentNumber masks to •••• + last 4", () => {
    expect(maskDocumentNumber("D1234567")).toBe("••••4567");
    expect(maskDocumentNumber("AB12")).toBe("••••");
    expect(maskDocumentNumber(null)).toBeNull();
  });

  it("45. safeDocumentNumber masks when not permitted, shows when permitted", () => {
    const d = baseDoc({
      document_number: "D1234567",
      document_type: "driver_license",
    });
    expect(safeDocumentNumber(d, false)).toBe("••••4567");
    expect(safeDocumentNumber(d, true)).toBe("D1234567");
  });

  it("46. isSensitiveDoc flags DL/insurance/id/additional driver", () => {
    expect(isSensitiveDoc({ document_type: "driver_license" })).toBe(true);
    expect(isSensitiveDoc({ document_type: "insurance_proof" })).toBe(true);
    expect(isSensitiveDoc({ document_type: "id_document" })).toBe(true);
    expect(isSensitiveDoc({ document_type: "additional_driver" })).toBe(true);
    expect(isSensitiveDoc({ document_type: "registration" })).toBe(false);
  });

  it("47. maskNumber handles whitespace and short values", () => {
    expect(maskNumber("D 1234 5678")).toBe("••••5678");
    expect(maskNumber("AB")).toBe("••••");
    expect(maskNumber(null)).toBeNull();
    expect(maskNumber(undefined)).toBeNull();
  });
});

// OVERRIDES ------------------------------------------------------------------

describe("Build #26 — compliance overrides", () => {
  const mkOverride = (
    over: Partial<ComplianceOverride> = {},
  ): ComplianceOverride => ({
    id: "ov1",
    tenant_id: TENANT_ID,
    entity_type: "vehicle",
    entity_id: "veh_x",
    document_type: "registration",
    requirement_id: null,
    reason: "temp tag pending",
    created_by: "stf_1",
    created_at: iso(NOW),
    expires_at: null,
    active: true,
    ...over,
  });

  it("48. active override satisfies a blocking requirement (no block)", () => {
    const ev = evaluateRequirement(req(), [], [mkOverride()], NOW);
    expect(ev.overridden).toBe(true);
    expect(ev.satisfied).toBe(true);
    expect(ev.blocking).toBe(false);
  });

  it("49. expired override no longer satisfies", () => {
    const ev = evaluateRequirement(
      req(),
      [],
      [mkOverride({ expires_at: daysFromNow(-1) })],
      NOW,
    );
    expect(ev.overridden).toBe(false);
    expect(ev.blocking).toBe(true);
  });

  it("50. inactive override ignored", () => {
    const ev = evaluateRequirement(
      req(),
      [],
      [mkOverride({ active: false })],
      NOW,
    );
    expect(ev.overridden).toBe(false);
  });

  it("51. activeOverrideFor finds matching override", () => {
    const ov = mkOverride();
    expect(
      activeOverrideFor([ov], "vehicle", "veh_x", "registration", NOW)?.id,
    ).toBe("ov1");
    expect(
      activeOverrideFor([ov], "vehicle", "veh_other", "registration", NOW),
    ).toBeUndefined();
  });
});

// NULL SAFETY (domain) --------------------------------------------------------

describe("Build #26 — null safety (domain)", () => {
  it("53. missing issuer / document number safe", () => {
    const d = baseDoc({ issuer: null, document_number: null });
    expect(() => safeDocumentNumber(d, false)).not.toThrow();
  });

  it("54. malformed expiration does not crash selectors", () => {
    const d = baseDoc({ expiration_date: "not-a-date" });
    expect(() => safeDocumentNumber(d, false)).not.toThrow();
  });
});
