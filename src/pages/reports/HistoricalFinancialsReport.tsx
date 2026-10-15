// Connect Pro Fleet — Build #19 cleanup: Historical Financials report.
//
// Shows imported pre-Fleet financial summaries with a Fleet/Historical/Combined
// source-mode toggle. Source distinction is always visible — combined never
// hides provenance. Monthly periods render as a trend; the migration cutover
// date marks "Connect Pro Fleet Go-Live". Historical summaries are reporting-
// continuity only — they never create ledger/invoice/expense/bank transactions.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { fmtMoney } from "@/lib/format";
import { KpiTile } from "@/pages/reports/ReportShared";
import {
  getCombinedLifetimeTotals,
  getMonthlyHistorical,
  getMigrationCutoverDate,
  getReportSourceTotals,
  getNonOverlappingHistoricalSet,
} from "@/lib/migrationSelectors";
import {
  HISTORICAL_GRANULARITY_LABELS,
  HISTORICAL_SOURCE_LABELS,
} from "@/lib/migrationTypes";
import type { ReportSourceMode } from "@/lib/migrationSelectors";

export default function HistoricalFinancialsReport() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canView = can(role, overrides, "reports.view_management_summary");

  const [mode, setMode] = useState<ReportSourceMode>("combined");

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to view this report.
      </p>
    );
  }

  // Use the non-overlapping set so lifetime + monthly don't double-count.
  const periods = getNonOverlappingHistoricalSet(mig.historicalPeriods);
  const totals = getReportSourceTotals(store, periods, mode);
  const monthly = getMonthlyHistorical(periods);
  const cutover = getMigrationCutoverDate(store);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Historical Financials
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Imported pre-Fleet summaries with Fleet/Historical/Combined views.
            Historical summaries are reporting-continuity only.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {(
            ["fleet_only", "historical_only", "combined"] as ReportSourceMode[]
          ).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "fleet_only"
                ? "Fleet Only"
                : m === "historical_only"
                  ? "Historical Only"
                  : "Combined"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Fleet revenue" value={fmtMoney(totals.fleet_revenue)} />
        <KpiTile
          label="Historical revenue"
          value={fmtMoney(totals.historical_revenue)}
        />
        <KpiTile
          label="Combined revenue"
          value={fmtMoney(totals.combined_revenue)}
        />
        <KpiTile
          label="Combined collections"
          value={
            totals.combined_collections != null
              ? fmtMoney(totals.combined_collections)
              : "—"
          }
        />
      </div>

      {mode === "combined" && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Source breakdown
          </h3>
          <div className="mt-2 space-y-1 font-mono text-xs">
            <Row
              label="Historical revenue"
              value={fmtMoney(totals.historical_revenue)}
            />
            <Row
              label="+ Fleet revenue"
              value={fmtMoney(totals.fleet_revenue)}
            />
            <div className="my-1 border-t border-border" />
            <Row
              label="= Combined revenue"
              value={fmtMoney(totals.combined_revenue)}
              bold
            />
          </div>
        </div>
      )}

      {cutover && (
        <div className="rounded-lg border border-status-maintenance/40 bg-surface p-3 text-sm text-muted-foreground">
          Connect Pro Fleet Go-Live:{" "}
          <span className="font-mono text-foreground">{cutover}</span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Monthly historical trend ({monthly.length})
          </h3>
        </div>
        {monthly.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No monthly historical periods imported.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {monthly.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {p.period_start} → {p.period_end}
                  </span>
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {HISTORICAL_SOURCE_LABELS[p.source_system]}
                  </span>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  Rev {fmtMoney(p.revenue)}
                  {p.collections != null &&
                    ` · Coll ${fmtMoney(p.collections)}`}
                  {p.expenses != null && ` · Exp ${fmtMoney(p.expenses)}`}
                  {p.net_profit != null && ` · Net ${fmtMoney(p.net_profit)}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            All imported periods ({periods.length})
          </h3>
        </div>
        <div className="divide-y divide-border">
          {periods.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {HISTORICAL_GRANULARITY_LABELS[p.granularity]}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {p.period_start} → {p.period_end}
                </span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {fmtMoney(p.revenue)} revenue
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Operational management reporting based on data recorded in Connect Pro
        Fleet. Historical summaries are imported totals and do not include
        transaction-level detail. Not a substitute for formal accounting or tax
        statements.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          bold ? "font-semibold text-foreground" : "text-muted-foreground"
        }
      >
        {label}
      </span>
      <span className={bold ? "font-semibold text-foreground" : ""}>
        {value}
      </span>
    </div>
  );
}
