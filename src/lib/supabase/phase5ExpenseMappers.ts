// Connect Pro Fleet — Phase 5 expense mappers.
// Row ↔ domain for the accounting expense ledger (separate from the rental
// financial ledger). Nullables preserved; money untouched; tenant_id ↔
// organization_id.

import type {
  ExpenseTransactionRow,
  ExpenseCategoryRow,
  ExpenseLineItemRow,
  ExpenseReceiptRow,
  ExpenseReimbursementRow,
} from "./dbTypesFinancial";
import type { Json } from "./dbTypesCore";
import type {
  ExpenseTransaction,
  ExpenseCategory,
  ExpenseLineItem,
  ExpenseReceipt,
  ExpenseReimbursement,
} from "../expenseTypes";

function asJson(v: unknown): Json | null {
  if (v === null || v === undefined) return null;
  return v as Json;
}

function jsonToRecord(v: Json | null): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  return v as Record<string, unknown>;
}

// ── categories ─────────────────────────────────────────────────────────────

export function rowToExpenseCategory(r: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    type: r.type as ExpenseCategory["type"],
    parent_category_id: r.parent_category_id,
    active: r.active,
    created_at: r.created_at,
    default_scope: (r.default_scope ??
      undefined) as ExpenseCategory["default_scope"],
  };
}

export function expenseCategoryToRow(
  c: ExpenseCategory,
): Omit<ExpenseCategoryRow, "created_at"> {
  return {
    id: c.id,
    organization_id: c.tenant_id,
    name: c.name,
    type: c.type,
    parent_category_id: c.parent_category_id,
    active: c.active,
    default_scope: c.default_scope ?? null,
  };
}

// ── transactions ───────────────────────────────────────────────────────────

export function rowToExpenseTransaction(
  r: ExpenseTransactionRow,
): ExpenseTransaction {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    expense_number: r.expense_number,
    transaction_date: r.transaction_date,
    entered_at: r.entered_at,
    entered_by_user_id: r.entered_by_user_id,
    description: r.description,
    memo: r.memo,
    amount: r.amount,
    currency: r.currency,
    expense_category_id: r.expense_category_id,
    vendor_id: r.vendor_id,
    payment_method: (r.payment_method ??
      null) as ExpenseTransaction["payment_method"],
    payment_source: r.payment_source,
    processor: null,
    paid_by_type: r.paid_by_type as ExpenseTransaction["paid_by_type"],
    paid_by_user_id: r.paid_by_user_id,
    reimbursement_status: (r.reimbursement_status ??
      null) as ExpenseTransaction["reimbursement_status"],
    location_id: r.location_id,
    vehicle_id: r.vehicle_id,
    rental_id: r.rental_id,
    maintenance_work_order_id: r.maintenance_work_order_id,
    receipt_status: r.receipt_status as ExpenseTransaction["receipt_status"],
    receipt_required: r.receipt_required,
    no_receipt_reason: r.no_receipt_reason,
    status: r.status as ExpenseTransaction["status"],
    reversal_of: r.reversal_of,
    source: r.source as ExpenseTransaction["source"],
    dedupe_key: null,
    reconciled_imported_id: null,
    metadata: jsonToRecord(r.metadata),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function expenseTransactionToRow(
  e: ExpenseTransaction,
): Omit<ExpenseTransactionRow, "created_at" | "updated_at"> {
  return {
    id: e.id,
    organization_id: e.tenant_id,
    expense_number: e.expense_number,
    transaction_date: e.transaction_date,
    entered_at: e.entered_at,
    entered_by_user_id: e.entered_by_user_id,
    description: e.description,
    memo: e.memo,
    amount: e.amount,
    currency: e.currency,
    expense_category_id: e.expense_category_id ?? "",
    expense_subcategory_id: null,
    vendor_id: e.vendor_id,
    payment_method: e.payment_method ?? null,
    payment_source: e.payment_source,
    paid_by_type: e.paid_by_type,
    paid_by_user_id: e.paid_by_user_id,
    reimbursement_status: e.reimbursement_status ?? null,
    location_id: e.location_id,
    vehicle_id: e.vehicle_id,
    rental_id: e.rental_id,
    maintenance_work_order_id: e.maintenance_work_order_id,
    ownership_context: null,
    receipt_status: e.receipt_status,
    receipt_required: e.receipt_required,
    no_receipt_reason: e.no_receipt_reason,
    status: e.status,
    reversal_of: e.reversal_of,
    source: e.source,
    metadata: asJson(e.metadata),
  };
}

export function expenseTransactionPatchToRow(
  patch: Partial<ExpenseTransaction>,
): Partial<ExpenseTransactionRow> {
  const out: Partial<ExpenseTransactionRow> = {};
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.memo !== undefined) out.memo = patch.memo;
  if (patch.amount !== undefined) out.amount = patch.amount;
  if (patch.vendor_id !== undefined) out.vendor_id = patch.vendor_id;
  if (patch.payment_method !== undefined)
    out.payment_method = patch.payment_method ?? null;
  if (patch.payment_source !== undefined)
    out.payment_source = patch.payment_source;
  if (patch.paid_by_type !== undefined) out.paid_by_type = patch.paid_by_type;
  if (patch.receipt_status !== undefined)
    out.receipt_status = patch.receipt_status;
  if (patch.receipt_required !== undefined)
    out.receipt_required = patch.receipt_required;
  if (patch.no_receipt_reason !== undefined)
    out.no_receipt_reason = patch.no_receipt_reason;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.reimbursement_status !== undefined)
    out.reimbursement_status = patch.reimbursement_status ?? null;
  if (patch.vehicle_id !== undefined) out.vehicle_id = patch.vehicle_id;
  if (patch.rental_id !== undefined) out.rental_id = patch.rental_id;
  if (patch.maintenance_work_order_id !== undefined)
    out.maintenance_work_order_id = patch.maintenance_work_order_id;
  if (patch.metadata !== undefined) out.metadata = asJson(patch.metadata);
  return out;
}

// ── line items ──────────────────────────────────────────────────────────────

export function rowToExpenseLineItem(r: ExpenseLineItemRow): ExpenseLineItem {
  return {
    id: r.id,
    expense_id: r.expense_id,
    description: r.description,
    category_id: r.category_id,
    amount: r.amount,
    vehicle_id: r.vehicle_id,
    work_order_id: r.work_order_id,
    notes: r.notes,
  };
}

export function expenseLineItemToRow(
  li: ExpenseLineItem,
): Omit<ExpenseLineItemRow, "organization_id"> {
  return {
    id: li.id,
    expense_id: li.expense_id,
    description: li.description,
    category_id: li.category_id ?? "",
    amount: li.amount,
    vehicle_id: li.vehicle_id,
    work_order_id: li.work_order_id,
    notes: li.notes,
  };
}

// ── receipts ────────────────────────────────────────────────────────────────

export function rowToExpenseReceipt(r: ExpenseReceiptRow): ExpenseReceipt {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    expense_id: r.expense_id,
    file_name: r.file_name,
    file_url: r.storage_path,
    mime_type: r.mime_type,
    uploaded_by: r.uploaded_by,
    uploaded_at: r.uploaded_at,
    note: r.note,
    voided_at: r.voided_at,
  };
}

export function expenseReceiptToRow(
  rc: ExpenseReceipt,
): Omit<
  ExpenseReceiptRow,
  "organization_id" | "receipt_type" | "amount" | "vendor_id"
> {
  return {
    id: rc.id,
    expense_id: rc.expense_id,
    file_name: rc.file_name,
    storage_path: rc.file_url,
    mime_type: rc.mime_type ?? "",
    uploaded_by: rc.uploaded_by,
    uploaded_at: rc.uploaded_at,
    voided_at: rc.voided_at,
    note: rc.note,
  };
}

// ── reimbursements ─────────────────────────────────────────────────────────
// The live expense_reimbursements table has NO created_at column, so the row
// type does not carry it. The domain model requires created_at — fall back to
// requested_at (the closest audit timestamp) and never fabricate a value.

export function rowToExpenseReimbursement(
  r: ExpenseReimbursementRow,
): ExpenseReimbursement {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    expense_id: r.expense_id,
    payee_type: r.payee_type as ExpenseReimbursement["payee_type"],
    payee_user_id: r.payee_user_id,
    amount: r.amount,
    status: r.status as ExpenseReimbursement["status"],
    requested_at: r.requested_at,
    approved_at: r.approved_at,
    paid_at: r.paid_at,
    payment_method: (r.payment_method ??
      null) as ExpenseReimbursement["payment_method"],
    notes: r.notes,
    created_at: r.requested_at ?? "",
  };
}

export function expenseReimbursementToRow(
  rm: ExpenseReimbursement,
): Omit<ExpenseReimbursementRow, "created_at"> {
  return {
    id: rm.id,
    organization_id: rm.tenant_id,
    expense_id: rm.expense_id,
    payee_type: rm.payee_type,
    payee_user_id: rm.payee_user_id,
    amount: rm.amount,
    status: rm.status,
    requested_at: rm.requested_at,
    approved_at: rm.approved_at,
    paid_at: rm.paid_at,
    payment_method: rm.payment_method,
    notes: rm.notes,
  };
}
