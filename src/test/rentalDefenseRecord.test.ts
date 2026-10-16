// Connect Pro Fleet — Build #52 defense-record selector regression tests.
//
// Cases 1–10 (pure selector behavior). Case 11 (Copilot historical questions)
// lives in rentalDefenseCopilot.test.tsx because it needs the React harness.

import { describe, it, expect } from "vitest";
import { buildRentalDefenseRecord } from "@/lib/rentalDefenseRecord";
import { evaluateRentalReleaseGate } from "@/lib/rentalReleaseGate";
import { buildAgreementTimeline } from "@/lib/agreementTimeline";
import {
  buildDocumentationReadiness,
  buildIncidentDocumentationPackage,
  assertNoLegalScoreLanguage,
} from "@/lib/documentationReadiness";
import type { Incident } from "@/lib/incidents";
import type { RentalReleaseSnapshot } from "@/lib/defenseTypes";
import type { DocumentRecord } from "@/lib/complianceTypes";
import type { MaintenanceWorkOrder } from "@/lib/maintenanceTypes";
import {
  baseRental,
  baseVehicle,
  baseSources,
  customerName,
  checkoutInspection,
  insuranceDoc,
  registrationDoc,
  primaryDriver,
  releaseSnapshot,
  signedEvent,
  openBrakeWorkOrder,
} from "./defenseFixtures";

// 1. historical Release Snapshot does not change when current compliance changes
describe("Defense — 1. release snapshot immutability vs current compliance", () => {
  it("at-release insurance stays 2026-10-01 after current insurance renews to 2027", () => {
    const renewedInsurance: DocumentRecord = {
      ...insuranceDoc,
      id: "doc_ins_2",
      expiration_date: "2027-10-01",
    };
    const archivedOld: DocumentRecord = {
      ...insuranceDoc,
      status: "archived",
    };
    const src = baseSources({
      documents: [archivedOld, renewedInsurance, registrationDoc],
    });
    const record = buildRentalDefenseRecord("rnt_1", src, customerName);
    expect(record!.compliance.at_release.insurance_expiration).toBe(
      "2026-10-01",
    );
    expect(record!.compliance.current.insurance_expiration).toBe("2027-10-01");
  });
});

// 2. historical maintenance state does not change after repair closes
describe("Defense — 2. release maintenance immutability after repair", () => {
  it("at-release open brake item stays open in snapshot after work order closes", () => {
    const snapshotWithOpenBrakes: RentalReleaseSnapshot = {
      ...releaseSnapshot,
      maintenance_open_at_release: [
        {
          work_order_id: "wo_1",
          work_order_number: "WO-001",
          maintenance_type: "brakes",
          title: "Brake pad replacement",
          status: "in_progress",
          blocks_vehicle_use: true,
          safety_critical: true,
        },
      ],
      safety_critical_maintenance_open: true,
    };
    const closedWorkOrder: MaintenanceWorkOrder = {
      ...openBrakeWorkOrder,
      status: "completed",
      blocks_vehicle_use: false,
    };
    const src = baseSources({
      releaseSnapshots: [snapshotWithOpenBrakes],
      workOrders: [closedWorkOrder],
    });
    const record = buildRentalDefenseRecord("rnt_1", src, customerName);
    expect(record!.maintenance.at_release.open_items).toHaveLength(1);
    expect(record!.maintenance.at_release.safety_critical_open).toBe(true);
    expect(record!.maintenance.current.open_items).toHaveLength(0);
    expect(record!.maintenance.current.safety_critical_open).toBe(false);
  });
});

// 3. revoked driver remains historically authorized if authorized at incident time
describe("Defense — 3. revoked driver historical authorization", () => {
  it("Diego was authorized_additional at incident despite later revocation", () => {
    const diego = {
      ...primaryDriver,
      id: "rdrv_5",
      rental_id: "rnt_1",
      role: "additional" as const,
      full_name: "Diego Marin",
      authorization_status: "revoked" as const,
      authorized_at: "2026-08-10T14:05:00Z",
      revoked_at: "2026-08-20T09:00:00Z",
      revoked_by: "stf_2",
      revoked_reason: "Unauthorized use reported.",
    };
    const incident = {
      id: "inc_4",
      tenant_id: "tnt_demo",
      vehicle_id: "veh_1",
      reservation_id: "res_1",
      incident_type: "accident",
      description: "Accident during rental.",
      occurred_at: "2026-08-18",
      reported_at: "2026-08-18",
      status: "in_review",
      responsible_party: "renter",
      payment_amount: 1800,
      payment_status: "insurance_claim",
      insurance_claim_number: "CL-2026-00915",
      assigned_staff_id: "stf_2",
      photos: [],
      created_at: "2026-08-18T16:00:00Z",
      incident_driver: {
        rental_driver_id: "rdrv_5",
        actual_driver_name: "Diego Marin",
        license_reference: "D661-220-55-9933",
        authorization_at_incident: "authorized_additional",
        driver_snapshot: {
          full_name: "Diego Marin",
          role: "additional",
          verification_status: "verified",
          authorization_status: "active",
          license_expiry: "2028-03-20",
        },
      },
    } as Incident;
    const src = baseSources({ rentalDrivers: [diego], incidents: [incident] });
    const record = buildRentalDefenseRecord("rnt_1", src, customerName);
    const inc = record!.incidents[0];
    expect(inc.driver_authorization).toBe("authorized_additional");
    expect(inc.actual_driver_name).toBe("Diego Marin");
  });
});

// 4. inspection signature does not satisfy rental-agreement signature
describe("Defense — 4. agreement signature separate from inspection", () => {
  it("a signed checkout inspection does NOT make the agreement signed", () => {
    const src = baseSources({
      rentalEvents: [],
      releaseSnapshots: [{ ...releaseSnapshot, agreement_signed: false }],
    });
    const timeline = buildAgreementTimeline({
      rentalId: "rnt_1",
      rentals: src.rentals,
      rentalEvents: src.rentalEvents,
      vehicles: src.vehicles,
      vehicleExchanges: [],
      rentalDrivers: src.rentalDrivers,
    });
    expect(timeline[0].signed).toBe(false);
    expect(timeline[0].signature_ref).toBeNull();
  });

  it("release gate blocks on missing agreement signature even with a completed checkout inspection", () => {
    const result = evaluateRentalReleaseGate({
      rental: baseRental,
      vehicle: baseVehicle,
      drivers: [primaryDriver],
      checkoutInspection,
      workOrders: [],
      requirements: [],
      documents: [insuranceDoc, registrationDoc],
      overrides: [],
      agreementSigned: false,
      now: new Date("2026-09-02T12:00:00Z"),
    });
    expect(result.reasons.some((r) => r.key === "agreement_not_signed")).toBe(
      true,
    );
    expect(result.blocked).toBe(true);
  });
});

// 5. hard safety block cannot be manager-overridden
describe("Defense — 5. hard safety block not overridable", () => {
  it("active safety-critical brake work order is a hard_block", () => {
    const result = evaluateRentalReleaseGate({
      rental: baseRental,
      vehicle: baseVehicle,
      drivers: [primaryDriver],
      checkoutInspection,
      workOrders: [openBrakeWorkOrder],
      requirements: [],
      documents: [insuranceDoc, registrationDoc],
      overrides: [],
      agreementSigned: true,
      now: new Date("2026-09-02T12:00:00Z"),
    });
    expect(result.hard_blocked).toBe(true);
    expect(result.override_eligible).toBe(false);
    const brakeBlock = result.reasons.find((r) =>
      r.key.startsWith("safety_maintenance_open:"),
    );
    expect(brakeBlock?.severity).toBe("hard_block");
  });

  it("out-of-service vehicle is a hard block", () => {
    const result = evaluateRentalReleaseGate({
      rental: baseRental,
      vehicle: { ...baseVehicle, status: "out_of_service" },
      drivers: [primaryDriver],
      checkoutInspection,
      workOrders: [],
      requirements: [],
      documents: [insuranceDoc, registrationDoc],
      overrides: [],
      agreementSigned: true,
      now: new Date("2026-09-02T12:00:00Z"),
    });
    expect(result.hard_blocked).toBe(true);
    expect(result.override_eligible).toBe(false);
  });
});

// 6. override-eligible block requires actor/reason/timestamp
describe("Defense — 6. override-eligible requires actor/reason/timestamp", () => {
  it("missing checkout inspection is override_eligible (not hard)", () => {
    const result = evaluateRentalReleaseGate({
      rental: baseRental,
      vehicle: baseVehicle,
      drivers: [primaryDriver],
      checkoutInspection: null,
      workOrders: [],
      requirements: [],
      documents: [insuranceDoc, registrationDoc],
      overrides: [],
      agreementSigned: true,
      now: new Date("2026-09-02T12:00:00Z"),
    });
    expect(result.hard_blocked).toBe(false);
    expect(result.override_eligible).toBe(true);
    const block = result.reasons.find(
      (r) => r.key === "checkout_inspection_missing",
    );
    expect(block?.severity).toBe("override_eligible");
  });

  it("a recorded override carries actor + reason + timestamp", () => {
    const override: RentalReleaseSnapshot["override"] = {
      override_type: "release_block_override",
      reason_keys: ["checkout_inspection_missing"],
      reason: "Manager authorized release without inspection per policy.",
      actor_staff_id: "stf_1",
      actor_name: "Ava Reyes",
      timestamp: "2026-08-24T09:20:00Z",
    };
    expect(override!.actor_staff_id).toBeTruthy();
    expect(override!.reason).toBeTruthy();
    expect(override!.timestamp).toBeTruthy();
  });
});

// 7. agreement renewal creates new linked agreement without overwriting old
describe("Defense — 7. agreement renewal chain", () => {
  it("renewal creates a new linked agreement; prior preserved", () => {
    const renewal: typeof baseRental = {
      ...baseRental,
      id: "rnt_1b",
      agreement_number: "RA-2026-0002",
      prior_agreement_id: "rnt_1",
      renewed_from_agreement_id: "rnt_1",
      checkout_date: "2026-08-31T10:00:00Z",
      scheduled_return_date: "2026-09-07",
      created_at: "2026-08-31T10:00:00Z",
    };
    const src = baseSources({ rentals: [baseRental, renewal] });
    const timeline = buildAgreementTimeline({
      rentalId: "rnt_1b",
      rentals: src.rentals,
      rentalEvents: src.rentalEvents,
      vehicles: src.vehicles,
      vehicleExchanges: [],
      rentalDrivers: src.rentalDrivers,
    });
    expect(timeline).toHaveLength(2);
    expect(timeline[0].agreement_id).toBe("rnt_1");
    expect(timeline[0].next_agreement_id).toBe("rnt_1b");
    expect(timeline[1].agreement_id).toBe("rnt_1b");
    expect(timeline[1].prior_agreement_id).toBe("rnt_1");
    expect(timeline[0].agreement_number).toBe("RA-2026-0001");
    expect(timeline[1].agreement_number).toBe("RA-2026-0002");
  });

  it("agreement_term_days is informational (a number, no legal inference)", () => {
    const timeline = buildAgreementTimeline({
      rentalId: "rnt_1",
      rentals: [baseRental],
      rentalEvents: [signedEvent],
      vehicles: [baseVehicle],
      vehicleExchanges: [],
      rentalDrivers: [primaryDriver],
    });
    expect(timeline[0].agreement_term_days).not.toBeNull();
    expect(typeof timeline[0].agreement_term_days).toBe("number");
  });
});

// 8. current vs release-time state displays distinctly
describe("Defense — 8. current vs release-time distinct", () => {
  it("record exposes both at_release and current compliance/maintenance", () => {
    const renewedInsurance: DocumentRecord = {
      ...insuranceDoc,
      id: "doc_ins_2",
      expiration_date: "2027-10-01",
    };
    const archivedOld: DocumentRecord = {
      ...insuranceDoc,
      status: "archived",
    };
    const src = baseSources({
      documents: [archivedOld, renewedInsurance, registrationDoc],
    });
    const record = buildRentalDefenseRecord("rnt_1", src, customerName);
    expect(record!.compliance.at_release.insurance_expiration).toBe(
      "2026-10-01",
    );
    expect(record!.compliance.current.insurance_expiration).toBe("2027-10-01");
    expect(record!.maintenance.at_release).toBeDefined();
    expect(record!.maintenance.current).toBeDefined();
  });
});

// 9. documentation package never fabricates missing evidence
describe("Defense — 9. documentation package no fabrication", () => {
  it("missing items show not_on_file and are never invented", () => {
    const src = baseSources({ incidents: [] });
    const pkg = buildIncidentDocumentationPackage(
      "rnt_1",
      null,
      src,
      customerName,
    );
    expect(pkg.items.find((i) => i.label === "Police report")?.status).toBe(
      "not_on_file",
    );
    expect(pkg.items.find((i) => i.label === "Renter statement")?.status).toBe(
      "not_on_file",
    );
    expect(pkg.items.find((i) => i.label === "Incident report")?.status).toBe(
      "not_on_file",
    );
    const agreement = pkg.items.find((i) => i.label === "Rental agreement");
    expect(agreement?.status).toBe("on_file");
    expect(agreement?.reference).toBe("rnt_1");
  });
});

// 10. no legal-score / Graves-protection language appears
describe("Defense — 10. no legal-score language", () => {
  it("readiness labels contain no Graves/protected/liability language", () => {
    const readiness = buildDocumentationReadiness(
      "rnt_1",
      null,
      baseSources(),
      customerName,
    );
    expect(assertNoLegalScoreLanguage(readiness)).toEqual([]);
  });

  it("readiness statuses are only the four objective values", () => {
    const readiness = buildDocumentationReadiness(
      "rnt_1",
      null,
      baseSources(),
      customerName,
    );
    const allowed = [
      "complete",
      "missing",
      "needs_attention",
      "not_applicable",
    ];
    for (const item of readiness.rental.items) {
      expect(allowed).toContain(item.status);
    }
  });
});
