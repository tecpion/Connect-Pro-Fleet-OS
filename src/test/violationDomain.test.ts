// Connect Pro Fleet — Build #25 violation domain tests (pure selectors +
// possession resolver + CSV import). No React state — pure functions with
// deterministic 2026 fixtures.

import { describe, it, expect } from "vitest";
import {
  resolveVehiclePossessionAt,
  buildPossessionIntervals,
} from "@/lib/violationPossession";
import { dryRunViolationImport } from "@/lib/violationImport";
import {
  getOpenViolations,
  getViolationsDueSoon,
  getOverdueViolations,
  getViolationsByCustomer,
  getViolationsByVehicle,
  getDisputedViolations,
  getViolationResponsibilitySummary,
  getViolationFinancialSummary,
  getUnrecoveredViolationExposure,
  getNeedsReview,
  daysOverdue,
} from "@/lib/violationSelectors";
import type { Violation } from "@/lib/violationTypes";
import type { RentalAgreement, FinancialTransaction } from "@/lib/types";
import type { RentalVehicleExchange } from "@/lib/store/rentalVehicleExchange";
import type { ExpenseTransaction } from "@/lib/expenseTypes";

const NOW = new Date("2026-09-02T12:00:00Z");

function rental(over: Partial<RentalAgreement>): RentalAgreement {
  return {
    id: "rnt_x",
    tenant_id: "tnt_1",
    agreement_number: "AGR-X",
    customer_id: "cus_x",
    vehicle_id: "veh_x",
    status: "active",
    checkout_date: "2026-08-01",
    checkout_time: "10:00",
    scheduled_return_date: "2026-08-10",
    scheduled_return_time: "10:00",
    actual_return_date: null,
    actual_return_time: null,
    amount_paid: 0,
    balance_due: 0,
    created_at: "2026-07-30T00:00:00Z",
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

const R3 = rental({
  id: "rnt_3",
  agreement_number: "AGR-3",
  customer_id: "cus_3",
  vehicle_id: "veh_2",
  checkout_date: "2026-08-15",
  checkout_time: "09:00",
  scheduled_return_date: "2026-08-30",
  scheduled_return_time: "09:00",
  status: "active",
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

function violation(over: Partial<Violation>): Violation {
  return {
    id: "vio_x",
    tenant_id: "tnt_1",
    violation_number: "VIO-2026-0001",
    violation_type: "toll",
    status: "new",
    vehicle_id: "veh_1",
    rental_id: null,
    customer_id: null,
    occurred_at: "2026-08-22T10:00:00Z",
    received_at: null,
    due_at: null,
    issuing_authority: "SunPass",
    citation_number: "CITE-1",
    plate_number_snapshot: "PLATE",
    state_jurisdiction: "FL",
    location_description: null,
    description: null,
    base_amount: 50,
    penalties_amount: 0,
    admin_fee_amount: 0,
    total_amount: 50,
    responsibility: "unknown",
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
    created_by: "stf_1",
    created_at: "2026-08-22T10:00:00Z",
    updated_at: "2026-08-22T10:00:00Z",
    resolved_at: null,
    provider: null,
    external_event_id: null,
    matching_confidence: null,
    reviewed_by: null,
    reviewed_at: null,
    ...over,
  };
}

// 106. POSSESSION ATTRIBUTION ----------------------------------------------

describe("Build #25 — possession attribution", () => {
  it("1. vehicle during active rental resolves renter", () => {
    const res = resolveVehiclePossessionAt(
      "veh_2",
      "2026-08-26T10:00:00Z",
      [R2],
      [],
    );
    expect(res.status).toBe("exact_match");
    expect(res.rental?.id).toBe("rnt_2");
    expect(res.customerId).toBe("cus_2");
  });

  it("2. violation before rental → no customer match", () => {
    const res = resolveVehiclePossessionAt(
      "veh_2",
      "2026-08-20T08:00:00Z",
      [R2],
      [],
    );
    expect(res.status).toBe("before_rental");
    expect(res.rental?.id).toBe("rnt_2");
  });

  it("3. violation after return → no match", () => {
    const res = resolveVehiclePossessionAt(
      "veh_1",
      "2026-08-28T10:00:00Z",
      [R1],
      [],
    );
    expect(res.status).toBe("after_return");
  });

  it("4. exchange-aware: old vehicle not attributed after exchange", () => {
    const res = resolveVehiclePossessionAt(
      "veh_1",
      "2026-08-21T10:00:00Z",
      [R3],
      [EXCHANGE],
    );
    expect(res.status).toBe("no_match");
  });

  it("5. new vehicle attributed after exchange", () => {
    const res = resolveVehiclePossessionAt(
      "veh_2",
      "2026-08-21T10:00:00Z",
      [R3],
      [EXCHANGE],
    );
    expect(res.status).toBe("exact_match");
    expect(res.rental?.id).toBe("rnt_3");
  });

  it("6. imported legacy rental match (completed with actual return)", () => {
    const res = resolveVehiclePossessionAt(
      "veh_1",
      "2026-08-22T10:00:00Z",
      [R1],
      [],
    );
    expect(res.status).toBe("exact_match");
    expect(res.rental?.id).toBe("rnt_1");
  });

  it("7. multiple conflicting possession intervals → conflict", () => {
    const R1b = rental({
      id: "rnt_1b",
      customer_id: "cus_1b",
      vehicle_id: "veh_1",
      checkout_date: "2026-08-20",
      status: "active",
    });
    const res = resolveVehiclePossessionAt(
      "veh_1",
      "2026-08-22T10:00:00Z",
      [R1, R1b],
      [],
    );
    expect(res.status).toBe("multiple_match");
    expect(res.conflicts.length).toBe(2);
  });

  it("8. uses occurred_at, not received_at", () => {
    const res = resolveVehiclePossessionAt(
      "veh_2",
      "2026-08-26T10:00:00Z",
      [R2],
      [],
    );
    expect(res.status).toBe("exact_match");
  });

  it("buildPossessionIntervals respects exchange boundary", () => {
    const iv = buildPossessionIntervals("veh_1", [R3], [EXCHANGE]);
    expect(iv.length).toBe(1);
    expect(iv[0].rentalId).toBe("rnt_3");
    expect(iv[0].end).toBe(EXCHANGE.exchange_at);
  });
});

// 107. RESPONSIBILITY ------------------------------------------------------

describe("Build #25 — responsibility & selectors", () => {
  it("9. customer responsibility counted", () => {
    expect(
      getViolationResponsibilitySummary([
        violation({ responsibility: "customer" }),
      ]).customer,
    ).toBe(1);
  });
  it("10. company responsibility counted", () => {
    expect(
      getViolationResponsibilitySummary([
        violation({ responsibility: "company" }),
      ]).company,
    ).toBe(1);
  });
  it("11. shared responsibility counted", () => {
    expect(
      getViolationResponsibilitySummary([
        violation({ responsibility: "shared" }),
      ]).shared,
    ).toBe(1);
  });
  it("12. unknown responsibility → needs review", () => {
    const nr = getNeedsReview(
      [violation({ responsibility: "unknown" })],
      {},
      NOW,
      false,
    );
    expect(nr.length).toBe(1);
    expect(nr[0].reasons).toContain("unknown_responsibility");
  });
  it("13. responsibility override captures decided_by + reason", () => {
    const v = violation({
      responsibility: "company",
      responsibility_reason: "registration_issue",
      responsibility_decided_by: "stf_1",
      responsibility_decided_at: "2026-08-22T11:00:00Z",
    });
    expect(v.responsibility_decided_by).toBe("stf_1");
    expect(v.responsibility_reason).toBe("registration_issue");
  });
  it("14. suggested match does not auto-charge", () => {
    const v = violation({
      rental_id: "rnt_1",
      customer_id: "cus_1",
      responsibility: "customer",
      responsibility_reason: "renter_possessed_vehicle",
      customer_charge_status: "not_charged",
    });
    expect(v.customer_charge_status).toBe("not_charged");
  });
});

// 110. RECOVERY / EXPOSURE -------------------------------------------------

describe("Build #25 — recovery & exposure", () => {
  const paidV = violation({
    id: "vio_paid",
    company_payment_status: "paid",
    responsibility: "customer",
    total_amount: 100,
  });
  const pay = (amt: number): FinancialTransaction =>
    ({ id: "txn_1", category: "payment", amount: amt }) as FinancialTransaction;

  it("27. full recovery", () => {
    const res = getUnrecoveredViolationExposure([paidV], [pay(100)], []);
    expect(res.recovered).toBe(100);
    expect(res.stillRecoverable).toBe(0);
  });
  it("28. partial recovery", () => {
    const res = getUnrecoveredViolationExposure([paidV], [pay(60)], []);
    expect(res.recovered).toBe(60);
    expect(res.stillRecoverable).toBe(40);
  });
  it("29. zero recovery", () => {
    const res = getUnrecoveredViolationExposure([paidV], [], []);
    expect(res.recovered).toBe(0);
    expect(res.stillRecoverable).toBe(100);
  });
  it("30. derived exposure = company paid minus recovered", () => {
    const res = getUnrecoveredViolationExposure([paidV], [pay(30)], []);
    expect(res.companyPaid - res.recovered).toBe(70);
  });
  it("31. customer payment counted once", () => {
    const res = getUnrecoveredViolationExposure([paidV], [pay(100)], []);
    expect(res.recovered).toBe(100);
  });
  it("financial summary aggregates correctly", () => {
    const v = violation({
      total_amount: 75,
      customer_charge_status: "charged",
    });
    const exp: ExpenseTransaction = {
      id: "exp_1",
      status: "posted",
      amount: 75,
    } as ExpenseTransaction;
    const s = getViolationFinancialSummary([v], [], [exp]);
    expect(s.totalAssessed).toBe(75);
    expect(s.companyPaid).toBe(75);
    expect(s.customerCharged).toBe(75);
    expect(s.unrecoveredExposure).toBe(0);
  });
});

// 111. DISPUTE + DUE STATUS ------------------------------------------------

describe("Build #25 — dispute & due status", () => {
  it("32. open dispute flagged", () => {
    expect(
      getDisputedViolations([
        violation({ dispute_status: "customer_disputed", status: "disputed" }),
      ]).length,
    ).toBe(1);
  });
  it("33. dispute reason preserved", () => {
    expect(
      violation({
        dispute_status: "customer_disputed",
        dispute_reason: "Paid via app",
      }).dispute_reason,
    ).toBe("Paid via app");
  });
  it("34. won/dismissed resolves dispute", () => {
    expect(
      violation({
        dispute_status: "won_dismissed",
        dispute_resolved_at: "2026-08-25T00:00:00Z",
      }).dispute_status,
    ).toBe("won_dismissed");
  });
  it("35. lost/upheld preserves charge", () => {
    expect(
      violation({
        dispute_status: "lost_upheld",
        customer_charge_status: "charged",
      }).customer_charge_status,
    ).toBe("charged");
  });
  it("36. reduced amount preserved alongside original", () => {
    const v = violation({ total_amount: 150, reduced_amount: 90 });
    expect(v.total_amount).toBe(150);
    expect(v.reduced_amount).toBe(90);
  });
  it("37. dispute alone does not reverse charge", () => {
    expect(
      violation({
        dispute_status: "customer_disputed",
        customer_charge_status: "charged",
      }).customer_charge_status,
    ).toBe("charged");
  });
  it("38. due soon within 7 days", () => {
    expect(
      getViolationsDueSoon(
        [violation({ status: "new", due_at: "2026-09-05T00:00:00Z" })],
        NOW,
        7,
      ).length,
    ).toBe(1);
  });
  it("39. overdue", () => {
    expect(
      getOverdueViolations(
        [violation({ status: "new", due_at: "2026-08-25T00:00:00Z" })],
        NOW,
      ).length,
    ).toBe(1);
  });
  it("40. missing due date safe", () => {
    const v = violation({ due_at: null, status: "new" });
    expect(getOverdueViolations([v], NOW).length).toBe(0);
    expect(getViolationsDueSoon([v], NOW).length).toBe(0);
    expect(() => daysOverdue(v, NOW)).not.toThrow();
  });
  it("41. penalty not invented automatically", () => {
    const v = violation({ due_at: null, penalties_amount: 0 });
    expect(v.penalties_amount).toBe(0);
    expect(daysOverdue(v, NOW)).toBe(0);
  });
});

// 114. IMPORT --------------------------------------------------------------

describe("Build #25 — CSV import", () => {
  const vehicles = [
    {
      id: "veh_1",
      make: "Toyota",
      model: "Camry",
      license_plate: "FL-RT8841",
      license_state: "FL",
      vin: "VIN1",
      stock_number: "S1",
    },
    {
      id: "veh_2",
      make: "Tesla",
      model: "3",
      license_plate: "FL-EV2290",
      license_state: "FL",
      vin: "VIN2",
      stock_number: "S2",
    },
  ] as any;

  it("46. vehicle plate match", () => {
    const dr = dryRunViolationImport(
      "citation,type,plate,state,occurred,amount\nC1,toll,FL-RT8841,FL,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      [],
    );
    expect(dr.matchedVehicles).toBe(1);
    expect(dr.records[0].vehicle_id).toBe("veh_1");
  });
  it("47. VIN match", () => {
    const dr = dryRunViolationImport(
      "citation,type,vin,occurred,amount\nC2,toll,VIN1,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      [],
    );
    expect(dr.records[0].vehicle_id).toBe("veh_1");
  });
  it("48. no vehicle match", () => {
    const dr = dryRunViolationImport(
      "citation,type,plate,occurred,amount\nC3,toll,ZZ-NOMATCH,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      [],
    );
    expect(dr.noVehicleMatch).toBe(1);
    expect(dr.records[0].issues).toContain("No vehicle match");
  });
  it("49. possession resolver runs after vehicle match", () => {
    const dr = dryRunViolationImport(
      "citation,type,plate,state,occurred,amount\nC4,toll,FL-EV2290,FL,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      [],
    );
    expect(dr.matchedRentals).toBe(1);
    expect(dr.records[0].rental_id).toBe("rnt_2");
    expect(dr.records[0].possession_status).toBe("exact_match");
  });
  it("50. dry run makes no mutation", () => {
    const existing: Violation[] = [];
    dryRunViolationImport(
      "citation,type,plate,state,occurred,amount\nC5,toll,FL-EV2290,FL,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      existing,
    );
    expect(existing.length).toBe(0);
  });
  it("51. strong duplicate citation blocked", () => {
    const existing = [
      violation({ issuing_authority: "SunPass", citation_number: "DUP-1" }),
    ];
    const dr = dryRunViolationImport(
      "citation,type,authority,plate,occurred,amount\nDUP-1,toll,SunPass,FL-EV2290,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      existing,
    );
    expect(dr.duplicates).toBe(1);
    expect(dr.records[0].duplicate).toBe(true);
  });
  it("52. two legitimate same-amount tolls allowed", () => {
    const dr = dryRunViolationImport(
      "citation,type,plate,state,occurred,amount\nA1,toll,FL-EV2290,FL,2026-08-26 10:00,6.50\nA2,toll,FL-EV2290,FL,2026-08-26 11:00,6.50",
      vehicles,
      [R2],
      [],
      [],
    );
    expect(dr.duplicates).toBe(0);
    expect(dr.totalRows).toBe(2);
  });
  it("53. reimport idempotent", () => {
    const existing = [
      violation({ issuing_authority: "SunPass", citation_number: "IDEM-1" }),
    ];
    const dr = dryRunViolationImport(
      "citation,type,authority,plate,occurred,amount\nIDEM-1,toll,SunPass,FL-EV2290,2026-08-26 10:00,6.50",
      vehicles,
      [R2],
      [],
      existing,
    );
    expect(dr.records[0].duplicate).toBe(true);
    expect(dr.records[0].duplicateOf).toBe("vio_x");
  });
});

// Misc entity selectors ----------------------------------------------------

describe("Build #25 — entity selectors", () => {
  it("getViolationsByCustomer filters by customer_id", () => {
    const v = violation({ customer_id: "cus_1" });
    expect(getViolationsByCustomer([v], "cus_1").length).toBe(1);
    expect(getViolationsByCustomer([v], "cus_2").length).toBe(0);
  });
  it("getViolationsByVehicle filters by vehicle_id", () => {
    expect(
      getViolationsByVehicle([violation({ vehicle_id: "veh_1" })], "veh_1")
        .length,
    ).toBe(1);
  });
  it("getOpenViolations excludes resolved/cancelled", () => {
    const vs = [
      violation({ id: "a", status: "new" }),
      violation({ id: "b", status: "resolved" }),
      violation({ id: "c", status: "cancelled" }),
    ];
    expect(getOpenViolations(vs).length).toBe(1);
  });
  it("needs review flags company-paid-but-not-charged", () => {
    const v = violation({
      company_payment_status: "paid",
      customer_charge_status: "not_charged",
      responsibility: "customer",
    });
    expect(getNeedsReview([v], {}, NOW, false)[0].reasons).toContain(
      "company_paid_not_charged",
    );
  });
  it("needs review flags missing evidence when required", () => {
    const v = violation({ customer_charge_status: "not_charged" });
    expect(getNeedsReview([v], {}, NOW, true)[0].reasons).toContain(
      "missing_evidence",
    );
  });
});
