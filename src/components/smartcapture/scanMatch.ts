// Smart Capture — vehicle matching helpers.
//
// Matches a plate or VIN string against existing fleet inventory. This is the
// honest "not yet connected" state: there is no OCR or AI vision. The user
// manually enters the plate/VIN after capturing/uploading, and we match it
// against the real vehicle list. No data is ever fabricated.

import type { Vehicle } from "@/lib/types";

export function normalizePlate(plate: string): string {
  return plate
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeVin(vin: string): string {
  return vin.trim().toUpperCase().replace(/\s/g, "");
}

export function maskVin(vin: string): string {
  if (vin.length <= 4) return vin;
  return "••••" + vin.slice(-4);
}

export function matchByPlate(vehicles: Vehicle[], plate: string): Vehicle[] {
  const norm = normalizePlate(plate);
  if (!norm) return [];
  return vehicles.filter((v) => normalizePlate(v.license_plate) === norm);
}

export function matchByVin(vehicles: Vehicle[], vin: string): Vehicle[] {
  const norm = normalizeVin(vin);
  if (!norm) return [];
  return vehicles.filter(
    (v) => normalizeVin(v.vin).includes(norm) || normalizeVin(v.vin) === norm,
  );
}

/** Generic search — tries plate first, then VIN, deduplicating results. */
export function searchVehicles(vehicles: Vehicle[], query: string): Vehicle[] {
  const plateMatches = matchByPlate(vehicles, query);
  const vinMatches = matchByVin(vehicles, query);
  const seen = new Set<string>();
  return [...plateMatches, ...vinMatches].filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}
