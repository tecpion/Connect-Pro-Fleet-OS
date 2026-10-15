// Connect Pro Fleet — Vehicle Inventory filter drawer.
//
// Replaces the old always-visible left filter rail with a slide-out Sheet.
// Preserves every existing filter option (Class, Location, Status, Ownership,
// Type, Make) plus the new Fleet Health: Needs Attention toggle. Each option
// shows its facet count. No domain logic changes — pure presentation.

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vehicleStatusMeta } from "@/lib/format";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import type { VehicleStatus, VehicleType } from "@/lib/types";
import type { VehicleOwnershipType } from "@/lib/ownershipTypes";
import {
  MapPin,
  Car,
  ShieldCheck,
  Building2,
  Tag,
  AlertTriangle,
} from "lucide-react";
import type { VehicleFilterDrawerProps } from "./vehicleFilters";

const STATUSES: (VehicleStatus | "all")[] = [
  "all",
  "available",
  "rented",
  "maintenance",
  "out_of_service",
];
const VEHICLE_TYPES: (VehicleType | "all")[] = [
  "all",
  "car",
  "suv",
  "van",
  "truck",
];
const OWNERSHIP_OPTIONS: VehicleOwnershipType[] = [
  "company_owned",
  "external_owner",
  "business_partner_owned",
  "jointly_owned",
  "other",
];

function FilterGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "ml-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
          active
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function VehicleFilterDrawer({
  open,
  onOpenChange,
  filters,
  setFilters,
  locations,
  makes,
  vehicleClasses,
  counts,
  onClearAll,
}: VehicleFilterDrawerProps) {
  const activeClasses = vehicleClasses
    .filter((c) => c.active)
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-sm"
        data-testid="vehicle-filter-drawer"
      >
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-4 py-2">
          <FilterGroup label="Fleet Health" icon={<AlertTriangle size={14} />}>
            <Row
              active={!filters.needsAttention}
              onClick={() => setFilters({ needsAttention: false })}
              label="All vehicles"
              count={counts.total}
            />
            <Row
              active={filters.needsAttention}
              onClick={() => setFilters({ needsAttention: true })}
              label="Needs attention"
              count={
                counts.total -
                (counts.byStatus["available"] ?? 0) -
                (counts.byStatus["rented"] ?? 0)
              }
            />
          </FilterGroup>

          <FilterGroup label="Class" icon={<Tag size={14} />}>
            <Row
              active={!filters.vehicleClass}
              onClick={() => setFilters({ vehicleClass: null })}
              label="All classes"
              count={counts.total}
            />
            {activeClasses.map((c) => (
              <Row
                key={c.id}
                active={filters.vehicleClass === c.id}
                onClick={() =>
                  setFilters({
                    vehicleClass: filters.vehicleClass === c.id ? null : c.id,
                  })
                }
                label={c.name}
                count={counts.byClass[c.id] ?? 0}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Location" icon={<MapPin size={14} />}>
            <Row
              active={!filters.location}
              onClick={() => setFilters({ location: null })}
              label="All locations"
              count={counts.total}
            />
            {locations.map((loc) => (
              <Row
                key={loc}
                active={filters.location === loc}
                onClick={() =>
                  setFilters({
                    location: filters.location === loc ? null : loc,
                  })
                }
                label={loc}
                count={counts.byLocation[loc] ?? 0}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Status" icon={<Car size={14} />}>
            {STATUSES.map((s) => {
              const count =
                s === "all" ? counts.total : (counts.byStatus[s] ?? 0);
              return (
                <Row
                  key={s}
                  active={filters.status === s}
                  onClick={() => setFilters({ status: s })}
                  label={
                    s === "all"
                      ? "All statuses"
                      : vehicleStatusMeta[s as VehicleStatus].label
                  }
                  count={count}
                />
              );
            })}
          </FilterGroup>

          <FilterGroup label="Ownership" icon={<Building2 size={14} />}>
            <Row
              active={filters.ownership === "all"}
              onClick={() => setFilters({ ownership: "all" })}
              label="All ownership"
              count={counts.total}
            />
            {OWNERSHIP_OPTIONS.map((o) => (
              <Row
                key={o}
                active={filters.ownership === o}
                onClick={() =>
                  setFilters({
                    ownership: filters.ownership === o ? "all" : o,
                  })
                }
                label={OWNERSHIP_TYPE_LABELS[o]}
                count={counts.byOwnership[o] ?? 0}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Type" icon={<ShieldCheck size={14} />}>
            {VEHICLE_TYPES.map((t) => {
              const count =
                t === "all" ? counts.total : (counts.byType[t] ?? 0);
              return (
                <Row
                  key={t}
                  active={filters.type === t}
                  onClick={() => setFilters({ type: t })}
                  label={
                    t === "all"
                      ? "All types"
                      : t.charAt(0).toUpperCase() + t.slice(1)
                  }
                  count={count}
                />
              );
            })}
          </FilterGroup>

          <FilterGroup label="Make">
            {makes.map((m) => (
              <Row
                key={m}
                active={filters.make === m}
                onClick={() =>
                  setFilters({ make: filters.make === m ? null : m })
                }
                label={m}
                count={counts.byMake[m] ?? 0}
              />
            ))}
          </FilterGroup>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClearAll} className="w-full">
            Clear all filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
