// Connect Pro Fleet — Customer CSV import/export helpers (Build #38 — Customers V1).
//
// Reuses the robust RFC-4180 parser from csvImport.ts (no naïve comma splits).
// Provides:
//   - column auto-suggestion (Mobile → Phone, "License #" → Driver License #, ...)
//   - typed row mappers for the Customers page import (not the migration center)
//   - phone/email/license duplicate detection (name-only never auto-merges)
//   - error CSV generation for failed rows
//   - CSV export with permission-gated sensitive fields
//
// The Customers-page import reuses the migration store's commitCustomerImport
// (which reuses addCustomer) — it does NOT create a second customer model. The
// export respects the permission catalog (customers.view_license /
// customers.view_insurance / customers.view_financials) so sensitive fields are
// never included just because a CSV export exists.

import { parseCsv, parseStatementDate } from "./csvImport";
import type { Customer, CustomerStatus } from "./types";
import type { CustomerTag } from "./customerTagStore";

// ---------------------------------------------------------------------------
// Column mapping + auto-suggestion
// ---------------------------------------------------------------------------

export type CustomerImportField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "phone"
  | "email"
  | "drivers_license"
  | "license_state"
  | "license_expiry"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "date_of_birth"
  | "lifecycle"
  | "standing"
  | "tags"
  | "notes"
  | "external_id";

export const CUSTOMER_IMPORT_FIELDS: CustomerImportField[] = [
  "first_name",
  "last_name",
  "full_name",
  "phone",
  "email",
  "drivers_license",
  "license_state",
  "license_expiry",
  "address",
  "city",
  "state",
  "zip",
  "date_of_birth",
  "lifecycle",
  "standing",
  "tags",
  "notes",
  "external_id",
];

/** Auto-suggest a field for a source header (case-insensitive, fuzzy). */
export function suggestField(header: string): CustomerImportField | null {
  const h = header.toLowerCase().trim();
  if (h === "first" || h === "first_name" || h === "firstname")
    return "first_name";
  if (h === "last" || h === "last_name" || h === "lastname" || h === "surname")
    return "last_name";
  if (
    h === "name" ||
    h === "full_name" ||
    h === "customer" ||
    h === "customer_name"
  )
    return "full_name";
  if (
    h === "phone" ||
    h === "mobile" ||
    h === "cell" ||
    h === "phone_number" ||
    h === "tel"
  )
    return "phone";
  if (h === "email" || h === "email_address" || h === "e_mail") return "email";
  if (
    h === "license" ||
    h === "license_number" ||
    h === "license #" ||
    h === "dl" ||
    h === "drivers_license" ||
    h === "driver_license"
  )
    return "drivers_license";
  if (h === "license_state" || h === "dl_state" || h === "state_issued")
    return "license_state";
  if (
    h === "license_expiry" ||
    h === "license_expiration" ||
    h === "dl_expiry" ||
    h === "license_exp"
  )
    return "license_expiry";
  if (h === "address" || h === "street" || h === "street_address")
    return "address";
  if (h === "city") return "city";
  if (h === "state" || h === "province") return "state";
  if (h === "zip" || h === "zip_code" || h === "postal" || h === "postal_code")
    return "zip";
  if (h === "dob" || h === "date_of_birth" || h === "birthday")
    return "date_of_birth";
  if (h === "lifecycle" || h === "customer_lifecycle") return "lifecycle";
  if (h === "standing" || h === "status" || h === "customer_status")
    return "standing";
  if (h === "tags" || h === "tag") return "tags";
  if (h === "notes" || h === "note" || h === "comments") return "notes";
  if (h === "external_id" || h === "customer_id" || h === "id" || h === "ref")
    return "external_id";
  return null;
}

/** Build a suggested mapping from CSV headers → import fields. */
export function autoSuggestMapping(
  headers: string[],
): Record<string, CustomerImportField | null> {
  const out: Record<string, CustomerImportField | null> = {};
  for (const h of headers) {
    out[h] = suggestField(h);
  }
  return out;
}

export interface CustomerImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  drivers_license: string | null;
  license_state: string | null;
  license_expiry: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  date_of_birth: string | null;
  lifecycle: string | null;
  standing: string | null;
  tags: string | null;
  notes: string | null;
  external_id: string | null;
}

function pick(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const found = Object.keys(row).find(
      (h) => h.toLowerCase().trim() === k.toLowerCase(),
    );
    if (found && row[found].trim() !== "") return row[found].trim();
  }
  return null;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts.pop() ?? "";
  const first = parts.join(" ");
  return { first, last };
}

/** Parse CSV text into typed customer import rows using the column mapping. */
export function parseCustomerImportCsv(
  text: string,
  mapping: Record<string, CustomerImportField | null>,
): CustomerImportRow[] {
  const { headers, rows } = parseCsv(text);
  return rows.map((raw, i) => {
    const get = (field: CustomerImportField): string | null => {
      for (const [header, f] of Object.entries(mapping)) {
        if (f === field) {
          const v = raw[header];
          if (v != null && v.trim() !== "") return v.trim();
        }
      }
      return null;
    };
    const first = get("first_name");
    const last = get("last_name");
    const full = get("full_name");
    let firstFinal = first;
    let lastFinal = last;
    if ((!first || !last) && full) {
      const sp = splitName(full);
      if (!firstFinal) firstFinal = sp.first || null;
      if (!lastFinal) lastFinal = sp.last || null;
    }
    return {
      rowIndex: i + 2,
      raw,
      first_name: firstFinal,
      last_name: lastFinal,
      full_name: full,
      phone: get("phone"),
      email: get("email"),
      drivers_license: get("drivers_license"),
      license_state: get("license_state"),
      license_expiry: (() => {
        const d = get("license_expiry");
        return d ? parseStatementDate(d) : null;
      })(),
      address: get("address"),
      city: get("city"),
      state: get("state"),
      zip: get("zip"),
      date_of_birth: (() => {
        const d = get("date_of_birth");
        return d ? parseStatementDate(d) : null;
      })(),
      lifecycle: get("lifecycle"),
      standing: get("standing"),
      tags: get("tags"),
      notes: get("notes"),
      external_id: get("external_id"),
    };
  });
  void headers; // headers available for debugging if needed
}

// ---------------------------------------------------------------------------
// Duplicate detection (strong signals only)
// ---------------------------------------------------------------------------

function normPhone(s: string): string {
  return s.replace(/\D/g, "");
}

export interface CustomerDuplicateMatch {
  existingCustomer: Customer;
  signal: "phone" | "email" | "license";
}

/** Detect duplicate customers by strong signals (phone/email/license). */
export function findCustomerDuplicates(
  row: CustomerImportRow,
  existing: Customer[],
): CustomerDuplicateMatch[] {
  const matches: CustomerDuplicateMatch[] = [];
  if (row.phone) {
    const np = normPhone(row.phone);
    if (np) {
      const m = existing.find((c) => c.phone && normPhone(c.phone) === np);
      if (m) matches.push({ existingCustomer: m, signal: "phone" });
    }
  }
  if (row.email) {
    const e = row.email.toLowerCase();
    const m = existing.find((c) => c.email && c.email.toLowerCase() === e);
    if (m) matches.push({ existingCustomer: m, signal: "email" });
  }
  if (row.drivers_license) {
    const dl = row.drivers_license.toLowerCase();
    const m = existing.find(
      (c) =>
        c.drivers_license_number &&
        c.drivers_license_number.toLowerCase() === dl,
    );
    if (m) matches.push({ existingCustomer: m, signal: "license" });
  }
  // De-duplicate by customer id.
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (seen.has(m.existingCustomer.id)) return false;
    seen.add(m.existingCustomer.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Validation + dry-run
// ---------------------------------------------------------------------------

export interface CustomerImportValidation {
  validRows: CustomerImportRow[];
  invalidRows: { row: CustomerImportRow; reason: string }[];
  duplicateRows: { row: CustomerImportRow; reason: string }[];
  totalCount: number;
}

/** Validate rows: requires first + last name. Detect duplicates by strong
 *  signals. Name-only matches are NEVER treated as duplicates. */
export function validateCustomerImport(
  rows: CustomerImportRow[],
  existing: Customer[],
): CustomerImportValidation {
  const validRows: CustomerImportRow[] = [];
  const invalidRows: { row: CustomerImportRow; reason: string }[] = [];
  const duplicateRows: { row: CustomerImportRow; reason: string }[] = [];
  for (const row of rows) {
    if (!row.first_name || !row.last_name) {
      invalidRows.push({
        row,
        reason: "Missing first or last name",
      });
      continue;
    }
    const dups = findCustomerDuplicates(row, existing);
    if (dups.length > 0) {
      const signalLabels = dups.map(
        (d) =>
          `${d.signal}: ${d.signal === "phone" ? row.phone : d.signal === "email" ? row.email : row.drivers_license}`,
      );
      duplicateRows.push({
        row,
        reason: `Duplicate (${signalLabels.join(", ")})`,
      });
      continue;
    }
    validRows.push(row);
  }
  return {
    validRows,
    invalidRows,
    duplicateRows,
    totalCount: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Error CSV generation
// ---------------------------------------------------------------------------

export interface ErrorCsvRow {
  source_row: number;
  reason: string;
  field: string | null;
}

/** Generate a downloadable error CSV from failed rows. Does not include
 *  unrelated customer data — only the source row number, reason, and the
 *  relevant field name. */
export function buildErrorCsv(
  failed: Array<{ row: CustomerImportRow; reason: string }>,
): string {
  const lines = ["source_row,reason,field"];
  for (const f of failed) {
    const reason = f.reason.replace(/,/g, ";").replace(/\n/g, " ");
    const field = f.row.first_name == null ? "first_name" : "";
    lines.push(`${f.row.rowIndex},${reason},${field}`);
  }
  return lines.join("\n");
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Export (permission-gated)
// ---------------------------------------------------------------------------

export interface ExportPermissions {
  canViewLicense: boolean;
  canViewInsurance: boolean;
  canViewFinancials: boolean;
  canViewVerificationState: boolean;
}

export interface CustomerExportRow {
  customer: Customer;
  lifecycle: string;
  readinessState: string;
  readinessReasons: string;
  balance: number;
  totalRentals: number;
  lifetimeRevenue: number;
  activeRentalId: string | null;
  currentVehicle: string | null;
  lastRentalDate: string | null;
  tags: CustomerTag[];
}

/** Escape a CSV cell (wrap in quotes if it contains a comma, quote, or newline). */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  const needsQuote =
    s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r");
  if (!needsQuote) return s;
  const escaped = s.split('"').join('""');
  return '"' + escaped + '"';
}

/** Build a CSV string from export rows, respecting export permissions. */
export function buildCustomerExportCsv(
  rows: CustomerExportRow[],
  perms: ExportPermissions,
): string {
  const header = [
    "Customer Name",
    "Phone",
    "Email",
    "Lifecycle",
    "Standing",
    "Tags",
    "Active Renter",
    "Current Vehicle",
    "Outstanding Balance",
    "Rental Count",
    "Lifetime Revenue",
    "Last Rental",
    "Verification State",
    "Readiness State",
    "Readiness Reasons",
    "Driver License Number",
    "Driver License State",
    "Driver License Expiry",
    "Insurance Company",
    "Insurance Policy Number",
    "Insurance Expiry",
    "Notes",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const c = r.customer;
    const cells = [
      csvCell(`${c.first_name} ${c.last_name}`),
      csvCell(c.phone),
      csvCell(c.email),
      csvCell(r.lifecycle),
      csvCell(c.customer_status),
      csvCell(r.tags.map((t) => t.label).join("; ")),
      csvCell(r.activeRentalId ? "Yes" : "No"),
      csvCell(r.currentVehicle),
      perms.canViewFinancials ? csvCell(r.balance.toFixed(2)) : "",
      perms.canViewFinancials ? csvCell(r.totalRentals) : "",
      perms.canViewFinancials ? csvCell(r.lifetimeRevenue.toFixed(2)) : "",
      csvCell(r.lastRentalDate ?? ""),
      perms.canViewVerificationState ? csvCell(c.customer_status) : "",
      csvCell(r.readinessState),
      csvCell(r.readinessReasons),
      perms.canViewLicense ? csvCell(c.drivers_license_number) : "",
      perms.canViewLicense ? csvCell(c.drivers_license_state) : "",
      perms.canViewLicense ? csvCell(c.drivers_license_expiry) : "",
      perms.canViewInsurance ? csvCell(c.insurance_company) : "",
      perms.canViewInsurance ? csvCell(c.insurance_policy_number) : "",
      perms.canViewInsurance ? csvCell(c.insurance_expiry) : "",
      csvCell(c.notes),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
