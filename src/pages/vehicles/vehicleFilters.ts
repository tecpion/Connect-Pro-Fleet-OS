// Connect Pro Fleet — Vehicle Inventory filter state (shared type).
//
// A single filter state object used by the Vehicles page, the filter drawer,
// and the active-filter-chips row. Keeping it in one place avoids duplicate
// variants and makes "Clear All" trivial.

import type { VehicleStatus, VehicleType, VehicleClass } from "@/lib/types";
import type { VehicleOwnershipType } from "@/lib/ownershipTypes";

export interface VehicleFilterState {
  query: string;
  status: VehicleStatus | "all";
  location: string | null;
  type: VehicleType | "all";
  make: string | null;
  vehicleClass: string | null;
  ownership: VehicleOwnershipType | "all";
  /** Fleet Health: Needs Attention (attention + critical vehicles only). */
  needsAttention: boolean;
}

export const emptyFilters: VehicleFilterState = {
  query: "",
  status: "all",
  location: null,
  type: "all",
  make: null,
  vehicleClass: null,
  ownership: "all",
  needsAttention: false,
};

/** Facet counts for the filter drawer (computed from the full vehicle set). */
export interface VehicleFacetCounts {
  total: number;
  byStatus: Record<string, number>;
  byLocation: Record<string, number>;
  byType: Record<string, number>;
  byMake: Record<string, number>;
  byClass: Record<string, number>;
  byOwnership: Record<string, number>;
}

export interface VehicleFilterDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: VehicleFilterState;
  setFilters: (patch: Partial<VehicleFilterState>) => void;
  locations: string[];
  makes: string[];
  vehicleClasses: VehicleClass[];
  counts: VehicleFacetCounts;
  onClearAll: () => void;
}
