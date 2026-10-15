// Connect Pro Fleet — Build #19 migration CSV import helpers.
//
// Reuses the robust RFC-4180 parser from csvImport.ts (no naïve comma splits).
// Provides typed row mappers + dry-run validators for vehicles, customers,
// and historical financials. Dry runs create NO records — they return
// duplicates, missing required fields, bad dates, and invalid amounts.

import { parseCsv, parseStatementDate, parseAmount } from "./csvImport";
import type { ImportType } from "./migrationTypes";

export interface ParsedVehicleRow {
  rowIndex: number;
  raw: Record<string, string>;
  unit_number: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  class_name: string | null;
  daily_rate: number | null;
  weekly_rate: number | null;
  status: string | null;
  location: string | null;
  mileage: number | null;
  ownership_type: string | null;
}

export interface ParsedCustomerRow {
  rowIndex: number;
  raw: Record<string, string>;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  drivers_license: string | null;
  license_expiry: string | null;
  external_id: string | null;
}

export interface ParsedHistoricalRow {
  rowIndex: number;
  raw: Record<string, string>;
  period_start: string | null;
  period_end: string | null;
  granularity: string | null;
  revenue: number | null;
  collections: number | null;
  expenses: number | null;
  net_profit: number | null;
  rental_count: number | null;
}

export interface DryRunResult<T> {
  validRows: T[];
  invalidRows: { row: T; reason: string }[];
  duplicateRows: { row: T; reason: string }[];
  totalCount: number;
  validCount: number;
}

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    // case-insensitive header match
    const found = Object.keys(row).find(
      (h) => h.toLowerCase().trim() === k.toLowerCase(),
    );
    if (found && row[found].trim() !== "") return row[found].trim();
  }
  return null;
}

export function parseVehicleCsv(text: string): ParsedVehicleRow[] {
  const { rows } = parseCsv(text);
  return rows.map((raw, i) => ({
    rowIndex: i + 2,
    raw,
    unit_number: pick(raw, ["unit_number", "unit", "fleet_number"]),
    vin: pick(raw, ["vin"]),
    year: (() => {
      const y = pick(raw, ["year"]);
      return y ? Number(y) : null;
    })(),
    make: pick(raw, ["make"]),
    model: pick(raw, ["model"]),
    license_plate: pick(raw, ["license_plate", "plate", "registration"]),
    class_name: pick(raw, ["class", "vehicle_class", "category"]),
    daily_rate: (() => {
      const d = pick(raw, ["daily_rate", "daily"]);
      return d ? parseAmount(d) : null;
    })(),
    weekly_rate: (() => {
      const w = pick(raw, ["weekly_rate", "weekly"]);
      return w ? parseAmount(w) : null;
    })(),
    status: pick(raw, ["status"]),
    location: pick(raw, ["location", "branch", "yard"]),
    mileage: (() => {
      const m = pick(raw, ["mileage", "odometer"]);
      return m ? parseAmount(m) : null;
    })(),
    ownership_type: pick(raw, ["ownership_type", "ownership"]),
  }));
}

export function parseCustomerCsv(text: string): ParsedCustomerRow[] {
  const { rows } = parseCsv(text);
  return rows.map((raw, i) => ({
    rowIndex: i + 2,
    raw,
    first_name: pick(raw, ["first_name", "firstname"]),
    last_name: pick(raw, ["last_name", "lastname"]),
    phone: pick(raw, ["phone", "mobile", "cell"]),
    email: pick(raw, ["email"]),
    drivers_license: pick(raw, ["drivers_license", "license_number", "dl"]),
    license_expiry: (() => {
      const d = pick(raw, [
        "license_expiry",
        "license_expiration",
        "dl_expiry",
      ]);
      return d ? parseStatementDate(d) : null;
    })(),
    external_id: pick(raw, ["external_id", "customer_id", "id"]),
  }));
}

export function parseHistoricalCsv(text: string): ParsedHistoricalRow[] {
  const { rows } = parseCsv(text);
  return rows.map((raw, i) => ({
    rowIndex: i + 2,
    raw,
    period_start: (() => {
      const d = pick(raw, ["period_start", "start_date", "month", "period"]);
      return d ? parseStatementDate(d) : null;
    })(),
    period_end: (() => {
      const d = pick(raw, ["period_end", "end_date"]);
      return d ? parseStatementDate(d) : null;
    })(),
    granularity: pick(raw, ["granularity", "type"])?.toLowerCase() ?? null,
    revenue: (() => {
      const r = pick(raw, ["revenue"]);
      return r ? parseAmount(r) : null;
    })(),
    collections: (() => {
      const c = pick(raw, ["collections", "collected"]);
      return c ? parseAmount(c) : null;
    })(),
    expenses: (() => {
      const e = pick(raw, ["expenses"]);
      return e ? parseAmount(e) : null;
    })(),
    net_profit: (() => {
      const n = pick(raw, ["net_profit", "profit", "net"]);
      return n ? parseAmount(n) : null;
    })(),
    rental_count: (() => {
      const r = pick(raw, ["rental_count", "rentals"]);
      return r ? parseAmount(r) : null;
    })(),
  }));
}

/** Dry-run validation for vehicles: requires make + model; VIN duplicate
 *  detection against existing VINs. Creates NO records. */
export function dryRunVehicles(
  rows: ParsedVehicleRow[],
  existingVins: string[],
): DryRunResult<ParsedVehicleRow> {
  const validRows: ParsedVehicleRow[] = [];
  const invalidRows: { row: ParsedVehicleRow; reason: string }[] = [];
  const duplicateRows: { row: ParsedVehicleRow; reason: string }[] = [];
  const seenVins = new Set(existingVins.map((v) => v.toLowerCase()));
  for (const row of rows) {
    if (!row.make || !row.model) {
      invalidRows.push({ row, reason: "Missing make or model" });
      continue;
    }
    if (row.vin) {
      const v = row.vin.toLowerCase();
      if (seenVins.has(v)) {
        duplicateRows.push({ row, reason: `Duplicate VIN: ${row.vin}` });
        continue;
      }
      seenVins.add(v);
    }
    validRows.push(row);
  }
  return {
    validRows,
    invalidRows,
    duplicateRows,
    totalCount: rows.length,
    validCount: validRows.length,
  };
}

/** Dry-run validation for customers: requires first + last name; phone/email
 *  duplicate detection. Weak name-only matches do NOT auto-merge. */
export function dryRunCustomers(
  rows: ParsedCustomerRow[],
  existingPhones: string[],
  existingEmails: string[],
): DryRunResult<ParsedCustomerRow> {
  const validRows: ParsedCustomerRow[] = [];
  const invalidRows: { row: ParsedCustomerRow; reason: string }[] = [];
  const duplicateRows: { row: ParsedCustomerRow; reason: string }[] = [];
  const seenPhones = new Set(existingPhones.filter(Boolean));
  const seenEmails = new Set(
    existingEmails.map((e) => e.toLowerCase()).filter(Boolean),
  );
  for (const row of rows) {
    if (!row.first_name || !row.last_name) {
      invalidRows.push({ row, reason: "Missing first or last name" });
      continue;
    }
    if (row.phone && seenPhones.has(row.phone)) {
      duplicateRows.push({ row, reason: `Duplicate phone: ${row.phone}` });
      continue;
    }
    if (row.email && seenEmails.has(row.email.toLowerCase())) {
      duplicateRows.push({ row, reason: `Duplicate email: ${row.email}` });
      continue;
    }
    if (row.phone) seenPhones.add(row.phone);
    if (row.email) seenEmails.add(row.email.toLowerCase());
    validRows.push(row);
  }
  return {
    validRows,
    invalidRows,
    duplicateRows,
    totalCount: rows.length,
    validCount: validRows.length,
  };
}

/** Dry-run validation for historical financials: requires period_start +
 *  revenue. Overlap detection is handled by the store on add. */
export function dryRunHistorical(
  rows: ParsedHistoricalRow[],
): DryRunResult<ParsedHistoricalRow> {
  const validRows: ParsedHistoricalRow[] = [];
  const invalidRows: { row: ParsedHistoricalRow; reason: string }[] = [];
  const duplicateRows: { row: ParsedHistoricalRow; reason: string }[] = [];
  for (const row of rows) {
    if (!row.period_start) {
      invalidRows.push({ row, reason: "Missing or invalid period start date" });
      continue;
    }
    if (row.revenue == null || isNaN(row.revenue)) {
      invalidRows.push({ row, reason: "Missing or invalid revenue" });
      continue;
    }
    validRows.push(row);
  }
  return {
    validRows,
    invalidRows,
    duplicateRows,
    totalCount: rows.length,
    validCount: validRows.length,
  };
}

export const IMPORT_TYPE_FOR: Record<string, ImportType> = {
  vehicle: "vehicles",
  customer: "customers",
  historical: "historical_financials",
};
