// Connect Pro Fleet — Build #19 cleanup: investor/partner import tab.
//
// Manual entry that reuses the migration store's importInvestor (which reuses
// the existing investor store + setVehicleOwnership). Email/phone duplicate
// detection; name-only matches warn but never auto-merge. Imported
// partnerships represent current/future agreement state — historical
// finalized settlements are never rewritten.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { Field } from "@/pages/migration/CsvImportShell";
import type { InvestorImportInput } from "@/lib/migrationInvestorCommit";

export function InvestorImportTab() {
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

  const [m, setM] = useState<Partial<InvestorImportInput>>({
    relationship: "external",
    ownership_type: "owned",
    compensation_type: "percentage",
    basis: "net",
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canImport) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to import investors.
      </p>
    );
  }

  function submit() {
    setError(null);
    setResult(null);
    if (!m.full_name) {
      setError("Partner name is required.");
      return;
    }
    if (m.compensation_type === "percentage") {
      const inv = m.investor_percentage ?? 0;
      const op = m.operator_percentage ?? 0;
      if (inv + op !== 100) {
        setError("Investor + operator percentages must total 100.");
        return;
      }
    }
    const res = mig.importInvestor(
      {
        full_name: m.full_name,
        email: m.email ?? null,
        phone: m.phone ?? null,
        relationship: m.relationship ?? "external",
        vehicle_id: m.vehicle_id || null,
        ownership_type: m.ownership_type ?? "owned",
        compensation_type: m.compensation_type ?? "percentage",
        investor_percentage: m.investor_percentage ?? null,
        operator_percentage: m.operator_percentage ?? null,
        basis: m.basis ?? "net",
        fixed_amount: m.fixed_amount ?? null,
        fixed_frequency: m.fixed_frequency ?? null,
        guaranteed_when_not_rented: m.guaranteed_when_not_rented ?? null,
        guaranteed_during_downtime: m.guaranteed_during_downtime ?? null,
        custom_description: m.custom_description ?? null,
        effective_date:
          m.effective_date ?? new Date().toISOString().slice(0, 10),
        notes: m.notes ?? null,
        external_id: m.external_id ?? null,
      },
      "skip",
    );
    if (!res.ok) setError(res.error ?? "Import failed.");
    else
      setResult(
        `Investor ${res.action}: ${res.investor_id}${res.pairing_id ? " (pairing created)" : ""}`,
      );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-status-maintenance/40 bg-surface p-3 text-sm text-muted-foreground">
        Imported partnerships represent the current/future agreement state.
        Historical finalized settlements are never rewritten. Linking to an
        existing vehicle sets its ownership to External Owner.
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Add investor / partner
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Partner name *">
            <input
              className="mig-input"
              value={m.full_name ?? ""}
              onChange={(e) => setM({ ...m, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className="mig-input"
              value={m.email ?? ""}
              onChange={(e) => setM({ ...m, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              className="mig-input"
              value={m.phone ?? ""}
              onChange={(e) => setM({ ...m, phone: e.target.value })}
            />
          </Field>
          <Field label="Relationship">
            <select
              className="mig-input"
              value={m.relationship}
              onChange={(e) =>
                setM({
                  ...m,
                  relationship: e.target.value as "family" | "external",
                })
              }
            >
              <option value="external">External</option>
              <option value="family">Family</option>
            </select>
          </Field>
          <Field label="Vehicle (optional pairing)">
            <select
              className="mig-input"
              value={m.vehicle_id ?? ""}
              onChange={(e) => setM({ ...m, vehicle_id: e.target.value })}
            >
              <option value="">No vehicle pairing</option>
              {store.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.license_plate}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pairing ownership type">
            <select
              className="mig-input"
              value={m.ownership_type}
              onChange={(e) =>
                setM({
                  ...m,
                  ownership_type: e.target.value as "owned" | "contributed",
                })
              }
            >
              <option value="owned">Owned</option>
              <option value="contributed">Contributed</option>
            </select>
          </Field>
          <Field label="Compensation type">
            <select
              className="mig-input"
              value={m.compensation_type}
              onChange={(e) =>
                setM({
                  ...m,
                  compensation_type: e.target.value as
                    "percentage" | "fixed" | "custom",
                })
              }
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Effective date">
            <input
              type="date"
              className="mig-input"
              value={m.effective_date ?? ""}
              onChange={(e) => setM({ ...m, effective_date: e.target.value })}
            />
          </Field>
          <Field label="External ID">
            <input
              className="mig-input"
              value={m.external_id ?? ""}
              onChange={(e) => setM({ ...m, external_id: e.target.value })}
            />
          </Field>
        </div>

        {m.compensation_type === "percentage" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Basis">
              <select
                className="mig-input"
                value={m.basis}
                onChange={(e) =>
                  setM({ ...m, basis: e.target.value as "gross" | "net" })
                }
              >
                <option value="net">Net (after expenses)</option>
                <option value="gross">Gross (before expenses)</option>
              </select>
            </Field>
            <Field label="Investor %">
              <input
                type="number"
                className="mig-input"
                value={m.investor_percentage ?? ""}
                onChange={(e) =>
                  setM({
                    ...m,
                    investor_percentage: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
            <Field label="Operator %">
              <input
                type="number"
                className="mig-input"
                value={m.operator_percentage ?? ""}
                onChange={(e) =>
                  setM({
                    ...m,
                    operator_percentage: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
          </div>
        )}

        {m.compensation_type === "fixed" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Fixed amount ($)">
              <input
                type="number"
                className="mig-input"
                value={m.fixed_amount ?? ""}
                onChange={(e) =>
                  setM({
                    ...m,
                    fixed_amount: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
            <Field label="Frequency">
              <select
                className="mig-input"
                value={m.fixed_frequency ?? "monthly"}
                onChange={(e) =>
                  setM({
                    ...m,
                    fixed_frequency: e.target.value as
                      "weekly" | "biweekly" | "monthly" | "custom",
                  })
                }
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Guaranteed when not rented?">
              <select
                className="mig-input"
                value={String(m.guaranteed_when_not_rented ?? false)}
                onChange={(e) =>
                  setM({
                    ...m,
                    guaranteed_when_not_rented: e.target.value === "true",
                  })
                }
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </Field>
            <Field label="Guaranteed during downtime?">
              <select
                className="mig-input"
                value={String(m.guaranteed_during_downtime ?? false)}
                onChange={(e) =>
                  setM({
                    ...m,
                    guaranteed_during_downtime: e.target.value === "true",
                  })
                }
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </Field>
          </div>
        )}

        {m.compensation_type === "custom" && (
          <div className="mt-3">
            <Field label="Custom agreement description">
              <textarea
                className="mig-input"
                rows={3}
                value={m.custom_description ?? ""}
                onChange={(e) =>
                  setM({ ...m, custom_description: e.target.value })
                }
                placeholder="Describe the payout arrangement…"
              />
            </Field>
          </div>
        )}

        <div className="mt-3">
          <Field label="Notes">
            <textarea
              className="mig-input"
              rows={2}
              value={m.notes ?? ""}
              onChange={(e) => setM({ ...m, notes: e.target.value })}
            />
          </Field>
        </div>

        {error && <p className="mt-2 text-sm text-status-out">{error}</p>}
        {result && (
          <p className="mt-2 text-sm text-status-available">{result}</p>
        )}
        <button
          onClick={submit}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add investor / partner
        </button>
      </div>
    </div>
  );
}
