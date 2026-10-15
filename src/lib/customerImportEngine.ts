// Connect Pro Fleet — Customer CSV import engine (Build #38 — Customers V1).
//
// Reuses the robust RFC-4180 parser from csvImport.ts (no naïve comma splits).
// Provides: column auto-suggestion, typed row mapping, validation, duplicate
// detection (strong identifiers only — never name-only), per-row resolution
// (Skip / Update Existing / Import as New), and a preview summary. Dry runs
// create NO records. Verification fields are never required when verification
// is Off — they are preserved where present but optional.

import { parseCsv, parseStatementDate } from "./csvImport";
import type { Customer } from "./types";
import {
  findDuplicateCustomer,
  normalizeEmail,
  normalizePhone,
} from "./customerWorkspaceSelectors";

// ---------------------------------------------------------------------------
// Field catalogue + auto-suggestion
// ---------------------------------------------------------------------------

export type CustomerImportField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "phone"
  | "email"
  | "drivers_license_number"
  | "drivers_license_state"
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

export const IMPORT_FIELD_LABELS: Record<CustomerImportField, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  full_name: "Full Name",
  phone: "Phone",
  email: "Email",
  drivers_license_number: "Driver License Number",
  drivers_license_state: "Driver License State",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  date_of_birth: "Date of Birth",
  lifecycle: "Lifecycle",
  standing: "Standing",
  tags: "Tags",
  notes: "Notes",
  external_id: "External ID",
};

/** Common header → field auto-suggestions. Ambiguous headers are NOT silently
 *  assumed; the user can review/change every mapping. */
const HEADER_SUGGESTIONS: Array<[RegExp, CustomerImportField]> = [
  [/^first[_ ]?name$/i, "first_name"],
  [/^last[_ ]?name$/i, "last_name"],
  [/^(full[_ ]?name|name|customer[_ ]?name)$/i, "full_name"],
  [/^(phone|mobile|cell|cell[_ ]?phone|contact[_ ]?number)$/i, "phone"],
  [/^(email|e-?mail|email[_ ]?address)$/i, "email"],
  [
    /^(dl|drivers?[_ ]?license|license[_ ]?number|license[_ ]?#)$/i,
    "drivers_license_number",
  ],
  [/^(dl[_ ]?state|license[_ ]?state)$/i, "drivers_license_state"],
  [/^(address|street|street[_ ]?address)$/i, "address"],
  [/^city$/i, "city"],
  [/^state$/i, "state"],
  [/^(zip|postal|postal[_ ]?code|zip[_ ]?code)$/i, "zip"],
  [/^(dob|date[_ ]?of[_ ]?birth|birth[_ ]?date)$/i, "date_of_birth"],
  [/^lifecycle$/i, "lifecycle"],
  [/^(standing|status|customer[_ ]?status)$/i, "standing"],
  [/^tags?$/i, "tags"],
  [/^notes?$/i, "notes"],
  [/^(external[_ ]?id|customer[_ ]?id|id)$/i, "external_id"],
];

/** Suggest a field for a header. Returns null when no confident match. */
export function suggestField(header: string): CustomerImportField | null {
  const h = header.trim();
  for (const [re, field] of HEADER_SUGGESTIONS) {
    if (re.test(h)) return field;
  }
  return null;
}

/** Build an initial mapping from headers using auto-suggestion. Each header
 *  maps to at most one field; a field is claimed by the first matching header. */
export function autoSuggestMapping(
  headers: string[],
): Record<string, CustomerImportField | ""> {
  const mapping: Record<string, CustomerImportField | ""> = {};
  const claimed = new Set<CustomerImportField>();
  for (const h of headers) {
    const field = suggestField(h);
    if (field && !claimed.has(field)) {
      mapping[h] = field;
      claimed.add(field);
    } else {
      mapping[h] = "";
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Parsed row
// ---------------------------------------------------------------------------

export interface ParsedCustomerImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  drivers_license_number: string | null;
  drivers_license_state: string | null;
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

function pick(
  row: Record<string, string>,
  mapping: Record<string, CustomerImportField | "">,
  field: CustomerImportField,
): string | null {
  for (const [header, f] of Object.entries(mapping)) {
    if (f === field) {
      const v = row[header];
      if (v != null && v.trim() !== "") return v.trim();
    }
  }
  return null;
}

/** Map raw CSV rows into typed parsed rows using the column mapping. */
export function mapCustomerRows(
  text: string,
  mapping: Record<string, CustomerImportField | "">,
): ParsedCustomerImportRow[] {
  const { rows } = parseCsv(text);
  return rows.map((raw, i) => {
    const dobRaw = pick(raw, mapping, "date_of_birth");
    return {
      rowIndex: i + 2,
      raw,
      first_name: pick(raw, mapping, "first_name"),
      last_name: pick(raw, mapping, "last_name"),
      full_name: pick(raw, mapping, "full_name"),
      phone: pick(raw, mapping, "phone"),
      email: pick(raw, mapping, "email"),
      drivers_license_number: pick(raw, mapping, "drivers_license_number"),
      drivers_license_state: pick(raw, mapping, "drivers_license_state"),
      address: pick(raw, mapping, "address"),
      city: pick(raw, mapping, "city"),
      state: pick(raw, mapping, "state"),
      zip: pick(raw, mapping, "zip"),
      date_of_birth: dobRaw ? parseStatementDate(dobRaw) : null,
      lifecycle: pick(raw, mapping, "lifecycle"),
      standing: pick(raw, mapping, "standing"),
      tags: pick(raw, mapping, "tags"),
      notes: pick(raw, mapping, "notes"),
      external_id: pick(raw, mapping, "external_id"),
    };
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface CustomerImportValidation {
  validRows: ParsedCustomerImportRow[];
  invalidRows: { row: ParsedCustomerImportRow; reason: string }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate parsed rows: requires a name (first+last OR full_name). Malformed
 *  phone/email flagged. Verification fields are NEVER required (even when
 *  verification is enabled — they are optional inputs). */
export function validateCustomerRows(
  rows: ParsedCustomerImportRow[],
): CustomerImportValidation {
  const validRows: ParsedCustomerImportRow[] = [];
  const invalidRows: { row: ParsedCustomerImportRow; reason: string }[] = [];
  for (const row of rows) {
    const hasName = (row.first_name && row.last_name) || row.full_name;
    if (!hasName) {
      invalidRows.push({ row, reason: "Missing customer name" });
      continue;
    }
    if (row.email && !EMAIL_RE.test(row.email)) {
      invalidRows.push({ row, reason: `Malformed email: ${row.email}` });
      continue;
    }
    if (row.phone && normalizePhone(row.phone).length < 7) {
      invalidRows.push({ row, reason: `Malformed phone: ${row.phone}` });
      continue;
    }
    validRows.push(row);
  }
  return { validRows, invalidRows };
}

// ---------------------------------------------------------------------------
// Duplicate detection + resolution
// ---------------------------------------------------------------------------

export type DuplicateResolution = "skip" | "update" | "new";

export interface DuplicateCandidate {
  row: ParsedCustomerImportRow;
  match: { customer: Customer; signal: "phone" | "email" | "license" } | null;
  resolution: DuplicateResolution;
}

export interface CustomerImportPreview {
  newRows: ParsedCustomerImportRow[];
  updateRows: { row: ParsedCustomerImportRow; customer: Customer }[];
  skipRows: ParsedCustomerImportRow[];
  errorRows: { row: ParsedCustomerImportRow; reason: string }[];
  counts: {
    new: number;
    updated: number;
    skipped: number;
    errors: number;
  };
}

/** Build a preview from validated rows + duplicate detection. Each valid row
 *  is classified as New / Update Existing / Skip based on its resolution. */
export function buildImportPreview(
  validRows: ParsedCustomerImportRow[],
  invalidRows: { row: ParsedCustomerImportRow; reason: string }[],
  customers: Customer[],
  resolutions: Record<number, DuplicateResolution>,
): CustomerImportPreview {
  const newRows: ParsedCustomerImportRow[] = [];
  const updateRows: { row: ParsedCustomerImportRow; customer: Customer }[] = [];
  const skipRows: ParsedCustomerImportRow[] = [];
  for (const row of validRows) {
    const dup = findDuplicateCustomer(customers, {
      phone: row.phone,
      email: row.email,
      license: row.drivers_license_number,
    });
    if (!dup) {
      newRows.push(row);
      continue;
    }
    const res = resolutions[row.rowIndex] ?? "skip";
    if (res === "update") {
      updateRows.push({ row, customer: dup.customer });
    } else if (res === "new") {
      // Import as New with a strong-identifier conflict requires confirmation
      // (handled by the UI before reaching preview). Here we honor the choice.
      newRows.push(row);
    } else {
      skipRows.push(row);
    }
  }
  return {
    newRows,
    updateRows,
    skipRows,
    errorRows: invalidRows,
    counts: {
      new: newRows.length,
      updated: updateRows.length,
      skipped: skipRows.length,
      errors: invalidRows.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Field-level update preview (for "Update Existing")
// ---------------------------------------------------------------------------

export interface FieldUpdatePreview {
  field: CustomerImportField;
  existing: string;
  incoming: string;
  conflict: boolean;
}

/** Build a field-level diff for an Update Existing row. Non-empty existing
 *  values that differ from incoming are flagged as conflicts so the user can
 *  confirm rather than blindly overwriting. */
export function buildFieldUpdatePreview(
  row: ParsedCustomerImportRow,
  customer: Customer,
): FieldUpdatePreview[] {
  const previews: FieldUpdatePreview[] = [];
  const add = (
    field: CustomerImportField,
    existing: string | null,
    incoming: string | null,
  ) => {
    const ex = existing ?? "";
    const inc = incoming ?? "";
    if (!inc) return; // no incoming value → nothing to update
    previews.push({
      field,
      existing: ex,
      incoming: inc,
      conflict: ex !== "" && ex !== inc,
    });
  };
  add("phone", customer.phone, row.phone);
  add("email", customer.email, row.email);
  add(
    "drivers_license_number",
    customer.drivers_license_number,
    row.drivers_license_number,
  );
  add(
    "drivers_license_state",
    customer.drivers_license_state,
    row.drivers_license_state,
  );
  add("address", customer.address, row.address);
  add("city", customer.city, row.city);
  add("state", customer.state, row.state);
  add("zip", customer.zip, row.zip);
  return previews;
}

// ---------------------------------------------------------------------------
// Error CSV generation
// ---------------------------------------------------------------------------

/** Build an error CSV from invalid rows: source row number, reason, and the
 *  raw source values (no unrelated customer data exposed). */
export function buildErrorCsv(
  invalidRows: { row: ParsedCustomerImportRow; reason: string }[],
): string {
  const headers = ["Source Row", "Reason", "Raw Values"];
  const lines = [headers.join(",")];
  for (const { row, reason } of invalidRows) {
    const raw = Object.entries(row.raw)
      .map(([k, v]) => `${k}=${v}`)
      .join(" | ");
    const vals = [String(row.rowIndex), csvField(reason), csvField(raw)];
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

function csvField(v: string): string {
  if (v == null) return "";
  const s = String(v);
  const needsQuoting =
    s.indexOf(",") !== -1 ||
    s.indexOf("\n") !== -1 ||
    s.indexOf("\r") !== -1 ||
    s.indexOf('"') !== -1;
  if (!needsQuoting) return s;
  return '"' + s.split('"').join('""') + '"';
}

// ---------------------------------------------------------------------------
// Normalization helpers re-exported for convenience
// ---------------------------------------------------------------------------

export { normalizePhone, normalizeEmail };
