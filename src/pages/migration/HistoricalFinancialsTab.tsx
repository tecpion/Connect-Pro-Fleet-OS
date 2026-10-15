// Connect Pro Fleet — Build #19 historical financials tab.
//
// Manual entry + list of historical summary periods. Historical summaries
// are reporting-continuity records ONLY — they never create ledger
// transactions, invoices, expenses, or bank transactions.

import { useState } from "react";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { useStore } from "@/lib/store";
import { fmtMoney } from "@/lib/format";
import {
  HISTORICAL_GRANULARITY_LABELS,
  HISTORICAL_SOURCE_LABELS,
} from "@/lib/migrationTypes";
import type {
  HistoricalGranularity,
  HistoricalSource,
} from "@/lib/migrationTypes";

export function HistoricalFinancialsTab() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canImport = can(
    role,
    overrides,
    "migration.import_historical_financials",
  );

  const [granularity, setGranularity] =
    useState<HistoricalGranularity>("month");
  const [source, setSource] = useState<HistoricalSource>("spreadsheet");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [revenue, setRevenue] = useState("");
  const [collections, setCollections] = useState("");
  const [expenses, setExpenses] = useState("");
  const [netProfit, setNetProfit] = useState("");
  const [rentalCount, setRentalCount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function add() {
    setError(null);
    setOk(null);
    if (!periodStart || !revenue) {
      setError("Period start and revenue are required.");
      return;
    }
    const res = mig.addHistoricalPeriod({
      period_start: periodStart,
      period_end: periodEnd || periodStart,
      granularity,
      source_system: source,
      revenue: Number(revenue) || 0,
      collections: collections ? Number(collections) : null,
      expenses: expenses ? Number(expenses) : null,
      net_profit: netProfit ? Number(netProfit) : null,
      rental_count: rentalCount ? Number(rentalCount) : null,
      notes: notes || null,
    });
    if (!res.ok) {
      setError(res.error ?? "Failed to add period.");
    } else {
      setOk("Historical period added.");
      setRevenue("");
      setCollections("");
      setExpenses("");
      setNetProfit("");
      setRentalCount("");
      setNotes("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-status-maintenance/40 bg-surface p-3 text-sm text-muted-foreground">
        Historical summaries affect long-term reports only and do not create
        customer payments, invoices, expenses, or bank transactions.
      </div>

      {canImport && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add historical financial period
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Granularity">
              <select
                className="mig-input"
                value={granularity}
                onChange={(e) =>
                  setGranularity(e.target.value as HistoricalGranularity)
                }
              >
                {Object.entries(HISTORICAL_GRANULARITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source system">
              <select
                className="mig-input"
                value={source}
                onChange={(e) => setSource(e.target.value as HistoricalSource)}
              >
                {Object.entries(HISTORICAL_SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Period start">
              <input
                type="date"
                className="mig-input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                className="mig-input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </Field>
            <Field label="Revenue ($)">
              <input
                type="number"
                className="mig-input"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
              />
            </Field>
            <Field label="Collections ($) — optional">
              <input
                type="number"
                className="mig-input"
                value={collections}
                onChange={(e) => setCollections(e.target.value)}
              />
            </Field>
            <Field label="Expenses ($) — optional">
              <input
                type="number"
                className="mig-input"
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
              />
            </Field>
            <Field label="Net profit ($) — optional">
              <input
                type="number"
                className="mig-input"
                value={netProfit}
                onChange={(e) => setNetProfit(e.target.value)}
              />
            </Field>
            <Field label="Rental count — optional">
              <input
                type="number"
                className="mig-input"
                value={rentalCount}
                onChange={(e) => setRentalCount(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className="mig-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          {error && <p className="mt-2 text-sm text-status-out">{error}</p>}
          {ok && <p className="mt-2 text-sm text-status-available">{ok}</p>}
          <button
            onClick={add}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add period
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Historical periods ({mig.historicalPeriods.length})
          </h3>
        </div>
        {mig.historicalPeriods.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No historical periods imported yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {mig.historicalPeriods.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {HISTORICAL_GRANULARITY_LABELS[p.granularity]}
                  </span>
                  <span className="ml-2 text-muted-foreground">
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
                {canImport && (
                  <button
                    onClick={() => mig.deleteHistoricalPeriod(p.id)}
                    className="text-xs text-status-out hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
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
