// Connect Pro Fleet — Phase 5 banking mappers.
// Row ↔ domain for banking & reconciliation. Imported transactions are
// EVIDENCE ONLY — never auto-create Payment/Expense/Charge/Deposit/Payout.
// Nullables preserved; tenant_id ↔ organization_id.

import type {
  FinancialAccountRow,
  ImportedTransactionRow,
  FinancialStatementRow,
  ImportBatchRow,
  ReconciliationMatchRow,
  AccountTransferRow,
  ReconciliationEventRow,
} from "./dbTypesFinancial";
import type { Json } from "./dbTypesCore";
import type {
  FinancialAccount,
  ImportedTransaction,
  FinancialStatement,
  ImportBatch,
  ReconciliationMatch,
  AccountTransfer,
  ReconciliationEvent,
} from "../bankingTypes";

function asJson(v: unknown): Json | null {
  if (v === null || v === undefined) return null;
  return v as Json;
}

function jsonToRecord(v: Json | null): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  return v as Record<string, unknown>;
}

// ── financial accounts ─────────────────────────────────────────────────────

export function rowToFinancialAccount(
  r: FinancialAccountRow,
): FinancialAccount {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    name: r.name,
    institution_name: r.institution_name,
    account_type: r.account_type as FinancialAccount["account_type"],
    account_subtype: r.account_subtype,
    last_four: r.last_four,
    currency: r.currency,
    opening_balance: r.opening_balance,
    active: r.active,
    source: (r.source ?? "manual") as FinancialAccount["source"],
    external_account_id: r.external_account_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function financialAccountToRow(
  a: FinancialAccount,
): Omit<FinancialAccountRow, "created_at" | "updated_at"> {
  return {
    id: a.id,
    organization_id: a.tenant_id,
    name: a.name,
    institution_name: a.institution_name,
    account_type: a.account_type,
    account_subtype: a.account_subtype,
    last_four: a.last_four,
    currency: a.currency,
    opening_balance: a.opening_balance,
    active: a.active,
    source: a.source,
    external_account_id: a.external_account_id,
  };
}

// ── imported transactions (evidence only) ──────────────────────────────────

export function rowToImportedTransaction(
  r: ImportedTransactionRow,
): ImportedTransaction {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    financial_account_id: r.financial_account_id,
    statement_id: r.statement_id,
    external_transaction_id: r.external_transaction_id,
    transaction_date: r.transaction_date,
    posted_date: r.posted_date,
    description: r.description,
    normalized_description: r.normalized_description,
    amount: r.amount,
    direction: r.direction as ImportedTransaction["direction"],
    currency: r.currency,
    running_balance: r.running_balance,
    merchant_name: r.merchant_name,
    transaction_type: r.transaction_type,
    reference: r.reference,
    raw_data: jsonToRecord(r.raw_data),
    import_batch_id: r.import_batch_id,
    import_fingerprint: r.import_fingerprint,
    review_status: r.review_status as ImportedTransaction["review_status"],
    match_status: r.match_status as ImportedTransaction["match_status"],
    transfer_status: (r.transfer_status ??
      "none") as ImportedTransaction["transfer_status"],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function importedTransactionToRow(
  t: ImportedTransaction,
): Omit<ImportedTransactionRow, "created_at" | "updated_at"> {
  return {
    id: t.id,
    organization_id: t.tenant_id,
    financial_account_id: t.financial_account_id,
    statement_id: t.statement_id,
    external_transaction_id: t.external_transaction_id,
    transaction_date: t.transaction_date,
    posted_date: t.posted_date,
    description: t.description,
    normalized_description: t.normalized_description,
    amount: t.amount,
    direction: t.direction,
    currency: t.currency,
    running_balance: t.running_balance,
    merchant_name: t.merchant_name,
    transaction_type: t.transaction_type,
    reference: t.reference,
    raw_data: asJson(t.raw_data),
    import_batch_id: t.import_batch_id,
    import_fingerprint: t.import_fingerprint,
    review_status: t.review_status,
    match_status: t.match_status,
    transfer_status: t.transfer_status,
  };
}

// ── statements ──────────────────────────────────────────────────────────────

export function rowToFinancialStatement(
  r: FinancialStatementRow,
): FinancialStatement {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    financial_account_id: r.financial_account_id,
    statement_start_date: r.statement_start_date,
    statement_end_date: r.statement_end_date,
    opening_balance: r.opening_balance,
    closing_balance: r.closing_balance,
    source_file_name: r.source_file_name ?? "",
    import_batch_id: r.import_batch_id,
    imported_at: r.imported_at,
    imported_by_user_id: r.imported_by_user_id,
    reconciliation_status:
      r.reconciliation_status as FinancialStatement["reconciliation_status"],
    notes: r.notes,
  };
}

export function financialStatementToRow(
  s: FinancialStatement,
): Omit<FinancialStatementRow, "id"> {
  return {
    organization_id: s.tenant_id,
    financial_account_id: s.financial_account_id,
    statement_start_date: s.statement_start_date,
    statement_end_date: s.statement_end_date,
    opening_balance: s.opening_balance,
    closing_balance: s.closing_balance,
    source_file_name: s.source_file_name,
    import_batch_id: s.import_batch_id,
    imported_at: s.imported_at,
    imported_by_user_id: s.imported_by_user_id,
    reconciliation_status: s.reconciliation_status,
    notes: s.notes,
  };
}

// ── import batches ──────────────────────────────────────────────────────────

export function rowToImportBatch(r: ImportBatchRow): ImportBatch {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    financial_account_id: "",
    source_file_name: r.source_file_name ?? "",
    source: (r.source_name ?? "csv") as ImportBatch["source"],
    imported_at: r.imported_at,
    imported_by_user_id: r.imported_by_user_id,
    row_count: r.row_count,
    accepted_rows: r.success_count,
    duplicate_rows: r.skipped_count,
    error_rows: r.error_count,
    errors: [],
    hash: "",
  };
}

export function importBatchToRow(
  b: ImportBatch,
): Omit<ImportBatchRow, "id" | "import_type" | "rollback_status" | "metadata"> {
  return {
    organization_id: b.tenant_id,
    source_name: b.source,
    source_file_name: b.source_file_name,
    imported_by_user_id: b.imported_by_user_id ?? "",
    imported_at: b.imported_at,
    row_count: b.row_count,
    success_count: b.accepted_rows,
    skipped_count: b.duplicate_rows,
    warning_count: 0,
    error_count: b.error_rows,
  };
}

// ── reconciliation matches ─────────────────────────────────────────────────

export function rowToReconciliationMatch(
  r: ReconciliationMatchRow,
): ReconciliationMatch {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    imported_transaction_id: r.imported_transaction_id,
    target_type: r.target_type as ReconciliationMatch["target_type"],
    target_id: r.target_id,
    allocated_amount: r.allocated_amount,
    match_method: r.match_method as ReconciliationMatch["match_method"],
    confidence: (r.confidence ?? "medium") as ReconciliationMatch["confidence"],
    created_by: r.created_by,
    created_at: r.created_at,
    voided_at: r.voided_at,
    notes: r.notes,
  };
}

export function reconciliationMatchToRow(
  m: ReconciliationMatch,
): Omit<ReconciliationMatchRow, "id"> {
  return {
    organization_id: m.tenant_id,
    imported_transaction_id: m.imported_transaction_id,
    target_type: m.target_type,
    target_id: m.target_id,
    allocated_amount: m.allocated_amount,
    match_method: m.match_method,
    confidence: m.confidence,
    created_by: m.created_by,
    voided_at: m.voided_at,
    notes: m.notes,
    created_at: m.created_at,
  };
}

// ── account transfers ──────────────────────────────────────────────────────

export function rowToAccountTransfer(r: AccountTransferRow): AccountTransfer {
  const ids = r.imported_transaction_ids;
  const arr = Array.isArray(ids)
    ? (ids as unknown[]).filter((x) => typeof x === "string")
    : [];
  return {
    id: r.id,
    tenant_id: r.organization_id,
    from_account_id: r.from_account_id,
    to_account_id: r.to_account_id,
    amount: r.amount,
    date: r.date,
    imported_transaction_ids: arr as string[],
    notes: r.notes,
    created_by: null,
    created_at: r.date,
  };
}

export function accountTransferToRow(
  t: AccountTransfer,
): Omit<AccountTransferRow, "id"> {
  return {
    organization_id: t.tenant_id,
    from_account_id: t.from_account_id,
    to_account_id: t.to_account_id,
    amount: t.amount,
    date: t.date,
    imported_transaction_ids: asJson(t.imported_transaction_ids),
    notes: t.notes,
  };
}

// ── reconciliation events ───────────────────────────────────────────────────

export function rowToReconciliationEvent(
  r: ReconciliationEventRow,
): ReconciliationEvent {
  return {
    id: r.id,
    tenant_id: r.organization_id,
    imported_transaction_id: r.entity_id,
    statement_id: null,
    event_type: r.event_type as ReconciliationEvent["event_type"],
    label: r.note ?? "",
    actor_user_id: r.actor_user_id,
    actor_is_system: !r.actor_user_id,
    note: r.note,
    created_at: r.created_at,
  };
}

export function reconciliationEventToRow(
  e: ReconciliationEvent,
): Omit<ReconciliationEventRow, "id"> {
  return {
    organization_id: e.tenant_id,
    event_type: e.event_type,
    entity_id: e.imported_transaction_id,
    actor_user_id: e.actor_user_id,
    note: e.note,
    created_at: e.created_at,
  };
}
