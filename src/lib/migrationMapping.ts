// Connect Pro Fleet — Build #19 cleanup: migration mapping helpers.
//
// Centralized mapping for imported external labels → canonical Fleet values.
// Used by the commit helpers (migrationCommit.ts) and the import UI. These are
// pure functions — no records are created here.

import type { VehicleStatus } from "./types";
import type { VehicleOwnershipType } from "./ownershipTypes";
import type { FleetStore } from "./store";

// ---------------------------------------------------------------------------
// Status mapping (external labels → canonical Fleet operational statuses)
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, VehicleStatus> = {
  available: "available",
  rented: "rented",
  rent: "rented",
  on_rent: "rented",
  out: "out_of_service",
  out_of_service: "out_of_service",
  "out of service": "out_of_service",
  maintenance: "maintenance",
  in_maintenance: "maintenance",
  in_service: "maintenance",
  servicing: "maintenance",
};

export function mapVehicleStatus(external: string | null): {
  status: VehicleStatus;
  resolved: boolean;
} {
  if (!external) return { status: "available", resolved: true };
  const key = external.toLowerCase().trim();
  if (STATUS_MAP[key]) return { status: STATUS_MAP[key], resolved: true };
  return { status: "available", resolved: false };
}

// ---------------------------------------------------------------------------
// Ownership mapping (external labels → VehicleOwnershipType)
// ---------------------------------------------------------------------------

const OWNERSHIP_MAP: Record<string, VehicleOwnershipType> = {
  company_owned: "company_owned",
  company: "company_owned",
  "company owned": "company_owned",
  external_owner: "external_owner",
  external: "external_owner",
  "external owner": "external_owner",
  investor: "external_owner",
  "investor owned": "external_owner",
  business_partner_owned: "business_partner_owned",
  partner: "business_partner_owned",
  "business partner": "business_partner_owned",
  "business partner owned": "business_partner_owned",
  jointly_owned: "jointly_owned",
  joint: "jointly_owned",
  "jointly owned": "jointly_owned",
  other: "other",
};

export function mapOwnershipType(external: string | null): {
  type: VehicleOwnershipType;
  resolved: boolean;
} {
  if (!external) return { type: "company_owned", resolved: true };
  const key = external.toLowerCase().trim();
  if (OWNERSHIP_MAP[key]) return { type: OWNERSHIP_MAP[key], resolved: true };
  return { type: "company_owned", resolved: false };
}

// ---------------------------------------------------------------------------
// Vehicle-class mapping (name → existing class id, or unresolved)
// ---------------------------------------------------------------------------

export interface ClassMappingResult {
  classId: string | null;
  resolved: boolean;
  className: string | null;
}

export function resolveVehicleClass(
  store: FleetStore,
  externalClassName: string | null,
): ClassMappingResult {
  if (!externalClassName)
    return { classId: null, resolved: true, className: null };
  const name = externalClassName.trim().toLowerCase();
  const match = store.vehicleClasses.find(
    (c) => c.active && c.name.trim().toLowerCase() === name,
  );
  if (match)
    return { classId: match.id, resolved: true, className: match.name };
  return {
    classId: null,
    resolved: false,
    className: externalClassName.trim(),
  };
}
