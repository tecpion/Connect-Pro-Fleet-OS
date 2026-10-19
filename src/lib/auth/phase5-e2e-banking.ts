// Phase 5 E2E — banking evidence persistence + reconciliation match invariants.
// Extracted so the main E2E runner stays focused. Mirrors the Phase 4 split.
// Test-harness only — no product/domain logic changed.

import { RepositoryError } from "@/lib/supabase/repository";
import type { FinancialTransaction } from "@/lib/chargeTypes";
import type { Phase5Step } from "./phase5-e2e.server";
import { step, requireOk, type Phase5Runtime } from "./phase5-e2e-runtime";

export interface BankingResult {
  steps: Phase5Step[];
}

export async function runBanking(
  runtime: Phase5Runtime,
  beforeLedger: FinancialTransaction[],
  paymentId: string,
): Promise<BankingResult> {
  const steps: Phase5Step[] = [];
  const {
    banking,
    expenses,
    ledger,
    orgA,
    ctx,
    fixtures: f,
    userAId,
  } = runtime;
  const credit = {
    ...f.bank,
    id: crypto.randomUUID(),
    direction: "money_in" as const,
    amount: 1000,
    external_transaction_id: crypto.randomUUID(),
    import_fingerprint: crypto.randomUUID(),
  };
  const unmatched = {
    ...f.bank,
    id: crypto.randomUUID(),
    external_transaction_id: crypto.randomUUID(),
    import_fingerprint: crypto.randomUUID(),
  };
  const transferEvidence = {
    ...f.bank,
    id: crypto.randomUUID(),
    amount: 50,
    external_transaction_id: crypto.randomUUID(),
    import_fingerprint: crypto.randomUUID(),
  };
  requireOk(
    await step(steps, "bank_evidence_persistence", async () => {
      for (const t of [f.bank, credit, unmatched, transferEvidence])
        await banking.insertImportedTransaction(t);
      return (await banking.listImportedTransactions(orgA!)).length === 4;
    }),
  );
  await step(steps, "duplicate_bank_import_idempotent", async () => {
    try {
      await banking.insertImportedTransaction({
        ...f.bank,
        id: crypto.randomUUID(),
      });
    } catch (error) {
      if (!(error instanceof RepositoryError) || error.kind !== "conflict")
        throw error;
    }
    const found = await banking.findByFingerprint(
      orgA!,
      f.bank.import_fingerprint,
    );
    return (
      found?.id === f.bank.id &&
      (await banking.listImportedTransactions(orgA!)).length === 4
    );
  });
  for (const [name, bank, target, targetType] of [
    ["bank_debit_no_duplicate_expense", f.bank, f.expense.id, "expense"],
    ["bank_credit_no_duplicate_payment", credit, paymentId, "customer_payment"],
  ] as const)
    await step(steps, name, async () => {
      await banking.insertMatch({
        id: crypto.randomUUID(),
        tenant_id: orgA!,
        imported_transaction_id: bank.id,
        target_type: targetType,
        target_id: target,
        allocated_amount: bank.amount,
        match_method: "manual",
        confidence: "high",
        created_by: userAId,
        created_at: f.now,
        voided_at: null,
        notes: null,
      });
      return (
        (await expenses.listTransactions(orgA!)).length === 1 &&
        JSON.stringify(await ledger.listForRental(orgA!, ctx.rentalId)) ===
          JSON.stringify(beforeLedger)
      );
    });
  await step(steps, "unmatched_bank_remains_unmatched", async () => {
    const t = (await banking.listImportedTransactions(orgA!)).find(
      (t) => t.id === unmatched.id,
    );
    return (
      t?.match_status === "unmatched" &&
      !(await banking.listMatches(orgA!)).some(
        (m) => m.imported_transaction_id === unmatched.id,
      )
    );
  });
  await step(steps, "transfer_persistence", async () => {
    const to = {
      ...f.account,
      id: crypto.randomUUID(),
      name: "Phase5 savings",
    };
    await banking.insertAccount(to);
    await banking.insertTransfer({
      id: crypto.randomUUID(),
      tenant_id: orgA!,
      from_account_id: f.account.id,
      to_account_id: to.id,
      amount: 50,
      date: f.date,
      imported_transaction_ids: [transferEvidence.id],
      notes: null,
      created_by: userAId,
      created_at: f.now,
    });
    return (await banking.listTransfers(orgA!)).length === 1;
  });
  return { steps };
}
