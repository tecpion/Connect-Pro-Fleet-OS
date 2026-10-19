// Phase 5 E2E — ledger + deposit exclusion and expense + recovery checks.
// Extracted so the main E2E runner stays focused. Mirrors the Phase 4 split.
// Test-harness only — no product/domain logic changed.

import type { FinancialTransaction } from "@/lib/chargeTypes";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import type { DamageClaim, DamageRecovery } from "@/lib/damageClaimTypes";
import { buildRental } from "./phase4-e2e-builders";
import type { Phase5Step } from "./phase5-e2e.server";
import { step, requireOk, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface LedgerDepositResult {
  steps: Phase5Step[];
  beforeLedger: FinancialTransaction[];
  base: FinancialTransaction;
  payment: FinancialTransaction;
}

export async function runLedgerDeposit(
  runtime: Phase5Runtime,
): Promise<LedgerDepositResult> {
  const steps: Phase5Step[] = [];
  const { ledger, deposits, orgA, ctx, fixtures: f, claimId, stamp } = runtime;

  const base: FinancialTransaction = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    rental_id: ctx.rentalId,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    transaction_type: "rental_charge",
    category: "charge",
    description: "Phase5 rental",
    amount: 1000,
    direction: "charge",
    status: "posted",
    effective_date: f.date,
    created_at: f.now,
    created_by: null,
  };
  await ledger.insert(base);
  const payment = {
    ...base,
    id: crypto.randomUUID(),
    transaction_type: "ach_payment" as const,
    category: "payment" as const,
    direction: "payment" as const,
  };
  await ledger.insert(payment);
  const deposit = await deposits.insert({
    id: crypto.randomUUID(),
    tenant_id: orgA,
    rental_id: ctx.rentalId,
    reservation_id: null,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    policy_id: null,
    required_amount: 500,
    collected_amount: 500,
    applied_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0,
    status: "held",
    currency: "USD",
    source_snapshot: { source: "manual" },
    collected_at: f.now,
    refund_due_at: null,
    completed_at: null,
    notes: null,
    created_at: f.now,
    updated_at: f.now,
    created_by: null,
  });
  await ledger.insert({
    ...payment,
    id: crypto.randomUUID(),
    amount: 500,
    deposit_id: deposit.id,
    metadata: { deposit_kind: "collection" },
  });
  const beforeLedger = await ledger.listForRental(orgA, ctx.rentalId);
  await step(steps, "deposit_excluded_from_revenue", () => {
    const rental = getRentalSettlement(buildRental(ctx), beforeLedger, deposit);
    return (
      rental.totalCharges === 1000 &&
      rental.payments === 1000 &&
      rental.depositCollected === 500
    );
  });
  requireOk(
    await step(steps, "expense_persistence", async () => {
      await runtime.expenses.insertTransaction(f.expense);
      const rows = await runtime.expenses.listTransactions(orgA!);
      return (
        rows.length === 1 &&
        rows[0].id === f.expense.id &&
        rows[0].amount === 100
      );
    }),
  );
  await step(steps, "receipt_persistence", async () => {
    const path = `${orgA}/expenses/${f.expense.id}/receipt.pdf`;
    await runtime.expenses.insertReceipt({
      id: crypto.randomUUID(),
      tenant_id: orgA!,
      expense_id: f.expense.id,
      file_name: "receipt.pdf",
      file_url: path,
      mime_type: "application/pdf",
      uploaded_by: runtime.userAId,
      uploaded_at: f.now,
      note: null,
      voided_at: null,
    });
    return (await runtime.expenses.listReceipts(orgA!)).some(
      (r) => r.expense_id === f.expense.id && r.file_url === path,
    );
  });
  await step(steps, "reimbursement_persistence", async () => {
    await runtime.expenses.insertReimbursement({
      id: crypto.randomUUID(),
      tenant_id: orgA!,
      expense_id: f.expense.id,
      payee_type: "employee",
      payee_user_id: null,
      amount: 100,
      status: "paid",
      requested_at: f.now,
      approved_at: f.now,
      paid_at: f.now,
      payment_method: "bank_transfer",
      notes: null,
      created_at: f.now,
    });
    return (await runtime.expenses.listReimbursements(orgA!)).some(
      (r) => r.amount === 100 && r.status === "paid",
    );
  });
  await step(steps, "recovery_reduces_loss_without_revenue", async () => {
    const claim = await runtime.a
      .from("damage_claims")
      .insert({
        id: claimId,
        organization_id: orgA!,
        claim_number: `E2E5-${stamp}`,
        vehicle_id: ctx.vehId,
        rental_id: ctx.rentalId,
        customer_id: ctx.custId,
        damage_source: "manual",
        description: "Phase5 repair recovery",
        estimated_repair_cost: 100,
      })
      .select()
      .single();
    if (claim.error) throw claim.error;
    const recovery = await runtime.a
      .from("damage_recoveries")
      .insert({
        id: crypto.randomUUID(),
        organization_id: orgA!,
        damage_claim_id: claimId,
        recovery_type: "insurance",
        amount: 40,
        date: f.date,
      })
      .select()
      .single();
    if (recovery.error) throw recovery.error;
    const economics = getDamageClaimEconomics(
      {
        ...claim.data,
        tenant_id: orgA,
        customer_charge_transaction_id: null,
      } as DamageClaim,
      {
        transactions: await ledger.listForRental(orgA!, ctx.rentalId),
        expenses: await runtime.expenses.listTransactions(orgA!),
        recoveries: [{ ...recovery.data, tenant_id: orgA } as DamageRecovery],
      },
    );
    return (
      economics.total_recovered === 40 &&
      economics.actual_cost === 100 &&
      economics.company_net_loss === 60 &&
      JSON.stringify(await ledger.listForRental(orgA!, ctx.rentalId)) ===
        JSON.stringify(beforeLedger)
    );
  });
  return { steps, beforeLedger, base, payment };
}
