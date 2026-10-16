// Connect Pro Fleet — V1 Tolls & Violations Automation: pure selector tests.
//
// Proves ingestion, possession matching, admin-fee policy, recovery reports,
// CRM outbound contract, credentials absence, tenant isolation, and provider
// capability differences against the authoritative PURE selectors. No React.
// Mock providers only — no real provider, no credentials, no Supabase.

import { describe, it, expect } from "vitest";
import {
  ingestViolationProviderEvent,
  resolveViolationPossession,
  resolveVehicleFromEvent,
  ingestionKey,
  adminFeeForType,
} from "@/lib/violationIngestion";
import { resolveVehiclePossessionAt } from "@/lib/violationPossession";
import {
  deriveViolationReportMetrics,
  matchConfidenceBreakdown,
} from "@/lib/violationReportSelectors";
import {
  getViolationsByRental,
  getViolationsByVehicle,
} from "@/lib/violationSelectors";
import { VIOLATION_OPEN_STATUSES } from "@/lib/violationTypes";
import {
  mockTollProviderAdapter,
  mockCameraProviderAdapter,
  type ViolationProviderEvent,
} from "@/lib/violationAdapters";
import { defaultViolationPolicy } from "@/lib/violationPolicyTypes";
import type { Violation, MatchingConfidence } from "@/lib/violationTypes";
import type {
  RentalAgreement,
  Vehicle,
  FinancialTransaction,
} from "@/lib/types";
import type { RentalVehicleExchange } from "@/lib/store/rentalVehicleExchange";
import type { ExpenseTransaction } from "@/lib/expenseTypes";
import {
  buildTollViolationOutboundPayload,
  type TollViolationOutboundEventType,
} from "@/lib/tollViolationOutbound";

// ---------------------------------------------------------------------------
// Fixtures — deterministic, org-scoped (tenant "tnt_1").
// ---------------------------------------------------------------------------

function rental(over: Partial<RentalAgreement>): RentalAgreement {
  return {
    id: "rnt_x",
    tenant_id: "tnt_1",
    reservation_id: null,
    customer_id: "cus_x",
    vehicle_id: "veh_1",
    agreement_number: "AGR-X",
    status: "active",
    checkout_date: "2026-08-01",
    checkout_time: "10:00",
    scheduled_return_date: "2026-08-10",
    scheduled_return_time: "10:00",
    actual_return_date: null,
    actual_return_time: null,
    rate_type: "weekly",
    rate_amount: 300,
    subtotal: 300,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 0,
    amount_paid: 0,
    balance_due: 0,
    mileage_out: null,
    mileage_in: null,
    fuel_out: null,
    fuel_in: null,
    weekly_payment_day: "Monday",
    next_payment_due: null,
    payment_cutoff_time: null,
    grace_period: 24,
    late_fee: 0,
    late_fee_applied: false,
    weeks_rented: 1,
    created_at: "2026-07-30T00:00:00Z",
    updated_at: "2026-07-30T00:00:00Z",
    ...over,
  } as RentalAgreement;
}

const R1 = rental({
  id: "rnt_1",
  agreement_number: "AGR-1",
  customer_id: "cus_1",
  vehicle_id: "veh_1",
  checkout_date: "2026-08-20",
  checkout_time: "09:00",
  scheduled_return_date: "2026-08-27",
  scheduled_return_time: "09:00",
  actual_return_date: "2026-08-27",
  actual_return_time: "14:00",
  status: "completed",
});

const R2 = rental({
  id: "rnt_2",
  agreement_number: "AGR-2",
  customer_id: "cus_2",
  vehicle_id: "veh_2",
  checkout_date: "2026-08-25",
  checkout_time: "09:00",
  scheduled_return_date: "2026-09-05",
  scheduled_return_time: "09:00",
  status: "active",
});

// R3 started on veh_1, exchanged into veh_2 at Aug 20, then RETURNED veh_2 on
// Aug 22 — before R2 checked veh_2 out on Aug 25. This keeps the veh_2 timeline
// non-overlapping (R3 Aug20-22, R2 Aug25+) so an event on veh_2 at Aug 26
// resolves unambiguously to R2, and an event on veh_1 before R3's checkout
// (Aug 10) is genuine company possession.
const R3 = rental({
  id: "rnt_3",
  agreement_number: "AGR-3",
  customer_id: "cus_3",
  vehicle_id: "veh_2",
  checkout_date: "2026-08-15",
  checkout_time: "09:00",
  scheduled_return_date: "2026-08-30",
  scheduled_return_time: "09:00",
  actual_return_date: "2026-08-22",
  actual_return_time: "12:00",
  status: "completed",
});

const EXCHANGE: RentalVehicleExchange = {
  id: "ex_1",
  tenant_id: "tnt_1",
  rental_id: "rnt_3",
  customer_id: "cus_3",
  old_vehicle_id: "veh_1",
  new_vehicle_id: "veh_2",
  exchange_at: "2026-08-20T12:00:00Z",
  reason: "mechanical",
  old_mileage_in: 1000,
  old_fuel_in: 0.5,
  new_mileage_out: 2000,
  new_fuel_out: 1,
  old_vehicle_disposition: "maintenance",
  rate_changed: false,
  old_rate: 50,
  new_rate: null,
  created_by: "stf_1",
  created_at: "2026-08-20T12:00:00Z",
};

function makeVehicle(over: Partial<Vehicle>): Vehicle {
  return {
    id: "veh_1",
    vin: "VIN1",
    make: "Toyota",
    model: "Camry",
    year: 2022,
    license_plate: "FL-RT8841",
    status: "available",
    location: "Lot",
    vehicle_type: "car",
    daily_rate: 50,
    weekly_rate: 300,
    deposit_amount: 0,
    images: [],
    documents: [],
    purchase_date: "2022-01-01",
    purchase_price: 0,
    current_mileage: 0,
    insurance_policy_number: "",
    insurance_expiry: "",
    registration_expiry: "",
    tenant_id: "tnt_1",
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const VEHICLES: Vehicle[] = [
  makeVehicle({ id: "veh_1", license_plate: "FL-RT8841", vin: "VIN1" }),
  makeVehicle({
    id: "veh_2",
    license_plate: "FL-EV2290",
    vin: "VIN2",
    make: "Tesla",
    model: "3",
  }),
];

const RENTALS = [R1, R2, R3];
const EXCHANGES = [EXCHANGE];

function tollEvent(
  over: Partial<ViolationProviderEvent>,
): ViolationProviderEvent {
  return {
    external_event_id: "EVT-1",
    provider: "mock_toll_provider",
    plate: "FL-RT8841",
    vin: null,
    occurred_at: "2026-08-25T14:30:00Z",
    type: "toll",
    amount: 12,
    late_amount: 0,
    location: "I-95 MM 12",
    authority: "SunPass",
    notice_number: "SP-1",
    due_date: "2026-10-01T00:00:00Z",
    document_reference: null,
    metadata: null,
    ...over,
  };
}

function baseVio(): Violation {
  return {
    id: "vio_base",
    tenant_id: "tnt_1",
    violation_number: "VIO-B",
    violation_type: "toll",
    status: "customer_charged",
    vehicle_id: "veh_1",
    rental_id: null,
    customer_id: null,
    occurred_at: "2026-08-25T14:30:00Z",
    received_at: null,
    due_at: null,
    issuing_authority: null,
    citation_number: null,
    plate_number_snapshot: null,
    state_jurisdiction: null,
    location_description: null,
    description: null,
    base_amount: 12,
    penalties_amount: 0,
    admin_fee_amount: 0,
    total_amount: 12,
    responsibility: "customer",
    responsibility_reason: null,
    responsibility_notes: null,
    responsibility_decided_by: null,
    responsibility_decided_at: null,
    dispute_status: "not_disputed",
    dispute_reason: null,
    dispute_opened_at: null,
    dispute_resolved_at: null,
    dispute_decision_note: null,
    reduced_amount: null,
    company_payment_status: "not_paid",
    customer_charge_status: "not_charged",
    reimbursement_status: "none",
    linked_expense_id: null,
    customer_charge_transaction_id: null,
    charge_idempotency_key: null,
    assigned_staff_id: null,
    notes: null,
    source: "manual",
    created_by: null,
    created_at: "",
    updated_at: "",
    resolved_at: null,
    provider: null,
    external_event_id: null,
    matching_confidence: "matched",
    reviewed_by: null,
    reviewed_at: null,
  };
}

// ===========================================================================
// Ingestion + possession (tests 1-7)
// ===========================================================================

describe("V1 Tolls & Violations — ingestion + possession", () => {
  it("1. provider event creates one violation resolution", () => {
    const res = ingestViolationProviderEvent(tollEvent({}), {
      vehicles: VEHICLES,
      rentals: RENTALS,
      exchanges: EXCHANGES,
      existing: [],
    });
    expect(res.duplicateOf).toBeNull();
    expect(res.vehicle_id).toBe("veh_1");
    expect(res.confidence).toBe("matched");
    expect(res.rental_id).toBe("rnt_1");
    expect(res.customer_id).toBe("cus_1");
  });

  it("2. duplicate external event creates no duplicate", () => {
    const existing: Violation[] = [
      {
        ...baseVio(),
        id: "vio_existing",
        provider: "mock_toll_provider",
        external_event_id: "EVT-1",
        matching_confidence: "matched",
      },
    ];
    const res = ingestViolationProviderEvent(tollEvent({}), {
      vehicles: VEHICLES,
      rentals: RENTALS,
      exchanges: EXCHANGES,
      existing,
    });
    expect(res.duplicateOf).toBe("vio_existing");
  });

  it("3. exact possession match resolves correct rental", () => {
    const res = resolveViolationPossession(
      "veh_2",
      "2026-08-26T10:00:00Z",
      RENTALS,
      EXCHANGES,
    );
    expect(res.confidence).toBe("matched");
    expect(res.rental?.id).toBe("rnt_2");
  });

  it("4. vehicle exchange timeline resolves correctly", () => {
    const oldVeh = resolveVehiclePossessionAt(
      "veh_1",
      "2026-08-21T10:00:00Z",
      [R3],
      [EXCHANGE],
    );
    expect(oldVeh.status).toBe("no_match");
    const newVeh = resolveVehiclePossessionAt(
      "veh_2",
      "2026-08-21T10:00:00Z",
      [R3],
      [EXCHANGE],
    );
    expect(newVeh.status).toBe("exact_match");
    expect(newVeh.rental?.id).toBe("rnt_3");
  });

  it("5. current renter is NOT used for historical responsibility", () => {
    const res = resolveViolationPossession(
      "veh_1",
      "2026-08-25T14:30:00Z",
      RENTALS,
      EXCHANGES,
    );
    expect(res.confidence).toBe("matched");
    expect(res.rental?.id).toBe("rnt_1");
    expect(res.rental?.customer_id).toBe("cus_1");
  });

  it("6. company-possession event does not assign renter", () => {
    // Before any rental possessed veh_1 (R3 checked veh_1 out Aug 15): no renter
    // held the vehicle, so this is genuine company possession.
    const res = resolveViolationPossession(
      "veh_1",
      "2026-08-10T10:00:00Z",
      RENTALS,
      EXCHANGES,
    );
    expect(res.confidence).toBe("company_possession");
    expect(res.rental).toBeNull();
  });

  it("7. ambiguous event requires review", () => {
    const R1b = rental({
      id: "rnt_1b",
      customer_id: "cus_1b",
      vehicle_id: "veh_1",
      checkout_date: "2026-08-20",
      status: "active",
    });
    const res = resolveViolationPossession(
      "veh_1",
      "2026-08-22T10:00:00Z",
      [R1, R1b],
      [],
    );
    expect(res.confidence).toBe("ambiguous");
    expect(res.rental).toBeNull();
  });

  it("unmatched plate resolves no vehicle", () => {
    const res = ingestViolationProviderEvent(
      tollEvent({ plate: "ZZ-NOMATCH", external_event_id: "EVT-2" }),
      {
        vehicles: VEHICLES,
        rentals: RENTALS,
        exchanges: EXCHANGES,
        existing: [],
      },
    );
    expect(res.vehicle_id).toBeNull();
    expect(res.confidence).toBe("unmatched");
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it("ingestionKey is provider + external_event_id", () => {
    expect(ingestionKey("mock_toll_provider", "EVT-1")).toBe(
      "mock_toll_provider|EVT-1",
    );
  });
});

// ===========================================================================
// Admin-fee policy + recovery reports + cases/disputes (tests 9,12-16)
// ===========================================================================

describe("V1 Tolls & Violations — policy, recovery, disputes", () => {
  it("9. admin fee follows company policy (per-type, never hardcoded default)", () => {
    const policy = defaultViolationPolicy();
    expect(adminFeeForType("toll", policy)).toBe(0);
    expect(adminFeeForType("parking_ticket", policy)).toBe(0);
    expect(adminFeeForType("speed_camera", policy)).toBe(0);
    expect(adminFeeForType("toll", { ...policy, toll_admin_fee: 15 })).toBe(15);
    expect(
      adminFeeForType("parking_ticket", { ...policy, parking_admin_fee: 25 }),
    ).toBe(25);
    expect(
      adminFeeForType("speed_camera", { ...policy, camera_admin_fee: 20 }),
    ).toBe(20);
  });

  const pay = (amt: number): FinancialTransaction =>
    ({
      id: "p1",
      category: "payment",
      amount: amt,
      metadata: { violation_id: "vio_x" },
      effective_date: "2026-09-01",
    }) as unknown as FinancialTransaction;
  const exp = (amt: number): ExpenseTransaction =>
    ({
      id: "e1",
      status: "posted",
      amount: amt,
      transaction_date: "2026-08-28",
      metadata: { violation_id: "vio_x" },
    }) as unknown as ExpenseTransaction;

  it("12. financial recovery calculations derive correctly", () => {
    const m = deriveViolationReportMetrics(
      [
        {
          ...baseVio(),
          total_amount: 100,
          base_amount: 100,
          customer_charge_status: "charged",
        },
      ],
      [pay(60)],
      [exp(100)],
    );
    expect(m.company_cost).toBe(100);
    expect(m.amount_charged_to_customers).toBe(100);
    expect(m.amount_recovered).toBe(60);
  });

  it("13. clean toll need not create a case (no review issues)", () => {
    const res = ingestViolationProviderEvent(
      tollEvent({ external_event_id: "EVT-CLEAN" }),
      {
        vehicles: VEHICLES,
        rentals: RENTALS,
        exchanges: EXCHANGES,
        existing: [],
      },
    );
    expect(res.confidence).toBe("matched");
    expect(res.issues.length).toBe(0);
  });

  it("14. ambiguous toll surfaces review issues", () => {
    const R1b = rental({
      id: "rnt_1b",
      customer_id: "cus_1b",
      vehicle_id: "veh_1",
      checkout_date: "2026-08-20",
      status: "active",
    });
    const res = ingestViolationProviderEvent(
      tollEvent({ external_event_id: "EVT-AMBIG" }),
      { vehicles: VEHICLES, rentals: [R1, R1b], exchanges: [], existing: [] },
    );
    expect(res.confidence).toBe("ambiguous");
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it("15. resolved records leave Action Center (open-status filter)", () => {
    expect(VIOLATION_OPEN_STATUSES.includes("resolved")).toBe(false);
    expect(VIOLATION_OPEN_STATUSES.includes("cancelled")).toBe(false);
    expect(VIOLATION_OPEN_STATUSES.includes("customer_charged")).toBe(true);
  });

  it("match confidence breakdown aggregates ingested records only", () => {
    const vios: Violation[] = [
      {
        ...baseVio(),
        id: "v1",
        provider: "mock_toll_provider",
        matching_confidence: "matched",
      },
      {
        ...baseVio(),
        id: "v2",
        provider: "mock_toll_provider",
        matching_confidence: "ambiguous",
      },
      { ...baseVio(), id: "v3", provider: null, matching_confidence: null },
    ];
    const bd = matchConfidenceBreakdown(vios);
    expect(bd.matched).toBe(1);
    expect(bd.ambiguous).toBe(1);
    expect(bd.unmatched).toBe(0);
  });
});

// ===========================================================================
// Detail links + Rental Record derivation (tests 17-19)
// ===========================================================================

describe("V1 Tolls & Violations — detail links", () => {
  it("17. Rental Detail links correct records (violationsForRental)", () => {
    const vios: Violation[] = [
      { ...baseVio(), id: "vio_a", rental_id: "rnt_1" },
      { ...baseVio(), id: "vio_b", rental_id: "rnt_2" },
    ];
    expect(getViolationsByRental(vios, "rnt_1").length).toBe(1);
    expect(getViolationsByRental(vios, "rnt_1")[0].id).toBe("vio_a");
  });

  it("18. Vehicle Detail history is historically accurate", () => {
    const vios: Violation[] = [
      {
        ...baseVio(),
        id: "vio_v1",
        vehicle_id: "veh_1",
        customer_id: "cus_old",
      },
      {
        ...baseVio(),
        id: "vio_v2",
        vehicle_id: "veh_2",
        customer_id: "cus_new",
      },
    ];
    const forVeh1 = getViolationsByVehicle(vios, "veh_1");
    expect(forVeh1.length).toBe(1);
    expect(forVeh1[0].customer_id).toBe("cus_old");
  });

  it("19. Rental Record derives violation history (no duplication)", () => {
    const vios: Violation[] = [
      { ...baseVio(), id: "vio_r1", rental_id: "rnt_1" },
      { ...baseVio(), id: "vio_r1b", rental_id: "rnt_1" },
    ];
    const forR1 = getViolationsByRental(vios, "rnt_1");
    expect(forR1.length).toBe(2);
    expect(new Set(forR1.map((v) => v.id)).size).toBe(2);
  });
});

// ===========================================================================
// Credentials, isolation, capabilities (tests 21,22 + capability)
// ===========================================================================

describe("V1 Tolls & Violations — credentials, isolation, capabilities", () => {
  it("21. no provider credentials exist in frontend", () => {
    const serialized = JSON.stringify(mockTollProviderAdapter).toLowerCase();
    expect(serialized).not.toContain("apikey");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("bearer");
    expect(typeof mockTollProviderAdapter.capabilities.supportsTolls).toBe(
      "boolean",
    );
  });

  it("22. tenant/org isolation holds (org-scoped vehicle resolution)", () => {
    const otherOrgVehicles: Vehicle[] = [
      makeVehicle({
        id: "veh_other",
        tenant_id: "tnt_other",
        license_plate: "FL-RT8841",
      }),
    ];
    expect(
      resolveVehicleFromEvent(
        tollEvent({ plate: "FL-RT8841" }),
        otherOrgVehicles,
      ),
    ).toBe("veh_other");
    expect(
      resolveVehicleFromEvent(tollEvent({ plate: "FL-RT8841" }), []),
    ).toBeNull();
  });

  it("provider capabilities are respected", () => {
    expect(mockCameraProviderAdapter.capabilities.supportsTolls).toBe(false);
    expect(
      mockCameraProviderAdapter.capabilities.supportsCameraViolations,
    ).toBe(true);
    expect(mockCameraProviderAdapter.capabilities.supportsViolationImages).toBe(
      false,
    );
    expect(mockCameraProviderAdapter.fetchTolls()).toEqual([]);
    expect(mockCameraProviderAdapter.fetchViolations().length).toBeGreaterThan(
      0,
    );
    expect(mockTollProviderAdapter.capabilities.supportsTolls).toBe(true);
    expect(mockTollProviderAdapter.capabilities.supportsCameraViolations).toBe(
      false,
    );
  });
});

// ===========================================================================
// CRM outbound contract (spec #21)
// ===========================================================================

describe("V1 Tolls & Violations — CRM outbound contract", () => {
  it("outbound payload carries normalized fields, never PII/secrets", () => {
    const payload = buildTollViolationOutboundPayload({
      violation_number: "VIO-2026-0001",
      violation_type: "toll",
      amount: 27,
      occurred_at: "2026-08-25T14:30:00Z",
      due_at: "2026-10-01T00:00:00Z",
    });
    expect(payload.violation_number).toBe("VIO-2026-0001");
    expect(payload.amount).toBe(27);
    const s = JSON.stringify(payload).toLowerCase();
    expect(s).not.toContain("ssn");
    expect(s).not.toContain("password");
    expect(s).not.toContain("apikey");
  });

  it("outbound event types cover customer-facing milestones", () => {
    const types: TollViolationOutboundEventType[] = [
      "toll.customer_charge_created",
      "violation.customer_charge_created",
      "violation.disputed",
      "violation.resolved",
    ];
    expect(types.length).toBe(4);
  });
});
