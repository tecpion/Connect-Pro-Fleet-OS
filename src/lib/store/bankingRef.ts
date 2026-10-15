// Connect Pro Fleet — banking expense-ref type (Build #15).
// A loose type for the expense createExpense method, used by the banking store
// to create expenses from imported transactions without a circular import.

import type { TenderMethod, PaymentProcessor } from "../paymentMethodTypes";
import type { ExpenseLineItem } from "../expenseTypes";

export interface CreateExpenseRefInput {
  description: string;
  amount: number;
  transaction_date: string;
  expense_category_id?: string | null;
  vendor_id?: string | null;
  payment_method: TenderMethod;
  payment_source?: string | null;
  processor?: PaymentProcessor | null;
  paid_by_type?: "company" | "owner" | "employee" | "partner" | "other";
  paid_by_user_id?: string | null;
  location_id?: string | null;
  vehicle_id?: string | null;
  rental_id?: string | null;
  maintenance_work_order_id?: string | null;
  receipt_required?: boolean;
  no_receipt_reason?: string | null;
  memo?: string | null;
  line_items?: ExpenseLineItem[];
  create_reimbursement?: boolean;
  cash_account_id?: string | null;
}

export type CreateExpenseRef = (input: CreateExpenseRefInput) => string;
