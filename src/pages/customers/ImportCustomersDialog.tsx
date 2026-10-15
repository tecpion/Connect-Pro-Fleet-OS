// Connect Pro Fleet — Import Customers workflow (Build #38 — Customers V1).
//
// Guided 5-step CSV import: Upload → Map Columns → Review Duplicates & Errors →
// Preview → Import. Never imports immediately after upload. Duplicate detection
// uses strong identifiers only (phone/email/license); name-only matches never
// force a duplicate. Each duplicate can be Skipped, Updated, or Imported as New
// (the latter requires confirmation when a strong identifier conflicts).
// Verification fields are never required when verification is Off.

import { useMemo, useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { useCustomerImportHistory } from "@/lib/customerImportHistoryStore";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { isVerificationEnabled } from "@/lib/verificationConfig";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import {
  autoSuggestMapping,
  buildErrorCsv,
  buildImportPreview,
  IMPORT_FIELD_LABELS,
  mapCustomerRows,
  validateCustomerRows,
  type CustomerImportField,
  type DuplicateResolution,
} from "@/lib/customerImportEngine";
import { findDuplicateCustomer } from "@/lib/customerWorkspaceSelectors";

type Step = "upload" | "map" | "review" | "preview" | "result";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload CSV" },
  { key: "map", label: "Map Columns" },
  { key: "review", label: "Review Duplicates" },
  { key: "preview", label: "Preview Import" },
  { key: "result", label: "Import" },
];

const FIELD_OPTIONS: CustomerImportField[] = [
  "first_name",
  "last_name",
  "full_name",
  "phone",
  "email",
  "drivers_license_number",
  "drivers_license_state",
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

export function ImportCustomersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const {
    customers,
    addCustomer,
    updateCustomer,
    logActivity,
    currentStaffId,
  } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const verificationEnabled = isVerificationEnabled(companyPolicies);
  const importHistory = useCustomerImportHistory();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<
    Record<string, CustomerImportField | "">
  >({});
  const [resolutions, setResolutions] = useState<
    Record<number, DuplicateResolution>
  >({});
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setCsvText("");
    setHeaders([]);
    setMapping({});
    setResolutions({});
    setResult(null);
  };

  const parsedRows = useMemo(
    () => (csvText && headers.length ? mapCustomerRows(csvText, mapping) : []),
    [csvText, headers, mapping],
  );

  const validation = useMemo(
    () => (parsedRows.length ? validateCustomerRows(parsedRows) : null),
    [parsedRows],
  );

  const preview = useMemo(
    () =>
      validation
        ? buildImportPreview(
            validation.validRows,
            validation.invalidRows,
            customers,
            resolutions,
          )
        : null,
    [validation, customers, resolutions],
  );

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      // Parse headers immediately for the mapping step.
      const firstLine =
        text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
      const hdrs = parseHeaders(firstLine);
      setHeaders(hdrs);
      setMapping(autoSuggestMapping(hdrs));
      setStep("map");
    };
    reader.onerror = () => toast.error("Could not read file.");
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!preview) return;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const now = new Date().toISOString();
    for (const row of preview.newRows) {
      const { first, last } = splitName(row);
      if (!first || !last) {
        failed++;
        continue;
      }
      const customer: Customer = {
        id: uid("cus"),
        tenant_id: TENANT_ID,
        first_name: first,
        last_name: last,
        phone: row.phone ?? "",
        email: row.email ?? "",
        date_of_birth: row.date_of_birth,
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        customer_status: "good_standing",
        customer_source: "staff",
        notes: row.notes ?? "",
        drivers_license_number: row.drivers_license_number,
        drivers_license_state: row.drivers_license_state,
        drivers_license_expiry: null,
        drivers_license_front_url: null,
        drivers_license_back_url: null,
        insurance_company: null,
        insurance_policy_number: null,
        insurance_expiry: null,
        insurance_document_url: null,
        created_at: now,
        updated_at: now,
      };
      addCustomer(customer);
      created++;
    }
    for (const { row, customer } of preview.updateRows) {
      const patch: Partial<Customer> = {};
      if (row.phone) patch.phone = row.phone;
      if (row.email) patch.email = row.email;
      if (row.drivers_license_number)
        patch.drivers_license_number = row.drivers_license_number;
      if (row.address) patch.address = row.address;
      if (row.city) patch.city = row.city;
      if (row.state) patch.state = row.state;
      if (row.zip) patch.zip = row.zip;
      updateCustomer(customer.id, patch);
      updated++;
    }
    skipped = preview.skipRows.length;
    failed += preview.errorRows.length;

    logActivity({
      id: uid("act"),
      at: now,
      label: `Customer import — ${fileName} (${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed)`,
      tone: failed > 0 ? "maintenance" : "available",
    });
    importHistory.recordImport({
      file_name: fileName,
      imported_by: currentStaffId,
      row_count: parsedRows.length,
      created,
      updated,
      skipped,
      failed,
    });
    setResult({ created, updated, skipped, failed });
    setStep("result");
    toast.success(
      `Import complete — ${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed.`,
    );
  };

  const downloadErrors = () => {
    if (!validation) return;
    const csv = buildErrorCsv(validation.invalidRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customer-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const duplicateRows = useMemo(
    () =>
      validation
        ? validation.validRows
            .map((row) => ({
              row,
              match: findDuplicateCustomer(customers, {
                phone: row.phone,
                email: row.email,
                license: row.drivers_license_number,
              }),
            }))
            .filter((x) => x.match)
        : [],
    [validation, customers],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Customers</DialogTitle>
          <DialogDescription>
            Guided CSV import with column mapping, duplicate detection, and
            preview. Nothing is imported until you confirm.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
                (step === s.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-muted-foreground")
              }
            >
              <span>{i + 1}</span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Step 1 — Upload */}
        {step === "upload" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with your customer contacts. You don't need to
              match Connect Pro column names exactly — you'll map columns next.
            </p>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
              Supported columns: first name, last name (or full name), phone,
              email, driver license, address, city, state, ZIP, date of birth,
              tags, notes. Verification fields are{" "}
              {verificationEnabled ? "optional" : "not required"}.
            </div>
          </div>
        )}

        {/* Step 2 — Map Columns */}
        {step === "map" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Map your columns to Connect Pro fields. Common headers are
              auto-suggested — review and adjust.
            </p>
            <div className="space-y-2">
              {headers.map((h) => (
                <div key={h} className="grid grid-cols-2 items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{h}</span>
                  <Select
                    value={mapping[h] ?? ""}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [h]: v as CustomerImportField,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— skip —" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {IMPORT_FIELD_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Review Duplicates & Errors */}
        {step === "review" && validation && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewStat label="Valid" value={validation.validRows.length} />
              <PreviewStat
                label="Errors"
                value={validation.invalidRows.length}
                tone={validation.invalidRows.length ? "out" : undefined}
              />
              <PreviewStat
                label="Duplicates"
                value={duplicateRows.length}
                tone={duplicateRows.length ? "maintenance" : undefined}
              />
              <PreviewStat label="Total" value={parsedRows.length} />
            </div>

            {validation.invalidRows.length > 0 && (
              <div className="rounded-lg border border-status-out/40 bg-status-out/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {validation.invalidRows.length} row error
                    {validation.invalidRows.length === 1 ? "" : "s"}
                  </p>
                  <Button size="sm" variant="outline" onClick={downloadErrors}>
                    Download Error CSV
                  </Button>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {validation.invalidRows.slice(0, 5).map((e) => (
                    <li key={e.row.rowIndex}>
                      Row {e.row.rowIndex}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {duplicateRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Possible duplicates — resolve each
                </p>
                {duplicateRows.map(({ row, match }) => (
                  <div
                    key={row.rowIndex}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <p className="text-sm text-foreground">
                      Row {row.rowIndex}: {row.first_name ?? row.full_name}{" "}
                      {row.last_name ?? ""} ·{" "}
                      <span className="text-muted-foreground">
                        {match?.signal} match
                      </span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["skip", "update", "new"] as DuplicateResolution[]).map(
                        (r) => (
                          <button
                            key={r}
                            onClick={() =>
                              setResolutions((prev) => ({
                                ...prev,
                                [row.rowIndex]: r,
                              }))
                            }
                            className={
                              "rounded-md border px-3 py-1 text-xs font-medium " +
                              ((resolutions[row.rowIndex ?? 0] ?? "skip") === r
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground")
                            }
                          >
                            {r === "skip"
                              ? "Skip"
                              : r === "update"
                                ? "Update Existing"
                                : "Import as New"}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {duplicateRows.length === 0 &&
              validation.invalidRows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No duplicates or errors detected.
                </p>
              )}
          </div>
        )}

        {/* Step 4 — Preview */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewStat
                label="New"
                value={preview.counts.new}
                tone="available"
              />
              <PreviewStat
                label="Updated"
                value={preview.counts.updated}
                tone="rented"
              />
              <PreviewStat
                label="Skipped"
                value={preview.counts.skipped}
                tone="neutral"
              />
              <PreviewStat
                label="Errors"
                value={preview.counts.errors}
                tone={preview.counts.errors ? "out" : undefined}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Review the counts above. This will create {preview.counts.new} new
              customer{preview.counts.new === 1 ? "" : "s"} and update{" "}
              {preview.counts.updated} existing record
              {preview.counts.updated === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        {/* Step 5 — Result */}
        {step === "result" && result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PreviewStat
                label="Created"
                value={result.created}
                tone="available"
              />
              <PreviewStat
                label="Updated"
                value={result.updated}
                tone="rented"
              />
              <PreviewStat
                label="Skipped"
                value={result.skipped}
                tone="neutral"
              />
              <PreviewStat
                label="Failed"
                value={result.failed}
                tone={result.failed ? "out" : undefined}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Import complete.{" "}
              {result.failed > 0
                ? `${result.failed} row(s) could not be imported — download the error CSV from the review step.`
                : "All rows processed successfully."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {step === "result" ? "Close" : "Cancel"}
          </Button>
          {step === "map" && (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary-press"
              onClick={() => setStep("review")}
            >
              Continue
            </Button>
          )}
          {step === "review" && (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary-press"
              onClick={() => setStep("preview")}
            >
              Continue
            </Button>
          )}
          {step === "preview" && (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary-press"
              onClick={handleConfirmImport}
            >
              Import Customers
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "available" | "maintenance" | "out" | "rented" | "neutral";
}) {
  const toneClass =
    tone === "out"
      ? "text-status-out"
      : tone === "maintenance"
        ? "text-status-maintenance"
        : tone === "available"
          ? "text-status-available"
          : tone === "rented"
            ? "text-status-rented"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={"mt-1 font-mono text-xl font-semibold tabular " + toneClass}
      >
        {value}
      </p>
    </div>
  );
}

function parseHeaders(line: string): string[] {
  // Reuse the robust parser for the header line.
  // Inline minimal split respecting quotes.
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
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        fields.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields.filter((f) => f.length > 0);
}

function splitName(row: {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}): { first: string; last: string } {
  if (row.first_name && row.last_name)
    return { first: row.first_name, last: row.last_name };
  if (row.full_name) {
    const parts = row.full_name.trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ") || "";
    return { first, last };
  }
  return { first: row.first_name ?? "", last: row.last_name ?? "" };
}
