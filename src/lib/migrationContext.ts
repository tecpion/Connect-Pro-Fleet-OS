// Connect Pro Fleet — Build #19 migration store interface.
//
// The migration store owns: import batches, migration issues, historical
// financial periods, and the import/rollback methods. Active-rental import,
// opening-balance creation, and deposit migration coordinate with the MAIN
// store (vehicles, customers, rentals, ledger, deposits) — they do NOT
// duplicate financial truth. Historical summaries are reporting-continuity
// records only and never create ledger/invoice/expense/bank transactions.

import type {
  HistoricalFinancialPeriod,
  HistoricalGranularity,
  HistoricalSource,
  ImportType,
  MigrationEvent,
  MigrationImportBatch,
  MigrationIssue,
  ImportedActiveRentalInput,
} from "./migrationTypes";
import type {
  VehicleImportInput,
  VehicleImportResult,
  CustomerImportInput,
  CustomerImportResult,
} from "./migrationCommit";
import type {
  InvestorImportInput,
  InvestorImportResult,
} from "./migrationInvestorCommit";

export interface MigrationMethods {
  // --- batches + issues ---
  migrationBatches: MigrationImportBatch[];
  migrationIssues: MigrationIssue[];
  migrationEvents: MigrationEvent[];
  historicalPeriods: HistoricalFinancialPeriod[];

  createBatch: (input: {
    import_type: ImportType;
    source_name: string;
    source_file_name?: string | null;
    row_count: number;
    metadata?: Record<string, unknown> | null;
  }) => MigrationImportBatch;
  finalizeBatch: (
    batchId: string,
    counts: {
      success_count: number;
      skipped_count: number;
      warning_count: number;
      error_count: number;
      created_record_ids?: string[];
    },
  ) => void;
  addIssue: (input: {
    batch_id?: string | null;
    row_number?: number | null;
    entity_type: ImportType;
    severity: "info" | "warning" | "error" | "blocking";
    code: string;
    message: string;
    resolution?: string | null;
  }) => void;
  rollbackBatch: (batchId: string) => { ok: boolean; error?: string };

  // --- historical financials ---
  addHistoricalPeriod: (input: {
    period_start: string;
    period_end: string;
    granularity: HistoricalGranularity;
    source_system: HistoricalSource;
    revenue: number;
    collections?: number | null;
    expenses?: number | null;
    net_profit?: number | null;
    rental_count?: number | null;
    vehicle_count?: number | null;
    notes?: string | null;
    batch_id?: string | null;
  }) => { ok: boolean; error?: string; period?: HistoricalFinancialPeriod };
  deleteHistoricalPeriod: (id: string) => void;

  // --- active rental import (coordinates with main store) ---
  importActiveRental: (input: ImportedActiveRentalInput) => {
    ok: boolean;
    error?: string;
    rental_id?: string;
  };

  // --- entity imports (vehicles, customers, investors) ---
  importVehicle: (
    input: VehicleImportInput,
    mode: "skip" | "link" | "create",
  ) => VehicleImportResult;
  importCustomer: (
    input: CustomerImportInput,
    mode: "skip" | "link" | "create",
  ) => CustomerImportResult;
  importInvestor: (
    input: InvestorImportInput,
    mode: "skip" | "link" | "create",
  ) => InvestorImportResult;
}

export interface MigrationStore extends MigrationMethods {}
