// Connect Pro Fleet — Profitability & P&L domain types (Build #16).
//
// Profitability is DERIVED — never a mutable stored field. These types are the
// shaped results of the profitability selectors over the authoritative Rental
// Financial Ledger + Accounting Expense Ledger. They combine operational
// financial systems already built (rental ledger, expense ledger, maintenance,
// ownership/JV, deposits, taxes & fees, bank reconciliation) into three
// distinct views: Vehicle P&L, Fleet P&L, Company P&L.
//
// This is operational/management P&L — NOT GAAP financial reporting or tax
// accounting. No balance sheet, depreciation, equity, or accrual accounting.
//
// Revenue recognition rules (centralized, never duplicated in components):
//   - Base rental charges + recognized operator fees + late fees + deposit
//     forfeitures (recognized once) = operating revenue.
//   - Held deposit COLLECTION/REFUND are NOT revenue (held money).
//   - Deposit APPLICATION is NOT new revenue (settles an existing charge).
//   - Customer TAX is NOT operator revenue (pass-through liability).
//   - Payment arrangement PROMISES are NOT revenue or collections.
//   - Fees use FeeRule.include_in_vehicle_revenue for vehicle-level eligibility.
//
// Expense rules:
//   - ExpenseTransaction is authoritative. Maintenance work-order costs flow
//     in as linked expenses (counted ONCE, never as WO cost + expense).
//   - Reimbursement settlement is NOT a second expense.
//   - Petty cash funding, bank transfers, owner transfers are NOT expenses.
//   - Vehicle acquisition spend is shown SEPARATELY from operating profit.
//   - Company overhead is excluded from Vehicle P&L by default.

import type { VehicleOwnershipType } from "./ownershipTypes";
import type { CompensationArrangement } from "./ownershipTypes";

/** A recognized revenue line bucket for reporting. */
export interface RevenueBreakdown {
  base_rental_revenue: number;
  fee_revenue: number; // eligible fees only (vehicle-level)
  late_fee_revenue: number;
  forfeiture_revenue: number; // deposit forfeitures recognized once
  other_revenue: number;
  tax_collected: number; // pass-through, NOT revenue
  total_revenue: number; // sum of the above EXCLUDING tax_collected
}

/** A direct-vehicle expense breakdown by category. */
export interface VehicleExpenseBreakdown {
  maintenance_expenses: number;
  registration_expenses: number;
  insurance_expenses: number;
  fuel_expenses: number;
  other_vehicle_expenses: number;
  total_direct_expenses: number; // excludes acquisition spend
  acquisition_spend: number; // vehicle purchase cost — shown separately
}

/** Per-vehicle profitability for a date range. */
export interface VehicleProfitability {
  vehicle_id: string;
  period_start: string;
  period_end: string;
  // Revenue
  billed_revenue: number;
  collected_amount: number;
  revenue: RevenueBreakdown;
  // Expenses
  expenses: VehicleExpenseBreakdown;
  // Profit
  gross_profit: number; // revenue - direct expenses (excl. overhead, excl. acquisition)
  net_contribution: number; // company economic share after partner compensation
  // Utilization
  rented_days: number;
  available_days: number;
  utilization_rate: number; // rented / available (0..100)
  revenue_per_rented_day: number;
  expense_per_rented_day: number;
  profit_per_rented_day: number;
  // Receivables
  outstanding_balance: number;
  // Ownership economics (permission-aware — caller gates display)
  ownership_type: VehicleOwnershipType;
  investor_compensation: number | null; // projected partner share (null if custom/unknown)
  company_economic_share: number | null; // operating profit - partner compensation
  compensation_type: CompensationArrangement["type"] | null;
}

/** Fleet-wide profitability for a date range. */
export interface FleetProfitability {
  period_start: string;
  period_end: string;
  total_billed_revenue: number;
  total_collections: number;
  outstanding_receivables: number;
  revenue: RevenueBreakdown;
  vehicle_direct_expenses: number;
  maintenance_expenses: number;
  acquisition_spend: number;
  gross_fleet_profit: number;
  total_partner_compensation: number | null;
  company_fleet_contribution: number | null;
  active_vehicle_count: number;
  rented_vehicle_count: number;
  utilization: number;
  average_revenue_per_vehicle: number;
  average_profit_per_vehicle: number;
}

/** Company-level P&L for a date range. */
export interface CompanyProfitability {
  period_start: string;
  period_end: string;
  operating_revenue: number;
  collections: number;
  outstanding_receivables: number;
  revenue: RevenueBreakdown;
  fleet_direct_expenses: number;
  gross_fleet_profit: number;
  company_overhead: number;
  processor_fees: number;
  partner_compensation: number | null;
  operating_profit: number;
  margin_percent: number;
  acquisition_spend: number;
  // Informational data-quality indicators (do NOT alter profit totals)
  unreconciled_transactions: number;
  missing_receipts: number;
  reimbursements_outstanding: number;
}

/** A single vehicle's row in the fleet performance table. */
export interface VehiclePerformanceRow {
  vehicle_id: string;
  label: string;
  class_name: string | null;
  ownership_type: VehicleOwnershipType;
  revenue: number;
  collections: number;
  expenses: number;
  gross_profit: number;
  company_share: number | null;
  utilization: number;
  margin: number;
  rented_days: number;
}

/** Aggregation by vehicle class. */
export interface ClassProfitability {
  class_id: string | null;
  class_name: string;
  vehicle_count: number;
  revenue: number;
  expenses: number;
  gross_profit: number;
  utilization: number;
  revenue_per_vehicle: number;
}

/** Aggregation by location. */
export interface LocationProfitability {
  location_id: string | null;
  location_name: string;
  vehicle_count: number;
  revenue: number;
  expenses: number;
  gross_profit: number;
  utilization: number;
}

/** Date-range presets for profitability reports. */
export type ProfitabilityRange =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export const PROFITABILITY_RANGE_LABELS: Record<ProfitabilityRange, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  last_month: "Last Month",
  this_quarter: "This Quarter",
  this_year: "This Year",
  custom: "Custom",
};
