// Connect Pro Fleet — banking import engine (Build #15).
// CSV import: parse, map, validate, fingerprint-dedupe, create
// ImportedTransactions + a FinancialStatement + an ImportBatch. Idempotent via
// a synchronous fingerprint registry. Split from bankingStore to stay under
// the line limit.

import type {
  FinancialStatement,
  ImportBatch,
  ImportedTransaction,
} from "../bankingTypes";
import type { CsvColumnMapping } from "../bankingTypes";
import type { StoreState } from "./storeState";
import { TENANT_ID, uid } from "./ids";
import {
  mapRows,
  resolveAmountDirection,
  validateRows,
  importFingerprint,
  normalizeDescription,
  parseCsv,
} from "../csvImport";
import { logReconEvent } from "./bankingShared";
import { runSuggestionsFor } from "./bankingMatch";

export function buildBankingImport(s: StoreState) {
  function importCsv(input: {
    accountId: string;
    csvText: string;
    mapping: CsvColumnMapping;
    fileName: string;
    openingBalance?: number | null;
    closingBalance?: number | null;
  }): {
    batchId: string;
    statementId: string | null;
    accepted: number;
    duplicates: number;
    errors: number;
  } {
    const { rows } = parseCsv(input.csvText);
    const parsed = mapRows(rows, input.mapping);
    const validation = validateRows(parsed);
    const batchId = uid("imbatch");
    const now = new Date().toISOString();
    let accepted = 0;
    let duplicates = 0;
    const newTxns: ImportedTransaction[] = [];
    for (const row of validation.validRows) {
      const ad = resolveAmountDirection(row);
      if (!ad) continue;
      const fp = importFingerprint(
        TENANT_ID,
        input.accountId,
        row,
        ad.direction,
        ad.amount,
      );
      if (s.importFingerprints.current.has(fp)) {
        duplicates++;
        continue;
      }
      if (s.importedTransactions.some((t) => t.import_fingerprint === fp)) {
        duplicates++;
        s.importFingerprints.current.add(fp);
        continue;
      }
      s.importFingerprints.current.add(fp);
      const id = uid("itxn");
      const txn: ImportedTransaction = {
        id,
        tenant_id: TENANT_ID,
        financial_account_id: input.accountId,
        statement_id: null,
        external_transaction_id: row.externalId ?? null,
        transaction_date: row.date!,
        posted_date: row.postedDate ?? null,
        description: row.description ?? "",
        normalized_description: row.description
          ? normalizeDescription(row.description)
          : null,
        amount: ad.amount,
        direction: ad.direction,
        currency: "USD",
        running_balance: row.runningBalance ?? null,
        merchant_name: row.merchant ?? null,
        transaction_type: null,
        reference: row.reference ?? null,
        raw_data: row.raw as Record<string, unknown>,
        import_batch_id: batchId,
        import_fingerprint: fp,
        review_status: "unreviewed",
        match_status: "unmatched",
        transfer_status: "none",
        created_at: now,
        updated_at: now,
      };
      newTxns.push(txn);
      accepted++;
    }
    s.setImportedTransactions((t) => [...newTxns, ...t]);

    // Create a statement if we have a date range.
    let statementId: string | null = null;
    if (validation.dateRange.start && validation.dateRange.end) {
      statementId = uid("stmt");
      const stmt: FinancialStatement = {
        id: statementId,
        tenant_id: TENANT_ID,
        financial_account_id: input.accountId,
        statement_start_date: validation.dateRange.start,
        statement_end_date: validation.dateRange.end,
        opening_balance: input.openingBalance ?? null,
        closing_balance: input.closingBalance ?? null,
        source_file_name: input.fileName,
        import_batch_id: batchId,
        imported_at: now,
        imported_by_user_id: s.currentStaffId,
        reconciliation_status: "not_started",
        notes: null,
      };
      s.setStatements((st) => [stmt, ...st]);
      s.setImportedTransactions((t) =>
        t.map((x) =>
          newTxns.some((n) => n.id === x.id)
            ? { ...x, statement_id: statementId }
            : x,
        ),
      );
    }

    const batch: ImportBatch = {
      id: batchId,
      tenant_id: TENANT_ID,
      financial_account_id: input.accountId,
      source_file_name: input.fileName,
      source: "csv",
      imported_at: now,
      imported_by_user_id: s.currentStaffId,
      row_count: parsed.length,
      accepted_rows: accepted,
      duplicate_rows: duplicates,
      error_rows: validation.invalidRows.length,
      errors: validation.invalidRows.map((e) => ({
        row: e.row.rowIndex,
        reason: e.reason,
      })),
      hash: "",
    };
    s.setImportBatches((b) => [batch, ...b]);

    logReconEvent(s, {
      statement_id: statementId,
      event_type: "imported",
      label: `Imported ${accepted} transactions from ${input.fileName}`,
      note: `${duplicates} duplicates skipped, ${validation.invalidRows.length} errors`,
    });

    // Run auto-match suggestions for the new transactions.
    for (const txn of newTxns) runSuggestionsFor(s, txn);

    return {
      batchId,
      statementId,
      accepted,
      duplicates,
      errors: validation.invalidRows.length,
    };
  }

  function rollbackImportBatch(batchId: string): boolean {
    const batch = s.importBatches.find((b) => b.id === batchId);
    if (!batch) return false;
    const batchTxns = s.importedTransactions.filter(
      (t) => t.import_batch_id === batchId,
    );
    const hasMatched = batchTxns.some(
      (t) =>
        t.match_status === "matched" ||
        t.match_status === "split_matched" ||
        s.reconciliationMatches.some(
          (m) => m.imported_transaction_id === t.id && !m.voided_at,
        ),
    );
    if (hasMatched) return false;
    const txnIds = new Set(batchTxns.map((t) => t.id));
    s.setImportedTransactions((t) => t.filter((x) => !txnIds.has(x.id)));
    s.setImportBatches((b) => b.filter((x) => x.id !== batchId));
    for (const t of batchTxns)
      s.importFingerprints.current.delete(t.import_fingerprint);
    s.setStatements((st) => st.filter((x) => x.import_batch_id !== batchId));
    return true;
  }

  return { importCsv, rollbackImportBatch };
}
