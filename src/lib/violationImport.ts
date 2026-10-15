// Connect Pro Fleet — Violation CSV import + dry run (Build #25).
// Pure functions: parse → match vehicle → run possession resolver → detect
// duplicates. No mutation during dry run. Strong duplicate detection uses
// authority + citation/reference; weaker fallback (plate + occurred_at +
// amount) only flags as a possible duplicate, never blindly dedupes same-day
// same-amount tolls (two legitimate identical tolls are allowed).

import type { Vehicle, RentalAgreement } from "./types";
import type { RentalVehicleExchange } from "./store/rentalVehicleExchange";
import type { Violation, ViolationType } from "./violationTypes";
import { resolveVehiclePossessionAt } from "./violationPossession";
import { ALL_VIOLATION_TYPES } from "./violationTypes";

export interface ViolationCsvRow {
  raw: Record<string, string>;
  rowIndex: number;
}

export interface ViolationImportRecord {
  rowIndex: number;
  // parsed
  citation_number: string | null;
  violation_type: ViolationType;
  plate: string | null;
  state: string | null;
  vin: string | null;
  vehicle_number: string | null;
  occurred_at: string | null;
  base_amount: number;
  penalties_amount: number;
  due_at: string | null;
  authority: string | null;
  location: string | null;
  status: string | null;
  // resolved
  vehicle_id: string | null;
  rental_id: string | null;
  customer_id: string | null;
  possession_status: string;
  duplicate: boolean;
  duplicateOf: string | null;
  issues: string[];
}

export interface ViolationImportDryRun {
  records: ViolationImportRecord[];
  totalRows: number;
  matchedVehicles: number;
  matchedRentals: number;
  noVehicleMatch: number;
  duplicates: number;
  issues: number;
}

const HEADER_ALIASES: Record<string, string> = {
  citation: "citation_number",
  reference: "citation_number",
  "citation #": "citation_number",
  citation_number: "citation_number",
  type: "violation_type",
  "violation type": "violation_type",
  plate: "plate",
  "license plate": "plate",
  "plate number": "plate",
  state: "state",
  jurisdiction: "state",
  vin: "vin",
  "vehicle number": "vehicle_number",
  "internal vehicle": "vehicle_number",
  occurred: "occurred_at",
  "occurred date": "occurred_at",
  "date/time": "occurred_at",
  datetime: "occurred_at",
  amount: "base_amount",
  "base amount": "base_amount",
  penalties: "penalties_amount",
  "late penalty": "penalties_amount",
  due: "due_at",
  "due date": "due_at",
  authority: "authority",
  "issuing authority": "authority",
  location: "location",
  status: "status",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

/** Parse CSV text into rows. Handles quoted fields + commas. */
export function parseViolationCsv(text: string): ViolationCsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headerCells = splitCsvLine(lines[0]);
  const headers = headerCells
    .map(normalizeHeader)
    .map((h) => HEADER_ALIASES[h] ?? h);
  const rows: ViolationCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = (cells[idx] ?? "").trim();
    });
    rows.push({ raw, rowIndex: i });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toIsoDateTime(s: string): string | null {
  if (!s) return null;
  // Accept YYYY-MM-DD, YYYY-MM-DD HH:mm, MM/DD/YYYY
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m1) {
    return `${m1[1]}-${m1[2]}-${m1[3]}T${m1[4] ?? "00"}:${m1[5] ?? "00"}:00Z`;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (m2) {
    const mm = m2[1].padStart(2, "0");
    const dd = m2[2].padStart(2, "0");
    return `${m2[3]}-${mm}-${dd}T${m2[4] ?? "00"}:${m2[5] ?? "00"}:00Z`;
  }
  return null;
}

function toNumber(s: string): number {
  if (!s) return 0;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function matchVehicle(
  row: Record<string, string>,
  vehicles: Vehicle[],
): string | null {
  const vin = (row.vin ?? "").trim().toUpperCase();
  if (vin) {
    const v = vehicles.find((x) => x.vin?.toUpperCase() === vin);
    if (v) return v.id;
  }
  const plate = (row.plate ?? "").trim().toUpperCase();
  if (plate) {
    const v = vehicles.find((x) => x.license_plate?.toUpperCase() === plate);
    if (v) return v.id;
  }
  const vehicleNumber = (row.vehicle_number ?? "").trim();
  if (vehicleNumber) {
    const v = vehicles.find((x) => x.id === vehicleNumber);
    if (v) return v.id;
  }
  return null;
}

/** Run a dry-run import: parse, match, resolve possession, detect duplicates.
 *  No mutation. */
export function dryRunViolationImport(
  text: string,
  vehicles: Vehicle[],
  rentals: RentalAgreement[],
  exchanges: RentalVehicleExchange[],
  existing: Violation[],
): ViolationImportDryRun {
  const rows = parseViolationCsv(text);
  const records: ViolationImportRecord[] = [];
  let matchedVehicles = 0;
  let matchedRentals = 0;
  let noVehicleMatch = 0;
  let duplicates = 0;
  let issues = 0;

  // Track citation keys seen in this batch for intra-batch dup detection.
  const batchKeys = new Set<string>();

  for (const row of rows) {
    const r = row.raw;
    const issuesList: string[] = [];
    const typeRaw = (r.violation_type ?? "other")
      .toLowerCase()
      .replace(/[\s-]/g, "_");
    const violation_type = (
      ALL_VIOLATION_TYPES.includes(typeRaw as ViolationType) ? typeRaw : "other"
    ) as ViolationType;
    const occurred_at = toIsoDateTime(r.occurred_at ?? "");
    if (!occurred_at) issuesList.push("Missing or invalid occurred date/time");
    const base_amount = toNumber(r.base_amount ?? "");
    const penalties_amount = toNumber(r.penalties_amount ?? "");
    const due_at = toIsoDateTime(r.due_at ?? "");
    const authority = r.authority ?? null;
    const citation_number = r.citation_number ?? null;

    const vehicle_id = matchVehicle(r, vehicles);
    if (!vehicle_id) {
      noVehicleMatch++;
      issuesList.push("No vehicle match");
    } else {
      matchedVehicles++;
    }

    let rental_id: string | null = null;
    let customer_id: string | null = null;
    let possession_status = "no_match";
    if (vehicle_id && occurred_at) {
      const res = resolveVehiclePossessionAt(
        vehicle_id,
        occurred_at,
        rentals,
        exchanges,
      );
      possession_status = res.status;
      if (res.status === "exact_match" && res.rental) {
        rental_id = res.rental.id;
        customer_id = res.rental.customer_id;
        matchedRentals++;
      } else if (res.status === "multiple_match") {
        issuesList.push("Multiple conflicting possession matches");
      }
    }

    // Duplicate detection — strong key: authority + citation_number.
    let duplicate = false;
    let duplicateOf: string | null = null;
    if (authority && citation_number) {
      const key = `${authority}|${citation_number}`;
      if (batchKeys.has(key)) {
        duplicate = true;
        issuesList.push("Duplicate within import batch");
      } else {
        const existingDup = existing.find(
          (v) =>
            v.issuing_authority === authority &&
            v.citation_number === citation_number,
        );
        if (existingDup) {
          duplicate = true;
          duplicateOf = existingDup.id;
          issuesList.push("Duplicate of existing violation");
        }
      }
      if (!duplicate) batchKeys.add(key);
    }

    if (duplicate) duplicates++;
    if (issuesList.length > 0) issues += issuesList.length;

    records.push({
      rowIndex: row.rowIndex,
      citation_number,
      violation_type,
      plate: r.plate ?? null,
      state: r.state ?? null,
      vin: r.vin ?? null,
      vehicle_number: r.vehicle_number ?? null,
      occurred_at,
      base_amount,
      penalties_amount,
      due_at,
      authority,
      location: r.location ?? null,
      status: r.status ?? null,
      vehicle_id,
      rental_id,
      customer_id,
      possession_status,
      duplicate,
      duplicateOf,
      issues: issuesList,
    });
  }

  return {
    records,
    totalRows: rows.length,
    matchedVehicles,
    matchedRentals,
    noVehicleMatch,
    duplicates,
    issues,
  };
}
