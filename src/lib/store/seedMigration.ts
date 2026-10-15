// Connect Pro Fleet — Build #19 seed: migration data.
//
// Seeds one imported legacy active rental (with a migration opening balance
// charge + a migrated held deposit), a few historical monthly financial
// periods, and one import batch. The opening balance is a real customer
// obligation but is excluded from earned revenue (isRevenueCharge). The
// migrated deposit is held money, NOT current-period collection/revenue.

import type {
  FinancialTransaction,
  RentalAgreement,
  RentalEvent,
} from "../types";
import type { RentalDeposit, DepositHistoryEvent } from "../depositTypes";
import type {
  HistoricalFinancialPeriod,
  MigrationImportBatch,
} from "../migrationTypes";
import { TENANT_ID } from "./ids";

// Imported legacy rental — Marcus Delgado, weekly, migrated Aug 20.
// Vehicle veh_7 (Chevrolet Express 2500) is marked rented by this rental.
export const importedRentals: RentalAgreement[] = [
  {
    id: "rnt_mig_1",
    tenant_id: TENANT_ID,
    reservation_id: null,
    customer_id: "cus_3",
    vehicle_id: "veh_7",
    agreement_number: "AGR-2026-000131",
    status: "active",
    checkout_date: "2026-07-15",
    checkout_time: null,
    scheduled_return_date: "",
    scheduled_return_time: null,
    actual_return_date: null,
    actual_return_time: null,
    rate_type: "weekly",
    rate_amount: 350,
    subtotal: 350,
    tax: 0,
    fees: 0,
    discount: 0,
    deposit_amount: 300,
    amount_paid: 0,
    balance_due: 650,
    mileage_out: null,
    mileage_in: null,
    fuel_out: null,
    fuel_in: null,
    weekly_payment_day: "Monday",
    next_payment_due: "2026-09-02",
    payment_cutoff_time: "14:00",
    grace_period: 0,
    late_fee: 0,
    late_fee_applied: false,
    weeks_rented: 0,
    billing_config: {
      billing_frequency: "weekly",
      billing_anchor_date: "2026-09-02",
      recurring_amount: 350,
      auto_generate_periods: true,
      custom_schedule: null,
    },
    pricing_snapshot: null,
    rental_origin: "imported_legacy",
    migration_cutover_at: "2026-08-20",
    imported_legacy_rental: true,
    external_agreement_id: "HQ-AGR-55821",
    created_by: "stf_1",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
  },
];

export const importedRentalEvents: RentalEvent[] = [
  {
    id: "rev_mig_1",
    rental_id: "rnt_mig_1",
    type: "created",
    label: "Imported into Connect Pro Fleet — HQ-AGR-55821",
    at: "2026-08-20T10:00:00Z",
    tone: "neutral",
    staff_id: "stf_1",
  },
];

// Opening balance charge — real obligation, NOT current-period revenue.
export const migrationTransactions: FinancialTransaction[] = [
  {
    id: "txn_mig_ob_1",
    tenant_id: TENANT_ID,
    rental_id: "rnt_mig_1",
    reservation_id: null,
    customer_id: "cus_3",
    vehicle_id: "veh_7",
    invoice_id: null,
    deposit_id: null,
    transaction_type: "migration_opening_balance",
    category: "charge",
    description: "Migration opening balance — HQ-AGR-55821",
    amount: 650,
    direction: "charge",
    payment_method: null,
    external_transaction_id: null,
    status: "posted",
    effective_date: "2026-08-20",
    created_at: "2026-08-20T10:00:00Z",
    created_by: "stf_1",
    notes: "Pre-Fleet outstanding balance from HQ Rental Software",
    related_transaction_id: null,
    billing_period: null,
    metadata: {
      migration: true,
      external_rental_id: "HQ-AGR-55821",
      cutover_date: "2026-08-20",
    },
  },
  // Migrated held deposit — held money, NOT current-day collection/revenue.
  {
    id: "txn_mig_dep_1",
    tenant_id: TENANT_ID,
    rental_id: "rnt_mig_1",
    reservation_id: null,
    customer_id: "cus_3",
    vehicle_id: "veh_7",
    invoice_id: null,
    deposit_id: "dep_mig_1",
    transaction_type: "other_payment",
    category: "payment",
    description: "Migrated security deposit held — $300",
    amount: 300,
    direction: "payment",
    payment_method: "card",
    external_transaction_id: null,
    status: "posted",
    effective_date: "2026-08-20",
    created_at: "2026-08-20T10:00:00Z",
    created_by: "stf_1",
    notes: "Migrated held deposit (pre-Fleet)",
    related_transaction_id: null,
    billing_period: null,
    metadata: {
      deposit: true,
      deposit_kind: "collection",
      migration: true,
      deposit_id: "dep_mig_1",
    },
  },
];

// Migrated held deposit record.
export const migrationDeposits: RentalDeposit[] = [
  {
    id: "dep_mig_1",
    tenant_id: TENANT_ID,
    reservation_id: null,
    rental_id: "rnt_mig_1",
    customer_id: "cus_3",
    vehicle_id: "veh_7",
    policy_id: null,
    required_amount: 300,
    collected_amount: 300,
    applied_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0,
    status: "held",
    currency: "USD",
    source_snapshot: { source: "manual", policy_name: null, class_name: null },
    collected_at: "2026-08-20",
    refund_due_at: null,
    completed_at: null,
    notes: "Migrated held deposit (pre-Fleet)",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    created_by: "stf_1",
  },
];

export const migrationDepositHistory: DepositHistoryEvent[] = [
  {
    id: "dhe_mig_1",
    tenant_id: TENANT_ID,
    deposit_id: "dep_mig_1",
    event_type: "collected",
    amount: 300,
    payment_method: "card",
    transaction_id: "txn_mig_dep_1",
    reason: null,
    staff_id: "stf_1",
    at: "2026-08-20T10:00:00Z",
    request_key: "mig_dep_mig_1",
  },
];

// Historical monthly financial periods (reporting continuity only).
export const historicalPeriods: HistoricalFinancialPeriod[] = [
  {
    id: "hfp_1",
    tenant_id: TENANT_ID,
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    granularity: "month",
    source_system: "hq_rental",
    revenue: 82000,
    collections: 79500,
    expenses: 34000,
    net_profit: 48000,
    rental_count: 142,
    vehicle_count: 38,
    notes: "June 2026 — pre-Fleet",
    import_batch_id: "mib_seed_1",
    created_at: "2026-08-20T10:05:00Z",
  },
  {
    id: "hfp_2",
    tenant_id: TENANT_ID,
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    granularity: "month",
    source_system: "hq_rental",
    revenue: 88500,
    collections: 86200,
    expenses: 36500,
    net_profit: 52000,
    rental_count: 158,
    vehicle_count: 41,
    notes: "July 2026 — pre-Fleet",
    import_batch_id: "mib_seed_1",
    created_at: "2026-08-20T10:05:00Z",
  },
];

// One import batch representing the historical-financials import.
export const migrationBatches: MigrationImportBatch[] = [
  {
    id: "mib_seed_1",
    tenant_id: TENANT_ID,
    import_type: "historical_financials",
    source_name: "HQ Rental Software",
    source_file_name: "historical-2026.csv",
    imported_by_user_id: "stf_1",
    imported_at: "2026-08-20T10:05:00Z",
    row_count: 2,
    success_count: 2,
    skipped_count: 0,
    warning_count: 0,
    error_count: 0,
    rollback_status: "available",
    created_record_ids: [],
    metadata: { seed: true },
  },
];
