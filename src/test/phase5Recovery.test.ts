import { it, expect } from "vitest";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import type { DamageClaim, DamageRecovery } from "@/lib/damageClaimTypes";
import { expense } from "./profitabilityFixtures";
it("Phase 5 insurance recovery reduces economic loss and never creates rental revenue", () => {
  const claim = {
    id: "claim",
    estimated_repair_cost: 100,
    customer_charge_transaction_id: null,
  } as DamageClaim;
  const recovery = {
    id: "recovery",
    damage_claim_id: "claim",
    recovery_type: "insurance",
    amount: 40,
    reversed_at: null,
  } as DamageRecovery;
  const expenses = [
    expense({ amount: 100, metadata: { damage_claim_id: "claim" } }),
  ];
  const economics = getDamageClaimEconomics(claim, {
    transactions: [],
    expenses,
    recoveries: [recovery],
  });
  expect(economics.actual_cost).toBe(100);
  expect(economics.total_recovered).toBe(40);
  expect(economics.company_net_loss).toBe(60);
  const reversed = getDamageClaimEconomics(claim, {
    transactions: [],
    expenses,
    recoveries: [{ ...recovery, reversed_at: "2026-08-15" }],
  });
  expect(reversed.total_recovered).toBe(0);
});
