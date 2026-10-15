import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { ownershipTypeLabel } from "@/lib/ownership";
import { useStore, uid } from "@/lib/store";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { StatusPill, vehicleTone } from "@/components/Status";
import { vehicleStatusMeta, fmtNumber, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Car,
  SlidersHorizontal,
  LayoutGrid,
  Table as TableIcon,
  ChevronDown,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { VehicleForm } from "./vehicles/VehicleForm";
import { VehicleFilterDrawer } from "./vehicles/VehicleFilterDrawer";
import {
  emptyFilters,
  type VehicleFilterState,
} from "./vehicles/vehicleFilters";
import { VehicleCard, type VehicleCardData } from "./vehicles/VehicleCard";
import { VehicleQuickActions } from "./vehicles/VehicleQuickActions";
import { FleetHealthBadge } from "./vehicles/FleetHealthBadge";
import { KpiTile, FilterChip } from "./vehicles/VehiclePrimitives";
import {
  useVehicleInventory,
  SORT_OPTIONS,
  registrationState,
  type SortKey,
} from "./vehicles/useVehicleInventory";
import type { VehicleStatus } from "@/lib/types";

export default function Vehicles() {
  const { addVehicle, updateVehicle, logActivity } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFiltersState] = useState<VehicleFilterState>(emptyFilters);
  const [view, setView] = useState<"table" | "cards">("table");
  const [sort, setSort] = useState<SortKey>("vehicle");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const setFilters = (patch: Partial<VehicleFilterState>) =>
    setFiltersState((prev) => ({ ...prev, ...patch }));

  const inv = useVehicleInventory(filters, sort);
  const {
    vehicles,
    vehicleClasses,
    healthByVehicle,
    currentRenterByVehicle,
    nextMaintenanceByVehicle,
    counts,
    locations,
    makes,
    summary,
    sorted,
  } = inv;

  // Quick Add / deep link: auto-open the vehicle form when ?new=1 is present.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const clearAll = () => setFiltersState(emptyFilters);

  // --- Active filter chips (computed here so onRemove can call setFilters) --
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (filters.status !== "all")
      chips.push({
        label: `Status: ${vehicleStatusMeta[filters.status as VehicleStatus].label}`,
        onRemove: () => setFilters({ status: "all" }),
      });
    if (filters.location)
      chips.push({
        label: `Location: ${filters.location}`,
        onRemove: () => setFilters({ location: null }),
      });
    if (filters.type !== "all")
      chips.push({
        label: `Type: ${filters.type}`,
        onRemove: () => setFilters({ type: "all" }),
      });
    if (filters.make)
      chips.push({
        label: `Make: ${filters.make}`,
        onRemove: () => setFilters({ make: null }),
      });
    if (filters.vehicleClass) {
      const cn = vehicleClasses.find((c) => c.id === filters.vehicleClass);
      chips.push({
        label: `Class: ${cn?.name ?? filters.vehicleClass}`,
        onRemove: () => setFilters({ vehicleClass: null }),
      });
    }
    if (filters.ownership !== "all")
      chips.push({
        label: `Ownership: ${filters.ownership}`,
        onRemove: () => setFilters({ ownership: "all" }),
      });
    if (filters.needsAttention)
      chips.push({
        label: "Fleet Health: Needs Attention",
        onRemove: () => setFilters({ needsAttention: false }),
      });
    return chips;
  }, [filters, vehicleClasses]);

  const hasFilters = activeFilterChips.length > 0 || filters.query;

  const cardDataFor = (v: (typeof vehicles)[number]): VehicleCardData => ({
    vehicle: v,
    currentRenter: currentRenterByVehicle.get(v.id) ?? null,
    nextMaintenance: nextMaintenanceByVehicle.get(v.id) ?? null,
    health: healthByVehicle.get(v.id) ?? { level: "healthy", reasons: [] },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicle Inventory"
        subtitle="Monitor vehicle status, location, utilization, ownership, and fleet health."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => setFormOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <Plus size={16} className="mr-1.5" /> Add Vehicle
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.info("Export started — a CSV will download shortly.")
              }
            >
              <Download size={15} className="mr-1.5" /> Export
            </Button>
            <Button variant="outline" onClick={() => setDrawerOpen(true)}>
              <SlidersHorizontal size={15} className="mr-1.5" /> Filter
            </Button>
          </div>
        }
      />

      {/* Summary KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Total Vehicles"
          value={summary.total}
          tone="neutral"
          icon={<Car size={20} />}
        />
        <KpiTile
          label="Available"
          value={summary.available}
          tone="available"
          icon={<Car size={20} />}
          onClick={() => setFilters({ status: "available" })}
          active={filters.status === "available"}
        />
        <KpiTile
          label="On Rent"
          value={summary.rented}
          tone="rented"
          icon={<Car size={20} />}
          onClick={() => setFilters({ status: "rented" })}
          active={filters.status === "rented"}
        />
        <KpiTile
          label="Maintenance"
          value={summary.maintenance}
          tone="maintenance"
          icon={<Car size={20} />}
          onClick={() => setFilters({ status: "maintenance" })}
          active={filters.status === "maintenance"}
        />
        <KpiTile
          label="Out of Service"
          value={summary.outOfService}
          tone="out"
          icon={<Car size={20} />}
          onClick={() => setFilters({ status: "out_of_service" })}
          active={filters.status === "out_of_service"}
        />
        <KpiTile
          label="Needs Attention"
          value={summary.needsAttention}
          tone={summary.needsAttention > 0 ? "maintenance" : "neutral"}
          icon={<Car size={20} />}
          onClick={() => setFilters({ needsAttention: true })}
          active={filters.needsAttention}
        />
      </div>

      {/* Toolbar: search / sort / view toggle */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-md flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Car size={16} />
            </span>
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters({ query: e.target.value })}
              placeholder="Search by vehicle, plate, VIN, location, renter…"
              data-testid="vehicle-search"
              className="h-10 w-full rounded-lg border border-input bg-surface-2/50 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              data-testid="vehicle-sort"
              className="h-10 appearance-none rounded-lg border border-input bg-surface pl-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          <div className="flex items-center rounded-lg border border-input bg-surface-2/50 p-0.5">
            <button
              type="button"
              onClick={() => setView("table")}
              data-testid="view-table"
              data-active={view === "table"}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                view === "table"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TableIcon size={15} /> Table
            </button>
            <button
              type="button"
              onClick={() => setView("cards")}
              data-testid="view-cards"
              data-active={view === "cards"}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                view === "cards"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid size={15} /> Cards
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.query && (
            <FilterChip
              label={`Search: "${filters.query}"`}
              onRemove={() => setFilters({ query: "" })}
            />
          )}
          {activeFilterChips.map((c, i) => (
            <FilterChip key={i} label={c.label} onRemove={c.onRemove} />
          ))}
          <button
            type="button"
            onClick={clearAll}
            data-testid="clear-all-filters"
            className="ml-1 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Result count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-mono font-semibold tabular text-foreground">
            {sorted.length}
          </span>{" "}
          of{" "}
          <span className="font-mono font-semibold tabular text-foreground">
            {vehicles.length}
          </span>{" "}
          vehicles
        </p>
      </div>

      {/* Inventory */}
      {sorted.length === 0 ? (
        vehicles.length === 0 ? (
          <EmptyState
            title="No vehicles yet"
            hint="Add your first vehicle to begin managing fleet availability, rentals, maintenance, and compliance."
            icon={<Car size={28} />}
            action={
              <Button
                onClick={() => setFormOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                <Plus size={16} className="mr-1.5" /> Add Vehicle
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No vehicles match these filters"
            hint="Try adjusting your filters or search to find vehicles."
            icon={<Car size={28} />}
            action={
              <Button variant="outline" onClick={clearAll}>
                Clear Filters
              </Button>
            }
          />
        )
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((v) => (
            <VehicleCard key={v.id} data={cardDataFor(v)} />
          ))}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_2px_8px_hsl(214_30%_15%_/_0.04)] lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Vehicle</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Current Rental</th>
                    <th className="px-4 py-3 font-medium">Mileage</th>
                    <th className="px-4 py-3 font-medium">Ownership</th>
                    <th className="px-4 py-3 font-medium">Next Maint.</th>
                    <th className="px-4 py-3 font-medium">Registration</th>
                    <th className="px-4 py-3 font-medium">Fleet Health</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map((v) => {
                    const tone = vehicleTone(v.status);
                    const renter = currentRenterByVehicle.get(v.id) ?? null;
                    const nextMaint =
                      nextMaintenanceByVehicle.get(v.id) ?? null;
                    const health = healthByVehicle.get(v.id) ?? {
                      level: "healthy",
                      reasons: [],
                    };
                    const regState = registrationState(v.registration_expiry);
                    return (
                      <tr
                        key={v.id}
                        className="group cursor-pointer transition-colors hover:bg-surface-2/60"
                        data-testid={`vehicle-row-${v.id}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/vehicles/${v.id}`}
                            className="font-medium text-foreground group-hover:text-primary"
                          >
                            {v.year} {v.make} {v.model}
                          </Link>
                          <p className="font-mono text-xs tabular text-muted-foreground">
                            {v.vin}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill tone={tone}>
                            {vehicleStatusMeta[v.status].label}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {v.location}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {renter ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular text-foreground">
                          {fmtNumber(v.current_mileage)} mi
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground">
                          {ownershipTypeLabel(v)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {nextMaint ? (
                            <span
                              className={cn(
                                nextMaint.overdue &&
                                  "font-medium text-status-out",
                              )}
                            >
                              {nextMaint.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              No upcoming
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "font-mono text-xs tabular",
                              regState === "expired" && "text-status-out",
                              regState === "expiring" &&
                                "text-status-maintenance",
                            )}
                          >
                            {fmtDate(v.registration_expiry)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <FleetHealthBadge health={health} compact />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <VehicleQuickActions vehicle={v} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards (table view fallback on mobile) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {sorted.map((v) => (
              <VehicleCard key={v.id} data={cardDataFor(v)} />
            ))}
          </div>
        </>
      )}

      {/* Filter drawer */}
      <VehicleFilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        filters={filters}
        setFilters={setFilters}
        locations={locations}
        makes={makes}
        vehicleClasses={vehicleClasses}
        counts={counts}
        onClearAll={() => {
          clearAll();
          setDrawerOpen(false);
        }}
      />

      {/* Add-vehicle form dialog */}
      <VehicleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(v) => {
          addVehicle(v);
          logActivity({
            id: uid("act"),
            at: new Date().toISOString(),
            label: `Vehicle added — ${v.make} ${v.model}`,
            tone: "available",
          });
          toast.success(`${v.make} ${v.model} added to the fleet.`);
          setFormOpen(false);
        }}
        onUpdate={(id, patch) => {
          updateVehicle(id, patch);
          toast.success("Vehicle updated.");
          setFormOpen(false);
        }}
      />
    </div>
  );
}
