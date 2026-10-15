// Connect Pro Fleet — expense aux methods (Build #14).
// Receipts, categories, petty cash, and the idempotent maintenance work-order
// expense sync. Split from the lifecycle to stay under the line limit.
//
// Maintenance sync: completing a work order with actual cost generates ONE
// linked ExpenseTransaction (source = maintenance_work_order, dedupe_key =
// "wo:<id>"). Re-running the sync never duplicates. The work-order cost
// selector and the expense selectors both read this single record so a repair
// is counted once across maintenance totals, expense totals, and future P&L.

import type {
  CashAccount,
  ExpenseCategory,
  ExpenseReceipt,
  ExpenseTransaction,
} from "../expenseTypes";
import { getWorkOrderCost } from "../maintenanceSelectors";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import type { ExpenseShared } from "./expenseShared";
import { allocExpenseNumber } from "./expenseShared";

export function buildExpenseAux(s: StoreState, h: ExpenseShared) {
  function addExpenseReceipt(input: {
    expense_id: string;
    file_name: string;
    file_url: string;
    mime_type?: string | null;
    note?: string | null;
  }): string {
    const now = new Date().toISOString();
    const id = uid("erct");
    const receipt: ExpenseReceipt = {
      id,
      tenant_id: TENANT_ID,
      expense_id: input.expense_id,
      file_name: input.file_name,
      file_url: input.file_url,
      mime_type: input.mime_type ?? null,
      uploaded_by: s.currentStaffId,
      uploaded_at: now,
      note: input.note ?? null,
      voided_at: null,
    };
    s.setExpenseReceipts((rs) => [receipt, ...rs]);
    // Update receipt status on the expense.
    s.setExpenses((es) =>
      es.map((e) =>
        e.id === input.expense_id
          ? { ...e, receipt_status: "attached", updated_at: now }
          : e,
      ),
    );
    h.logEvent(
      input.expense_id,
      "receipt_added",
      `Receipt added — ${input.file_name}`,
    );
    return id;
  }

  function voidExpenseReceipt(receiptId: string, reason?: string) {
    const receipt = s.expenseReceipts.find((r) => r.id === receiptId);
    if (!receipt || receipt.voided_at) return;
    const now = new Date().toISOString();
    s.setExpenseReceipts((rs) =>
      rs.map((r) => (r.id === receiptId ? { ...r, voided_at: now } : r)),
    );
    // If no other active receipt remains, revert status to missing.
    const hasOther = s.expenseReceipts.some(
      (r) =>
        r.expense_id === receipt.expense_id &&
        r.id !== receiptId &&
        !r.voided_at,
    );
    if (!hasOther) {
      s.setExpenses((es) =>
        es.map((e) =>
          e.id === receipt.expense_id
            ? {
                ...e,
                receipt_status: e.receipt_required ? "missing" : "not_required",
                updated_at: now,
              }
            : e,
        ),
      );
    }
    h.logEvent(
      receipt.expense_id,
      "receipt_voided",
      `Receipt voided — ${receipt.file_name}`,
      { note: reason ?? null },
    );
  }

  function addExpenseNote(expenseId: string, text: string) {
    h.logEvent(expenseId, "note_added", "Note added", { note: text });
  }

  // --- Categories ---

  function addExpenseCategory(c: ExpenseCategory) {
    s.setExpenseCategories((cs) => [c, ...cs]);
  }

  function updateExpenseCategory(id: string, patch: Partial<ExpenseCategory>) {
    s.setExpenseCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  function deactivateExpenseCategory(id: string) {
    s.setExpenseCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, active: false } : c)),
    );
  }

  // --- Petty cash ---

  function createCashAccount(input: {
    name: string;
    location_id?: string | null;
    opening_balance?: number;
  }): string {
    const now = new Date().toISOString();
    const id = uid("cash");
    const account: CashAccount = {
      id,
      tenant_id: TENANT_ID,
      name: input.name,
      location_id: input.location_id ?? null,
      opening_balance: input.opening_balance ?? 0,
      active: true,
      created_at: now,
    };
    s.setCashAccounts((cs) => [account, ...cs]);
    return id;
  }

  function recordCashIn(input: {
    cash_account_id: string;
    amount: number;
    description: string;
  }) {
    s.setCashEntries((cs) => [
      {
        id: uid("ce"),
        tenant_id: TENANT_ID,
        cash_account_id: input.cash_account_id,
        entry_type: "cash_in",
        amount: input.amount,
        expense_id: null,
        description: input.description,
        entered_by_user_id: s.currentStaffId,
        created_at: new Date().toISOString(),
      },
      ...cs,
    ]);
  }

  function recordCashAdjustment(input: {
    cash_account_id: string;
    amount: number;
    description: string;
  }) {
    s.setCashEntries((cs) => [
      {
        id: uid("ce"),
        tenant_id: TENANT_ID,
        cash_account_id: input.cash_account_id,
        entry_type: "adjustment",
        amount: input.amount,
        expense_id: null,
        description: input.description,
        entered_by_user_id: s.currentStaffId,
        created_at: new Date().toISOString(),
      },
      ...cs,
    ]);
  }

  // --- Maintenance work-order expense sync (idempotent) ---

  function syncWorkOrderExpense(
    workOrderId: string,
    completedWo?: import("../maintenanceTypes").MaintenanceWorkOrder,
  ): string | null {
    const wo = completedWo ?? s.workOrders.find((w) => w.id === workOrderId);
    if (!wo || wo.status !== "completed") return null;
    const cost = getWorkOrderCost(wo);
    if (cost === null || cost <= 0) return null;
    const dedupeKey = `wo:${workOrderId}`;
    // Idempotent: if a posted (non-reversed) expense with this dedupe key
    // already exists, do nothing. Also check the synchronous number registry is
    // not needed here — dedupe_key is the guard.
    const existing = s.expenses.find(
      (e) =>
        e.dedupe_key === dedupeKey && e.status === "posted" && !e.reversal_of,
    );
    if (existing) return existing.id;
    const now = new Date().toISOString();
    const id = uid("exp");
    const expense: ExpenseTransaction = {
      id,
      tenant_id: TENANT_ID,
      expense_number: allocExpenseNumber(s),
      transaction_date: (wo.completed_at ?? now).slice(0, 10),
      entered_at: now,
      entered_by_user_id: s.currentStaffId,
      description: `${wo.title} (${wo.work_order_number})`,
      memo: wo.work_performed ?? null,
      amount: cost,
      currency: "USD",
      expense_category_id: "ec_maint",
      vendor_id: wo.vendor_id,
      payment_method: "other",
      payment_source: null,
      processor: null,
      paid_by_type: "company",
      paid_by_user_id: null,
      reimbursement_status: "not_required",
      location_id: wo.location_id,
      vehicle_id: wo.vehicle_id,
      rental_id: null,
      maintenance_work_order_id: workOrderId,
      receipt_status: "not_required",
      receipt_required: false,
      no_receipt_reason: "Generated from work order",
      status: "posted",
      reversal_of: null,
      source: "maintenance_work_order",
      dedupe_key: dedupeKey,
      metadata: null,
      created_at: now,
      updated_at: now,
    };
    s.setExpenses((es) => [expense, ...es]);
    h.logEvent(
      id,
      "created",
      `Expense created — linked to ${wo.work_order_number}`,
      { actorIsSystem: true, actorId: null },
    );
    return id;
  }

  /** Merge metadata into a posted expense (e.g. tag a repair expense with
   *  damage_claim_id). Non-destructive: existing keys are preserved. */
  function tagExpenseMetadata(
    expenseId: string,
    meta: Record<string, unknown>,
  ) {
    s.setExpenses((es) =>
      es.map((e) =>
        e.id === expenseId
          ? {
              ...e,
              metadata: { ...(e.metadata ?? {}), ...meta },
              updated_at: new Date().toISOString(),
            }
          : e,
      ),
    );
  }

  return {
    addExpenseReceipt,
    voidExpenseReceipt,
    addExpenseNote,
    addExpenseCategory,
    updateExpenseCategory,
    deactivateExpenseCategory,
    createCashAccount,
    recordCashIn,
    recordCashAdjustment,
    syncWorkOrderExpense,
    tagExpenseMetadata,
  };
}
