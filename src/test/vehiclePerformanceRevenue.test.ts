// Vehicle Performance — Gross Revenue, Cash Collected, deposits.
import { describe, it, expect } from "vitest";
import {
  getVehiclePerformance,
  type VehiclePerformanceInputs,
} from "@/lib/vehiclePerformance";
import { resolvePerformanceRange } from "@/lib/vehiclePerformanceRanges";
import { TENANT, txn, inputs, vehicle } from "./profitabilityFixtures";
import { deposit } from "./vehiclePerformanceFixtures";

const NOW = new Date("2026-08-20");
const RANGE = resolvePerformanceRange("this_month", NOW);

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

describe("VP — Gross Revenue & Cash Collected", () => {
  it("calculates gross revenue from rental charges", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 1500,
            effective_date: "2026-08-15",
          }),
        ],
      }),
      RANGE,
    );
    expect(p.grossRevenueGenerated).toBe(1500);
  });

  it("calculates cash collected from payments", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 1500,
            effective_date: "2026-08-15",
          }),
          txn({
            transaction_type: "card_payment",
            category: "payment",
            amount: 1200,
            effective_date: "2026-08-16",
          }),
        ],
      }),
      RANGE,
    );
    expect(p.cashCollected).toBe(1200);
  });

  it("distinguishes gross revenue from cash collected", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 1500,
            effective_date: "2026-08-15",
          }),
          txn({
            transaction_type: "card_payment",
            category: "payment",
            amount: 1200,
            effective_date: "2026-08-16",
          }),
        ],
      }),
      RANGE,
    );
    expect(p.grossRevenueGenerated).toBe(1500);
    expect(p.cashCollected).toBe(1200);
    expect(p.outstanding).toBe(300);
  });

  it("excludes held deposits from revenue", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        transactions: [
          txn({
            transaction_type: "rental_charge",
            amount: 1000,
            effective_date: "2026-08-15",
          }),
          txn({
            transaction_type: "card_payment",
            category: "payment",
            amount: 300,
            effective_date: "2026-08-10",
            deposit_id: "dep_1",
            metadata: { deposit_kind: "collection" },
          }),
        ],
        deposits: [deposit({ collected_amount: 300 })],
      }),
      RANGE,
    );
    expect(p.grossRevenueGenerated).toBe(1000);
    expect(p.deposits.held).toBe(300);
  });

  it("tracks deposit applied (not new revenue)", () => {
    const p = getVehiclePerformance(
      "veh_1",
      perfInputs({
        deposits: [deposit({ collected_amount: 300, applied_amount: 150 })],
      }),
      RANGE,
    );
    expect(p.deposits.applied).toBe(150);
    expect(p.deposits.held).toBe(150);
  });

  it("tenant scoping — only matching vehicle records counted", () => {
    const inp = perfInputs({
      vehicles: [
        vehicle({ id: "veh_1", tenant_id: TENANT }),
        vehicle({ id: "veh_other", tenant_id: "tnt_other" }),
      ],
      transactions: [
        txn({
          transaction_type: "rental_charge",
          amount: 1000,
          effective_date: "2026-08-15",
        }),
      ],
    });
    expect(
      getVehiclePerformance("veh_1", inp, RANGE).grossRevenueGenerated,
    ).toBe(1000);
    expect(
      getVehiclePerformance("veh_other", inp, RANGE).grossRevenueGenerated,
    ).toBe(0);
  });
});
