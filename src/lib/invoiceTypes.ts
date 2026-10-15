// Connect Pro Fleet — Invoice & Receipt domain types.
// Extracted from types.ts to keep each module focused. types.ts re-exports
// these for import compatibility.
import type { PaymentMethod } from "./chargeTypes";

export type InvoiceStatus =
  "draft" | "open" | "partially_paid" | "paid" | "past_due" | "void";

export interface InvoiceLineItem {
  id: string;
  description: string;
  transaction_id: string | null;
  amount: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  customer_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export type ReceiptStatus = "issued" | "voided";

export interface Receipt {
  id: string;
  tenant_id: string;
  receipt_number: string;
  customer_id: string;
  rental_id: string | null;
  reservation_id: string | null;
  vehicle_id: string | null;
  payment_transaction_id: string;
  amount: number;
  payment_method: PaymentMethod;
  external_transaction_id: string | null;
  applied_invoice_ids: string[];
  remaining_balance: number;
  issued_at: string;
  issued_by: string | null;
  status: ReceiptStatus;
}
