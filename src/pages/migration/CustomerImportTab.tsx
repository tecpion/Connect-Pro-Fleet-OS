// Connect Pro Fleet — Build #19 cleanup: customer import tab.
//
// CSV upload + manual entry. Reuses the migration store's importCustomer
// (which reuses addCustomer). Phone/email/DL duplicate detection; name-only
// matches never auto-merge. Dry runs create no records.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { CsvImportShell, Field } from "@/pages/migration/CsvImportShell";
import type {
  DryRunSummary,
  CommitSummary,
} from "@/pages/migration/CsvImportShell";
import { parseCustomerCsv, dryRunCustomers } from "@/lib/migrationCsv";
import type { CustomerImportInput } from "@/lib/migrationCommit";

export function CustomerImportTab() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canImport = can(role, overrides, "migration.import");

  const [m, setM] = useState<Partial<CustomerImportInput>>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canImport) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to import customers.
      </p>
    );
  }

  function manualSubmit() {
    setError(null);
    setResult(null);
    if (!m.first_name || !m.last_name) {
      setError("First and last name are required.");
      return;
    }
    const res = mig.importCustomer(
      {
        first_name: m.first_name,
        last_name: m.last_name,
        phone: m.phone ?? null,
        email: m.email ?? null,
        drivers_license: m.drivers_license ?? null,
        license_expiry: m.license_expiry ?? null,
        date_of_birth: m.date_of_birth ?? null,
        address: m.address ?? null,
        notes: m.notes ?? null,
        external_id: m.external_id ?? null,
      },
      "skip",
    );
    if (!res.ok) setError(res.error ?? "Import failed.");
    else setResult(`Customer ${res.action}: ${res.customer_id}`);
  }

  const existingPhones = store.customers.map((c) => c.phone).filter(Boolean);
  const existingEmails = store.customers.map((c) => c.email).filter(Boolean);

  function handleParse(text: string): DryRunSummary {
    const rows = parseCustomerCsv(text);
    const r = dryRunCustomers(rows, existingPhones, existingEmails);
    return {
      total: r.totalCount,
      valid: r.validCount,
      invalid: r.invalidRows.length,
      duplicates: r.duplicateRows.length,
    };
  }

  function handleCommit(text: string): CommitSummary {
    const rows = parseCustomerCsv(text);
    const dry = dryRunCustomers(rows, existingPhones, existingEmails);
    let created = 0,
      linked = 0,
      skipped = 0,
      errors = 0;
    for (const row of dry.validRows) {
      const res = mig.importCustomer(
        {
          first_name: row.first_name ?? "",
          last_name: row.last_name ?? "",
          phone: row.phone,
          email: row.email,
          drivers_license: row.drivers_license,
          license_expiry: row.license_expiry,
          date_of_birth: null,
          address: null,
          notes: null,
          external_id: row.external_id,
        },
        "skip",
      );
      if (res.ok && res.action === "created") created++;
      else if (res.ok && res.action === "linked") linked++;
      else {
        skipped++;
        errors++;
      }
    }
    return { created, linked, skipped, errors };
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add customer manually
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First name *">
            <input
              className="mig-input"
              value={m.first_name ?? ""}
              onChange={(e) => setM({ ...m, first_name: e.target.value })}
            />
          </Field>
          <Field label="Last name *">
            <input
              className="mig-input"
              value={m.last_name ?? ""}
              onChange={(e) => setM({ ...m, last_name: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className="mig-input"
              value={m.phone ?? ""}
              onChange={(e) => setM({ ...m, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className="mig-input"
              value={m.email ?? ""}
              onChange={(e) => setM({ ...m, email: e.target.value })}
            />
          </Field>
          <Field label="Driver's license #">
            <input
              className="mig-input"
              value={m.drivers_license ?? ""}
              onChange={(e) => setM({ ...m, drivers_license: e.target.value })}
            />
          </Field>
          <Field label="License expiry">
            <input
              type="date"
              className="mig-input"
              value={m.license_expiry ?? ""}
              onChange={(e) => setM({ ...m, license_expiry: e.target.value })}
            />
          </Field>
          <Field label="External ID">
            <input
              className="mig-input"
              value={m.external_id ?? ""}
              onChange={(e) => setM({ ...m, external_id: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <input
              className="mig-input"
              value={m.address ?? ""}
              onChange={(e) => setM({ ...m, address: e.target.value })}
            />
          </Field>
        </div>
        {error && <p className="mt-2 text-sm text-status-out">{error}</p>}
        {result && (
          <p className="mt-2 text-sm text-status-available">{result}</p>
        )}
        <button
          onClick={manualSubmit}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add customer
        </button>
      </div>

      <CsvImportShell
        title="Import customers from CSV"
        description="Columns: first_name,last_name,phone,email,drivers_license,license_expiry,external_id. Phone/email/license duplicates are detected. Name-only matches never auto-merge."
        parsePlaceholder="first_name,last_name,phone,email,drivers_license,license_expiry,external_id"
        onParse={handleParse}
        onCommit={handleCommit}
      />
    </div>
  );
}
