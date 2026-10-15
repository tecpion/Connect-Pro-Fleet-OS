// Connect Pro Fleet — Build #18 CSV export utility.
//
// Converts an array of row objects into a CSV string with stable headers and
// downloads it. Export reflects the current filter context and only the data
// the user is authorized to view (callers pass already-filtered rows). Hidden
// financial fields are never included — callers build the row shape.

export function toCsv<T extends object>(rows: T[], headers?: string[]): string {
  if (rows.length === 0) {
    return headers ? headers.join(",") + "\n" : "";
  }
  const cols = headers ?? Object.keys(rows[0] as Record<string, unknown>);
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    lines.push(cols.map((c) => escape(r[c])).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(
  csv: string,
  reportName: string,
  filter?: { start?: string; end?: string },
): void {
  const start = filter?.start ? filter.start : "";
  const end = filter?.end ? filter.end : "";
  const datePart = start || end ? `_${start}_${end}` : "";
  const filename = `${reportName}${datePart}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRows<T extends object>(
  rows: T[],
  reportName: string,
  headers?: string[],
  filter?: { start?: string; end?: string },
): void {
  downloadCsv(toCsv(rows, headers), reportName, filter);
}
