// Connect Pro Fleet — Build #18 shared report inputs.
//
// Bridges the main store + investor/partnership providers into the
// ProfitabilityInputs shape used by profitability selectors, so report
// selectors never rebuild the wiring. Also exposes a ReportFilter type used
// across all report selectors for consistent date/location/vehicle scoping.

import type { FleetStore } from "./store";
import type { ProfitabilityInputs } from "./profitabilitySelectors";
import type { InvestorVehicle } from "./investorTypes";
import type { PartnershipExpenseRule } from "./partnershipTypes";

export interface ReportFilter {
  start: string; // ISO date (yyyy-mm-dd), inclusive
  end: string; // ISO date (yyyy-mm-dd), inclusive
  locationId?: string | null;
  vehicleId?: string | null;
  vehicleClassId?: string | null;
  ownershipType?: string | null;
  staffId?: string | null;
}

export function buildReportInputs(
  store: FleetStore,
  investorVehicles: InvestorVehicle[],
  expenseRules: PartnershipExpenseRule[],
): ProfitabilityInputs {
  return {
    transactions: store.transactions,
    expenses: store.expenses,
    expenseLineItems: store.expenseLineItems,
    expenseCategories: store.expenseCategories,
    feeRules: store.feeRules,
    vehicles: store.vehicles,
    vehicleClasses: store.vehicleClasses,
    locations: store.locations,
    rentals: store.rentals,
    exchanges: store.rentals.flatMap((r) => store.vehicleExchanges(r.id)),
    investorVehicles,
    expenseRules,
    importedTransactions: store.importedTransactions,
    expenseReceipts: store.expenseReceipts,
    expenseReimbursements: store.expenseReimbursements,
  };
}

/** Normalize a ReportFilter into a DateRange for profitability selectors. */
export function filterToDateRange(f: ReportFilter): {
  start: Date;
  end: Date;
} {
  const start = new Date(f.start + "T00:00:00");
  const end = new Date(f.end + "T23:59:59");
  return { start, end };
}

/** Does a vehicle match the report filter's vehicle/class/ownership/location scope? */
export function vehicleMatchesFilter(
  vehicleId: string,
  store: FleetStore,
  f: ReportFilter,
): boolean {
  if (f.vehicleId && f.vehicleId !== vehicleId) return false;
  const v = store.vehicles.find((x) => x.id === vehicleId);
  if (!v) return false;
  if (f.vehicleClassId && v.vehicle_class_id !== f.vehicleClassId) return false;
  if (
    f.ownershipType &&
    (v.ownership_type ?? "company_owned") !== f.ownershipType
  )
    return false;
  if (f.locationId && v.location !== f.locationId) return false;
  return true;
}

/** Does a rental match the filter (vehicle/location/class/ownership)? */
export function rentalMatchesFilter(
  rentalId: string,
  store: FleetStore,
  f: ReportFilter,
): boolean {
  const r = store.rentals.find((x) => x.id === rentalId);
  if (!r) return false;
  return vehicleMatchesFilter(r.vehicle_id, store, f);
}
