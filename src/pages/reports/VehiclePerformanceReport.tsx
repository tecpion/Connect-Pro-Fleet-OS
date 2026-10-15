// Connect Pro Fleet — Vehicle Performance (premium fleet-level workspace).
//
// Owner-facing financial-intelligence workspace for the WHOLE fleet. Gross
// Revenue is the visual hero KPI; supporting KPIs are secondary. An insight
// strip surfaces Top Grossing / Highest Net / Highest Utilization / Most Idle
// / Needs Review transparently (null → clean empty state, never fabricated).
//
// Vehicle Economics | Company Economics toggle switches the Net Contribution
// column between the vehicle's own economics and company-retained economics
// (JV payout subtracted for investor vehicles) — both reuse the existing
// authoritative engine, no duplicate calculations.
//
// Table: dense, clickable rows open the full single-vehicle Performance
// detail (/vehicles/:id/performance), NOT the generic vehicle page. Sort +
// compact popover filters. Compare Vehicles opens the existing comparison
// panel. CSV export preserved with economics mode + date in the filename.
// Mobile: vehicle performance cards instead of a compressed table.

import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { useReportContext } from "./useReportContext";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Download,
  Car,
  DollarSign,
  Wallet,
  Receipt,
  TrendingUp,
  Gauge,
  AlertTriangle,
  ArrowDownRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  getFleetPerformance,
  sortFleetRows,
  filterFleetRows,
  fleetRowsToCsv,
  FLEET_SORT_LABELS,
  type EconomicsMode,
  type FleetSortKey,
} from "@/lib/vehiclePerformanceFleet";
import {
  resolvePerformanceRange,
  PERFORMANCE_RANGE_LABELS,
  type PerformanceRange,
} from "@/lib/vehiclePerformanceRanges";
import type { VehiclePerformanceInputs } from "@/lib/vehiclePerformance";
import type { ComparisonMetric } from "@/lib/vehiclePerformanceComparison";
import type { PerformanceLabel } from "@/lib/vehiclePerformanceAssessment";
import type { VehicleOwnershipType } from "@/lib/ownershipTypes";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import { PERFORMANCE_LABELS } from "@/lib/vehiclePerformanceSettings";
import { downloadCsv } from "@/lib/reportCsv";
import { fmtMoney } from "@/lib/format";
import {
  CompactKpi,
  InsightCard,
  FilterSelect,
  FleetRow,
  FleetCard,
} from "../vehicles/performance/FleetPerformanceParts";
import { FleetComparePanel } from "../vehicles/performance/FleetComparePanel";

export function VehiclePerformanceReport() {
  const ctx = useReportContext();
  const store = useStore();
  const navigate = useNavigate();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const overrides = currentStaff?.permission_overrides ?? null;
  const canViewRevenue = can(roleObj, overrides, "payments.view");
  const canViewExpenses = can(roleObj, overrides, "expenses.view");
  const canViewProfit = can(
    roleObj,
    overrides,
    "reports.view_vehicle_profitability",
  );
  const canCompare = canViewProfit;
  const canExport = can(roleObj, overrides, "reports.export");
  const showMoney = canViewRevenue && canViewProfit;
  const showExpenses = canViewExpenses && canViewProfit;

  const [rangeKey, setRangeKey] = useState<PerformanceRange>("last_12_months");
  const [mode, setMode] = useState<EconomicsMode>("vehicle");
  const [sortKey, setSortKey] = useState<FleetSortKey>("grossRevenue");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareSort, setCompareSort] =
    useState<ComparisonMetric>("netContribution");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fOwnership, setFOwnership] = useState<VehicleOwnershipType | null>(
    null,
  );
  const [fClass, setFClass] = useState<string | null>(null);
  const [fLocation, setFLocation] = useState<string | null>(null);
  const [fPerf, setFPerf] = useState<PerformanceLabel | null>(null);
  const [fStatus, setFStatus] = useState<string | null>(null);

  const range = useMemo(() => resolvePerformanceRange(rangeKey), [rangeKey]);

  // Extend the report ProfitabilityInputs with the extra performance fields
  // (deposits, damage claims/recoveries, violations, work orders) — same shape
  // the single-vehicle Performance page assembles. No duplicate truth.
  const inputs: VehiclePerformanceInputs = useMemo(
    () => ({
      ...ctx.inputs,
      deposits: store.rentalDeposits,
      damageClaims: ctx.damageClaims,
      damageRecoveries: ctx.damageRecoveries,
      violations: [],
      workOrders: store.workOrders,
    }),
    [
      ctx.inputs,
      store.rentalDeposits,
      ctx.damageClaims,
      ctx.damageRecoveries,
      store.workOrders,
    ],
  );

  const fleet = useMemo(
    () => getFleetPerformance(inputs, range, rangeKey, mode),
    [inputs, range, rangeKey, mode],
  );

  const filtered = useMemo(
    () =>
      filterFleetRows(fleet.rows, {
        ownershipType: fOwnership,
        vehicleClass: fClass,
        location: fLocation,
        performance: fPerf,
        status: fStatus,
      }),
    [fleet.rows, fOwnership, fClass, fLocation, fPerf, fStatus],
  );
  const sorted = useMemo(
    () => sortFleetRows(filtered, sortKey),
    [filtered, sortKey],
  );

  const ownershipOptions = useMemo(
    () =>
      Array.from(
        new Set(store.vehicles.map((v) => v.ownership_type ?? "company_owned")),
      ) as VehicleOwnershipType[],
    [store.vehicles],
  );
  const classOptions = useMemo(
    () => store.vehicleClasses.map((c) => c.name).filter(Boolean),
    [store.vehicleClasses],
  );
  const locationOptions = useMemo(
    () =>
      Array.from(
        new Set(store.vehicles.map((v) => v.location).filter(Boolean)),
      ) as string[],
    [store.vehicles],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(store.vehicles.map((v) => v.status))),
    [store.vehicles],
  );

  const hasActiveFilters =
    fOwnership || fClass || fLocation || fPerf || fStatus;

  function exportCsv() {
    const csv = fleetRowsToCsv(sorted, mode);
    const modeSlug =
      mode === "company" ? "company-economics" : "vehicle-economics";
    const datePart = `${range.start.toISOString().slice(0, 10)}_${range.end
      .toISOString()
      .slice(0, 10)}`;
    downloadCsv(csv, `vehicle-performance-${modeSlug}_${datePart}`);
  }

  const openVehicle = (id: string) => navigate(`/vehicles/${id}/performance`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vehicle Performance"
        subtitle="Compare revenue, profitability, utilization, and lifetime performance across your fleet."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={rangeKey}
              onChange={(e) => setRangeKey(e.target.value as PerformanceRange)}
              className="rounded-md border border-input bg-surface px-3 py-2 text-sm"
              aria-label="Time range"
            >
              {(
                Object.keys(PERFORMANCE_RANGE_LABELS) as PerformanceRange[]
              ).map((k) => (
                <option key={k} value={k}>
                  {PERFORMANCE_RANGE_LABELS[k]}
                </option>
              ))}
            </select>
            {canCompare && (
              <Button
                variant="outline"
                onClick={() => setCompareOpen((v) => !v)}
              >
                <Car size={15} className="mr-1.5" /> Compare Vehicles
              </Button>
            )}
            {canExport && (
              <Button variant="outline" onClick={exportCsv}>
                <Download size={15} className="mr-1.5" /> Export CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="inline-flex rounded-lg border border-border bg-surface p-1">
        <button
          onClick={() => setMode("vehicle")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            mode === "vehicle"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          Vehicle Economics
        </button>
        <button
          onClick={() => setMode("company")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            mode === "company"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          Company Economics
        </button>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {mode === "vehicle"
          ? "How each vehicle performed before ownership split."
          : "What the rental company retained after JV / investor distributions."}
      </p>

      {/* Fleet-wide hero KPI row — Gross Revenue dominates */}
      <div className="grid gap-4 lg:grid-cols-6">
        <div className="rounded-xl bg-primary/5 p-5 ring-1 ring-primary/20 lg:col-span-2">
          <div className="flex items-center gap-2 text-primary">
            <DollarSign size={16} />
            <span className="text-xs font-medium uppercase tracking-wide">
              Gross Revenue Generated
            </span>
          </div>
          <p className="mt-2 font-mono text-4xl font-bold tabular text-primary">
            {showMoney ? fmtMoney(fleet.kpis.grossRevenue) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {range.start.toISOString().slice(0, 10)} →{" "}
            {range.end.toISOString().slice(0, 10)}
          </p>
        </div>
        <CompactKpi
          label="Cash Collected"
          value={showMoney ? fmtMoney(fleet.kpis.cashCollected) : "—"}
          icon={<Wallet size={15} />}
        />
        <CompactKpi
          label="Total Expenses"
          value={showExpenses ? fmtMoney(fleet.kpis.totalExpenses) : "—"}
          icon={<Receipt size={15} />}
          tone="warning"
        />
        <CompactKpi
          label="Net Contribution"
          value={showMoney ? fmtMoney(fleet.kpis.netContribution) : "—"}
          icon={<TrendingUp size={15} />}
          tone={fleet.kpis.netContribution >= 0 ? "positive" : "danger"}
        />
        <CompactKpi
          label="Avg Rentable Utilization"
          value={`${Math.round(fleet.kpis.averageRentableUtilization)}%`}
          icon={<Gauge size={15} />}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CompactKpi
          label="Vehicles Needing Review"
          value={String(fleet.kpis.vehiclesNeedingReview)}
          sub={`${fleet.kpis.vehicleCount} vehicles in fleet`}
          icon={<AlertTriangle size={15} />}
          tone={fleet.kpis.vehiclesNeedingReview > 0 ? "warning" : "neutral"}
        />
      </div>

      <SectionCard title="Fleet Insights">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <InsightCard
            label="Top Grossing"
            icon={<DollarSign size={14} />}
            tone="positive"
            data={
              fleet.insights.topGrossing
                ? {
                    title: fleet.insights.topGrossing.label,
                    value: fmtMoney(fleet.insights.topGrossing.value),
                  }
                : null
            }
            onClick={
              fleet.insights.topGrossing
                ? () => openVehicle(fleet.insights.topGrossing!.vehicleId)
                : undefined
            }
          />
          <InsightCard
            label="Highest Net Contribution"
            icon={<TrendingUp size={14} />}
            tone="positive"
            data={
              fleet.insights.highestNetContribution
                ? {
                    title: fleet.insights.highestNetContribution.label,
                    value: fmtMoney(
                      fleet.insights.highestNetContribution.value,
                    ),
                  }
                : null
            }
            onClick={
              fleet.insights.highestNetContribution
                ? () =>
                    openVehicle(
                      fleet.insights.highestNetContribution!.vehicleId,
                    )
                : undefined
            }
          />
          <InsightCard
            label="Highest Utilization"
            icon={<Gauge size={14} />}
            tone="available"
            data={
              fleet.insights.highestUtilization
                ? {
                    title: fleet.insights.highestUtilization.label,
                    value: `${Math.round(fleet.insights.highestUtilization.value)}%`,
                  }
                : null
            }
            onClick={
              fleet.insights.highestUtilization
                ? () =>
                    openVehicle(fleet.insights.highestUtilization!.vehicleId)
                : undefined
            }
          />
          <InsightCard
            label="Most Idle"
            icon={<ArrowDownRight size={14} />}
            tone="warning"
            data={
              fleet.insights.mostIdle
                ? {
                    title: fleet.insights.mostIdle.label,
                    value: `${fleet.insights.mostIdle.value} idle days`,
                  }
                : null
            }
            onClick={
              fleet.insights.mostIdle
                ? () => openVehicle(fleet.insights.mostIdle!.vehicleId)
                : undefined
            }
          />
          <InsightCard
            label="Needs Review"
            icon={<AlertTriangle size={14} />}
            tone="out"
            data={
              fleet.insights.needsReview
                ? {
                    title: fleet.insights.needsReview.label,
                    value: fleet.insights.needsReview.reason ?? "Needs review",
                  }
                : null
            }
            onClick={
              fleet.insights.needsReview
                ? () => openVehicle(fleet.insights.needsReview!.vehicleId)
                : undefined
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Vehicle Performance"
        count={sorted.length}
        right={
          <div className="flex items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as FleetSortKey)}
              className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
              aria-label="Sort by"
            >
              {(Object.keys(FLEET_SORT_LABELS) as FleetSortKey[]).map((k) => (
                <option key={k} value={k}>
                  {FLEET_SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal size={14} className="mr-1.5" /> Filters
              {hasActiveFilters && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  •
                </span>
              )}
            </Button>
          </div>
        }
      >
        {filtersOpen && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
            <FilterSelect
              label="Ownership"
              value={fOwnership ?? ""}
              onChange={(v) =>
                setFOwnership((v || null) as VehicleOwnershipType | null)
              }
              options={ownershipOptions.map((o) => ({
                value: o,
                label: OWNERSHIP_TYPE_LABELS[o] ?? o,
              }))}
            />
            <FilterSelect
              label="Class"
              value={fClass ?? ""}
              onChange={(v) => setFClass(v || null)}
              options={classOptions.map((c) => ({ value: c, label: c }))}
            />
            <FilterSelect
              label="Location"
              value={fLocation ?? ""}
              onChange={(v) => setFLocation(v || null)}
              options={locationOptions.map((l) => ({ value: l, label: l }))}
            />
            <FilterSelect
              label="Performance"
              value={fPerf ?? ""}
              onChange={(v) => setFPerf((v || null) as PerformanceLabel | null)}
              options={[
                { value: "strong_performer", label: "Strong Performer" },
                { value: "watch", label: "Watch" },
                { value: "underperforming", label: "Underperforming" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={fStatus ?? ""}
              onChange={(v) => setFStatus(v || null)}
              options={statusOptions.map((s) => ({ value: s, label: s }))}
            />
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFOwnership(null);
                  setFClass(null);
                  setFLocation(null);
                  setFPerf(null);
                  setFStatus(null);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
        )}

        {sorted.length === 0 ? (
          <EmptyState
            title="No vehicles match"
            hint="Adjust filters or date range to see fleet performance."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Vehicle</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Gross Revenue
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Cash Collected
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Expenses
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Net Contribution
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Fleet Util
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Rentable Util
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Idle Days
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Downtime
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      Lifetime Return
                    </th>
                    <th className="py-2 pr-4 font-medium">Performance</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <FleetRow
                      key={r.vehicleId}
                      row={r}
                      showMoney={showMoney}
                      showExpenses={showExpenses}
                      onOpen={() => openVehicle(r.vehicleId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 lg:hidden">
              {sorted.map((r) => (
                <FleetCard
                  key={r.vehicleId}
                  row={r}
                  showMoney={showMoney}
                  showExpenses={showExpenses}
                  onOpen={() => openVehicle(r.vehicleId)}
                />
              ))}
            </div>
          </>
        )}
      </SectionCard>

      {compareOpen && canCompare && (
        <SectionCard title="Compare Vehicles" count={compareIds.length}>
          <FleetComparePanel
            inputs={inputs}
            range={range}
            compareIds={compareIds}
            setCompareIds={setCompareIds}
            sortMetric={compareSort}
            setSortMetric={setCompareSort}
            vehicles={store.vehicles}
            onOpenVehicle={openVehicle}
          />
        </SectionCard>
      )}

      <p className="pb-4 text-xs text-muted-foreground">
        Net Contribution is operational/cash-flow analytics, not formal
        tax/accounting profit.
        {mode === "company" &&
          " Company Economics subtracts JV/investor payouts as distributions. "}
        Clicking a vehicle opens its full performance detail.
      </p>
    </div>
  );
}

// Keep imports referenced that are used only in type positions above.
void PERFORMANCE_LABELS;
