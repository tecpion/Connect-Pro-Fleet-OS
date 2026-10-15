import type { VehicleStatus, VehicleType, VehicleClass } from "@/lib/types";
import type { VehicleOwnershipType } from "@/lib/ownershipTypes";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import { Input } from "@/components/ui/input";
import { vehicleStatusMeta, statusToneClasses } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Search, X, MapPin } from "lucide-react";

const OWNERSHIP_OPTIONS: VehicleOwnershipType[] = [
  "company_owned",
  "external_owner",
  "business_partner_owned",
  "jointly_owned",
  "other",
];

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

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      {label}
      <button onClick={onRemove} className="hover:text-primary-press">
        <X size={12} />
      </button>
    </span>
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

export function FilterSidebar({
  query,
  setQuery,
  selectedLocation,
  setSelectedLocation,
  selectedStatus,
  setSelectedStatus,
  selectedType,
  setSelectedType,
  selectedMake,
  setSelectedMake,
  selectedClass,
  setSelectedClass,
  selectedOwnership,
  setSelectedOwnership,
  locations,
  makes,
  makeCounts,
  locationCounts,
  typeCounts,
  statusCounts,
  ownershipCounts,
  vehicleClasses,
  classCounts,
  total,
  filteredCount,
  onClearAll,
}: {
  query: string;
  setQuery: (v: string) => void;
  selectedLocation: string | null;
  setSelectedLocation: (l: string | null) => void;
  selectedStatus: VehicleStatus | "all";
  setSelectedStatus: (s: VehicleStatus | "all") => void;
  selectedType: VehicleType | "all";
  setSelectedType: (t: VehicleType | "all") => void;
  selectedMake: string | null;
  setSelectedMake: (m: string | null) => void;
  selectedClass: string | null;
  setSelectedClass: (c: string | null) => void;
  selectedOwnership: VehicleOwnershipType | "all";
  setSelectedOwnership: (o: VehicleOwnershipType | "all") => void;
  locations: string[];
  makes: string[];
  makeCounts: Record<string, number>;
  locationCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  ownershipCounts: Record<string, number>;
  vehicleClasses: VehicleClass[];
  classCounts: Record<string, number>;
  total: number;
  filteredCount: number;
  onClearAll: () => void;
}) {
  const hasFilters =
    query ||
    selectedLocation ||
    selectedStatus !== "all" ||
    selectedType !== "all" ||
    selectedMake ||
    selectedClass ||
    selectedOwnership !== "all";
  const activeClasses = vehicleClasses
    .filter((c) => c.active)
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <aside className="w-full shrink-0 space-y-6 border-r border-border bg-surface p-5 lg:w-72 lg:min-w-[280px]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Filters
        </h3>
        {hasFilters && (
          <button
            onClick={onClearAll}
            className="text-xs font-medium text-primary hover:text-primary-press"
          >
            Clear
          </button>
        )}
      </div>

      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="pl-9"
        />
      </div>

      <FilterGroup label="Class">
        <Row
          active={!selectedClass}
          onClick={() => setSelectedClass(null)}
          label="All classes"
          count={total}
        />
        {activeClasses.map((c) => (
          <Row
            key={c.id}
            active={selectedClass === c.id}
            onClick={() =>
              setSelectedClass(selectedClass === c.id ? null : c.id)
            }
            label={c.name}
            count={classCounts[c.id] ?? 0}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Location" icon={<MapPin size={14} />}>
        <Row
          active={!selectedLocation}
          onClick={() => setSelectedLocation(null)}
          label="All locations"
          count={total}
        />
        {locations.map((loc) => (
          <Row
            key={loc}
            active={selectedLocation === loc}
            onClick={() =>
              setSelectedLocation(selectedLocation === loc ? null : loc)
            }
            label={loc}
            count={locationCounts[loc] ?? 0}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Status">
        {STATUSES.map((s) => {
          const count = s === "all" ? total : (statusCounts[s] ?? 0);
          return (
            <Row
              key={s}
              active={selectedStatus === s}
              onClick={() => setSelectedStatus(s)}
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

      <FilterGroup label="Ownership">
        <Row
          active={selectedOwnership === "all"}
          onClick={() => setSelectedOwnership("all")}
          label="All ownership"
          count={total}
        />
        {OWNERSHIP_OPTIONS.map((o) => (
          <Row
            key={o}
            active={selectedOwnership === o}
            onClick={() =>
              setSelectedOwnership(selectedOwnership === o ? "all" : o)
            }
            label={OWNERSHIP_TYPE_LABELS[o]}
            count={ownershipCounts[o] ?? 0}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Type">
        {VEHICLE_TYPES.map((t) => {
          const count = t === "all" ? total : (typeCounts[t] ?? 0);
          return (
            <Row
              key={t}
              active={selectedType === t}
              onClick={() => setSelectedType(t)}
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
            active={selectedMake === m}
            onClick={() => setSelectedMake(selectedMake === m ? null : m)}
            label={m}
            count={makeCounts[m] ?? 0}
          />
        ))}
      </FilterGroup>

      {(selectedClass ||
        selectedLocation ||
        selectedStatus !== "all" ||
        selectedType !== "all" ||
        selectedMake ||
        selectedOwnership !== "all") && (
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedClass && (
              <Chip
                label={
                  vehicleClasses.find((c) => c.id === selectedClass)?.name ??
                  "Class"
                }
                onRemove={() => setSelectedClass(null)}
              />
            )}
            {selectedLocation && (
              <Chip
                label={selectedLocation}
                onRemove={() => setSelectedLocation(null)}
              />
            )}
            {selectedStatus !== "all" && (
              <Chip
                label={vehicleStatusMeta[selectedStatus].label}
                onRemove={() => setSelectedStatus("all")}
              />
            )}
            {selectedOwnership !== "all" && (
              <Chip
                label={OWNERSHIP_TYPE_LABELS[selectedOwnership]}
                onRemove={() => setSelectedOwnership("all")}
              />
            )}
            {selectedType !== "all" && (
              <Chip
                label={
                  selectedType.charAt(0).toUpperCase() + selectedType.slice(1)
                }
                onRemove={() => setSelectedType("all")}
              />
            )}
            {selectedMake && (
              <Chip
                label={selectedMake}
                onRemove={() => setSelectedMake(null)}
              />
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {filteredCount} of {total} vehicles
          </p>
        </div>
      )}
    </aside>
  );
}

export { statusToneClasses };
