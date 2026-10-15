// Connect Pro Fleet — Vehicle Performance comparison + share card panels.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Download } from "lucide-react";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { VehiclePerformanceInputs } from "@/lib/vehiclePerformance";
import type { DateRange } from "@/lib/profitabilityHelpers";
import {
  compareVehicles,
  sortComparison,
  buildShareCard,
  COMPARISON_METRIC_LABELS,
  SHARE_CARD_METRIC_LABELS,
  SHAREABLE_METRICS,
  type ComparisonMetric,
  type ShareCardOptions,
} from "@/lib/vehiclePerformanceComparison";
import {
  downloadShareCardPng,
  shareCardFilename,
  DEFAULT_BRAND_COLOR,
} from "@/lib/vehiclePerformanceShareExport";
import type { VehiclePerformance } from "@/lib/vehiclePerformance";
import { Row } from "./PerformancePrimitives";

export function ComparisonPanel({
  currentId,
  inputs,
  range,
  compareIds,
  setCompareIds,
  sortMetric,
  setSortMetric,
  vehicles,
}: {
  currentId: string;
  inputs: VehiclePerformanceInputs;
  range: DateRange;
  compareIds: string[];
  setCompareIds: (ids: string[]) => void;
  sortMetric: ComparisonMetric;
  setSortMetric: (m: ComparisonMetric) => void;
  vehicles: { id: string; year: number; make: string; model: string }[];
}) {
  const selected = [currentId, ...compareIds].slice(0, 5);
  const rows = useMemo(() => {
    if (selected.length < 2) return [];
    try {
      return sortComparison(
        compareVehicles(selected, inputs, range),
        sortMetric,
        "desc",
      );
    } catch {
      return [];
    }
  }, [selected, inputs, range, sortMetric]);

  const available = vehicles.filter((v) => !selected.includes(v.id));

  return (
    <SectionCard title="Compare Vehicles" count={selected.length}>
      <p className="mb-3 text-sm text-muted-foreground">
        All vehicles use the same selected date range. Lifetime Return is
        labeled as a lifetime basis.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Sort by
        </span>
        <select
          value={sortMetric}
          onChange={(e) => setSortMetric(e.target.value as ComparisonMetric)}
          className="rounded-md border border-input bg-surface px-2 py-1 text-sm"
        >
          {(Object.keys(COMPARISON_METRIC_LABELS) as ComparisonMetric[]).map(
            (m) => (
              <option key={m} value={m}>
                {COMPARISON_METRIC_LABELS[m]}
              </option>
            ),
          )}
        </select>
        {available.length > 0 && selected.length < 5 && (
          <select
            value=""
            onChange={(e) =>
              e.target.value && setCompareIds([...compareIds, e.target.value])
            }
            className="rounded-md border border-input bg-surface px-2 py-1 text-sm"
          >
            <option value="">+ Add vehicle</option>
            {available.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model}
              </option>
            ))}
          </select>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add at least one more vehicle to compare.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Vehicle</th>
                {(
                  Object.keys(COMPARISON_METRIC_LABELS) as ComparisonMetric[]
                ).map((m) => (
                  <th key={m} className="py-2 px-2 text-right">
                    {COMPARISON_METRIC_LABELS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vehicleId} className="border-b border-border/60">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/vehicles/${r.vehicleId}/performance`}
                      className="font-medium hover:text-primary"
                    >
                      {r.vehicleLabel}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">
                      {r.plate}
                    </p>
                  </td>
                  {(
                    Object.keys(COMPARISON_METRIC_LABELS) as ComparisonMetric[]
                  ).map((m) => (
                    <td
                      key={m}
                      className="py-2 px-2 text-right font-mono tabular"
                    >
                      {m === "lifetimeReturn"
                        ? r.values[m]
                          ? fmtPct(r.values[m])
                          : "—"
                        : m.includes("Utilization")
                          ? fmtPct(r.values[m])
                          : fmtMoney(r.values[m])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function ShareCardPanel({
  perf,
  opts,
  setOpts,
  brandColor,
  logoUrl,
  businessName,
}: {
  perf: VehiclePerformance;
  opts: ShareCardOptions;
  setOpts: (o: ShareCardOptions) => void;
  brandColor?: string;
  logoUrl?: string | null;
  businessName?: string;
}) {
  const card = buildShareCard(perf, opts);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await downloadShareCardPng(card, {
        brandColor: opts.useBrandColors ? brandColor : undefined,
        logoUrl: opts.useBusinessLogo ? logoUrl : undefined,
        businessName,
      });
      if (!res.ok) setExportError(res.error ?? "Export failed.");
    } catch {
      setExportError("Export failed. Your Share View settings are preserved.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <SectionCard title="Performance Card">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={opts.grossFocused}
              onChange={(e) =>
                setOpts({ ...opts, grossFocused: e.target.checked })
              }
            />
            Gross-focused simplified card
          </label>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Metrics
            </p>
            <div className="space-y-1.5">
              {SHAREABLE_METRICS.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={opts.metrics.includes(m)}
                    onChange={(e) =>
                      setOpts({
                        ...opts,
                        metrics: e.target.checked
                          ? [...opts.metrics, m]
                          : opts.metrics.filter((x) => x !== m),
                      })
                    }
                  />
                  {SHARE_CARD_METRIC_LABELS[m]}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Private metrics (financing, JV split, lender, customer data) can
              never be shared.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={opts.useBusinessLogo}
                onChange={(e) =>
                  setOpts({ ...opts, useBusinessLogo: e.target.checked })
                }
              />{" "}
              Use business logo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={opts.useBrandColors}
                onChange={(e) =>
                  setOpts({ ...opts, useBrandColors: e.target.checked })
                }
              />{" "}
              Use brand colors
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={opts.showVehiclePhoto}
                onChange={(e) =>
                  setOpts({ ...opts, showVehiclePhoto: e.target.checked })
                }
              />{" "}
              Show vehicle photo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={opts.showConnectProBranding}
                disabled={!opts.canRemoveBranding}
                onChange={(e) =>
                  setOpts({ ...opts, showConnectProBranding: e.target.checked })
                }
              />
              Show "Powered by Connect Pro Fleet"
              {!opts.canRemoveBranding && (
                <span className="text-xs text-muted-foreground">
                  (requires eligible plan)
                </span>
              )}
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-gradient-to-br from-surface to-surface-2 p-6">
          {opts.grossFocused ? (
            <div className="text-center">
              <p className="font-mono text-5xl font-bold text-primary">
                {fmtMoney(card.grossRevenue)}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Gross Revenue Generated
              </p>
              <p className="mt-4 font-display text-lg font-semibold">
                {card.vehicleLabel}
              </p>
              {opts.metrics.includes("purchasePrice") && (
                <p className="text-sm text-muted-foreground">
                  Purchased for {fmtMoney(card.purchasePrice)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="font-display text-lg font-semibold">
                {card.vehicleLabel}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {card.plate}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {opts.metrics.includes("purchasePrice") && (
                  <Row label="Purchased" value={fmtMoney(card.purchasePrice)} />
                )}
                {opts.metrics.includes("grossRevenue") && (
                  <Row
                    label="Gross Generated"
                    value={fmtMoney(card.grossRevenue)}
                  />
                )}
                {opts.metrics.includes("cashCollected") && (
                  <Row
                    label="Cash Collected"
                    value={fmtMoney(card.cashCollected)}
                  />
                )}
                {opts.metrics.includes("totalExpenses") && (
                  <Row label="Expenses" value={fmtMoney(card.totalExpenses)} />
                )}
                {opts.metrics.includes("netContribution") && (
                  <Row
                    label="Net Contribution"
                    value={fmtMoney(card.netContribution)}
                  />
                )}
                {opts.metrics.includes("lifetimeReturn") && (
                  <Row
                    label="Lifetime Return"
                    value={
                      card.lifetimeReturn == null
                        ? "—"
                        : fmtPct(card.lifetimeReturn)
                    }
                  />
                )}
              </dl>
            </div>
          )}
          {card.options.showConnectProBranding && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Powered by Connect Pro Fleet
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={handleExport} disabled={exporting}>
          <Download size={15} className="mr-1.5" />
          {exporting ? "Generating image..." : "Download Image"}
        </Button>
        <span className="font-mono text-xs text-muted-foreground">
          {shareCardFilename(card)}
        </span>
        {exportError && (
          <span className="text-xs text-red-600 dark:text-red-400">
            {exportError}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        All values come from authoritative system data — no free-text overrides.
        If a number is wrong, correct the underlying record. Exported image
        never includes private renter, financing, JV, or internal details.
      </p>
    </SectionCard>
  );
}
