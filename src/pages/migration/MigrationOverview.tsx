// Connect Pro Fleet — Build #19 Migration Center overview tab.

import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { KpiTile } from "@/pages/reports/ReportShared";
import { IMPORT_TYPE_LABELS } from "@/lib/migrationTypes";
import { HISTORICAL_SOURCE_LABELS } from "@/lib/migrationTypes";
import { fmtMoney } from "@/lib/format";

export function MigrationOverview() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canView = can(role, overrides, "migration.view");

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to view the Migration Center.
      </p>
    );
  }

  const importedRentals = store.rentals.filter((r) => r.imported_legacy_rental);
  const batches = mig.migrationBatches;
  const issues = mig.migrationIssues;
  const historical = mig.historicalPeriods;
  const histRevenue = historical.reduce((s, p) => s + p.revenue, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Vehicles" value={String(store.vehicles.length)} />
        <KpiTile label="Customers" value={String(store.customers.length)} />
        <KpiTile
          label="Imported rentals"
          value={String(importedRentals.length)}
        />
        <KpiTile label="Historical periods" value={String(historical.length)} />
        <KpiTile label="Import batches" value={String(batches.length)} />
        <KpiTile
          label="Validation issues"
          value={String(issues.length)}
          tone={issues.length > 0 ? "warning" : "default"}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Use the tabs above to import vehicles, customers, investors, active
        rentals, and historical financials. CSV import reuses the same store
        methods as manual entry — dry runs create no records.
      </p>

      {historical.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Historical financial summary
          </h3>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {fmtMoney(histRevenue)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              total historical revenue
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reporting continuity only — does not create ledger transactions,
            invoices, expenses, or bank transactions.
          </p>
        </div>
      )}

      {batches.length > 0 && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent import batches
            </h3>
          </div>
          <div className="divide-y divide-border">
            {batches.slice(0, 5).map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {IMPORT_TYPE_LABELS[b.import_type]}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {b.source_name}
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {b.success_count} created · {b.skipped_count} skipped ·{" "}
                  {b.error_count} errors ·{" "}
                  {new Date(b.imported_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="rounded-lg border border-status-maintenance/40 bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Validation issues
            </h3>
          </div>
          <div className="divide-y divide-border">
            {issues.slice(0, 8).map((i) => (
              <div key={i.id} className="px-4 py-2 text-sm">
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${i.severity === "error" || i.severity === "blocking" ? "bg-status-out/15 text-status-out" : "bg-status-maintenance/15 text-status-maintenance"}`}
                >
                  {i.severity}
                </span>
                <span className="text-foreground">{i.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { HISTORICAL_SOURCE_LABELS };
