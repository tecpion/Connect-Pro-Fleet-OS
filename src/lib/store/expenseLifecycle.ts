// Connect Pro Fleet — expense lifecycle methods (Build #14).
// Create, metadata edit, reverse, reimbursements. Reversals create a linked
// reversal expense (opposite-signed contribution) — the original is never
// hard-deleted. Reimbursements are recorded ONCE against the expense; paying a
// reimbursement does NOT create a second operating expense. Petty cash
// movements link to the expense without double-counting.

import type {
  ExpenseLineItem,
  ExpenseReimbursement,
  ExpenseTransaction,
  PaidByType,
} from "../expenseTypes";
import type { TenderMethod, PaymentProcessor } from "../paymentMethodTypes";
import { TENANT_ID, uid } from "./ids";
import type { StoreState } from "./storeState";
import type { ExpenseShared } from "./expenseShared";
import { allocExpenseNumber } from "./expenseShared";
import {
  persistExpenseInsert,
  persistExpenseUpdate,
  persistExpenseLineItemInsert,
  persistExpenseReimbursementInsert,
  persistExpenseReimbursementUpdate,
} from "../supabase/phase5StoreSync";

export function buildExpenseLifecycle(s: StoreState, h: ExpenseShared) {
  function createExpense(input: {
    description: string;
    amount: number;
    transaction_date: string;
    expense_category_id?: string | null;
    vendor_id?: string | null;
    payment_method: TenderMethod;
    payment_source?: string | null;
    processor?: PaymentProcessor | null;
    paid_by_type?: PaidByType;
    paid_by_user_id?: string | null;
    location_id?: string | null;
    vehicle_id?: string | null;
    rental_id?: string | null;
    maintenance_work_order_id?: string | null;
    receipt_required?: boolean;
    no_receipt_reason?: string | null;
    memo?: string | null;
    line_items?: Omit<ExpenseLineItem, "id" | "expense_id">[];
    create_reimbursement?: boolean;
    cash_account_id?: string | null;
  }): string {
    const now = new Date().toISOString();
    const id = uid("exp");
    const paidByType: PaidByType = input.paid_by_type ?? "company";
    const needsReimbursement =
      input.create_reimbursement || paidByType !== "company";
    const expense: ExpenseTransaction = {
      id,
      tenant_id: TENANT_ID,
      expense_number: allocExpenseNumber(s),
      transaction_date: input.transaction_date,
      entered_at: now,
      entered_by_user_id: s.currentStaffId,
      description: input.description,
      memo: input.memo ?? null,
      amount: input.amount,
      currency: "USD",
      expense_category_id: input.expense_category_id ?? null,
      vendor_id: input.vendor_id ?? null,
      payment_method: input.payment_method,
      payment_source: input.payment_source ?? null,
      processor: input.processor ?? null,
      paid_by_type: paidByType,
      paid_by_user_id: input.paid_by_user_id ?? null,
      reimbursement_status: needsReimbursement ? "owed" : "not_required",
      location_id: input.location_id ?? null,
      vehicle_id: input.vehicle_id ?? null,
      rental_id: input.rental_id ?? null,
      maintenance_work_order_id: input.maintenance_work_order_id ?? null,
      receipt_status: "missing",
      receipt_required: input.receipt_required ?? false,
      no_receipt_reason: input.no_receipt_reason ?? null,
      status: "posted",
      reversal_of: null,
      source: "manual",
      dedupe_key: null,
      metadata: null,
      created_at: now,
      updated_at: now,
    };
    s.setExpenses((es) => [expense, ...es]);
    persistExpenseInsert(expense);

    // Line items (split).
    if (input.line_items && input.line_items.length > 0) {
      const items: ExpenseLineItem[] = input.line_items.map((li) => ({
        ...li,
        id: uid("eli"),
        expense_id: id,
      }));
      s.setExpenseLineItems((ls) => [...ls, ...items]);
      for (const li of items) persistExpenseLineItemInsert(li);
    }

    // Reimbursement (recorded once — paying it later does NOT create a second expense).
    if (needsReimbursement) {
      const rmb: ExpenseReimbursement = {
        id: uid("rmb"),
        tenant_id: TENANT_ID,
        expense_id: id,
        payee_type: paidByType,
        payee_user_id: input.paid_by_user_id ?? null,
        amount: input.amount,
        status: "owed",
        requested_at: now,
        approved_at: null,
        paid_at: null,
        payment_method: null,
        notes: null,
        created_at: now,
      };
      s.setExpenseReimbursements((rs) => [rmb, ...rs]);
      persistExpenseReimbursementInsert(rmb);
      h.logEvent(
        id,
        "reimbursement_created",
        `Reimbursement owed — $${input.amount} to ${h.staffName(input.paid_by_user_id ?? null)}`,
        { newValue: "owed" },
      );
    }

    // Petty cash link (cash out) — does NOT duplicate the expense.
    if (input.cash_account_id && input.payment_method === "cash") {
      s.setCashEntries((cs) => [
        {
          id: uid("ce"),
          tenant_id: TENANT_ID,
          cash_account_id: input.cash_account_id!,
          entry_type: "cash_out",
          amount: input.amount,
          expense_id: id,
          description: `${expense.expense_number} — ${input.description}`,
          entered_by_user_id: s.currentStaffId,
          created_at: now,
        },
        ...cs,
      ]);
    }

    h.logEvent(id, "created", "Expense created");
    h.logAct(
      `Expense recorded — ${input.description} (${expense.expense_number})`,
    );
    return id;
  }

  function updateExpenseMetadata(
    id: string,
    patch: Partial<
      Pick<
        ExpenseTransaction,
        | "description"
        | "memo"
        | "vendor_id"
        | "location_id"
        | "no_receipt_reason"
      >
    >,
  ) {
    const e = s.expenses.find((x) => x.id === id);
    if (!e) return;
    h.patchExpense(id, patch);
    persistExpenseUpdate(e.tenant_id, id, patch);
    h.logEvent(id, "corrected", "Expense metadata updated");
  }

  function reverseExpense(id: string, reason: string): string | null {
    const original = s.expenses.find((e) => e.id === id);
    if (!original || original.status === "voided") return null;
    // Prevent double reversal.
    if (original.reversal_of !== null) return null;
    const now = new Date().toISOString();
    const reversal: ExpenseTransaction = {
      ...original,
      id: uid("exp"),
      expense_number: allocExpenseNumber(s),
      transaction_date: now.slice(0, 10),
      entered_at: now,
      entered_by_user_id: s.currentStaffId,
      description: `Reversal — ${original.expense_number}`,
      memo: reason,
      receipt_status: "not_required",
      receipt_required: false,
      no_receipt_reason: "Reversal entry",
      reversal_of: id,
      source: "manual",
      dedupe_key: null,
      created_at: now,
      updated_at: now,
    };
    s.setExpenses((es) => [reversal, ...es]);
    persistExpenseInsert(reversal);
    h.logEvent(reversal.id, "reversed", `Reversed ${original.expense_number}`, {
      oldValue: id,
      note: reason,
    });
    h.logAct(`Expense reversed — ${original.expense_number}`, "out");
    return reversal.id;
  }

  // --- Reimbursements ---

  function approveReimbursement(reimbursementId: string) {
    const rmb = s.expenseReimbursements.find((r) => r.id === reimbursementId);
    if (!rmb || rmb.status !== "owed") return;
    s.setExpenseReimbursements((rs) =>
      rs.map((r) =>
        r.id === reimbursementId
          ? { ...r, status: "approved", approved_at: new Date().toISOString() }
          : r,
      ),
    );
    persistExpenseReimbursementUpdate(rmb.tenant_id, reimbursementId, {
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    h.logEvent(
      rmb.expense_id,
      "reimbursement_approved",
      "Reimbursement approved",
      { oldValue: "owed", newValue: "approved" },
    );
  }

  function markReimbursementPaid(
    reimbursementId: string,
    method: TenderMethod,
  ) {
    const rmb = s.expenseReimbursements.find((r) => r.id === reimbursementId);
    if (!rmb || (rmb.status !== "owed" && rmb.status !== "approved")) return;
    const now = new Date().toISOString();
    s.setExpenseReimbursements((rs) =>
      rs.map((r) =>
        r.id === reimbursementId
          ? { ...r, status: "paid", paid_at: now, payment_method: method }
          : r,
      ),
    );
    persistExpenseReimbursementUpdate(rmb.tenant_id, reimbursementId, {
      status: "paid",
      paid_at: now,
      payment_method: method,
    });
    // Mark the expense's reimbursement status as paid (no second expense created).
    s.setExpenses((es) =>
      es.map((e) =>
        e.id === rmb.expense_id
          ? { ...e, reimbursement_status: "paid", updated_at: now }
          : e,
      ),
    );
    persistExpenseUpdate(rmb.tenant_id, rmb.expense_id, {
      reimbursement_status: "paid",
      updated_at: now,
    });
    h.logEvent(
      rmb.expense_id,
      "reimbursement_paid",
      `Reimbursement paid — $${rmb.amount} via ${method}`,
      { oldValue: rmb.status, newValue: "paid" },
    );
  }

  function cancelReimbursement(reimbursementId: string, reason?: string) {
    const rmb = s.expenseReimbursements.find((r) => r.id === reimbursementId);
    if (!rmb || rmb.status === "paid") return;
    s.setExpenseReimbursements((rs) =>
      rs.map((r) =>
        r.id === reimbursementId ? { ...r, status: "cancelled" } : r,
      ),
    );
    s.setExpenses((es) =>
      es.map((e) =>
        e.id === rmb.expense_id
          ? { ...e, reimbursement_status: "cancelled" }
          : e,
      ),
    );
    h.logEvent(
      rmb.expense_id,
      "reimbursement_paid",
      `Reimbursement cancelled${reason ? ` — ${reason}` : ""}`,
      { newValue: "cancelled" },
    );
  }

  return {
    createExpense,
    updateExpenseMetadata,
    reverseExpense,
    approveReimbursement,
    markReimbursementPaid,
    cancelReimbursement,
  };
}
