// Connect Pro Fleet — Build #17 damage claim domain + selector + permission tests.

import { describe, it, expect } from "vitest";
import type {
  DamageClaim,
  DamageEvidence,
  DamageInsuranceClaim,
  DamageRecovery,
} from "@/lib/damageClaimTypes";
import {
  nextDamageClaimNumber,
  isClaimActive,
  isClaimBlocking,
  vehicleHasBlockingClaim,
  getVehicleDamageHistory,
  getOpenDamageClaims,
  getClaimsAwaitingResponsibility,
  getClaimEvidence,
  getAllClaimEvidence,
  getInsuranceClaim,
  getClaimRecoveries,
  getClaimEvents,
  getClaimAge,
  getClaimActualCost,
  getDamageClaimEconomics,
} from "@/lib/damageClaimSelectors";
import { TENANT_ID } from "@/lib/store/ids";
import type { FinancialTransaction } from "@/lib/chargeTypes";
import type { ExpenseTransaction } from "@/lib/expenseTypes";

const baseClaim = (over: Partial<DamageClaim> = {}): DamageClaim => ({
  id: "dmg_1",
  tenant_id: TENANT_ID,
  claim_number: "DMG-2026-000001",
  vehicle_id: "veh_1",
  rental_id: "rnt_1",
  reservation_id: "res_1",
  customer_id: "cus_1",
  inspection_id: null,
  incident_id: null,
  claim_status: "open",
  damage_source: "checkin_inspection",
  discovered_at: "2026-08-28T10:00:00Z",
  discovered_by_user_id: "stf_1",
  damage_date: "2026-08-28",
  location_id: null,
  responsibility_status: "undetermined",
  responsible_party_type: null,
  customer_responsibility_percent: null,
  description: "Scratch on rear bumper",
  severity: "minor",
  blocks_vehicle_use: false,
  pre_existing: "undetermined",
  estimated_repair_cost: 180,
  approved_repair_cost: null,
  customer_charge_transaction_id: null,
  maintenance_work_order_id: null,
  insurance_claim_id: null,
  external_reference: null,
  assigned_user_id: null,
  closed_at: null,
  closed_by_user_id: null,
  closure_reason: null,
  created_at: "2026-08-28T10:30:00Z",
  updated_at: "2026-08-28T10:30:00Z",
  metadata: null,
  ...over,
});

describe("Build #17 — claim numbering + status", () => {
  it("nextDamageClaimNumber increments within the year", () => {
    expect(nextDamageClaimNumber([])).toMatch(/^DMG-\d{4}-000001$/);
    expect(
      nextDamageClaimNumber([baseClaim({ claim_number: "DMG-2026-000005" })]),
    ).toBe(`DMG-${new Date().getFullYear()}-000006`);
  });

  it("isClaimActive excludes terminal statuses", () => {
    expect(isClaimActive(baseClaim({ claim_status: "open" }))).toBe(true);
    expect(isClaimActive(baseClaim({ claim_status: "under_review" }))).toBe(
      true,
    );
    expect(isClaimActive(baseClaim({ claim_status: "resolved" }))).toBe(false);
    expect(isClaimActive(baseClaim({ claim_status: "closed" }))).toBe(false);
    expect(isClaimActive(baseClaim({ claim_status: "cancelled" }))).toBe(false);
  });

  it("isClaimBlocking requires active + blocks_vehicle_use", () => {
    expect(isClaimBlocking(baseClaim({ blocks_vehicle_use: true }))).toBe(true);
    expect(isClaimBlocking(baseClaim({ blocks_vehicle_use: false }))).toBe(
      false,
    );
    expect(
      isClaimBlocking(
        baseClaim({ blocks_vehicle_use: true, claim_status: "closed" }),
      ),
    ).toBe(false);
  });

  it("vehicleHasBlockingClaim detects any blocking active claim", () => {
    const claims = [
      baseClaim({ id: "d1", vehicle_id: "veh_1", blocks_vehicle_use: true }),
      baseClaim({ id: "d2", vehicle_id: "veh_1", blocks_vehicle_use: false }),
    ];
    expect(vehicleHasBlockingClaim(claims, "veh_1")).toBe(true);
    expect(vehicleHasBlockingClaim(claims, "veh_2")).toBe(false);
  });
});

describe("Build #17 — claim selectors", () => {
  it("getVehicleDamageHistory returns claims for a vehicle, newest first", () => {
    const claims = [
      baseClaim({ id: "d1", vehicle_id: "veh_1", discovered_at: "2026-08-01" }),
      baseClaim({ id: "d2", vehicle_id: "veh_1", discovered_at: "2026-08-28" }),
      baseClaim({ id: "d3", vehicle_id: "veh_2", discovered_at: "2026-08-15" }),
    ];
    const history = getVehicleDamageHistory(claims, "veh_1");
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe("d2");
  });

  it("getOpenDamageClaims returns only active claims", () => {
    const claims = [
      baseClaim({ id: "d1", claim_status: "open" }),
      baseClaim({ id: "d2", claim_status: "closed" }),
      baseClaim({ id: "d3", claim_status: "recovery_pending" }),
    ];
    expect(getOpenDamageClaims(claims)).toHaveLength(2);
  });

  it("getClaimsAwaitingResponsibility returns undetermined active claims", () => {
    const claims = [
      baseClaim({ id: "d1", responsibility_status: "undetermined" }),
      baseClaim({ id: "d2", responsibility_status: "customer" }),
      baseClaim({
        id: "d3",
        responsibility_status: "undetermined",
        claim_status: "closed",
      }),
    ];
    expect(getClaimsAwaitingResponsibility(claims)).toHaveLength(1);
  });

  it("getClaimEvidence excludes voided evidence", () => {
    const evidence: DamageEvidence[] = [
      {
        id: "e1",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        evidence_type: "photo",
        file_url: "x",
        inspection_photo_id: null,
        description: null,
        captured_at: null,
        uploaded_by_user_id: null,
        created_at: "2026-08-28",
        voided_at: null,
      },
      {
        id: "e2",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        evidence_type: "photo",
        file_url: "y",
        inspection_photo_id: null,
        description: null,
        captured_at: null,
        uploaded_by_user_id: null,
        created_at: "2026-08-28",
        voided_at: "2026-08-29",
      },
    ];
    expect(getClaimEvidence(evidence, "dmg_1")).toHaveLength(1);
    expect(getAllClaimEvidence(evidence, "dmg_1")).toHaveLength(2);
  });

  it("getInsuranceClaim returns the linked insurance claim", () => {
    const ins: DamageInsuranceClaim[] = [
      {
        id: "dic_1",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        insurer_name: "State Farm",
        policy_reference: null,
        claim_reference: "x",
        claim_status: "filed",
        deductible_amount: null,
        claimed_amount: null,
        approved_amount: null,
        paid_amount: null,
        filed_at: null,
        approved_at: null,
        paid_at: null,
        adjuster_name: null,
        adjuster_contact: null,
        notes: null,
        created_at: "2026-08-28",
        updated_at: "2026-08-28",
      },
    ];
    expect(getInsuranceClaim(ins, "dmg_1")?.insurer_name).toBe("State Farm");
    expect(getInsuranceClaim(ins, "dmg_2")).toBeNull();
  });

  it("getClaimRecoveries excludes reversed recoveries", () => {
    const recoveries: DamageRecovery[] = [
      {
        id: "r1",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        recovery_type: "insurance",
        amount: 500,
        date: "2026-08-29",
        source_reference: null,
        ledger_transaction_id: null,
        deposit_transaction_id: null,
        insurance_claim_id: null,
        notes: null,
        created_at: "2026-08-29",
        reversed_at: null,
      },
      {
        id: "r2",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        recovery_type: "insurance",
        amount: 200,
        date: "2026-08-30",
        source_reference: null,
        ledger_transaction_id: null,
        deposit_transaction_id: null,
        insurance_claim_id: null,
        notes: null,
        created_at: "2026-08-30",
        reversed_at: "2026-08-31",
      },
    ];
    expect(getClaimRecoveries(recoveries, "dmg_1")).toHaveLength(1);
  });

  it("getClaimAge derives days from discovered_at", () => {
    const claim = baseClaim({ discovered_at: "2026-08-01T00:00:00Z" });
    const now = new Date("2026-08-11T00:00:00Z");
    expect(getClaimAge(claim, now)).toBe(10);
  });
});

describe("Build #17 — claim economics (derived, no financial duplication)", () => {
  it("getClaimActualCost sums linked expenses (net of reversals)", () => {
    const claim = baseClaim({ id: "dmg_1" });
    const expenses: ExpenseTransaction[] = [
      {
        id: "exp_1",
        tenant_id: TENANT_ID,
        expense_number: "EXP-1",
        transaction_date: "2026-08-29",
        entered_at: "x",
        entered_by_user_id: null,
        description: "Body repair",
        memo: null,
        amount: 350,
        currency: "USD",
        expense_category_id: null,
        vendor_id: null,
        payment_method: "other",
        payment_source: null,
        processor: null,
        paid_by_type: "company",
        paid_by_user_id: null,
        reimbursement_status: "not_required",
        location_id: null,
        vehicle_id: "veh_1",
        rental_id: null,
        maintenance_work_order_id: null,
        receipt_status: "not_required",
        receipt_required: false,
        no_receipt_reason: null,
        status: "posted",
        reversal_of: null,
        source: "manual",
        dedupe_key: null,
        created_at: "x",
        updated_at: "x",
        metadata: { damage_claim_id: "dmg_1" },
      },
      {
        id: "exp_2",
        tenant_id: TENANT_ID,
        expense_number: "EXP-2",
        transaction_date: "2026-08-30",
        entered_at: "x",
        entered_by_user_id: null,
        description: "Reversal",
        memo: null,
        amount: 100,
        currency: "USD",
        expense_category_id: null,
        vendor_id: null,
        payment_method: "other",
        payment_source: null,
        processor: null,
        paid_by_type: "company",
        paid_by_user_id: null,
        reimbursement_status: "not_required",
        location_id: null,
        vehicle_id: "veh_1",
        rental_id: null,
        maintenance_work_order_id: null,
        receipt_status: "not_required",
        receipt_required: false,
        no_receipt_reason: null,
        status: "posted",
        reversal_of: "exp_1",
        source: "manual",
        dedupe_key: null,
        created_at: "x",
        updated_at: "x",
        metadata: { damage_claim_id: "dmg_1" },
      },
    ];
    expect(getClaimActualCost(claim, expenses)).toBe(250);
  });

  it("getClaimActualCost returns null when no linked expenses", () => {
    expect(getClaimActualCost(baseClaim(), [])).toBeNull();
  });

  it("getDamageClaimEconomics computes recovery + net loss", () => {
    const claim = baseClaim({
      customer_charge_transaction_id: "txn_1",
    });
    const transactions: FinancialTransaction[] = [
      {
        id: "txn_1",
        tenant_id: TENANT_ID,
        rental_id: "rnt_1",
        reservation_id: null,
        customer_id: "cus_1",
        vehicle_id: "veh_1",
        invoice_id: null,
        deposit_id: null,
        transaction_type: "damage_charge",
        category: "charge",
        description: "x",
        amount: 400,
        direction: "charge",
        payment_method: null,
        external_transaction_id: null,
        status: "posted",
        effective_date: "2026-08-29",
        created_at: "2026-08-29T10:00:00Z",
        created_by: null,
        notes: null,
        related_transaction_id: null,
        billing_period: null,
        metadata: { damage_claim_id: "dmg_1" },
      },
      {
        id: "txn_2",
        tenant_id: TENANT_ID,
        rental_id: "rnt_1",
        reservation_id: null,
        customer_id: "cus_1",
        vehicle_id: "veh_1",
        invoice_id: null,
        deposit_id: null,
        transaction_type: "cash_payment",
        category: "payment",
        description: "x",
        amount: 250,
        direction: "payment",
        payment_method: "cash",
        external_transaction_id: null,
        status: "posted",
        effective_date: "2026-08-30",
        created_at: "2026-08-30T10:00:00Z",
        created_by: null,
        notes: null,
        related_transaction_id: null,
        billing_period: null,
        metadata: null,
      },
    ];
    const recoveries: DamageRecovery[] = [
      {
        id: "r1",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        recovery_type: "security_deposit_application",
        amount: 100,
        date: "2026-08-30",
        source_reference: null,
        ledger_transaction_id: null,
        deposit_transaction_id: "dep_1",
        insurance_claim_id: null,
        notes: null,
        created_at: "x",
        reversed_at: null,
      },
    ];
    const eco = getDamageClaimEconomics(claim, {
      transactions,
      expenses: [],
      recoveries,
    });
    expect(eco.customer_charged).toBe(400);
    expect(eco.customer_paid).toBe(250);
    expect(eco.deposit_applied).toBe(100);
    expect(eco.total_recovered).toBe(350);
    // actual cost unknown → unrecovered/net loss null
    expect(eco.actual_cost).toBeNull();
    expect(eco.unrecovered_cost).toBeNull();
    expect(eco.company_net_loss).toBeNull();
    // outstanding = charge - paid - deposit applied = 400 - 250 - 100 = 50
    expect(eco.outstanding_customer_damage_balance).toBe(50);
  });

  it("getDamageClaimEconomics computes net loss when actual cost known", () => {
    const claim = baseClaim();
    const expenses: ExpenseTransaction[] = [
      {
        id: "exp_1",
        tenant_id: TENANT_ID,
        expense_number: "EXP-1",
        transaction_date: "2026-08-29",
        entered_at: "x",
        entered_by_user_id: null,
        description: "Repair",
        memo: null,
        amount: 500,
        currency: "USD",
        expense_category_id: null,
        vendor_id: null,
        payment_method: "other",
        payment_source: null,
        processor: null,
        paid_by_type: "company",
        paid_by_user_id: null,
        reimbursement_status: "not_required",
        location_id: null,
        vehicle_id: "veh_1",
        rental_id: null,
        maintenance_work_order_id: null,
        receipt_status: "not_required",
        receipt_required: false,
        no_receipt_reason: null,
        status: "posted",
        reversal_of: null,
        source: "manual",
        dedupe_key: null,
        created_at: "x",
        updated_at: "x",
        metadata: { damage_claim_id: "dmg_1" },
      },
    ];
    const recoveries: DamageRecovery[] = [
      {
        id: "r1",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        recovery_type: "insurance",
        amount: 300,
        date: "2026-08-30",
        source_reference: null,
        ledger_transaction_id: null,
        deposit_transaction_id: null,
        insurance_claim_id: null,
        notes: null,
        created_at: "x",
        reversed_at: null,
      },
    ];
    const eco = getDamageClaimEconomics(claim, {
      transactions: [],
      expenses,
      recoveries,
    });
    expect(eco.actual_cost).toBe(500);
    expect(eco.total_recovered).toBe(300);
    expect(eco.unrecovered_cost).toBe(200);
    expect(eco.company_net_loss).toBe(200);
  });

  it("net loss can be negative when recovery exceeds actual cost", () => {
    const claim = baseClaim();
    const expenses: ExpenseTransaction[] = [
      {
        id: "exp_1",
        tenant_id: TENANT_ID,
        expense_number: "EXP-1",
        transaction_date: "2026-08-29",
        entered_at: "x",
        entered_by_user_id: null,
        description: "Repair",
        memo: null,
        amount: 200,
        currency: "USD",
        expense_category_id: null,
        vendor_id: null,
        payment_method: "other",
        payment_source: null,
        processor: null,
        paid_by_type: "company",
        paid_by_user_id: null,
        reimbursement_status: "not_required",
        location_id: null,
        vehicle_id: "veh_1",
        rental_id: null,
        maintenance_work_order_id: null,
        receipt_status: "not_required",
        receipt_required: false,
        no_receipt_reason: null,
        status: "posted",
        reversal_of: null,
        source: "manual",
        dedupe_key: null,
        created_at: "x",
        updated_at: "x",
        metadata: { damage_claim_id: "dmg_1" },
      },
    ];
    const recoveries: DamageRecovery[] = [
      {
        id: "r1",
        tenant_id: TENANT_ID,
        damage_claim_id: "dmg_1",
        recovery_type: "insurance",
        amount: 300,
        date: "2026-08-30",
        source_reference: null,
        ledger_transaction_id: null,
        deposit_transaction_id: null,
        insurance_claim_id: null,
        notes: null,
        created_at: "x",
        reversed_at: null,
      },
    ];
    const eco = getDamageClaimEconomics(claim, {
      transactions: [],
      expenses,
      recoveries,
    });
    expect(eco.company_net_loss).toBe(-100);
  });
});
