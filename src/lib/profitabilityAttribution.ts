// Connect Pro Fleet — revenue attribution + utilization helpers (Build #16).
//
// Handles vehicle revenue attribution across exchanges (a rental may serve
// multiple vehicles), rented-day calculation, and available-day calculation.
// Revenue is attributed by the days each vehicle served within the selected
// period (proportional allocation), unless the transaction carries an explicit
// vehicle_id (e.g. a per-period charge tied to the current vehicle).

import type { FinancialTransaction } from "./chargeTypes";
import type { RentalAgreement } from "./types";
import type { RentalVehicleExchange } from "./store/storeContext";
import type {
  ExpenseCategory,
  ExpenseLineItem,
  ExpenseTransaction,
} from "./expenseTypes";
import {
  DAY,
  inRange,
  round2,
  type DateRange,
  startOfDay,
  endOfDay,
  isAcquisitionExpense,
  expenseNet,
  emptyExpenseBreakdown,
} from "./profitabilityHelpers";
import type { VehicleExpenseBreakdown } from "./profitabilityTypes";

/** The effective vehicle for a transaction, preferring explicit vehicle_id. */
export function transactionVehicle(
  t: FinancialTransaction,
  rental: RentalAgreement | undefined,
): string | null {
  if (t.vehicle_id) return t.vehicle_id;
  return rental?.vehicle_id ?? null;
}

/** Days a rental overlapped [start, end], capped to the period. */
export function rentalDaysInRange(
  rental: RentalAgreement,
  range: DateRange,
): number {
  const start = rental.checkout_date
    ? new Date(rental.checkout_date + "T00:00:00")
    : new Date(rental.created_at);
  const endRaw = rental.actual_return_date ?? rental.scheduled_return_date;
  const end = endRaw ? new Date(endRaw + "T00:00:00") : range.end;
  const s = start < range.start ? range.start : start;
  const e = end > range.end ? range.end : end;
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / DAY) + 1;
}

/** Build a map of vehicle_id -> fraction-of-rental-days for a rental over the
 *  period, accounting for exchanges. The current vehicle serves from the last
 *  exchange date (or checkout) through return; each prior vehicle served from
 *  checkout (or prior exchange) until the next exchange. */
export function vehicleDayFractions(
  rental: RentalAgreement,
  exchanges: RentalVehicleExchange[],
  range: DateRange,
): Map<string, number> {
  const frac = new Map<string, number>();
  const checkout = rental.checkout_date
    ? new Date(rental.checkout_date + "T00:00:00")
    : new Date(rental.created_at);
  const returnDate = rental.actual_return_date ?? rental.scheduled_return_date;
  const ret = returnDate ? new Date(returnDate + "T00:00:00") : range.end;

  const exs = [...exchanges]
    .filter((e) => e.rental_id === rental.id)
    .sort((a, b) => (a.exchange_at < b.exchange_at ? -1 : 1));

  // Build segments: [{ vehicle, from, to }]. The rental starts with the FIRST
  // exchange's old_vehicle_id (the original vehicle), and each exchange
  // transitions to its new_vehicle_id. The final segment's vehicle equals
  // rental.vehicle_id (the current vehicle).
  const segments: { vehicle: string; from: Date; to: Date }[] = [];
  let cursor = checkout;
  let currentVehicle =
    exs.length > 0 ? exs[0].old_vehicle_id : rental.vehicle_id;
  for (const ex of exs) {
    const at = new Date(ex.exchange_at);
    if (at > cursor) {
      segments.push({ vehicle: currentVehicle, from: cursor, to: at });
    }
    currentVehicle = ex.new_vehicle_id;
    cursor = at;
  }
  segments.push({ vehicle: currentVehicle, from: cursor, to: ret });

  let total = 0;
  const perVehicle = new Map<string, number>();
  for (const seg of segments) {
    const s = seg.from < range.start ? range.start : seg.from;
    const e = seg.to > range.end ? range.end : seg.to;
    if (e < s) continue;
    const days = Math.floor((e.getTime() - s.getTime()) / DAY) + 1;
    if (days <= 0) continue;
    perVehicle.set(seg.vehicle, (perVehicle.get(seg.vehicle) ?? 0) + days);
    total += days;
  }
  if (total === 0) return frac;
  for (const [vid, days] of perVehicle) {
    frac.set(vid, days / total);
  }
  return frac;
}

/** Attribute a transaction's revenue amount across vehicles for a rental that
 *  may have exchanged. Returns a map of vehicle_id -> allocated amount. */
export function attributeRevenueToVehicles(
  t: FinancialTransaction,
  rental: RentalAgreement | undefined,
  exchanges: RentalVehicleExchange[],
  range: DateRange,
): Map<string, number> {
  const out = new Map<string, number>();
  const explicit = transactionVehicle(t, rental);
  if (explicit) {
    out.set(explicit, t.amount);
    return out;
  }
  if (!rental) return out;
  const fracs = vehicleDayFractions(rental, exchanges, range);
  for (const [vid, f] of fracs) {
    out.set(vid, round2(t.amount * f));
  }
  return out;
}

/** Rented days for a vehicle within range (sum across its rentals, with
 *  exchange day-fraction allocation so an exchanged rental credits each
 *  vehicle only for the days it actually served). */
export function vehicleRentedDays(
  vehicleId: string,
  rentals: RentalAgreement[],
  exchanges: RentalVehicleExchange[],
  range: DateRange,
): number {
  let days = 0;
  for (const r of rentals) {
    const served =
      r.vehicle_id === vehicleId ||
      exchanges.some(
        (e) =>
          e.rental_id === r.id &&
          (e.old_vehicle_id === vehicleId || e.new_vehicle_id === vehicleId),
      );
    if (!served) continue;
    const fracs = vehicleDayFractions(r, exchanges, range);
    const f = fracs.get(vehicleId) ?? 0;
    const totalDays = rentalDaysInRange(r, range);
    days += Math.round(totalDays * f);
  }
  return days;
}

/** Available days for a vehicle within range (calendar days in the period). */
export function vehicleAvailableDays(range: DateRange): number {
  const periodDays =
    Math.floor((range.end.getTime() - range.start.getTime()) / DAY) + 1;
  return Math.max(0, periodDays);
}

/** Vehicle direct expenses (net) for a vehicle within range, EXCLUDING
 *  maintenance-work-order-sourced expenses (counted via maintenance path) and
 *  acquisition spend. Handles split line items. */
export function vehicleDirectExpenses(
  expenses: ExpenseTransaction[],
  lineItems: ExpenseLineItem[],
  categories: ExpenseCategory[],
  vehicleId: string,
  range: DateRange,
): { breakdown: VehicleExpenseBreakdown; maintenanceExpenses: number } {
  const liByExpense = new Map<string, ExpenseLineItem[]>();
  for (const li of lineItems) {
    const arr = liByExpense.get(li.expense_id) ?? [];
    arr.push(li);
    liByExpense.set(li.expense_id, arr);
  }

  const bd = emptyExpenseBreakdown();
  let maintenanceExpenses = 0;

  for (const e of expenses) {
    if (e.status === "voided") continue;
    if (!inRange(e.transaction_date, range.start, range.end)) continue;
    const isMaint = e.source === "maintenance_work_order";
    const isAcq = isAcquisitionExpense(e, categories);
    const lines = liByExpense.get(e.id) ?? [];
    const hasLines = lines.length > 0;

    // Determine the amount(s) attributable to this vehicle. When the expense
    // is split via line items, allocate only the line-item portions for this
    // vehicle (so a $400 split expense credits veh_1 $250, not $400).
    const vehicleLineAmount = lines
      .filter((l) => l.vehicle_id === vehicleId)
      .reduce((s, l) => s + expenseNet({ ...e, amount: l.amount }), 0);
    const touchesVehicle =
      e.vehicle_id === vehicleId || vehicleLineAmount !== 0;
    if (!touchesVehicle) continue;

    // For a split expense, use the line-item amount for this vehicle. For a
    // non-split expense with a header vehicle_id match, use the full net.
    const net = hasLines ? vehicleLineAmount : expenseNet(e);
    if (net === 0) continue;

    if (isAcq) {
      bd.acquisition_spend += net;
      continue;
    }
    if (isMaint) {
      maintenanceExpenses += net;
      bd.maintenance_expenses += net;
      continue;
    }
    const cat = categories.find((c) => c.id === e.expense_category_id);
    const name = (cat?.name ?? "").toLowerCase();
    if (name.includes("registration")) bd.registration_expenses += net;
    else if (name.includes("insurance")) bd.insurance_expenses += net;
    else if (name.includes("fuel")) bd.fuel_expenses += net;
    else bd.other_vehicle_expenses += net;
  }
  bd.total_direct_expenses =
    bd.maintenance_expenses +
    bd.registration_expenses +
    bd.insurance_expenses +
    bd.fuel_expenses +
    bd.other_vehicle_expenses;
  return { breakdown: bd, maintenanceExpenses };
}

export { startOfDay, endOfDay };
