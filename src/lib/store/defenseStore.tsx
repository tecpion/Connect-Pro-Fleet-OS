// Connect Pro Fleet — canonical RentalDriver + Release Snapshot store.
//
// Standalone React context (mirrors the incidentsStore pattern) because the
// main fleet store module is at its size ceiling. Holds:
//  - rentalDrivers: the ONE canonical authorized-driver truth
//  - releaseSnapshots: immutable historical release evidence
//
// Existing `Driver[]` (primary, reservation-keyed) remains compatible and is
// mapped into the canonical model by the selectors. All NEW authorization
// logic resolves through `rentalDrivers` — a person is never authorized
// merely because their name appears in a field.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RentalDriver, RentalReleaseSnapshot } from "../defenseTypes";
import type { DriverVerificationStatus } from "../types";
import { TENANT_ID, uid as storeUid } from "./ids";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Seed data — canonical rental drivers mapped from existing primary Driver
// records + a few additional authorized drivers so the defense features are
// testable from demo data.
// ---------------------------------------------------------------------------

const seedRentalDrivers: RentalDriver[] = [
  // res_1 / rnt_1 — Hannah Ortiz (primary, verified)
  {
    id: "rdrv_1",
    tenant_id: TENANT_ID,
    rental_id: "rnt_1",
    reservation_id: "res_1",
    customer_id: "cus_1",
    role: "primary",
    full_name: "Hannah Ortiz",
    license_number: "H841-220-44-9821",
    license_state: "FL",
    license_expiry: "2028-04-12",
    verification_status: "verified",
    relationship: null,
    authorization_status: "active",
    authorized_at: "2026-08-24T09:15:00Z",
    authorized_by: "stf_1",
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    notes: null,
    created_at: "2026-08-24T09:15:00Z",
    updated_at: "2026-08-24T09:15:00Z",
  },
  // res_1 / rnt_1 — additional authorized driver (verified)
  {
    id: "rdrv_2",
    tenant_id: TENANT_ID,
    rental_id: "rnt_1",
    reservation_id: "res_1",
    customer_id: null,
    role: "additional",
    full_name: "Carlos Ortiz",
    license_number: "C552-110-33-7721",
    license_state: "FL",
    license_expiry: "2027-06-30",
    verification_status: "verified",
    relationship: "spouse",
    authorization_status: "active",
    authorized_at: "2026-08-24T09:20:00Z",
    authorized_by: "stf_1",
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    notes: null,
    created_at: "2026-08-24T09:20:00Z",
    updated_at: "2026-08-24T09:20:00Z",
  },
  // res_3 — Priya Nair (primary, pending verification)
  {
    id: "rdrv_3",
    tenant_id: TENANT_ID,
    rental_id: "rnt_4",
    reservation_id: "res_3",
    customer_id: "cus_3",
    role: "primary",
    full_name: "Priya Nair",
    license_number: "P112-998-33-2204",
    license_state: "FL",
    license_expiry: "2027-11-30",
    verification_status: "pending",
    relationship: null,
    authorization_status: "active",
    authorized_at: "2026-08-28T10:00:00Z",
    authorized_by: "stf_2",
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    notes: null,
    created_at: "2026-08-28T10:00:00Z",
    updated_at: "2026-08-28T10:00:00Z",
  },
  // res_8 / rnt_2 — Marcus Delgado (primary, verified) — long-term rental
  {
    id: "rdrv_4",
    tenant_id: TENANT_ID,
    rental_id: "rnt_2",
    reservation_id: "res_8",
    customer_id: "cus_8",
    role: "primary",
    full_name: "Marcus Delgado",
    license_number: "M330-445-88-1102",
    license_state: "FL",
    license_expiry: "2029-01-15",
    verification_status: "verified",
    relationship: null,
    authorization_status: "active",
    authorized_at: "2026-08-10T14:00:00Z",
    authorized_by: "stf_1",
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    notes: null,
    created_at: "2026-08-10T14:00:00Z",
    updated_at: "2026-08-10T14:00:00Z",
  },
  // res_8 / rnt_2 — additional driver LATER REVOKED (tests historical auth)
  {
    id: "rdrv_5",
    tenant_id: TENANT_ID,
    rental_id: "rnt_2",
    reservation_id: "res_8",
    customer_id: null,
    role: "additional",
    full_name: "Diego Marin",
    license_number: "D661-220-55-9933",
    license_state: "FL",
    license_expiry: "2028-03-20",
    verification_status: "verified",
    relationship: "friend",
    authorization_status: "revoked",
    authorized_at: "2026-08-10T14:05:00Z",
    authorized_by: "stf_1",
    revoked_at: "2026-08-20T09:00:00Z",
    revoked_by: "stf_2",
    revoked_reason: "Unauthorized use reported.",
    notes: "Revoked mid-rental after unauthorized use.",
    created_at: "2026-08-10T14:05:00Z",
    updated_at: "2026-08-20T09:00:00Z",
  },
  // res_6 / rnt_3 — Ethan Cole (primary, verified) — completed rental
  {
    id: "rdrv_6",
    tenant_id: TENANT_ID,
    rental_id: "rnt_3",
    reservation_id: "res_6",
    customer_id: "cus_7",
    role: "primary",
    full_name: "Ethan Cole",
    license_number: "E774-330-11-4455",
    license_state: "FL",
    license_expiry: "2028-09-10",
    verification_status: "verified",
    relationship: null,
    authorization_status: "active",
    authorized_at: "2026-07-15T08:30:00Z",
    authorized_by: "stf_1",
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    notes: null,
    created_at: "2026-07-15T08:30:00Z",
    updated_at: "2026-07-15T08:30:00Z",
  },
];

// A seed release snapshot for rnt_1 (Hannah Ortiz / veh_1) so the defense
// record + documentation package are testable from demo data. This is
// IMMUTABLE historical evidence — later state changes never alter it.
const seedReleaseSnapshots: RentalReleaseSnapshot[] = [
  {
    id: "rsnap_1",
    tenant_id: TENANT_ID,
    rental_id: "rnt_1",
    agreement_id: "rnt_1",
    agreement_number: "RA-2026-0001",
    agreement_signed: true,
    agreement_signature_ref: "sig_ra_1",
    primary_renter_id: "cus_1",
    primary_renter_name: "Hannah Ortiz",
    drivers: [
      {
        rental_driver_id: "rdrv_1",
        full_name: "Hannah Ortiz",
        role: "primary",
        verification_status: "verified",
        authorization_status: "active",
        license_expiry: "2028-04-12",
      },
      {
        rental_driver_id: "rdrv_2",
        full_name: "Carlos Ortiz",
        role: "additional",
        verification_status: "verified",
        authorization_status: "active",
        license_expiry: "2027-06-30",
      },
    ],
    vehicle_id: "veh_1",
    vehicle_label: "2024 Jeep Wrangler (FL-JEEP21)",
    vehicle_vin: "1C4BJXDG2RW123456",
    vehicle_plate: "FL-JEEP21",
    vehicle_unit_number: "UNIT-01",
    vehicle_status_at_release: "rented",
    released_at: "2026-08-24T09:15:00Z",
    releasing_staff_id: "stf_1",
    releasing_staff_name: "Ava Reyes",
    checkout_inspection_id: "ins_1",
    odometer_at_release: 28390,
    fuel_at_release: 95,
    existing_damage_refs: ["Minor scuff on rear bumper, pre-existing"],
    required_photos_status: "captured",
    maintenance_open_at_release: [],
    safety_critical_maintenance_open: false,
    compliance_at_release: {
      registration_status: "verified",
      registration_expiration: "2027-03-15",
      insurance_status: "verified",
      insurance_expiration: "2026-10-01",
      other_required_statuses: [],
    },
    gate_result: {
      blocked: false,
      hard_blocked: false,
      reasons: [],
      override_eligible: false,
    },
    warnings_present: [
      {
        key: "insurance_expiring_soon",
        label: "Insurance expiring soon",
        severity: "warning",
        detail: "Insurance expires 2026-10-01 (within 30 days).",
        source_ref: null,
      },
    ],
    blockers_present: [],
    override: null,
    entity_snapshot: {
      titled_owner_legal_name: "Connect Pro Fleet LLC",
      titled_owner_ref: null,
      operating_entity_legal_name: "Connect Pro Fleet LLC",
      operating_entity_ref: null,
      insurance_entity_legal_name: "GEICO Commercial",
      insurance_entity_ref: null,
      insurance_policy_reference: "POL-COM-2026-0042",
      acquisition_entity_legal_name: null,
      acquisition_entity_ref: null,
      effective_timestamp: "2026-08-24T09:15:00Z",
    },
    created_at: "2026-08-24T09:15:00Z",
  },
];

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface DefenseStore {
  rentalDrivers: RentalDriver[];
  releaseSnapshots: RentalReleaseSnapshot[];

  // --- Rental driver methods ---
  addRentalDriver: (d: RentalDriver) => void;
  updateRentalDriver: (id: string, patch: Partial<RentalDriver>) => void;
  revokeRentalDriver: (id: string, reason: string, revokedBy: string) => void;
  /** Canonical: active authorized drivers for a rental (primary + additional,
   *  not revoked). A person is NEVER authorized unless an active record
   *  exists. */
  activeDriversForRental: (rentalId: string) => RentalDriver[];
  /** All drivers for a rental (including revoked — for history). */
  allDriversForRental: (rentalId: string) => RentalDriver[];
  /** A specific driver's authorization status AS OF a given date/time. Used
   *  for incident historical authorization — later revocation does not alter
   *  the historical fact. */
  driverAuthorizationAsOf: (
    rentalDriverId: string,
    asOf: string,
  ) => "active" | "revoked" | "unknown";

  // --- Release snapshot methods ---
  addReleaseSnapshot: (s: RentalReleaseSnapshot) => void;
  /** The immutable release snapshot for a rental (null when no release
   *  occurred / not yet captured). */
  releaseSnapshotForRental: (rentalId: string) => RentalReleaseSnapshot | null;
}

const DefenseContext = createContext<DefenseStore | null>(null);

export function DefenseProvider({ children }: { children: ReactNode }) {
  const [driverState, setDrivers] = useState(seedRentalDrivers);
  const [snapshotState, setSnapshots] = useState(seedReleaseSnapshots);

  const store = useMemo<DefenseStore>(
    () => ({
      rentalDrivers: driverState,
      releaseSnapshots: snapshotState,

      addRentalDriver: (d) => setDrivers((ds) => [d, ...ds]),
      updateRentalDriver: (id, patch) =>
        setDrivers((ds) =>
          ds.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        ),
      revokeRentalDriver: (id, reason, revokedBy) =>
        setDrivers((ds) =>
          ds.map((x) =>
            x.id === id
              ? {
                  ...x,
                  authorization_status: "revoked",
                  revoked_at: new Date().toISOString(),
                  revoked_by: revokedBy,
                  revoked_reason: reason,
                  updated_at: new Date().toISOString(),
                }
              : x,
          ),
        ),
      activeDriversForRental: (rentalId) =>
        driverState.filter(
          (d) =>
            d.rental_id === rentalId && d.authorization_status === "active",
        ),
      allDriversForRental: (rentalId) =>
        driverState.filter((d) => d.rental_id === rentalId),
      driverAuthorizationAsOf: (rentalDriverId, asOf) => {
        const d = driverState.find((x) => x.id === rentalDriverId);
        if (!d) return "unknown";
        // Authorized at or before the as-of time?
        if (d.authorized_at > asOf) return "unknown"; // not yet authorized
        if (d.authorization_status === "active") return "active";
        // Revoked — was the revocation AFTER the as-of time?
        if (d.revoked_at && d.revoked_at > asOf) return "active"; // still authorized at incident time
        return "revoked";
      },

      addReleaseSnapshot: (s) => setSnapshots((ss) => [s, ...ss]),
      releaseSnapshotForRental: (rentalId) =>
        snapshotState.find((s) => s.rental_id === rentalId) ?? null,
    }),
    [driverState, snapshotState],
  );

  return (
    <DefenseContext.Provider value={store}>{children}</DefenseContext.Provider>
  );
}

export function useDefense() {
  const ctx = useContext(DefenseContext);
  if (!ctx) throw new Error("useDefense must be used within DefenseProvider");
  return ctx;
}

export { uid, TENANT_ID, storeUid };

// Re-export the verification status type for convenience.
export type { DriverVerificationStatus };
