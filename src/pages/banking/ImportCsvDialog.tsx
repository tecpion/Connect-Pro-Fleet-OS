// Connect Pro Fleet — CSV import dialog (Build #15).
// Upload CSV, choose account, map columns, preview validation, import.
// Idempotent via fingerprints — re-importing the same statement skips duplicates.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CSV_FIELD_OPTIONS,
  type CsvColumnMapping,
  type CsvFieldKey,
} from "@/lib/bankingTypes";
import {
  parseCsv,
  mapRows,
  validateRows,
  resolveAmountDirection,
} from "@/lib/csvImport";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export function ImportCsvDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const store = useStore();
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState(
    store.financialAccounts[0]?.id ?? "",
  );
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [openingBalance, setOpeningBalance] = useState<string>("");
  const [closingBalance, setClosingBalance] = useState<string>("");

  const { headers, rows } = useMemo(() => parseCsv(csvText), [csvText]);
  const parsed = useMemo(() => mapRows(rows, mapping), [rows, mapping]);
  const validation = useMemo(() => validateRows(parsed), [parsed]);

  function autoMap() {
    if (headers.length === 0) return;
    const m: CsvColumnMapping = {};
    const lower = headers.map((h) => h.toLowerCase());
    for (const opt of CSV_FIELD_OPTIONS) {
      const match = headers.find((h, i) => {
        const lh = lower[i];
        if (opt.key === "date")
          return /date|posted|trans/.test(lh) && !lh.includes("posted");
        if (opt.key === "posted_date") return /posted date|post date/.test(lh);
        if (opt.key === "description")
          return /desc|detail|memo|name|narration/.test(lh);
        if (opt.key === "amount") return /amount|amt|value/.test(lh);
        if (opt.key === "debit") return /debit|withdrawal|withdraw/.test(lh);
        if (opt.key === "credit") return /credit|deposit/.test(lh);
        if (opt.key === "merchant") return /merchant|payee/.test(lh);
        if (opt.key === "running_balance") return /balance/.test(lh);
        if (opt.key === "reference") return /ref|id|number/.test(lh);
        if (opt.key === "external_id")
          return /transaction id|txn id|ext/.test(lh);
        return false;
      });
      if (match) m[match] = opt.key;
    }
    setMapping(m);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setTimeout(autoMap, 0);
    };
    reader.readAsText(file);
  }

  function doImport() {
    if (!accountId) {
      toast.error("Choose an account first.");
      return;
    }
    const res = store.importCsv({
      accountId,
      csvText,
      mapping,
      fileName: fileName || "manual-entry.csv",
      openingBalance: openingBalance ? Number(openingBalance) : null,
      closingBalance: closingBalance ? Number(closingBalance) : null,
    });
    toast.success(
      `Imported ${res.accepted} transactions (${res.duplicates} duplicates skipped, ${res.errors} errors).`,
    );
    setCsvText("");
    setFileName("");
    setMapping({});
    setOpeningBalance("");
    setClosingBalance("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import statement (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Account</Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {store.financialAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.last_four ?? "—"})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>CSV file</Label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
            />
            {fileName && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {fileName}
              </p>
            )}
          </div>
          {headers.length > 0 && (
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Map columns
                </p>
                <button
                  onClick={autoMap}
                  className="text-xs text-primary hover:underline"
                >
                  Auto-detect
                </button>
              </div>
              <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-foreground">
                      {h}
                    </span>
                    <select
                      value={mapping[h] ?? "ignore"}
                      onChange={(e) =>
                        setMapping((m) => ({
                          ...m,
                          [h]: e.target.value as CsvFieldKey | "ignore",
                        }))
                      }
                      className="flex-1 rounded border border-input bg-surface px-1 py-0.5 text-xs"
                    >
                      <option value="ignore">ignore</option>
                      {CSV_FIELD_OPTIONS.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          {validation.totalRows > 0 && (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface p-3 text-xs sm:grid-cols-4">
              <Stat label="Rows" value={String(validation.totalRows)} />
              <Stat label="Valid" value={String(validation.validRows.length)} />
              <Stat
                label="Invalid"
                value={String(validation.invalidRows.length)}
              />
              <Stat label="Money in" value={fmtMoney(validation.totalIn)} />
              <Stat label="Money out" value={fmtMoney(validation.totalOut)} />
              <Stat
                label="Date range"
                value={
                  validation.dateRange.start
                    ? `${validation.dateRange.start} → ${validation.dateRange.end}`
                    : "—"
                }
              />
            </div>
          )}
          {validation.invalidRows.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-surface p-2 text-xs">
              {validation.invalidRows.slice(0, 10).map((e) => (
                <p key={e.row.rowIndex} className="font-mono text-out">
                  Row {e.row.rowIndex}: {e.reason}
                </p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Opening balance (optional)</Label>
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm tabular"
              />
            </div>
            <div>
              <Label>Closing balance (optional)</Label>
              <input
                type="number"
                value={closingBalance}
                onChange={(e) => setClosingBalance(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm tabular"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={validation.validRows.length === 0 || !accountId}
            onClick={doImport}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <Upload size={15} className="mr-1.5" /> Import{" "}
            {validation.validRows.length} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono tabular text-foreground">{value}</p>
    </div>
  );
}
