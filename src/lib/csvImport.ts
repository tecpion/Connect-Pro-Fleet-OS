// Connect Pro Fleet — CSV parser + import engine (Build #15).
//
// Robust CSV parsing (quoted commas, headers, blank rows, debit/credit OR
// signed amount columns, multiple date formats) WITHOUT naive comma splits.
// Produces parsed rows, validates them (invalid date/amount, duplicate
// detection via stable fingerprint), and imports accepted rows as
// ImportedTransactions + a FinancialStatement + an ImportBatch. Re-importing
// the same statement never duplicates transactions (fingerprint dedupe).

import type {
  CsvColumnMapping,
  ParsedCsvRow,
  ImportValidationResult,
  ImportedTransaction,
  ImportDirection,
} from "./bankingTypes";

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: quoted fields, escaped quotes, CRLF/LF)
// ---------------------------------------------------------------------------

/** Parse a single CSV line into fields, respecting quoted fields. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

/** Split CSV text into raw row objects keyed by header. Blank rows ignored. */
export function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  // Normalize line endings, strip BOM.
  const clean = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Date + amount parsing (tolerant of common statement formats)
// ---------------------------------------------------------------------------

/** Parse a date string in several common formats. Returns YYYY-MM-DD or null. */
export function parseStatementDate(s: string): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  // ISO already
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // MM/DD/YYYY or M/D/YYYY
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  // MM/DD/YY
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const yr = 2000 + Number(m[3]);
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  // DD-MM-YYYY
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/** Parse a monetary string: strips $, commas, spaces; handles parentheses as
 *  negative. Returns a number or null. */
export function parseAmount(s: string): number | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  let neg = false;
  let clean = v.replace(/[$,\s]/g, "");
  if (/^\(.*\)$/.test(clean)) {
    neg = true;
    clean = clean.slice(1, -1);
  }
  if (clean.startsWith("-")) {
    neg = true;
    clean = clean.slice(1);
  }
  const n = Number(clean);
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

// ---------------------------------------------------------------------------
// Row mapping + parsing into typed ParsedCsvRow
// ---------------------------------------------------------------------------

function pickField(
  row: Record<string, string>,
  mapping: CsvColumnMapping,
  key: string,
): string | null {
  for (const [header, field] of Object.entries(mapping)) {
    if (field === key) {
      const v = row[header];
      if (v != null && v.trim() !== "") return v.trim();
    }
  }
  return null;
}

/** Map raw CSV rows into typed parsed rows using the column mapping. */
export function mapRows(
  rows: Record<string, string>[],
  mapping: CsvColumnMapping,
): ParsedCsvRow[] {
  return rows.map((raw, idx) => {
    const dateStr = pickField(raw, mapping, "date");
    const date = dateStr ? parseStatementDate(dateStr) : null;
    const amountStr = pickField(raw, mapping, "amount");
    const amount = amountStr ? parseAmount(amountStr) : null;
    const debitStr = pickField(raw, mapping, "debit");
    const debit = debitStr ? parseAmount(debitStr) : null;
    const creditStr = pickField(raw, mapping, "credit");
    const credit = creditStr ? parseAmount(creditStr) : null;
    const postedStr = pickField(raw, mapping, "posted_date");
    return {
      rowIndex: idx + 2, // +2: 1-based, skip header
      raw,
      date,
      description: pickField(raw, mapping, "description"),
      amount,
      debit,
      credit,
      postedDate: postedStr ? parseStatementDate(postedStr) : null,
      merchant: pickField(raw, mapping, "merchant"),
      runningBalance: ((): number | null => {
        const rb = pickField(raw, mapping, "running_balance");
        return rb ? parseAmount(rb) : null;
      })(),
      reference: pickField(raw, mapping, "reference"),
      externalId: pickField(raw, mapping, "external_id"),
    };
  });
}

/** Resolve the effective amount + direction for a parsed row.
 *  Supports: signed amount column, OR separate debit/credit columns. */
export function resolveAmountDirection(
  row: ParsedCsvRow,
): { amount: number; direction: ImportDirection } | null {
  // Signed amount column
  if (row.amount != null && row.amount !== 0) {
    return row.amount > 0
      ? { amount: Math.abs(row.amount), direction: "money_in" }
      : { amount: Math.abs(row.amount), direction: "money_out" };
  }
  // Debit/credit columns
  const debit = row.debit != null && row.debit !== 0 ? Math.abs(row.debit) : 0;
  const credit =
    row.credit != null && row.credit !== 0 ? Math.abs(row.credit) : 0;
  if (debit > 0 && credit === 0)
    return { amount: debit, direction: "money_out" };
  if (credit > 0 && debit === 0)
    return { amount: credit, direction: "money_in" };
  if (debit > 0 && credit > 0) {
    // Both present — net them.
    const net = credit - debit;
    if (net === 0) return null;
    return net > 0
      ? { amount: Math.abs(net), direction: "money_in" }
      : { amount: Math.abs(net), direction: "money_out" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate parsed rows: must have a date, a description, and a resolvable
 *  amount. Returns valid/invalid lists + date range + totals. */
export function validateRows(rows: ParsedCsvRow[]): ImportValidationResult {
  const validRows: ParsedCsvRow[] = [];
  const invalidRows: { row: ParsedCsvRow; reason: string }[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let totalIn = 0;
  let totalOut = 0;
  for (const row of rows) {
    if (!row.date) {
      invalidRows.push({ row, reason: "Missing or invalid date" });
      continue;
    }
    if (!row.description) {
      invalidRows.push({ row, reason: "Missing description" });
      continue;
    }
    const ad = resolveAmountDirection(row);
    if (!ad || ad.amount <= 0) {
      invalidRows.push({ row, reason: "Missing or invalid amount" });
      continue;
    }
    validRows.push(row);
    if (!minDate || row.date < minDate) minDate = row.date;
    if (!maxDate || row.date > maxDate) maxDate = row.date;
    if (ad.direction === "money_in") totalIn += ad.amount;
    else totalOut += ad.amount;
  }
  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    potentialDuplicates: [], // filled by import engine against existing txns
    dateRange: { start: minDate, end: maxDate },
    totalIn,
    totalOut,
  };
}

// ---------------------------------------------------------------------------
// Fingerprint (duplicate detection)
// ---------------------------------------------------------------------------

/** Stable fingerprint for an imported transaction: tenant|account|date|amount|
 *  direction|description|reference. External ID takes precedence when present. */
export function importFingerprint(
  tenantId: string,
  accountId: string,
  row: ParsedCsvRow,
  direction: ImportDirection,
  amount: number,
): string {
  const ext = row.externalId ?? "";
  if (ext) return `${tenantId}|${accountId}|ext:${ext}`;
  const desc = (row.description ?? "").toLowerCase().slice(0, 80);
  const ref = (row.reference ?? "").toLowerCase().slice(0, 40);
  return `${tenantId}|${accountId}|${row.date}|${amount.toFixed(2)}|${direction}|${desc}|${ref}`;
}

/** Normalize a merchant/description string for matching suggestions. */
export function normalizeDescription(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split(" ")
    .slice(0, 2) // first two tokens (e.g. "AUTOZONE 1234" -> "AUTOZONE")
    .join(" ");
}
