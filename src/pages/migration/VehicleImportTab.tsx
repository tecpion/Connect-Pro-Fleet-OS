// Connect Pro Fleet — Build #19 cleanup: vehicle import tab.
//
// CSV upload + manual entry. Reuses the migration store's importVehicle
// (which reuses addVehicle + setVehicleOwnership). VIN duplicate detection,
// class/status/ownership mapping, and tenant isolation are handled in the
// commit helper. Dry runs create no records.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { CsvImportShell, Field } from "@/pages/migration/CsvImportShell";
import type {
  DryRunSummary,
  CommitSummary,
} from "@/pages/migration/CsvImportShell";
import { parseVehicleCsv, dryRunVehicles } from "@/lib/migrationCsv";
import type { VehicleImportInput } from "@/lib/migrationCommit";

export function VehicleImportTab() {
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

  const [m, setM] = useState<Partial<VehicleImportInput>>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canImport) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to import vehicles.
      </p>
    );
  }

  function manualSubmit() {
    setError(null);
    setResult(null);
    if (!m.make || !m.model) {
      setError("Make and model are required.");
      return;
    }
    const res = mig.importVehicle(
      {
        unit_number: m.unit_number ?? null,
        vin: m.vin ?? null,
        year: m.year ?? null,
        make: m.make,
        model: m.model,
        license_plate: m.license_plate ?? null,
        class_name: m.class_name ?? null,
        daily_rate: m.daily_rate ?? null,
        weekly_rate: m.weekly_rate ?? null,
        status: m.status ?? null,
        location: m.location ?? null,
        mileage: m.mileage ?? null,
        ownership_type: m.ownership_type ?? null,
        owner_investor_id: m.owner_investor_id ?? null,
        external_id: m.external_id ?? null,
        notes: m.notes ?? null,
      },
      "skip",
    );
    if (!res.ok) setError(res.error ?? "Import failed.");
    else setResult(`Vehicle ${res.action}: ${res.vehicle_id}`);
  }

  const existingVins = store.vehicles
    .map((v) => v.vin)
    .filter(Boolean) as string[];

  function handleParse(text: string): DryRunSummary {
    const rows = parseVehicleCsv(text);
    const r = dryRunVehicles(rows, existingVins);
    return {
      total: r.totalCount,
      valid: r.validCount,
      invalid: r.invalidRows.length,
      duplicates: r.duplicateRows.length,
    };
  }

  function handleCommit(text: string): CommitSummary {
    const rows = parseVehicleCsv(text);
    const dry = dryRunVehicles(rows, existingVins);
    let created = 0,
      linked = 0,
      skipped = 0,
      errors = 0;
    for (const row of dry.validRows) {
      const res = mig.importVehicle(
        {
          unit_number: row.unit_number,
          vin: row.vin,
          year: row.year,
          make: row.make ?? "",
          model: row.model ?? "",
          license_plate: row.license_plate,
          class_name: row.class_name,
          daily_rate: row.daily_rate,
          weekly_rate: row.weekly_rate,
          status: row.status,
          location: row.location,
          mileage: row.mileage,
          ownership_type: row.ownership_type,
          owner_investor_id: null,
          external_id: row.unit_number ?? row.vin,
          notes: null,
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
          Add vehicle manually
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Make *">
            <input
              className="mig-input"
              value={m.make ?? ""}
              onChange={(e) => setM({ ...m, make: e.target.value })}
            />
          </Field>
          <Field label="Model *">
            <input
              className="mig-input"
              value={m.model ?? ""}
              onChange={(e) => setM({ ...m, model: e.target.value })}
            />
          </Field>
          <Field label="VIN">
            <input
              className="mig-input"
              value={m.vin ?? ""}
              onChange={(e) => setM({ ...m, vin: e.target.value })}
            />
          </Field>
          <Field label="Year">
            <input
              type="number"
              className="mig-input"
              value={m.year ?? ""}
              onChange={(e) =>
                setM({
                  ...m,
                  year: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="License plate / Unit">
            <input
              className="mig-input"
              value={m.license_plate ?? ""}
              onChange={(e) => setM({ ...m, license_plate: e.target.value })}
            />
          </Field>
          <Field label="Vehicle class">
            <input
              className="mig-input"
              value={m.class_name ?? ""}
              onChange={(e) => setM({ ...m, class_name: e.target.value })}
              placeholder="e.g. SUV, Midsize"
            />
          </Field>
          <Field label="Daily rate ($)">
            <input
              type="number"
              className="mig-input"
              value={m.daily_rate ?? ""}
              onChange={(e) =>
                setM({
                  ...m,
                  daily_rate: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="Weekly rate ($)">
            <input
              type="number"
              className="mig-input"
              value={m.weekly_rate ?? ""}
              onChange={(e) =>
                setM({
                  ...m,
                  weekly_rate: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="Status">
            <select
              className="mig-input"
              value={m.status ?? "available"}
              onChange={(e) => setM({ ...m, status: e.target.value })}
            >
              <option value="available">Available</option>
              <option value="rented">Rented</option>
              <option value="maintenance">Maintenance</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </Field>
          <Field label="Location">
            <select
              className="mig-input"
              value={m.location ?? ""}
              onChange={(e) => setM({ ...m, location: e.target.value })}
            >
              <option value="">Default location</option>
              {store.locations.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mileage">
            <input
              type="number"
              className="mig-input"
              value={m.mileage ?? ""}
              onChange={(e) =>
                setM({
                  ...m,
                  mileage: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="Ownership type">
            <select
              className="mig-input"
              value={m.ownership_type ?? "company_owned"}
              onChange={(e) => setM({ ...m, ownership_type: e.target.value })}
            >
              <option value="company_owned">Company Owned</option>
              <option value="external_owner">External Owner</option>
              <option value="business_partner_owned">Business Partner</option>
              <option value="jointly_owned">Jointly Owned</option>
              <option value="other">Other</option>
            </select>
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
          Add vehicle
        </button>
      </div>

      <CsvImportShell
        title="Import vehicles from CSV"
        description="Columns: unit,vin,make,model,year,plate,class,daily_rate,weekly_rate,status,location,mileage,ownership_type. VIN duplicates are detected. Unknown classes/ownerships produce a validation issue."
        parsePlaceholder="unit,vin,make,model,year,plate,class,daily_rate,weekly_rate,status,location,mileage,ownership_type"
        onParse={handleParse}
        onCommit={handleCommit}
      />
    </div>
  );
}
