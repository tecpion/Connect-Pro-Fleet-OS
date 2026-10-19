import { it, expect } from "vitest";
import {
  investorVehicleToRow,
  rowToInvestorVehicle,
} from "@/lib/supabase/phase5Mappers";
import { makePairing } from "./profitabilityFixtures";
import type { InvestorVehicleRow } from "@/lib/supabase/dbTypesIntegrations";
it.each(["percentage", "fixed", "custom"] as const)(
  "Phase 5 preserves historical %s compensation through Cloud mapping",
  (type) => {
    const common = {
      effective_date: "2026-01-01",
      end_date: "2026-06-30",
      notes: null,
    };
    const compensation =
      type === "percentage"
        ? {
            ...common,
            type,
            basis: "net" as const,
            investor_percentage: 60,
            operator_percentage: 40,
          }
        : type === "fixed"
          ? {
              ...common,
              type,
              fixed_amount: 300,
              fixed_frequency: "weekly" as const,
              guaranteed_when_not_rented: true,
              guaranteed_during_downtime: false,
            }
          : { ...common, type, description: "Historical negotiated terms" };
    const old = makePairing({ compensation, active: false });
    const row = investorVehicleToRow(old);
    const saved = rowToInvestorVehicle({
      ...row,
      created_at: "",
      updated_at: "",
    } as InvestorVehicleRow);
    expect(saved.compensation).toEqual(compensation);
    expect(saved.active).toBe(false);
    expect(old.compensation).toEqual(compensation);
  },
);

import { calculateInvestorSettlement } from "@/lib/investorSettlementGeneration";
import { txn } from "./profitabilityFixtures";
it("Phase 5 later pairing terms cannot rewrite an existing historical settlement", () => {
  const old = makePairing({
    tenant_id: "org-a",
    compensation: {
      type: "percentage",
      basis: "net",
      investor_percentage: 60,
      operator_percentage: 40,
      effective_date: "2026-01-01",
      end_date: "2026-08-31",
      notes: "original",
    },
  });
  const input = {
    pairing: old,
    investorId: old.investor_id,
    vehicleId: old.vehicle_id,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    operatorFeePct: 0,
    transactions: [txn({ vehicle_id: old.vehicle_id, amount: 1000 })],
    operatingCosts: [],
    repairCosts: [],
  };
  const historical = calculateInvestorSettlement(input);
  const row = investorVehicleToRow(old);
  const hydrated = rowToInvestorVehicle({
    ...row,
    created_at: "",
    updated_at: "",
  } as InvestorVehicleRow);
  const rerun = calculateInvestorSettlement({ ...input, pairing: hydrated });
  expect(historical.investor_payout_amount).toBe(600);
  expect(rerun.investor_payout_amount).toBe(600);
  expect(historical.tenant_id).toBe("org-a");
  expect(historical.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});
