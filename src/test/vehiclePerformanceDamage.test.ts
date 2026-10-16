// Vehicle Performance — Damage, violations, JV economics.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import { txn, expense, vehicle, inputs } from "./profitabilityFixtures";
import { claim, recovery, violation } from "./vehiclePerformanceFixtures";

const NOW = new Date("2026-08-20");
const RANGE = resolvePerformanceRange("this_month", NOW);

/** A damage charge transaction linked to the claim's customer_charge_transaction_id. */
function damageCharge(amount = 1000) {
  return txn({
    id: "tx_dmg",
    transaction_type: "damage_charge",
    category: "charge",
    amount,
    effective_date: "2026-08-15",
    created_at: "2026-08-15T12:00:00Z",
  });
}

/** A customer payment toward the rental (allocated to the damage charge via FIFO). */
function damagePayment(amount: number) {
  return txn({
    transaction_type: "card_payment",
    category: "payment",
    amount,
    effective_date: "2026-08-16",
    created_at: "2026-08-16T00:00:00Z",
  });
}

function perfInputs(
  over: Partial<VehiclePerformanceInputs> = {},
): VehiclePerformanceInputs {
  return {
    ...inputs(),
    deposits: [],
    damageClaims: [],
    damageRecoveries: [],
    violations: [],
    workOrders: [],
    ...over,
  };
}

describe("VP — Damage economics", () => {
  it("damage cost from linked expenses", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        damageClaims: [claim({ estimated_repair_cost: 1000 })],
        expenses: [
          expense({
            amount: 1000,
            vehicle_id: "veh_1",
            metadata: { damage_claim_id: "dmg_1" },
          }),
        ],
      }),
      RANGE,
    );
    expect(p.damage.repairCost).toBe(1000);
  });

  it("renter damage recovery", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        damageClaims: [claim({ customer_charge_transaction_id: "tx_dmg" })],
        transactions: [damageCharge(1000), damagePayment(600)],
        damageRecoveries: [
          recovery({ recovery_type: "customer_payment", amount: 600 }),
        ],
        expenses: [
          expense({
            amount: 1000,
            vehicle_id: "veh_1",
            metadata: { damage_claim_id: "dmg_1" },
          }),
        ],
      }),
      RANGE,
    );
    expect(p.damage.renterRecovery).toBe(600);
  });

  it("insurance damage recovery", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        damageClaims: [claim()],
        damageRecoveries: [
          recovery({ recovery_type: "insurance", amount: 250 }),
        ],
        expenses: [
          expense({
            amount: 1000,
            vehicle_id: "veh_1",
            metadata: { damage_claim_id: "dmg_1" },
          }),
        ],
      }),
      RANGE,
    );
    expect(p.damage.insuranceRecovery).toBe(250);
  });

  it("net damage impact = cost - total recovery", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        damageClaims: [claim({ customer_charge_transaction_id: "tx_dmg" })],
        transactions: [damageCharge(1000), damagePayment(600)],
        damageRecoveries: [
          recovery({
            id: "r1",
            recovery_type: "customer_payment",
            amount: 600,
          }),
          recovery({ id: "r2", recovery_type: "insurance", amount: 250 }),
        ],
        expenses: [
          expense({
            amount: 1000,
            vehicle_id: "veh_1",
            metadata: { damage_claim_id: "dmg_1" },
          }),
        ],
      }),
      RANGE,
    );
    expect(p.damage.totalRecovery).toBe(850);
    expect(p.damage.netCompanyImpact).toBe(150);
  });

  it("fully recovered damage has zero net impact", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        damageClaims: [claim({ customer_charge_transaction_id: "tx_dmg" })],
        transactions: [damageCharge(1000), damagePayment(1000)],
        damageRecoveries: [
          recovery({ recovery_type: "customer_payment", amount: 1000 }),
        ],
        expenses: [
          expense({
            amount: 1000,
            vehicle_id: "veh_1",
            metadata: { damage_claim_id: "dmg_1" },
          }),
        ],
      }),
      RANGE,
    );
    expect(p.damage.netCompanyImpact).toBe(0);
  });
});

describe("VP — Violation economics", () => {
  it("company-paid violation with no recovery = net impact", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        violations: [
          violation({
            total_amount: 125,
            company_payment_status: "paid",
            customer_charge_status: "not_charged",
            responsibility: "company",
            customer_charge_transaction_id: null,
          }),
        ],
        expenses: [
          expense({ id: "exp_vio", amount: 125, vehicle_id: "veh_1" }),
        ],
      }),
      RANGE,
    );
    expect(p.violations.companyPaid).toBe(125);
    expect(p.violations.netCompanyImpact).toBe(125);
  });

  it("renter-paid violation has zero net impact", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        violations: [
          violation({
            total_amount: 125,
            company_payment_status: "paid",
            customer_charge_status: "charged",
            responsibility: "customer",
            customer_charge_transaction_id: "tx_vio",
          }),
        ],
        expenses: [
          expense({ id: "exp_vio", amount: 125, vehicle_id: "veh_1" }),
        ],
        transactions: [
          txn({
            transaction_type: "card_payment",
            category: "payment",
            amount: 125,
            effective_date: "2026-08-16",
          }),
        ],
      }),
      RANGE,
    );
    expect(p.violations.recovered).toBe(125);
    expect(p.violations.netCompanyImpact).toBe(0);
  });
});

describe("VP — Vehicle vs Company economics & JV", () => {
  it("vehicle economics = operating contribution before JV split", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 16000,
            effective_date: "2026-08-15",
          }),
        ],
      }),
      RANGE,
    );
    expect(p.operatingContribution).toBe(16000);
  });

  it("company economics subtracts JV payout", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 16000,
            effective_date: "2026-08-15",
          }),
        ],
        vehicles: [vehicle({ id: "veh_1", ownership_type: "external_owner" })],
        investorVehicles: [
          {
            id: "iv_1",
            tenant_id: "tnt_test",
            investor_id: "inv_1",
            vehicle_id: "veh_1",
            ownership_type: "owned",
            revenue_split_investor_pct: 60,
            revenue_split_operator_pct: 40,
            agreement_id: null,
            active: true,
            effective_date: "2026-01-01",
          },
        ],
      }),
      RANGE,
    );
    expect(p.hasInvestor).toBe(true);
    expect(p.investorPayout).toBeGreaterThan(0);
    expect(p.companyNetContribution).toBe(
      p.operatingContribution - (p.investorPayout ?? 0),
    );
  });

  it("JV payout is NOT an operating expense", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 16000,
            effective_date: "2026-08-15",
          }),
        ],
        vehicles: [vehicle({ id: "veh_1", ownership_type: "external_owner" })],
        investorVehicles: [
          {
            id: "iv_1",
            tenant_id: "tnt_test",
            investor_id: "inv_1",
            vehicle_id: "veh_1",
            ownership_type: "owned",
            revenue_split_investor_pct: 60,
            revenue_split_operator_pct: 40,
            agreement_id: null,
            active: true,
            effective_date: "2026-01-01",
          },
        ],
      }),
      RANGE,
    );
    expect(p.operatingContribution).toBe(16000);
    expect(p.totalExpenses).toBe(0);
  });
});
