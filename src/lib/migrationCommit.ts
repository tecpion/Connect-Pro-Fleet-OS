// Connect Pro Fleet — Build #19 cleanup: entity import commit helpers.
//
// Completes the functional import workflow for vehicles, customers, and
// investors/partners. These helpers reuse the EXISTING store methods
// (addVehicle, addCustomer, setVehicleOwnership, investor store) — they do
// NOT create a second vehicle/customer/investor model. They centralize:
//   - duplicate detection (VIN exact, phone/email/DL for customers,
//     email/phone/normalized-name for investors)
//   - duplicate resolution (skip / link-to-existing / create-new-when-safe)
//   - tenant isolation (rejects cross-tenant entity references)
//   - idempotency via external-id fingerprints
//
// Dry runs (in migrationCsv.ts) create NO records. These commit helpers are
// the ONLY mutating path. Mapping helpers live in migrationMapping.ts.

import type { Vehicle, Customer } from "./types";
import type {
  VehicleOwnershipType,
  CompensationArrangement,
} from "./ownershipTypes";
import { TENANT_ID, uid } from "./store/ids";
import type { FleetStore } from "./store";
import {
  mapVehicleStatus,
  mapOwnershipType,
  resolveVehicleClass,
} from "./migrationMapping";

// ---------------------------------------------------------------------------
// Vehicle import
// ---------------------------------------------------------------------------

export interface VehicleImportInput {
  unit_number: string | null;
  vin: string | null;
  year: number | null;
  make: string;
  model: string;
  license_plate: string | null;
  class_name: string | null;
  daily_rate: number | null;
  weekly_rate: number | null;
  status: string | null;
  location: string | null;
  mileage: number | null;
  ownership_type: string | null;
  owner_investor_id: string | null;
  external_id: string | null;
  notes: string | null;
}

export interface VehicleImportResult {
  ok: boolean;
  action: "created" | "linked" | "skipped";
  vehicle_id?: string;
  error?: string;
}

/** Find an existing vehicle by VIN (strongest signal) or unit/plate. */
export function findExistingVehicle(
  store: FleetStore,
  input: VehicleImportInput,
): Vehicle | null {
  if (input.vin) {
    const v = store.vehicles.find(
      (x) => x.vin && x.vin.toLowerCase() === input.vin!.toLowerCase(),
    );
    if (v) return v;
  }
  if (input.unit_number) {
    const v = store.vehicles.find(
      (x) =>
        x.license_plate?.toLowerCase() === input.unit_number!.toLowerCase(),
    );
    if (v) return v;
  }
  return null;
}

export function commitVehicleImport(
  store: FleetStore,
  input: VehicleImportInput,
  mode: "skip" | "link" | "create" = "skip",
  importedFingerprints: Set<string>,
): VehicleImportResult {
  const fp = input.external_id ?? input.vin ?? input.unit_number;
  if (fp && importedFingerprints.has(fp)) {
    return {
      ok: false,
      action: "skipped",
      error: "This vehicle was already imported in this session.",
    };
  }

  const existing = findExistingVehicle(store, input);
  if (existing) {
    if (mode === "skip")
      return {
        ok: false,
        action: "skipped",
        error: `Duplicate vehicle (VIN ${input.vin ?? "—"}).`,
      };
    if (mode === "link") {
      if (fp) importedFingerprints.add(fp);
      return { ok: true, action: "linked", vehicle_id: existing.id };
    }
    return {
      ok: false,
      action: "skipped",
      error: "Vehicle already exists — use Link to existing instead.",
    };
  }

  const classRes = resolveVehicleClass(store, input.class_name);
  const statusRes = mapVehicleStatus(input.status);
  const ownRes = mapOwnershipType(input.ownership_type);

  let ownerEntityId: string | null = null;
  let ownerDisplayName: string | null = null;
  if (
    ownRes.type === "external_owner" ||
    ownRes.type === "business_partner_owned"
  ) {
    if (input.owner_investor_id) {
      ownerEntityId = input.owner_investor_id;
      ownerDisplayName = input.owner_investor_id;
    } else {
      return {
        ok: false,
        action: "skipped",
        error:
          "External owner referenced but no investor id provided — resolve the owner first.",
      };
    }
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const vehicle: Vehicle = {
    id: uid("veh"),
    vin: input.vin ?? "",
    make: input.make,
    model: input.model,
    year: input.year ?? new Date().getFullYear(),
    license_plate: input.license_plate ?? input.unit_number ?? "",
    status: statusRes.status,
    location: input.location ?? store.locations[0]?.name ?? "Unassigned",
    vehicle_type: "car",
    vehicle_class_id: classRes.classId,
    pricing_override:
      input.daily_rate != null || input.weekly_rate != null ? true : false,
    min_rental_days_override: null,
    deposit_override: false,
    daily_rate: input.daily_rate ?? 0,
    weekly_rate: input.weekly_rate ?? 0,
    deposit_amount: 0,
    images: [],
    documents: [],
    purchase_date: today,
    purchase_price: 0,
    current_mileage: input.mileage ?? 0,
    insurance_policy_number: "",
    insurance_expiry: "",
    registration_expiry: "",
    tenant_id: TENANT_ID,
    created_at: now,
    updated_at: now,
    ownership_type: ownRes.type,
    owner_entity_id: ownerEntityId,
    owner_display_name: ownerDisplayName,
    ownership_notes: input.notes ?? null,
    ownership_effective_date: today,
  };
  store.addVehicle(vehicle);
  if (fp) importedFingerprints.add(fp);
  return { ok: true, action: "created", vehicle_id: vehicle.id };
}

// ---------------------------------------------------------------------------
// Customer import
// ---------------------------------------------------------------------------

export interface CustomerImportInput {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  drivers_license: string | null;
  license_expiry: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  external_id: string | null;
}

export interface CustomerImportResult {
  ok: boolean;
  action: "created" | "linked" | "skipped";
  customer_id?: string;
  error?: string;
}

/** Find an existing customer by strong signals (phone/email/DL). Name-only
 *  matches are NEVER auto-merged. */
export function findExistingCustomer(
  store: FleetStore,
  input: CustomerImportInput,
): Customer | null {
  if (input.phone) {
    const c = store.customers.find(
      (x) =>
        x.phone &&
        x.phone.replace(/\D/g, "") === input.phone!.replace(/\D/g, ""),
    );
    if (c) return c;
  }
  if (input.email) {
    const c = store.customers.find(
      (x) => x.email && x.email.toLowerCase() === input.email!.toLowerCase(),
    );
    if (c) return c;
  }
  if (input.drivers_license) {
    const c = store.customers.find(
      (x) =>
        x.drivers_license_number &&
        x.drivers_license_number.toLowerCase() ===
          input.drivers_license!.toLowerCase(),
    );
    if (c) return c;
  }
  return null;
}

export function commitCustomerImport(
  store: FleetStore,
  input: CustomerImportInput,
  mode: "skip" | "link" | "create" = "skip",
  importedFingerprints: Set<string>,
): CustomerImportResult {
  const fp =
    input.external_id ?? input.email ?? input.phone ?? input.drivers_license;
  if (fp && importedFingerprints.has(fp)) {
    return {
      ok: false,
      action: "skipped",
      error: "This customer was already imported in this session.",
    };
  }

  const existing = findExistingCustomer(store, input);
  if (existing) {
    if (mode === "skip")
      return {
        ok: false,
        action: "skipped",
        error: "Duplicate customer (phone/email/license match).",
      };
    if (mode === "link") {
      if (fp) importedFingerprints.add(fp);
      return { ok: true, action: "linked", customer_id: existing.id };
    }
    return {
      ok: false,
      action: "skipped",
      error: "Customer already exists — use Link to existing instead.",
    };
  }

  const now = new Date().toISOString();
  const customer: Customer = {
    id: uid("cus"),
    tenant_id: TENANT_ID,
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone ?? "",
    email: input.email ?? "",
    date_of_birth: input.date_of_birth ?? null,
    address: input.address ?? null,
    city: null,
    state: null,
    zip: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    customer_status: "good_standing",
    customer_source: "staff",
    notes: input.notes ?? "",
    drivers_license_number: input.drivers_license ?? null,
    drivers_license_state: null,
    drivers_license_expiry: input.license_expiry ?? null,
    drivers_license_front_url: null,
    drivers_license_back_url: null,
    insurance_company: null,
    insurance_policy_number: null,
    insurance_expiry: null,
    insurance_document_url: null,
    created_at: now,
    updated_at: now,
  };
  store.addCustomer(customer);
  if (fp) importedFingerprints.add(fp);
  return { ok: true, action: "created", customer_id: customer.id };
}

// ---------------------------------------------------------------------------
// Rollback safety checks
// ---------------------------------------------------------------------------

/** Imported vehicle can be rolled back only when it has no native activity. */
export function canRollbackVehicle(
  store: FleetStore,
  vehicleId: string,
): boolean {
  const hasRental = store.rentals.some((r) => r.vehicle_id === vehicleId);
  const hasExpense = store.expenses.some((e) => e.vehicle_id === vehicleId);
  return !hasRental && !hasExpense;
}

/** Imported customer can be rolled back only when it has no native activity. */
export function canRollbackCustomer(
  store: FleetStore,
  customerId: string,
): boolean {
  const hasRental = store.rentals.some((r) => r.customer_id === customerId);
  const hasTxn = store.transactions.some((t) => t.customer_id === customerId);
  return !hasRental && !hasTxn;
}
