// Connect Pro Fleet — Build #19 migration / data import domain types.
//
// Two distinct kinds of imported data:
//   OPERATIONAL STATE  — current customers, vehicles, active rentals, held
//     deposits, opening balances. Fleet needs these to operate now.
//   HISTORICAL SUMMARY — prior monthly/quarterly/yearly/lifetime revenue,
//     collections, expenses, profit. Reporting continuity only — NEVER creates
//     ledger transactions, invoices, expenses, or bank transactions.
//
// Active rentals carry a `rental_origin` marker so they never pretend to have
// been created through Fleet checkout. An opening balance is a real customer
// obligation (a `migration_opening_balance` ledger charge) but is categorized
// separately from current-period earned revenue. A migrated held deposit is
// recorded as held money WITHOUT a current-day cash collection.

import type { VehicleOwnershipType } from "./ownershipTypes";
import type { BillingFrequency } from "./billingTypes";
import type { RateType } from "./types";

// ---------------------------------------------------------------------------
// Import batches + issues
// ---------------------------------------------------------------------------

export type ImportType =
  | "vehicles"
  | "customers"
  | "active_rentals"
  | "investors"
  | "partners"
  | "historical_financials"
  | "reservations"
  | "other";

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  vehicles: "Vehicles",
  customers: "Customers",
  active_rentals: "Active Rentals",
  investors: "Investors / Partners",
  partners: "Partners",
  historical_financials: "Historical Financials",
  reservations: "Reservations",
  other: "Other",
};

export type RollbackStatus =
  "available" | "partial" | "blocked" | "rolled_back";

export interface MigrationImportBatch {
  id: string;
  tenant_id: string;
  import_type: ImportType;
  source_name: string; // e.g. "HQ Rental Software", "Spreadsheet", "Manual"
  source_file_name: string | null;
  imported_by_user_id: string;
  imported_at: string;
  row_count: number;
  success_count: number;
  skipped_count: number;
  warning_count: number;
  error_count: number;
  rollback_status: RollbackStatus;
  /** IDs of records created by this batch (for safe rollback). */
  created_record_ids: string[];
  metadata: Record<string, unknown> | null;
}

export type IssueSeverity = "info" | "warning" | "error" | "blocking";

export interface MigrationIssue {
  id: string;
  tenant_id: string;
  batch_id: string | null;
  row_number: number | null;
  entity_type: ImportType;
  severity: IssueSeverity;
  code: string;
  message: string;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Rental origin (native vs imported legacy)
// ---------------------------------------------------------------------------

export type RentalOrigin = "native" | "imported_legacy";

// ---------------------------------------------------------------------------
// Historical financial summary (reporting continuity ONLY)
// ---------------------------------------------------------------------------

export type HistoricalGranularity =
  "month" | "quarter" | "year" | "lifetime_opening";

export const HISTORICAL_GRANULARITY_LABELS: Record<
  HistoricalGranularity,
  string
> = {
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
  lifetime_opening: "Lifetime Opening",
};

export type HistoricalSource =
  | "hq_rental"
  | "rent_centric"
  | "rentsyst"
  | "spreadsheet"
  | "quickbooks"
  | "manual"
  | "accountant_summary"
  | "other";

export const HISTORICAL_SOURCE_LABELS: Record<HistoricalSource, string> = {
  hq_rental: "HQ Rental Software",
  rent_centric: "Rent Centric",
  rentsyst: "RentSyst",
  spreadsheet: "Spreadsheet",
  quickbooks: "QuickBooks",
  manual: "Manual entry",
  accountant_summary: "Accountant summary",
  other: "Other",
};

export interface HistoricalFinancialPeriod {
  id: string;
  tenant_id: string;
  period_start: string; // ISO date (first day of period)
  period_end: string; // ISO date (last day of period)
  granularity: HistoricalGranularity;
  source_system: HistoricalSource;
  revenue: number;
  collections: number | null; // optional — unknown stays null
  expenses: number | null;
  net_profit: number | null;
  rental_count: number | null;
  vehicle_count: number | null;
  notes: string | null;
  import_batch_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Imported active rental — the input shape for the import flow
// ---------------------------------------------------------------------------

export interface ImportedActiveRentalInput {
  external_agreement_id: string | null;
  customer_id: string; // resolved Fleet customer id
  vehicle_id: string; // resolved Fleet vehicle id
  rental_start_date: string; // ISO date
  current_rate: number;
  rate_type: RateType;
  billing_frequency: BillingFrequency;
  next_payment_due_date: string | null; // ISO date
  next_payment_due_time: string | null; // "HH:MM"
  current_term_end_date: string | null; // ISO date (null = open-ended)
  opening_balance: number;
  late_balance: number;
  deposit_held: number;
  payment_method: string | null;
  status: string; // mapped to canonical RentalStatus
  location_id: string | null;
  notes: string | null;
  responsible_staff_id: string | null;
}

// ---------------------------------------------------------------------------
// Migration audit events
// ---------------------------------------------------------------------------

export type MigrationEventType =
  | "batch_created"
  | "validated"
  | "imported"
  | "row_skipped"
  | "duplicate_linked"
  | "rolled_back"
  | "historical_summary_added"
  | "opening_balance_created"
  | "deposit_migrated";

export interface MigrationEvent {
  id: string;
  tenant_id: string;
  batch_id: string | null;
  event_type: MigrationEventType;
  label: string;
  actor_user_id: string | null;
  at: string;
  metadata: Record<string, unknown> | null;
}
