// Connect Pro Fleet — Phase 5 repository adapters for expenses + banking +
// investor/JV.
//
// Concrete repository implementations backed by the typed Supabase client.
// Each delegates to the row/domain mappers and normalizes errors. Used only
// when Supabase is configured; in memory mode the factory returns nulls.
//
// Architectural rule preserved: no component/page calls .from(table) directly.
// The store owns domain semantics; these adapters own durable read/write +
// mapping between DB rows and domain objects.

import type {
  ExpenseTransaction,
  ExpenseCategory,
  ExpenseLineItem,
  ExpenseReceipt,
  ExpenseReimbursement,
} from "../expenseTypes";
import type {
  FinancialAccount,
  ImportedTransaction,
  FinancialStatement,
  ImportBatch,
  ReconciliationMatch,
  AccountTransfer,
  ReconciliationEvent,
} from "../bankingTypes";
import type { Investor, InvestorVehicle, Settlement } from "../investorTypes";
import type { ExpenseReimbursementRow } from "./dbTypesFinancial";
import type { InvestorSettlementRow } from "./dbTypesIntegrations";
import type { getSupabase } from "./client";
import { normalizeError } from "./repository";
import {
  rowToExpenseTransaction,
  expenseTransactionToRow,
  expenseTransactionPatchToRow,
  rowToExpenseCategory,
  expenseCategoryToRow,
  rowToExpenseLineItem,
  expenseLineItemToRow,
  rowToExpenseReceipt,
  expenseReceiptToRow,
  rowToExpenseReimbursement,
  expenseReimbursementToRow,
  rowToFinancialAccount,
  financialAccountToRow,
  rowToImportedTransaction,
  importedTransactionToRow,
  rowToFinancialStatement,
  financialStatementToRow,
  rowToImportBatch,
  importBatchToRow,
  rowToReconciliationMatch,
  reconciliationMatchToRow,
  rowToAccountTransfer,
  accountTransferToRow,
  rowToReconciliationEvent,
  reconciliationEventToRow,
  rowToInvestor,
  investorToRow,
  rowToInvestorVehicle,
  investorVehicleToRow,
  rowToInvestorSettlement,
  investorSettlementToRow,
} from "./phase5Mappers";

type Db = NonNullable<ReturnType<typeof getSupabase>>;

// ── Expense Repository ─────────────────────────────────────────

export interface ExpenseRepository {
  listTransactions(orgId: string): Promise<ExpenseTransaction[]>;
  insertTransaction(e: ExpenseTransaction): Promise<ExpenseTransaction>;
  updateTransaction(
    orgId: string,
    id: string,
    patch: Partial<ExpenseTransaction>,
  ): Promise<ExpenseTransaction>;
  listCategories(orgId: string): Promise<ExpenseCategory[]>;
  insertCategory(c: ExpenseCategory): Promise<ExpenseCategory>;
  listLineItems(orgId: string, expenseId: string): Promise<ExpenseLineItem[]>;
  insertLineItem(li: ExpenseLineItem): Promise<ExpenseLineItem>;
  listReceipts(orgId: string): Promise<ExpenseReceipt[]>;
  insertReceipt(rc: ExpenseReceipt): Promise<ExpenseReceipt>;
  voidReceipt(orgId: string, id: string): Promise<void>;
  listReimbursements(orgId: string): Promise<ExpenseReimbursement[]>;
  insertReimbursement(rm: ExpenseReimbursement): Promise<ExpenseReimbursement>;
  updateReimbursement(
    orgId: string,
    id: string,
    patch: Partial<ExpenseReimbursement>,
  ): Promise<ExpenseReimbursement>;
}

export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private db: Db) {}

  async listTransactions(orgId: string): Promise<ExpenseTransaction[]> {
    const { data, error } = await this.db
      .from("expense_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .order("transaction_date", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToExpenseTransaction);
  }

  async insertTransaction(e: ExpenseTransaction): Promise<ExpenseTransaction> {
    const { data, error } = await this.db
      .from("expense_transactions")
      .insert(expenseTransactionToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseTransaction(data);
  }

  async updateTransaction(
    orgId: string,
    id: string,
    patch: Partial<ExpenseTransaction>,
  ): Promise<ExpenseTransaction> {
    const { data, error } = await this.db
      .from("expense_transactions")
      .update(expenseTransactionPatchToRow(patch))
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseTransaction(data);
  }

  async listCategories(orgId: string): Promise<ExpenseCategory[]> {
    const { data, error } = await this.db
      .from("expense_categories")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToExpenseCategory);
  }

  async insertCategory(c: ExpenseCategory): Promise<ExpenseCategory> {
    const { data, error } = await this.db
      .from("expense_categories")
      .insert(expenseCategoryToRow(c))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseCategory(data);
  }

  async listLineItems(
    orgId: string,
    expenseId: string,
  ): Promise<ExpenseLineItem[]> {
    const { data, error } = await this.db
      .from("expense_line_items")
      .select("*")
      .eq("organization_id", orgId)
      .eq("expense_id", expenseId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToExpenseLineItem);
  }

  async insertLineItem(li: ExpenseLineItem): Promise<ExpenseLineItem> {
    const { data, error } = await this.db
      .from("expense_line_items")
      .insert(expenseLineItemToRow(li))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseLineItem(data);
  }

  async listReceipts(orgId: string): Promise<ExpenseReceipt[]> {
    const { data, error } = await this.db
      .from("expense_receipts")
      .select("*")
      .eq("organization_id", orgId)
      .order("uploaded_at", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToExpenseReceipt);
  }

  async insertReceipt(rc: ExpenseReceipt): Promise<ExpenseReceipt> {
    const { data, error } = await this.db
      .from("expense_receipts")
      .insert(expenseReceiptToRow(rc))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseReceipt(data);
  }

  async voidReceipt(orgId: string, id: string): Promise<void> {
    const { error } = await this.db
      .from("expense_receipts")
      .update({ voided_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("id", id);
    if (error) throw normalizeError(error);
  }

  async listReimbursements(orgId: string): Promise<ExpenseReimbursement[]> {
    const { data, error } = await this.db
      .from("expense_reimbursements")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToExpenseReimbursement);
  }

  async insertReimbursement(
    rm: ExpenseReimbursement,
  ): Promise<ExpenseReimbursement> {
    const { data, error } = await this.db
      .from("expense_reimbursements")
      .insert(expenseReimbursementToRow(rm))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseReimbursement(data);
  }

  async updateReimbursement(
    orgId: string,
    id: string,
    patch: Partial<ExpenseReimbursement>,
  ): Promise<ExpenseReimbursement> {
    const updateRow: Partial<ExpenseReimbursementRow> = {};
    if (patch.status !== undefined)
      updateRow.status = patch.status as ExpenseReimbursementRow["status"];
    if (patch.approved_at !== undefined)
      updateRow.approved_at = patch.approved_at;
    if (patch.paid_at !== undefined) updateRow.paid_at = patch.paid_at;
    if (patch.payment_method !== undefined)
      updateRow.payment_method = patch.payment_method;
    if (patch.notes !== undefined) updateRow.notes = patch.notes;
    const { data, error } = await this.db
      .from("expense_reimbursements")
      .update(updateRow)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToExpenseReimbursement(data);
  }
}

// ── Banking Repository ─────────────────────────────────────────
// Bank transactions are EVIDENCE ONLY. These adapters persist and read
// evidence rows — they NEVER auto-create Payment/Expense/Charge/Deposit/
// Payout. Matching must be explicit via ReconciliationMatch.

export interface BankingRepository {
  listAccounts(orgId: string): Promise<FinancialAccount[]>;
  insertAccount(a: FinancialAccount): Promise<FinancialAccount>;
  listImportedTransactions(orgId: string): Promise<ImportedTransaction[]>;
  insertImportedTransaction(
    t: ImportedTransaction,
  ): Promise<ImportedTransaction>;
  findByExternalId(
    orgId: string,
    externalId: string,
  ): Promise<ImportedTransaction | null>;
  findByFingerprint(
    orgId: string,
    fingerprint: string,
  ): Promise<ImportedTransaction | null>;
  listStatements(orgId: string): Promise<FinancialStatement[]>;
  insertStatement(s: FinancialStatement): Promise<FinancialStatement>;
  listBatches(orgId: string): Promise<ImportBatch[]>;
  insertBatch(b: ImportBatch): Promise<ImportBatch>;
  listMatches(orgId: string): Promise<ReconciliationMatch[]>;
  insertMatch(m: ReconciliationMatch): Promise<ReconciliationMatch>;
  listTransfers(orgId: string): Promise<AccountTransfer[]>;
  insertTransfer(t: AccountTransfer): Promise<AccountTransfer>;
  listReconEvents(orgId: string): Promise<ReconciliationEvent[]>;
  insertReconEvent(e: ReconciliationEvent): Promise<ReconciliationEvent>;
}

export class SupabaseBankingRepository implements BankingRepository {
  constructor(private db: Db) {}

  async listAccounts(orgId: string): Promise<FinancialAccount[]> {
    const { data, error } = await this.db
      .from("financial_accounts")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToFinancialAccount);
  }

  async insertAccount(a: FinancialAccount): Promise<FinancialAccount> {
    const { data, error } = await this.db
      .from("financial_accounts")
      .insert(financialAccountToRow(a))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToFinancialAccount(data);
  }

  async listImportedTransactions(
    orgId: string,
  ): Promise<ImportedTransaction[]> {
    const { data, error } = await this.db
      .from("imported_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .order("transaction_date", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToImportedTransaction);
  }

  async insertImportedTransaction(
    t: ImportedTransaction,
  ): Promise<ImportedTransaction> {
    const { data, error } = await this.db
      .from("imported_transactions")
      .insert(importedTransactionToRow(t))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToImportedTransaction(data);
  }

  async findByExternalId(
    orgId: string,
    externalId: string,
  ): Promise<ImportedTransaction | null> {
    const { data, error } = await this.db
      .from("imported_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("external_transaction_id", externalId)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToImportedTransaction(data) : null;
  }

  async findByFingerprint(
    orgId: string,
    fingerprint: string,
  ): Promise<ImportedTransaction | null> {
    const { data, error } = await this.db
      .from("imported_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("import_fingerprint", fingerprint)
      .maybeSingle();
    if (error) throw normalizeError(error);
    return data ? rowToImportedTransaction(data) : null;
  }

  async listStatements(orgId: string): Promise<FinancialStatement[]> {
    const { data, error } = await this.db
      .from("financial_statements")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToFinancialStatement);
  }

  async insertStatement(s: FinancialStatement): Promise<FinancialStatement> {
    const { data, error } = await this.db
      .from("financial_statements")
      .insert(financialStatementToRow(s))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToFinancialStatement(data);
  }

  async listBatches(orgId: string): Promise<ImportBatch[]> {
    const { data, error } = await this.db
      .from("import_batches")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToImportBatch);
  }

  async insertBatch(b: ImportBatch): Promise<ImportBatch> {
    const { data, error } = await this.db
      .from("import_batches")
      .insert(importBatchToRow(b))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToImportBatch(data);
  }

  async listMatches(orgId: string): Promise<ReconciliationMatch[]> {
    const { data, error } = await this.db
      .from("reconciliation_matches")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToReconciliationMatch);
  }

  async insertMatch(m: ReconciliationMatch): Promise<ReconciliationMatch> {
    const { data, error } = await this.db
      .from("reconciliation_matches")
      .insert(reconciliationMatchToRow(m))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToReconciliationMatch(data);
  }

  async listTransfers(orgId: string): Promise<AccountTransfer[]> {
    const { data, error } = await this.db
      .from("account_transfers")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToAccountTransfer);
  }

  async insertTransfer(t: AccountTransfer): Promise<AccountTransfer> {
    const { data, error } = await this.db
      .from("account_transfers")
      .insert(accountTransferToRow(t))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToAccountTransfer(data);
  }

  async listReconEvents(orgId: string): Promise<ReconciliationEvent[]> {
    const { data, error } = await this.db
      .from("reconciliation_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToReconciliationEvent);
  }

  async insertReconEvent(e: ReconciliationEvent): Promise<ReconciliationEvent> {
    const { data, error } = await this.db
      .from("reconciliation_events")
      .insert(reconciliationEventToRow(e))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToReconciliationEvent(data);
  }
}

// ── Investor/JV Repository ─────────────────────────────────────
// Payouts remain distributions (not operating expenses). Settlement
// generation is idempotent via the unique period-key indexes on
// investor_settlements. Retry returns existing or safe-no-op.

export interface InvestorRepository {
  listInvestors(orgId: string): Promise<Investor[]>;
  insertInvestor(i: Investor): Promise<Investor>;
  listPairings(orgId: string): Promise<InvestorVehicle[]>;
  insertPairing(iv: InvestorVehicle): Promise<InvestorVehicle>;
  listSettlements(orgId: string): Promise<Settlement[]>;
  insertSettlement(s: Settlement): Promise<Settlement>;
  updateSettlementStatus(
    orgId: string,
    id: string,
    status: Settlement["payout_status"],
    paidAt?: string | null,
  ): Promise<Settlement>;
}

export class SupabaseInvestorRepository implements InvestorRepository {
  constructor(private db: Db) {}

  async listInvestors(orgId: string): Promise<Investor[]> {
    const { data, error } = await this.db
      .from("investors")
      .select("*")
      .eq("organization_id", orgId);
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToInvestor);
  }

  async insertInvestor(i: Investor): Promise<Investor> {
    const { data, error } = await this.db
      .from("investors")
      .insert(investorToRow(i))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToInvestor(data);
  }

  async listPairings(orgId: string): Promise<InvestorVehicle[]> {
    const { data, error } = await this.db
      .from("investor_vehicles")
      .select("*")
      .eq("organization_id", orgId)
      .order("effective_date", { ascending: true });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToInvestorVehicle);
  }

  async insertPairing(iv: InvestorVehicle): Promise<InvestorVehicle> {
    const { data, error } = await this.db
      .from("investor_vehicles")
      .insert(investorVehicleToRow(iv))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToInvestorVehicle(data);
  }

  async listSettlements(orgId: string): Promise<Settlement[]> {
    const { data, error } = await this.db
      .from("investor_settlements")
      .select("*")
      .eq("organization_id", orgId)
      .order("period_start", { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map(rowToInvestorSettlement);
  }

  async insertSettlement(s: Settlement): Promise<Settlement> {
    const { data, error } = await this.db
      .from("investor_settlements")
      .insert(investorSettlementToRow(s))
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToInvestorSettlement(data);
  }

  async updateSettlementStatus(
    orgId: string,
    id: string,
    status: Settlement["payout_status"],
    paidAt?: string | null,
  ): Promise<Settlement> {
    const updateRow: Partial<InvestorSettlementRow> = {
      status: status as InvestorSettlementRow["status"],
    };
    if (paidAt !== undefined) updateRow.paid_at = paidAt;
    const { data, error } = await this.db
      .from("investor_settlements")
      .update(updateRow)
      .eq("organization_id", orgId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw normalizeError(error);
    return rowToInvestorSettlement(data);
  }
}
