// Connect Pro Fleet — Vehicle Inventory derived-data hook.
//
// Centralizes all derivation for the Vehicles page: Fleet Health per vehicle
// (from compliance + work orders + violations), current active renter (active
// rental authority only), next maintenance indicator, facet counts, summary
// KPIs, filtering, and sorting. Pure presentation composition over existing
// authoritative stores — no domain logic changes.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useViolations } from "@/lib/violationStoreProvider";
import { deriveFleetHealth } from "@/lib/fleetHealth";
import { WORK_ORDER_ACTIVE_STATUSES } from "@/lib/maintenanceTypes";
import { vehicleStatusMeta, fmtDateShort } from "@/lib/format";
import type { Vehicle, VehicleStatus } from "@/lib/types";
import type { VehicleFilterState, VehicleFacetCounts } from "./vehicleFilters";

const NOW = new Date();
const ACTIVE_RENTAL_STATUSES = ["active", "late", "overdue", "payment_due"];

export type SortKey =
  "vehicle" | "mileage" | "status" | "reg_expiry" | "purchase" | "updated";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "vehicle", label: "Vehicle" },
  { key: "mileage", label: "Mileage" },
  { key: "status", label: "Status" },
  { key: "reg_expiry", label: "Registration expiry" },
  { key: "purchase", label: "Purchase date" },
  { key: "updated", label: "Recently updated" },
];

export interface VehicleSummary {
  total: number;
  available: number;
  rented: number;
  maintenance: number;
  outOfService: number;
  needsAttention: number;
}

export interface NextMaintenance {
  label: string;
  overdue: boolean;
}

export function useVehicleInventory(
  filters: VehicleFilterState,
  sort: SortKey,
) {
  const { vehicles, vehicleClasses, customers, rentals, workOrders } =
    useStore();
  const comp = useCompliance();
  const violations = useViolations();

  // --- Fleet Health per vehicle -------------------------------------------
  const healthByVehicle = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deriveFleetHealth>>();
    for (const v of vehicles) {
      const label = `${v.year} ${v.make} ${v.model}`;
      const compResult = comp.entityComplianceStatus("vehicle", v.id, label);
      const vehWorkOrders = workOrders.filter((w) => w.vehicle_id === v.id);
      const vehViolations = violations.violationsForVehicle(v.id);
      map.set(
        v.id,
        deriveFleetHealth({
          vehicle: v,
          complianceIssues: compResult.issues,
          workOrders: vehWorkOrders,
          violations: vehViolations,
          now: NOW,
        }),
      );
    }
    return map;
  }, [vehicles, comp, workOrders, violations]);

  // --- Current active renter per vehicle ----------------------------------
  const currentRenterByVehicle = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const v of vehicles) {
      const active = rentals.find(
        (r) =>
          r.vehicle_id === v.id && ACTIVE_RENTAL_STATUSES.includes(r.status),
      );
      if (active) {
        const c = customers.find((x) => x.id === active.customer_id);
        map.set(v.id, c ? `${c.first_name} ${c.last_name}` : null);
      } else {
        map.set(v.id, null);
      }
    }
    return map;
  }, [vehicles, rentals, customers]);

  // --- Next maintenance per vehicle ---------------------------------------
  const nextMaintenanceByVehicle = useMemo(() => {
    const map = new Map<string, NextMaintenance | null>();
    for (const v of vehicles) {
      const wos = workOrders.filter(
        (w) =>
          w.vehicle_id === v.id &&
          WORK_ORDER_ACTIVE_STATUSES.includes(w.status),
      );
      if (wos.length === 0) {
        map.set(v.id, null);
        continue;
      }
      const overdue = wos.find((w) => {
        if (!w.expected_ready_at) return false;
        const t = new Date(w.expected_ready_at).getTime();
        return !isNaN(t) && t < NOW.getTime();
      });
      if (overdue) {
        map.set(v.id, { label: `Overdue — ${overdue.title}`, overdue: true });
        continue;
      }
      const scheduled = wos
        .filter((w) => w.scheduled_start_at)
        .map((w) => ({
          w,
          t: new Date(w.scheduled_start_at!).getTime(),
        }))
        .filter((x) => !isNaN(x.t))
        .sort((a, b) => a.t - b.t);
      if (scheduled.length > 0) {
        map.set(v.id, {
          label: `Due ${fmtDateShort(scheduled[0].w.scheduled_start_at!)}`,
          overdue: false,
        });
      } else {
        map.set(v.id, { label: wos[0].title, overdue: false });
      }
    }
    return map;
  }, [vehicles, workOrders]);

  // --- Facets --------------------------------------------------------------
  const counts = useMemo<VehicleFacetCounts>(() => {
    const byStatus: Record<string, number> = {};
    const byLocation: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byMake: Record<string, number> = {};
    const byClass: Record<string, number> = {};
    const byOwnership: Record<string, number> = {};
    for (const v of vehicles) {
      byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;
      byLocation[v.location] = (byLocation[v.location] ?? 0) + 1;
      byType[v.vehicle_type] = (byType[v.vehicle_type] ?? 0) + 1;
      byMake[v.make] = (byMake[v.make] ?? 0) + 1;
      if (v.vehicle_class_id)
        byClass[v.vehicle_class_id] = (byClass[v.vehicle_class_id] ?? 0) + 1;
      const o = (v.ownership_type ?? "company_owned") as string;
      byOwnership[o] = (byOwnership[o] ?? 0) + 1;
    }
    return {
      total: vehicles.length,
      byStatus,
      byLocation,
      byType,
      byMake,
      byClass,
      byOwnership,
    };
  }, [vehicles]);

  const locations = useMemo(
    () => Object.keys(counts.byLocation).sort(),
    [counts.byLocation],
  );
  const makes = useMemo(
    () =>
      Object.keys(counts.byMake).sort(
        (a, b) => (counts.byMake[b] ?? 0) - (counts.byMake[a] ?? 0),
      ),
    [counts.byMake],
  );

  // --- Summary KPIs --------------------------------------------------------
  const summary = useMemo<VehicleSummary>(() => {
    const total = vehicles.length;
    const available = vehicles.filter((v) => v.status === "available").length;
    const rented = vehicles.filter((v) => v.status === "rented").length;
    const maintenance = vehicles.filter(
      (v) => v.status === "maintenance",
    ).length;
    const outOfService = vehicles.filter(
      (v) => v.status === "out_of_service",
    ).length;
    const needsAttention = vehicles.filter((v) => {
      const h = healthByVehicle.get(v.id);
      return h && h.level !== "healthy";
    }).length;
    return {
      total,
      available,
      rented,
      maintenance,
      outOfService,
      needsAttention,
    };
  }, [vehicles, healthByVehicle]);

  // --- Filtering -----------------------------------------------------------
  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (filters.status !== "all" && v.status !== filters.status) return false;
      if (filters.location && v.location !== filters.location) return false;
      if (filters.type !== "all" && v.vehicle_type !== filters.type)
        return false;
      if (filters.make && v.make !== filters.make) return false;
      if (filters.vehicleClass && v.vehicle_class_id !== filters.vehicleClass)
        return false;
      const o = (v.ownership_type ?? "company_owned") as string;
      if (filters.ownership !== "all" && o !== filters.ownership) return false;
      if (filters.needsAttention) {
        const h = healthByVehicle.get(v.id);
        if (!h || h.level === "healthy") return false;
      }
      if (filters.query) {
        const q = filters.query.toLowerCase();
        const renter = currentRenterByVehicle.get(v.id);
        if (
          !v.make.toLowerCase().includes(q) &&
          !v.model.toLowerCase().includes(q) &&
          !v.license_plate.toLowerCase().includes(q) &&
          !v.vin.toLowerCase().includes(q) &&
          !v.location.toLowerCase().includes(q) &&
          !(renter && renter.toLowerCase().includes(q))
        )
          return false;
      }
      return true;
    });
  }, [vehicles, filters, healthByVehicle, currentRenterByVehicle]);

  // --- Sorting -------------------------------------------------------------
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sort) {
        case "vehicle":
          return `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`);
        case "mileage":
          return b.current_mileage - a.current_mileage;
        case "status":
          return a.status.localeCompare(b.status);
        case "reg_expiry":
          return (
            new Date(a.registration_expiry).getTime() -
            new Date(b.registration_expiry).getTime()
          );
        case "purchase":
          return (
            new Date(b.purchase_date).getTime() -
            new Date(a.purchase_date).getTime()
          );
        case "updated":
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sort]);

  // --- Active filter chips -------------------------------------------------
  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onRemove: () => void }[] = [];
    if (filters.status !== "all")
      chips.push({
        label: `Status: ${vehicleStatusMeta[filters.status as VehicleStatus].label}`,
        onRemove: () => {},
      });
    return chips;
  }, [filters]);

  return {
    vehicles,
    vehicleClasses,
    healthByVehicle,
    currentRenterByVehicle,
    nextMaintenanceByVehicle,
    counts,
    locations,
    makes,
    summary,
    filtered,
    sorted,
    activeFilterChips,
  };
}

/** Registration expiry presentation state (reuses compliance-style 30-day
 *  threshold; presentation only — no second expiration engine). */
export function registrationState(
  iso: string,
  now: Date = NOW,
): "valid" | "expiring" | "expired" {
  const DAY_MS = 86_400_000;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "valid";
  if (t < now.getTime()) return "expired";
  if (t - now.getTime() <= 30 * DAY_MS) return "expiring";
  return "valid";
}
