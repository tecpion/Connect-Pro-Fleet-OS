// Phase 5 E2E — investor/JV creation, pairing history, settlement idempotency,
// and payout distribution. Extracted so the main E2E runner stays focused.
// Mirrors the Phase 4 split. Test-harness only — no product/domain logic changed.

import { RepositoryError } from "@/lib/supabase/repository";
import { calculateInvestorSettlement } from "@/lib/investorSettlementGeneration";
import type { Phase5Step } from "./phase5-e2e.server";
import { step, requireOk, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface InvestorResult {
  steps: Phase5Step[];
}

export async function runInvestorSettlement(
  runtime: Phase5Runtime,
): Promise<InvestorResult> {
  const steps: Phase5Step[] = [];
  const { investor, ledger, expenses, orgA, ctx, fixtures: f } = runtime;
  requireOk(
    await step(steps, "investor_creation_persists", async () => {
      await investor.insertInvestor(f.investor);
      return (await investor.listInvestors(orgA!)).some(
        (i) => i.id === f.investor.id,
      );
    }),
  );
  requireOk(
    await step(steps, "vehicle_pairing_persists", async () => {
      await investor.insertPairing(f.pairing);
      return (await investor.listPairings(orgA!)).some(
        (p) => p.id === f.pairing.id,
      );
    }),
  );
  await step(steps, "historical_pairing_terms", async () => {
    const next = {
      ...f.pairing,
      active: false,
      id: crypto.randomUUID(),
      effective_date: "2099-01-01",
      compensation: {
        ...f.pairing.compensation!,
        effective_date: "2099-01-01",
      },
    };
    await investor.insertPairing(next);
    const old = (await investor.listPairings(orgA!)).find(
      (p) => p.id === f.pairing.id,
    );
    return (
      old?.compensation?.type === "percentage" &&
      old.compensation.basis === "net" &&
      old.compensation.effective_date === f.date
    );
  });
  requireOk(
    await step(steps, "settlement_idempotency", async () => {
      const pairings = await investor.listPairings(orgA!);
      const pairing = pairings.find((p) => p.id === f.pairing.id)!;
      const generated = calculateInvestorSettlement({
        pairing,
        investorId: f.investor.id,
        vehicleId: ctx.vehId,
        periodStart: f.date,
        periodEnd: f.date,
        operatorFeePct: 0,
        transactions: await ledger.listForRental(orgA!, ctx.rentalId),
        operatingCosts: [],
        repairCosts: [
          {
            id: crypto.randomUUID(),
            tenant_id: orgA!,
            vehicle_id: ctx.vehId,
            description: "Phase5 persisted expense",
            amount: (await expenses.listTransactions(orgA!))[0].amount,
            incurred_date: f.date,
            responsibility: "operator_pays",
          },
        ],
      });
      Object.assign(f.settlement, generated);
      runtime.recordIds.settlement = generated.id;
      await investor.insertSettlement(f.settlement);
      try {
        await investor.insertSettlement({
          ...f.settlement,
          id: crypto.randomUUID(),
        });
      } catch (error) {
        if (!(error instanceof RepositoryError) || error.kind !== "conflict")
          throw error;
      }
      const rows = await investor.listSettlements(orgA!);
      return (
        rows.length === 1 &&
        rows[0].id === f.settlement.id &&
        rows[0].investor_payout_amount === 540
      );
    }),
  );
  await step(steps, "payout_distribution_persists", async () => {
    const paid = await investor.updateSettlementStatus(
      orgA!,
      f.settlement.id,
      "paid",
      f.now,
    );
    return (
      paid.payout_status === "paid" &&
      (await expenses.listTransactions(orgA!)).length === 1
    );
  });
  return { steps };
}
