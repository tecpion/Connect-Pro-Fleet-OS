// Connect Pro Fleet — Fleet Compare Vehicles panel.
//
// Reuses the EXISTING comparison engine (compareVehicles / sortComparison) for
// 2-5 vehicles over the SAME selected date range. Adds a vehicle multi-select
// (checkbox chips) so the fleet page can launch comparison inline. No duplicate
// comparison logic. Lifetime Return is always labeled as a lifetime basis.

import { useMemo } from "react";
import {
  compareVehicles,
  sortComparison,
  COMPARISON_METRIC_LABELS,
  type ComparisonMetric,
  type ComparisonRow,
} from "@/lib/vehiclePerformanceComparison";
import type { VehiclePerformanceInputs } from "@/lib/vehiclePerformance";
import type { DateRange } from "@/lib/profitabilityHelpers";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VehicleLite {
  id: string;
  year: number;
  make: string;
  model: string;
}

export function FleetComparePanel({
  inputs,
  range,
  compareIds,
  setCompareIds,
  sortMetric,
  setSortMetric,
  vehicles,
  onOpenVehicle,
}: {
  inputs: VehiclePerformanceInputs;
  range: DateRange;
  compareIds: string[];
  setCompareIds: (ids: string[]) => void;
  sortMetric: ComparisonMetric;
  setSortMetric: (m: ComparisonMetric) => void;
  vehicles: VehicleLite[];
  onOpenVehicle: (id: string) => void;
}) {
  const rows: ComparisonRow[] = useMemo(() => {
    if (compareIds.length < 2 || compareIds.length > 5) return [];
    try {
      return sortComparison(
        compareVehicles(compareIds, inputs, range),
        sortMetric,
        "desc",
      );
    } catch {
      return [];
    }
  }, [compareIds, inputs, range, sortMetric]);

  function toggle(id: string) {
    setCompareIds(
      compareIds.includes(id)
        ? compareIds.filter((x) => x !== id)
        : compareIds.length >= 5
          ? compareIds
          : [...compareIds, id],
    );
  }

  const metricKeys = Object.keys(
    COMPARISON_METRIC_LABELS,
  ) as ComparisonMetric[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {vehicles.slice(0, 12).map((v) => {
          const active = compareIds.includes(v.id);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => toggle(v.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40",
              )}
            >
              {v.year} {v.make} {v.model}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Select 2–5 vehicles to compare. {compareIds.length} selected.
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Sort by
        </span>
        <select
          value={sortMetric}
          onChange={(e) => setSortMetric(e.target.value as ComparisonMetric)}
          className="rounded-md border border-input bg-surface px-2 py-1 text-sm"
        >
          {metricKeys.map((k) => (
            <option key={k} value={k}>
              {COMPARISON_METRIC_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {rows.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Select at least 2 vehicles to see the comparison.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Vehicle</th>
                {metricKeys.map((k) => (
                  <th key={k} className="py-2 pr-4 text-right font-medium">
                    {COMPARISON_METRIC_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.vehicleId}
                  onClick={() => onOpenVehicle(r.vehicleId)}
                  className="cursor-pointer border-b border-border/60 hover:bg-surface-2/40"
                >
                  <td className="py-2 pr-4">
                    <div className="font-medium text-foreground">
                      {r.vehicleLabel}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.plate || "—"}
                    </div>
                  </td>
                  {metricKeys.map((k) => (
                    <td
                      key={k}
                      className="py-2 pr-4 text-right font-mono tabular text-muted-foreground"
                    >
                      {k === "lifetimeReturn" || k.includes("Utilization")
                        ? fmtPct(r.values[k])
                        : fmtMoney(r.values[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
