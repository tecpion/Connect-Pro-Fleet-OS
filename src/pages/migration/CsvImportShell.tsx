// Connect Pro Fleet — Build #19 cleanup: shared CSV import workflow.
//
// A reusable CSV upload + dry-run + commit flow used by the Vehicles,
// Customers, and Historical Financials tabs. Reuses the robust RFC-4180
// parser from csvImport.ts. Dry runs create NO records; the commit step
// calls the parent's onCommit(csvText) which invokes the migration store's
// typed commit methods. The CSV text is passed to both callbacks so the
// parent can re-parse during commit.

import { useState } from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export interface DryRunSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

export interface CommitSummary {
  created: number;
  linked: number;
  skipped: number;
  errors: number;
}

export function CsvImportShell({
  title,
  description,
  onParse,
  onCommit,
  parsePlaceholder,
}: {
  title: string;
  description: string;
  onParse: (text: string) => DryRunSummary;
  onCommit: (text: string) => CommitSummary;
  parsePlaceholder?: string;
}) {
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<DryRunSummary | null>(null);
  const [committed, setCommitted] = useState<CommitSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    setError(null);
    setCommitted(null);
    if (!csv.trim()) {
      setError("Paste CSV text first.");
      return;
    }
    try {
      setParsed(onParse(csv));
    } catch {
      setError("Could not parse CSV. Check the format.");
    }
  }

  function handleCommit() {
    setError(null);
    if (!csv.trim()) {
      setError("Paste CSV text first.");
      return;
    }
    try {
      const result = onCommit(csv);
      setCommitted(result);
      setParsed(null);
      setCsv("");
    } catch {
      setError("Import failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-status-maintenance/40 bg-surface p-3 text-sm text-muted-foreground">
        {description}
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <textarea
          className="mig-input mt-2 font-mono text-xs"
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={parsePlaceholder ?? "Paste CSV here…"}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={handleParse}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Validate / Dry Run
          </button>
          <button
            onClick={handleCommit}
            disabled={!csv.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Import
          </button>
        </div>

        {parsed && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Rows" value={parsed.total} />
            <Stat label="Valid" value={parsed.valid} tone="ok" />
            <Stat label="Invalid" value={parsed.invalid} tone="err" />
            <Stat label="Duplicates" value={parsed.duplicates} tone="warn" />
          </div>
        )}
        {committed && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Created" value={committed.created} tone="ok" />
            <Stat label="Linked" value={committed.linked} tone="ok" />
            <Stat label="Skipped" value={committed.skipped} tone="warn" />
            <Stat label="Errors" value={committed.errors} tone="err" />
          </div>
        )}
        {error && <p className="mt-2 text-sm text-status-out">{error}</p>}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "err";
}) {
  const color =
    tone === "ok"
      ? "text-status-available"
      : tone === "err"
        ? "text-status-out"
        : tone === "warn"
          ? "text-status-maintenance"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-1.5">
      <span className="text-muted-foreground">{label}: </span>
      <span className={`font-mono font-medium ${color}`}>{value}</span>
    </div>
  );
}
