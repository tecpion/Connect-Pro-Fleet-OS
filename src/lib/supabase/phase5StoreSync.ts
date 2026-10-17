// Connect Pro Fleet — Phase 5 Cloud store hydration + persistence sync
// (Expenses + Banking + Investor/JV).
//
// Bridges the frozen in-memory store providers to the Cloud repository
// layer WITHOUT changing the synchronous store API. The store keeps its
// useState arrays as the UI cache; this module hydrates them from Cloud on
// auth/org change and persists mutations through the repository abstraction
// (UI → store method → repository → Cloud).
//
// Frozen financial semantics preserved:
// - Expense = company cost
// - Reimbursement/recovery = reduction of economic impact, NOT new revenue
// - Receipt = evidence only
// - Bank transaction = evidence only — never auto-create
//   Payment/Expense/Charge/Deposit/Payout
// - Transfer = no P&L effect
// - Investor/JV payout = distribution, NOT operating expense
// - one economic event = one authoritative record
//
// In memory mode (no Cloud config) every function is a no-op so the existing
// seeded demo experience is unchanged.

import type {
  ExpenseTransaction,
  ExpenseLineItem,
  ExpenseCategory,
  ExpenseEvent,
  ExpenseReceipt,
  ExpenseReimbursement,
  CashAccount,
  CashEntry,
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
import type {
  Investor,
  InvestorVehicle,
  Settlement,
} from "../investorTypes";
import { getBackendMode } from "./client";
import { createRepositories } from "./repository";
import type {
  ExpenseRepository,
  BankingRepository,
  InvestorRepository,
} from "./repository";

function repos(): {
  expenses: ExpenseRepository | null;
  banking: BankingRepository | null;
  investor: InvestorRepository | null;
} | null {
  if (getBackendMode() !== "supabase") return null;
  const r = createRepositories();
  return {
    expenses: r.expenses,
    banking: r.banking,
    investor: r.investor,
  };
}

// ── Expenses ───────────────────────────────────────────────────────────────

export interface ExpenseSyncHandles {
  setExpenses: (
    updater: (prev: ExpenseTransaction[]) => ExpenseTransaction[],
  ) => void;
  setExpenseLineItems: (
    updater: (prev: ExpenseLineItem[]) => ExpenseLineItem[],
  ) => void;
  setExpenseCategories: (
    updater: (prev: ExpenseCategory[]) => ExpenseCategory[],
  ) => void;
  setExpenseEvents: (updater: (prev: ExpenseEvent[]) => ExpenseEvent[]) => void;
  setExpenseReceipts: (
    updater: (prev: ExpenseReceipt[]) => ExpenseReceipt[],
  ) => void;
  setExpenseReimbursements: (
    updater: (prev: ExpenseReimbursement[]) => ExpenseReimbursement[],
  ) => void;
  setCashAccounts: (updater: (prev: CashAccount[]) => CashAccount[]) => void;
  setCashEntries: (updater: (prev: CashEntry[]) => CashEntry[]) => void;
}

export async function hydrateExpenses(
  orgId: string,
  handles: ExpenseSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.expenses) return false;
  try {
    const [
      expenses,
      lineItems,
      categories,
      events,
      receipts,
      reimbursements,
    ] = await Promise.all([
      r.expenses.list(orgId),
      r.expenses.listLineItems(orgId),
      r.expenses.listCategories(orgId),
      r.expenses.listEvents(orgId),
      r.expenses.listReceipts(orgId),
      r.expenses.listReimbursements(orgId),
    ]);
    handles.setExpenses(() => expenses);
    handles.setExpenseLineItems(() => lineItems);
    handles.setExpenseCategories(() => categories);
    handles.setExpenseEvents(() => events);
    handles.setExpenseReceipts(() => receipts);
    handles.setExpenseReimbursements(() => reimbursements);
    // Cash accounts/entries remain in-memory for now (not a Phase 5 table);
    // do not fabricate Cloud-backed state.
    handles.setCashAccounts(() => []);
    handles.setCashEntries(() => []);
    return true;
  } catch (e) {
    console.error("[phase5Sync] expense hydration failed", e);
    return false;
  }
}

export function persistExpenseInsert(e: ExpenseTransaction): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .insert(e)
    .catch((err) => console.error("[phase5Sync] expense insert failed", err));
}

export function persistExpenseUpdate(
  orgId: string,
  id: string,
  patch: Partial<ExpenseTransaction>,
): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .update(orgId, id, patch)
    .catch((err) => console.error("[phase5Sync] expense update failed", err));
}

export function persistExpenseLineItemInsert(li: ExpenseLineItem): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .insertLineItem(li)
    .catch((err) =>
      console.error("[phase5Sync] expense line item insert failed", err),
    );
}

export function persistExpenseReceiptInsert(rc: ExpenseReceipt): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .insertReceipt(rc)
    .catch((err) =>
      console.error("[phase5Sync] expense receipt insert failed", err),
    );
}

export function persistExpenseReimbursementInsert(
  rm: ExpenseReimbursement,
): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .insertReimbursement(rm)
    .catch((err) =>
      console.error("[phase5Sync] expense reimbursement insert failed", err),
    );
}

export function persistExpenseReimbursementUpdate(
  orgId: string,
  id: string,
  patch: Partial<ExpenseReimbursement>,
): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .updateReimbursement(orgId, id, patch)
    .catch((err) =>
      console.error("[phase5Sync] expense reimbursement update failed", err),
    );
}

export function persistExpenseCategoryInsert(c: ExpenseCategory): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .insertCategory(c)
    .catch((err) =>
      console.error("[phase5Sync] expense category insert failed", err),
    );
}

export function persistExpenseCategoryUpdate(
  orgId: string,
  id: string,
  patch: Partial<ExpenseCategory>,
): void {
  const r = repos();
  if (!r?.expenses) return;
  void r.expenses
    .updateCategory(orgId, id, patch)
    .catch((err) =>
      console.error("[phase5Sync] expense category update failed", err),
    );
}

// ── Banking (evidence only — never auto-create authoritative records) ──────

export interface BankingSyncHandles {
  setFinancialAccounts: (
    updater: (prev: FinancialAccount[]) => FinancialAccount[],
  ) => void;
  setImportedTransactions: (
    updater: (prev: ImportedTransaction[]) => ImportedTransaction[],
  ) => void;
  setStatements: (
    updater: (prev: FinancialStatement[]) => FinancialStatement[],
  ) => void;
  setImportBatches: (updater: (prev: ImportBatch[]) => ImportBatch[]) => void;
  setReconciliationMatches: (
    updater: (prev: ReconciliationMatch[]) => ReconciliationMatch[],
  ) => void;
  setAccountTransfers: (
    updater: (prev: AccountTransfer[]) => AccountTransfer[],
  ) => void;
  setReconciliationEvents: (
    updater: (prev: ReconciliationEvent[]) => ReconciliationEvent[],
  ) => void;
}

export async function hydrateBanking(
  orgId: string,
  handles: BankingSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.banking) return false;
  try {
    const [accounts, imported, statements, batches, matches, transfers, events] =
      await Promise.all([
        r.banking.listAccounts(orgId),
        r.banking.listImportedTransactions(orgId),
        r.banking.listStatements(orgId),
        r.banking.listBatches(orgId),
        r.banking.listMatches(orgId),
        r.banking.listTransfers(orgId),
        r.banking.listEvents(orgId),
      ]);
    handles.setFinancialAccounts(() => accounts);
    handles.setImportedTransactions(() => imported);
    handles.setStatements(() => statements);
    handles.setImportBatches(() => batches);
    handles.setReconciliationMatches(() => matches);
    handles.setAccountTransfers(() => transfers);
    handles.setReconciliationEvents(() => events);
    return true;
  } catch (e) {
    console.error("[phase5Sync] banking hydration failed", e);
    return false;
  }
}

export function persistFinancialAccountInsert(a: FinancialAccount): void {
  const r = repos();
  if (!r?.banking) return;
  void r.banking
    .insertAccount(a)
    .catch((err) =>
      console.error("[phase5Sync] financial account insert failed", err),
    );
}

export function persistImportedTransactionInsert(
  t: ImportedTransaction,
): void {
  const r = repos();
  if (!r?.banking) return;
  void r.banking
    .insertImportedTransaction(t)
    .catch((err) =>
      console.error("[phase5Sync] imported transaction insert failed", err),
    );
}

export function persistReconciliationMatchInsert(m: ReconciliationMatch): void {
  const r = repos();
  if (!r?.banking) return;
  void r.banking
    .insertMatch(m)
    .catch((err) =>
      console.error("[phase5Sync] reconciliation match insert failed", err),
    );
}

export function persistAccountTransferInsert(t: AccountTransfer): void {
  const r = repos();
  if (!r?.banking) return;
  void r.banking
    .insertTransfer(t)
    .catch((err) =>
      console.error("[phase5Sync] account transfer insert failed", err),
    );
}

export function persistReconciliationEventInsert(e: ReconciliationEvent): void {
  const r = repos();
  if (!r?.banking) return;
  void r.banking
    .insertEvent(e)
    .catch((err) =>
      console.error("[phase5Sync] reconciliation event insert failed", err),
    );
}

// ── Investor / JV (pairing history + settlements; payouts are distributions) ──

export interface InvestorSyncHandles {
  setInvestors: (updater: (prev: Investor[]) => Investor[]) => void;
  setInvestorVehicles: (
    updater: (prev: InvestorVehicle[]) => InvestorVehicle[],
  ) => void;
  setSettlements: (updater: (prev: Settlement[]) => Settlement[]) => void;
}

export async function hydrateInvestor(
  orgId: string,
  handles: InvestorSyncHandles,
): Promise<boolean> {
  const r = repos();
  if (!r?.investor) return false;
  try {
    const [investors, investorVehicles, settlements] = await Promise.all([
      r.investor.listInvestors(orgId),
      r.investor.listInvestorVehicles(orgId),
      r.investor.listSettlements(orgId),
    ]);
    handles.setInvestors(() => investors);
    handles.setInvestorVehicles(() => investorVehicles);
    handles.setSettlements(() => settlements);
    return true;
  } catch (e) {
    console.error("[phase5Sync] investor hydration failed", e);
    return false;
  }
}

export function persistInvestorInsert(i: Investor): void {
  const r = repos();
  if (!r?.investor) return;
  void r.investor
    .insertInvestor(i)
    .catch((err) => console.error("[phase5Sync] investor insert failed", err));
}

export function persistInvestorVehicleInsert(iv: InvestorVehicle): void {
  const r = repos();
  if (!r?.investor) return;
  void r.investor
    .insertInvestorVehicle(iv)
    .catch((err) =>
      console.error("[phase5Sync] investor vehicle insert failed", err),
    );
}

export function persistSettlementInsert(s: Settlement): void {
  const r = repos();
  if (!r?.investor) return;
  void r.investor
    .insertSettlement(s)
    .catch((err) =>
      console.error("[phase5Sync] settlement insert failed", err),
    );
}

export function persistSettlementUpdate(
  orgId: string,
  id: string,
  status: Settlement["status"],
  paidAt?: string | null,
): void {
  const r = repos();
  if (!r?.investor) return;
  void r.investor
    .updateSettlementStatus(orgId, id, status, paidAt)
    .catch((err) =>
      console.error("[phase5Sync] settlement update failed", err),
    );
}